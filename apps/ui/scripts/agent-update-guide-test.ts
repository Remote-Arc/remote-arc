import assert from "node:assert/strict";
import { goUpdateCommands, isOlderRelease } from "../src/agent-update-guide.ts";

for (const [running, published, expected] of [
  ["0.6.1-rc.5", "0.6.1", true],
  ["0.6.1-rc.4", "0.6.1-rc.5", true],
  ["0.6.1-beta.3", "0.6.1-rc.1", true],
  ["0.6.1", "0.6.1", false],
  ["0.6.1", "0.6.1-rc.5", false],
  ["0.6.2", "0.6.1", false],
  ["bad", "0.6.1", false],
  ["0.6.1-rc.5", "0.6.0", false],
] as const) {
  assert.equal(isOlderRelease(running, published), expected, running + " vs " + published);
}

assert.deepEqual(goUpdateCommands("0.6.1", true), [
  "npx -y remotelink@0.6.1 --go --stop",
  "npx -y remotelink@0.6.1 --background",
]);
assert.deepEqual(goUpdateCommands("0.6.1", false), [
  "npx -y remotelink@0.6.1 --go --stop",
  "npx -y remotelink@0.6.1",
]);
for (const bad of ["", "latest;rm -rf", "0.6.1-rc.5", "https://example.com"]) {
  assert.throws(() => goUpdateCommands(bad, true), /Invalid stable/);
}
console.log("Go Agent update guidance and RC version comparison passed");
