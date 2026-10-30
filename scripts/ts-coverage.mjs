#!/usr/bin/env node
/** Instrument every app/package TS and TSX source file during the actual CI suite. */
import { spawnSync } from "node:child_process";
import { coverageThresholds } from "./coverage-policy.mjs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const temp = mkdtempSync(join(tmpdir(), "remotearc-typescript-coverage-"));
const strict = process.argv.includes("--target");
const thresholds = coverageThresholds("typescript", strict);
const args = [
  "exec", "c8", "--all",
  "--include=apps/**/src/**/*.ts",
  "--include=apps/**/src/**/*.tsx",
  "--include=packages/**/src/**/*.ts",
  "--include=packages/**/src/**/*.tsx",
  "--reporter=text-summary",
  "--temp-directory=" + join(temp, "raw"),
  "--report-dir=" + join(temp, "report"),
  "--check-coverage",
  ...Object.entries(thresholds).map(([key, value]) => "--" + key + "=" + value),
  "pnpm", "run", "ci",
];
console.log(strict
  ? "Full TypeScript strict coverage gate: all metrics must reach 90%."
  : "Full TypeScript CI measured regression floors. 90% coverage is NOT yet achieved.");
let code = 1;
try {
  const result = spawnSync("pnpm", args, { cwd: root, stdio: "inherit" });
  if (result.error) throw result.error;
  code = result.status ?? 1;
} finally {
  rmSync(temp, { recursive: true, force: true });
}
process.exitCode = code;
