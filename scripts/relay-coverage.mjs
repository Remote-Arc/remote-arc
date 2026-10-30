#!/usr/bin/env node
/** Relay security suite source coverage; all production Relay source files are counted. */
import { spawnSync } from "node:child_process";
import { coverageThresholds } from "./coverage-policy.mjs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const temp = mkdtempSync(join(tmpdir(), "remotearc-relay-coverage-"));
const strict = process.argv.includes("--target");
const thresholds = coverageThresholds("relay", strict);
const args = [
  "exec", "c8",
  "--all",
  "--include=apps/relay/src/**/*.ts",
  "--reporter=text-summary",
  "--temp-directory=" + join(temp, "raw"),
  "--report-dir=" + join(temp, "report"),
  "--check-coverage",
  ...Object.entries(thresholds).map(([key, value]) => "--" + key + "=" + value),
  "pnpm", "--filter", "@remotearc/relay", "test:security",
];
console.log(strict
  ? "Relay strict coverage gate: all metrics must reach 90%."
  : "Relay measured regression floors; full 90% production coverage is NOT yet achieved.");
let code = 1;
try {
  const result = spawnSync("pnpm", args, { cwd: root, stdio: "inherit" });
  if (result.error) throw result.error;
  code = result.status ?? 1;
} finally {
  rmSync(temp, { recursive: true, force: true });
}
process.exitCode = code;
