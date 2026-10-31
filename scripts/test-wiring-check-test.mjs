import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findUnwiredTests } from "./test-wiring-check.mjs";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "ra-test-wiring-"));
const write = (name, text = "") => {
  fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
  fs.writeFileSync(path.join(root, name), text);
};
const none = new Map();

try {
  write("package.json", JSON.stringify({ scripts: { test: "node scripts/direct-test.mjs && node scripts/runner.mjs && node scripts/my-suffix-test.mjs" } }));
  write("apps/relay/package.json", JSON.stringify({ scripts: { test: "tsx scripts/workspace-test.ts" } }));
  write(".github/workflows/ci.yml", "steps:\n  - run: python3 scripts/workflow-test.py\n  - run: node scripts/glob-*.mjs\n");
  write("docs/testing.md", "Run `node scripts/documented-test.mjs` by hand.\n");
  write("scripts/direct-test.mjs");
  write("apps/relay/scripts/workspace-test.ts");
  write("scripts/workflow-test.py");
  // Runners build paths in code, and they can start other runners.
  write("scripts/runner.mjs", 'spawn(join(root, "scripts", "built-path-test.py"));\nrun("packages/cli/scripts/helper.mjs");\n');
  write("packages/cli/scripts/helper.mjs", 'run("scripts/two-hops-test.ts");\n');
  write("scripts/built-path-test.py");
  write("scripts/two-hops-test.ts");
  write("scripts/my-suffix-test.mjs");

  assert.deepEqual(findUnwiredTests(root, none), { unwired: [], stale: [], tests: 6 }, "Direct, workspace, workflow and indirect tests are wired");

  write("scripts/suffix-test.mjs");
  write("scripts/documented-test.mjs");
  write("scripts/glob-test.mjs");
  write("scripts/first-loop-test.mjs", 'run("second-loop-test.mjs");\n');
  write("scripts/second-loop-test.mjs", 'run("first-loop-test.mjs");\n');
  write("apps/ui/scripts/unreferenced-test.ts");
  write("scripts/fixture.mjs");
  const { unwired } = findUnwiredTests(root, none);
  assert.deepEqual(unwired.sort(), [
    "apps/ui/scripts/unreferenced-test.ts",
    "scripts/documented-test.mjs",
    "scripts/first-loop-test.mjs",
    "scripts/glob-test.mjs",
    "scripts/second-loop-test.mjs",
    "scripts/suffix-test.mjs",
  ], "A longer file name, a doc, a glob or a loop of unreached files does not count, and helpers are ignored");

  // Exceptions hide a file, and a stale one is reported instead of lingering.
  const known = new Map(unwired.map((file) => [file, "reason"]));
  assert.deepEqual(findUnwiredTests(root, known).unwired, []);
  known.set("scripts/direct-test.mjs", "now wired");
  known.set("scripts/deleted-test.mjs", "gone");
  assert.deepEqual(findUnwiredTests(root, known).stale, ["scripts/direct-test.mjs", "scripts/deleted-test.mjs"]);

  // The real repository is clean, so a new unwired test fails on its own.
  const real = findUnwiredTests(fileURLToPath(new URL("../", import.meta.url)));
  assert.deepEqual([real.unwired, real.stale], [[], []]);
  assert(real.tests > 150, "The check must still find the repository's tests");
  console.log("PASS: direct, workspace, workflow and indirect references, unreached files, exceptions, stale exceptions and the real repository");
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
