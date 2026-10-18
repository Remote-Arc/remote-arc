import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { recoverLegacyAdminClient, type AdminClientRecovery } from "../src/admin/admin-client-recovery.js";

const origin = "https://admin.remotearc.app";
const calls: string[] = [];
let attempt: string | null = null;
const shared: AdminClientRecovery = {
  hostname: "admin.remotearc.app",
  origin,
  controlled: true,
  getRegistrations: async () => [
    { scope: origin + "/", unregister: async () => { calls.push("unregister-admin"); return true; } },
    { scope: "https://agent.remotearc.app/", unregister: async () => { calls.push("wrong-domain"); return true; } },
  ],
  cacheKeys: async () => ["remote-arc-shell-v1", "another-site-cache"],
  deleteCache: async key => { calls.push("delete:" + key); return true; },
  getAttempt: () => attempt,
  setAttempt: value => { attempt = value; },
  reload: () => { calls.push("reload"); },
};
assert.equal(await recoverLegacyAdminClient({ ...shared, hostname: "agent.remotearc.app" }), false);
assert.deepEqual(calls, [], "Other subdomains must be untouched");
assert.equal(await recoverLegacyAdminClient(shared), true);
assert.deepEqual(calls, ["unregister-admin", "delete:remote-arc-shell-v1", "reload"]);
assert.equal(attempt, "1");
calls.length = 0;
assert.equal(await recoverLegacyAdminClient(shared), false, "Never reload twice");
assert.deepEqual(calls, ["unregister-admin", "delete:remote-arc-shell-v1"]);
calls.length = 0;
assert.equal(await recoverLegacyAdminClient({ ...shared, controlled: false }), false);
assert.deepEqual(calls, ["unregister-admin", "delete:remote-arc-shell-v1"]);
assert.equal(await recoverLegacyAdminClient({
  hostname: "admin.remotearc.app", origin, controlled: true,
  getRegistrations: async () => { throw new Error("unavailable"); },
  cacheKeys: async () => { throw new Error("disabled"); },
  reload: () => { throw Error("must not reload"); },
}), false);

const document = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const inline = document.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(inline, "HTML theme bootstrap script must exist");
// HTML parsing normalizes CRLF to LF before CSP hashes are checked in a browser.
const normalizedInline = inline.replace(/\r\n?/g, "\n");
const hash = "sha256-" + createHash("sha256").update(normalizedInline).digest("base64");
assert.equal(createHash("sha256").update(normalizedInline.replace(/\n/g,"\r\n").replace(/\r\n?/g,"\n")).digest("base64"),hash.slice(7),"CSP must be stable on Windows and Linux");
const relay = readFileSync(new URL("../../relay/src/index.ts", import.meta.url), "utf8");
assert.ok(relay.includes("'" + hash + "'"), "Admin CSP must allow the exact HTML theme bootstrap");
assert.ok(relay.includes("Remote Arc Admin"), "Admin document must include an accessible failure fallback");
console.log("PASS: Admin scoped SW/cache recovery, bounded reload, graceful unavailable storage and CSP hash");
