import assert from "node:assert/strict";
import { handleAgentDownload } from "../src/agent-downloads.js";

let version = "0.6.5";
let calls = 0;
const releaseFetch = (async (url, init) => {
  assert.equal(url, "https://github.com/Remote-Arc/remote-arc/releases/latest/download/go-binaries.json");
  assert.equal(init?.cache, "no-store");
  assert.equal(new Headers(init?.headers).get("authorization"), null);
  calls++;
  const checksums = Object.fromEntries(["windows", "darwin", "linux"].flatMap(platform => ["amd64", "arm64"].map(arch =>
    [`remotelink-v${version}-${platform}-${arch}${platform === "windows" ? ".exe" : ""}`, "a".repeat(64)])));
  return Response.json({ version, checksums });
}) as typeof fetch;
const request = (platform = "windows", arch = "amd64") => new Request(`https://remotearc.app/api/downloads/agent/${platform}/${arch}?url=https://untrusted.example`);
for (const platform of ["windows", "darwin", "linux"]) for (const arch of ["amd64", "arm64"]) {
  const response = await handleAgentDownload(request(platform, arch), releaseFetch);
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("location"), `https://github.com/Remote-Arc/remote-arc/releases/download/remotelink-v0.6.5/remotelink-v0.6.5-${platform}-${arch}${platform === "windows" ? ".exe" : ""}`);
}
version = "0.6.6";
assert((await handleAgentDownload(request(), releaseFetch)).headers.get("location")?.includes("/remotelink-v0.6.6/"), "The same download link follows a new stable release without rebuilding the website");
assert.equal(calls, 7, "Each click checks the current stable manifest");
for (version of ["0.6.7-rc.1", "../elsewhere", "01.2.3"]) assert.equal((await handleAgentDownload(request(), releaseFetch)).status, 503);
for (const body of [{ version: "0.6.6", checksums: {} }, { version: "0.6.6", checksums: { "remotelink-v0.6.6-windows-amd64.exe": "bad-checksum" } }, null]) {
  assert.equal((await handleAgentDownload(request(), (async () => Response.json(body)) as typeof fetch)).status, 503);
}
assert.equal((await handleAgentDownload(request(), (async () => new Response(null, { status: 404 })) as typeof fetch)).status, 503);
assert.equal((await handleAgentDownload(request(), (async () => { throw Error("network down"); }) as typeof fetch)).status, 503);
assert.equal((await handleAgentDownload(request("other"), releaseFetch)).status, 404);
assert.equal((await handleAgentDownload(new Request(request(), { method: "POST" }), releaseFetch)).status, 405);
version = "0.6.6";
assert.equal((await handleAgentDownload(new Request(request(), { method: "HEAD" }), releaseFetch)).status, 302);
console.log("PASS: six native downloads, click-time stable promotion, no stale fallback/cache, checksum presence, fixed origin and GET/HEAD only");
