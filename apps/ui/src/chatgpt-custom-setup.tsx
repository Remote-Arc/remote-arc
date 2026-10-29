import React from "react";
import { useI18n } from "./i18n.js";

export function ChatGptCustomSetup() {
  const { tr } = useI18n();
  const steps = [
    { image: "01-create-custom-mcp.png", title: tr("Add a custom MCP server", "添加自定义 MCP Server"), body: tr("If your ChatGPT account supports custom MCP, open Plugins → + → Add custom MCP server. Name it Remote Arc, enter https://mcp.remotearc.app/mcp, select OAuth, and create the plugin.", "如果 ChatGPT 账号支持 Custom MCP，打开 Plugins → ＋ → Add custom MCP server。名称填写 Remote Arc，地址为 https://mcp.remotearc.app/mcp，选择 OAuth 并创建插件。") },
    { image: "02-plugin-ready.png", title: tr("Connect your Remote Arc account", "连接 Remote Arc 账号"), body: tr("Complete OAuth with the same Remote Arc account used to pair your computer. Open the custom plugin and choose Try in chat.", "使用配对电脑时的同一个 Remote Arc 账号完成 OAuth。打开创建好的自定义插件，选择 Try in chat。") },
    { image: "03-run-in-chat.png", title: tr("Start with a read-only request", "先执行只读请求"), body: tr("Select your custom Remote Arc connection in chat and ask it to list your computers. The local Agent must still be paired and online.", "在聊天中选择自定义 Remote Arc 连接，让它列出你的电脑。本地 Agent 仍需已配对且在线。") },
    { image: "04-mac-result.png", title: tr("Check the returned result", "核对执行结果"), body: tr("The original Mac example below shows a completed read-only session. It illustrates the custom route, not your current device status.", "下方保留的 Mac 截图展示一次已完成的只读会话，用于说明自定义接入，不代表你当前设备的状态。") },
  ];
  return <div className="pluginCustomWalkthrough">
    <p>{tr("Original Custom MCP screenshot guide. This route is optional; the published plugin above remains the primary ChatGPT setup. Menus may differ by account and ChatGPT version. Open any screenshot to see its original size.", "原 Custom MCP 截图教程。这是可选方式；上方已上架插件仍是 ChatGPT 的主要安装入口。菜单可能因账号和 ChatGPT 版本不同而变化，点击截图可查看原图。")}</p>
    <ol>{steps.map((step, index) => <li key={step.image}>
      <h3>{index + 1}. {step.title}</h3><p>{step.body}</p>
      <a href={"/chatgpt-setup/" + step.image} target="_blank" rel="noopener noreferrer" aria-label={tr("Open original screenshot: ", "查看原图：") + step.title}>
        <img src={"/chatgpt-setup/" + step.image} alt={step.title} loading="lazy" />
      </a>
    </li>)}</ol>
  </div>;
}
