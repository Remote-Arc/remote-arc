/** Allow cookie-authenticated mutations only from the same first-party dashboard host.
 * Both the new control center and the legacy MCP host remain trusted during migration.
 * Requiring Origin to match the request host prevents cross-subdomain CSRF.
 */
export type DashboardOriginEnv = {
  PUBLIC_ORIGIN: string;
  APP_ORIGIN?: string;
  DASHBOARD_ORIGIN?: string;
};

export function isTrustedDashboardMutation(request: Request, env: DashboardOriginEnv): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  const requestOrigin = new URL(request.url).origin;
  if (origin !== requestOrigin) return false;
  const accepted = [env.DASHBOARD_ORIGIN, env.APP_ORIGIN || env.PUBLIC_ORIGIN].filter(
    (value): value is string => Boolean(value),
  );
  return accepted.some(value => new URL(value).origin === requestOrigin);
}
