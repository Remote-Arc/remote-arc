import { isChineseMarketingPath } from "../site/marketing-locale.js";

/**
 * Public product pages have one canonical home: remotearc.app.
 * agent.remotearc.app hosts the dashboard; mcp.remotearc.app retains MCP/OAuth and device APIs.
 */
const publicPrefixes = [
  "/blogs",
  "/docs",
  "/install",
  "/use-cases",
] as const;

const publicExactPaths = new Set([
  "/integrations",
  "/arc",
  "/roadmap",
  "/pricing",
  "/early-access",
  "/feedback",
  "/downloads",
  "/releases",
  "/demo",
  "/connect-ai",
  "/remote-mcp",
  "/chatgpt-computer-access",
  "/claude-computer-access",
  "/mcp-computer-access",
  "/chrome-extension",
  "/security-model",
  "/privacy",
  "/terms",
  "/support",
  "/resources",
]);

const dashboardPaths = new Set([
  "/overview", "/devices", "/apps", "/automations", "/connect",
  "/security", "/settings", "/checkout", "/monitor",
]);

export function publicWebsiteRedirect(
  requestUrl: URL,
  method: string,
  marketingOrigin: string,
): string | null {
  if (requestUrl.hostname !== "mcp.remotearc.app" && requestUrl.hostname !== "agent.remotearc.app") return null;
  if (method !== "GET" && method !== "HEAD") return null;
  const path = requestUrl.pathname;
  if (!isChineseMarketingPath(path) && !publicExactPaths.has(path) && !publicPrefixes.some((prefix) => path === prefix || path.startsWith(prefix + "/"))) {
    return null;
  }
  return new URL(path + requestUrl.search, marketingOrigin).toString();
}


/** Move only top-level dashboard documents, never MCP, OAuth or device endpoints. */
export function legacyDashboardRedirect(
  url: URL, method: string, mcpOrigin: string, dashboardOrigin: string,
): string | null {
  if (new URL(mcpOrigin).origin === new URL(dashboardOrigin).origin) return null;
  if (url.origin !== new URL(mcpOrigin).origin || (method !== "GET" && method !== "HEAD")) return null;
  const pages = new Set(["/", "/dashboard", ...dashboardPaths, "/device"]);
  if (!pages.has(url.pathname)) return null;
  const next = url.pathname === "/" || url.pathname === "/dashboard" ? "/overview" : url.pathname;
  return new URL(next + url.search, dashboardOrigin).toString();
}

/** Protocol resources remain bound to the original MCP issuer. */
export function protocolOnlyPath(path: string): boolean {
  return path === "/mcp" || path.startsWith("/mcp/") ||
    path === "/agent" || path.startsWith("/oauth/") ||
    path.startsWith("/.well-known/");
}

export function dashboardSignInUrl(
  requestUrl: URL,
  method: string,
  appOrigin: string,
): string | null {
  if (requestUrl.hostname !== new URL(appOrigin).hostname) return null;
  if (method !== "GET" && method !== "HEAD") return null;
  if (!dashboardPaths.has(requestUrl.pathname) || requestUrl.pathname === "/overview") return null;
  const signIn = new URL("/auth/login", appOrigin);
  signIn.searchParams.set("return_to", requestUrl.pathname + requestUrl.search);
  return signIn.toString();
}
