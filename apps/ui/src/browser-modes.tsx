import React from "react";
import { useI18n } from "./i18n.js";
import { localizedWebsiteHref } from "./marketing-paths.js";
import "./browser-modes.css";

export function BrowserModes({ primary = false }: { primary?: boolean }) {
  const { tr, locale } = useI18n();
  const Heading = primary ? "h1" : "h2";
  const modes = [
    {
      id: "runner", name: tr("Runner", "Runner 独立浏览器"), badge: tr("Default", "默认方式"),
      fit: tr("Complete forms and longer tasks in a hidden browser on your computer that never interrupts you.", "在电脑上的隐藏浏览器中完成表单填写和多步骤任务，不打扰你。"),
      steps: [tr("Enable Browser Runner for the computer in Dashboard.", "在 Dashboard 为电脑开启 Browser Runner。"), tr("When a page needs you (a sign-in or CAPTCHA), your AI asks first; the window appears when you are ready and hides again after. Sign in once and later tasks reuse it; saved passwords are filled locally and never shown to your AI.", "页面需要你（登录或 CAPTCHA）时，AI 会先问你；你准备好后窗口才出现，处理完自动隐藏。登录一次，后续任务复用；保存的密码在本机填写，AI 看不到。")],
      limit: tr("Uses its own sign-ins. Complete sign-in, verification codes and CAPTCHAs in the task browser yourself, then your AI can continue. Payment details also need you.", "使用独立的登录状态。登录、验证码和人机验证需要你在任务浏览器中完成，完成后 AI 可以继续。支付信息也需要你处理。"),
      href: "/docs/mcp#browser-runner", cta: tr("Runner setup", "查看 Runner 设置"),
    },
    {
      id: "companion", name: tr("Chrome Companion", "Chrome 扩展"), badge: tr("Sites you allow", "你允许的网站"),
      fit: tr("Let your AI open tabs and work on the sites you allow in your everyday Chrome, or share one tab you have open.", "让 AI 在你日常的 Chrome 里、你允许的网站上打开标签页并操作，或只共享你打开的某一个标签页。"),
      steps: [tr("Download the extension ZIP and load it unpacked in Chrome.", "下载扩展 ZIP，并在 Chrome 中加载已解压的扩展程序。"), tr("Pair it, then allow a site once when your AI asks (one Allow button, then Chrome's prompt), or share a single tab.", "配对扩展；AI 需要某个网站时允许一次（一个「允许」按钮，再加 Chrome 的确认），或只共享某一个标签页。")],
      limit: tr("No control banner and no prompt per connection, but it must be installed. Passwords, card numbers and file pickers are never filled; orders and posts are sent once. A few sites ignore scripted clicks. Unpacked beta; updates are manual.", "没有受控提示条，也不需要每次连接都允许，但需要安装。密码、卡号和文件选择框不会填写；下单和发布只发送一次。少数网站不响应脚本点击。当前为解压安装 Beta，需要手动更新。"),
      href: "/chrome-extension#chrome-steps-title", cta: tr("Extension installation", "查看扩展安装步骤"),
    },
    {
      id: "your-chrome", name: tr("Connect your Chrome", "连接你的 Chrome"), badge: tr("Advanced · only if you ask", "高级 · 你要求时才用"),
      fit: tr("Your AI uses Runner unless you ask for this. Then a task uses the accounts you are already signed into in Chrome, in its own new window.", "除非你明确要求，AI 都使用 Runner。你要求时，任务会在新的专用窗口中沿用你已经登录 Chrome 的网站账号。"),
      steps: [tr("Use Chrome 144 or later. In chrome://inspect/#remote-debugging, enable remote debugging.", "使用 Chrome 144 或更新版本，在 chrome://inspect/#remote-debugging 开启远程调试。"), tr("Ask your AI to connect your Chrome, then click Allow in Chrome. Tasks share that connection until it disconnects.", "让 AI 连接你的 Chrome，并在 Chrome 中点击「允许」。连接保持期间，后续任务共用这次连接。")],
      limit: tr("Chrome asks you to click Allow for every new connection and shows a control banner while connected, which can interrupt what you are doing. Tasks use their own windows and named sites; your other tabs stay yours.", "每次新连接都需要在 Chrome 里点「允许」，连接期间会显示受控提示，可能打断你手上的事。任务只使用自己的窗口和指定网站，你原来的标签页由你继续使用。"),
      href: "/docs/mcp#your-chrome", cta: tr("Chrome connection steps", "查看 Chrome 连接步骤"),
    },
  ];
  return <section className="browserModes" aria-labelledby="browser-modes-title">
    <Heading id="browser-modes-title">{tr("Three ways to work with your browser", "三种浏览器使用方式")}</Heading>
    <p className="browserModesIntro">{tr("Runner is the default: a hidden task browser with its own sign-ins that never interrupts you. Chrome Companion works through an extension in your own Chrome. Connecting your running Chrome is an advanced option, used only when you ask. Runner modes require the computer Agent; Chrome Companion pairs separately.", "默认使用 Runner：隐藏的任务浏览器，有自己的登录状态，不打扰你。Chrome 扩展通过扩展程序在你自己的 Chrome 里工作。连接你正在用的 Chrome 是高级选项，只有你要求时才用。Runner 模式需要电脑 Agent；Chrome 扩展单独配对。")}</p>
    <div className="browserModesGrid">{modes.map(mode => <article key={mode.id}>
      <span className="browserModeBadge">{mode.badge}</span><h3>{mode.name}</h3><p>{mode.fit}</p>
      <ol>{mode.steps.map(step => <li key={step}>{step}</li>)}</ol>
      <p className="browserModeLimit">{mode.limit}</p>
      <a href={localizedWebsiteHref(mode.href, locale)}>{mode.cta} →</a>
    </article>)}</div>
  </section>;
}
