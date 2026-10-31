import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
registerHooks({ load(url, context, nextLoad) {
  return url.endsWith(".css") ? { format: "module", source: "", shortCircuit: true } : nextLoad(url, context);
} });
const { HomeConnectionScene } = await import("../src/home-connection-scene.tsx");
const { LandingContent,HomeHeroCopy } = await import("../src/landing-content.tsx");
const { I18nProvider } = await import("../src/i18n.tsx");
const publicDir = fileURLToPath(new URL("../public/", import.meta.url));
const geminiIcon = "/ai-gemini-four-color-2025.svg";
const geminiSvg = readFileSync(path.join(publicDir, geminiIcon), "utf8");
for (const color of ["#FC413D", "#FBBC04", "#00B95C", "#3186FF"]) {
  assert.ok(geminiSvg.includes(color), "Gemini must use Google's current four-color mark: " + color);
}
for (const file of ["public-layout.tsx", "client-install-page.tsx", "tool-reference.tsx"]) {
  const source = readFileSync(fileURLToPath(new URL("../src/" + file, import.meta.url)), "utf8");
  assert.ok(source.includes(geminiIcon), file + " must use the versioned Gemini asset, not the cached legacy URL");
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
    globalThis.location = { origin: "https://remotearc.app", hostname: "remotearc.app", pathname: locale === "zh" ? "/zh" : "/", search: "" };
    globalThis.window = { location: globalThis.location,matchMedia:()=>({matches:true}) };
    const html = renderToStaticMarkup(React.createElement(I18nProvider, null, React.createElement(HomeConnectionScene, { clients })));
    const lowerHome = renderToStaticMarkup(React.createElement(I18nProvider, null, React.createElement(LandingContent)));
    const body = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
    assert.match(html, /role="region"[^>]*aria-labelledby=/);
    const label = html.match(/aria-labelledby="([^"]+)"/)?.[1];
    assert.ok(label && html.includes('id="' + label + '"'));
    for (const name of ["GitHub", "Slack", "Gmail", "Google Calendar", "Google Drive", "Notion", "Mac", "Windows", "Linux", "Browser"]) assert.ok(body.includes(name), "Present all resources together: " + name);
    assert.equal((html.match(/data-resource="app"/g) || []).length, 6);
    assert.equal((html.match(/data-resource="device"/g) || []).length, 4);
    assert.equal((html.match(/data-resource="skill"/g)||[]).length,0);
    assert.equal((html.match(/class="hcsFloatingNode hcsAiNode/g) || []).length, 3, "Show ChatGPT, Claude and Cursor in the topology");
    assert.doesNotMatch(html, /Gemini|\/install\/gemini|ai-gemini/, "Gemini stays out of the topology, including its copy and links");
    assert.match(html,/\/integrations\?provider=gmail/);
    assert.match(html,/\/integrations\?provider=google_calendar/);
    assert.doesNotMatch(html,/Vercel|vercel/, "The topology promotes Google Calendar instead of the unconfigured Vercel integration");
    assert.doesNotMatch(html,/Runway|runway/);
    for (const name of locale === "zh" ? ["专业技能", "任务执行", "操作审批", "结果验证"] : ["Skills", "Execution", "Approvals", "Verified Results"]) assert.ok(body.includes(name));
    assert.equal((html.match(/role="tab"/g) || []).length, 2, "Only manual product-mode controls");
    assert.match(html, /role="tabpanel"/);
    assert.match(html, /data-mode="connect"/, "Without runtime availability, default to Connect");
    assert.match(body, locale === "zh" ? /Connect 现已可用/ : /Connect available now/);
    assert.match(body, locale === "zh" ? /查看状态/ : /Check availability/);
    const available = renderToStaticMarkup(React.createElement(I18nProvider, null, React.createElement(HomeConnectionScene, { clients, arcAvailable: true, initialMode: "arc" })));
    assert.match(available, /data-mode="arc"/, "Honor the available Arc mode");
    assert.match(available, locale === "zh" ? /Arc Agent · 现已可用/ : /Arc Agent · Available now/);
    assert.doesNotMatch(available, /hcsSoonLabel/, "Available Arc must not display obsolete launch badges");
    assert.match(body, locale === "zh" ? /AI 可以使用的账号与电脑/ : /Choose the accounts and computers your AI can use/);
    assert.doesNotMatch(html, /data-step=|data-routine-step=|hcsPlayButton|hcsSteps/);
    assert.doesNotMatch(body, /npm test|Product illustration|Illustrative demo|Step \d|Pause|Play/);
    for (const slug of ["chatgpt", "claude", "cursor"]) assert.ok(html.includes('href="' + (locale === 'zh' ? '/zh' : '') + '/install/' + slug + '"'));
    for(const mode of ['connect','arc']){
      const hero=renderToStaticMarkup(React.createElement(I18nProvider,null,React.createElement(HomeHeroCopy,{mode,arcAvailable:true,arcHref:'https://agent.remotearc.app/chat',connectHref:'https://mcp.remotearc.app/dashboard/connect/overview'})));
      assert.match(hero,new RegExp('data-product="'+mode+'"'));assert.equal((hero.match(/<h1\b/g)||[]).length,1);
      const copy=hero.replace(/<[^>]*>/g,' ');assert.match(copy,mode==='connect'?(locale==='zh'?/AI 基础设施/:/AI INFRASTRUCTURE/):(locale==='zh'?/新一代 AI AGENT/:/NEXT-GENERATION AI AGENT/));
      assert.match(copy,mode==='connect'?(locale==='zh'?/转眼接入真实工作/:/Connected in seconds/):(locale==='zh'?/随时接手工作/:/Ready around the clock/));
      assert.match(hero,mode==='connect'?/href="https:\/\/mcp.remotearc.app\/dashboard\/connect\/overview"/:/href="https:\/\/agent.remotearc.app\/chat"/);
      if (mode === "arc") { assert.match(hero, /Meet Arc|认识 Arc/); assert.match(hero, new RegExp('href="' + (locale === "zh" ? "/zh" : "") + '/arc"')); }
    }
    assert.doesNotMatch(lowerHome,/Runway|runway/);
    assert.match(lowerHome,/data-category="creative"/);
    assert.match(lowerHome,/use-cases\/image-studio#image-gallery/);
    assert.match(lowerHome, /class="homeDemo"/, "Preserve the lower interactive conversation and execution demo");
    assert.match(lowerHome, /id="how-it-works"/);
    assert.match(lowerHome, /arcV3Teaser/);
    for (const name of locale === "zh" ? ["修复项目", "GitHub + Vercel", "制作视频", "生成图片", "Drive + Notion", "制作 PPT", "生成 Excel"] : ["Fix a project", "GitHub + Vercel", "Make a video", "Create images", "Drive + Notion", "Create a PPT", "Build an Excel report"]) assert.ok(lowerHome.includes(name.replaceAll(">", "&gt;")), "Preserve selected task: " + name);
    assert.match(lowerHome, locale === "zh" ? /别只和 AI 聊天，让它真正动手/ : /Don’t just chat. Watch AI do the work/);
    const images = [...html.matchAll(/<img\b[^>]*src="([^"]+)"/g)].map(match => match[1]);
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
  if (originalLocation === undefined) delete globalThis.location; else globalThis.location = originalLocation;
  if (originalWindow === undefined) delete globalThis.window; else globalThis.window = originalWindow;
}
console.log("PASS: bilingual floating constellation, manual Connect/Arc modes, genuine brands, lower live demo and App examples");
