// The Worker entry (src/index.ts) end to end: host partitioning, canonical
// redirects, pre-auth rate limits, session- and device-authenticated APIs,
// OAuth + PKCE into the MCP gate, HTML shell headers, error handling and
// cron dispatch. Real D1 SQL runs on in-memory SQLite; no network is used.
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { sha256Hex } from "../src/auth/auth.js";
import { ADMIN, AGENT, MCP, SITE, createWorkerFixture, json, location, worker } from "./worker-fixture.js";

const { sql, env, limits, state, pending, ctx, call, now, addUser, sessionCookie } = createWorkerFixture();
addUser("owner"); addUser("operator", "admin");
const ownerCookie = await sessionCookie("owner"), adminCookie = await sessionCookie("operator");

try {
  // Admin host: sign-in first, admins only, and nothing but its documents and API.
  let response = await call(ADMIN + "/");
  assert.equal(response.status, 302);
  assert.equal(location(response), AGENT + "/auth/login?return_to=" + encodeURIComponent(ADMIN + "/"));
  response = await call(ADMIN + "/", { headers: { cookie: ownerCookie } });
  assert.equal(response.status, 403, "Signed-in non-admins cannot open the admin console");
  response = await call(ADMIN + "/", { headers: { cookie: adminCookie, accept: "text/html" } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.match(response.headers.get("content-security-policy") || "", /frame-ancestors 'none'/);
  assert.match(await response.text(), /Loading the secure admin console/, "Admin shell carries a readable recovery message");
  response = await call(ADMIN + "/devices");
  assert.equal(location(response), ADMIN + "/", "Unknown admin pages return to the console root");
  response = await call(ADMIN + "/devices", { method: "POST" });
  assert.equal(response.status, 404);

  // Admin data never runs on consumer hosts.
  response = await call(MCP + "/api/admin/operations");
  assert.equal(response.status, 404);
  assert.equal((await json(response)).error, "admin_host_required");
  assert.equal(location(await call(MCP + "/monitor")), ADMIN + "/");

  // Canonical public URLs.
  assert.equal(location(await call("http://remotearc.app/docs")), SITE + "/docs");
  assert.equal(location(await call("https://www.remotearc.app/pricing?ref=x")), SITE + "/pricing?ref=x");
  assert.equal(location(await call(SITE + "/docs/")), SITE + "/docs");
  assert.equal(location(await call(SITE + "/install")), SITE + "/install/chatgpt");
  assert.equal(location(await call(SITE + "/resources")), SITE + "/docs");
  response = await call(SITE + "/dashboard");
  assert.equal(response.status, 302);
  assert.equal(location(response), AGENT + "/overview");
  assert.equal(location(await call(SITE + "/devices?tab=access")), AGENT + "/devices?tab=access");
  assert.equal(location(await call(MCP + "/")), AGENT + "/overview", "The old MCP-host dashboard moves to the dashboard host");
  for (const path of ["/mcp", "/oauth/authorize?x=1", "/.well-known/oauth-authorization-server"]) {
    response = await call(SITE + path);
    assert.equal(response.status, 307, path + " keeps its method on the protocol host");
    assert.equal(location(response), MCP + path);
  }

  // OAuth issuer, MCP and device transport stay on the protocol host.
  response = await call(AGENT + "/mcp", { method: "POST" });
  assert.equal(response.status, 404);
  assert.equal((await json(response)).error, "protocol_host_required");

  // Private dashboard tabs require a session; /overview stays a public preview.
  response = await call(AGENT + "/devices", { headers: { accept: "text/html" } });
  assert.equal(response.status, 302);
  assert.match(location(response) || "", /^https:\/\/agent\.remotearc\.app\/auth\/login\?/);
  response = await call(AGENT + "/devices", { headers: { accept: "text/html", cookie: ownerCookie } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow, noarchive");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("etag"), null, "HTML shells are never cached by validator");

  // Pre-auth endpoints are rate limited by visitor, before any handler runs.
  limits.auth = false;
  response = await call(MCP + "/oauth/token", { method: "POST", headers: { "cf-connecting-ip": "203.0.113.9" } });
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "60");
  limits.auth = true;
  limits.email = false;
  response = await call(MCP + "/auth/email/request", { method: "POST" });
  assert.equal(response.status, 429, "Email codes have their own sending limit");
  limits.email = true;

  // Public metadata.
  const challenge = MCP + "/.well-known/openai-apps-challenge";
  assert.equal((await call(challenge)).status, 404);
  env.OPENAI_APPS_CHALLENGE = "challenge-token";
  response = await call(challenge);
  assert.equal(await response.text(), "challenge-token");
  assert.equal(response.headers.get("cache-control"), "no-store");
  let health = await json(await call(MCP + "/health"));
  assert.equal(health.ok, true);
  assert.equal(health.auth, "oauth2-pkce");
  assert.equal(health.deployment, undefined);
  env.DEPLOYMENT_SHA = "not-a-sha";
  assert.equal((await json(await call(MCP + "/health"))).deployment, undefined, "Only a full commit SHA is published");
  env.DEPLOYMENT_SHA = "a".repeat(40);
  health = await json(await call(MCP + "/health"));
  assert.equal(health.deployment, "a".repeat(40));
  const resource = await json(await call(MCP + "/.well-known/oauth-protected-resource"));
  assert.equal(resource.resource, MCP + "/mcp");
  const issuer = await json(await call(MCP + "/.well-known/oauth-authorization-server"));
  assert.equal(issuer.issuer, MCP);
  assert.ok(issuer.code_challenge_methods_supported.includes("S256"));
  const runtime = await json(await call(MCP + "/api/runtime-config"));
  assert.equal(runtime.version, 1);
  assert.equal(typeof runtime.arcAvailable, "boolean");

  // Session APIs.
  response = await call(AGENT + "/api/me");
  assert.equal(response.status, 401);
  assert.equal((await json(response)).authenticated, false);
  const me = await json(await call(AGENT + "/api/me", { headers: { cookie: ownerCookie } }));
  assert.equal(me.user.id, "owner");
  assert.equal(typeof me.user.arcAvailable, "boolean");
  for (const path of ["/api/status", "/api/activity", "/api/debug/devices"]) {
    assert.equal((await call(AGENT + path)).status, 401, path + " requires a session");
  }
  const status = await json(await call(AGENT + "/api/status", { headers: { cookie: ownerCookie } }));
  assert.equal(status.mcpEndpoint, MCP + "/mcp");
  assert.equal(status.totalDevices, 0);
  assert.deepEqual(await json(await call(AGENT + "/api/activity?limit=5", { headers: { cookie: ownerCookie } })), []);

  // Account APIs are served only on product hosts.
  for (const [path, error] of [["/api/organizations", "app_host_required"], ["/api/billing", "billing_host_required"], ["/api/apps", "app_host_required"]]) {
    response = await call(SITE + path);
    assert.equal(response.status, 404, path + " is not served on the marketing host");
    assert.equal((await json(response)).error, error);
  }
  assert.equal((await call(AGENT + "/api/organizations")).status, 401);
  assert.equal((await call(MCP + "/api/slack/events")).status, 404, "Slack events accept POST only");
  for (const path of ["/api/public/engagement", "/api/public/feedback-reward"]) {
    assert.equal((await call(MCP + path, { method: "POST" })).status, 404, path + " is a website-only endpoint");
  }

  // Device transport: credentials gate the heartbeat and the relay socket.
  const deviceToken = randomBytes(24).toString("hex");
  sql.prepare("INSERT INTO devices(id,user_id,name,platform,credential_hash,created_at) VALUES(?,?,?,?,?,?)")
    .run("laptop", "owner", "Laptop", "linux", await sha256Hex(deviceToken), now);
  assert.equal((await call(MCP + "/api/device/heartbeat", { method: "POST" })).status, 401);
  response = await call(MCP + "/api/device/heartbeat", {
    method: "POST", headers: { authorization: "Bearer " + deviceToken, "content-type": "application/json" },
    body: JSON.stringify({ background_enabled: true, background_service: "systemd" }),
  });
  assert.equal(response.status, 204);
  let row = sql.prepare("SELECT background_enabled, background_service, background_seen_at FROM devices WHERE id='laptop'").get() as Record<string, unknown>;
  assert.equal(row.background_enabled, 1);
  assert.equal(row.background_service, "systemd");
  assert.ok(row.background_seen_at);
  await call(MCP + "/api/device/heartbeat", {
    method: "POST", headers: { authorization: "Bearer " + deviceToken },
    body: JSON.stringify({ background_service: "x".repeat(41) }),
  });
  row = sql.prepare("SELECT background_enabled, background_service FROM devices WHERE id='laptop'").get() as Record<string, unknown>;
  assert.equal(row.background_enabled, 1, "Absent flags leave the stored background state unchanged");
  assert.equal(row.background_service, "systemd", "Oversized service names are ignored");
  assert.equal((await call(MCP + "/agent")).status, 401);
  state.registry = async () => { throw new Error("registry offline"); };
  const before = pending.length;
  response = await call(MCP + "/agent", { headers: { authorization: "Bearer " + deviceToken } });
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("retry-after"), "2");
  assert.ok(pending.length > before, "A 5xx response records a service incident in the background");
  state.registry = null;

  // OAuth authorization code + PKCE through the Worker, then the MCP gate.
  const redirectUri = "https://chatgpt.com/connector_platform_oauth_redirect";
  const registration = await call(MCP + "/oauth/register", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ client_name: "Entry test", redirect_uris: [redirectUri], token_endpoint_auth_method: "none" }),
  });
  assert.equal(registration.status, 201);
  const { client_id: clientId } = await json(registration);
  const verifier = randomBytes(32).toString("base64url");
  const authorization = {
    response_type: "code", client_id: clientId, redirect_uri: redirectUri, state: "entry-state",
    code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256",
    resource: MCP + "/mcp", scope: "devices:read computer:read",
  };
  response = await call(MCP + "/oauth/authorize?" + new URLSearchParams(authorization), { headers: { cookie: ownerCookie } });
  assert.equal(response.status, 302);
  assert.equal(new URL(location(response)!).pathname, "/oauth/consent");
  response = await call(MCP + "/oauth/decision", {
    method: "POST", headers: { "content-type": "application/json", origin: MCP, cookie: ownerCookie },
    body: JSON.stringify({ ...authorization, decision: "allow" }),
  });
  assert.equal(response.status, 200);
  const redirect = new URL((await json(response)).redirect_to);
  assert.equal(redirect.searchParams.get("state"), "entry-state");
  response = await call(MCP + "/oauth/token", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", client_id: clientId, redirect_uri: redirectUri, code: redirect.searchParams.get("code")!, code_verifier: verifier, resource: MCP + "/mcp" }),
  });
  assert.equal(response.status, 200);
  const { access_token: accessToken } = await json(response);
  const rpc = (token?: string, method = "tools/list") => call(MCP + "/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...(token ? { authorization: "Bearer " + token } : {}) },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: {} }),
  });
  response = await rpc(accessToken);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /list_devices/, "An authorized client receives the tool catalog");
  limits.mcp = false;
  response = await rpc(accessToken);
  assert.equal(response.status, 429, "Authorized MCP traffic is rate limited per user and client");
  limits.mcp = true;
  response = await call(AGENT + "/api/security/mcp", {
    method: "POST", headers: { "content-type": "application/json", origin: AGENT, cookie: ownerCookie },
    body: JSON.stringify({ paused: true }),
  });
  assert.equal(response.status, 200);
  response = await rpc(accessToken);
  assert.equal(response.status, 423);
  assert.equal((await json(response)).error, "mcp_paused");

  // Crawl and install files.
  response = await call(MCP + "/robots.txt");
  assert.equal(await response.text(), "User-agent: *\nDisallow: /\n", "Product hosts are never indexed");
  response = await call(SITE + "/robots.txt", { method: "HEAD" });
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "");
  assert.match((await call(SITE + "/sitemap.xml")).headers.get("content-type") || "", /application\/xml/);
  assert.match((await call(SITE + "/feed.xml")).headers.get("content-type") || "", /rss\+xml/);
  assert.match(await (await call(SITE + "/llms.txt")).text(), /Remote Arc/);
  assert.match(await (await call(SITE + "/llms-full.txt")).text(), /Remote Arc/);
  response = await call(SITE + "/install.sh");
  assert.equal(response.headers.get("content-type"), "text/x-shellscript; charset=utf-8");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("x-robots-tag"), "noindex");

  // Marketing documents: canonical link, 404 status for unknown pages, empty HEAD.
  response = await call(SITE + "/docs");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("link"), "<" + SITE + '/docs>; rel="canonical"');
  response = await call(SITE + "/no-such-page");
  assert.equal(response.status, 404);
  assert.equal(response.headers.get("x-robots-tag"), "noindex, nofollow, noarchive");
  response = await call(SITE + "/docs", { method: "HEAD" });
  assert.equal(await response.text(), "");
  response = await call(MCP + "/assets/app.js");
  assert.equal(response.headers.get("content-type"), "text/javascript", "Static files pass straight through to the assets binding");

  // Unexpected failures become a content-free 500.
  state.assetsFailure = new Error("secret detail sk_live_123");
  response = await call(AGENT + "/settings", { headers: { accept: "text/html", cookie: ownerCookie } });
  assert.equal(response.status, 500);
  const failure = await response.text();
  assert.equal(JSON.parse(failure).error, "internal_error");
  assert.ok(!failure.includes("sk_live_123"), "Exception text never reaches the client");
  assert.equal(response.headers.get("cache-control"), "no-store");
  state.assetsFailure = null;

  // Cron dispatch.
  const dispatched = async (cron: string) => {
    const start = pending.length;
    await worker.scheduled({ cron } as ScheduledController, env as never, ctx);
    return pending.length - start;
  };
  assert.equal(await dispatched("* * * * *"), 3, "Every minute: tasks, follow-up batches and Slack jobs");
  sql.prepare("INSERT INTO email_otp_deliveries(id,provider,status,attempted_at) VALUES('expired-otp','resend','sent',?)").run(new Date(Date.now()-33*86400000).toISOString());
  sql.prepare("INSERT INTO email_otp_deliveries(id,provider,status,attempted_at) VALUES('retained-otp','resend','sent',?)").run(new Date(Date.now()-30*86400000).toISOString());
  sql.prepare("INSERT INTO app_connections(id,user_id,provider,account_id,account_label,status,permissions_json,scopes_json,created_at,updated_at) VALUES('retention-cron','owner','gmail','cron','Cron','active','[]','[]',?,?)").run(now,now);
  sql.prepare("INSERT INTO app_calls(id,user_id,connection_id,connection_generation,operation,permission,request_id,input_hash,arguments_ciphertext,status,expires_at,created_at,updated_at) VALUES('retention-cron-call','owner','retention-cron',1,'messages.get','read','cron-read','cron-hash','expired-ciphertext','succeeded',?,?,?)").run(now,new Date(Date.now()-8*86400000).toISOString(),now);
  assert.equal(await dispatched("*/5 * * * *"), 9, "Every five minutes: tasks plus maintenance, including Google content and OTP capacity retention");
  env.AUDIT_ARCHIVE_ENABLED = "1";
  assert.equal(await dispatched("*/5 * * * *"), 10, "Audit archiving runs only when enabled");
  assert.equal(await dispatched("0 3 * * *"), 0, "Unknown schedules dispatch nothing");
  await Promise.all(pending);
  assert.equal(sql.prepare("SELECT arguments_ciphertext FROM app_calls WHERE id='retention-cron-call'").get()?.arguments_ciphertext,'');
  assert(sql.prepare("SELECT content_purged_at FROM app_calls WHERE id='retention-cron-call'").get()?.content_purged_at,'Actual scheduled handler purges expired Google contents');
  assert.equal(sql.prepare("SELECT id FROM email_otp_deliveries WHERE id='expired-otp'").get(),undefined);
  assert(sql.prepare("SELECT id FROM email_otp_deliveries WHERE id='retained-otp'").get(),'Cron retains the current monthly capacity history');
  console.log("PASS: Worker entry host partition, redirects, rate limits, session/device/OAuth gates, MCP pause, crawl files, HTML shells, 500 handling and cron dispatch");
} finally {
  sql.close();
}
