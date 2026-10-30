import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";

// The cloud and the device Agent ship independently, so the cloud gates features
// on capabilities each device reports. Every capability the Relay gates on must
// be reported by the current Agent and documented with its older-Agent behaviour.
const root = new URL("../", import.meta.url);
const walk = (dir, keep) => readdirSync(dir).flatMap((name) => {
  const path = new URL(name, dir);
  if (statSync(path).isDirectory()) return walk(new URL(name + "/", dir), keep);
  return keep(name) ? [readFileSync(path, "utf8")] : [];
});
const capabilityPattern = /"([a-z_]+_v\d+)"/g;
const found = (sources, pattern) => new Set(sources.flatMap((text) => [...text.matchAll(pattern)].map((match) => match[1])));

const gated = found(walk(new URL("apps/relay/src/", root), (name) => name.endsWith(".ts")), /includes\("([a-z_]+_v\d+)"\)/g);
const reported = found(walk(new URL("apps/agent/", root), (name) => name.endsWith(".go") && !name.endsWith("_test.go")), capabilityPattern);
const matrix = readFileSync(new URL("docs/agent-compatibility.md", root), "utf8");

assert.ok(gated.size > 0, "Relay capability gates were not found");
for (const capability of gated) assert.ok(reported.has(capability), `Relay gates on ${capability}, which the Go Agent does not report`);
for (const capability of new Set([...gated, ...reported])) {
  assert.ok(matrix.includes("`" + capability + "`"), `docs/agent-compatibility.md must document ${capability}`);
}
console.log(`PASS: ${gated.size} Relay capability gates are reported by the Agent and documented`);
