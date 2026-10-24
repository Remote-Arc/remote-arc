import { execFile, spawn, type ChildProcess } from "node:child_process";
import crypto from "node:crypto";
import process from "node:process";

const MAX_CAPTURE_BYTES = 2 * 1024 * 1024;

function appendCapped(current: string, chunk: Buffer | string) {
  if (Buffer.byteLength(current) >= MAX_CAPTURE_BYTES) return current;
  const next = current + chunk.toString();
  if (Buffer.byteLength(next) <= MAX_CAPTURE_BYTES) return next;
  return next.slice(0, MAX_CAPTURE_BYTES) + "\n… output truncated …";
}

// Obvious credentials some tools pass on their command line. Kept identical
// to the Go core's redaction so both runtimes return the same listing.
const SECRET_ARGUMENT =
  /((?:--?|\/)(?:token|password|passwd|secret|api[-_]?key|access[-_]?key|auth[-_]?token|client[-_]secret)[=: ]+|\b(?:token|password|passwd|secret|api[-_]?key|access[-_]?key|client[-_]secret)=)("(?:\\.|[^"\\])*"|'[^']*'|\S+)|(bearer\s+)\S+/gi;

export function redactCommandLine(line: string) {
  return line.replace(SECRET_ARGUMENT, (_match, flag?: string, _value?: string, bearer?: string) =>
    bearer ? `${bearer}[redacted]` : `${flag}[redacted]`,
  );
}

// Decode before redacting: CSV quoting can conceal quoted credentials from
// the command-line matcher. JSON preserves one row even for multiline commands.
export function windowsProcessDetails(output: string) {
  const parsed: unknown = output.trim() ? JSON.parse(output) : [];
  const rows = parsed === null ? [] : Array.isArray(parsed) ? parsed : [parsed];
  const clean = (value: unknown) => String(value ?? "").replace(/[\r\n\t]/g, " ");
  return ["PID\tPPID\tName\tMemoryMB\tCommandLine", ...rows.map((raw) => {
    if (!raw || typeof raw !== "object") throw new Error("Invalid process details response");
    const row = raw as Record<string, unknown>;
    return [row.ProcessId, row.ParentProcessId, row.Name, row.MemoryMB, redactCommandLine(String(row.CommandLine ?? ""))].map(clean).join("\t");
  })].join("\n");
}

export async function listProcesses(
  options: { filter?: string; limit?: number; details?: boolean } = {},
) {
  const limit =
    Number.isSafeInteger(options.limit) && options.limit! >= 1 && options.limit! <= 1000
      ? options.limit!
      : 200;
  const windows = process.platform === "win32";
  let header = "";
  const [command, args] = windows
    ? options.details
      ? [
          "powershell.exe",
          [
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            "[Console]::OutputEncoding=[Text.Encoding]::UTF8; Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,@{n='MemoryMB';e={[math]::Round($_.WorkingSetSize/1MB)}},CommandLine | ConvertTo-Json -Compress",
          ],
        ]
      : ["tasklist.exe", ["/FO", "CSV", "/NH"]]
    : ["ps", ["-axo", "pid,ppid,user,%cpu,%mem,etime,command"]];
  if (windows && !options.details) {
    header = '"Image Name","PID","Session Name","Session#","Mem Usage"';
  }
  const output = await new Promise<string>((resolve, reject) => {
    execFile(
      command as string,
      args as string[],
      { maxBuffer: MAX_CAPTURE_BYTES, windowsHide: true, timeout: 15000 },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`Could not list processes: ${stderr || error.message}`));
          return;
        }
        resolve(stdout.trim());
      },
    );
  });
  let lines = (windows && options.details ? windowsProcessDetails(output) : output).replace(/\r\n/g, "\n").split("\n");
  if (!header && lines.length) {
    header = lines[0] ?? "";
    lines = lines.slice(1);
  }
  const needle = (options.filter || "").trim().toLowerCase();
  const matched = lines.filter(
    (line) => line.trim() && (!needle || line.toLowerCase().includes(needle)),
  );
  const kept = matched.slice(0, limit).map(redactCommandLine);
  let summary = `[${kept.length} of ${matched.length} processes`;
  if (needle) summary += ` matching ${JSON.stringify(options.filter)}`;
  if (matched.length > kept.length) summary += "; raise limit or narrow filter for the rest";
  summary += "]";
  const platform = windows ? "win32" : process.platform;
  return `Processes on ${platform}:\n\n${redactCommandLine(header)}\n${kept.join("\n")}\n\n${summary}`;
}

async function terminateTree(child: ReturnType<typeof spawn>) {
  if (!child.pid) return;
  if (process.platform === "win32") {
    await new Promise<void>((resolve) => {
      const killer = spawn(
        "taskkill.exe",
        ["/PID", String(child.pid), "/T", "/F"],
        { windowsHide: true, stdio: "ignore" },
      );
      killer.once("close", () => resolve());
      killer.once("error", () => resolve());
    });
    return;
  }

  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    child.kill("SIGTERM");
  }
  await new Promise((resolve) => setTimeout(resolve, 300));
  try {
    process.kill(-child.pid, "SIGKILL");
  } catch {
    if (!child.killed) child.kill("SIGKILL");
  }
}

export async function runShellCommand(
  command: string,
  timeoutMs = 5000,
  cwd?: string,
) {
  const timeout = Math.max(100, Math.min(120_000, Math.trunc(timeoutMs || 5000)));
  const startedAt = Date.now();

  return await new Promise<{
    command: string;
    cwd: string | null;
    exit_code: number | null;
    signal: NodeJS.Signals | null;
    stdout: string;
    stderr: string;
    duration_ms: number;
    timed_out: boolean;
  }>((resolve, reject) => {
    const child = spawn(command, {
      shell: true,
      cwd,
      windowsHide: true,
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;

    child.stdout?.on("data", (chunk) => {
      stdout = appendCapped(stdout, chunk);
    });
    child.stderr?.on("data", (chunk) => {
      stderr = appendCapped(stderr, chunk);
    });

    const timer = setTimeout(async () => {
      timedOut = true;
      await terminateTree(child);
    }, timeout);

    child.once("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });

    child.once("close", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        command,
        cwd: cwd || null,
        exit_code: code,
        signal,
        stdout,
        stderr,
        duration_ms: Date.now() - startedAt,
        timed_out: timedOut,
      });
    });
  });
}


type ManagedProcess = {
  id: string;
  child: ChildProcess;
  command: string;
  cwd: string | null;
  startedAt: number;
  endedAt: number | null;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
};

const managedProcesses = new Map<string, ManagedProcess>();
const MAX_MANAGED_PROCESSES = 32;
const FINISHED_PROCESS_RETENTION_MS = 30 * 60 * 1000;

function cleanupManagedProcesses() {
  const now = Date.now();
  for (const [id, item] of managedProcesses) {
    if (
      item.endedAt !== null &&
      now - item.endedAt > FINISHED_PROCESS_RETENTION_MS
    ) {
      managedProcesses.delete(id);
    }
  }

  if (managedProcesses.size <= MAX_MANAGED_PROCESSES) return;
  const finished = [...managedProcesses.values()]
    .filter((item) => item.endedAt !== null)
    .sort((a, b) => (a.endedAt || 0) - (b.endedAt || 0));
  for (const item of finished) {
    if (managedProcesses.size <= MAX_MANAGED_PROCESSES) break;
    managedProcesses.delete(item.id);
  }
}

export async function startBackgroundProcess(command: string, cwd?: string, maxDurationSeconds?: number) {
  if (maxDurationSeconds !== undefined && (!Number.isInteger(maxDurationSeconds) || maxDurationSeconds < 1 || maxDurationSeconds > 7 * 86400)) throw new Error("Invalid managed process duration.");
  cleanupManagedProcesses();
  if (managedProcesses.size >= MAX_MANAGED_PROCESSES) {
    throw new Error(
      "Remote Arc already has the maximum number of managed background processes on this device.",
    );
  }

  const child = spawn(command, {
    shell: true,
    cwd,
    windowsHide: true,
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"],
  });

  const id = crypto.randomUUID();
  const item: ManagedProcess = {
    id,
    child,
    command,
    cwd: cwd || null,
    startedAt: Date.now(),
    endedAt: null,
    exitCode: null,
    signal: null,
    stdout: "",
    stderr: "",
  };
  managedProcesses.set(id, item);
  const deadlineTimer = maxDurationSeconds === undefined ? undefined : setTimeout(() => {
    item.stderr = appendCapped(item.stderr, "\nRemote Arc: authorized process time budget exhausted.");
    void terminateTree(child);
  }, maxDurationSeconds * 1000);
  deadlineTimer?.unref();

  child.stdout?.on("data", (chunk) => {
    item.stdout = appendCapped(item.stdout, chunk);
  });
  child.stderr?.on("data", (chunk) => {
    item.stderr = appendCapped(item.stderr, chunk);
  });
  child.once("error", (error) => {
    clearTimeout(deadlineTimer);
    item.stderr = appendCapped(item.stderr, "\n" + error.message);
    item.endedAt = Date.now();
  });
  child.once("close", (code, signal) => {
    clearTimeout(deadlineTimer);
    item.exitCode = code;
    item.signal = signal;
    item.endedAt = Date.now();
  });

  return {
    process_id: id,
    pid: child.pid || null,
    command,
    cwd: cwd || null,
    status: "running",
    started_at: new Date(item.startedAt).toISOString(),
  };
}

function managedProcessOrThrow(processId: string) {
  cleanupManagedProcesses();
  const item = managedProcesses.get(processId);
  if (!item) {
    throw new Error(
      "Managed process not found or its local retention window has expired.",
    );
  }
  return item;
}

export function getManagedProcessStatus(processId: string) {
  const item = managedProcessOrThrow(processId);
  return {
    process_id: item.id,
    pid: item.child.pid || null,
    command: item.command,
    cwd: item.cwd,
    status: item.endedAt === null ? "running" : "exited",
    exit_code: item.exitCode,
    signal: item.signal,
    started_at: new Date(item.startedAt).toISOString(),
    ended_at: item.endedAt === null ? null : new Date(item.endedAt).toISOString(),
    duration_ms: (item.endedAt || Date.now()) - item.startedAt,
  };
}

export function readManagedProcessOutput(processId: string) {
  const item = managedProcessOrThrow(processId);
  return {
    ...getManagedProcessStatus(processId),
    stdout: item.stdout,
    stderr: item.stderr,
    truncated:
      Buffer.byteLength(item.stdout) >= MAX_CAPTURE_BYTES ||
      Buffer.byteLength(item.stderr) >= MAX_CAPTURE_BYTES,
  };
}

export async function stopManagedProcess(processId: string) {
  const item = managedProcessOrThrow(processId);
  if (item.endedAt !== null) {
    return {
      ...getManagedProcessStatus(processId),
      stopped: false,
      already_exited: true,
    };
  }

  await terminateTree(item.child);
  await new Promise((resolve) => setTimeout(resolve, 50));
  return {
    ...getManagedProcessStatus(processId),
    stopped: true,
    already_exited: false,
  };
}


export async function stopAllManagedProcesses() {
  const running = [...managedProcesses.values()].filter(
    (item) => item.endedAt === null,
  );
  await Promise.all(
    running.map(async (item) => {
      await terminateTree(item.child).catch(() => undefined);
    }),
  );
}


export function listManagedProcesses() {
  cleanupManagedProcesses();
  return [...managedProcesses.values()]
    .sort((a, b) => b.startedAt - a.startedAt)
    .map((item) => ({
      process_id: item.id,
      pid: item.child.pid || null,
      command: item.command,
      cwd: item.cwd,
      status: item.endedAt === null ? "running" : "exited",
      exit_code: item.exitCode,
      signal: item.signal,
      started_at: new Date(item.startedAt).toISOString(),
      ended_at: item.endedAt === null ? null : new Date(item.endedAt).toISOString(),
      duration_ms: (item.endedAt || Date.now()) - item.startedAt,
      stdout_bytes: Buffer.byteLength(item.stdout),
      stderr_bytes: Buffer.byteLength(item.stderr),
    }));
}
