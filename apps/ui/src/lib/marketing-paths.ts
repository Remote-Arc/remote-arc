import { isWebsiteLocation } from "./website-origin.js";
import { SKILL_USE_CASES } from "../../../../packages/docs/src/skill-use-cases.js";
import { DOC_PATHS } from "../../../../packages/docs/src/catalog.js";
export type SiteLocale = "en" | "zh";
/** Synced with the public SEO route allowlist. */
export const chinesePages = new Set([
  ...DOC_PATHS,
  ...SKILL_USE_CASES.map((item) => "/use-cases/" + item.slug),
  "/privacy",
  "/terms",
  "/support",
  "/remote-mcp",
  "/connect-ai",
  "/chrome-extension",
  "/",
  "/install/chatgpt",
  "/install/claude",
  "/install/gemini",
  "/install/cursor",
  "/docs",
  "/docs/mcp",
  "/docs/long-running-work",
  "/integrations",
  "/pricing",
  "/downloads",
  "/arc",
  "/roadmap",
  "/feedback",
  "/early-access",
  "/blogs",
  "/blogs/from-code-to-intent-driven-computing",
  "/blogs/go-vs-typescript-agent-benchmarks",
  "/blogs/why-i-built-remote-arc",
  "/blogs/remote-arc-vs-openclaw",
  "/blogs/powerful-ai-access-without-exposing-your-computer",
  "/blogs/how-remote-arc-works",
  "/use-cases",
  "/security-model",
  "/releases",
  "/use-cases/remote-development",
  "/use-cases/file-organization",
  "/use-cases/disk-space-cleanup",
  "/use-cases/overnight-goals",
  "/use-cases/long-running-jobs",
  "/use-cases/scheduled-checks",
  "/use-cases/ci-follow-up",
  "/use-cases/data-work",
  "/use-cases/home-lab",
  "/use-cases/browser-research",
  "/use-cases/remote-support",
  "/use-cases/presentation-deck",
  "/use-cases/spreadsheet-report",
  "/use-cases/desktop-automation",
  "/use-cases/cross-device-handoff",
  "/use-cases/job-applications",
]);
// Public PR previews serve the same marketing pages as the production website.
export const isWebsite = () => isWebsiteLocation(location.hostname, location.port);
export function baseMarketingPath(path: string): string {
  return path === "/zh" ? "/" : path.startsWith("/zh/") ? path.slice(3) : path;
}
export function pageForLanguage(path: string, locale: SiteLocale): string {
  const base = baseMarketingPath(path);
  return locale === "zh" && chinesePages.has(base) ? (base === "/" ? "/zh" : "/zh" + base) : base;
}
export function localizedWebsiteHref(href: string, locale: SiteLocale): string {
  if (!href.startsWith("/") || href.startsWith("//")) return href;
  const url = new URL(href, window.location.origin);
  return pageForLanguage(url.pathname, locale) + url.search + url.hash;
}
