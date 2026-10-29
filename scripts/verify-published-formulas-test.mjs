import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { verifyPublishedFormulas } from "./verify-published-formulas.mjs";

const root = await mkdtemp(path.join(tmpdir(), "remote-arc-formula-check-"));
const formulas = { "remotelink.rb": 'class Remotelink < Formula\n  sha256 "released-hash"\nend\n', "remotelink-go.rb": 'class RemotelinkGo < Formula\n  sha256 "released-hash"\nend\n' };
const requests = [];
const releaseFetch = async (url, init) => {
  assert(url.startsWith("https://github.com/Remote-Arc/remote-arc/releases/download/remotelink-v0.6.5/"));
  assert.equal(new Headers(init?.headers).get("authorization"), null);
  requests.push(url);
  return new Response(formulas[url.split("/").pop()]);
};
try {
  await mkdir(path.join(root, "Formula"));
  // An unreleased section does not advance the stable formula channel.
  await writeFile(path.join(root, "CHANGELOG.md"), "## 0.6.6 - Unreleased\n### Next\n- Source change\n\n## 0.6.5 - 2026-10-28\n### Stable\n- Published\n");
  for (const [filename, content] of Object.entries(formulas)) await writeFile(path.join(root, "Formula", filename), content.replaceAll("\n", "\r\n"));
  assert.equal(await verifyPublishedFormulas(root, releaseFetch), "0.6.5");
  assert.equal(requests.length, 2);
  await writeFile(path.join(root, "Formula/remotelink.rb"), formulas["remotelink.rb"].replace("released-hash", "development-hash"));
  await assert.rejects(verifyPublishedFormulas(root, releaseFetch), /must preserve the published/);
  await writeFile(path.join(root, "Formula/remotelink.rb"), formulas["remotelink.rb"]);
  await assert.rejects(verifyPublishedFormulas(root, async () => new Response(null, { status: 404 })), /Cannot verify published/);
  await assert.rejects(verifyPublishedFormulas(root, async () => { throw Error("release unavailable"); }), /release unavailable/);
  await assert.rejects(verifyPublishedFormulas(root, async () => new Response("")), /Invalid published/);
  console.log("PASS: released formulas remain pinned across source changes, CRLF, hash tampering, absent assets and network failures");
} finally {
  assert.equal(path.dirname(root), tmpdir());
  assert(path.basename(root).startsWith("remote-arc-formula-check-"));
  await rm(root, { recursive: true });
}
