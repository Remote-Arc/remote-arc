export type SiteLocale = "en" | "zh";
/** Synced with the public SEO route allowlist. */
export const chinesePages = new Set([
 "/", "/install/chatgpt", "/install/claude", "/install/gemini", "/install/cursor",
 "/docs", "/docs/mcp", "/docs/long-running-work", "/pricing", "/downloads", "/arc", "/roadmap",
 "/blogs",
 "/blogs/go-vs-typescript-agent-benchmarks",
 "/blogs/why-i-built-remote-arc",
 "/blogs/remote-arc-vs-openclaw",
 "/blogs/powerful-ai-access-without-exposing-your-computer",
 "/blogs/how-remote-arc-works",
 "/use-cases", "/security-model", "/releases",
 "/use-cases/remote-development", "/use-cases/file-organization",
 "/use-cases/disk-space-cleanup", "/use-cases/overnight-goals",
 "/use-cases/long-running-jobs", "/use-cases/scheduled-checks",
 "/use-cases/ci-follow-up", "/use-cases/data-work",
 "/use-cases/home-lab", "/use-cases/browser-research",
 "/use-cases/remote-support", "/use-cases/presentation-deck",
 "/use-cases/spreadsheet-report", "/use-cases/desktop-automation",
 "/use-cases/cross-device-handoff"
]);
// Public PR previews serve the same marketing pages as the production website.
const isMarketingPreview = (hostname: string) => /^pr-[0-9]+-remote-arc-ui-preview[.]nzp[.]workers[.]dev$/.test(hostname);
export const isWebsite = () =>
  location.hostname === "remotearc.app" ||
  location.hostname === "www.remotearc.app" ||
  isMarketingPreview(location.hostname) ||
  ((location.hostname === "localhost" || location.hostname === "127.0.0.1") && Boolean(location.port));
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
