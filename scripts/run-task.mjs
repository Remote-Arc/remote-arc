#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { executeTask, loadTask } from "./task-manifest.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const [scope, name, ...forwarded] = process.argv.slice(2);
if (!scope || scope === "--list") {
  for (const file of fs
    .readdirSync(path.join(root, "scripts/tasks"))
    .filter((f) => f.endsWith(".json"))) {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, "scripts/tasks", file), "utf8"));
    console.log(`${file.slice(0, -5)} (${manifest.cwd})`);
    for (const key of Object.keys(manifest.tasks)) console.log(`  ${key}`);
  }
} else {
  try {
    const task = loadTask(root, scope, name);
    if (forwarded.includes("--dry-run")) {
      console.log(
        JSON.stringify(
          { ...task, extraArgs: forwarded.filter((arg) => arg !== "--dry-run") },
          null,
          2,
        ),
      );
    } else {
      process.exitCode = executeTask(task, {
        extraArgs: forwarded[0] === "--" ? forwarded.slice(1) : forwarded,
      });
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
