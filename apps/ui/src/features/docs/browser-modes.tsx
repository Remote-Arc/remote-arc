import React from "react";
import { useI18n } from "../../app/i18n.js";
import { localizedWebsiteHref } from "../../lib/marketing-paths.js";
import "./browser-modes.css";

type Mode = {
  id: string; name: string; badge: string; fit: string;
  steps: string[]; can: string[]; limits: string[];
  href: string; cta: string;
};

export function BrowserModes({ primary = false }: { primary?: boolean }) {
  const { tr, locale } = useI18n();
  const Heading = primary ? "h1" : "h2";
  const modes: Mode[] = [
    {
      id: "runner", name: tr("Runner", "Runner 独立浏览器"), badge: tr("Default", "默认方式"),
      fit: tr("Complete forms and longer tasks in a hidden browser on your computer that never interrupts you.", "在电脑上的隐藏浏览器中完成表单填写和多步骤任务，不打扰你。"),
      steps: [
        tr("Enable Browser Runner for the computer in Dashboard.", "在 Dashboard 为电脑开启 Browser Runner。"),
        tr("When a page needs you (a sign-in or CAPTCHA), your AI asks first; the window appears when you are ready and hides again after.", "页面需要你（登录或 CAPTCHA）时，AI 会先问你；你准备好后窗口才出现，处理完自动隐藏。"),
      ],
      can: [
        tr("Multi-step work: click, type, choose, upload files and read pages, with real mouse and keyboard input.", "多步骤操作：点击、输入、选择、上传文件、读取页面，使用真实的鼠标和键盘输入。"),
        tr("Keeps its own sign-ins per profile, so you sign in once and later tasks reuse it.", "每个配置文件保存自己的登录状态，登录一次，后续任务复用。"),
        tr("Fills passwords you saved on the computer without your AI seeing them.", "填写你保存在电脑上的密码，AI 看不到。"),
        tr("Sends orders, posts and other submits once, and keeps a checkpoint so a task can resume in a new conversation.", "下单、发布等提交只发送一次；保留检查点，任务可以在新对话里接着做。"),
        tr("Up to 4 tasks at once on one computer.", "一台电脑最多同时运行 4 个任务。"),
      ],
      limits: [
        tr("Needs the computer Agent in terminal mode and a Chrome, Edge or Chromium installed.", "需要电脑 Agent 处于终端模式，并安装了 Chrome、Edge 或 Chromium。"),
        tr("Uses its own sign-ins, not the ones in your everyday Chrome.", "使用独立的登录状态，不是你日常 Chrome 里的登录。"),
        tr("It is a fresh, automated browser, so some sites (such as the Cloudflare dashboard) show it more human checks. When the Chrome Companion is online, your AI moves such pages to a new tab in your own browser.", "它是全新的自动化浏览器，有些网站（比如 Cloudflare 后台）会更频繁地要求人机验证。Chrome 扩展在线时，AI 会把这类页面转到你自己浏览器的新标签页里继续。"),
        tr("You complete sign-in, verification codes, CAPTCHAs and payment details yourself.", "登录、验证码、人机验证和支付信息需要你自己完成。"),
        tr("Each task stays on the sites it was started for; adding a site needs your approval in Dashboard.", "每个任务只能访问启动时指定的网站；增加网站需要你在 Dashboard 里批准。"),
      ],
      href: "/docs/mcp#browser-runner", cta: tr("Runner setup", "查看 Runner 设置"),
    },
    {
      id: "companion", name: tr("Chrome Companion", "Chrome 扩展"), badge: tr("Sites you allow", "你允许的网站"),
      fit: tr("Let your AI open tabs and work on the sites you allow in your everyday Chrome, or share the tabs you have open.", "让 AI 在你日常的 Chrome 里、你允许的网站上打开标签页并操作，或共享你已经打开的标签页。"),
      steps: [
        tr("Download the extension ZIP and load it unpacked in Chrome.", "下载扩展 ZIP，并在 Chrome 中加载已解压的扩展程序。"),
        tr("Pair it, then allow a site once when your AI asks (one Allow button, then Chrome's prompt), share one tab, or share every tab in a window.", "配对扩展；AI 需要某个网站时允许一次（一个「允许」按钮，再加 Chrome 的确认），或共享一个标签页，或一次共享整个窗口的标签页。"),
      ],
      can: [
        tr("Works signed in as you, in your own Chrome, with no control banner and no prompt per connection.", "在你自己的 Chrome 里、用你已登录的身份工作，没有受控提示条，也不需要每次连接都允许。"),
        tr("Opens tabs on allowed sites in a Remote Arc tab group, and keeps a shared tab shared while it stays on its site.", "在允许的网站上打开标签页，放进 Remote Arc 标签组；共享的标签页在同一网站内跳转时保持共享。"),
        tr("Reads pages, clicks, fills, selects, presses keys, scrolls, fills whole forms, navigates and waits for a page.", "读取页面、点击、填写、选择、按键、滚动、一次填写整个表单、跳转和等待页面。"),
        tr("Fills an API key or token you enter on a Remote Arc page, once, on the site it was asked for, without your AI seeing it.", "把你在 Remote Arc 页面上填写的 API Key 或 Token，只在指定网站上填写一次，AI 看不到。"),
        tr("Sends orders and posts once.", "下单和发布只发送一次。"),
      ],
      limits: [
        tr("Must be installed. It is an unpacked beta that does not update itself; Dashboard Devices shows when a newer version is out.", "需要安装。目前是解压安装的 Beta，不会自动更新；有新版本时 Dashboard 的设备列表会提示。"),
        tr("Never fills password, card-number, CAPTCHA or file-picker fields, not even with a one-time secret, so it cannot upload files.", "从不填写密码、卡号、人机验证和文件选择字段，一次性密钥也不行，所以不能上传文件。"),
        tr("Clicks and keys are page events; a few sites that accept only real input ignore them.", "点击和按键是网页事件，少数只接受真实输入的网站不会响应。"),
        tr("A page snapshot lists up to 250 controls: open dialogs and the page's own content come first, site navigation last.", "页面快照最多列出 250 个控件：先列弹窗和页面正文，最后才是网站导航。"),
        tr("A shared tab stops being shared when it moves to another site you have not allowed, and sharing ends when Chrome restarts.", "共享的标签页跳到你没有允许的其他网站时会停止共享；Chrome 重启后共享也会结束。"),
      ],
      href: "/chrome-extension#chrome-steps-title", cta: tr("Extension installation", "查看扩展安装步骤"),
    },
    {
      id: "your-chrome", name: tr("Connect your Chrome", "连接你的 Chrome"), badge: tr("Advanced · only if you ask", "高级 · 你要求时才用"),
      fit: tr("Your AI uses Runner unless you ask for this. Then a task uses the accounts you are already signed into in Chrome, in its own new window.", "除非你明确要求，AI 都使用 Runner。你要求时，任务会在新的专用窗口中沿用你已经登录 Chrome 的网站账号。"),
      steps: [
        tr("Use Chrome 144 or later. In chrome://inspect/#remote-debugging, enable remote debugging.", "使用 Chrome 144 或更新版本，在 chrome://inspect/#remote-debugging 开启远程调试。"),
        tr("Ask your AI to connect your Chrome, then click Allow in Chrome. Tasks share that connection until it disconnects.", "让 AI 连接你的 Chrome，并在 Chrome 中点击「允许」。连接保持期间，后续任务共用这次连接。"),
      ],
      can: [
        tr("Uses the sign-ins already in your Chrome.", "沿用你 Chrome 里已有的登录状态。"),
        tr("Everything Runner can do, including real input, file uploads, one-time submits and checkpoints.", "Runner 能做的都能做，包括真实输入、上传文件、提交只发送一次和检查点。"),
        tr("Each task works in its own window on its own sites; your other tabs stay yours.", "每个任务只在自己的窗口和指定网站上工作，你原来的标签页由你继续使用。"),
      ],
      limits: [
        tr("Needs the computer Agent, Chrome 144 or later and remote debugging turned on.", "需要电脑 Agent、Chrome 144 或更新版本，并开启远程调试。"),
        tr("Chrome asks you to click Allow for every new connection and shows a control banner while connected, which can interrupt what you are doing.", "每次新连接都需要在 Chrome 里点「允许」，连接期间会显示受控提示，可能打断你手上的事。"),
        tr("Your AI never chooses it by itself.", "AI 不会自己选择这种方式。"),
      ],
      href: "/docs/mcp#your-chrome", cta: tr("Chrome connection steps", "查看 Chrome 连接步骤"),
    },
  ];
  return <section className="browserModes" aria-labelledby="browser-modes-title">
    <Heading id="browser-modes-title">{tr("Three ways to work with your browser", "三种浏览器使用方式")}</Heading>
    <p className="browserModesIntro">{tr("Runner is the default: a hidden task browser with its own sign-ins that never interrupts you. Chrome Companion works through an extension in your own Chrome, signed in as you are. Connecting your running Chrome is an advanced option, used only when you ask. Runner modes require the computer Agent; Chrome Companion pairs separately.", "默认使用 Runner：隐藏的任务浏览器，有自己的登录状态，不打扰你。Chrome 扩展通过扩展程序在你自己的 Chrome 里、用你已登录的身份工作。连接你正在用的 Chrome 是高级选项，只有你要求时才用。Runner 模式需要电脑 Agent；Chrome 扩展单独配对。")}</p>
    <div className="browserModesGrid">{modes.map(mode => <article key={mode.id}>
      <span className="browserModeBadge">{mode.badge}</span><h3>{mode.name}</h3><p>{mode.fit}</p>
      <ol>{mode.steps.map(step => <li key={step}>{step}</li>)}</ol>
      <h4 className="browserModeListTitle">{tr("What it can do", "能做什么")}</h4>
      <ul className="browserModeCan">{mode.can.map(item => <li key={item}>{item}</li>)}</ul>
      <h4 className="browserModeListTitle">{tr("Limits", "限制")}</h4>
      <ul className="browserModeLimits">{mode.limits.map(item => <li key={item}>{item}</li>)}</ul>
      <a href={localizedWebsiteHref(mode.href, locale)}>{mode.cta} →</a>
    </article>)}</div>
  </section>;
}
