import { loadLocale } from "../src/locales/locale-catalog.js";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
registerHooks({
  load(url, context, nextLoad) {
    return url.endsWith(".css")
      ? { format: "module", source: "", shortCircuit: true }
      : nextLoad(url, context);
  },
});
const { HomeConnectionScene } =
  await import("../src/features/marketing/home/home-connection-scene.tsx");
const { LandingContent } = await import("../src/features/marketing/home/landing-content.tsx");
const { HomeHeroCopy } = await import("../src/features/marketing/home/home-hero.tsx");
const { HomeArcHorizon } = await import("../src/features/marketing/home/home-arc-horizon.tsx");
const { I18nProvider } = await import("../src/app/i18n.tsx");
const publicDir = fileURLToPath(new URL("../public/", import.meta.url));
const geminiIcon = "/ai-gemini-four-color-2025.svg";
const geminiSvg = readFileSync(path.join(publicDir, geminiIcon), "utf8");
for (const color of ["#FC413D", "#FBBC04", "#00B95C", "#3186FF"]) {
  assert.ok(
    geminiSvg.includes(color),
    "Gemini must use Google's current four-color mark: " + color,
  );
}
for (const file of [
  "lib/ai-clients.ts",
  "features/install/client-install-page.tsx",
  "features/docs/tool-reference.tsx",
]) {
  const source = readFileSync(fileURLToPath(new URL("../src/" + file, import.meta.url)), "utf8");
  assert.ok(
    source.includes(geminiIcon),
    file + " must use the versioned Gemini asset, not the cached legacy URL",
  );
  assert.ok(!source.includes('"/ai-gemini.svg"'), file + " must not use the old browser-cache key");
}
const clients = [
  { name: "ChatGPT", slug: "chatgpt", icon: "/ai-openai.svg", tone: "mono" },
  { name: "Claude", slug: "claude", icon: "/ai-claude.svg", tone: "color" },
  { name: "Gemini", slug: "gemini", icon: "/ai-gemini-four-color-2025.svg", tone: "color" },
  { name: "Cursor", slug: "cursor", icon: "/ai-cursor.svg", tone: "color" },
];
const originalLocation = globalThis.location;
const originalWindow = globalThis.window;
try {
  for (const locale of ["en", "zh"]) {
    await loadLocale(locale, "all");
    globalThis.location = {
      origin: "https://remotearc.app",
      hostname: "remotearc.app",
      pathname: locale === "zh" ? "/zh" : "/",
      search: "",
    };
    globalThis.window = { location: globalThis.location, matchMedia: () => ({ matches: true }) };
    const html = renderToStaticMarkup(
      React.createElement(
        I18nProvider,
        null,
        React.createElement(HomeConnectionScene, { clients }),
      ),
    );
    const lowerHome = renderToStaticMarkup(
      React.createElement(I18nProvider, null, React.createElement(LandingContent)),
    );
    const body = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
    assert.match(html, /role="region"[^>]*aria-labelledby=/);
    const label = html.match(/aria-labelledby="([^"]+)"/)?.[1];
    assert.ok(label && html.includes('id="' + label + '"'));
    for (const name of [
      "GitHub",
      "Slack",
      "Gmail",
      "Google Calendar",
      "Google Drive",
      "WhatsApp",
      "Mac",
      "Windows",
      "Linux",
      "Browser",
    ])
      assert.ok(body.includes(name), "Present all resources together: " + name);
    assert.equal((html.match(/data-resource="app"/g) || []).length, 6);
    assert.equal((html.match(/data-resource="device"/g) || []).length, 4);
    assert.equal((html.match(/data-resource="skill"/g) || []).length, 0);
    assert.equal(
      (html.match(/class="hcsFloatingNode hcsAiNode/g) || []).length,
      3,
      "Show ChatGPT, Claude and Cursor in the topology",
    );
    assert.doesNotMatch(
      html,
      /Gemini|\/install\/gemini|ai-gemini/,
      "Gemini stays out of the topology, including its copy and links",
    );
    assert.match(html, /\/integrations\?provider=gmail/);
    assert.match(html, /\/integrations\?provider=google_calendar/);
    assert.doesNotMatch(
      html,
      /Vercel|vercel/,
      "The topology promotes Google Calendar instead of the unconfigured Vercel integration",
    );
    assert.doesNotMatch(html, /Runway|runway/);
    for (const name of locale === "zh"
      ? ["专业技能", "任务执行", "操作审批", "结果验证"]
      : ["Skills", "Execution", "Approvals", "Verified Results"])
      assert.ok(body.includes(name));
    assert.equal((html.match(/role="tab"/g) || []).length, 2, "Only manual product-mode controls");
    assert.match(html, /role="tabpanel"/);
    assert.match(html, /data-mode="connect"/, "Without runtime availability, default to Connect");
    assert.match(body, locale === "zh" ? /Connect 现已可用/ : /Connect available now/);
    assert.match(body, locale === "zh" ? /查看状态/ : /Check availability/);
    const available = renderToStaticMarkup(
      React.createElement(
        I18nProvider,
        null,
        React.createElement(HomeConnectionScene, {
          clients,
          arcAvailable: true,
          initialMode: "arc",
        }),
      ),
    );
    assert.match(available, /data-mode="arc"/, "Honor the available Arc mode");
    assert.match(available, locale === "zh" ? /Arc Agent · 现已可用/ : /Arc Agent · Available now/);
    assert.doesNotMatch(
      available,
      /hcsSoonLabel/,
      "Available Arc must not display obsolete launch badges",
    );
    assert.match(
      body,
      locale === "zh"
        ? /AI 可以使用的账号与电脑/
        : /Choose the accounts and computers your AI can use/,
    );
    assert.doesNotMatch(html, /data-step=|data-routine-step=|hcsPlayButton|hcsSteps/);
    assert.doesNotMatch(body, /npm test|Product illustration|Illustrative demo|Step \d|Pause|Play/);
    for (const slug of ["chatgpt", "claude", "cursor"])
      assert.ok(
        html.includes('href="' + (locale === "zh" ? "/zh" : "") + "/install/" + slug + '"'),
      );
    // The hero copy: the product label, one headline in two parts, and Connect.
    const hero = renderToStaticMarkup(
      React.createElement(
        I18nProvider,
        null,
        React.createElement(HomeHeroCopy, {
          connectHref: "https://mcp.remotearc.app/dashboard/connect/overview",
        }),
      ),
    );
    assert.equal((hero.match(/<h1\b/g) || []).length, 1);
    const heroCopy = hero.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
    assert.match(heroCopy, locale === "zh" ? /AI 基础设施/ : /AI INFRASTRUCTURE/);
    assert.match(
      heroCopy,
      locale === "zh"
        ? /你的 AI，连接到 你的应用和电脑。/
        : /Your AI, connected to your apps and computers\./,
    );
    assert.match(hero, /<em>/, "The second half of the headline is set apart");
    assert.match(hero, /href="https:\/\/mcp.remotearc.app\/dashboard\/connect\/overview"/);
    assert.match(hero, /npx remotelink@latest/, "The install command sits under the buttons");
    assert.match(
      hero,
      new RegExp('class="heroArcAction" href="' + (locale === "zh" ? "/zh" : "") + '/arc"'),
      "Visitors without an AI are offered Arc",
    );
    // The globe under it: three AI clients and three apps on the rim, four
    // computers (including the browser) on the inner ring, Remote Arc on top.
    const arc = renderToStaticMarkup(
      React.createElement(I18nProvider, null, React.createElement(HomeArcHorizon, { progress: 0 })),
    );
    assert.equal((arc.match(/class="homeArcNode"/g) || []).length, 10);
    assert.equal((arc.match(/data-kind="ai"/g) || []).length, 3);
    assert.equal((arc.match(/data-kind="app"/g) || []).length, 3);
    assert.equal((arc.match(/data-kind="device"/g) || []).length, 4);
    assert.equal(
      (arc.match(/data-ring="ring"/g) || []).length,
      4,
      "Computers sit on the inner ring",
    );
    for (const name of ["WhatsApp", "Mac", "Windows", "Linux", "Chrome"])
      assert.ok(arc.includes(">" + name + "<"), "On the globe: " + name);
    assert.doesNotMatch(arc, /Gemini|ai-gemini/, "Gemini stays off the arc, as in the topology");
    for (const slug of ["chatgpt", "claude", "cursor"])
      assert.ok(arc.includes('href="' + (locale === "zh" ? "/zh" : "") + "/install/" + slug + '"'));
    assert.match(arc, /\/connect-ai"/, "Remote Arc at the top opens Connect");
    assert.equal((arc.match(/<li\b/g) || []).length, 1, "One example request, in plain words");
    assert.match(arc, locale === "zh" ? /示例/ : /Example/);
    for (const src of new Set([...arc.matchAll(/<img\b[^>]*src="([^"]+)"/g)].map((m) => m[1])))
      assert.ok(existsSync(path.join(publicDir, src)), "Bundled arc asset: " + src);
    assert.doesNotMatch(lowerHome, /Runway|runway/);
    assert.match(
      lowerHome,
      /class="homeDemo"/,
      "Preserve the lower interactive conversation and execution demo",
    );
    assert.match(lowerHome, /id="how-it-works"/);
    assert.match(lowerHome, /arcV3Teaser/);
    // The home demo plays seven requests: Slack, WhatsApp, GitHub, fixing code,
    // the browser, away from the desk and a server room.
    for (const name of locale === "zh"
      ? ["Slack", "WhatsApp", "GitHub", "修改代码", "浏览器", "出门在外", "机房巡检"]
      : ["Slack", "WhatsApp", "GitHub", "Fix code", "Browser", "On the road", "Server room"])
      assert.ok(lowerHome.includes(name), "Home request: " + name);
    // The headline is split into two tones, so match its text without the markup.
    assert.match(
      lowerHome.replace(/<[^>]*>/g, ""),
      locale === "zh" ? /在聊天里说需求，看它把事做完/ : /Ask in chat. Watch the work get done/,
    );
    const images = [...html.matchAll(/<img\b[^>]*src="([^"]+)"/g)].map((match) => match[1]);
    assert.ok(images.includes("/remote-arc.svg"), "Preserve the actual blue brand Logo");
    assert.match(html, /class="hcsLogoCurrent"/, "Current follows the original brand mark");
    assert.ok(images.includes("/platform-brands/browser.svg"));
    for (const src of new Set(images)) {
      const asset = path.join(publicDir, src);
      assert.ok(existsSync(asset), "Bundled brand asset: " + src);
      assert.match(readFileSync(asset, "utf8"), /<svg\b[^>]*viewBox=/);
    }
  }
} finally {
  if (originalLocation === undefined) delete globalThis.location;
  else globalThis.location = originalLocation;
  if (originalWindow === undefined) delete globalThis.window;
  else globalThis.window = originalWindow;
}
console.log(
  "PASS: bilingual floating constellation with Connect/Arc modes, the hero copy and arc with genuine brands, lower live demo and App examples",
);
