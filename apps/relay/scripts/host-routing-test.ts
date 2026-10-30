import assert from "node:assert/strict";
import { dashboardSignInUrl, legacyDashboardRedirect, protocolOnlyPath, publicWebsiteRedirect } from "../src/platform/host-routing.js";
import { safeReturnTo, sessionCookie } from "../src/auth/auth.js";
import { isTrustedDashboardMutation } from "../src/auth/dashboard-origin.js";

const marketing = "https://remotearc.app";
const app = "https://mcp.remotearc.app";
const dashboard = "https://agent.remotearc.app";
const route = (path: string, origin = app) => new URL(path, origin);

for (const path of [
  "/blogs", "/blogs/why-i-built-remote-arc", "/docs", "/docs/mcp",
  "/install/chatgpt", "/install/claude", "/use-cases/remote-development",
  "/integrations?category=docs_files", "/zh/integrations?provider=notion", "/pricing", "/downloads", "/releases", "/security-model",
  "/zh", "/zh/docs", "/zh/pricing", "/zh/install/chatgpt",
  "/zh/blogs", "/zh/blogs/how-remote-arc-works", "/zh/use-cases",
  "/zh/use-cases/remote-development", "/zh/security-model", "/zh/releases",
  "/connect-ai", "/chatgpt-computer-access", "/remote-mcp",
]) {
  assert.equal(publicWebsiteRedirect(route(path), "GET", marketing), marketing + path, "public route " + path);
}
assert.equal(publicWebsiteRedirect(route("/blogs?lang=zh"), "GET", marketing), marketing + "/blogs?lang=zh");
assert.equal(publicWebsiteRedirect(route("/docs"), "POST", marketing), null, "never redirect non-GET methods");
assert.equal(publicWebsiteRedirect(route("/docs", marketing), "GET", marketing), null, "never redirect main website to itself");

for (const path of [
  "/", "/health", "/auth/login", "/auth/google", "/auth/google/callback",
  "/auth/email/request", "/oauth/authorize", "/oauth/consent", "/oauth/token",
  "/.well-known/oauth-authorization-server", "/mcp", "/agent", "/api/me",
  "/assets/app.js", "/device", "/hooks/automations/one/two",
]) {
  assert.equal(publicWebsiteRedirect(route(path), "GET", marketing), null, "system route must stay on app: " + path);
}
// The old domain keeps its protocol and API identity; only webpage links migrate.
for (const path of ["/", "/dashboard", "/overview", "/devices", "/apps",
  "/automations", "/connect", "/security", "/settings", "/device"]) {
  const destination = path === "/" || path === "/dashboard" ? "/overview" : path;
  assert.equal(legacyDashboardRedirect(route(path), "GET", app, dashboard),
    dashboard + destination, "old page " + path);
}
assert.equal(legacyDashboardRedirect(route("/settings?tab=workspaces"), "GET", app, dashboard),
  dashboard + "/settings?tab=workspaces");
assert.equal(legacyDashboardRedirect(route("/devices"), "HEAD", app, dashboard), dashboard + "/devices");
for (const path of ["/mcp", "/mcp/", "/agent", "/oauth/authorize", "/oauth/consent",
  "/oauth/token", "/.well-known/oauth-authorization-server",
  "/api/me", "/api/device/start", "/auth/google", "/auth/google/callback", "/api/apps"]) {
  assert.equal(legacyDashboardRedirect(route(path), "GET", app, dashboard), null,
    "protocol/API route untouched: " + path);
}
assert.equal(legacyDashboardRedirect(route("/settings"), "POST", app, dashboard), null);
assert.equal(legacyDashboardRedirect(route("/settings",dashboard), "GET", app, dashboard), null);
assert.equal(legacyDashboardRedirect(route("/settings"), "GET", app, app), null);
for (const path of ["/mcp", "/mcp/", "/agent", "/oauth/authorize", "/oauth/consent",
  "/.well-known/oauth-protected-resource/mcp"]) assert.equal(protocolOnlyPath(path), true, path);
for (const path of ["/auth/login", "/auth/google", "/api/me", "/api/organizations",
  "/settings", "/device"]) assert.equal(protocolOnlyPath(path), false, path);

// The new UI is the only canonical dashboard login origin.
assert.equal(dashboardSignInUrl(route("/overview", dashboard), "GET", dashboard), null);
for (const path of ["/apps", "/devices", "/automations", "/connect", "/security", "/settings", "/checkout"]) {
  assert.equal(dashboardSignInUrl(route(path,dashboard), "GET", dashboard),
    dashboard + "/auth/login?return_to=" + encodeURIComponent(path));
}
assert.equal(dashboardSignInUrl(route("/apps?provider=notion",dashboard), "GET", dashboard),
  dashboard + "/auth/login?return_to=" + encodeURIComponent("/apps?provider=notion"));
assert.equal(dashboardSignInUrl(route("/settings",app), "GET", dashboard), null);
assert.equal(dashboardSignInUrl(route("/settings",dashboard), "POST", dashboard), null);
assert.equal(dashboardSignInUrl(route("/oauth/consent",dashboard), "GET", dashboard), null);
assert.equal(publicWebsiteRedirect(route("/docs",dashboard), "GET", marketing),
  marketing + "/docs");
const authEnv = { PUBLIC_ORIGIN: app, APP_ORIGIN: app, DASHBOARD_ORIGIN: dashboard,
  MARKETING_ORIGIN: marketing } as Parameters<typeof safeReturnTo>[2];
assert.equal(safeReturnTo(dashboard + "/settings", new Request(app + "/auth/login"), authEnv),
  dashboard + "/settings", "MCP-side login may return to the new dashboard");
assert.equal(safeReturnTo("https://attacker.invalid/", new Request(app + "/auth/login"), authEnv),
  app + "/", "Cross-site redirects remain blocked");
assert.match(sessionCookie("test-token"), /Domain=\.remotearc\.app/, "Sessions span first-party subdomains");
const mutationEnv = { PUBLIC_ORIGIN: app, APP_ORIGIN: app, DASHBOARD_ORIGIN: dashboard };
const mutation = (host: string, origin?: string) => new Request(host + "/api/organizations", {
  method: "POST", headers: origin ? { origin } : {}, body: "{}",
});
assert.equal(isTrustedDashboardMutation(mutation(app, app), mutationEnv), true, "Legacy web mutations still work");
assert.equal(isTrustedDashboardMutation(mutation(dashboard, dashboard), mutationEnv), true, "New web mutations work");
assert.equal(isTrustedDashboardMutation(mutation(dashboard, app), mutationEnv), false, "Cross-subdomain CSRF blocked");
assert.equal(isTrustedDashboardMutation(mutation(app, dashboard), mutationEnv), false, "Reverse CSRF blocked");
assert.equal(isTrustedDashboardMutation(mutation(dashboard, marketing), mutationEnv), false, "Marketing origin not a mutation source");
assert.equal(isTrustedDashboardMutation(mutation(dashboard), mutationEnv), false, "Origin required");
assert.equal(isTrustedDashboardMutation(mutation(marketing, marketing), mutationEnv), false, "Untrusted host blocked");
console.log("PASS: agent dashboard routing, shared session, safe mutations, legacy web redirects and unchanged MCP/OAuth/device boundary");
