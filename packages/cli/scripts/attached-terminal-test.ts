import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";

const temp = await fs.mkdtemp(path.join(os.tmpdir(), "remotearc-attached-"));
const children: ChildProcess[] = [];
const output = new Map<ChildProcess, string>();
const entry = path.join(temp, "standalone-agent.mjs");
const repository = fileURLToPath(new URL("../../../", import.meta.url));
const version = JSON.parse(
  await fs.readFile(path.join(repository, "packages/cli/package.json"), "utf8"),
).version;
const platform = { win32: "windows", darwin: "darwin", linux: "linux" }[
  process.platform as "win32" | "darwin" | "linux"
];
const arch = { x64: "amd64", arm64: "arm64" }[process.arch as "x64" | "arm64"];
const binary = path.join(
  repository,
  "work/go-device",
  `remotelink-v${version}-${platform}-${arch}${process.platform === "win32" ? ".exe" : ""}`,
);
// Launch outside the package tree to catch external runtime dependencies.
await fs.copyFile(path.join(repository, "packages/cli/dist/index.js"), entry);
const env = {
  ...process.env,
  HOME: temp,
  USERPROFILE: temp,
  REMOTEARC_HOME: temp,
  REMOTEARC_GO_BINARY: binary,
  NO_COLOR: "1",
};
assert.equal(
  spawnSync(
    process.execPath,
    ["-e", "console.log(require('node:os').homedir())"],
    { env, encoding: "utf8" },
  ).stdout.trim(),
  temp,
  "The test must use an isolated home before starting any CLI",
);
const server = http.createServer((_request, response) => {
  response.statusCode = 204;
  response.end();
});
const sockets = new WebSocketServer({ server });
let hellos = 0;
let toolDone = false;
sockets.on("connection", (socket) =>
  socket.on("message", (raw) => {
    const m = JSON.parse(raw.toString());
    if (m.type === "hello") {
      hellos++;
      socket.send(
        JSON.stringify({
          type: "call",
          id: "test-file-info",
          tool: "get_file_info",
          arguments: { path: path.join(temp, "fixture.txt") },
        }),
      );
    } else if (m.type === "result" && m.id === "test-file-info") {
      assert(!m.error, m.error);
      toolDone = true;
    }
  }),
);
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = (server.address() as { port: number }).port;
await fs.mkdir(path.join(temp, ".remotearc"));
await fs.writeFile(path.join(temp, "fixture.txt"), "test");
const config = {
  deviceId: "isolated-test",
  deviceToken: "test-token",
  deviceName: "Attached test",
  origin: "http://127.0.0.1:" + port,
  mode: "managed",
  backgroundEnabled: false,
};
const configPath = path.join(temp, ".remotearc", "config.json");
await fs.writeFile(configPath, JSON.stringify(config));
const start = (...args: string[]) => {
  const child = spawn(process.execPath, [entry, ...args], {
    env,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  children.push(child);
  output.set(child, "");
  child.stdout!.on("data", (data) =>
    output.set(child, output.get(child)! + data),
  );
  child.stderr!.on("data", (data) =>
    output.set(child, output.get(child)! + data),
  );
  return child;
};
const waitFor = async (test: () => boolean, description: string) => {
  const deadline = Date.now() + 10_000;
  while (!test() && Date.now() < deadline)
    await new Promise((r) => setTimeout(r, 100));
  assert(test(), description + "\n" + [...output.values()].join("\n"));
};
try {
  const retired = spawnSync(process.execPath, [entry, "--ts", "--version"], {
    env,
    encoding: "utf8",
  });
  assert.equal(retired.status, 1, "--ts must not fall back to Go");
  assert.match(retired.stderr, /TypeScript runtime was retired/);
  const owner = start();
  await waitFor(
    () => toolDone,
    "Normal CLI must stay attached and execute tools",
  );
  assert.equal(owner.exitCode, null);
  const viewer = start();
  await waitFor(
    () => output.get(viewer)!.includes("tool.done get_file_info"),
    "Second terminal must follow the executing Agent's operation journal",
  );
  assert.equal(
    hellos,
    1,
    "A log viewer must not open a second execution connection",
  );
  const safe = start("--safe");
  await waitFor(
    () => safe.exitCode !== null,
    "Changing a local cap while another Agent executes must fail explicitly",
  );
  assert.equal(safe.exitCode, 1);
  assert.equal(
    JSON.parse(await fs.readFile(configPath, "utf8")).mode,
    "managed",
    "Failed cap change must not rewrite saved permissions",
  );
  assert(output.get(safe)!.includes("already owns execution"));
  console.log(
    "PASS: npm entry refuses --ts, starts the Go Agent, stays attached, second terminal follows operation history, one execution connection, conflicting local permission profile fails safely",
  );
} finally {
  // --stop ends the executing Agent, not a Go viewer. SIGKILL on a launcher would
  // orphan that viewer holding these pipes, so "close" would never fire.
  spawnSync(binary, ["--stop"], { env, windowsHide: true, timeout: 20_000 });
  for (const child of children)
    if (child.exitCode === null && child.signalCode === null) {
      const closed = new Promise<boolean>((resolve) =>
        child.once("close", () => resolve(true)),
      );
      if (process.platform === "win32")
        spawnSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
          windowsHide: true,
        });
      else child.kill("SIGTERM"); // The launcher forwards this to its Go child.
      const timeout = new Promise<boolean>((resolve) =>
        setTimeout(() => resolve(false), 5_000).unref(),
      );
      if (await Promise.race([closed, timeout])) continue;
      child.kill("SIGKILL");
      child.stdout!.destroy();
      child.stderr!.destroy();
      child.unref();
    }
  for (const socket of sockets.clients) socket.terminate();
  await new Promise<void>((resolve) => sockets.close(() => resolve()));
  await new Promise<void>((resolve) => server.close(() => resolve()));
  assert.equal(path.dirname(temp), os.tmpdir());
  assert(path.basename(temp).startsWith("remotearc-attached-"));
  await fs.rm(temp, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}
