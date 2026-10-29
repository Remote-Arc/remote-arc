import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
import { parseSecurityState, parsePendingApprovals, parsePersistentApprovals } from "../src/security-state.ts";

// Exercise the real preview fixture, rather than duplicating its response here.
const source = (await readFile(new URL("../src/preview.ts", import.meta.url), "utf8"))
  .replaceAll("import.meta.env.VITE_UI_PREVIEW", '"1"')
  .replaceAll("'@remotearc/protocol'", JSON.stringify(new URL("../../../packages/protocol/src/index.ts", import.meta.url).href))
  // A data URL has no directory for relative imports. Keep the real catalog import.
  .replaceAll('"./app-directory.json"', JSON.stringify(new URL("../src/app-directory.json", import.meta.url).href))
  .replaceAll('"./arc-preview.js"', JSON.stringify(new URL("../src/arc-preview.ts", import.meta.url).href))
  .replaceAll("'./arc-input-preview.js'", JSON.stringify(new URL("../src/arc-input-preview.ts", import.meta.url).href))
  .replaceAll('"./billing-preview.js"', JSON.stringify(new URL("../src/billing-preview.ts", import.meta.url).href))
  .replaceAll("'./onboarding-preview.js'", JSON.stringify(new URL("../src/onboarding-preview.ts", import.meta.url).href))
  .replaceAll("'./followup-preview.js'", JSON.stringify(new URL("../src/followup-preview.ts", import.meta.url).href))
  .replaceAll("'./admin/activation-preview.js'", JSON.stringify(new URL("../src/admin/activation-preview.ts", import.meta.url).href));
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
}).outputText;
const storage=new Map();
globalThis.window = { sessionStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},fetch: async () => { throw new Error("Unexpected native request"); } };
globalThis.location = { origin: "https://preview.test", href: "https://preview.test/overview" };
const preview = await import("data:text/javascript;base64," + Buffer.from(compiled).toString("base64"));
preview.installUiPreviewFetchMock("https://mcp.preview.test");
const security = await (await window.fetch("/api/security")).json();
assert.ok(parseSecurityState(security), "Preview must match the real authorization contract");
assert.equal(new Set(security.grants.map(g => g.grantId)).size, security.grants.length);
assert.ok(security.grants.length > 0, "Exercise grant-row rendering identities");
assert.deepEqual(parsePendingApprovals(await (await window.fetch("/api/approvals")).json()), []);
assert.deepEqual(parsePersistentApprovals(await (await window.fetch("/api/approvals/permissions")).json()), []);
assert.equal((await window.fetch("/api/security/mcp", { method: "POST" })).status, 403);
const apps = await (await window.fetch("/api/apps")).json();
assert.equal(apps.enabled, true);
assert.ok(apps.apps.length > 0, "Preview must load the actual Apps catalog");
assert.ok(apps.apps.every(app => Array.isArray(app.operations)));
assert.ok(apps.apps.some(app => app.configured) && apps.apps.some(app => !app.configured), "Exercise both available and coming-soon catalog states");
assert.ok(apps.connections.length > 0 && apps.connections.every(connection => connection.accountLabel.startsWith("Example ")), "Preview connections are explicitly named examples");
assert.equal((await window.fetch("/api/apps/authorize", { method: "POST" })).status, 403);
assert.equal((await window.fetch("/api/devices/preview-mac/tools", { method: "POST", body: '{}' })).status, 403, "Onboarding simulation must not enable writes for other devices");

const grant = security.grants[0];
const invalidGrants = [
  { ...grant, grantId: undefined }, { ...grant, grantId: "" },
  { ...grant, clientId: undefined }, { ...grant, scopes: {} },
  { ...grant, accessExpiresAt: "invalid" }, { ...grant, status: "unknown" },
  { ...grant, tokenRows: 0 },
];
for (const invalid of invalidGrants) {
  assert.equal(parseSecurityState({ ...security, grants: [invalid] }), null);
}
assert.equal(parseSecurityState({ ...security, grants: {} }), null);
assert.equal(parseSecurityState({ ...security, mcpPaused: "false" }), null);
assert.equal(parseSecurityState({ error: "unauthorized" }), null);
assert.equal(parsePendingApprovals({ ok: true }), null, "Original preview fallback cannot reach .map()");

const approval = {
  id: "approval-1", device_id: "device-1", client_id: null, client_name: null,
  grant_id: null, request_id: null, tool_name: "write_file", target_path: "/tmp/report.txt",
  requested_at: new Date().toISOString(), expires_at: new Date(Date.now() + 60_000).toISOString(),
};
assert.deepEqual(parsePendingApprovals([approval]), [approval]);
assert.equal(parsePendingApprovals([{ ...approval, device_id: undefined }]), null);
assert.equal(parsePendingApprovals([{ ...approval, expires_at: "bad" }]), null);
const persistent = { ...approval, status: "approved", decision_scope: "allow_always", approved_until: null, decided_at: new Date().toISOString() };
assert.deepEqual(parsePersistentApprovals([persistent]), [persistent]);
for (const invalid of [{ ...persistent, status: "revoked" }, { ...persistent, decision_scope: "allow_once" }, { ...persistent, approved_until: "2099-01-01" }, { ...persistent, decided_at: "invalid" }]) assert.equal(parsePersistentApprovals([invalid]), null);
console.log("PASS: preview security contract, authorization identities, malformed responses and read-only access");
