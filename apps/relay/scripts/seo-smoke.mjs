import {ARC_USE_CASES,useCaseSlugs} from "../../../packages/docs/src/arc-use-cases.ts";
import { DOC_TOPICS } from "../../../packages/docs/src/catalog.ts";
import assert from "node:assert/strict";
import {chineseSeo} from '../src/zh-seo.ts';
import { legacyLanguageRedirect, localizedPages } from "../src/marketing-locale.ts";
import { chinesePages, pageForLanguage } from "../../ui/src/marketing-paths.ts";
import { chineseResourceSeo } from "../src/zh-resources.ts";
import { releaseChinese } from "../../ui/src/release-locales.ts";
import { readFileSync } from "node:fs";
import {
  canonicalForPath,
  feedXml,
  llmsTxt,
  llmsFullTxt,
  marketingHttpsRedirect,
  marketingStatusCode,
  renderMarketingHtml,
  robotsTxt,
  sitemapXml,
} from "../src/seo.ts";

// Marketing HTTP URLs must redirect to HTTPS without altering other hosts.
for (const path of ["/", "/docs", "/zh/blogs", "/sitemap.xml", "/a%20b?utm_source=test"]) {
  const input = new URL("http://remotearc.app" + path);
  assert.equal(marketingHttpsRedirect(input), "https://remotearc.app" + path);
}
assert.equal(marketingHttpsRedirect(new URL("https://remotearc.app/docs")), null);
assert.equal(marketingHttpsRedirect(new URL("http://mcp.remotearc.app/mcp")), null);
assert.equal(marketingHttpsRedirect(new URL("http://www.remotearc.app/docs")), null);
assert.equal(marketingHttpsRedirect(new URL("http://example.com/docs")), null);
assert.equal(marketingHttpsRedirect(new URL("http://remotearc.app//outside.example/path")),
  "https://remotearc.app//outside.example/path");

const wranglerConfig = readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8");
assert.ok(wranglerConfig.includes('"/*"'), "all document routes must run through the Worker before SPA asset fallback");
assert.ok(wranglerConfig.includes('"!/assets/*"'), "hashed assets should stay on the free static-asset path");
assert.ok(wranglerConfig.includes('"!/demos/*"'), "large demo media should bypass the Worker");

const known = [
  "/",
  "/integrations",
  "/downloads",
  "/arc",
  "/roadmap",
  "/early-access",
  "/feedback",
  "/install/chatgpt",
  "/install/claude",
  "/install/gemini",
  "/install/cursor",
  "/chatgpt-computer-access",
  "/claude-computer-access",
  "/mcp-computer-access",
  "/remote-mcp",
  "/docs",
  "/docs/mcp",
  "/blogs/go-vs-typescript-agent-benchmarks",
  "/chrome-extension",
  "/security-model",
  "/use-cases/disk-space-cleanup",
  "/use-cases/browser-research",
  "/use-cases/job-applications",
  "/use-cases/presentation-deck",
  "/use-cases/spreadsheet-report",
  "/use-cases/desktop-automation",
  "/use-cases/cross-device-handoff",
];

for (const path of known) {
  assert.equal(marketingStatusCode(path), 200, path + " should be indexable");
  assert.ok(canonicalForPath(path)?.startsWith("https://remotearc.app/"), path + " should have a canonical URL");
}
assert.equal(marketingStatusCode("/definitely-not-a-real-page"), 404);
assert.equal(canonicalForPath("/definitely-not-a-real-page"), null);

// Homepage SEO must match the actual product position and expose distinct
// destinations to search crawlers and users; Google decides whether to show sitelinks.
const homepageTemplate = readFileSync(new URL("../../ui/index.html", import.meta.url), "utf8");
const homepageTitle = "Remote Arc — AI Computer Access, Browser Automation &amp; Device Fleet";
assert.ok(homepageTemplate.includes("<title>" + homepageTitle + "</title>"));
const homeHtml = renderMarketingHtml(homepageTemplate, "/");
assert.ok(homeHtml.includes("<title>" + homepageTitle + "</title>"));
assert.ok(homeHtml.includes("browser workflows and dispatch eligible work"));
for (const path of ["/connect-ai", "/integrations", "/arc", "/pricing", "/docs", "/security-model"]) {
  assert.ok(homeHtml.includes('href="' + path + '"'), "homepage should link directly to " + path);
  assert.ok(sitemapXml().includes("<loc>https://remotearc.app" + path + "</loc>"));
}
assert.ok(homeHtml.includes("Arc Agent"));
assert.ok(!homeHtml.includes("coming soon"), "homepage must reflect the current Arc release");
assert.ok(homeHtml.includes("https://github.com/Remote-Arc/remote-arc"));
assert.ok(sitemapXml().includes("<lastmod>2026-10-24</lastmod>"), "homepage changed on Oct 24");
const homepageSchema = homeHtml.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1];
assert.ok(homepageSchema, "homepage structured data should be published");
const graph = JSON.parse(homepageSchema)["@graph"];
assert.equal(graph.find(entry => entry["@type"] === "WebSite")?.hasPart?.length, 6);
for (const type of ["WebSite", "Organization"]) {
  assert.ok(graph.find(entry => entry["@type"] === type)?.alternateName.includes("RemoteArc"), type + " must associate the unspaced brand name");
}

const blogPath = "/blogs/go-vs-typescript-agent-benchmarks";
const blogHtml = renderMarketingHtml('<html><head><title>Remote Arc</title></head><body><div id="root"></div></body></html>', blogPath);
assert.ok(blogHtml.includes("Windows: the regression and its correction"), "SSR article must contain test caveats");
assert.ok(blogHtml.includes("2026-10-09T00:00:00Z"), "article publication date must match the new post");
assert.ok(blogHtml.includes("RESULTS-2026-10-09-71cde96.md"), "SSR article must link newer source");
assert.ok(feedXml().includes(blogPath), "RSS must contain benchmark article");
assert.ok(feedXml().includes("Fri, 09 Oct 2026 00:00:00 GMT"), "RSS date must be truthful");
const sitemap = sitemapXml();
for (const path of known) {
  assert.ok(sitemap.includes("https://remotearc.app" + path), "sitemap missing " + path);
}
const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]);
assert.equal(new Set(locs).size, locs.length, "sitemap URLs must be unique");

// Client routes and search-indexed paths must stay in sync.
assert.deepEqual([...chinesePages].sort(), [...localizedPages].sort());
assert.equal(pageForLanguage("/", "zh"), "/zh");
assert.equal(pageForLanguage("/docs/mcp", "zh"), "/zh/docs/mcp");
assert.equal(pageForLanguage("/arc", "zh"), "/zh/arc");
assert.equal(pageForLanguage("/roadmap", "zh"), "/zh/roadmap");
assert.equal(pageForLanguage("/feedback", "zh"), "/zh/feedback");
assert.equal(pageForLanguage("/early-access", "zh"), "/zh/early-access");
assert.equal(pageForLanguage("/zh/pricing", "en"), "/pricing");
assert.equal(pageForLanguage("/blogs/why-i-built-remote-arc", "zh"), "/zh/blogs/why-i-built-remote-arc");
// Each translated page must be independently indexable and paired with English.
for (const path of ["/zh", "/zh/integrations", "/zh/docs", "/zh/docs/mcp", "/zh/docs/long-running-work",
  "/zh/install/chatgpt", "/zh/install/claude", "/zh/install/gemini", "/zh/install/cursor", "/zh/pricing", "/zh/downloads", "/zh/arc", "/zh/roadmap", "/zh/feedback", "/zh/early-access"]) {
  assert.equal(marketingStatusCode(path), 200, path + " should be indexable");
  assert.equal(canonicalForPath(path), "https://remotearc.app" + path);
  assert.ok(sitemap.includes("https://remotearc.app" + path), "sitemap missing " + path);
}
assert.equal(marketingStatusCode("/zh/blogs"), 200, "translated blog index must be indexable");
assert.equal(marketingStatusCode("/zh/blogs/unknown-article"), 404, "unknown Chinese blog article must stay 404");
assert.equal(legacyLanguageRedirect(new URL("https://remotearc.app/docs?lang=zh&ref=abc")), "/zh/docs?ref=abc");
assert.equal(legacyLanguageRedirect(new URL("https://remotearc.app/zh/pricing?lang=en")), "/pricing");
assert.equal(legacyLanguageRedirect(new URL("https://remotearc.app/blogs?lang=zh")), "/zh/blogs");
assert.equal(legacyLanguageRedirect(new URL("https://remotearc.app/docs?lang=fr")), null);
const zhHome = renderMarketingHtml('<html lang="en"><head><title>Remote Arc</title></head><body><div id="root"></div></body></html>', "/zh");
assert.ok(zhHome.includes('lang="zh-CN"'));
assert.ok(zhHome.includes('hreflang="zh-CN"'));
assert.ok(zhHome.includes('hreflang="en"'));
assert.ok(zhHome.includes('href="https://remotearc.app/zh"'));
assert.ok(zhHome.includes("别让 AI 只停留在聊天"));
const zhDocs = renderMarketingHtml('<html lang="en"><head><title>Remote Arc</title></head><body><div id="root"></div></body></html>', "/zh/docs");
assert.ok(zhDocs.includes("Remote Arc 中文文档"));
assert.ok(zhDocs.includes("权限与安全边界"));
assert.ok(sitemap.includes('xmlns:xhtml="http://www.w3.org/1999/xhtml"'));
assert.ok(sitemap.includes('hreflang="zh-CN"'));

// All Resources links and detail pages must have real Chinese URL, metadata,
// server-visible Chinese content, and reciprocal English/Chinese alternates.
const resourcePaths = Object.keys(chineseResourceSeo);
assert.equal(resourcePaths.length, useCaseSlugs.length + 9, "Resources needs every use-case detail plus blog, security and release pages");
for (const base of resourcePaths) {
  const path = "/zh" + base;
  assert.ok(localizedPages.includes(base), "missing localized route: " + base);
  assert.equal(marketingStatusCode(path), 200, path + " must be indexable");
  assert.equal(canonicalForPath(path), "https://remotearc.app" + path);
  assert.ok(sitemap.includes("<loc>https://remotearc.app" + path + "</loc>"), path + " must be in the sitemap");
  assert.ok(pageForLanguage(base, "zh") === path, "frontend URL mismatch for " + base);
  const html = renderMarketingHtml('<html lang="en"><head><title>Remote Arc</title><link rel="canonical" href="https://remotearc.app/" /></head><body><div id="root"></div></body></html>', path);
  assert.match(html, /<html lang="zh-CN"/);
  assert.ok(html.includes('<link rel="canonical" href="https://remotearc.app' + path + '"'), "wrong Chinese canonical: " + path);
  assert.ok(html.includes('hreflang="en"') && html.includes('hreflang="zh-CN"'), "incomplete language alternates: " + path);
  assert.ok(html.includes(chineseResourceSeo[base].h1) || html.includes(chineseResourceSeo[base].title), "missing Chinese content: " + path);
}
const zhBlogIndex = renderMarketingHtml('<html lang="en"><head><title>Remote Arc</title></head><body><div id="root"></div></body></html>', "/zh/blogs");
assert.ok(zhBlogIndex.includes("/zh/blogs/why-i-built-remote-arc"));
assert.ok(zhBlogIndex.includes("为什么我做"));
const zhBlogArticle = renderMarketingHtml('<html lang="en"><head><title>Remote Arc</title></head><body><div id="root"></div></body></html>', "/zh/blogs/how-remote-arc-works");
assert.ok(zhBlogArticle.includes("本地 Agent"));
assert.ok(zhBlogArticle.includes("第五步"));
assert.ok(zhBlogArticle.includes('"inLanguage":"zh-CN"'), "Chinese article schema must declare Chinese language");
const changelog = readFileSync(new URL("../../../CHANGELOG.md", import.meta.url), "utf8");
// Only dated, published releases require public translations. Unreleased RCs
// must not appear in the published-release catalog or SEO assertions.
const publishedVersions = [...changelog.matchAll(/^## (\d+\.\d+\.\d+) - \d{4}-\d{2}-\d{2}\s*$/gm)].map(x => x[1]);
const mainSource = readFileSync(new URL("../../ui/src/main.tsx", import.meta.url), "utf8");
const resourceNavStart = mainSource.indexOf('id="public-nav-resources"');
const resourceNavEnd = mainSource.indexOf('className="publicNavActions"', resourceNavStart);
assert.ok(resourceNavStart > -1 && resourceNavEnd > resourceNavStart);
assert.ok(!mainSource.slice(resourceNavStart, resourceNavEnd).includes('href="/demo"'),
  "Live Demo should not appear in Resources navigation");
assert.ok(mainSource.includes('if (routePath === "/demo")'), "Demo route must remain accessible");

for (const page of ["/remote-mcp", "/support", "/privacy", "/terms"]) {
  assert.ok(mainSource.includes('href="' + page + '"') || mainSource.includes('href={tr("' + page + '", "/zh' + page + '")}'), "public navigation/footer must expose " + page);
}
for (const page of ["/privacy", "/terms", "/support"]) {
  assert.ok(localizedPages.includes(page), "legal/support route must support Chinese");
  assert.equal(pageForLanguage(page,"zh"),"/zh"+page);
  assert.equal(marketingStatusCode("/zh"+page),200);
  assert.ok(sitemap.includes("<loc>https://remotearc.app/zh"+page+"</loc>"));
  const html=renderMarketingHtml('<html lang="en"><head><title>Remote Arc</title></head><body><div id="root"></div></body></html>',"/zh"+page);
  assert.ok(html.includes(chineseSeo[page].h1));
}
const legacyBlock = mainSource.split("const LEGACY_PRODUCT_RELEASES: ProductRelease[] = [")[1]?.split("const PRODUCT_RELEASES")[0] || "";
const legacyVersions = [...legacyBlock.matchAll(/version: "(\d+\.\d+\.\d+)"/g)].map(x => x[1]);
for (const version of [...publishedVersions, ...legacyVersions]) {
  assert.ok(releaseChinese[version]?.title && releaseChinese[version]?.summary, "missing Chinese release summary: " + version);
}
assert.equal(Object.keys(releaseChinese).length, new Set([...publishedVersions, ...legacyVersions]).size, "stale release translations");
const robots = robotsTxt();
assert.ok(robots.includes("Sitemap: https://remotearc.app/sitemap.xml"));
assert.ok(robots.includes("Disallow: /dashboard$"));
assert.ok(robots.includes("Disallow: /automations$"));
assert.ok(robots.includes("Disallow: /security$"));
assert.ok(robots.includes("Disallow: /connect$"));
assert.ok(!robots.includes("Disallow: /security\n"), "robots must not block /security-model");
assert.ok(!robots.includes("Disallow: /connect\n"), "robots must not block /connect-ai");

const llms = llmsTxt();
assert.ok(llms.includes("/mcp-computer-access"));
assert.ok(llms.includes("/chatgpt-computer-access"));
assert.ok(llms.includes("/claude-computer-access"));
assert.ok(llms.includes("/security-model"));


function bodyWordCount(html) {
  const body = html.match(/<body>([\s\S]*?)<\/body>/)?.[1] || "";
  const text = body
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<style[\s\S]*?<\/style>/g, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&[^;]+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text ? text.split(" ").length : 0;
}
const shell = '<!doctype html><html><head><title>Remote Arc</title><meta name="description" content="x" /><link rel="canonical" href="https://remotearc.app/" /><meta property="og:title" content="x" /><meta property="og:description" content="x" /><meta property="og:url" content="https://remotearc.app/" /><meta property="og:image" content="x" /></head><body><div id="root"></div></body></html>';

const remoteMcp = renderMarketingHtml(shell, "/remote-mcp");
assert.ok(remoteMcp.includes("<h1>Remote MCP Server: what it is and how to connect</h1>"), "guide needs a distinct educational H1");
assert.ok(remoteMcp.includes('rel="canonical" href="https://remotearc.app/remote-mcp"'), "remote guide needs self canonical");
assert.ok(remoteMcp.includes('"@type":"TechArticle"'), "remote guide should expose tech-article structured data");
assert.ok(remoteMcp.includes('name="robots" content="index,follow'), "guide must be indexable");
assert.ok(remoteMcp.includes("Local MCP versus remote MCP"), "guide explains local versus remote");
assert.ok(remoteMcp.includes("https://mcp.remotearc.app/mcp"), "guide includes an actual endpoint");
assert.ok(remoteMcp.includes('href="/install/claude"'), "guide links to practical client setup");
assert.ok(bodyWordCount(remoteMcp) >= 650, "guide should provide useful standalone search-engine-readable content");
assert.ok(llmsTxt().includes("/remote-mcp"), "LLM index should link guide");
assert.ok(llmsTxt().includes('/docs/architecture') && llmsTxt().includes('/docs/skills'));
assert.ok(llmsFullTxt().includes('scheduled fresh judgment') && llmsFullTxt().includes('result checks'));
assert.ok(!llmsFullTxt().includes('does not own the user\'s model or conversation'),'LLM summary must distinguish hosted Arc from external Connect');

const mcp = renderMarketingHtml(shell, "/mcp-computer-access");
assert.ok(mcp.includes("<h1>Remote MCP computer access for AI agents</h1>"));
assert.ok(mcp.includes('name="robots" content="index,follow'));
assert.ok(mcp.includes('"@type":"TechArticle"'));
assert.ok(mcp.includes('rel="canonical" href="https://remotearc.app/mcp-computer-access"'));

const useCasesCatalog = renderMarketingHtml(shell, "/use-cases");
assert.ok(useCasesCatalog.includes('illustrated catalog'));
for(const slug of useCaseSlugs)assert.ok(useCasesCatalog.includes('href="/use-cases/'+slug+'"'),'catalog must link to '+slug);
assert.ok(useCasesCatalog.includes('timed SRT/VTT subtitles'),'catalog must describe transcription outputs');
for(const slug of [...chinesePages].filter(path=>path.startsWith('/use-cases/'))){
 // Browser Runner is Connect-only today; its page must not offer an Arc path.
 const connectOnly=ARC_USE_CASES[slug.slice('/use-cases/'.length)].connectOnly;
 for(const prefix of ['', '/zh']){
  const html=renderMarketingHtml(shell,prefix+slug);
  assert.equal(html.includes(prefix?'使用 Arc':'With Arc'),!connectOnly,slug+(connectOnly?' must not offer an Arc path':' Arc path must be crawlable'));
  assert.ok(html.includes(prefix?'使用 Connect':'With Connect'),slug+' Connect path must remain crawlable');
  if(connectOnly)assert.ok(html.includes('Browser Runner'),slug+' must name Browser Runner');
 }
}
for (const slug of ["desktop-automation", "remote-support", "browser-research", "data-work", "job-applications"]) {
  assert.ok(useCasesCatalog.includes('href="/use-cases/' + slug + '"'), "server-rendered use-case catalog must link to " + slug);
}
const home = renderMarketingHtml(shell, "/");
assert.ok(home.includes('"@type":"SoftwareApplication"'));
assert.ok(home.includes('<div id="root"><div class="marketingShell">'), "homepage must publish normal, visible server-rendered content");
assert.ok(!home.includes('<noscript>'), "Google's JavaScript rendering must not discard the only server-rendered copy");
assert.ok(home.includes('Remote Arc (RemoteArc)'));
assert.ok(home.includes('<h1>Remote Arc: AI computer access, browser automation and device fleet</h1>'));
assert.ok(home.includes('href="/integrations"'), "homepage fallback must link to app integrations");
assert.ok(home.includes('href="/pricing"'), "homepage fallback must link to pricing");
assert.ok(home.includes('Use the computer where the work already lives'));
assert.ok(bodyWordCount(home) >= 350, "homepage fallback should contain substantive product copy");

for (const path of ["/use-cases/presentation-deck", "/use-cases/spreadsheet-report", "/use-cases/desktop-automation", "/use-cases/cross-device-handoff"]) {
  const rendered = renderMarketingHtml(shell, path);
  assert.ok(rendered.includes('name="robots" content="index,follow'), path + " should be indexable");
  assert.ok(rendered.includes('<h1>') && bodyWordCount(rendered) >= 150, path + " should provide real crawlable detail");
}

for (const path of ["/docs", "/docs/mcp", "/chrome-extension", "/docs/long-running-work", "/security-model", "/mcp-computer-access"]) {
  const rendered = renderMarketingHtml(shell, path);
  assert.ok(bodyWordCount(rendered) >= 250, path + " should keep substantive server-rendered copy");
}

const missing = renderMarketingHtml(shell, "/definitely-not-a-real-page");
assert.ok(missing.includes("<h1>Page not found</h1>"));
assert.ok(missing.includes('name="robots" content="noindex,nofollow,noarchive"'));
assert.ok(!missing.includes('rel="canonical"'));

console.log("SEO smoke test passed");

const downloads = renderMarketingHtml(shell, "/downloads");
const nativeVersion = JSON.parse(readFileSync(new URL("../../../packages/cli/package.json", import.meta.url), "utf8")).version;
for (const os of ["windows", "darwin", "linux"]) for (const arch of ["amd64", "arm64"]) {
  assert.ok(downloads.includes("/releases/download/remotelink-v" + nativeVersion + "/remotelink-v" + nativeVersion + "-" + os + "-" + arch + (os === "windows" ? ".exe" : "")), "missing native download for " + os + "/" + arch);
}
assert.ok(downloads.includes("SHA256SUMS"));
assert.ok(sitemapXml().includes("https://remotearc.app/downloads"));

for (const topic of DOC_TOPICS) for (const prefix of ["","/zh"]) {
 const path=prefix+"/docs/"+topic.slug;
 assert.equal(marketingStatusCode(path),200,path);
 assert.equal(canonicalForPath(path),"https://remotearc.app"+path);
 assert.ok(sitemapXml().includes("<loc>https://remotearc.app"+path+"</loc>"));
 assert.equal(pageForLanguage("/docs/"+topic.slug,prefix?"zh":"en"),path);
 const html=renderMarketingHtml(shell,path);
 assert.ok(html.includes(prefix?topic.title.zh:topic.title.en));
}
assert.equal(marketingStatusCode("/docs/unknown-guide"),404);
assert.equal(marketingStatusCode("/zh/docs/unknown-guide"),404);

// Exercise the actual Worker: HEAD must match GET even without Accept: text/html.
// Static asset fallback normally returns 200 for every extensionless path.
// These routes never instantiate a Durable Object, but importing the Worker in
// Node needs the Cloudflare-only base classes used by unrelated exports.
const { registerHooks } = await import('node:module');
const hooks = registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === 'cloudflare:workers') return {
    url: 'data:text/javascript,export class DurableObject {} export class WorkerEntrypoint {}', shortCircuit: true,
  };
  return nextResolve(specifier, context);
} });
const worker = (await import('../src/index.ts')).default;
hooks.deregister();
const assetMethods = [];
const env = {
  PUBLIC_ORIGIN: 'https://mcp.remotearc.app', MARKETING_ORIGIN: 'https://remotearc.app',
  DASHBOARD_ORIGIN: 'https://agent.remotearc.app',
  ASSETS: { async fetch(request) {
    assetMethods.push(request.method);
    return new Response(request.method === 'HEAD' ? null : homepageTemplate, { headers: { 'content-type': 'text/html' } });
  } },
};
const ctx = { waitUntil() { throw new Error('SEO requests must not record an incident'); } };
for (const path of ['/', '/zh', '/docs', '/unknown-seo-page']) {
  const get = await worker.fetch(new Request('https://remotearc.app' + path), env, ctx);
  const head = await worker.fetch(new Request('https://remotearc.app' + path, { method: 'HEAD' }), env, ctx);
  assert.equal(head.status, get.status, path + ' HEAD status must match GET');
  for (const key of ['link', 'x-robots-tag', 'content-type', 'cache-control']) {
    assert.equal(head.headers.get(key), get.headers.get(key), path + ' mismatched HEAD header: ' + key);
  }
  assert.equal(await head.text(), '', 'HEAD must never include a body');
  const body = await get.text();
  assert.ok(body.includes('class="marketingContent"') && body.includes('<h1>'), path + ' must have visible document content');
}
assert.ok(assetMethods.every(method => method === 'GET'), 'HEAD must fetch the shell with GET before stripping its body');
for (const url of locs) {
  const document = renderMarketingHtml(homepageTemplate, new URL(url).pathname);
  assert.ok(document.includes('class="marketingContent"') && document.includes('<h1>'), url + ' needs visible document content');
  assert.ok(!document.includes('<noscript>'), url + ' must not require JavaScript to be disabled');
}
console.log('PASS: visible server documents, brand aliases and real Worker GET/HEAD parity');
