import { ProductIcon } from "../product-icon.js";
import { CHATGPT_PLUGIN_URL } from "../client-links.js";
import { localizedWebsiteHref } from "../marketing-paths.js";
import { CLAUDE_CONNECTORS_URL, MARKETING_ORIGIN, cursorMcpInstallUrl } from "../app-config.js";
import { CopyButton, aiClients } from "../public-layout.js";
import type { DashboardModel } from "./use-dashboard-model.js";

// AI clients tab: Remote MCP endpoint and per-client setup.
export function ConnectView({ m }: { m: DashboardModel }) {
  const { devices, locale, mcpEndpoint, navigateTab, tr } = m;
  return (
    <>
      <section className="overviewTopbar connectPageHeader">
        <div>
          <span className="eyebrow">{tr("CONNECT AI", "连接 AI")}</span>
          <h1>{tr("AI connections", "AI 连接")}</h1>
          <p>{tr("Connect supported AI clients to your Remote Arc MCP endpoint.", "把支持的 AI 客户端连接到 Remote Arc MCP 地址。")}</p>
        </div>
        <div className="connectReadyPill"><i />{tr("Remote MCP ready", "Remote MCP 已就绪")}</div>
      </section>

      <section className="connectOverview">
        <article className="connectEndpointPanel">
          <div className="connectPanelHeader">
            <div>
              <span className="eyebrow">{tr("YOUR REMOTE MCP ENDPOINT", "你的 REMOTE MCP 地址")}</span>
              <h2>{tr("Remote MCP endpoint", "Remote MCP 地址")}</h2>
              <p>{tr("Your AI connects here. Remote Arc handles OAuth, device discovery and routing behind it.", "AI 只需要连接这个地址；OAuth、设备发现和请求路由都由 Remote Arc 处理。")}</p>
            </div>
            <span className="connectSecurityBadge">OAuth 2.1 + PKCE</span>
          </div>
          <div className="connectEndpointBox">
            <code>{mcpEndpoint}</code>
            <CopyButton value={mcpEndpoint} label={tr("Copy endpoint", "复制地址")} />
          </div>
        </article>

        <aside className="connectHealthPanel">
          <span className="eyebrow">{tr("CONNECTION STATUS", "连接状态")}</span>
          <div className="connectHealthRow"><span><i className="healthDot good" />Remote MCP</span><strong>{tr("Ready", "就绪")}</strong></div>
          <div className="connectHealthRow"><span><i className="healthDot good" />OAuth</span><strong>{tr("Enabled", "已启用")}</strong></div>
          <div className="connectHealthRow"><span><i className={"healthDot " + (devices.length ? "good" : "idle")} />{tr("Paired devices", "已配对设备")}</span><strong>{devices.length}</strong></div>
          <button className="ghostButton connectDevicesButton" onClick={() => navigateTab("devices")}>{tr("Manage devices", "管理设备")}</button>
        </aside>
      </section>

      <section className="connectClientSection">
        <div className="connectSectionHeading">
          <div><span className="eyebrow">{tr("AI CLIENTS", "AI 客户端")}</span><h2>{tr("Clients", "客户端")}</h2></div>
          <p>{tr("ChatGPT is the recommended path. Other Remote MCP clients can use the same production endpoint.", "推荐优先使用 ChatGPT；其他支持 Remote MCP 的客户端也可以使用同一个生产地址。")}</p>
        </div>

        <div className="connectClientGrid connectAgentLaunchers">
          <article className="connectClientCard primary">
            <div className="connectClientTop">
              <div className="connectClientIdentity"><img className="monoLogo" src={aiClients[0].icon} alt="" /><div><span className="eyebrow">CHATGPT</span><h3>ChatGPT</h3></div></div>
              <span className="clientState recommended">{tr("Plugins", "Plugins")}</span>
            </div>
            <p>{tr("Install the published Remote Arc plugin, connect the same account as your paired computer, then choose Try in chat. Custom MCP is an optional alternative in the setup guide.", "安装已上架的 Remote Arc 插件，连接与配对电脑相同的账号，再选择 Try in chat。安装指南中仍保留 Custom MCP 作为可选替代方式。")}</p>
            <div className="connectClientActions">
              <a className="connectAgentAction" href={CHATGPT_PLUGIN_URL} target="_blank" rel="noreferrer"><span>{tr("Open official plugin", "打开官方插件")}</span><b>↗</b></a>
              <a className="connectClientGuide" href={MARKETING_ORIGIN + localizedWebsiteHref("/install/chatgpt", locale)} target="_blank" rel="noreferrer"><ProductIcon name="book" size={14} /><span>{tr("Remote Arc setup guide", "Remote Arc 官方安装指南")}</span><span aria-hidden="true">↗</span></a>
            </div>
          </article>

          <article className="connectClientCard">
            <div className="connectClientTop">
              <div className="connectClientIdentity"><img className="colorLogo" src={aiClients[1].icon} alt="" /><div><span className="eyebrow">CLAUDE</span><h3>Claude</h3></div></div>
              <span className="clientState">{tr("Connectors", "Connectors")}</span>
            </div>
            <p>{tr("Open Claude Connectors. The Remote Arc endpoint is copied automatically so you can add it as a Remote MCP connector.", "打开 Claude Connectors；Remote Arc Endpoint 会自动复制，可直接添加为 Remote MCP Connector。")}</p>
            <div className="connectClientActions">
              <a className="connectAgentAction" href={CLAUDE_CONNECTORS_URL} target="_blank" rel="noreferrer" onClick={() => void navigator.clipboard?.writeText(mcpEndpoint).catch(() => undefined)}><span>{tr("Open Claude Connectors", "打开 Claude Connectors")}</span><b>↗</b></a>
              <a className="connectClientGuide" href={MARKETING_ORIGIN + localizedWebsiteHref("/install/claude", locale)} target="_blank" rel="noreferrer"><ProductIcon name="book" size={14} /><span>{tr("Remote Arc setup guide", "Remote Arc 官方安装指南")}</span><span aria-hidden="true">↗</span></a>
            </div>
          </article>

          <article className="connectClientCard">
            <div className="connectClientTop">
              <div className="connectClientIdentity"><img className="colorLogo" src={aiClients[2].icon} alt="" /><div><span className="eyebrow">CURSOR</span><h3>Cursor</h3></div></div>
              <span className="clientState">{tr("One-click MCP", "一键 MCP")}</span>
            </div>
            <p>{tr("Use Cursor's MCP install deeplink. Cursor reviews the Remote Arc configuration before installation and then completes OAuth.", "使用 Cursor 官方 MCP 安装 Deeplink；Cursor 会先确认 Remote Arc 配置，再完成 OAuth。")}</p>
            <div className="connectClientActions">
              <a className="connectAgentAction" href={cursorMcpInstallUrl()}><span>{tr("Add to Cursor", "添加到 Cursor")}</span><b>↗</b></a>
              <a className="connectClientGuide" href={MARKETING_ORIGIN + localizedWebsiteHref("/install/cursor", locale)} target="_blank" rel="noreferrer"><ProductIcon name="book" size={14} /><span>{tr("Remote Arc setup guide", "Remote Arc 官方安装指南")}</span><span aria-hidden="true">↗</span></a>
            </div>
          </article>

          <article className="connectClientCard">
            <div className="connectClientTop">
              <div className="connectClientIdentity"><span className="protocolMark large">M</span><div><span className="eyebrow">REMOTE MCP</span><h3>{tr("Other MCP client", "其他 MCP 客户端")}</h3></div></div>
              <span className="clientState">{tr("Manual", "手动")}</span>
            </div>
            <p>{tr("Copy the production endpoint and open the Remote MCP reference for any compatible client.", "复制生产 Endpoint，并打开 Remote MCP 参考文档用于其他兼容客户端。")}</p>
            <div className="connectClientActions">
              <a className="connectAgentAction" href={MARKETING_ORIGIN + localizedWebsiteHref("/docs/mcp", locale)} target="_blank" rel="noreferrer" onClick={() => void navigator.clipboard?.writeText(mcpEndpoint).catch(() => undefined)}><span>{tr("Copy endpoint & open docs", "复制地址并打开文档")}</span><b>↗</b></a>
              <a className="connectClientGuide" href={MARKETING_ORIGIN + localizedWebsiteHref("/remote-mcp", locale)} target="_blank" rel="noreferrer"><ProductIcon name="book" size={14} /><span>{tr("Remote Arc setup guide", "Remote Arc 官方安装指南")}</span><span aria-hidden="true">↗</span></a>
            </div>
          </article>
        </div>
      </section>

      <section className="connectGuide">
        <div className="connectSectionHeading compact">
          <div><span className="eyebrow">{tr("SETUP", "配置")}</span><h2>{tr("Connection flow", "连接流程")}</h2></div>
        </div>
        <div className="connectTimeline">
          <article><span className="timelineNumber">01</span><div><strong>{tr("Add Remote Arc", "添加 Remote Arc")}</strong><p>{tr("Choose your AI client above, follow its setup instructions and add the Remote MCP endpoint if needed.", "选择上方的 AI 客户端，按对应指南配置，必要时添加 Remote MCP 地址。")}</p></div></article>
          <article><span className="timelineNumber">02</span><div><strong>{tr("Authorize your account", "授权你的账户")}</strong><p>{tr("Remote Arc opens OAuth once. Your AI receives scoped access to the account you approve.", "Remote Arc 会打开一次 OAuth 授权；AI 只获得你批准账户范围内的权限。")}</p></div></article>
          <article><span className="timelineNumber">03</span><div><strong>{tr("Talk to a device by name", "直接说设备名称")}</strong><p>{tr("Remote Arc discovers your paired devices and enforces each device's tool policy before routing a request.", "Remote Arc 会发现已配对设备，并在路由请求前执行每台设备自己的工具权限策略。")}</p></div></article>
        </div>
      </section>

      <section className="connectTryPanel">
        <div className="connectTryCopy"><span className="eyebrow">{tr("EXAMPLES", "示例")}</span><h2>{tr("Example prompts", "示例指令")}</h2><p>{tr("Once connected, refer to the device and the task. Remote Arc handles MCP routing.", "连接后只需要说明设备和任务，MCP 路由由 Remote Arc 处理。")}</p></div>
        <div className="connectPromptGrid">
          {[
            tr("Show me my connected computers.", "看看我已连接的电脑。"),
            tr("Which of my devices are online?", "哪些设备现在在线？"),
            tr("List the projects on my Mac.", "列出我 Mac 上的项目。"),
            tr("Read package.json on my desktop.", "读取我桌面电脑上的 package.json。"),
            tr("Run the tests on my desktop.", "在我的桌面电脑上运行测试。"),
            tr("Show me the processes running on my computer.", "看看我电脑上正在运行哪些进程。"),
          ].map((prompt) => <code key={prompt}>{prompt}</code>)}
        </div>
      </section>
    </>
  );
}
