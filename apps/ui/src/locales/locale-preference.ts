import { DASHBOARD_PATHS, LEGACY_DASHBOARD_PATHS } from "../lib/dashboard-workspaces.js";
import { isWebsiteLocation } from "../lib/website-origin.js";
import type { Locale, LocaleSurface } from "./locale-catalog.js";

export const LOCALE_KEY = "remotearc-locale-v2";
export const workspacePaths = [
  ...Object.values(DASHBOARD_PATHS),
  ...Object.keys(LEGACY_DASHBOARD_PATHS),
  "/admin-preview",
  "/checkout",
  "/device",
];

export function chooseLocale(
  pathname: string,
  search: string,
  saved: string | null,
  preferred: string | undefined,
  website: boolean,
  workspaceRoutes: readonly string[],
): Locale {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (website && !workspaceRoutes.includes(path) && !path.startsWith("/dashboard/browser/"))
    return path === "/zh" || path.startsWith("/zh/") ? "zh" : "en";
  const requested = new URLSearchParams(search).get("lang")?.toLowerCase();
  if (requested === "zh" || requested === "zh-cn" || requested === "zh-hans") return "zh";
  if (requested === "en") return "en";
  if (saved === "en" || saved === "zh") return saved;
  return /^zh(?:-|$)/i.test(preferred || "") ? "zh" : "en";
}

export function initialLocale(): Locale {
  let saved = null;
  try {
    saved = localStorage.getItem(LOCALE_KEY);
  } catch {
    // Storage can be disabled.
  }
  return chooseLocale(
    location.pathname,
    window.location.search,
    saved,
    typeof navigator === "undefined" ? "" : navigator.languages?.[0] || navigator.language,
    isWebsiteLocation(location.hostname, location.port),
    workspacePaths,
  );
}

export function chooseLocaleSurface(
  pathname: string,
  hostname: string,
  preview: boolean,
  workspaceRoutes: readonly string[],
): LocaleSurface {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (hostname === "admin.remotearc.app" || (preview && path === "/admin-preview")) return "admin";
  const dashboardHost = hostname === "agent.remotearc.app";
  if (
    (dashboardHost || preview) &&
    ((dashboardHost && path === "/") ||
      (workspaceRoutes.includes(path) && path !== "/admin-preview") ||
      /^\/dashboard\/browser\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]{1,100}$/.test(path) ||
      /^\/secret\/sec_[a-z2-7]{24}$/.test(path))
  )
    return "dashboard";
  return "website";
}
