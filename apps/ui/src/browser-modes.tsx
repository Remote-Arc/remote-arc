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
      fit: tr("Complete forms and longer tasks with a separate browser profile on your computer.", "在电脑上的独立浏览器资料中，完成表单填写和多步骤任务。"),
      steps: [tr("Enable Browser Runner for the computer in Dashboard.", "在 Dashboard 为电脑开启 Browser Runner。"), tr("Sign in once in the task window, then reuse the same profile. Saved sign-ins can be filled locally without showing the password to your AI.", "在任务窗口登录一次，后续复用同一份浏览器资料；保存的登录信息可在本机填写，AI 看不到密码。")],
      limit: tr("Uses its own sign-ins. CAPTCHAs and payment details still need you.", "使用独立的登录状态。CAPTCHA 和支付信息仍需你处理。"),
      href: "/docs/mcp#browser-runner", cta: tr("Runner setup", "查看 Runner 设置"),
    },
    {
      id: "your-chrome", name: tr("Connect your Chrome", "连接你的 Chrome"), badge: tr("Existing sign-ins", "沿用现有登录"),
      fit: tr("Let a task use the accounts you are already signed into in Chrome, in its own new window.", "让任务在新的专用窗口中，沿用你已经登录 Chrome 的网站账号。"),
      steps: [tr("Use Chrome 144 or later. In chrome://inspect/#remote-debugging, enable remote debugging.", "使用 Chrome 144 或更新版本，在 chrome://inspect/#remote-debugging 开启远程调试。"), tr("Ask your AI to connect your Chrome, then click Allow in Chrome. Tasks share that connection until it disconnects.", "让 AI 连接你的 Chrome，并在 Chrome 中点击「允许」。连接保持期间，后续任务共用这次连接。")],
      limit: tr("Chrome asks again after a new connection. A control banner stays visible while connected. Tasks use their own windows and named sites; your other tabs stay yours.", "新连接仍需 Chrome 授权；连接期间会显示受控提示。任务只使用自己的窗口和指定网站，你原来的标签页由你继续使用。"),
      href: "/docs/mcp#your-chrome", cta: tr("Chrome connection steps", "查看 Chrome 连接步骤"),
    },
    {
      id: "companion", name: tr("Chrome Companion", "Chrome 扩展"), badge: tr("Selected tabs", "共享指定标签页"),
      fit: tr("Read or work with a particular tab you already have open.", "读取或操作你已经打开的某一个标签页。"),
      steps: [tr("Download the extension ZIP and load it unpacked in Chrome.", "下载扩展 ZIP，并在 Chrome 中加载已解压的扩展程序。"), tr("Pair the extension and share a tab. Enable Click & fill for that tab only when needed.", "配对扩展并共享标签页；需要交互时，再为该标签页开启 Click & fill。")],
      limit: tr("Read-only by default. No password, code, payment or file-picker filling. Unpacked beta; updates are manual.", "默认只读，不代填密码、验证码、支付和文件选择字段。当前为解压安装 Beta，需要手动更新。"),
      href: "/chrome-extension#chrome-steps-title", cta: tr("Extension installation", "查看扩展安装步骤"),
    },
  ];
  return <section className="browserModes" aria-labelledby="browser-modes-title">
    <Heading id="browser-modes-title">{tr("Three ways to work with your browser", "三种浏览器使用方式")}</Heading>
    <p className="browserModesIntro">{tr("Choose a separate task browser, your existing Chrome sign-ins, or a tab you explicitly share. Runner modes require the computer Agent; Chrome Companion pairs separately.", "可以使用独立的任务浏览器、沿用 Chrome 的登录状态，或只共享某个标签页。两种 Runner 模式需要电脑 Agent；Chrome 扩展单独配对。")}</p>
    <div className="browserModesGrid">{modes.map(mode => <article key={mode.id}>
      <span className="browserModeBadge">{mode.badge}</span><h3>{mode.name}</h3><p>{mode.fit}</p>
      <ol>{mode.steps.map(step => <li key={step}>{step}</li>)}</ol>
      <p className="browserModeLimit">{mode.limit}</p>
      <a href={localizedWebsiteHref(mode.href, locale)}>{mode.cta} →</a>
    </article>)}</div>
  </section>;
}
