/**
 * Restrict the future admin.remotearc.app hostname before routing into the
 * shared relay. The Admin host never exposes OAuth, MCP, agent or public APIs.
 * All permitted admin APIs independently check the signed-in user's role.
 */
export function allowOnAdminHost(request: Request): boolean {
  const url = new URL(request.url);
  if (url.hostname !== "admin.remotearc.app") return true;
  const path = url.pathname;
  const method = request.method;
  if (path === "/api/me") return method === "GET";
  const api = [
    "/api/monitor",
    "/api/admin/arc-interest",
    "/api/admin/operations",
    "/api/admin/billing",
    "/api/admin/call-credits",
    "/api/admin/plan-grants",
  ];
  if (api.includes(path) || /^\/api\/admin\/plan-grants\/[^/]+\/revoke$/.test(path)) {
    return ["GET", "POST", "PATCH"].includes(method);
  }
  if (method !== "GET" && method !== "HEAD") return false;
  if (path === "/" || path === "/admin-console") return true;
  if (path.startsWith("/assets/")) return true;
  return /^\/[a-zA-Z0-9_-]+\.(?:svg|png|webp|woff2|ico)$/.test(path);
}
