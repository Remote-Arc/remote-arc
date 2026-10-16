import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

// Exercise the actual component in both languages. CSS remains a browser
// responsibility; loading it as an empty module keeps the public markup test portable.
registerHooks({ load(url, context, nextLoad) {
  return url.endsWith(".css") ? { format: "module", source: "", shortCircuit: true } : nextLoad(url, context);
} });
const { HomeConnectionScene } = await import("../src/home-connection-scene.tsx");
const { LandingContent } = await import("../src/landing-content.tsx");
const { I18nProvider } = await import("../src/i18n.tsx");
const publicDir = fileURLToPath(new URL("../public/", import.meta.url));
const clients = [
  { name: "ChatGPT", slug: "chatgpt", icon: "/ai-openai.svg", tone: "mono" },
  { name: "Claude", slug: "claude", icon: "/ai-claude.svg", tone: "color" },
  { name: "Cursor", slug: "cursor", icon: "/ai-cursor.svg", tone: "color" },
];
const originalLocation = globalThis.location;
const originalWindow = globalThis.window;
try {
  for (const locale of ["en", "zh"]) {
    globalThis.location = { origin: "https://remotearc.app", hostname: "remotearc.app", pathname: locale === "zh" ? "/zh" : "/", search: "" };
    globalThis.window = { location: globalThis.location };
    const html = renderToStaticMarkup(React.createElement(I18nProvider, null,
      React.createElement(HomeConnectionScene, { clients })));
    const fullHome = renderToStaticMarkup(React.createElement(I18nProvider, null,
      React.createElement(React.Fragment, null,
        React.createElement(HomeConnectionScene, { clients }), React.createElement(LandingContent))));
    assert.doesNotMatch(fullHome, /class="[^"]*(?:homeDemo|hcsPlayButton|hcsSteps)|npm test|src\/auth\.ts|Product illustration|Illustrative demo/, "The whole homepage must omit staged code execution and demo controls");
    assert.ok(fullHome.includes('id="how-it-works"'), "Keep the existing how-it-works navigation target");
    assert.ok(fullHome.includes("arcV3Teaser"), "Keep the Coming Soon Arc entry point");
    const body = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
    assert.match(html, /role="region"[^>]*aria-labelledby=/, "The overview needs a named accessible region");
    const label = html.match(/aria-labelledby="([^"]+)"/)?.[1];
    assert.ok(label && html.includes('id="' + label + '"'), "Region label must reference its visible heading");
    for (const name of ["GitHub", "Slack", "Gmail", "Outlook", "Google Calendar", "Microsoft Calendar", "Mac", "Windows", "Linux", "Browser"]) {
      assert.ok(body.includes(name), "Show " + name + " without waiting for a stage change");
    }
    for (const name of locale === "zh" ? ["专业技能", "任务执行", "操作审批", "结果验证"] : ["Skills", "Execution", "Approvals", "Verified Results"]) {
      assert.ok(body.includes(name), "Show shared platform capability: " + name);
    }
    assert.match(body, locale === "zh" ? /Connect 现已可用/ : /Connect available now/, "Preserve the available Connect entry point");
    assert.match(body, locale === "zh" ? /Arc Agent · 即将推出/ : /Arc Agent · Coming soon/, "Keep Arc Agent explicitly coming soon");
    assert.match(body, locale === "zh" ? /应用生态与云端技能正在建设中/ : /Apps and cloud skills are in development/, "Distinguish platform direction from currently available integrations");
    assert.doesNotMatch(html, /<button\b|data-step=|data-routine-step=/, "An overview must not expose playback or stage controls");
    assert.doesNotMatch(body, /npm test|Product illustration|Illustrative demo|Step \d|Pause|Play/, "Remove the simulated code demonstration");
    for (const client of clients) assert.ok(html.includes('href="/install/' + client.slug + '"'), "Keep installation links for " + client.name);
    const images = [...html.matchAll(/<img\b[^>]*src="([^"]+)"/g)].map(match => match[1]);
    assert.ok(images.includes("/remote-arc.svg"), "Use the genuine Remote Arc mark");
    assert.ok(images.includes("/platform-brands/browser.svg"), "Use the bundled browser brand");
    for (const src of new Set(images)) {
      const asset = path.join(publicDir, src);
      assert.ok(existsSync(asset), "Image asset must exist: " + src);
      assert.match(readFileSync(asset, "utf8"), /<svg\b[^>]*viewBox=/, "Brand SVG needs a viewBox: " + src);
    }
  }
} finally {
  if (originalLocation === undefined) delete globalThis.location; else globalThis.location = originalLocation;
  if (originalWindow === undefined) delete globalThis.window; else globalThis.window = originalWindow;
}
console.log("PASS: bilingual full platform panorama, genuine bundled marks, install links, accessible region and current/coming-soon boundaries");
