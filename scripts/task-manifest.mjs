import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

export function loadTask(root, scope, name) {
  if (!/^[a-z][a-z0-9-]*$/.test(scope)) throw Error("Invalid task scope");
  const manifest = JSON.parse(
    fs.readFileSync(path.join(root, "scripts/tasks", scope + ".json"), "utf8"),
  );
  const commands = manifest.tasks?.[name];
  if (!Array.isArray(commands) || !commands.length) throw Error(`Unknown task: ${scope} ${name}`);
  if (
    commands.some(
      (command) =>
        !Array.isArray(command) ||
        !command.length ||
        command.some((arg) => typeof arg !== "string" || !arg.length),
    )
  ) {
    throw Error(`Invalid commands for ${scope} ${name}`);
  }
  const cwd = path.resolve(root, manifest.cwd);
  const relative = path.relative(root, cwd);
  if (relative.startsWith("..") || path.isAbsolute(relative))
    throw Error("Task cwd leaves repository");
  return { cwd, commands };
}

/** Executable + argument vectors preserve quoting on Windows and Unix. */
export function resolveCommand(command, pnpmEntry = process.env.npm_execpath) {
  const [executable, ...args] = command;
  if (executable === "node") return [process.execPath, ...args];
  if (executable === "tsx") return [process.execPath, "--import", "tsx", ...args];
  if (executable === "npm") {
    const npmName = /(?:^|[\\/])npm-cli\.(?:c?js|mjs)$/;
    if (pnpmEntry && npmName.test(pnpmEntry)) return [process.execPath, pnpmEntry, ...args];
    const bin = path.dirname(process.execPath);
    const candidates = [
      path.join(bin, "node_modules/npm/bin/npm-cli.js"),
      path.join(bin, "../lib/node_modules/npm/bin/npm-cli.js"),
    ];
    for (const directory of (process.env.PATH || "").split(path.delimiter)) {
      candidates.push(path.join(directory, "node_modules/npm/bin/npm-cli.js"));
      try {
        candidates.push(fs.realpathSync(path.join(directory, "npm")));
      } catch {
        /* Not every PATH entry provides npm. */
      }
    }
    const cli = candidates.find((candidate) => npmName.test(candidate) && fs.existsSync(candidate));
    if (!cli)
      throw Error(
        "Could not locate npm's JavaScript CLI; install the standard Node.js/npm distribution.",
      );
    return [process.execPath, cli, ...args];
  }
  if (executable === "pnpm") {
    if (pnpmEntry && /(?:^|[\\/])pnpm(?:\.exe)?$/.test(pnpmEntry)) return [pnpmEntry, ...args];
    if (!pnpmEntry || !/(?:^|[\\/])pnpm\.(?:c?js|mjs)$/.test(pnpmEntry)) {
      throw Error(
        "Run this task through pnpm so its pinned package-manager entry point is available.",
      );
    }
    return [process.execPath, pnpmEntry, ...args];
  }
  return command;
}

export function executeTask(task, { extraArgs = [], stdio = "inherit", pnpmEntry } = {}) {
  for (const [index, command] of task.commands.entries()) {
    const planned = resolveCommand(command, pnpmEntry);
    if (index === task.commands.length - 1) planned.push(...extraArgs);
    console.log(`\n[${index + 1}/${task.commands.length}] ${command.join(" ")}`);
    const result = spawnSync(planned[0], planned.slice(1), { cwd: task.cwd, stdio });
    if (result.error) throw result.error;
    if (result.status !== 0) return result.status ?? (result.signal === "SIGINT" ? 130 : 1);
  }
  return 0;
}
