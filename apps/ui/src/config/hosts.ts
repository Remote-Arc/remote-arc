// Which product surface a hostname serves. Production hostnames are the
// defaults; the staging build sets VITE_*_ORIGIN so its own hosts are
// recognised. Unset values keep production behaviour unchanged.

export type HostEnv = {
  VITE_MARKETING_ORIGIN?: string;
  VITE_APP_ORIGIN?: string;
  VITE_ADMIN_ORIGIN?: string;
  VITE_MCP_ORIGIN?: string;
};

export type ProductHostnames = {
  marketing: string;
  app: string;
  admin: string;
  mcp: string;
};

export function productHosts(env: HostEnv) {
  const origin = (value: string | undefined, fallback: string) =>
    new URL(value?.trim() || fallback).origin;
  const origins = {
    marketing: origin(env.VITE_MARKETING_ORIGIN, "https://remotearc.app"),
    app: origin(env.VITE_APP_ORIGIN, "https://agent.remotearc.app"),
    admin: origin(env.VITE_ADMIN_ORIGIN, "https://admin.remotearc.app"),
    mcp: origin(env.VITE_MCP_ORIGIN, "https://mcp.remotearc.app"),
  };
  const hostnames: ProductHostnames = {
    marketing: new URL(origins.marketing).hostname,
    app: new URL(origins.app).hostname,
    admin: new URL(origins.admin).hostname,
    mcp: new URL(origins.mcp).hostname,
  };
  const is = (key: keyof ProductHostnames) => (hostname: string) => hostname === hostnames[key];
  const isDashboardHost = is("app"),
    isAdminHost = is("admin"),
    isMcpHost = is("mcp");
  return {
    origins,
    hostnames,
    isMarketingHost: is("marketing"),
    isDashboardHost,
    isAdminHost,
    /** Signed-in product surfaces: the dashboard and admin. */
    isProductHost: (hostname: string) => isDashboardHost(hostname) || isAdminHost(hostname),
    /** Hosts that render the dashboard theme: MCP, dashboard and admin. */
    isConsoleHost: (hostname: string) =>
      isDashboardHost(hostname) || isAdminHost(hostname) || isMcpHost(hostname),
  };
}

// The cast also compiles where Vite's ImportMeta types are not loaded (tests/site).
const hosts = productHosts((import.meta as { env?: HostEnv }).env ?? {});

export const ORIGINS = hosts.origins;
export const HOSTNAMES = hosts.hostnames;
export const { isMarketingHost, isDashboardHost, isAdminHost, isProductHost, isConsoleHost } =
  hosts;
