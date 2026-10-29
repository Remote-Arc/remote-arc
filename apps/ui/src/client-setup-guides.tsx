import React from "react";
import { ClientInstallWalkthrough } from "./client-install-walkthrough.js";
import { ChatGptPluginSetup } from "./chatgpt-plugin-setup.js";
import { useI18n } from "./i18n.js";
import "./client-setup-guides.css";

type Client = "chatgpt" | "claude" | "gemini" | "cursor";
const claudeConnectors = "https://claude.ai/customize/connectors";
const geminiConnectors = "https://gemini.google.com/apps";
const geminiDocs = "https://support.google.com/gemini/answer/17209137";
const claudeDocs = "https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp";
const cursorDocs = "https://cursor.com/docs/mcp";
const cursorCustomize = "https://cursor.com/docs/customize-cursor";
const cursorInstallDocs = "https://prod.cursor.com/docs/mcp/install-links";

function OutLink({ href, children }: { href: string; children: React.ReactNode }) {
  return <a href={href} target="_blank" rel="noopener noreferrer">{children} ↗</a>;
}

export function ClientMcpGuide({
  client, endpoint, cursorInstallUrl, copyEndpoint,
}: {
  client: Client; endpoint: string; cursorInstallUrl: string; copyEndpoint: React.ReactNode;
}) {
  const { tr } = useI18n();
  if (client === "chatgpt") return <ChatGptPluginSetup endpoint={endpoint} />;
  const info = client === "claude"
      ? {
        destination: claudeConnectors,
        destinationLabel: tr("Open Claude Connectors", "打开 Claude Connectors"),
        path: tr("Customize → Connectors → + Add → Add custom connector", "Customize → Connectors → ＋ Add → Add custom connector"),
        steps: [
          tr("Open Claude Customize → Connectors and add a custom remote connector. For Team or Enterprise, an owner first adds it in Organization settings; each member then connects their own account.",
            "打开 Claude 的 Customize → Connectors，添加自定义远程连接。Team 或 Enterprise 先由所有者在组织设置中添加，再由每位成员关联自己的账号。"),
          tr("Set the name to Remote Arc and paste the HTTPS MCP endpoint below. Continue, select Sign in now and Use Claude’s published identity for OAuth, then Add.",
            "名称填写 Remote Arc，粘贴下方 HTTPS MCP 地址。点击 Continue，选择 Sign in now 与 Use Claude’s published identity，再点击 Add。"),
          tr("Click Connect and finish Remote Arc OAuth. In a chat, enable Remote Arc from + → Connectors, review tool permissions and ask Claude to use it.",
            "点击 Connect 并完成 Remote Arc OAuth。在对话中通过 ＋ → Connectors 启用 Remote Arc，检查工具权限后开始使用。"),
        ],
        docs: claudeDocs,
        access: claudeDocs,
        important: tr("Team/Enterprise organization members may need an admin or owner to add the connector under Organization settings → Connectors first; each member then connects their own account.",
          "Team / Enterprise 成员可能需要管理员先从 Organization settings → Connectors 添加 Connector，随后成员各自连接自己的账户。"),
      }
      : client === "gemini"
        ? {
            destination: geminiConnectors,
            destinationLabel: tr("Open Gemini Connectors", "打开 Gemini Connectors"),
            path: tr("Settings → Connected Apps → Custom apps", "Settings → Connected Apps → Custom apps"),
            steps: [
              tr(
                "In Gemini on the web, open Settings → Connected Apps (or Personal Intelligence → Connected Apps). Under Custom apps, add https://mcp.remotearc.app/mcp and continue.",
                "在 Gemini 网页版进入 Settings → Connected Apps；部分账号位于 Personal Intelligence 下。在 Custom apps 中添加 https://mcp.remotearc.app/mcp，再继续。",
              ),
              tr(
                "Review Google's account linking consent. If you trust the connection, finish authorization and choose Remote Arc as the custom app name.",
                "查看 Google 账户关联授权范围，确认信任后完成授权，将自定义 App 命名为 Remote Arc。",
              ),
              tr(
                "Finish the connection and review the available actions. Enter @ in a chat and select Remote Arc to use the custom app.",
                "完成连接并核对可用操作，在对话中输入 @ 并选择 Remote Arc 开始使用。",
              ),
            ],
            docs: geminiDocs,
            access: geminiDocs,
            important: tr(
              "Google currently limits custom apps to eligible personal accounts, age 18+, in the US, in English, with Keep Activity on. Add them on the web; work and school accounts are not supported. Check Google's current requirements if the option is missing.",
              "Google 当前仅向美国年满 18 岁、使用英语并开启 Keep Activity 的合资格个人账号提供自定义应用。需在网页版添加，工作和学校账号尚不支持；缺少入口时请核对 Google 最新条件。",
            ),
          }
      : {
        destination: cursorInstallUrl,
        destinationLabel: tr("Add to Cursor (one click)", "一键添加到 Cursor"),
        path: tr("Customize → MCPs → Manage", "Customize → MCPs → 管理"),
        steps: [
          tr("The easiest option is Add to Cursor above. Approve the Remote Arc server configuration in the Cursor application.",
            "最简单的方法是点击上面的「一键添加到 Cursor」，在 Cursor 应用内确认 Remote Arc MCP 配置。"),
          tr("For manual setup, open Cursor → Customize → MCPs. Configure a remote HTTP MCP server in your user ~/.cursor/mcp.json or project .cursor/mcp.json using the JSON below.",
            "手动配置时，打开 Cursor → Customize → MCPs，在用户级 ~/.cursor/mcp.json 或项目级 .cursor/mcp.json 中按下方 JSON 添加 Remote HTTP MCP 服务。"),
          tr("Complete the OAuth sign-in when prompted, confirm the server is enabled and its tools are available in Agent. In MCPs you can review status and disable the connection.",
            "根据提示完成 OAuth 登录，确认服务已启用且工具出现在 Agent；可以在 MCPs 页面检查状态或关闭连接。"),
        ],
        docs: cursorDocs,
        access: cursorInstallDocs,
        important: tr("Do NOT put npx remotelink in Cursor's MCP server command field. Cursor connects to the hosted HTTPS MCP endpoint; npx remotelink runs independently on the computer you want to control.",
          "不要把 npx remotelink 填进 Cursor 的 MCP Server command！Cursor 要连接托管的 HTTPS MCP 地址；npx remotelink 则独立运行在你要控制的电脑上。"),
      };

  return <section className="installClientDetails" id="installation-client">
    <div className="installClientDetailsHeading">
      <div>
        <span className="eyebrow">{tr("REQUIRED · AI CLIENT", "必需 · AI 客户端")}</span>
        <h2>{tr("Add Remote Arc inside ", "在客户端中添加 Remote Arc · ") + (client === "claude" ? "Claude" : client === "gemini" ? "Gemini" : "Cursor")}</h2>
        <p>{tr("This is a separate step from pairing your computer. Without the app / connector, your AI cannot call Remote Arc tools even if the agent is running.",
          "这一步与配对电脑相互独立。即使本地 Agent 正在运行，没有安装 MCP App / Connector，AI 也无法调用 Remote Arc 工具。")}</p>
      </div>
      <OutLink href={info.destination}>{info.destinationLabel}</OutLink>
    </div>
    <div className="installUiTrail">
      <small>{tr("Click path in the app", "在平台内的点击路径")}</small>
      <strong>{info.path}</strong>
    </div>
    {client === "cursor" && <ol className="installClientChecklist">
      {info.steps.map((step, i) => <li key={i}><span>{String(i + 1).padStart(2, "0")}</span><p>{step}</p></li>)}
    </ol>}
    <div className="installEndpointPanel">
      <div><small>{tr("PASTE THIS REMOTE MCP URL", "在平台里粘贴这个 REMOTE MCP 地址")}</small><div className="docsCodeLine"><code>{endpoint}</code>{copyEndpoint}</div></div>
      <p>{tr("Connection name", "连接名称")}: <strong>Remote Arc</strong> · {tr("Transport", "传输方式")}: <strong>Streamable HTTP + OAuth</strong></p>
    </div>
    {client !== "cursor" && <ClientInstallWalkthrough client={client} />}
    {client === "cursor" && <div className="installCursorJson">
      <strong>{tr("Manual alternative · mcp.json", "手动备选 · mcp.json")}</strong>
      <pre>{JSON.stringify({mcpServers:{"remote-arc":{url:endpoint}}},null,2)}</pre>
    </div>}
    <div className="installClientSupport">
      <p>{info.important}</p>
      <nav aria-label={tr("Official setup references", "平台官方操作指南")}>
        <OutLink href={info.docs}>{tr("Official UI walkthrough", "官方界面操作说明")}</OutLink>
        {info.access !== info.docs && <OutLink href={info.access}>{tr("Account availability and permissions", "账号资格与权限")}</OutLink>}
        {client === "cursor" && <OutLink href={cursorCustomize}>{tr("Cursor Customize UI", "Cursor Customize 页面")}</OutLink>}
      </nav>
    </div>
  </section>;
}
