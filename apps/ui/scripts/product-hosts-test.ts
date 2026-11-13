// The UI chooses the website, dashboard or admin by hostname. Production
// hostnames stay the default; a staging build passes its own origins and must
// get the same surfaces on its hosts and none on production hosts.
import assert from "node:assert/strict";
import { HOSTNAMES, productHosts } from "../src/config/hosts.js";
import { chooseLocaleSurface } from "../src/locales/locale-preference.js";
import { isWebsiteLocation } from "../src/lib/website-origin.js";

const production = productHosts({});
assert.deepEqual(production.origins, {
  marketing: "https://remotearc.app",
  app: "https://agent.remotearc.app",
  admin: "https://admin.remotearc.app",
  mcp: "https://mcp.remotearc.app",
});
assert.deepEqual(production.hostnames, {
  marketing: "remotearc.app",
  app: "agent.remotearc.app",
  admin: "admin.remotearc.app",
  mcp: "mcp.remotearc.app",
});
assert.equal(production.isDashboardHost("agent.remotearc.app"), true);
assert.equal(production.isAdminHost("admin.remotearc.app"), true);
assert.equal(production.isProductHost("mcp.remotearc.app"), false);
assert.equal(production.isConsoleHost("mcp.remotearc.app"), true);
assert.equal(production.isConsoleHost("remotearc.app"), false);

const staging = productHosts({
  VITE_MARKETING_ORIGIN: "https://staging.remotearc.app",
  VITE_APP_ORIGIN: "https://staging-agent.remotearc.app/",
  VITE_ADMIN_ORIGIN: " https://staging-admin.remotearc.app ",
  VITE_MCP_ORIGIN: "https://staging-mcp.remotearc.app",
});
assert.equal(staging.origins.app, "https://staging-agent.remotearc.app");
assert.equal(staging.origins.admin, "https://staging-admin.remotearc.app");
assert.equal(staging.isMarketingHost("staging.remotearc.app"), true);
assert.equal(staging.isDashboardHost("staging-agent.remotearc.app"), true);
assert.equal(staging.isAdminHost("staging-admin.remotearc.app"), true);
assert.equal(staging.isProductHost("staging-agent.remotearc.app"), true);
assert.equal(staging.isConsoleHost("staging-mcp.remotearc.app"), true);
for (const host of ["agent.remotearc.app", "admin.remotearc.app", "mcp.remotearc.app"]) {
  assert.equal(staging.isConsoleHost(host), false, "staging build must not claim " + host);
}
assert.throws(() => productHosts({ VITE_APP_ORIGIN: "not a url" }));

// The default (unset) build keeps production surfaces in its callers.
assert.deepEqual(HOSTNAMES, production.hostnames);
assert.equal(chooseLocaleSurface("/", "admin.remotearc.app", false, [], HOSTNAMES), "admin");
assert.equal(chooseLocaleSurface("/", "agent.remotearc.app", false, [], HOSTNAMES), "dashboard");
assert.equal(isWebsiteLocation("remotearc.app", "", HOSTNAMES), true);
assert.equal(isWebsiteLocation("agent.remotearc.app", "", HOSTNAMES), false);

// vite.config.ts copies both functions into the locale preloader with
// toString(), where no module scope exists. Run them the same way so a call to
// an imported helper fails here instead of in every visitor's browser.
const standalone = <T>(fn: T): T => new Function("return " + String(fn))() as T;
const preloadWebsite = standalone(isWebsiteLocation);
const preloadSurface = standalone(chooseLocaleSurface);
for (const [hosts, website, dashboard, admin] of [
  [production.hostnames, "remotearc.app", "agent.remotearc.app", "admin.remotearc.app"],
  [
    staging.hostnames,
    "staging.remotearc.app",
    "staging-agent.remotearc.app",
    "staging-admin.remotearc.app",
  ],
] as const) {
  assert.equal(preloadWebsite(website, "", hosts), true, website + " is the website");
  assert.equal(preloadWebsite(dashboard, "", hosts), false, dashboard + " is not the website");
  assert.equal(preloadWebsite("localhost", "5173", hosts), true, "local dev serves the website");
  assert.equal(preloadSurface("/", admin, false, [], hosts), "admin");
  assert.equal(preloadSurface("/", dashboard, false, [], hosts), "dashboard");
  assert.equal(preloadSurface("/", website, false, [], hosts), "website");
}
assert.equal(
  preloadSurface("/", "agent.remotearc.app", false, [], staging.hostnames),
  "website",
  "a staging preloader must not claim the production dashboard",
);

console.log(
  "PASS: production hostnames stay the default, a staging build recognises only its own website, dashboard, admin and MCP hosts, malformed origins fail, and the inlined locale preloader functions run without module scope",
);
