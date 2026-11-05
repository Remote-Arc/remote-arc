import assert from "node:assert/strict";
import { handleApps } from "../src/apps/apps.js";
import { createWorkerFixture, AGENT, MCP } from "./worker-fixture.js";
import { createRemoteLinkMcp } from "../src/mcp/mcp.js";

const fixture = createWorkerFixture(),
  { sql, now } = fixture;
fixture.addUser("owner");
fixture.addUser("other");
const cookie = await fixture.sessionCookie("owner");
const env = {
  ...fixture.env,
  ARC_BILLING_ENABLED: "1",
  APP_TOKEN_KEY: Buffer.alloc(32, 7).toString("base64"),
  APP_NOTION_CLIENT_ID: "fixture-client",
  APP_NOTION_CLIENT_SECRET: "fixture-secret",
};
for (let i = 0; i < 5; i++)
  sql
    .prepare(
      `INSERT INTO app_connections(id,user_id,provider,account_id,account_label,status,permissions_json,scopes_json,created_at,updated_at)
 VALUES(?,?,?,?,?,'active','["read"]','[]',?,?)`,
    )
    .run(
      "10000000-0000-4000-8000-00000000000" + i,
      "owner",
      "notion",
      "workspace-" + i,
      "Workspace " + i,
      now,
      now,
    );
let identity = "new-workspace",
  exchanges = 0,
  providerCalls = 0;
const provider: typeof fetch = async (input) => {
  providerCalls++;
  const url = String(input);
  if (url === "https://api.notion.com/v1/oauth/token") {
    exchanges++;
    return Response.json({ access_token: "private-quota-token-canary" });
  }
  if (url === "https://api.notion.com/v1/users/me")
    return Response.json({ id: "bot", bot: { workspace_id: identity, workspace_name: "Work" } });
  throw Error("Unexpected provider call " + url);
};
const request = (path: string, method = "GET", body?: unknown, session = cookie) =>
  new Request(AGENT + path, {
    method,
    headers: {
      cookie: session,
      origin: AGENT,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
async function start() {
  const result = await handleApps(
    request("/api/apps/authorize", "POST", { provider: "notion", permissions: ["read"] }),
    env,
    provider,
  );
  assert.equal(result.status, 200);
  const value = (await result.json()) as { authorizationUrl: string };
  return new URL(value.authorizationUrl).searchParams.get("state")!;
}
const state = await start(),
  callback = "/api/apps/oauth/notion/callback?state=" + state + "&code=fixture-code";
const result = await handleApps(request(callback), env, provider);
assert.equal(
  result.status,
  303,
  "OAuth quota failures return to an actionable Apps screen instead of stranding the user on JSON",
);
assert.equal(
  result.headers.get("location"),
  AGENT + "/dashboard/connect/apps?app_error=APP_CONNECTION_LIMIT",
);
assert.equal(result.headers.get("cache-control"), "no-store");
assert.equal(
  sql
    .prepare("SELECT COUNT(*) n FROM app_connections WHERE user_id='owner' AND status='active'")
    .get()!.n,
  5,
  "no sixth connection is saved",
);
assert.equal(
  sql.prepare("SELECT COUNT(*) n FROM app_oauth_states").get()!.n,
  0,
  "the callback state stays single-use",
);
assert.equal(
  sql
    .prepare(
      "SELECT COUNT(*) n FROM product_events WHERE user_id='owner' AND name='app.connection.failed' AND error_code='APP_CONNECTION_LIMIT'",
    )
    .get()!.n,
  1,
  "the redirect preserves failure observability",
);
assert(
  !(result.headers.get("location")! + (await result.text())).includes("private-quota-token-canary"),
);
assert.equal(
  (await handleApps(request(callback), env, provider)).status,
  400,
  "callback replay is rejected",
);
assert.equal(exchanges, 1, "no token exchange is replayed");
// At capacity, renewing access to the same connected account still works.
identity = "workspace-0";
const again = await start();
const renewed = await handleApps(
  request("/api/apps/oauth/notion/callback?state=" + again + "&code=reconnect"),
  env,
  provider,
);
assert.equal(renewed.status, 303);
assert(renewed.headers.get("location")!.includes("connected=notion"));
assert.equal(
  sql.prepare("SELECT COUNT(*) n FROM app_connections WHERE user_id='owner'").get()!.n,
  5,
);
// An OAuth state belongs to its original signed-in account.
const privateState = await start();
const other = await fixture.sessionCookie("other");
assert.equal(
  (
    await handleApps(
      request(
        "/api/apps/oauth/notion/callback?state=" + privateState + "&code=foreign",
        "GET",
        undefined,
        other,
      ),
      env,
      provider,
    )
  ).status,
  400,
);
assert.equal(exchanges, 2);
// HTTP Apps and every MCP client must preserve the monthly allowance code.
const connectedId = "10000000-0000-4000-8000-000000000000";
sql
  .prepare(
    "INSERT INTO user_monthly_usage(user_id,month_key,tool_calls,updated_at) VALUES(?,?,10000,?)",
  )
  .run("owner", now.slice(0, 7), now);
const callsBefore = providerCalls;
const checked = await handleApps(
  request("/api/apps/connections/" + connectedId + "/check", "POST", {}),
  { ...env, ARC_BILLING_ENABLED: undefined },
  provider,
);
assert.equal(checked.status, 402, "App monthly limits must not become a service outage");
assert.equal(((await checked.json()) as any).error, "MONTHLY_LIMIT_REACHED");
// A billed Free account whose reverse trial has ended is paced, not cut off.
sql
  .prepare(
    "INSERT INTO connect_unlimited_trials(user_id,started_at,ends_at,month_key,base_limit) VALUES(?,?,?,?,10000)",
  )
  .run("owner", "2000-01-01T00:00:00.000Z", "2000-01-08T00:00:00.000Z", "2000-01");
sql
  .prepare(
    "INSERT INTO connect_slow_lane_usage(user_id,last_call_at,month_key,month_calls,updated_at) VALUES(?,?,?,1,?)",
  )
  .run("owner", new Date().toISOString(), now.slice(0, 7), now);
const paced = await handleApps(
  request("/api/apps/connections/" + connectedId + "/check", "POST", {}),
  env,
  provider,
);
assert.equal(paced.status, 429, "the slow lane is a retryable pace, not an outage");
const pacedBody = (await paced.json()) as any;
assert.equal(pacedBody.error, "SLOW_LANE_RATE_LIMITED");
assert.equal(paced.headers.get("retry-after"), String(pacedBody.retryAfterSeconds));
assert(pacedBody.retryAfterSeconds >= 1 && pacedBody.retryAfterSeconds <= 30);
const originalFetch = globalThis.fetch;
globalThis.fetch = provider;
try {
  for (const clientProfile of ["generic", "chatgpt", "claude"] as const) {
    const server = createRemoteLinkMcp(
      env as never,
      {
        userId: "owner",
        clientId: "quota-client",
        grantId: null,
        resource: MCP + "/mcp",
        scope: "apps:read apps:write",
      },
      { clientProfile },
    );
    for (let replay = 0; replay < 2; replay++) {
      const response = await server.fetch(
        new Request(MCP + "/mcp", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            accept: "application/json, text/event-stream",
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "tools/call",
            params: {
              name: "run_app_read_action",
              arguments: {
                connectionId: connectedId,
                requestId: "quota-" + clientProfile,
                operation: { action: "notion.search", arguments: { query: "private-task-canary" } },
              },
            },
          }),
        }),
      );
      const text = await response.text(),
        rpc = JSON.parse(
          text.trim().startsWith("{")
            ? text
            : text
                .split("\n")
                .find((line) => line.startsWith("data: "))!
                .slice(6),
        );
      assert(!rpc.error, text);
      const result = JSON.parse(rpc.result.content[0].text),
        failure = typeof result.error === "object" ? result.error : result;
      assert.equal(
        typeof result.error === "string" ? result.error : result.error.code,
        "SLOW_LANE_RATE_LIMITED",
        clientProfile + " first attempt and replay both report the slow-lane code",
      );
      assert.equal(
        sql
          .prepare("SELECT status FROM app_calls WHERE request_id=?")
          .get("quota-" + clientProfile)!.status,
        "approved",
        "a paced App call is not stored as failed, so the same requestId runs after the wait",
      );
      assert.equal(failure.upgrade_url, AGENT + "/checkout?product=connect-unlimited-v1");
      assert(failure.retry_after_seconds >= 1 && failure.retry_after_seconds <= 30);
      assert.equal(failure.recovery.retry, "later");
      assert(failure.recovery.actions.length);
      assert(!JSON.stringify(failure).includes("private-task-canary"));
    }
  }
} finally {
  globalThis.fetch = originalFetch;
}
assert.equal(providerCalls, callsBefore, "exhausted checks and App actions never reach a provider");
assert.equal(
  sql.prepare("SELECT tool_calls n FROM user_monthly_usage WHERE user_id='owner'").get()!.n,
  10000,
);
sql.close();
console.log(
  "PASS: App quota callback returns to recovery UI, retains limits/telemetry, hides tokens, rejects replay/foreign state and permits reconnect at capacity",
);
