import React from "react";
import { CHATGPT_PLUGIN_URL } from "./client-links.js";
import { InstallCommands } from "./install-commands.js";
import { useI18n } from "./i18n.js";
import { localizedWebsiteHref } from "./marketing-paths.js";
import "./chatgpt-plugin-setup.css";

export function ChatGptPluginSetup({ endpoint }: { endpoint: string }) {
  const { tr, locale } = useI18n();
  const firstPrompt = tr(
    "List my Remote Arc computers and show which are online. Do not change any files.",
    "列出我的 Remote Arc 电脑，告诉我哪些在线，不要修改任何文件。",
  );
  return <div className="chatgptPluginSetup">
    <nav className="pluginSetupTrail" aria-label={tr("Setup steps", "安装步骤")}>
      <a href="#installation-client">01 · {tr("Install plugin", "安装插件")}</a>
      <a href="#installation-command">02 · {tr("Pair computer", "配对电脑")}</a>
      <a href="#installation-verify">03 · {tr("Try in chat", "聊天验证")}</a>
    </nav>

    <section id="installation-client" className="pluginSetupStep pluginSetupListing">
      <div>
        <span className="eyebrow">01 / {tr("PUBLISHED CHATGPT PLUGIN", "已上架 CHATGPT 插件")}</span>
        <h2>{tr("Install Remote Arc from ChatGPT Plugins.", "在 ChatGPT 安装 Remote Arc 插件。")}</h2>
        <p>{tr("Open the Remote Arc listing by BAIYANG YAO. Install or enable the plugin, then connect your Remote Arc account and review the requested permissions. If it is already installed, you may see Manage or Try in chat instead.", "打开开发者为 BAIYANG YAO 的 Remote Arc 详情页。安装或启用插件，连接你的 Remote Arc 账号并检查授权；已安装时可能显示 Manage 或 Try in chat。")}</p>
        <a className="primaryButton" href={CHATGPT_PLUGIN_URL} target="_blank" rel="noopener noreferrer">{tr("Open Remote Arc in ChatGPT", "在 ChatGPT 打开 Remote Arc")} ↗</a>
        <p className="pluginSetupHint">{tr("Use the published listing. You do not need to create a custom MCP server for this route. Workspace administrators may still control which plugins are available.", "这条路径直接使用已上架插件，无需创建 Custom MCP Server。组织管理员仍可能限制插件的使用。")}</p>
      </div>
      <figure>
        <img src="/chatgpt-setup/01-public-plugin.png" alt={tr("Published Remote Arc 1.0.0 listing in ChatGPT, showing Manage and Try in chat", "ChatGPT 中已发布的 Remote Arc 1.0.0 详情页，显示 Manage 和 Try in chat")} loading="lazy" />
        <figcaption>{tr("Published listing · buttons vary with installation status", "已发布详情页 · 按钮随安装状态变化")}</figcaption>
      </figure>
    </section>

    <section id="installation-command" className="pluginSetupStep">
      <span className="eyebrow">02 / {tr("ON THE COMPUTER YOU WANT TO USE", "在你希望使用的电脑上操作")}</span>
      <h2>{tr("Install the Agent and pair your computer.", "安装 Agent，并配对你的电脑。")}</h2>
      <p>{tr("Try in chat opens a conversation; it does not install anything on your computer. Run the command below in Terminal on macOS/Linux or PowerShell on Windows, on the computer you want ChatGPT to access.", "Try in chat 只会打开聊天，不会在电脑上自动安装程序。请在希望 ChatGPT 访问的电脑上运行下方命令：macOS / Linux 使用终端，Windows 使用 PowerShell。")}</p>
      <InstallCommands />
      <p><a href={localizedWebsiteHref("/downloads", locale)}>{tr("No Node.js? Use a native download or another installation method", "没有 Node.js？使用原生下载或其他安装方式")} →</a></p>
      <ol className="pluginSetupChecklist">
        <li>{tr("Follow the browser pairing page and sign in to the same Remote Arc account you connected in ChatGPT.", "按浏览器配对页面提示，登录与 ChatGPT 插件连接时相同的 Remote Arc 账号。")}</li>
        <li>{tr("Match the pairing code, approve your computer and choose its permissions. Start with reading; enable editing or terminal access only when you need them.", "核对配对码、授权这台电脑并选择权限。从读取开始，按需开启编辑或终端权限。")}</li>
        <li>{tr("Keep the Agent running and the computer awake and online. Use the background connection option if you want it to stay connected after closing the terminal.", "保持 Agent 运行、电脑唤醒且联网。希望关闭终端后仍连接时，使用后台连接选项。")}</li>
      </ol>
      <a href="https://agent.remotearc.app/devices" target="_blank" rel="noopener noreferrer">{tr("Check your paired computers", "检查已配对电脑")} ↗</a>
    </section>

    <section id="installation-verify" className="pluginSetupStep">
      <span className="eyebrow">03 / {tr("VERIFY THE CONNECTION", "验证连接")}</span>
      <h2>{tr("Return to ChatGPT and try a read-only request.", "回到 ChatGPT，先试一个只读请求。")}</h2>
      <p>{tr("Choose Try in chat from the listing, or select Remote Arc in your conversation. Send this prompt:", "在插件详情页选择 Try in chat，或在对话中选择 Remote Arc，然后发送：")}</p>
      <blockquote>{firstPrompt}</blockquote>
      <p>{tr("Setup is complete when ChatGPT returns the correct computer name and shows it online. You can then ask it to inspect a permitted folder before trying edits or commands.", "ChatGPT 返回正确的电脑名称并显示在线，才表示安装完成。之后先读取一个允许访问的目录，再尝试编辑或运行命令。")}</p>
      <div className="pluginSetupTroubleshooting">
        <details><summary>{tr("No computers found", "没有找到电脑")}</summary><p>{tr("If you have not paired a computer, complete step 2. If you already paired one, compare the Remote Arc account used during pairing with the account connected to the plugin. An empty list can mean an account mismatch; reinstalling the Agent is not the first step.", "尚未配对时先完成第 2 步；已经配对时，核对配对账号与插件连接的 Remote Arc 账号是否一致。列表为空也可能是账号不一致，不要先反复重装 Agent。")}</p></details>
        <details><summary>{tr("My computer is listed but offline", "电脑已列出，但显示离线")}</summary><p>{tr("Wake the computer, check its internet connection, and start the installed Agent again. Confirm the online status in your device dashboard. Pairing and installing the plugin do not keep a powered-off computer online.", "唤醒电脑、检查网络，并重新启动已安装的 Agent，然后在设备控制台确认在线状态。配对和安装插件不会让关机的电脑保持在线。")}</p></details>
        <details><summary>{tr("Connected Apps in the public plugin", "公开插件中的 Apps 集成")}</summary><p>{tr("The public ChatGPT plugin currently provides computer and browser tools. Its two connected-App tools are still under review. Apps remain available in Arc and supported custom MCP connections; installing the public plugin does not unlock those two tools yet.", "公开 ChatGPT 插件目前提供电脑与浏览器工具，两个 Apps 工具仍在审核。Arc 及受支持的 Custom MCP 连接仍可使用 Apps；安装公开插件暂不会解锁这两个工具。")}</p></details>
      </div>
    </section>

    <details id="custom-mcp" className="pluginSetupAdvanced">
      <summary>{tr("Advanced: connect a custom MCP server instead", "高级：改用 Custom MCP 连接")}</summary>
      <p>{tr("Custom MCP is still supported for compatible accounts and clients. If you deliberately choose this route, use your client's custom MCP settings, enter the endpoint below, choose OAuth and authorize the same Remote Arc account. You only need one connection route for each client.", "兼容的账号和客户端仍可使用 Custom MCP。选择这条路径时，在客户端的自定义 MCP 设置中填写下方地址，使用 OAuth 并授权同一个 Remote Arc 账号。每个客户端选择一条接入路径即可。")}</p>
      <pre className="docsExample"><code>{endpoint}</code></pre>
      <p><a href={localizedWebsiteHref("/remote-mcp", locale)}>{tr("Custom MCP and other AI clients", "Custom MCP 与其他 AI 客户端指南")} →</a></p>
    </details>
  </div>;
}
