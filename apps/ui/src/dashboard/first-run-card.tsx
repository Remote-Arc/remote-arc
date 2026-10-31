import { useState } from "react";
import { InstallCommands } from "../install-commands.js";
import { ProductIcon } from "../product-icon.js";
import type { DashboardModel } from "./use-dashboard-model.js";

const dismissKey = (userId: string) => "remotearc.firstRun.dismissed:" + userId;

// Shown on Overview until the user pairs a computer (a browser extension is
// not one). Inline and dismissible, never a modal over the dashboard.
export function FirstRunCard({ m }: { m: DashboardModel }) {
  const { devices, navigateTab, setShowAdd, tr, user } = m;
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(dismissKey(user.id)) === "1"; } catch { return false; }
  });
  if (dismissed || devices.some((device) => device.platform !== "browser")) return null;
  const dismiss = () => {
    setDismissed(true);
    try { localStorage.setItem(dismissKey(user.id), "1"); } catch { /* The card stays hidden for this visit. */ }
  };
  return (
    <section className="firstRunCard" aria-labelledby="first-run-title">
      <header>
        <div>
          <span className="eyebrow">{tr("GET STARTED", "开始使用")}</span>
          <h2 id="first-run-title">{tr("Pair your computer so your AI can work on it", "配对电脑，让 AI 在上面工作")}</h2>
          <p>{tr("About a minute. No public IP or port forwarding, and you choose which folders the AI can use.", "大约一分钟。不需要公网 IP 或端口映射，AI 能使用哪些文件夹由你决定。")}</p>
        </div>
        <button type="button" className="ghostButton firstRunHide" onClick={dismiss}>{tr("Hide", "隐藏")}</button>
      </header>
      <ol className="firstRunSteps">
        <li data-current="true">
          <strong>1 · {tr("Install and pair", "安装并配对")}</strong>
          <small>{tr("Run one command on the computer, then approve it in your browser. On Windows, download the installer.", "在要连接的电脑上运行一条命令，然后在浏览器里确认；Windows 请下载安装程序。")}</small>
          <InstallCommands />
          <button type="button" className="addButton arcRadiantCta" onClick={() => setShowAdd(true)}><ProductIcon name="add" />{tr("Open the pairing guide", "打开配对向导")}</button>
        </li>
        <li>
          <strong>2 · {tr("Connect your AI", "连接你的 AI")}</strong>
          <small>{tr("Add Remote Arc to ChatGPT, Claude or Cursor and sign in.", "在 ChatGPT、Claude 或 Cursor 中添加 Remote Arc 并登录。")}</small>
          <button type="button" className="ghostButton" onClick={() => navigateTab("connect")}>{tr("See how", "查看方法")}</button>
        </li>
        <li>
          <strong>3 · {tr("Try it", "试一试")}</strong>
          <small>{tr("Ask your AI: “List my Remote Arc computers.”", "对你的 AI 说：「列出我的 Remote Arc 电脑」。")}</small>
        </li>
      </ol>
    </section>
  );
}
