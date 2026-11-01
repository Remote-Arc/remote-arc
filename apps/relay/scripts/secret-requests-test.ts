// One-time secrets: the AI asks with request_secret, the user's browser
// encrypts the value to a key the device made for that request, the Relay
// forwards only ciphertext, and start_process or a shared-tab fill spends the
// handle once on that device.
import assert from "node:assert/strict";
import { AGENT, createWorkerFixture, json, type RegistryCall } from "./worker-fixture.js";
import { createRemoteLinkMcp } from "../src/mcp/mcp.js";
import { assertSecretUsable, createSecretRequest, markSecretUsed, SECRET_HANDLE } from "../src/devices/secret-requests.js";
import type { OAuthIdentity } from "../src/auth/auth.js";

const f = createWorkerFixture();
f.env.ENABLE_BROWSER_RUNNER = "1";
f.addUser("u1");
f.addUser("u2");
const addDevice = (id: string, user: string, platform: string, allowed: string[] | null) =>
  f.sql.prepare("INSERT INTO devices(id,user_id,name,platform,credential_hash,created_at,allowed_tools,workspace_roots) VALUES(?,?,?,?,?,?,?,?)")
    .run(id, user, id + " name", platform, "hash-" + id, f.now, allowed ? JSON.stringify(allowed) : null, JSON.stringify(["/work"]));
addDevice("mac", "u1", "darwin", null);
addDevice("chrome", "u1", "browser", ["browser_read_page", "browser_click", "browser_fill"]);
addDevice("chrome-read", "u1", "browser", ["browser_read_page"]);
addDevice("other", "u2", "darwin", null);

// The device side: a P-256 key per request, as the Go Agent and the extension make.
const subtle = globalThis.crypto.subtle;
const b64 = (bytes: ArrayBuffer | Uint8Array) => Buffer.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)).toString("base64url");
const keys = new Map<string, CryptoKeyPair>();
const delivered = new Map<string, string>();
let deviceAnswer: ((call: RegistryCall) => Response | null) | null = null;
const info = (handle: string) => new TextEncoder().encode("remote-arc one-time secret v1 " + handle);
async function aesKey(priv: CryptoKey, pub: CryptoKey, handle: string) {
  const bits = await subtle.deriveBits({ name: "ECDH", public: pub }, priv, 256);
  const ikm = await subtle.importKey("raw", bits, "HKDF", false, ["deriveKey"]);
  return subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt: new Uint8Array(), info: info(handle) }, ikm, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
f.state.registry = async (request: Request) => {
  if (new URL(request.url).pathname !== "/call") return Response.json([]);
  const call = await request.json() as RegistryCall;
  f.state.calls.push(call);
  const answer = deviceAnswer?.(call);
  if (answer) return answer;
  const handle = String(call.arguments.handle ?? "");
  if (call.tool === "secret_prepare") {
    const pair = await subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]) as CryptoKeyPair;
    keys.set(handle, pair);
    return Response.json({ result: { handle, public_key: b64(await subtle.exportKey("raw", pair.publicKey)) } });
  }
  if (call.tool === "secret_deliver") {
    const pair = keys.get(handle)!;
    const epk = await subtle.importKey("raw", Buffer.from(String(call.arguments.epk), "base64url"), { name: "ECDH", namedCurve: "P-256" }, false, []);
    const key = await aesKey(pair.privateKey, epk, handle);
    const plain = await subtle.decrypt({ name: "AES-GCM", iv: Buffer.from(String(call.arguments.iv), "base64url"), additionalData: new TextEncoder().encode(handle) }, key, Buffer.from(String(call.arguments.ciphertext), "base64url"));
    delivered.set(handle, new TextDecoder().decode(plain));
    return Response.json({ result: { handle, delivered: true } });
  }
  return Response.json({ result: { ok: true, tool: call.tool } });
};

// The page side: what the Dashboard entry page does with the public key.
async function seal(publicKey: string, handle: string, value: string) {
  const device = await subtle.importKey("raw", Buffer.from(publicKey, "base64url"), { name: "ECDH", namedCurve: "P-256" }, false, []);
  const eph = await subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]) as CryptoKeyPair;
  const key = await aesKey(eph.privateKey, device, handle);
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await subtle.encrypt({ name: "AES-GCM", iv, additionalData: new TextEncoder().encode(handle) }, key, new TextEncoder().encode(value));
  return { epk: b64(await subtle.exportKey("raw", eph.publicKey)), iv: b64(iv), ciphertext: b64(ciphertext) };
}

const identity = (userId = "u1"): OAuthIdentity => ({
  userId, clientId: "client-a", grantId: null, resource: AGENT + "/mcp",
  scope: "devices:read computer:read computer:write browser:read browser:interact",
});
async function tool(name: string, args: Record<string, unknown>, who = identity()) {
  const response = await createRemoteLinkMcp(f.env as never, who).fetch(new Request(f.env.PUBLIC_ORIGIN + "/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
  }));
  const text = await response.text();
  const payload = JSON.parse(text.trim().startsWith("{") ? text : text.split("\n").find((line) => line.startsWith("data: "))!.slice(6));
  const body = payload.result?.content?.[0]?.text ?? "";
  return { isError: payload.result?.isError === true, text: body, value: (() => { try { return JSON.parse(body); } catch { return null; } })() };
}
const cookie = await f.sessionCookie("u1");
const otherCookie = await f.sessionCookie("u2");
const page = (handle: string, init: RequestInit = {}, who = cookie) =>
  f.call(AGENT + "/api/secret-requests/" + handle, { ...init, headers: { cookie: who, ...(init.method === "POST" ? { origin: AGENT, "content-type": "application/json" } : {}), ...(init.headers as Record<string, string> || {}) } });
const row = (handle: string) => f.sql.prepare("SELECT * FROM secret_requests WHERE id = ?").get(handle) as Record<string, unknown>;

// 1. The AI asks; the device makes a key and the AI gets a handle and a link.
const asked = await tool("request_secret", { device_id: "mac", purpose: "SendPulse API key, for the SENDPULSE_API_KEY Worker secret" });
assert.equal(asked.isError, false, asked.text);
const handle: string = asked.value.handle;
assert.match(handle, SECRET_HANDLE);
assert.equal(asked.value.url, AGENT + "/secret/" + handle);
assert.match(asked.value.next_action, /not in this chat[^]*stdin_secret=sec_/);
assert.deepEqual(f.state.calls.at(-1)!.arguments, { handle });
assert.equal(row(handle).status, "pending");
assert.equal(row(handle).client_id, "client-a");

// Spending it before the user answers says so, and runs nothing.
const early = await tool("start_process", { device_id: "mac", command: "wrangler secret put SENDPULSE_API_KEY", stdin_secret: handle });
assert.match(early.text, /SECRET_PENDING/);
assert.notEqual(f.state.calls.at(-1)!.tool, "start_process");

// 2. The entry page reads the request. Another user, or no session, sees nothing.
let read = await page(handle);
assert.equal(read.status, 200);
const shown = await json(read);
assert.equal(shown.purpose, "SendPulse API key, for the SENDPULSE_API_KEY Worker secret");
assert.deepEqual(shown.device, { id: "mac", name: "mac name", platform: "darwin" });
assert.equal(shown.status, "pending");
assert.equal(typeof shown.public_key, "string");
assert.equal(read.headers.get("cache-control"), "no-store");
assert.equal((await page(handle, {}, otherCookie)).status, 404, "another user's request is hidden");
assert.equal((await f.call(AGENT + "/api/secret-requests/" + handle)).status, 401);
assert.equal((await page("sec_notarealhandle")).status, 404);

// 3. The page posts ciphertext only; the device opens it.
const sealed = await seal(shown.public_key, handle, "sp-live-0123456789abcdef");
assert.equal((await f.call(AGENT + "/api/secret-requests/" + handle, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify(sealed) })).status, 403, "a mutation needs the Dashboard origin");
assert.equal((await page(handle, { method: "POST", body: JSON.stringify({ ...sealed, iv: "short" }) })).status, 400);
assert.equal((await page(handle, { method: "POST", body: JSON.stringify(sealed) }, otherCookie)).status, 404);
const submitted = await page(handle, { method: "POST", body: JSON.stringify(sealed) });
assert.equal(submitted.status, 200);
assert.equal(delivered.get(handle), "sp-live-0123456789abcdef", "the device decrypted what the page encrypted");
const deliverCall = f.state.calls.at(-1)!;
assert.equal(deliverCall.tool, "secret_deliver");
assert.equal(JSON.stringify(deliverCall).includes("sp-live"), false, "the Relay forwarded ciphertext only");
assert.equal(JSON.stringify(row(handle)).includes("sp-live"), false);
assert.equal(row(handle).status, "delivered");
assert.equal((await page(handle, { method: "POST", body: JSON.stringify(sealed) })).status, 409, "a request is answered once");
assert.equal((await json(await page(handle))).public_key, null, "the key is no longer offered");

// 4. start_process spends it once, on that device only.
const wrongDevice = await tool("start_process", { device_id: "other", command: "cat", stdin_secret: handle }, identity("u2"));
assert.match(wrongDevice.text, /SECRET_NOT_FOUND/, "another user cannot use the handle");
f.sql.prepare("UPDATE devices SET user_id='u1' WHERE id='other'").run();
assert.match((await tool("start_process", { device_id: "other", command: "cat", stdin_secret: handle })).text, /SECRET_WRONG_DEVICE/);
f.sql.prepare("UPDATE devices SET user_id='u2' WHERE id='other'").run();
const ran = await tool("start_process", { device_id: "mac", command: "wrangler secret put SENDPULSE_API_KEY", cwd: "/work", stdin_secret: handle });
assert.equal(ran.isError, false, ran.text);
const runCall = f.state.calls.at(-1)!;
assert.equal(runCall.tool, "start_process");
assert.equal(runCall.arguments.stdin_secret, handle, "the device receives the handle and takes the value itself");
assert.equal(row(handle).status, "used");
assert.match((await tool("start_process", { device_id: "mac", command: "cat", stdin_secret: handle })).text, /SECRET_USED/);
assert.match((await tool("start_process", { device_id: "mac", command: "cat", stdin_secret: "sp-live-0123456789abcdef" })).text, /stdin_secret|sec_/i, "a raw value is refused by the schema");
console.log("PASS: request_secret, encrypted entry, one-time start_process stdin_secret");

// 5. In the browser a secret is bound to one site and spent by a fill.
assert.match((await tool("request_secret", { device_id: "chrome", purpose: "Cloudflare API token" })).text, /site is required/);
assert.match((await tool("request_secret", { device_id: "chrome", purpose: "Cloudflare API token", site: "http://example.com/form" })).text, /site is required/, "plain http is refused outside localhost");
assert.match((await tool("request_secret", { device_id: "mac", purpose: "API token", site: "https://dash.cloudflare.com/" })).text, /only to a browser/);
assert.match((await tool("request_secret", { device_id: "chrome-read", purpose: "Cloudflare API token", site: "https://dash.cloudflare.com/x" })).text, /disabled for this device/, "a browser without Click & fill cannot take one");
const browserAsk = await tool("request_secret", { device_id: "chrome", purpose: "Cloudflare API token", site: "https://dash.cloudflare.com/profile/api-tokens?x=1" });
assert.equal(browserAsk.isError, false, browserAsk.text);
const tabHandle: string = browserAsk.value.handle;
assert.equal(browserAsk.value.site, "https://dash.cloudflare.com");
assert.deepEqual(f.state.calls.at(-1)!.arguments, { handle: tabHandle, site: "https://dash.cloudflare.com" }, "the extension learns the site the value may go to");
const tabShown = await json(await page(tabHandle));
assert.equal(tabShown.site, "https://dash.cloudflare.com");
assert.equal((await page(tabHandle, { method: "POST", body: JSON.stringify(await seal(tabShown.public_key, tabHandle, "cf-token-abcdef")) })).status, 200);
assert.match((await tool("shared_tab_fill", { device_id: "chrome", snapshot_id: "s1", ref: "e2", value: "x", secret: tabHandle })).text, /either value or secret/);
assert.match((await tool("shared_tab_fill", { device_id: "chrome", snapshot_id: "s1", ref: "e2" })).text, /either value or secret/);
assert.match((await tool("shared_tab_act", { device_id: "chrome", action: "click", snapshot_id: "s1", ref: "e2", secret: tabHandle })).text, /only with action=fill/);
const filled = await tool("shared_tab_fill", { device_id: "chrome", tab_id: 4, snapshot_id: "s1", ref: "e2", secret: tabHandle });
assert.equal(filled.isError, false, filled.text);
assert.deepEqual(f.state.calls.at(-1)!.arguments, { tab_id: 4, snapshot_id: "s1", ref: "e2", secret: tabHandle });
assert.equal(row(tabHandle).status, "used");
assert.match((await tool("shared_tab_act", { device_id: "chrome", action: "fill", snapshot_id: "s1", ref: "e2", secret: tabHandle })).text, /SECRET_USED/);
console.log("PASS: browser secrets are bound to a site and spent once by shared_tab_fill or shared_tab_act");

// 6. Failures: an old device, a device that rejects, expiry, and a raw value.
deviceAnswer = (call) => call.tool === "secret_prepare" ? Response.json({ error: "Tool blocked by local permission mode: secret_prepare" }, { status: 502 }) : null;
assert.match((await tool("request_secret", { device_id: "mac", purpose: "API key" })).text, /SECRET_UNSUPPORTED[^]*update/);
deviceAnswer = (call) => call.tool === "secret_prepare" ? Response.json({ result: { ok: true } }) : null;
await assert.rejects(createSecretRequest(f.env as never, identity(), { deviceId: "mac", purpose: "API key" }), /SECRET_UNSUPPORTED/, "a device that answers without a key is too old");
deviceAnswer = null;
await assert.rejects(createSecretRequest(f.env as never, identity(), { deviceId: "mac", purpose: "x" }), /3 to 300/);
await assert.rejects(createSecretRequest(f.env as never, identity("u2"), { deviceId: "mac", purpose: "API key" }), /device not found/);

const rejected = (await createSecretRequest(f.env as never, identity(), { deviceId: "mac", purpose: "API key" })).handle;
deviceAnswer = (call) => call.tool === "secret_deliver" ? Response.json({ error: "SECRET_UNREADABLE: could not open" }, { status: 502 }) : null;
const rejectedShown = await json(await page(rejected));
const rejectedPost = await page(rejected, { method: "POST", body: JSON.stringify(await seal(rejectedShown.public_key, rejected, "value")) });
assert.equal(rejectedPost.status, 502);
assert.equal((await json(rejectedPost)).error, "device_rejected");
assert.equal(row(rejected).status, "failed");
deviceAnswer = (call) => call.tool === "secret_deliver" ? Response.json({ error: "device offline" }, { status: 404 }) : null;
const offline = (await createSecretRequest(f.env as never, identity(), { deviceId: "mac", purpose: "API key" })).handle;
const offlinePost = await page(offline, { method: "POST", body: JSON.stringify(await seal((await json(await page(offline))).public_key, offline, "value")) });
assert.equal((await json(offlinePost)).error, "device_offline");
deviceAnswer = null;

const stale = (await createSecretRequest(f.env as never, identity(), { deviceId: "mac", purpose: "API key" })).handle;
f.sql.prepare("UPDATE secret_requests SET expires_at=? WHERE id=?").run(new Date(Date.now() - 1000).toISOString(), stale);
const staleShown = await json(await page(stale));
assert.equal(staleShown.status, "expired");
assert.equal(staleShown.public_key, null);
assert.equal((await page(stale, { method: "POST", body: JSON.stringify(sealed) })).status, 410);
await assert.rejects(assertSecretUsable(f.env as never, "u1", "mac", stale), /SECRET_EXPIRED/);

const old = (await createSecretRequest(f.env as never, identity(), { deviceId: "mac", purpose: "API key" })).handle;
f.sql.prepare("UPDATE secret_requests SET status='delivered', delivered_at=? WHERE id=?").run(new Date(Date.now() - 11 * 60 * 1000).toISOString(), old);
await assert.rejects(assertSecretUsable(f.env as never, "u1", "mac", old), /SECRET_EXPIRED/, "a delivered value expires after 10 minutes");
await assert.rejects(assertSecretUsable(f.env as never, "u1", "mac", "hunter2"), /never the value itself/);
await assert.rejects(assertSecretUsable(f.env as never, "u1", "mac", "sec_aaaaaaaaaaaaaaaaaaaaaaaa"), /SECRET_NOT_FOUND/);
await markSecretUsed(f.env as never, stale);
assert.equal(row(stale).status, "pending", "only a delivered secret becomes used");
console.log("PASS: old devices, rejected and offline deliveries, expiry and raw values");
