import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { setTimeout as pause } from "node:timers/promises";
import { pathToFileURL } from "node:url";

export async function verifyProduction({
  sha, version, installer, providers, fetcher = fetch,
  marketing = "https://remotearc.app", app = "https://mcp.remotearc.app", dashboard = "https://agent.remotearc.app", admin = "https://admin.remotearc.app",
}) {
  const checks = [];
  const read = async (url, expected = 200) => {
    const response = await fetcher(url, {method:"GET",redirect:"manual",headers:{"cache-control":"no-cache"},signal:AbortSignal.timeout(15_000)});
    if (response.status !== expected) throw new Error(url + ": expected HTTP " + expected + ", received " + response.status);
    checks.push(new URL(url).pathname + " " + response.status);
    return response;
  };
  const health = await (await read(app + "/health")).json();
  if (health.ok !== true || health.service !== "remotearc-relay" || health.version !== version) throw new Error("Production health/version mismatch.");
  if (sha && health.deployment !== sha) throw new Error("Production is not serving the requested deployment SHA.");
  let home;
  for (const path of ["/", "/zh", "/arc", "/zh/arc", "/docs", "/zh/docs", "/docs/connect", "/zh/docs/apps", "/docs/devices", "/integrations?category=docs_files", "/zh/integrations?category=docs_files", "/downloads", "/install/chatgpt"]) {
    const response = await read(marketing + path), html = await response.text();
    if (!(response.headers.get("content-type") || "").includes("text/html") || !html.includes('id="root"')) throw new Error(path + ": missing application HTML.");
    if (path === "/") home = html;
  }
  const assetPath = home.match(/<script\b[^>]*src="([^"]+)"/)?.[1];
  const asset = assetPath && new URL(assetPath, marketing);
  if (!asset || asset.origin !== marketing || !asset.pathname.startsWith("/assets/")) throw new Error("Homepage has no same-origin application bundle.");
  const js = await read(asset.href);
  if (!/(java|ecma)script/.test(js.headers.get("content-type") || "")) throw new Error("Application bundle returned the wrong content type.");
  const shell = await read(marketing + "/install.sh");
  const shellText = await shell.text();
  if (!(shell.headers.get("content-type") || "").includes("text/x-shellscript") || !shellText.startsWith("#!/bin/sh\n")) throw new Error("Native installer returned HTML or invalid shell content.");
  const digest = value => createHash("sha256").update(value).digest("hex");
  if (digest(shellText) !== digest(installer)) throw new Error("Published installer differs from this release.");
  // Existing MCP/OAuth clients retain their issuer, resources and device host.
  const oauth = await (await read(app + "/.well-known/oauth-authorization-server")).json();
  if (oauth.issuer !== app || oauth.authorization_endpoint !== app + "/oauth/authorize" ||
      oauth.token_endpoint !== app + "/oauth/token")
    throw new Error("MCP OAuth issuer changed during dashboard migration.");
  await read(dashboard + "/mcp", 404);
  await read(dashboard + "/oauth/authorize", 404);
  const status = await (await read(app + "/api/apps/status")).json();
  if (typeof status.enabled !== "boolean" || !Array.isArray(status.providers)) throw new Error("Malformed Apps readiness response.");
  const ids = status.providers.map(item => item.provider).sort();
  if (JSON.stringify(ids) !== JSON.stringify([...providers].sort()) || status.providers.some(item => typeof item.ready !== "boolean")) throw new Error("Apps readiness catalog differs from this release.");
  // Configuration readiness is deliberately separate from a successful real-account OAuth session.
  const legacy = await read(app + "/apps?category=docs_files", 302);
  if (legacy.headers.get("location") !== dashboard + "/apps?category=docs_files")
    throw new Error("Legacy dashboard did not redirect to the new host.");
  const signedOut = await read(dashboard + "/apps?category=docs_files", 302);
  const login = new URL(signedOut.headers.get("location") || "", dashboard);
  if (login.origin !== dashboard || login.pathname !== "/auth/login" ||
      login.searchParams.get("return_to") !== "/apps?category=docs_files")
    throw new Error("Signed-out Apps does not preserve its login destination.");
  const agentHome = await read(dashboard + "/overview");
  if (!(agentHome.headers.get("content-type") || "").includes("text/html"))
    throw new Error("Agent dashboard HTML unavailable.");
  const legacySettings = await read(app + "/settings", 302);
  if (legacySettings.headers.get("location") !== dashboard + "/settings")
    throw new Error("Legacy settings canonical redirect failed.");
  // Admin has a separate host and RBAC gate. Its public, signed-out behavior
  // and static UI delivery must work before declaring a production release healthy.
  const adminRedirect = await read(admin + "/", 302);
  const adminLogin = new URL(adminRedirect.headers.get("location") || "", admin);
  if (adminLogin.origin !== dashboard || adminLogin.pathname !== "/auth/login" ||
      adminLogin.searchParams.get("return_to") !== admin + "/")
    throw new Error("Admin sign-in/return flow has regressed.");
  const adminApi = await read(admin + "/api/me", 401);
  if (adminApi.headers.get("x-remote-arc-admin-contract") !== "1")
    throw new Error("Admin API service contract unavailable.");
  const adminBundle = await read(new URL(asset.pathname, admin).toString());
  if (!/(java|ecma)script/.test(adminBundle.headers.get("content-type") || ""))
    throw new Error("Admin JavaScript bundle unavailable.");
  await read(marketing + "/docs/unknown-release-check", 404);
  return {checks,configuredProviders:status.providers.filter(item=>item.ready).length,providerCount:providers.length,deployment:health.deployment || null};
}

export async function verifyWithRetry(options, { attempts = 6, intervalMs = 10_000, wait = pause, log = console.log } = {}) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try { return await verifyProduction(options); }
    catch (error) {
      if (attempt === attempts) throw error;
      log("Waiting for production rollout (" + attempt + "/" + attempts + "): " + error.message);
      await wait(intervalMs);
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const shaIndex = process.argv.indexOf("--sha");
    const sha = shaIndex >= 0 ? process.argv[shaIndex + 1] : undefined;
    if (shaIndex >= 0 && !/^[0-9a-f]{40}$/.test(sha || "")) throw new Error("--sha requires a full commit SHA.");
    const result = await verifyWithRetry({
      sha, version:JSON.parse(readFileSync(new URL("../packages/cli/package.json",import.meta.url))).version,
      installer:readFileSync(new URL("../apps/ui/public/install.sh",import.meta.url),"utf8"),
      providers:JSON.parse(readFileSync(new URL("../apps/ui/src/app-directory.json",import.meta.url))).apps.map(item=>item.provider),
    });
    console.log("PASS: production read-only checks\n" + JSON.stringify(result,null,2));
  } catch (error) { console.error("::error::" + error.message); process.exitCode = 1; }
}
