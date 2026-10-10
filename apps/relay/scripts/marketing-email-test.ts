import assert from "node:assert/strict";
import { renderReengagementEmail, runReengagementCampaign, handleUnsubscribe } from "../src/marketing-email.js";

const env = { PUBLIC_ORIGIN: "https://mcp.remotearc.app", EMAIL_AUTH_SECRET: "a-local-test-secret-only",
  MARKETING_REENGAGEMENT_ENABLED: "0", DB: {} as D1Database };
const preview = await renderReengagementEmail(env, { id: "user-123", email: "sample@example.com", name: "Alex" });
assert.ok(preview.subject.includes("AI"));
assert.ok(preview.html.includes("npx remotelink"));
assert.ok(preview.text.includes("Unsubscribe:"));
assert.ok(preview.html.includes("support@remotearc.app"));
assert.equal(preview.headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
assert.ok(preview.headers["List-Unsubscribe"].includes("https://mcp.remotearc.app/unsubscribe"));
assert.deepEqual(await runReengagementCampaign(env), { enabled: false, sent: 0 });

let changes = 0;
const mock = {
  ...env,
  DB: {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          if (sql.startsWith("SELECT")) return { async first() {
            return args[0] === "user-123" ? { id: "user-123", email: "sample@example.com" } : null;
          } };
          return { async run() { changes++; return { meta: { changes: 1 } }; } };
        },
      };
    },
  } as unknown as D1Database,
};
const link = new URL(preview.unsubscribe);
const confirmation = await handleUnsubscribe(new Request(link), mock);
assert.equal(confirmation.status, 200);
assert.ok((await confirmation.text()).includes("Unsubscribe from promotional emails"));
assert.equal(changes, 0, "GET link from security scanners must not unsubscribe");
const unsubscribed = await handleUnsubscribe(new Request(link, { method: "POST" }), mock);
assert.equal(unsubscribed.status, 200);
assert.equal(changes, 1, "POST must unsubscribe");
const invalid = new URL(link);
invalid.searchParams.set("s", "a".repeat(64));
const refused = await handleUnsubscribe(new Request(invalid, { method: "POST" }), mock);
assert.equal(refused.status, 400);
assert.equal(changes, 1, "bad signature must not update preferences");
console.log("Marketing preview, opt-in gate, safe GET/POST unsubscribe, and signature tests passed.");
