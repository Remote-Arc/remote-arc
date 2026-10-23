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
    globalThis.window = { location: globalThis.location,matchMedia:()=>({matches:true}) };
    const html = renderToStaticMarkup(React.createElement(I18nProvider, null, React.createElement(HomeConnectionScene, { clients })));
    const lowerHome = renderToStaticMarkup(React.createElement(I18nProvider, null, React.createElement(LandingContent)));
    const body = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
    assert.match(html, /role="region"[^>]*aria-labelledby=/);
    const label = html.match(/aria-labelledby="([^"]+)"/)?.[1];
    assert.ok(label && html.includes('id="' + label + '"'));
    for (const name of ["GitHub", "Slack", "Runway", "Vercel", "Google Drive", "Notion", "Mac", "Windows", "Linux", "Browser"]) assert.ok(body.includes(name), "Present all resources together: " + name);
    assert.equal((html.match(/data-resource="app"/g) || []).length, 6);
    assert.equal((html.match(/data-resource="device"/g) || []).length, 4);
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
    for (const client of clients) assert.ok(html.includes('href="' + (locale === 'zh' ? '/zh' : '') + '/install/' + client.slug + '"'));
    for(const mode of ['connect','arc']){
      const hero=renderToStaticMarkup(React.createElement(I18nProvider,null,React.createElement(HomeHeroCopy,{mode,arcAvailable:true,arcHref:'https://agent.remotearc.app/chat',connectHref:'https://mcp.remotearc.app/dashboard/connect/overview'})));
      assert.match(hero,new RegExp('data-product="'+mode+'"'));assert.equal((hero.match(/<h1\b/g)||[]).length,1);
      const copy=hero.replace(/<[^>]*>/g,' ');assert.match(copy,mode==='connect'?(locale==='zh'?/AI 基础设施/:/AI INFRASTRUCTURE/):(locale==='zh'?/新一代 AI AGENT/:/NEXT-GENERATION AI AGENT/));
      assert.match(copy,mode==='connect'?(locale==='zh'?/转眼接入真实工作/:/Connected in seconds/):(locale==='zh'?/随时接手工作/:/Ready around the clock/));
      assert.match(hero,mode==='connect'?/href="https:\/\/mcp.remotearc.app\/dashboard\/connect\/overview"/:/href="https:\/\/agent.remotearc.app\/chat"/);
    }
    assert.match(lowerHome, /class="homeDemo"/, "Preserve the lower interactive conversation and execution demo");
    assert.match(lowerHome, /id="how-it-works"/);
    assert.match(lowerHome, /arcV3Teaser/);
    for (const name of locale === "zh" ? ["修复项目", "GitHub + Vercel", "Runway 创作", "Drive + Notion", "制作 PPT", "生成 Excel"] : ["Fix a project", "GitHub + Vercel", "Create with Runway", "Drive + Notion", "Create a PPT", "Build an Excel report"]) assert.ok(lowerHome.includes(name.replaceAll(">", "&gt;")), "Preserve selected task: " + name);
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
