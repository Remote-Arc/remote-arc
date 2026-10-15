#!/usr/bin/env node
/**
 * Go statement coverage for both production Go modules.
 *
 * By default this command enforces non-regression floors while the repository
 * migrates to 90% coverage. Use --target to fail unless EVERY module reaches
 * 90%, without silently excluding command entrypoints.
 */
import { spawnSync } from "node:child_process";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const modules = [
  { name: "Go Agent", dir: "apps/agent", baseline: 69.0, focus: { "internal/localmcp": 90 } },
  { name: "Execution Core", dir: "packages/execution-core", baseline: 90.0, focus: { protocol: 90 } },
];
const root = resolve(import.meta.dirname, "..");
const strict = process.argv.includes("--target");
const workDir = mkdtempSync(join(tmpdir(), "remotearc-go-coverage-"));
const failures = [];

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", stdio: "pipe" });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(command + " failed: " + result.status);
}

function summarise(profile, segment = "") {
  let total = 0;
  let covered = 0;
  for (const line of readFileSync(profile, "utf8").split("\n").slice(1)) {
    const match = /^(\S+):(\d+)\.(\d+),(\d+)\.(\d+)\s+(\d+)\s+(\d+)$/.exec(line);
    if (!match || (segment && !match[1].includes("/" + segment + "/"))) continue;
    const count = Number(match[6]);
    total += count;
    if (Number(match[7]) > 0) covered += count;
  }
  return { covered, total, percent: total ? Number((covered / total * 100).toFixed(1)) : 0 };
}

try {
  for (const [i, module] of modules.entries()) {
    const cwd = resolve(root, module.dir);
    const profile = join(workDir, "module-" + i + ".out");
    process.stdout.write("\n## " + module.name + "\n");
    run("go", ["test", "./...", "-coverprofile=" + profile, "-cover"], cwd);
    const all = summarise(profile);
    console.log(module.name + " statements: " + all.covered + "/" + all.total + " = " + all.percent + "% (target 90%)");
    const threshold = strict || module.baseline >= 90 ? 90 : module.baseline - 0.6;
    if (all.percent < threshold) failures.push(module.name + " " + all.percent + "% < " + threshold + "%");
    for (const [pkg, minimum] of Object.entries(module.focus)) {
      const result = summarise(profile, pkg);
      console.log("  " + pkg + ": " + result.percent + "% (minimum " + minimum + "%)");
      if (!result.total || result.percent < minimum) failures.push(module.name + "/" + pkg + " " + result.percent + "% < " + minimum + "%");
    }
  }
} finally {
  rmSync(workDir, { recursive: true, force: true });
}

if (failures.length) {
  console.error("\nCoverage quality gate failed:\n" + failures.map(x => "- " + x).join("\n"));
  process.exitCode = 1;
} else {
  console.log("\nGo coverage quality gate passed" + (strict ? " (90% target)." : " (non-regression floors; 90% still required)."));
}
