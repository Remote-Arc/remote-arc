#!/usr/bin/env node
// Fails when a test file can never run. A test counts as wired when a package script
// or CI workflow names it, directly or through scripts that those start. A file name
// inside a reached script counts as a reference, because runners build paths in code.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIRECTORIES = ["apps/relay/scripts", "apps/ui/scripts", "packages/cli/scripts", "scripts", "tools/saas", ".github/scripts"];
const WORKSPACES = ["apps", "packages"];
const SCRIPT_FILE = /[\w.@-]+\.(?:mjs|cjs|js|ts|py|sh)\b/g;
const TEST_FILE = /(?:-test|\.test)\.(?:mjs|cjs|js|ts|py)$/;

// Keep a reason beside each entry. An entry that becomes wired fails the check.
export const KNOWN_UNWIRED = new Map([
  ["scripts/automatic-client-mcp-job-test.py", "Fails intermittently on Windows: its temp directory can still be in use after the job reports no active processes."],
]);

const tokens = (text) => text.match(SCRIPT_FILE) ?? [];
const files = (root, directory) => {
  const full = path.join(root, directory);
  return fs.existsSync(full) ? fs.readdirSync(full, { withFileTypes: true }).filter((entry) => entry.isFile()).map((entry) => directory + "/" + entry.name) : [];
};

function entryPoints(root) {
  const manifests = ["package.json", ...WORKSPACES.flatMap((parent) => {
    const full = path.join(root, parent);
    return fs.existsSync(full) ? fs.readdirSync(full).map((name) => parent + "/" + name + "/package.json") : [];
  })].filter((file) => fs.existsSync(path.join(root, file)));
  const scripts = manifests.flatMap((file) => Object.values(JSON.parse(fs.readFileSync(path.join(root, file), "utf8")).scripts ?? {}));
  const workflows = files(root, ".github/workflows").map((file) => fs.readFileSync(path.join(root, file), "utf8"));
  return [...scripts, ...workflows].join("\n");
}

export function findUnwiredTests(root, known = KNOWN_UNWIRED) {
  const candidates = SCRIPT_DIRECTORIES.flatMap((directory) => files(root, directory)).filter((file) => tokens(path.posix.basename(file)).length);
  const byName = Map.groupBy(candidates, (file) => path.posix.basename(file));
  const reached = new Set(), pending = tokens(entryPoints(root));
  while (pending.length) {
    for (const file of byName.get(pending.pop()) ?? []) {
      if (reached.has(file)) continue;
      reached.add(file);
      // This file names its exceptions, which must not count as references to them.
      if (file !== "scripts/test-wiring-check.mjs") pending.push(...tokens(fs.readFileSync(path.join(root, file), "utf8")));
    }
  }
  const unwired = candidates.filter((file) => TEST_FILE.test(file) && !reached.has(file));
  return {
    unwired: unwired.filter((file) => !known.has(file)),
    stale: [...known.keys()].filter((file) => !unwired.includes(file)),
    tests: candidates.filter((file) => TEST_FILE.test(file)).length,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { unwired, stale, tests } = findUnwiredTests(fileURLToPath(new URL("../", import.meta.url)));
  for (const file of unwired) console.error("Not run by any package script or workflow: " + file);
  for (const file of stale) console.error("Remove from KNOWN_UNWIRED, it is now wired or gone: " + file);
  if (unwired.length || stale.length) process.exit(1);
  console.log(`PASS: ${tests - KNOWN_UNWIRED.size} of ${tests} test files are reached from a package script or workflow; ${KNOWN_UNWIRED.size} known exception`);
}
