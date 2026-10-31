import { WorkspaceLoading } from './workspace-loading.js';
import { HomeHeroCopy, LandingContent, HomeSecurityIntro } from "./landing-content.js";
import { InstallCommands } from "./install-commands.js";
import { HomeConnectionScene, type HomeConnectionMode } from "./home-connection-scene.js";
import { ProductFocus } from "./product-positioning.js";
import { AgentUseCases } from "./agent-use-cases.js";
import { ProductIcon } from "./product-icon.js";
import { usePlatformCatalog } from './use-platform-catalog.js';
import { DASHBOARD_PATHS } from "./dashboard-workspaces.js";
import { ArcComingSoonPageContent } from "./arc-future.js";
import { ArcRoadmapPageContent } from "./arc-roadmap.js";
import type { UseCaseSlug } from "./use-cases.js";
import React, { useEffect, useState } from "react";
import { useI18n } from "./i18n.js";
import { localizedWebsiteHref } from "./marketing-paths.js";
import { TrustPage } from "./trust-pages.js";
import { type User } from "./app-types.js";
import { CopyButton, PublicLayout, aiClients, topologyAiClients } from "./public-layout.js";
import { APP_ORIGIN, MCP_ENDPOINT, dashboardHref } from "./app-config.js";

const PricingContent = React.lazy(() => import("./pricing.js").then(module => ({ default: module.PricingContent })));
const Documentation = React.lazy(() => import("./product-docs.js").then(module => ({ default: module.Documentation })));
const McpReference = React.lazy(() => import("./product-docs.js").then(module => ({ default: module.McpReference })));
const UseCaseCatalog = React.lazy(() => import("./use-cases.js").then(module => ({ default: module.UseCaseCatalog })));
const UseCaseDetail = React.lazy(() => import("./use-cases.js").then(module => ({ default: module.UseCaseDetail })));
export function Landing({ user }: { user?: User | null }) {
  const { tr } = useI18n();
  const arcAvailable=usePlatformCatalog()?.arcAvailable===true;
  const [heroMode,setHeroMode]=useState<HomeConnectionMode>('connect');
  return (
    <PublicLayout user={user}>
      <section className="landingHero landingHero--constellation" data-product={heroMode}>
        <HomeHeroCopy mode={heroMode} arcAvailable={arcAvailable} arcHref={arcAvailable?dashboardHref(DASHBOARD_PATHS['agent-chat']):'/arc'} connectHref={dashboardHref('/dashboard/connect/overview')}/>
        <HomeConnectionScene clients={topologyAiClients} arcAvailable={arcAvailable} mode={heroMode} onModeChange={setHeroMode} />
      </section>

      <section className="trustRail" aria-label={tr("Supported AI clients", "支持的 AI 客户端")}>
        <span>{tr("Works with the AI you use", "和你常用的 AI 一起工作")}</span>
        {aiClients.map((client) => (
          <a href={"/install/" + client.slug} key={client.name}>
            <img className={client.tone === "mono" ? "monoLogo" : "colorLogo"} src={client.icon} alt="" />
            <strong>{client.name}</strong>
          </a>
        ))}
        <div><span className="miniMcp">M</span><strong>Remote MCP</strong></div>
        <small>{tr("One endpoint. No client lock-in.", "一个端点，不绑定任何 AI。")}</small>
      </section>

      <ProductFocus/>
      <HomeSecurityIntro/>
      <AgentUseCases/>

      <LandingContent />
      <section className="homepageConnectSetup" id="connect-your-computer"><div><span className="eyebrow">REMOTE ARC CONNECT</span><h2>{tr("Keep your AI. Connect your computer.","沿用你的 AI，连接自己的电脑。")}</h2><p>{tr("Use ChatGPT, Claude or another compatible MCP client with the same apps and computers. Start with one command.","用 ChatGPT、Claude 等兼容 MCP 的客户端访问同一套应用与电脑。从一条命令开始。")}</p><a href="/connect-ai">{tr("Connect setup guide","Connect 安装指南")}<ProductIcon name="arrowUpRight" size={15}/></a></div><InstallCommands/></section>
    </PublicLayout>
  );
}
const PLUGIN_DEMO_VIDEO_URL =
  "https://assets.ps6.space/remote-arc/openai-plugin-demo/remote-arc-plugin-demo.mp4";
export function ArcPage({ user }: { user?: User | null }) {
  const available=usePlatformCatalog()?.arcAvailable===true;
  return <PublicLayout user={user}><ArcComingSoonPageContent available={available} startHref={dashboardHref(DASHBOARD_PATHS['agent-chat'])}/></PublicLayout>;
}
export function RoadmapPage({ user }: { user?: User | null }) {
  return <PublicLayout user={user}><ArcRoadmapPageContent /></PublicLayout>;
}
export function DemoPage({ user }: { user?: User | null }) {
  const { tr } = useI18n();
  return (
    <PublicLayout user={user}>
      <main className="pluginDemoPage">
        <section className="pluginDemoIntro">
          <span className="eyebrow">OPENAI PLUGIN DEMO</span>
          <h1>{tr("Remote Arc in ChatGPT", "ChatGPT 中的 Remote Arc")}</h1>
          <p>
            {tr(
              "A real end-to-end session: ChatGPT discovers a paired Mac, reads the demo project, runs its Node.js tests through Remote Arc, and returns the result.",
              "一次真实的端到端演示：ChatGPT 发现已配对的 Mac，读取演示项目，通过 Remote Arc 运行 Node.js 测试，并返回结果。",
            )}
          </p>
        </section>

        <section className="pluginDemoVideoWrap" aria-label="Remote Arc plugin demonstration video">
          <video
            className="pluginDemoVideo"
            controls
            playsInline
            preload="metadata"
          >
            <source src={PLUGIN_DEMO_VIDEO_URL} type="video/mp4" />
            {tr(
              "Your browser does not support HTML5 video.",
              "你的浏览器不支持 HTML5 视频。",
            )}
          </video>
        </section>

        <div className="pluginDemoMeta">
          <span>{tr("Recorded 27 Sep 2026", "录制于 2026 年 9 月 27 日")}</span>
          <span aria-hidden="true">·</span>
          <span>{tr("macOS · real Remote Arc connection", "macOS · 真实 Remote Arc 连接")}</span>
          <span aria-hidden="true">·</span>
          <a href={PLUGIN_DEMO_VIDEO_URL}>{tr("Open MP4 directly", "直接打开 MP4")}</a>
        </div>
      </main>
    </PublicLayout>
  );
}
export function ConnectPage({ user }: { user?: User | null }) {
  const { tr,locale } = useI18n();
  const scopes = [
    ["apps:read", tr("Discover connected apps and read data within each account's granted access.", "发现已连接的应用，并在各账号授权范围内读取数据。")],
    ["apps:write", tr("Use supported app actions within the connected account's permissions.", "在连接账号的授权范围内执行受支持的应用操作。")],
    ["devices:read", tr("List paired computers and whether they are online.", "列出已配对的电脑及是否在线。")],
    ["computer:read", tr("Read files, folders and process information, when the computer allows it.", "在电脑允许时读取文件、文件夹和进程信息。")],
    ["computer:write", tr("Ask for editing and terminal tools; the computer's own permissions decide whether they are available.", "请求编辑和终端工具；能否使用由电脑自己的权限设置决定。")],
    ["browser:read", tr("Read browser pages: tabs you share, and the pages and status of browser tasks the AI runs (in a Remote Arc window or your own Chrome).", "读取浏览器页面：你共享的标签页，以及 AI 运行的浏览器任务（Remote Arc 窗口或你自己的 Chrome）的页面和状态。")],
    ["browser:interact", tr("Act in a browser: start browser tasks that click, fill and submit only on the sites each task names (the computer must have browser_runner on), or click and fill on a shared tab where you turned on Click & fill.", "在浏览器里操作：开始浏览器任务，只在任务指定的网站上点击、填写和提交（需要这台电脑开启 browser_runner）；或在你为某个共享标签页开启「点击与填写」后操作它。")],
    ["automation:read", tr("View persistent tasks, watches and their runs.", "查看持久任务、监听及其运行情况。")],
    ["automation:write", tr("Create and manage work that keeps running after the chat that created it ends.", "创建和管理在原聊天结束后仍会继续运行的任务。")],
    ["agent:write", tr("Let durable Agent Goals check results and choose their next permitted action.", "允许 Durable Agent Goal 检查结果并选择下一步已授权的动作。")],
  ];
  const step = (n: number, title: string) => <h2><span className="connectStepNo" aria-hidden="true">{n}</span>{title}</h2>;

  return (
    <PublicLayout user={user}>
      <main className="referenceManual connectSetupPage">
        <header className="toolPageHeader">
          <span className="eyebrow">{tr("CONNECT AI", "连接 AI")}</span>
          <h1>{tr("Connect Remote Arc to your AI", "把 Remote Arc 接入你的 AI")}</h1>
          <p>{tr(
            "Add Remote Arc to the AI you already use, connect your computer or your apps, then decide what that computer allows. It takes about five minutes, and every part can be changed or revoked later on its own.",
            "在你常用的 AI 里添加 Remote Arc，接上你的电脑或应用，再决定这台电脑允许 AI 做什么。大约 5 分钟，之后每一部分都可以单独修改或撤销。",
          )}</p>
          <div className="connectStartActions">
            <a className="primaryButton" href={localizedWebsiteHref("/downloads", locale)}>{tr("Download the Agent", "下载 Agent")}<ProductIcon name="arrowUpRight" size={16}/></a>
            <a href="https://agent.remotearc.app/devices">{tr("Open Dashboard", "打开 Dashboard")} ↗</a>
          </div>
        </header>

        <section className="connectClientCards" aria-label={tr("Choose your AI client","选择你的 AI 客户端")}>{[{id:'chatgpt',name:'ChatGPT',logo:'/ai-openai.svg',detail:tr('Install the published Remote Arc plugin','安装已上架的 Remote Arc 插件')},{id:'claude',name:'Claude',logo:'/ai-claude.svg',detail:tr('Add a custom remote connector','添加自定义远程连接器')},{id:'cursor',name:'Cursor',logo:'/ai-cursor.svg',detail:tr('Use your coding workspace','连接你的开发工作空间')}].map(client=><a href={localizedWebsiteHref('/install/'+client.id,locale)} key={client.id}><img src={client.logo} alt=""/><strong>{client.name}</strong><small>{client.detail}</small><ProductIcon name="arrowUpRight" size={15}/></a>)}</section>
        <div className="manualLayout">
          <aside className="manualToc">
            <strong>{tr("SETUP", "设置步骤")}</strong>
            <a href="#connect-client">{tr("1. Add to your AI", "1. 添加到你的 AI")}</a>
            <a href="#connect-computer">{tr("2. Computer or apps", "2. 接上电脑或应用")}</a>
            <a href="#connect-policy">{tr("3. What the computer allows", "3. 电脑允许做什么")}</a>
            <a href="#connect-try">{tr("4. Try a request", "4. 试一个请求")}</a>
            <a href="#connect-scopes">{tr("Reference: OAuth scopes", "参考：OAuth Scope")}</a>
          </aside>

          <article className="manualArticle">
            <section id="connect-client">
              {step(1, tr("Add Remote Arc to your AI client", "在 AI 客户端里添加 Remote Arc"))}
              <p>{tr("Choose the guide for the AI client you use. ChatGPT can install the published Remote Arc plugin; Claude, Codex, Cursor and other compatible clients use their own connection setup. Sign in to the same Remote Arc account when connecting your AI and pairing your computer.", "选择你正在使用的 AI 客户端指南。ChatGPT 可安装已上架的 Remote Arc 插件；Claude、Codex、Cursor 等客户端使用各自的连接方式。连接 AI 与配对电脑时，请登录同一个 Remote Arc 账号。")}</p>
              <details className="connectCustomMcp"><summary>{tr("Custom MCP address", "自定义 MCP 地址")}</summary><div className="docsCodeLine"><code>{MCP_ENDPOINT}</code><CopyButton value={MCP_ENDPOINT} /></div></details>
              <div className="clientGuideRows compactClientRows">
                {aiClients.map((client) => (
                  <a href={localizedWebsiteHref("/install/" + client.slug, locale)} key={client.name}>
                    <img className={client.tone === "mono" ? "monoLogo" : "colorLogo"} src={client.icon} alt="" />
                    <div><strong>{client.name}</strong><span>{tr("Step-by-step setup", "分步配置说明")}</span></div>
                    <b>→</b>
                  </a>
                ))}
                <a href={localizedWebsiteHref("/docs/mcp", locale)}>
                  <span className="miniMcp">M</span>
                  <div><strong>{tr("Other Remote MCP clients", "其他 Remote MCP 客户端")}</strong><span>{tr("Use the custom MCP address with OAuth", "使用自定义 MCP 地址并通过 OAuth 授权")}</span></div>
                  <b>→</b>
                </a>
              </div>
            </section>

            <section id="connect-computer">
              {step(2, tr("Connect your computer, your apps, or both (each is optional)", "接上你的电脑、应用，或两者都接（都是可选的）"))}
              <div className="connectChoice">
                <div>
                  <h3>{tr("Your computer", "你的电脑")}</h3>
                  <p>{tr("Download the native Agent for the computer you want your AI to use. No Node.js is needed. Run it, approve browser pairing with the same Remote Arc account, and keep the computer online. If already paired, start the existing Agent instead of installing again.", "在希望 AI 使用的电脑上下载并运行原生 Agent，无需 Node.js。到浏览器使用同一个 Remote Arc 账号批准配对，并保持电脑在线。已经配对时，启动原来的 Agent 即可。")}</p>
                  <p><a className="connectNativeDownload" href={localizedWebsiteHref("/downloads", locale)}>{['macos','windows','linux'].map(platform=><img key={platform} src={'/platform-brands/'+platform+'.svg'} width={20} height={20} alt=""/>)}<span>{tr("Download for your computer", "下载适合你电脑的版本")} →</span></a></p>
                  <p><a href="https://agent.remotearc.app/devices">{tr("See your computers in Dashboard", "在 Dashboard 查看已配对电脑")} ↗</a></p>
                  <details className="connectCommandAlternatives"><summary>{tr("Prefer the command line?", "想用命令行安装？")}</summary><InstallCommands /></details>
                </div>
                <div id="connect-apps">
                  <h3>{tr("Your apps", "你的应用")}</h3>
                  <p>{tr("Open Apps in your Connect workspace and authorize the accounts you want the AI to use. Apps run in the cloud and do not require a paired computer.", "在 Connect 工作空间打开「应用」，授权你希望 AI 使用的账号。应用在云端运行，无需配对电脑。")}</p>
                  <p><a href="https://agent.remotearc.app/dashboard/connect/apps">{tr("Open Apps", "打开应用")} →</a></p>
                </div>
              </div>
            </section>

            <section id="connect-policy">
              {step(3, tr("Decide what the computer allows", "决定这台电脑允许 AI 做什么"))}
              <p>{tr("A newly paired computer starts in Safe, which is read-only. Choose a preset on the computer's page in the dashboard, or switch individual skills on and off. Your AI client's authorization never goes beyond these settings.", "新配对的电脑默认是 Safe（只读）。在控制台的电脑页面选择预设，或逐项开关技能。AI 客户端的授权不会超出这里的设置。")}</p>
              <div className="compactReferenceTable connectPolicyTable">
                <div><strong>Safe<small>{tr("Default", "默认")}</small></strong><span>{tr("Read only: list folders, read files and file details, and see running processes.", "只读：列出文件夹、读取文件和文件信息、查看正在运行的进程。")}</span></div>
                <div><strong>Developer</strong><span>{tr("Adds creating and editing files, which Local Undo can reverse. Needs a Trusted Write Location first, so edits stay inside folders you choose.", "增加新建和编辑文件，可用 Local Undo 撤销。需要先设置「可信写入区域」，编辑只发生在你选定的文件夹里。")}</span></div>
                <div><strong>Full</strong><span>{tr("Adds terminal commands and background processes. Commands can change things Local Undo cannot reverse, so you confirm before turning it on.", "增加终端命令和后台进程。命令可能做出 Local Undo 无法撤销的改动，所以开启前需要你再次确认。")}</span></div>
              </div>
            </section>

            <section id="connect-try">
              {step(4, tr("Try a request", "试一个请求"))}
              <p>{tr("Start a new chat in your AI client and ask for something small. The first time, the client may ask you to allow Remote Arc's tools.", "在 AI 客户端里新开一个对话，先试一个简单的请求。第一次使用时，客户端可能会请你允许调用 Remote Arc 的工具。")}</p>
              <ul className="connectTryList">
                <li>{tr("\"List the computers I have connected to Remote Arc.\"", "「列出我在 Remote Arc 里连接的电脑。」")}</li>
                <li>{tr("\"Show the 10 largest files in my Downloads folder.\"", "「看看我「下载」文件夹里最大的 10 个文件。」")}</li>
                <li>{tr("\"Using the app I just connected, summarize what's new today.\"", "「用我刚连接的应用，总结一下今天有什么新内容。」")}</li>
              </ul>
              <p className="manualFinePrint">{tr("If the AI says it cannot see Remote Arc, refresh or reconnect the connector in your client; if a computer shows as offline, make sure it is on and the Remote Arc app is running.", "如果 AI 说看不到 Remote Arc，请在客户端里刷新或重新连接连接器；如果电脑显示离线，确认它已开机且 Remote Arc 应用正在运行。")}</p>
            </section>

            <section id="connect-scopes">
              <h2>{tr("Reference: OAuth scopes", "参考：OAuth Scope")}</h2>
              <p>{tr(
                "Scopes are what an AI client may ask your account for when you approve it. They never override what the selected computer allows.",
                "Scope 是你批准授权时，AI 客户端可以向你的账号请求的范围。它们不会越过所选电脑自己允许的范围。",
              )}</p>
              <div className="compactReferenceTable scopeReference">
                {scopes.map(([scope, body]) => <div key={scope}><code>{scope}</code><span>{body}</span></div>)}
              </div>
            </section>
          </article>
        </div>
      </main>
    </PublicLayout>
  );
}
export function DocsPage({ user }: { user?: User | null }) {
  const { tr } = useI18n();
  return <PublicLayout user={user}><React.Suspense fallback={<main className="technicalDoc"><WorkspaceLoading label={tr("Loading…", "加载中…")}/></main>}><Documentation /></React.Suspense></PublicLayout>;
}
export function SecurityModelPage({ user }: { user?: User | null }) {
  const { tr } = useI18n();
  return (
    <PublicLayout user={user}>
      <main className="technicalDoc">
        <header className="articleHeader">
          <span className="eyebrow">{tr("SECURITY", "安全")}</span>
          <h1>{tr("Security and trust model", "安全与信任模型")}</h1>
          <p>{tr(
            "Remote Arc allows an AI client to act on a real computer. The useful question is therefore not whether the system is 'secure' in the abstract, but which component is trusted for which decision, what the hosted service can observe, and how access can be constrained or revoked.",
            "Remote Arc 允许 AI 客户端在真实电脑上执行操作。因此真正有意义的问题不是抽象地问“是否安全”，而是：哪个组件负责哪类信任决策、托管服务能观察到什么，以及访问如何被限制和撤销。",
          )}</p>
          <div className="articleMetaLinks">
            <a href="/docs#docs-policy">{tr("Permission model", "权限模型")} →</a>
            <a href="/docs#docs-data">{tr("Data handling", "数据处理")} →</a>
            <a href="/docs/security-policy">{tr("Security policy", "安全策略")} →</a>
          </div>
        </header>

        <div className="technicalDocLayout">
          <aside className="articleToc">
            <strong>{tr("CONTENTS", "目录")}</strong>
            <a href="#security-threat">{tr("Threat model", "威胁模型")}</a>
            <a href="#security-identity">{tr("Identity", "身份")}</a>
            <a href="#security-device">{tr("Device trust", "设备信任")}</a>
            <a href="#security-paths">{tr("Path confinement", "路径约束")}</a>
            <a href="#security-tools">{tr("Skill policy", "Skill 策略")}</a>
            <a href="#security-transport">{tr("Transport & relay", "传输与 Relay")}</a>
            <a href="#security-recovery">{tr("Recovery", "恢复")}</a>
            <a href="#security-automations">{tr("Persistent tasks", "持久任务")}</a>
            <a href="#security-revoke">{tr("Revocation", "撤销")}</a>
            <a href="#security-nonclaims">{tr("What we do not claim", "我们不声称什么")}</a>
          </aside>

          <article className="technicalArticle">
            <section id="security-threat">
              <h2>{tr("Threat model and assumptions", "威胁模型与假设")}</h2>
              <p>{tr(
                "Remote Arc assumes the paired computer and its operating-system account are under the user's control. It also assumes that granting terminal execution is materially more powerful than granting read-only file or process inspection. The design therefore tries to keep those capabilities separable instead of treating 'computer access' as one permission.",
                "Remote Arc 假设已配对电脑及其操作系统账户处于用户控制之下，同时承认终端执行的能力显著高于只读文件或进程检查。因此设计重点是把这些能力拆开，而不是把“电脑访问”当成一个权限。",
              )}</p>
              <p>{tr(
                "The hosted control plane is trusted to authenticate users and AI clients, store policy, route live requests and enforce server-side revocation. It is not treated as a blind encrypted pipe: the relay processes active tool payloads. The local agent and native execution core remain responsible for what the computer actually exposes and for final filesystem/path checks.",
                "托管控制面被信任来认证用户与 AI 客户端、保存策略、路由实时请求并执行服务端撤销；它不是一个看不到内容的加密管道，因为 Relay 会处理当前 Tool Payload。本地 Agent 与原生执行核心继续负责电脑实际开放什么，以及最终的文件系统/路径检查。",
              )}</p>
            </section>

            <section id="security-identity">
              <h2>{tr("Identity is split between the user, AI client and device", "用户、AI 客户端与设备使用分离身份")}</h2>
              <p>{tr(
                "Dashboard authentication, MCP client authorization and device pairing are separate credentials. AI clients use OAuth 2.1 authorization code flow with PKCE. A paired computer receives its own revocable device credential; the hosted database stores a SHA-256 hash rather than the raw credential.",
                "Dashboard 登录、MCP 客户端授权与设备配对使用分离的凭证。AI 客户端采用 OAuth 2.1 Authorization Code + PKCE。已配对电脑获得独立可撤销的设备凭证；托管数据库保存 SHA-256 Hash，而不是原始凭证。",
              )}</p>
              <p>{tr(
                "This separation is what makes independent revocation possible. Removing an OAuth grant does not invalidate every paired computer, and revoking one computer does not force every AI client to reconnect.",
                "这种分离使独立撤销成为可能：删除一个 OAuth Grant 不会使所有已配对电脑失效，撤销一台电脑也不要求所有 AI 客户端重新连接。",
              )}</p>
            </section>

            <section id="security-device">
              <h2>{tr("The device is the final execution boundary", "设备是最终执行边界")}</h2>
              <p>{tr(
                "The relay can deny a request before routing it, but it cannot make the local agent execute a skill the agent does not expose. The selected device has an allowed-tool list, and the execution core performs the operating-system action only after local policy checks pass.",
                "Relay 可以在路由前拒绝请求，但不能让本地 Agent 执行它没有开放的 Skill。目标设备保存 Allowed Tool 列表，只有本地策略检查通过后，执行核心才会进行真实 OS 操作。",
              )}</p>
              <div className="articleFlow"><code>OAuth scope</code><span>→</span><code>account state</code><span>→</span><code>device skill policy</code><span>→</span><code>local path policy</code><span>→</span><code>OS execution</code></div>
              <p>{tr(
                "The CLI can additionally establish a local --safe ceiling. That ceiling deliberately cannot be expanded by a remote dashboard policy change.",
                "CLI 还可以通过 --safe 建立本机上限；这个上限故意不能被远程 Dashboard 策略扩大。",
              )}</p>
            </section>

            <section id="security-paths">
              <h2>{tr("Filesystem confinement happens below the skill level", "文件系统约束发生在 Skill 之下")}</h2>
              <p>{tr(
                "Read-only tools may inspect ordinary non-sensitive files outside Trusted Write Locations. File mutation outside those locations requires approval. Sensitive Path Policy separately protects credential-bearing paths such as .ssh, .aws, .gnupg, browser profiles and environment files.",
                "只读工具可以查看可信写入区域之外的普通非敏感文件；超出可信写入区域的文件修改需要审批。Sensitive Path Policy 会独立保护 .ssh、.aws、.gnupg、浏览器 Profile 与环境文件等可能包含凭证的位置。",
              )}</p>
              <p>{tr(
                "Existing path ancestors are canonicalized on the device before execution. The goal is to prevent an apparently allowed path from trivially escaping through a symlink. When a protected project genuinely needs one sensitive file or directory, a narrow exception can be added instead of disabling protection globally.",
                "执行前，本机会对已有路径 Ancestor 做规范化解析，目标是防止一个表面位于允许范围内的路径通过符号链接轻易逃逸边界。如果某个项目确实需要访问一个受保护文件或目录，可以添加窄范围例外，而不是全局关闭保护。",
              )}</p>
            </section>

            <section id="security-tools">
              <h2>{tr("Skill policy keeps read, write and shell separate", "Skill 策略把读取、写入与 Shell 分开")}</h2>
              <p>{tr(
                "Safe, Developer and Full are convenience presets over the same editable per-device skill list. Reading files can remain enabled while editing is off. Process listing can remain enabled while start_process is off. Terminal access, when enabled, is real shell execution under the local OS user's permissions.",
                "Safe、Developer、Full 只是同一份逐设备 Skill 列表上的快捷预设。可以保持读取开启而关闭编辑，也可以保持进程查看开启而关闭 start_process。终端一旦开启，就是继承本机 OS 用户权限的真实 Shell 执行。",
              )}</p>
              <p>{tr(
                "Safety Guard is defense in depth. Before a shell command runs, it resolves where each delete would land, including rd, del, Remove-Item, rm, find -delete, robocopy /MIR, rsync --delete and inline rmtree or rmSync calls, through nested cmd, PowerShell and sh layers, variables, wildcards and simple pipelines. It refuses drive and volume roots, home and personal folders, system directories, credential stores and the Remote Arc Undo store, and any delete whose target it cannot resolve unambiguously, such as escaped quotes across nested shells, unset variables or command substitution. Narrow cleanup such as node_modules, %TEMP% or Library/Caches still runs. It also blocks a few other catastrophic commands such as disk formatting and shutdown. It is not an operating-system sandbox: a script can still compute paths at run time, so it does not replace running the agent under an appropriately restricted local user.",
                "Safety Guard 属于纵深防御。Shell 命令执行前，它会算出每个删除的实际落点，覆盖 rd、del、Remove-Item、rm、find -delete、robocopy /MIR、rsync --delete 以及内联的 rmtree、rmSync，并穿过嵌套的 cmd、PowerShell、sh、变量、通配符和简单管道。会删到盘符或卷根目录、用户主目录和个人文件夹、系统目录、凭证存储或 Remote Arc Undo 存储的命令会被拒绝；无法明确解析目标的删除（例如跨层转义引号、未设置的变量、命令替换）同样拒绝。node_modules、%TEMP%、Library/Caches 这类范围明确的清理照常执行。它还会拦截格式化磁盘、关机等少数其他灾难性命令。它不是操作系统沙箱：脚本仍可能在运行时动态拼出路径，因此不能替代使用权限适当受限的本机用户来运行 Agent。",
              )}</p>
            </section>

            <section id="security-transport">
              <h2>{tr("Transport is encrypted; the relay is not zero-knowledge", "传输会加密；Relay 不是 zero-knowledge")}</h2>
              <p>{tr(
                "The local agent maintains an outbound WSS connection and public web/API traffic uses HTTPS. This protects data in transit against ordinary network interception and removes the need to expose an inbound service on the computer.",
                "本地 Agent 维持出站 WSS 连接，公开 Web/API 流量使用 HTTPS。这能保护传输过程免受普通网络窃听，也无需在电脑上暴露入站服务。",
              )}</p>
              <p>{tr(
                "Encryption in transit is not the same thing as end-to-end zero knowledge. To route a read_file response or process_output result, the hosted relay must process that active payload. Remote Arc therefore makes a narrower storage claim: operational audit records are designed around device, tool, result state and time, rather than intentionally persisting file contents, raw command arguments or tool results.",
                "传输加密不等于端到端 zero-knowledge。为了路由 read_file 响应或 process_output 结果，托管 Relay 必须处理当前 Payload。因此 Remote Arc 做的是更窄的存储承诺：运行审计记录围绕设备、工具、结果状态与时间设计，而不是有意持久化文件内容、原始命令参数或 Tool Result。",
              )}</p>
              <table className="articleTable">
                <thead><tr><th>{tr("Location", "位置")}</th><th>{tr("Examples", "示例")}</th></tr></thead>
                <tbody>
                  <tr><td>D1</td><td>{tr("Account, device and OAuth metadata, policy, usage and audit metadata; separately, durable task contracts, commands, bounded observations, factual memory, run summaries and evidence. Observations may contain file or process content.", "账户、设备与 OAuth 元数据、策略、用量和审计元数据；另保存持久任务合同、命令、受限观察、事实记忆、运行摘要与证据。观察可能包含文件或进程内容。")}</td></tr>
                  <tr><td>{tr("Live relay path", "实时 Relay 链路")}</td><td>{tr("Active file contents, directory listings, process output and command results required for the current call.", "当前调用所需的文件内容、目录列表、进程输出与命令结果。")}</td></tr>
                  <tr><td>{tr("Device only", "仅设备")}</td><td>{tr("Raw device credential, full local process capture and Local Undo snapshots. Requested file/process content can pass through the relay; bounded task observations can be saved.", "原始设备凭证、本地完整进程捕获和 Local Undo 快照。请求的文件或进程内容可以经过 Relay，受限任务观察可以保存到云端。")}</td></tr>
                </tbody>
              </table>
            </section>

            <section id="security-recovery">
              <h2>{tr("Local file recovery and durable task recovery", "本机文件恢复与持久任务恢复")}</h2>
              <p>{tr(
                "Before supported write_file and edit_block changes, Remote Arc can save the previous state under ~/.remotearc/undo. Snapshot contents stay on the paired computer. A restore checks the post-edit file hash first; if the file changed again, automatic restore is refused rather than overwriting newer work.",
                "在受支持的 write_file 与 edit_block 修改前，Remote Arc 可以把旧状态保存到 ~/.remotearc/undo。快照内容留在已配对电脑本机。恢复前会先检查修改后的文件 Hash；如果文件之后又发生变化，自动恢复会拒绝覆盖新工作。",
              )}</p>
              <p>{tr(
                "Local Undo only covers supported file edits. It cannot reverse a deployment, package publish, API request, database mutation or arbitrary shell side effect.",
                "Local Undo 只覆盖受支持的文件编辑，无法撤销部署、包发布、API 请求、数据库修改或任意 Shell 副作用。",
              )}</p>
              <p>{tr("Durable task recovery is separate: the control plane saves contracts, checkpoints and run history. After an interruption it checks leases, revisions and actual device state before continuing. It preserves work progress rather than guaranteeing that the same local process survives a restart.", "持久任务恢复是另一层能力：控制面保存合同、检查点和运行历史，中断后检查租约、版本与真实设备状态再继续。它保留的是工作进度，不保证同一本地进程跨重启存活。")}</p>
            </section>

            <section id="security-automations">
              <h2>{tr("Persistent tasks freeze authority at creation time", "持久任务在创建时冻结权限")}</h2>
              <p>{tr(
                "A durable automation may execute hours after the MCP request that created it has ended. Deterministic automations therefore store an explicit trigger and action plan. Adaptive Agent Goals store a user-approved objective, success criteria, tool set, optional deterministic verification, iteration/expiry limits, target device and permission snapshot. The planner can reinterpret results and choose a different next action, but cannot expand those stored authority boundaries.",
                "Durable Automation 可能在创建它的 MCP 请求结束数小时后才执行。确定性 Automation 会保存明确 Trigger 与 Action Plan；Adaptive Agent Goal 则保存用户批准的目标、成功标准、Tool Set、可选确定性验证、迭代/到期限制、目标设备和权限快照。Planner 可以重新理解结果并调整下一步，但不能扩大这些已经保存的权限边界。",
              )}</p>
              <p>{tr(
                "Every future device action still passes the normal ownership, revocation, allowed-tool and local path-policy checks. Unattended tasks do not enter a mid-run approval queue: disconnects wait for the device, known acknowledged deterministic attempts use the configured restart/fail policy when a handle is lost; unknown dispatch effects are not blindly replayed, and Agent Goals re-inspect state before choosing another action after a lost process handle. If the device security policy itself changes, execution stops and records the policy change instead of waiting for someone to approve it.",
                "未来每次设备执行仍然经过正常的 Ownership、Revocation、Allowed Tool 与本地路径策略检查。无人值守任务不会在运行途中进入审批队列：断线时等待设备；已确认的确定性尝试在句柄丢失后按 restart/fail 处理，未知派发副作用不会盲目重放；Agent Goal 则会先重新检查状态，再决定下一步。如果设备安全策略本身发生变化，执行会停止并记录原因，而不是等待有人批准。",
              )}</p>
              <p>{tr(
                "Condition Watch callback URLs contain a high-entropy secret and act as bearer capabilities. Only a SHA-256 hash is stored and delivery IDs can be deduplicated when supplied. A configured GitHub condition can merge one explicitly selected pull request with a repository-scoped GitHub App installation token. The current webhook transport still relies on the secret callback URL rather than claiming provider-specific GitHub HMAC verification.",
                "Condition Watch 回调 URL 包含高熵 Secret，本身就是 Bearer Capability；云端只保存 SHA-256 Hash，并在提供 Delivery ID 时做去重。配置后的 GitHub Condition 可以使用仓库范围的 GitHub App Installation Token 合并一个明确指定的 Pull Request。当前 Webhook 传输仍依赖这个秘密回调 URL，不声称已经实现 GitHub Provider-specific HMAC 校验。",
              )}</p>
              <p>{tr("Durable goals store their contract, bounded observations, factual memory and completion evidence separately from the operational audit. Observations may contain file contents or command output. Source decisions are scoped to the account/client and fenced by revision. Signed task events require a verified callback and secure egress; cloud GitHub actions also require explicit account/repository permission.", "持久目标在运行审计之外保存合同、受限观察、事实记忆与完成证据；观察可能包含文件内容或命令输出。源决策按账户和客户端隔离，并检查版本。签名任务事件需要经过验证的回调和安全出站服务；云端 GitHub 动作还需要明确的账户与仓库授权。")}</p>
            </section>

            <section id="security-revoke">
              <h2>{tr("Access can be cut at several layers", "访问可以在多个层级被切断")}</h2>
              <p>{tr(
                "An account-wide MCP pause blocks authenticated MCP calls server-side until the user resumes them. Individual OAuth grants can be revoked without re-pairing computers. Individual device credentials can be revoked, forcing that machine to pair again. Stopping the local agent also removes the machine from live routing because the connection is outbound from the device.",
                "账户级 MCP Pause 会在服务端阻止已认证 MCP 调用，直到用户恢复。单个 OAuth Grant 可以独立撤销而无需重新配对电脑；单个 Device Credential 也可以被撤销，使该机器必须重新配对。由于连接由设备主动出站，停止本地 Agent 同样会让该机器退出实时路由。",
              )}</p>
            </section>

            <section id="security-nonclaims">
              <h2>{tr("What Remote Arc does not claim", "Remote Arc 不声称什么")}</h2>
              <ul className="articleBulletList">
                <li>{tr("The hosted relay is not zero-knowledge and processes active tool payloads.", "托管 Relay 不是 zero-knowledge，会处理当前 Tool Payload。")}</li>
                <li>{tr("Terminal execution is not sandboxed by Remote Arc when Full access is enabled.", "开启 Full 后，终端执行不会被 Remote Arc 变成沙箱。")}</li>
                <li>{tr("Local Undo is not a general transaction rollback system.", "Local Undo 不是通用事务回滚系统。")}</li>
                <li>{tr("Direct process handles are local to the agent. Durable Tasks preserve progress across interruptions; recovery may inspect or start a new attempt rather than preserve the same OS process.", "直接进程句柄属于本地 Agent；持久 Task 可跨中断保存进度，恢复时可能检查或启动新尝试，不保留同一个 OS 进程。")}</li>
                <li>{tr("The browser extension works only on sites you allowed and tabs you shared; a shared tab starts read-only and click/fill is a separate per-tab opt-in.", "浏览器扩展只能在你允许的网站和你共享的标签页上工作；共享的标签页默认只读，点击/填写需按标签页单独开启。")}</li>
                <li>{tr("Adaptive Agent Goals may choose different next actions over time, but only inside the approved objective, tool set, device policy, iteration/expiry limits and optional deterministic verification boundary.", "Adaptive Agent Goal 可以随执行结果调整下一步，但只能在已批准目标、Tool Set、设备策略、迭代/到期限制与可选确定性验证边界内行动。")}</li>
                <li>{tr("Login background connection is separate from task keep-awake. Opted-in active tasks can request temporary sleep inhibition; power loss, forced sleep and network loss still make the device unavailable.", "登录后台连接与任务保持唤醒不同。已授权活动任务可临时申请抑制休眠，断电、强制休眠和断网仍会使设备不可用。")}</li>
              </ul>
              <p>{tr(
                "These are product boundaries, not footnotes. The safest deployment still depends on selecting an appropriate local OS user, granting only the skills a device needs, constraining paths where practical and revoking access when it is no longer required.",
                "这些是产品边界，不是脚注。更安全的实际部署仍然依赖：选择合适的本机 OS 用户、只给设备真正需要的 Skill、在可行时约束路径，并在不再需要时撤销访问。",
              )}</p>
              <div className="articleEndLinks">
                <a href="/docs">{tr("Documentation", "文档")} →</a>
                <a href="/privacy">{tr("Privacy policy", "隐私政策")} →</a>
                <a href="/docs/security-policy">{tr("Security policy", "安全策略")} →</a>
              </div>
            </section>
          </article>
        </div>
      </main>
    </PublicLayout>
  );
}
export function UseCasesPage({ user }: { user?: User | null }) {
  const { tr } = useI18n();
  return <PublicLayout user={user}><React.Suspense fallback={<main className="technicalDoc"><WorkspaceLoading label={tr("Loading…", "加载中…")}/></main>}><UseCaseCatalog /></React.Suspense></PublicLayout>;
}
export function UseCaseDetailPage({ slug, user }: { slug: UseCaseSlug; user?: User | null }) {
  const { tr } = useI18n();
  return <PublicLayout user={user}><React.Suspense fallback={<main className="technicalDoc"><WorkspaceLoading label={tr("Loading…", "加载中…")}/></main>}><UseCaseDetail slug={slug} /></React.Suspense></PublicLayout>;
}
export function ChatGptComputerAccessPage({ user }: { user?: User | null }) {
  const { tr } = useI18n();
  return (
    <PublicLayout user={user}>
      <section className="publicHero compactHero seoLandingHero">
        <span className="eyebrow">CHATGPT + REMOTE ARC</span>
        <h1>{tr("Give ChatGPT access to your computer — without exposing the computer itself.", "让 ChatGPT 使用你的电脑，但不把电脑本身暴露出去。")}</h1>
        <p>{tr("Remote Arc connects ChatGPT to Windows, macOS and Linux through an OAuth-protected Remote MCP endpoint and an outbound-only device connection.", "Remote Arc 通过受 OAuth 保护的 Remote MCP 与仅出站的设备连接，把 ChatGPT 连接到 Windows、macOS 和 Linux。")}</p>
        <div className="heroActions"><a className="primaryButton" href="/install/chatgpt">{tr("Install Remote Arc for ChatGPT", "为 ChatGPT 安装 Remote Arc")} →</a><a className="ghostButton" href="/docs/mcp">{tr("Read the MCP docs", "查看 MCP 文档")}</a></div>
      </section>
      <section className="seoSteps">
        <article><span>01</span><h2>{tr("Pair your computer", "配对电脑")}</h2><p>{tr("Run one local command and approve the pairing in your Remote Arc account. No public IP or inbound port is required.", "运行一条本地命令并在 Remote Arc 账户中确认配对，无需公网 IP 或入站端口。")}</p></article>
        <article><span>02</span><h2>{tr("Connect ChatGPT through MCP", "通过 MCP 连接 ChatGPT")}</h2><p>{tr("Use the Remote Arc MCP endpoint and complete OAuth. ChatGPT receives tools, not a shared machine password.", "使用 Remote Arc MCP 地址并完成 OAuth。ChatGPT 获得的是工具能力，而不是一份共享的电脑密码。")}</p></article>
        <article><span>03</span><h2>{tr("Choose what this device can do", "选择这台设备可以做什么")}</h2><p>{tr("Start read-only, add file editing when needed, and enable terminal execution only on devices where it is appropriate.", "默认从只读开始，需要时增加文件编辑，并只在合适的设备上开启终端执行。")}</p></article>
      </section>
      <section className="faqSection">
        <div className="sectionIntro"><span className="eyebrow">FAQ</span><h2>{tr("Common questions about ChatGPT computer access.", "关于 ChatGPT 访问电脑的常见问题。")}</h2></div>
        <div className="faqList">
          <details><summary>{tr("Does Remote Arc expose a port on my computer?", "Remote Arc 会在我的电脑上暴露端口吗？")}</summary><p>{tr("No. The local agent creates an outbound connection to the hosted control plane.", "不会。本地 Agent 主动向托管控制面建立出站连接。")}</p></details>
          <details><summary>{tr("Can I keep a computer read-only?", "可以让某台电脑保持只读吗？")}</summary><p>{tr("Yes. Tool availability is configured per device, so terminal and write tools can remain disabled.", "可以。工具能力按设备配置，因此可以一直关闭终端和写入类工具。")}</p></details>
          <details><summary>{tr("Do I have to use only ChatGPT?", "只能使用 ChatGPT 吗？")}</summary><p>{tr("No. The same Remote Arc endpoint can also be used by Claude, Cursor and compatible Remote MCP clients.", "不是。同一个 Remote Arc Endpoint 也可以被 Claude、Cursor 与兼容 Remote MCP 的客户端使用。")}</p></details>
        </div>
      </section>
    </PublicLayout>
  );
}
export function ClaudeComputerAccessPage({ user }: { user?: User | null }) {
  const { tr } = useI18n();
  return (
    <PublicLayout user={user}>
      <section className="publicHero compactHero seoLandingHero">
        <span className="eyebrow">CLAUDE + REMOTE ARC</span>
        <h1>{tr("Give Claude controlled access to your computer through Remote MCP.", "通过 Remote MCP，让 Claude 在受控权限下使用你的电脑。")}</h1>
        <p>{tr("Remote Arc connects Claude to explicitly paired Windows, macOS and Linux computers while keeping operating-system execution on the device you control.", "Remote Arc 把 Claude 连接到你明确配对的 Windows、macOS 与 Linux 电脑，同时让真正的系统执行留在你控制的设备上。")}</p>
        <div className="heroActions"><a className="primaryButton" href="/install/claude">{tr("Install Remote Arc for Claude", "为 Claude 安装 Remote Arc")} →</a><a className="ghostButton" href="/docs/mcp">{tr("Read the MCP docs", "查看 MCP 文档")}</a></div>
      </section>
      <section className="seoSteps">
        <article><span>01</span><h2>{tr("Pair the computer once", "先配对电脑")}</h2><p>{tr("Run npx remotelink on the target computer and approve the pairing in your Remote Arc account.", "在目标电脑运行 npx remotelink，并在 Remote Arc 账户中批准配对。")}</p></article>
        <article><span>02</span><h2>{tr("Connect Claude over Remote MCP", "通过 Remote MCP 连接 Claude")}</h2><p>{tr("Add the Remote Arc endpoint to Claude and complete OAuth. Claude connects to a hosted MCP server while the paired device remains a separate execution boundary.", "在 Claude 中添加 Remote Arc Endpoint 并完成 OAuth。Claude 连接的是托管 MCP 服务，而配对设备仍然是独立执行边界。")}</p></article>
        <article><span>03</span><h2>{tr("Keep device policy independent", "设备权限独立控制")}</h2><p>{tr("Tool access, workspace roots, sensitive paths and revocation stay attached to the paired device rather than to one AI vendor.", "工具权限、工作区、敏感路径与撤销能力都绑定在配对设备上，而不是绑定某一家 AI。")}</p></article>
      </section>
      <section className="faqSection">
        <div className="sectionIntro"><span className="eyebrow">RELATED</span><h2>{tr("Continue with the technical details.", "继续查看技术细节。")}</h2></div>
        <div className="sectionResourceLinks"><a href="/mcp-computer-access">{tr("Remote MCP computer access", "Remote MCP 电脑访问")} →</a><a href="/security-model">{tr("Security model", "安全模型")} →</a><a href="/chatgpt-computer-access">{tr("ChatGPT computer access", "ChatGPT 电脑访问")} →</a></div>
      </section>
    </PublicLayout>
  );
}
export function McpComputerAccessPage({ user }: { user?: User | null }) {
  const { tr } = useI18n();
  return (
    <PublicLayout user={user}>
      <section className="publicHero compactHero seoLandingHero">
        <span className="eyebrow">REMOTE MCP + COMPUTER ACCESS</span>
        <h1>{tr("Remote MCP computer access for AI agents.", "面向 AI Agent 的 Remote MCP 电脑访问。")}</h1>
        <p>{tr("Remote Arc is a hosted Remote MCP bridge that lets compatible AI clients discover and invoke approved capabilities on Windows, macOS and Linux computers you pair.", "Remote Arc 是一个托管的 Remote MCP Bridge，让兼容 AI 客户端发现并调用你配对的 Windows、macOS 与 Linux 电脑上的已授权能力。")}</p>
        <div className="heroActions"><a className="primaryButton" href="/docs/mcp">{tr("Open the MCP reference", "查看 MCP Reference")} →</a><a className="ghostButton" href="/security-model">{tr("Security model", "安全模型")}</a></div>
      </section>
      <section className="seoSteps">
        <article><span>01</span><h2>{tr("One hosted MCP endpoint", "一个托管 MCP Endpoint")}</h2><p>{tr("Your AI client connects to Remote Arc over OAuth instead of requiring a publicly reachable MCP server on every computer.", "AI 客户端通过 OAuth 连接 Remote Arc，不需要每台电脑都暴露一个公网可访问的 MCP Server。")}</p></article>
        <article><span>02</span><h2>{tr("Outbound device connections", "设备主动出站连接")}</h2><p>{tr("Each paired computer connects outward to the control plane and receives only routed calls for the device selected by the AI workflow.", "每台配对电脑主动连接控制面，只接收被路由到该设备的调用。")}</p></article>
        <article><span>03</span><h2>{tr("Per-device capabilities", "按设备配置能力")}</h2><p>{tr("Read files, edit supported content, inspect processes, run approved commands, share browser-tab context or keep a device read-only depending on its policy.", "根据设备策略，可以读取文件、编辑受支持内容、检查进程、运行已授权命令、共享浏览器标签页上下文，也可以让设备始终保持只读。")}</p></article>
      </section>
      <section className="faqSection">
        <div className="sectionIntro"><span className="eyebrow">CONNECT</span><h2>{tr("Use the same device boundary with different AI clients.", "不同 AI 客户端复用同一套设备权限边界。")}</h2></div>
        <div className="sectionResourceLinks"><a href="/install/chatgpt">ChatGPT →</a><a href="/install/claude">Claude →</a><a href="/install/cursor">Cursor →</a><a href="/use-cases">{tr("Use cases", "使用场景")} →</a></div>
      </section>
    </PublicLayout>
  );
}
export function NotFoundPage({ user }: { user?: User | null }) {
  const { tr } = useI18n();
  return (
    <PublicLayout user={user}>
      <section className="publicHero compactHero">
        <span className="eyebrow">404</span>
        <h1>{tr("Page not found.", "页面不存在。")}</h1>
        <p>{tr("The Remote Arc page you requested does not exist.", "你访问的 Remote Arc 页面不存在。")}</p>
        <div className="heroActions"><a className="primaryButton" href="/">{tr("Back to Remote Arc", "返回 Remote Arc")} →</a><a className="ghostButton" href="/docs">{tr("Documentation", "文档")}</a></div>
      </section>
    </PublicLayout>
  );
}
export function PricingPage({ user }: { user?: User | null }) {
  const { tr } = useI18n();
  const startHref = user ? dashboardHref("/overview") : APP_ORIGIN + "/auth/login?return_to=/overview";
  const usageHref = user ? dashboardHref("/settings") : APP_ORIGIN + "/auth/login?return_to=/settings";
  return <PublicLayout user={user}><React.Suspense fallback={<main className="technicalDoc"><WorkspaceLoading label={tr("Loading…", "加载中…")}/></main>}><PricingContent startHref={startHref} usageHref={usageHref} signedIn={Boolean(user)} currentPlan={user?.plan || null} /></React.Suspense></PublicLayout>;
}
export function ResourcesRedirect() {
  const { tr } = useI18n();
  useEffect(() => { window.location.replace("/docs"); }, []);
  return <p role="status"><a href="/docs">{tr("Open documentation", "打开文档")} →</a></p>;
}
export function McpPage({ user }: { user?: User | null }) {
  const { tr } = useI18n();
  return <PublicLayout user={user}><React.Suspense fallback={<main className="technicalDoc"><WorkspaceLoading label={tr("Loading…", "加载中…")}/></main>}><McpReference /></React.Suspense></PublicLayout>;
}
export function LegalPage({kind,user}:{kind:"privacy"|"terms"|"support";user?:User|null}) {
  return <PublicLayout user={user}><TrustPage kind={kind}/></PublicLayout>;
}
