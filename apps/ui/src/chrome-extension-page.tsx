import React from "react";
import { useI18n } from "./i18n.js";
import { BrowserModes } from "./browser-modes.js";
import companionManifest from "../../browser-extension/manifest.json" with { type: "json" };
import "./chrome-extension-page.css";

const downloadUrl = "/downloads/remote-arc-browser.zip?v=" + encodeURIComponent(companionManifest.version);

export function ChromeExtensionPage() {
  const { tr } = useI18n();

  return (
    <main className="chromeExtensionPage">
      <BrowserModes primary />
      {/* The download card is the FIRST content on this page, not a hash target. */}
      <section className="chromeDownloadHero" aria-labelledby="chrome-download-title">
        <div className="chromeDownloadCopy">
          <span className="eyebrow">{tr("CHROME EXTENSION · BETA", "CHROME 扩展 · BETA")}</span>
          <h2 id="chrome-download-title">{tr("Download Chrome Companion", "下载 Chrome Companion 浏览器扩展")}</h2>
          <p>{tr(
            "Let your AI work in your everyday Chrome on the sites you allow: it opens its own tabs there, signed in as you are, and reads, clicks and fills. You can also share a single tab you have open. Each site is allowed once, through Chrome's own prompt, and can be removed any time.",
            "让 AI 在你日常使用的 Chrome 里、你允许的网站上工作：它会在这些网站上自己打开标签页，使用你已登录的状态，读取、点击和填写。也可以只共享你打开的某一个标签页。每个网站通过 Chrome 自己的提示允许一次，随时可以移除。",
          )}</p>
          <div className="chromeDownloadCtas">
            <a className="primaryButton chromeDownloadPrimary" href={downloadUrl} download>
              {tr("Download Chrome Companion (.zip)", "下载 Chrome Companion (.zip)")} <span aria-hidden="true">↓</span>
            </a>
            <span className="chromeDownloadVersion">
              {tr("Version", "版本")} {companionManifest.version} · {tr("Chrome / Chromium · unpacked beta", "Chrome / Chromium · 解压安装 Beta")}
            </span>
          </div>
          <p className="chromeDownloadWarning">{tr(
            "This beta is not installed from the Chrome Web Store and will not auto-update. Download a new ZIP and reload the unpacked extension when a newer version is released.",
            "目前尚未上架 Chrome Web Store，手动加载的扩展不会自动升级。发布新版本后，需要重新下载 ZIP 并在 Chrome 扩展管理页重新加载。",
          )}</p>
        </div>
        <div className="chromeDownloadGraphic" aria-label={tr("Browser tab permissions overview", "浏览器标签页权限示意")}>
          <div className="chromeGraphicTop"><span className="chromeGraphicDots" aria-hidden="true">● ● ●</span><span>Chrome Companion</span><strong>{tr("You decide", "由你决定")}</strong></div>
          <div className="chromeGraphicContent">
            <div className="chromeGraphicTab"><span aria-hidden="true">◉</span><div><strong>{tr("A site you allowed", "你允许的网站")}</strong><small>{tr("Your AI opens tabs here, in a Remote Arc tab group", "AI 在这里打开标签页，放在 Remote Arc 标签组里")}</small></div><span className="chromeGraphicOn">{tr("Shared", "已共享")}</span></div>
            <div className="chromeGraphicPermission"><span className="chromePermissionDot" />{tr("Read, click and fill", "读取、点击和填写")}<strong>{tr("On this site", "仅限此网站")}</strong></div>
            <div className="chromeGraphicPermission"><span className="chromePermissionDot muted" />{tr("Other sites and tabs", "其他网站和标签页")}<strong>{tr("Not visible", "看不到")}</strong></div>
            <p>{tr("Orders, posts and submissions are sent once. Passwords and card numbers are never typed by the AI.", "下单、发布和提交只发送一次。AI 从不输入密码和卡号。")}</p>
          </div>
        </div>
      </section>

      <section className="chromeGuideSteps" aria-labelledby="chrome-steps-title">
        <div className="chromeGuideIntro"><span className="eyebrow">{tr("INSTALLATION", "安装步骤")}</span><h2 id="chrome-steps-title">{tr("Set it up in Chrome", "在 Chrome 中完成安装")}</h2>
          <p>{tr("Browser sharing is optional. Remote Arc file access and terminal tools do not require the Chrome Companion.", "浏览器共享是可选功能。Remote Arc 的文件和终端工具无需安装 Chrome Companion。")}</p></div>
        <ol className="chromeStepsGrid">
          <li><span>01</span><h3>{tr("Download and unzip", "下载并解压")}</h3><p>{tr("Use the button above. Extract the ZIP into a folder that you will keep on this computer.", "点击页面顶部的按钮下载 ZIP，解压到电脑上一个准备长期保留的文件夹。")}</p></li>
          <li><span>02</span><h3>{tr("Open Chrome Extensions", "打开扩展程序页面")}</h3><p>{tr("Open chrome://extensions in Chrome. Turn on Developer mode at the top of the Extensions page.", "在 Chrome 地址栏输入 chrome://extensions，开启扩展程序页面顶部的「开发者模式」。")}</p><code>chrome://extensions</code></li>
          <li><span>03</span><h3>{tr("Load unpacked", "加载已解压的扩展程序")}</h3><p>{tr("Click Load unpacked, then select the extracted folder containing manifest.json.", "点击「加载已解压的扩展程序」，选择包含 manifest.json 的解压文件夹。")}</p></li>
          <li><span>04</span><h3>{tr("Connect, then allow sites", "连接，然后允许网站")}</h3><p>{tr("Open the extension, click Connect to Remote Arc and approve pairing. When your AI needs a site, it opens a page with one Allow button, and Chrome asks you to confirm; you can also allow the site you are on from the extension. To hand over just one tab, click Share this tab.", "打开扩展，点击 Connect to Remote Arc 并批准配对。AI 需要某个网站时，会打开一个只有「允许」按钮的页面，Chrome 会再请你确认；你也可以在扩展里直接允许当前网站。只想交出一个标签页时，点击 Share this tab。")}</p></li>
        </ol>
      </section>

      <section className="chromeGuideDetails">
        <div><h2>{tr("You control sites and tabs", "网站和标签页由你控制")}</h2><p>{tr("Your AI works only on sites you allowed and on tabs you shared; it cannot see your other tabs. A shared tab starts read-only until you enable Click & fill for it. Anything that orders, pays, posts or submits needs the AI to mark it and is sent once. Passwords, card numbers and file pickers are never filled; Complete sign-in, verification codes and CAPTCHAs in your browser yourself, then your AI can continue. Remove a site in the extension, or in Chrome's site settings, at any time. Clicks are page events, so a few sites that only accept real input may ignore them; use the Runner there.", "AI 只能在你允许的网站和你共享的标签页上工作，看不到你的其他标签页。共享的标签页默认只读，你开启「点击与填写」后才能操作。下单、付款、发布或提交需要 AI 明确标记，并且只发送一次。密码、卡号和文件选择框一律不会填写；登录、验证码和人机验证需要你在浏览器中完成，完成后 AI 可以继续。随时可以在扩展或 Chrome 的网站设置里移除网站。点击是网页事件，少数只接受真实输入的网站可能不响应，那时请用 Runner。")}</p></div>
        <div><h2>{tr("What happens when you update?", "扩展如何更新？")}</h2><p>{tr("The website ZIP is rebuilt from the repository's current extension source on production deployments. An extension installed with Load unpacked does not update by itself: download and extract the new version, then reload the extension in Chrome.", "官网的 ZIP 在生产部署时会从当前扩展源码重新打包。通过「加载已解压的扩展程序」安装的扩展不会自行升级；更新时请下载并解压新版，再到 Chrome 扩展页重新加载。")}</p></div>
      </section>
      <nav className="chromeGuideFooter" aria-label={tr("Related documentation", "相关文档")}>
        <a href="/docs/mcp">{tr("Remote MCP reference", "Remote MCP 工具文档")} ↗</a>
        <a href="/security-model">{tr("Security and permissions", "安全与权限说明")} ↗</a>
        <a href="/connect-ai">{tr("Connect your AI client", "连接 AI 客户端")} ↗</a>
      </nav>
    </main>
  );
}
