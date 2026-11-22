import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { executeTask, loadTask, resolveCommand } from "./task-manifest.mjs";

test("task manifest validates names, definitions and repository-owned working directories", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ra-task-manifest-"));
  try {
    fs.mkdirSync(path.join(root, "scripts/tasks"), { recursive: true });
    const target = path.join(root, "scripts/tasks/sample.json");
    const write = (data) => fs.writeFileSync(target, JSON.stringify(data));
    write({ cwd: ".", tasks: { test: [["node", "--version"]] } });
    assert.deepEqual(loadTask(root, "sample", "test"), {
      cwd: root,
      commands: [["node", "--version"]],
    });
    assert.throws(() => loadTask(root, "../escape", "test"), /scope/);
    assert.throws(() => loadTask(root, "sample", "missing"), /Unknown task/);
    write({ cwd: "..", tasks: { test: [["node", "--version"]] } });
    assert.throws(() => loadTask(root, "sample", "test"), /leaves repository/);
    write({ cwd: ".", tasks: { test: ["node --version"] } });
    assert.throws(() => loadTask(root, "sample", "test"), /Invalid commands/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("commands preserve literal arguments, order, cwd and last-step argument forwarding", () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "ra task arguments "));
  try {
    const capture =
      "require('node:fs').appendFileSync('result.jsonl', JSON.stringify({cwd:process.cwd(),args:process.argv.slice(1)})+'\\n')";
    const task = {
      cwd,
      commands: [
        ["node", "-e", capture, "first & literal"],
        ["node", "-e", capture, "second"],
      ],
    };
    assert.equal(
      executeTask(task, { extraArgs: ["last argument with spaces", "$(no-shell)"], stdio: "pipe" }),
      0,
    );
    const rows = fs
      .readFileSync(path.join(cwd, "result.jsonl"), "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    assert.deepEqual(rows, [
      { cwd, args: ["first & literal"] },
      { cwd, args: ["second", "last argument with spaces", "$(no-shell)"] },
    ]);
    const marker = path.join(cwd, "must-not-run");
    assert.equal(
      executeTask(
        {
          cwd,
          commands: [
            ["node", "-e", "process.exit(7)"],
            ["node", "-e", "require('node:fs').writeFileSync(process.argv[1],'bad')", marker],
          ],
        },
        { stdio: "pipe" },
      ),
      7,
    );
    assert.equal(
      fs.existsSync(marker),
      false,
      "Failure stops the suite before another command can run",
    );
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("Node, tsx, pnpm and npm use executable/argument vectors without a shell", () => {
  assert.deepEqual(resolveCommand(["tsx", "scripts/test.ts"]), [
    process.execPath,
    "--import",
    "tsx",
    "scripts/test.ts",
  ]);
  assert.deepEqual(
    resolveCommand(["pnpm", "--filter", "@remotearc/ui", "test"], "C:/path with spaces/pnpm.cjs"),
    [process.execPath, "C:/path with spaces/pnpm.cjs", "--filter", "@remotearc/ui", "test"],
  );
  assert.throws(() => resolveCommand(["pnpm", "test"], "pnpm.cmd"), /through pnpm/);
  assert.throws(() => resolveCommand(["pnpm", "test"], "/node/npm/bin/npm-cli.js"), /through pnpm/);
  assert.deepEqual(resolveCommand(["pnpm", "test"], "/tools/pnpm.exe"), [
    "/tools/pnpm.exe",
    "test",
  ]);
  assert.deepEqual(
    resolveCommand(["npm", "publish", "--dry-run", "--tag", "rc"], "/tools/npm-cli.js"),
    [process.execPath, "/tools/npm-cli.js", "publish", "--dry-run", "--tag", "rc"],
  );
});
