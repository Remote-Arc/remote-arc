import assert from "node:assert/strict";
import { exchangeGoogleLoginCode, googleLoginClients, handleGoogleLogin } from "../src/auth/auth.js";

const legacy = { GOOGLE_CLIENT_ID: "old-id", GOOGLE_CLIENT_SECRET: "old-secret" };
const migrated = {
  ...legacy,
  GOOGLE_NEXT_CLIENT_ID: "new-id",
  GOOGLE_NEXT_CLIENT_SECRET: "new-secret",
};
type Env = Parameters<typeof googleLoginClients>[0];
const asEnv = (value: object) => value as Env;

assert.deepEqual(googleLoginClients(asEnv(legacy)).map((x) => x.clientId), ["old-id"]);
assert.deepEqual(googleLoginClients(asEnv(migrated)).map((x) => x.clientId), ["new-id", "old-id"]);
assert.deepEqual(googleLoginClients(asEnv({ ...legacy, GOOGLE_NEXT_CLIENT_ID: "partial" })).map((x) => x.clientId), ["old-id"]);
assert.deepEqual(googleLoginClients(asEnv({})), []);

const db = {
  prepare() {
    return { bind() { return { async run() { return { success: true }; } }; } };
  },
};
const login = await handleGoogleLogin(
  new Request("https://mcp.remotearc.app/auth/google?return_to=%2Foverview"),
  { ...migrated, DB: db, PUBLIC_ORIGIN: "https://mcp.remotearc.app" } as unknown as Parameters<typeof handleGoogleLogin>[1],
);
assert.equal(login.status, 302);
const authorizationUrl = new URL(login.headers.get("location") || "");
assert.equal(authorizationUrl.searchParams.get("client_id"), "new-id");
assert.equal(authorizationUrl.searchParams.get("redirect_uri"), "https://remotearc.app/auth/google/callback");

const originalFetch = globalThis.fetch;
const ids: string[] = [];
try {
  globalThis.fetch = async (_input, init) => {
    const params = new URLSearchParams(init?.body as string);
    const id = params.get("client_id") || "";
    ids.push(id);
    assert.equal(params.get("redirect_uri"), "https://remotearc.app/auth/google/callback");
    return new Response(id === "old-id"
      ? JSON.stringify({ access_token: "old-access-token" })
      : JSON.stringify({ error: "invalid_grant" }), {
      status: id === "old-id" ? 200 : 400,
      headers: { "content-type": "application/json" },
    });
  };
  const token = await exchangeGoogleLoginCode(
    "issued-before-switch", "https://remotearc.app/auth/google/callback",
    migrated as unknown as Parameters<typeof exchangeGoogleLoginCode>[2],
  );
  assert.equal(token, "old-access-token");
  assert.deepEqual(ids, ["new-id", "old-id"]);
  ids.length = 0;

  globalThis.fetch = async (_input, init) => {
    const params = new URLSearchParams(init?.body as string);
    ids.push(params.get("client_id") || "");
    return Response.json({ access_token: "new-access-token" });
  };
  const newToken = await exchangeGoogleLoginCode(
    "issued-after-switch", "https://remotearc.app/auth/google/callback",
    migrated as unknown as Parameters<typeof exchangeGoogleLoginCode>[2],
  );
  assert.equal(newToken, "new-access-token");
  assert.deepEqual(ids, ["new-id"]);
} finally {
  globalThis.fetch = originalFetch;
}
console.log("Google OAuth credential cutover tests passed.");
