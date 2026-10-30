import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { createHash } from "node:crypto";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import WebSocket, { WebSocketServer } from "ws";

type Policy = Record<string, unknown>;

const repository = fileURLToPath(new URL("../../../", import.meta.url));
const version = JSON.parse(
  await fs.readFile(path.join(repository, "packages/cli/package.json"), "utf8"),
).version;
const platform = { win32: "windows", darwin: "darwin", linux: "linux" }[
  process.platform
];
const arch = { x64: "amd64", arm64: "arm64" }[process.arch];
const binary = path.join(
  repository,
  "work/go-device",
  `remotelink-v${version}-${platform}-${arch}${process.platform === "win32" ? ".exe" : ""}`,
);
const temp = await fs.realpath(
  await fs.mkdtemp(path.join(os.tmpdir(), "ra-go-compat-")),
);
const env = {
  ...process.env,
  REMOTEARC_HOME: temp,
  CODEX_HOME: path.join(temp, "codex-fixture"),
  CLAUDE_CONFIG_DIR: path.join(temp, "claude-fixture"),
  HOME: temp,
  USERPROFILE: temp,
  NO_COLOR: "1",
};
const children: ChildProcess[] = [];
const pending = new Map<
  string,
  { resolve: (v: any) => void; reject: (e: Error) => void }
>();
let socket: WebSocket | undefined;
let nextID = 0;
let hello: any;
const goBrowserRunnerTools = [
  "browser_runner_start", "browser_runner_snapshot", "browser_runner_act",
  "browser_runner_status", "browser_runner_confirm", "browser_runner_close", "browser_runner_wait",
];
let stderr = "";
const server = http.createServer((_req, res) => {
  res.writeHead(204);
  res.end();
});
const sockets = new WebSocketServer({ server });
sockets.on("connection", (s, req) => {
  assert.equal(req.headers.authorization, "Bearer fixture-token");
  socket = s;
  s.on("message", (raw) => {
    const m = JSON.parse(raw.toString());
    if (m.type === "hello") hello = m;
    else if (m.type === "result") {
      const receiver = pending.get(m.id);
      pending.delete(m.id);
      if (receiver)
        m.error
          ? receiver.reject(new Error(m.error))
          : receiver.resolve(m.result);
    }
  });
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin =
  "http://127.0.0.1:" + (server.address() as { port: number }).port;
const configPath = path.join(temp, ".remotearc/config.json");
await fs.mkdir(path.dirname(configPath), { recursive: true });
await fs.writeFile(
  configPath,
  JSON.stringify({
    deviceId: "compat-device",
    deviceToken: "fixture-token",
    deviceName: "fixture",
    origin,
    mode: "managed",
    backgroundEnabled: false,
  }),
);
const agent = spawn(binary, ["--foreground"], {
  env,
  windowsHide: true,
  stdio: ["ignore", "pipe", "pipe"],
});
children.push(agent);
agent.stderr!.on("data", (b) => (stderr += b.toString()));
const waitFor = async (
  predicate: () => boolean,
  description: string,
  timeout = 30000,
) => {
  const end = Date.now() + timeout;
  while (!predicate()) {
    if (Date.now() > end)
      throw new Error(description + " timed out: " + stderr);
    await new Promise((r) => setTimeout(r, 50));
  }
};
async function go(
  name: string,
  args: Record<string, unknown> = {},
  policy?: Policy,
): Promise<any> {
  const id = "compat-" + ++nextID;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(name + " timed out"));
    }, 15000);
    pending.set(id, {
      resolve: (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      reject: (e) => {
        clearTimeout(timer);
        reject(e);
      },
    });
    socket!.send(
      JSON.stringify({ type: "call", id, tool: name, arguments: args, policy }),
    );
  });
}
function decode(result: any): any {
  const text = result.content?.[0]?.text;
  assert.equal(typeof text, "string");
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
async function run(
  command: string,
  args: string[],
  extraEnv: Record<string, string> = {},
) {
  const child = spawn(command, args, {
    env: { ...env, ...extraEnv },
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.push(child);
  let output = "";
  child.stdout!.on("data", (b) => (output += b.toString()));
  child.stderr!.on("data", (b) => (output += b.toString()));
  const timer = setTimeout(() => child.kill(), 20000);
  const code = await new Promise<number | null>((resolve, reject) => {
    child.once("error", reject);
    // Wait for inherited output handles to close as well as process exit.
    child.once("close", resolve);
  });
  clearTimeout(timer);
  return { code, output };
}
try {
  await waitFor(() => Boolean(hello), "Go connection");
  assert.equal(hello.device.id, "compat-device");
  const coreTools = JSON.parse(
    await fs.readFile(
      path.join(repository, "packages/execution-core/execution/tools.json"),
      "utf8",
    ),
  ).map((tool: { name: string }) => tool.name);
  assert.deepEqual(
    new Set(hello.tools.filter((tool: string) => tool !== "set_device_runtime" && !goBrowserRunnerTools.includes(tool))),
    new Set([
      ...coreTools,
      "background_agent_status",
      "set_background_agent",
      "set_task_keep_awake",
      "goal_workspace",
      "agent_execution_log",
      "list_agent_sessions",
    ]),
  );
  assert(hello.capabilities.includes("go_agent_v1"));
  assert(hello.capabilities.includes("device_pause_v1"));
  assert(hello.tools.includes("set_device_runtime"));
  // Advertised only where a Chromium-family browser is installed: all or none.
  const runnerAdvertised = goBrowserRunnerTools.filter((tool) => hello.tools.includes(tool));
  assert(runnerAdvertised.length === 0 || runnerAdvertised.length === goBrowserRunnerTools.length);
  assert.equal(hello.capabilities.includes("browser_runner_v1"), runnerAdvertised.length > 0);
  // Literal results pin the wire contract the Relay and AI clients rely on.
  const root = path.join(temp, "fixtures");
  const normalize = (value: any): any => {
    const flags = process.platform === "win32" ? "gi" : "g";
    const fixtures = new RegExp(RegExp.escape(root), flags),
      parent = new RegExp(RegExp.escape(temp), flags);
    const visit = (v: any): any =>
      typeof v === "string"
        ? v
            .replace(fixtures, "ROOT")
            .replace(parent, "TEMP")
            .replace(/^(ROOT|TEMP).*/, (p) => p.replaceAll("\\", "/"))
        : Array.isArray(v)
          ? v.map(visit)
          : v && typeof v === "object"
            ? Object.fromEntries(
                Object.entries(v).map(([k, item]) => [k, visit(item)]),
              )
            : v;
    return visit(value);
  };
  await fs.mkdir(path.join(root, "child"), { recursive: true });
  await fs.writeFile(path.join(root, "fixture.txt"), "alpha\r\nbeta\r\ngamma");
  await fs.writeFile(path.join(root, ".env"), "private");
  const expectTool = async (
    name: string,
    args: Record<string, unknown>,
    expected: unknown,
    policy?: Policy,
  ) => {
    assert.deepEqual(normalize(decode(await go(name, args, policy))), expected, name);
  };
  await expectTool(
    "list_directory",
    { path: root },
    "Directory: ROOT\nDepth: 2\n\n[DIR] child\n[FILE] fixture.txt\n\n[Remote Arc omitted 1 protected or out-of-scope entry.]",
  );
  await expectTool("browse_directories", { path: root }, {
    directories: [{ name: "child", path: "ROOT/child", type: "directory" }],
    parent: "TEMP",
    path: "ROOT",
    protected_entries_omitted: 0,
    truncated: false,
  });
  await expectTool(
    "read_file",
    { path: path.join(root, "fixture.txt"), offset: -2, length: 1 },
    "[Reading 1 lines from lines 2-2 (total: 3 lines, 18 B)]\n\nbeta",
  );
  const shared = path.join(root, "binary.dat");
  await fs.writeFile(shared, Buffer.from([0, 1, 2, 3, 4, 255]));
  const { file_revision: chunkRevision, ...chunk } = normalize(
    decode(await go("read_binary_file", { path: shared, offset: 1, length: 3 })),
  );
  assert.match(chunkRevision, /^[a-f0-9]{64}$/);
  assert.deepEqual(chunk, {
    bytes_read: 3,
    chunk_sha256: "039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81",
    data: "AQID",
    encoding: "base64",
    eof: false,
    mime_type: "application/octet-stream",
    offset: 1,
    path: "ROOT/binary.dat",
    size: 6,
  });
  await fs.utimes(
    shared,
    new Date("2026-01-01T00:00:00.100Z"),
    new Date("2026-01-01T00:00:00.200Z"),
  );
  const info = decode(await go("get_file_info", { path: shared }));
  assert.equal(info.path.toLowerCase(), shared.toLowerCase());
  assert.equal(info.type, "file");
  assert.equal(info.size, 6);
  assert.equal(info.size_human, "6 B");
  assert.equal(typeof info.mode, "number");
  assert.equal(info.modified_at, "2026-01-01T00:00:00.200Z");
  assert.equal(info.accessed_at, "2026-01-01T00:00:00.100Z");
  assert(!Number.isNaN(Date.parse(info.created_at)));
  const revision = decode(
    await go("read_binary_file", { path: shared }),
  ).file_revision;
  await fs.appendFile(shared, Buffer.from([5]));
  await assert.rejects(
    () => go("read_binary_file", { path: shared, expected_revision: revision }),
    /FILE_CHANGED_DURING_READ/,
  );
  const mutate = path.join(root, "mutate.txt");
  const undoReceipt = {
    path: "ROOT/mutate.txt",
    undo_available: true,
    undo_storage: "local-device-only",
  };
  await expectTool(
    "write_file",
    { path: mutate, content: "old old\n", mode: "rewrite" },
    { ...undoReceipt, atomic: true, bytes: 8, file_size: 8, mode: "rewrite" },
  );
  await expectTool(
    "write_file",
    { path: mutate, content: "old old\n", mode: "append" },
    { ...undoReceipt, atomic: false, bytes: 8, file_size: 16, mode: "append" },
  );
  await expectTool(
    "edit_block",
    { file_path: mutate, old_string: "old", new_string: "new", expected_replacements: 4 },
    { ...undoReceipt, atomic: true, bytes_after: 16, bytes_before: 16, replacements: 4 },
  );
  // Devices keep Undo records written by earlier releases, including the
  // TypeScript runtime. This is that runtime's exact on-disk record.
  const cross = path.join(temp, "cross-undo.txt");
  await fs.writeFile(cross, "older edit");
  const olderRecord = path.join(temp, ".remotearc/undo/1793339035453-5a3821ef");
  await fs.mkdir(olderRecord, { recursive: true });
  await fs.writeFile(path.join(olderRecord, "content.bin"), "original");
  await fs.writeFile(
    path.join(olderRecord, "manifest.json"),
    JSON.stringify({
      id: "1793339035453-5a3821ef",
      createdAt: "2026-10-30T05:43:55.453Z",
      tool: "write_file",
      targetPath: process.platform === "win32" ? cross.toLowerCase() : cross,
      existed: true,
      mode: (await fs.stat(cross)).mode,
      bytes: 8,
      postChangeHash: createHash("sha256").update("older edit").digest("hex"),
    }),
  );
  let actions = decode(await go("list_undo_actions", { limit: 100 }));
  let receipt = actions.find(
    (r: any) => r.path.toLowerCase() === cross.toLowerCase(),
  );
  assert(receipt?.can_undo, "Undo records from earlier releases stay restorable");
  await go("undo_change", { action_id: receipt.id });
  assert.equal(await fs.readFile(cross, "utf8"), "original");
  await go("write_file", { path: cross, content: "Go edit" });
  actions = decode(await go("list_undo_actions", { limit: 100 }));
  receipt = actions.find(
    (r: any) => r.path.toLowerCase() === cross.toLowerCase(),
  );
  assert(receipt?.can_undo);
  await go("undo_change", { action_id: receipt.id });
  assert.equal(await fs.readFile(cross, "utf8"), "original");
  await expectTool(
    "write_file",
    { path: path.join(root, "no-undo"), content: "ok" },
    {
      atomic: true,
      bytes: 2,
      file_size: 2,
      mode: "rewrite",
      path: "ROOT/no-undo",
      undo_available: false,
      undo_storage: null,
    },
    { undoEnabled: false },
  );
  await assert.rejects(
    () => go("read_file", { path: path.join(root, ".env") }),
    /Sensitive/,
  );
  await assert.rejects(
    () =>
      go(
        "write_file",
        { path: cross, content: "escape" },
        { workspaceRoots: [root] },
      ),
    /Trusted Write/,
  );
  await assert.rejects(
    () => go("read_file", { path: cross }, { taskWorkspaceRoot: root }),
    /Task Workspace/,
  );
  await assert.rejects(
    () => go("start_process", { command: "rm -rf /" }),
    /Safety Guard/,
  );
  await assert.rejects(
    () => go("start_process", { command: "shutdown /s /t 0" }),
    /^Error: Blocked by Remote Arc Safety Guard: system shutdown or reboot\. Run this action manually on the device if you intentionally need it\.$/,
  );
  await assert.rejects(
    () =>
      go("start_process", {
        command: "echo no",
        background: true,
        max_duration_seconds: 1.5,
      }),
    /Invalid managed/,
  );
  const echoed = decode(await go("start_process", { command: "echo compatible" }));
  assert.equal(echoed.command, "echo compatible");
  assert.equal(echoed.exit_code, 0);
  assert.equal(echoed.signal, null);
  assert.equal(echoed.stdout.trim(), "compatible");
  assert.equal(echoed.stderr, "");
  assert.equal(echoed.timed_out, false);
  const waitingProcess = decode(await go("start_process", {
    command: `"${process.execPath}" -e "setTimeout(()=>console.log('native-wait-ready'),350);setTimeout(()=>process.exit(0),1200)"`,
    background: true,
  }));
  const outputReady = decode(await go("process_status", {
    process_id: waitingProcess.process_id, wait_ms: 60000, until_text: "native-wait-ready",
  }));
  assert.equal(outputReady.wait_reason, "text");
  const waitedOutput = decode(await go("process_output", {process_id: waitingProcess.process_id}));
  assert.match(waitedOutput.stdout, /native-wait-ready/);
  assert.match(outputReady.note, /40000/, "large device-side waits report their cap");
  const processExited = decode(await go("process_status", {
    process_id: waitingProcess.process_id, wait_ms: 4000,
  }));
  assert.equal(processExited.wait_reason, "exited");
  assert.equal(processExited.exit_code, 0);
  await assert.rejects(() => go("process_status", {process_id: waitingProcess.process_id, wait_ms: -1}));
  const bg = decode(
    await go("start_process", {
      command: `"${process.execPath}" -e "setTimeout(()=>{},15000)"`,
      background: true,
      max_duration_seconds: 10,
    }),
  );
  assert.equal(
    decode(await go("process_status", { process_id: bg.process_id })).status,
    "running",
  );
  assert(
    decode(await go("list_managed_processes")).some(
      (p: any) => p.process_id === bg.process_id,
    ),
  );
  assert.equal(
    decode(await go("stop_process", { process_id: bg.process_id })).stopped,
    true,
  );
  assert.equal(
    decode(await go("process_output", { process_id: bg.process_id })).status,
    "exited",
  );
  const expired = decode(
    await go("start_process", {
      command: `"${process.execPath}" -e "setTimeout(()=>{},30000)"`,
      cwd: temp,
      background: true,
      max_duration_seconds: 1,
    }),
  );
  await new Promise((resolve) => setTimeout(resolve, 1800));
  const deadline = decode(await go("process_status", { process_id: expired.process_id }));
  assert.equal(deadline.status, "exited");
  assert.notEqual(deadline.exit_code, 0);
  const cliEntry = path.join(repository, "packages/cli/dist/index.js");
  let selection = await run(process.execPath, [cliEntry, "--version"], {
    REMOTEARC_GO_BINARY: binary,
  });
  assert.equal(selection.code, 0);
  assert.equal(selection.output.trim(), version);
  selection = await run(process.execPath, [cliEntry, "--status"], {
    REMOTEARC_GO_BINARY: binary,
  });
  assert.equal(selection.code, 0, selection.output);
  assert.equal(JSON.parse(selection.output).agent.engine, "go", "the default CLI must inspect the Go owner");
  selection = await run(process.execPath, [cliEntry, "--go", "--version"], {
    REMOTEARC_GO_BINARY: "",
  });
  assert.equal(selection.code, 0, selection.output);
  const asset = path.basename(binary),
    bundled = path.join(repository, "packages/cli/dist/bin", asset),
    hidden = bundled + ".fixture-hidden";
  const cache = path.join(temp, ".remotearc/agent/downloads", version, asset);
  await fs.mkdir(path.dirname(cache), { recursive: true });
  await fs.copyFile(binary, cache);
  await fs.chmod(cache, 0o700);
  await fs.rename(bundled, hidden);
  try {
    selection = await run(process.execPath, [cliEntry, "--go", "--version"], {
      REMOTEARC_GO_BINARY: "",
    });
    assert.equal(
      selection.code,
      0,
      "verified cache should launch: " + selection.output,
    );
    const preload = path.join(temp, "download-fixture.mjs");
    await fs.writeFile(
      preload,
      `import fs from 'node:fs';const original=globalThis.fetch;globalThis.fetch=async(input,options)=>String(input).startsWith('https://github.com/yaohuangguan/remote-arc/releases/download/remotelink-v')?new Response(process.env.RA_CORRUPT_DOWNLOAD==='1'?Buffer.from('invalid-binary'):fs.readFileSync(process.env.RA_DOWNLOAD_SOURCE),{status:200}):original(input,options);`,
    );
    const downloadEnv = {
      REMOTEARC_GO_BINARY: "",
      NODE_OPTIONS: "--import=" + pathToFileURL(preload).href,
      RA_DOWNLOAD_SOURCE: binary,
    };
    // Replace the completed launch's executable instead of truncating its
    // inode, which can still be mapped briefly on Linux (ETXTBSY).
    const corruptCache = cache + ".fixture-corrupt";
    await fs.writeFile(corruptCache, "corrupt-cache", { mode: 0o700, flag: "wx" });
    await fs.rename(corruptCache, cache);
    selection = await run(process.execPath, [cliEntry, "--go", "--version"], {
      ...downloadEnv,
      RA_CORRUPT_DOWNLOAD: "1",
    });
    assert.equal(selection.code, 1);
    assert.match(selection.output, /checksum/);
    selection = await run(
      process.execPath,
      [cliEntry, "--go", "--version"],
      downloadEnv,
    );
    assert.equal(
      selection.code,
      0,
      "verified download should atomically replace corrupt cache: " +
        selection.output,
    );
    assert.equal(selection.output.trim(), version);
  } finally {
    await fs.rename(hidden, bundled);
  }
  // --ts must fail through both entry points, never fall back to Go.
  for (const [command, args] of [
    [process.execPath, [cliEntry, "--ts", "--foreground"]],
    [process.execPath, [cliEntry, "--go", "--ts"]],
    [binary, ["--ts", "--version"]],
  ] as [string, string[]][]) {
    selection = await run(command, args, { REMOTEARC_GO_BINARY: binary });
    assert.equal(selection.code, 1, selection.output);
    assert.match(selection.output, /TypeScript runtime was retired/);
  }
  const executionLog = await go("agent_execution_log", { limit: 100 });
  assert.equal(executionLog.source, "local-device");
  assert(executionLog.lines.some((line: string) => line.includes("tool.done")));
  assert(!JSON.stringify(executionLog).includes("fixture-token"));
  assert.equal((await go("background_agent_status")).desired_enabled, false);
  assert.equal(
    (await go("set_task_keep_awake", { task_id: "fixture", seconds: 0 }))
      .active,
    false,
  );
  const repo = path.join(temp, "owned-repo");
  await fs.mkdir(repo);
  const git = (args: string[]) => {
    const r = spawnSync(
      "git",
      [
        "-c",
        "core.hooksPath=",
        "-c",
        "commit.gpgSign=false",
        "-C",
        repo,
        ...args,
      ],
      {
        env: {
          ...env,
          GIT_AUTHOR_NAME: "Fixture",
          GIT_AUTHOR_EMAIL: "fixture@example.test",
          GIT_COMMITTER_NAME: "Fixture",
          GIT_COMMITTER_EMAIL: "fixture@example.test",
        },
        encoding: "utf8",
        windowsHide: true,
      },
    );
    assert.equal(r.status, 0, r.stderr);
    return r.stdout.trim();
  };
  git(["init"]);
  await fs.writeFile(path.join(repo, "baseline.txt"), "baseline");
  git(["add", "."]);
  git(["commit", "-m", "baseline"]);
  const originalHead = git(["rev-parse", "HEAD"]);
  const sessionWorktree = path.join(temp, "session-feature");
  git(["worktree", "add", "-b", "session-feature", sessionWorktree]);
  await fs.writeFile(path.join(sessionWorktree, "uncommitted.txt"), "synthetic change");
  const codexSessions = path.join(env.CODEX_HOME, "sessions", "2026", "10", "24");
  const claudeSessions = path.join(env.CLAUDE_CONFIG_DIR, "projects", "fixture-project");
  await fs.mkdir(codexSessions, { recursive: true });
  await fs.mkdir(claudeSessions, { recursive: true });
  await fs.writeFile(path.join(codexSessions, "rollout-fixture.jsonl"),
    JSON.stringify({type:"session_meta",payload:{id:"codex-fixture-task",cwd:sessionWorktree}})+"\n"+
    JSON.stringify({type:"response_item",payload:{role:"user",content:"PRIVATE_PROMPT_TEXT"}})+"\n");
  await fs.writeFile(path.join(claudeSessions, "claude-fixture.jsonl"),
    JSON.stringify({sessionId:"claude-fixture-task",cwd:repo,message:{content:"PRIVATE_PROMPT_TEXT"}})+"\n");
  await fs.writeFile(path.join(env.CODEX_HOME, "auth.json"), JSON.stringify({token:"PRIVATE_FIXTURE_TOKEN"}));
  const sessions = await go("list_agent_sessions", {source:"all",limit:10,git:true});
  const sessionRows = new Map(sessions.sessions.map((row:any) => [row.id,row]));
  assert.equal(sessionRows.size, 2, "native WebSocket route finds both synthetic client sources on Windows too");
  const codexTask:any = sessionRows.get("codex-fixture-task");
  assert.equal(path.normalize(codexTask.working_directory).toLowerCase(), path.normalize(sessionWorktree).toLowerCase());
  assert.equal(codexTask.recent_activity, true);
  const sessionGit = sessions.workspaces.find((row:any) => row.branch === "session-feature");
  assert(sessionGit?.is_linked_worktree, "session discovery resolves the actual linked Git worktree");
  assert.equal(sessionGit.changed_files, 1);
  assert(!/PRIVATE_PROMPT_TEXT|PRIVATE_FIXTURE_TOKEN|auth\.json/.test(JSON.stringify(sessions)), "session metadata must not leak conversation or credentials");
  const filtered = await go("list_agent_sessions", {source:"codex",workspace:sessionWorktree,git:false});
  assert.equal(filtered.sessions.length, 1);
  assert.equal(filtered.workspaces.length, 0);
  await assert.rejects(() => go("list_agent_sessions", {source:"cursor"}), /source/);

  const workspacePolicy = { workspaceRoots: [repo] };
  const task = (action: string, extra = {}) =>
    go(
      "goal_workspace",
      { workspace: repo, task_id: "fixture-task", action, operation_id: action, ...extra },
      workspacePolicy,
    );
  const created = await task("create");
  const status = await task("status");
  assert.equal(status.frontier, created.frontier);
  assert.equal(status.path.toLowerCase(), created.path.toLowerCase());
  await fs.writeFile(path.join(created.path, "baseline.txt"), "accepted checkpoint");
  const fingerprint = await task("fingerprint");
  const accepted = await task("capture", {
    expected_frontier: created.frontier,
    expected_tree: fingerprint.tree,
  });
  assert.notEqual(accepted.frontier, originalHead);
  assert.equal(git(["rev-parse", "HEAD"]), originalHead);
  assert.equal(await fs.readFile(path.join(repo, "baseline.txt"), "utf8"), "baseline");
  // A junction or symlink inside the candidate must not escape its task root.
  await fs.mkdir(path.join(repo, "user-folder"));
  await fs.symlink(
    path.join(repo, "user-folder"),
    path.join(created.path, "escape"),
    process.platform === "win32" ? "junction" : "dir",
  );
  await assert.rejects(
    () =>
      go(
        "write_file",
        { path: path.join(created.path, "escape", "must-not-write.txt"), content: "blocked" },
        { ...workspacePolicy, taskWorkspaceRoot: created.path },
      ),
    /Task Workspace/,
  );
  const stopped = await run(binary, ["--stop"]);
  assert.equal(stopped.code, 0, stopped.output);
  await waitFor(() => agent.exitCode !== null, "graceful Go stop");
  // An older TypeScript agent can still hold the shared mkdir/mtime lease.
  const olderLease = path.join(temp, ".remotearc/agent/execution.lock");
  await fs.mkdir(olderLease);
  try {
    selection = await run(binary, ["--foreground"]);
    assert.equal(selection.code, 1);
    assert.match(selection.output, /retired TypeScript agent owns execution/);
  } finally {
    await fs.rmdir(olderLease);
  }
  assert.equal(
    JSON.parse(await fs.readFile(configPath, "utf8")).deviceId,
    "compat-device",
  );
  console.log(
    "Go agent OK: tools, files, binary revision, metadata, Undo including older records, policy, processes, native process waits, coding-session/worktree discovery without private text, logs, runtime selection, retired --ts and shared execution lease.",
  );
} catch (error) {
  // Report the failure itself if cleanup below also fails.
  console.error(error);
  throw error;
} finally {
  for (const child of children) if (child.exitCode === null) child.kill();
  for (const s of sockets.clients) s.terminate();
  await new Promise<void>((resolve) => sockets.close(() => resolve()));
  await new Promise<void>((resolve) => server.close(() => resolve()));
  // All fixtures are under an mkdtemp directory owned by this test.
  await fs.rm(temp, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}
