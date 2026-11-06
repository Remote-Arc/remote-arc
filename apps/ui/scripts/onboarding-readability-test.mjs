import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { appSource, readLocaleMessages } from "./app-source.mjs";

const source = appSource;
const styles = readFileSync(new URL("../src/styles/styles.css", import.meta.url), "utf8");

assert.match(source, /className=\{agent\.id === "chatgpt" \? "pairChatGptLogo" : undefined\}/);
assert.match(styles, /\.pairPermissionHead strong\s*\{\s*font-size:\s*15px;?\s*\}/);
assert.match(
  styles,
  /\.pairPermissionCard p,\s*\.pairPermissionCard ul\s*\{\s*font-size:\s*13px;?\s*\}/,
);
assert.match(styles, /\.pairWorkspaceManual input\s*\{\s*font-size:\s*13px;?\s*\}/);
assert.match(styles, /\.pairAgentConnectIntro p\s*\{\s*font-size:\s*14px;?\s*\}/);
assert.match(styles, /\.pairAgentOption strong\s*\{\s*font-size:\s*15px;?\s*\}/);
assert.match(styles, /\.pairAgentOption \.pairChatGptLogo\s*\{\s*filter:\s*invert\(1\);?\s*\}/);
assert.match(
  styles,
  /:root\[data-theme="light"\] \.pairAgentOption \.pairChatGptLogo\s*\{\s*filter:\s*none;?\s*\}/,
);

const installGuide = readFileSync(
  new URL("../src/features/install/client-setup-guides.tsx", import.meta.url),
  "utf8",
);
assert.match(
  source,
  /<ClientMcpGuide\s+client=\{slug\}/,
  "each installation page needs MCP platform directions",
);
assert.match(source, /className="installMustDo"/, "both setup sides should be prominent");
assert.doesNotMatch(
  source,
  /<InstallCompanionNotice \/>/,
  "Companion download belongs on the Chrome Browser section, not the AI client pages",
);
for (const path of ["https://claude.ai/customize/connectors", "https://cursor.com/docs/mcp"])
  assert.ok(installGuide.includes(path), "missing official setup link: " + path);
const website = readLocaleMessages("en", "website");
assert.equal(website["install.chatgptPluginSetup.tryInChat"], "Try in chat");
assert.match(
  website["install.chatgptPluginSetup.followTheBrowserPairingPageAnd"],
  /same Remote Arc account/,
);
const mcpDocs = readFileSync(
  new URL("../src/features/docs/product-docs.tsx", import.meta.url),
  "utf8",
);
assert.ok(
  !installGuide.includes("remote-arc-browser.zip"),
  "AI client setup guides must not include Chrome download",
);
const chromeSection = mcpDocs.slice(mcpDocs.indexOf('<section id="chrome-browser">'));
assert.ok(
  chromeSection.includes("/chrome-extension"),
  "old MCP reference should link to dedicated download page",
);
assert.ok(
  !chromeSection.includes("chromeCompanionDownload"),
  "download card must not be buried within MCP reference",
);
assert.match(
  source,
  /href=\{navHref\(['"]\/chrome-extension['"]\)\}/,
  "Chrome Browser navigation must open its localized dedicated page, not scroll a guide",
);
const chromePage = readFileSync(
  new URL("../src/features/install/chrome-extension-page.tsx", import.meta.url),
  "utf8",
);
assert.match(
  chromePage,
  /chromeDownloadHero/,
  "standalone Chrome extension page needs a top download card",
);
assert.match(
  chromePage,
  /remote-arc-browser.zip\?v=/,
  "versioned download belongs in top hero card",
);
assert.ok(
  chromePage.indexOf("chromeDownloadHero") < chromePage.indexOf("chromeGuideSteps"),
  "download hero must precede installation steps",
);
assert.doesNotMatch(
  source,
  /\/docs\/mcp#chrome-browser/,
  "Chrome Browser navigation must not jump to an anchor",
);
console.log("PASS: readable onboarding and required two-sided MCP setup instructions");
