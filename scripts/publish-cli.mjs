#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { executeTask, resolveCommand } from "./task-manifest.mjs";

// Preserve the existing build/version/native-download checks before npm publish.
const root = fileURLToPath(new URL("../", import.meta.url));
const code = executeTask({ cwd: root, commands: [["pnpm", "build:cli"]] });
if (code) process.exit(code);
const directory = path.join(root, "packages/cli");
const { version } = JSON.parse(fs.readFileSync(path.join(directory, "package.json"), "utf8"));
const built = fs.readFileSync(path.join(directory, "dist/index.js"), "utf8");
if (!built.includes(version) || !built.includes("releases/download/remotelink-v")) {
  throw Error("CLI build is missing its reviewed version or native release download URL");
}
// Preserve npm flags, including --dry-run, without interpreting shell syntax.
const [npmExecutable, ...npmArguments] = resolveCommand([
  "npm",
  "publish",
  ...process.argv.slice(2),
]);
const result = spawnSync(npmExecutable, npmArguments, {
  cwd: directory,
  stdio: "inherit",
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
