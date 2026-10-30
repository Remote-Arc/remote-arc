import { ClientMcpGuide } from "./client-setup-guides.js";
import { CHATGPT_PLUGIN_URL } from "./client-links.js";
import { useEffect, useState } from "react";
import { useI18n } from "./i18n.js";
import { CopyButton, LogoMark, PublicLayout, aiClients } from "./public-layout.js";
import { type User } from "./app-types.js";
import { CLAUDE_CONNECTORS_URL, GEMINI_CONNECTORS_URL, MCP_ENDPOINT, cursorMcpInstallUrl } from "./app-config.js";

export type InstallClientSlug = "chatgpt" | "claude" | "gemini" | "cursor";
type InstallDemoConfig = {
  name: string;
  icon: string;
  prompt: string;
  working: string;
  resultLines: string[];
  terminalLines: string[];
};
function InstallTypewriterDemo({ config }: { config: InstallDemoConfig }) {
  const { tr } = useI18n();
  const [typed, setTyped] = useState("");
  const [phase, setPhase] = useState<"typing" | "sent" | "working" | "done">("typing");
  const [activityCount, setActivityCount] = useState(0);
  const [cycle, setCycle] = useState(0);

  useEffect(() => {
    setTyped("");
    setPhase("typing");
    setActivityCount(0);

    let index = 0;
    const timers: number[] = [];
    const interval = window.setInterval(() => {
      index += 1;
      setTyped(config.prompt.slice(0, index));
      if (index >= config.prompt.length) {
        window.clearInterval(interval);

        const sendAt = 520;
        const workingAt = 960;
        timers.push(window.setTimeout(() => {
          setTyped("");
          setPhase("sent");
        }, sendAt));
        timers.push(window.setTimeout(() => setPhase("working"), workingAt));

        config.terminalLines.forEach((_, lineIndex) => {
          timers.push(window.setTimeout(
            () => setActivityCount(lineIndex + 1),
            workingAt + 280 + lineIndex * 430,
          ));
        });

        const doneAt = workingAt + 520 + config.terminalLines.length * 430;
        timers.push(window.setTimeout(() => setPhase("done"), doneAt));
        timers.push(window.setTimeout(() => setCycle((value) => value + 1), doneAt + 4600));
      }
    }, 34);

    return () => {
      window.clearInterval(interval);
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [config.prompt, config.terminalLines, cycle]);

  const messageSent = phase !== "typing";

  return (
    <div className="remoteSessionDemo" aria-label={tr("Simulated Remote Arc live session", "Remote Arc 模拟实时会话")}>
      <div className="remoteSessionHeader">
        <div>
          <LogoMark />
          <span>
            <strong>Remote Arc Live Session</strong>
            <small>{tr("AI request → local device", "AI 请求 → 本机设备")}</small>
          </span>
        </div>
        <div className="remoteSessionStatus">
          <i />
          <span>{tr("Personal Mac · online", "Personal Mac · 在线")}</span>
        </div>
      </div>

      <div className="remoteSessionPanels">
        <section className="sessionTerminalPanel">
          <div className="sessionPanelLabel">
            <span>{tr("LOCAL ACTIVITY", "本机活动")}</span>
            <small>{tr("runs on your computer", "运行在你的电脑上")}</small>
          </div>

          <div className="sessionTerminalWindow">
            <div className="sessionTerminalBar">
              <span><i /><i /><i /></span>
              <small>remote-arc@personal-mac</small>
            </div>
            <div className="sessionTerminalBody">
              <div className="sessionTerminalPrompt">
                <span>$</span>
                <code>{tr("remote-arc session --client ", "remote-arc session --client ")}{config.name.toLowerCase()}</code>
              </div>

              <div className="sessionTerminalLine muted">
                <b>✓</b>
                <span>{tr("secure device connection ready", "设备安全连接已就绪")}</span>
              </div>

              {messageSent && (
                <div className="sessionTerminalLine">
                  <b>→</b>
                  <span>{tr("routing request to Personal Mac", "正在把请求路由到 Personal Mac")}</span>
                </div>
              )}

              {config.terminalLines.slice(0, activityCount).map((line, index) => (
                <div className="sessionTerminalLine" key={line + index}>
                  <b>{index === config.terminalLines.length - 1 && phase === "done" ? "✓" : "›"}</b>
                  <span>{line}</span>
                </div>
              ))}

              {phase === "working" && (
                <div className="sessionTerminalCursor">
                  <span>▌</span>
                </div>
              )}

              {phase === "typing" && (
                <div className="sessionTerminalIdle">
                  <span>{tr("waiting for an AI request…", "等待 AI 请求…")}</span>
                </div>
              )}
            </div>
          </div>
        </section>

        <div className="sessionBridge">
          <span>Remote MCP</span>
          <i>→</i>
        </div>

        <section className="sessionChatPanel">
          <div className="sessionChatHeader">
            <div>
              <img src={config.icon} alt="" />
              <strong>{config.name}</strong>
            </div>
            <span><i />{tr("Remote Arc connected", "Remote Arc 已连接")}</span>
          </div>

          <div className="sessionChatBody">
            {messageSent ? (
              <div className="sessionUserMessage">{config.prompt}</div>
            ) : (
              <div className="sessionChatHint">
                <strong>{tr("Ask naturally.", "直接自然语言输入。")}</strong>
                <span>{tr("Remote Arc will route the task to the computer you name.", "Remote Arc 会把任务路由到你指定的电脑。")}</span>
              </div>
            )}

            {(phase === "sent" || phase === "working") && (
              <div className="sessionAssistantState">
                <span>{config.working}</span>
                <div><i /><i /><i /></div>
              </div>
            )}

            {phase === "done" && (
              <div className="sessionAssistantResult">
                <strong>{tr("Done on your computer.", "已在你的电脑上完成。")}</strong>
                <ul>
                  {config.resultLines.map((line) => <li key={line}>{line}</li>)}
                </ul>
              </div>
            )}
          </div>

          <div className={"sessionComposer " + (phase === "typing" ? "typing" : "")}>
            <span>＋</span>
            <div>
              {phase === "typing" ? typed : tr("Ask another task…", "继续输入任务…")}
              {phase === "typing" && <b className="typeCursor" />}
            </div>
            <button type="button" aria-hidden="true">↑</button>
          </div>
        </section>
      </div>

      <div className="remoteSessionFooter">
        <span>{tr("Simulated walkthrough — no live computer is being controlled.", "模拟演示——此处没有实际控制电脑。")}</span>
        <span>{tr("The same device policy still applies.", "设备权限策略仍然生效。")}</span>
      </div>
    </div>
  );
}
export function ClientInstallPage({
  slug,
  user,
}: {
  slug: InstallClientSlug;
  user?: User | null;
}) {
  const { tr } = useI18n();
  const config = slug === "chatgpt"
    ? {
        name: "ChatGPT",
        icon: "/ai-openai.svg",
        eyebrow: tr("CHATGPT INSTALLATION", "CHATGPT 安装"),
        title: tr("Give ChatGPT access to your local computer.", "让 ChatGPT 连接你的本地电脑。"),
        intro: tr(
          "Install the published Remote Arc plugin, pair your computer with the local Agent, then verify the connection in chat. Both steps use the same Remote Arc account.",
          "安装已上架的 Remote Arc 插件，用本地 Agent 配对电脑，再回到聊天验证。插件与电脑配对使用同一个 Remote Arc 账号。",
        ),
        availability: tr(
          "Available as a published ChatGPT plugin. A paired computer with its Agent online is required for computer tools.",
          "已上架 ChatGPT 插件。使用电脑工具时，仍需配对电脑并保持 Agent 在线。",
        ),
        externalHref: CHATGPT_PLUGIN_URL,
        externalLabel: tr("Open official plugin", "打开官方插件"),
        steps: [
          {
            title: tr("Pair your computer", "配对你的电脑"),
            body: tr("Run this once on the Windows, macOS or Linux machine you want ChatGPT to reach.", "在你希望 ChatGPT 访问的 Windows、macOS 或 Linux 电脑上运行一次。"),
            code: "npx remotelink",
          },
          {
            title: tr("Connect the Remote Arc Plugin", "连接 Remote Arc Plugin"),
            body: tr(
              "Open the published Remote Arc plugin, install or enable it, and authorize the same Remote Arc account used to pair your computer. Custom MCP remains an optional alternative.",
              "打开已上架的 Remote Arc 插件，安装或启用，并授权配对电脑时使用的同一 Remote Arc 账号。Custom MCP 仍作为可选替代方式保留。",
            ),
            code: MCP_ENDPOINT,
          },
          {
            title: tr("Ask ChatGPT to use your computer", "让 ChatGPT 操作你的电脑"),
            body: tr("Name the machine and task in normal language. Remote Arc checks the saved device policy before routing each tool call.", "直接用自然语言说明设备和任务。每次 Tool Call 路由前，Remote Arc 都会检查这台设备保存的权限策略。"),
          },
        ],
        demo: {
          name: "ChatGPT",
          icon: "/ai-openai.svg",
          prompt: tr("Organize my Downloads folder on my Mac", "整理我 Mac 上的 Downloads 文件夹"),
          working: tr("Working on your Mac…", "正在你的 Mac 上处理…"),
          resultLines: [
            tr("Grouped screenshots and documents into folders.", "已将截图和文档按类型整理到文件夹。"),
            tr("Moved 126 files; nothing was deleted.", "移动了 126 个文件，没有删除任何内容。"),
            tr("Changes stayed inside your allowed workspace.", "所有修改都限制在允许的工作区内。"),
          ],
          terminalLines: [
            tr("policy → Full · ~/Downloads", "policy → Full · ~/Downloads"),
            tr("start_process → inspect and group files", "start_process → 检查并整理文件"),
            tr("process_output → 126 files planned", "process_output → 已规划 126 个文件"),
            tr("process_output → move complete · 0 deleted", "process_output → 移动完成 · 0 删除"),
          ],
        },
      }
    : slug === "claude"
      ? {
          name: "Claude",
          icon: "/ai-claude.svg",
          eyebrow: tr("CLAUDE INSTALLATION", "CLAUDE 安装"),
          title: tr("Connect Claude to the computer you already use.", "让 Claude 连接你正在使用的电脑。"),
          intro: tr(
            "Claude custom connectors support remote MCP. Add Remote Arc once, authorize your account, and your paired computers become available through the connector.",
            "Claude Custom Connectors 支持 Remote MCP。添加一次 Remote Arc 并完成授权后，你配对的电脑即可通过 Connector 使用。",
          ),
          availability: tr("Available through Claude custom connectors using remote MCP.", "可通过 Claude 的 Remote MCP Custom Connector 接入。"),
          externalHref: CLAUDE_CONNECTORS_URL,
          externalLabel: tr("Open Claude Connectors", "打开 Claude Connectors"),
          steps: [
            {
              title: tr("Pair your computer", "配对你的电脑"),
              body: tr("Install the Remote Arc agent on the computer Claude should reach.", "在 Claude 需要访问的电脑上安装 Remote Arc Agent。"),
              code: "npx remotelink",
            },
            {
              title: tr("Add a custom connector", "添加 Custom Connector"),
              body: tr(
                "In Claude, open Customize → Connectors → + Add → Custom → Web (or Add custom connector). Enter the Remote Arc URL, select OAuth sign-in, then enable the connector in your conversation.",
                "在 Claude 中进入 Customize → Connectors → ＋ Add → Custom → Web，输入 Remote Arc MCP 地址并完成 OAuth，随后在对话中启用连接。",
              ),
              code: MCP_ENDPOINT,
            },
            {
              title: tr("Use Remote Arc in a Claude conversation", "在 Claude 对话里使用 Remote Arc"),
              body: tr("Ask Claude to inspect, edit or run a permitted task on a named paired device. The local skill policy remains the final boundary.", "让 Claude 在指定的已配对设备上执行允许的读取、编辑或命令任务；本机 Skill Policy 仍是最终边界。"),
            },
          ],
          demo: {
            name: "Claude",
            icon: "/ai-claude.svg",
            prompt: tr("Find why the tests fail on my desktop and fix it", "找出我桌面电脑上的测试为什么失败并修好"),
            working: tr("Inspecting your desktop…", "正在检查你的桌面电脑…"),
            resultLines: [
              tr("Found one failing assertion in the auth flow.", "定位到认证流程里的一处失败断言。"),
              tr("Updated the file and reran the test suite.", "修改文件后重新跑了测试。"),
              tr("All tests pass; a Local Undo snapshot is available.", "测试已全部通过，并保留了 Local Undo 快照。"),
            ],
            terminalLines: [
              tr("start_process → pnpm test", "start_process → pnpm test"),
              tr("process_output → 1 failing assertion", "process_output → 1 条断言失败"),
              tr("read_file → src/auth.test.ts", "read_file → src/auth.test.ts"),
              tr("edit_block → assertion updated", "edit_block → 已更新断言"),
              tr("start_process → pnpm test · passed", "start_process → pnpm test · 已通过"),
            ],
          },
        }
      : slug === "gemini"
        ? {
            name: "Google Gemini",
            icon: "/ai-gemini.svg",
            eyebrow: tr("GEMINI INSTALLATION", "GEMINI 安装"),
            title: tr("Connect Gemini to your own computers.", "让 Gemini 连接你自己的电脑。"),
            intro: tr(
              "Add Remote Arc as a Gemini custom MCP connector, authorize your account, and use the permitted tools on your paired computers.",
              "在 Gemini 中添加 Remote Arc 自定义 MCP 连接器，授权账户后即可使用已配对电脑上允许的工具。",
            ),
            availability: tr(
              "Available through Gemini's Custom MCP connectors. Feature availability depends on your Google account.",
              "通过 Gemini 的自定义 MCP 连接器接入；可用性取决于 Google 账户。",
            ),
            externalHref: GEMINI_CONNECTORS_URL,
            externalLabel: tr("Open Gemini Connectors", "打开 Gemini Connectors"),
            steps: [
              {
                title: tr("Pair your computer", "配对电脑"),
                body: tr("Run Remote Arc on the computer Gemini should access.", "在需要让 Gemini 使用的电脑上运行 Remote Arc。"),
                code: "npx remotelink",
              },
              {
                title: tr("Create a custom MCP connector", "添加自定义 MCP 连接器"),
                body: tr(
                  "Open Gemini Connectors → + Custom, paste the Remote Arc HTTPS MCP URL and continue through Google account authorization. Name the app Remote Arc and select Connect.",
                  "打开 Gemini Connectors → ＋ Custom，粘贴 Remote Arc HTTPS MCP 地址，通过 Google 账户授权后将应用命名为 Remote Arc，再点击 Connect。",
                ),
                code: MCP_ENDPOINT,
              },
              {
                title: tr("Use it in Gemini", "在 Gemini 中使用"),
                body: tr(
                  "On the Remote Arc connector, choose Use now or enable it in your chat. Ask Gemini to list a paired device first, then approve only the tools you intend to use.",
                  "在 Remote Arc 连接器中选择 Use now，或在对话中启用它。先让 Gemini 列出已配对设备，再按需批准工具操作。",
                ),
              },
            ],
            demo: {
              name: "Gemini",
              icon: "/ai-gemini.svg",
              prompt: tr("List my available Remote Arc devices", "列出我 Remote Arc 当前可用的设备"),
              working: tr("Checking your paired devices…", "正在检查已配对设备…"),
              resultLines: [
                tr("Remote Arc connector is available.", "Remote Arc 连接器已就绪。"),
                tr("Paired devices can be listed through MCP.", "可以通过 MCP 列出已配对设备。"),
                tr("Each device enforces its own allowed tools.", "每台设备仍然独立执行工具权限限制。"),
              ],
              terminalLines: [
                "Gemini → Remote Arc MCP",
                "list_devices → allowed",
                tr("device_tools → available capabilities", "device_tools → 可用工具"),
                tr("policy → checked on the device", "policy → 设备端检查"),
              ],
            },
          }
      : {
          name: "Cursor",
          icon: "/ai-cursor.svg",
          eyebrow: tr("CURSOR INSTALLATION", "CURSOR 安装"),
          title: tr("Let Cursor reach the machine behind your code.", "让 Cursor 连接代码所在的真实电脑。"),
          intro: tr(
            "Cursor supports remote HTTP MCP servers with OAuth. Point Cursor at Remote Arc and keep the actual filesystem and terminal on your paired machine.",
            "Cursor 支持带 OAuth 的 Remote HTTP MCP Server。把 Cursor 指向 Remote Arc，就能让文件系统和终端仍然运行在你配对的真实电脑上。",
          ),
          availability: tr("Supported through Cursor remote HTTP MCP with OAuth.", "可通过 Cursor 的 Remote HTTP MCP + OAuth 接入。"),
          externalHref: "https://cursor.com/docs/mcp",
          externalLabel: tr("Open Cursor", "打开 Cursor"),
          steps: [
            {
              title: tr("Pair your computer", "配对你的电脑"),
              body: tr("Run Remote Arc on the machine that owns the project or development environment.", "在真正保存项目或开发环境的电脑上运行 Remote Arc。"),
              code: "npx remotelink",
            },
            {
              title: tr("Add Remote Arc as an MCP server", "把 Remote Arc 添加为 MCP Server"),
              body: tr(
                "Add a remote HTTP MCP server from Cursor's MCP settings, or place the configuration below in your Cursor MCP config. Cursor will complete OAuth for the remote server.",
                "在 Cursor 的 MCP 设置中添加 Remote HTTP MCP Server，或者把下面配置写入 Cursor MCP 配置文件。Cursor 会为远程 Server 完成 OAuth。",
              ),
              code: '{ "mcpServers": { "remote-arc": { "url": "' + MCP_ENDPOINT + '" } } }',
            },
            {
              title: tr("Use it from Agent", "从 Agent 中直接使用"),
              body: tr("Cursor Agent can call the permitted Remote Arc tools while your source tree and commands stay on the selected paired computer.", "Cursor Agent 可以调用已授权的 Remote Arc 工具，同时源码和命令仍然留在你选择的已配对电脑上。"),
            },
          ],
          demo: {
            name: "Cursor",
            icon: "/ai-cursor.svg",
            prompt: tr("Run the tests in remote-arc on my Mac", "在我的 Mac 上运行 remote-arc 的测试"),
            working: tr("Running on your Mac…", "正在你的 Mac 上运行…"),
            resultLines: [
              tr("Started the test command in the project workspace.", "已在项目工作区启动测试命令。"),
              tr("Captured the process output through Remote Arc.", "通过 Remote Arc 获取了进程输出。"),
              tr("Test suite completed successfully.", "测试套件已成功完成。"),
            ],
            terminalLines: [
              tr("policy → Full · ~/Work/remote-arc", "policy → Full · ~/Work/remote-arc"),
              tr("start_process → pnpm test · background", "start_process → pnpm test · 后台运行"),
              tr("process_status → running", "process_status → running"),
              tr("process_output → 42 tests passed", "process_output → 42 tests passed"),
            ],
          },
        };

  return (
    <PublicLayout user={user}>
      <main className="installManual">
        <header className="toolPageHeader installManualHeader">
          <nav className="installClientSwitcher" aria-label={tr("AI client installation", "AI 客户端安装")}>
            {aiClients.map((client) => (
              <a
                className={client.slug === slug ? "active" : ""}
                aria-current={client.slug === slug ? "page" : undefined}
                href={"/install/" + client.slug}
                key={client.slug}
              >
                <img className={client.tone === "mono" ? "monoLogo" : "colorLogo"} src={client.icon} alt="" />
                <span>{client.name}</span>
              </a>
            ))}
          </nav>

          <div className="toolPageTitleRow">
            <div>
              <span className="eyebrow">{tr("INSTALLATION", "安装")}</span>
              <h1>{config.name} {tr("installation", "安装")}</h1>
              <p>{config.intro}</p>
            </div>
          </div>

          <div className="toolPageStatusLine">
            <span><i className="statusDot" />{config.availability}</span>
            <a href={config.externalHref} target="_blank" rel="noreferrer">{config.externalLabel} ↗</a>
          </div>
        </header>

        {slug === "chatgpt" ? <ClientMcpGuide client="chatgpt" endpoint={MCP_ENDPOINT}
          cursorInstallUrl={cursorMcpInstallUrl()} copyEndpoint={<CopyButton value={MCP_ENDPOINT} />} /> : <>
        <section id="installation-command" className="installQuickStart" aria-label={tr("Install Remote Arc on your computer", "在电脑上安装 Remote Arc")}>
          <div className="installQuickStartCopy">
            <span className="eyebrow">{tr("START HERE · INSTALLATION", "从这里开始 · 安装指南")}</span>
            <h2>{tr("Install and pair your computer", "安装并配对你的电脑")}</h2>
            <p>{tr(
              "Run this on the Windows, macOS or Linux computer you want " + config.name + " to use. Then connect the MCP App / Connector below.",
              "在你希望 " + config.name + " 使用的 Windows、macOS 或 Linux 电脑上运行，然后按下方步骤连接 MCP App / Connector。",
            )}</p>
          </div>
          <div className="installPrimaryCommand compactCommand">
            <span>{tr("RUN ON YOUR COMPUTER", "在你的电脑上运行")}</span>
            <div className="installHeroCommand">
              <code>npx remotelink</code>
              <CopyButton value="npx remotelink" />
            </div>
            <small>{tr("Pairs your computer through browser approval · requires Node.js for this npx entry", "通过浏览器确认完成配对 · 此 npx 安装方式需要 Node.js")}</small>
            <details className="shellInstallAlternative">
              <summary>{tr("macOS / Linux: install without Node.js", "macOS / Linux：无需 Node.js 安装")}</summary>
              <div className="docsCodeLine"><code>curl -fsSL https://remotearc.app/install.sh | sh</code><CopyButton value="curl -fsSL https://remotearc.app/install.sh | sh" /></div>
              <small>{tr("Then run remotelink to pair. Installs to ~/.local/bin and verifies SHA256.", "安装后运行 remotelink 配对。安装到 ~/.local/bin，并验证 SHA256。")}</small>
            </details>
          </div>
          <div className="installQuickStartMcp">
            <span>{tr("NEXT · ADD THIS REMOTE MCP ADDRESS IN YOUR AI CLIENT", "接下来 · 在 AI 客户端添加这个远程 MCP 地址")}</span>
            <div className="installQuickStartEndpoint docsCodeLine">
              <code>{MCP_ENDPOINT}</code>
              <CopyButton value={MCP_ENDPOINT} />
            </div>
          </div>
        </section>

        <div className="installMustDo" aria-label={tr("Both setup steps are required", "安装必须完成两端设置")}>
          <article className="installMustDoCard">
            <span>{tr("REQUIRED 01 · AI CLIENT", "必需 01 · AI 客户端")}</span>
            <h2>{tr("Add the MCP App / Connector", "添加 MCP App / Connector")}</h2>
            <p>{tr("Add Remote Arc in " + config.name + " and finish OAuth. Without this step your AI cannot access the computer.", "在 " + config.name + " 里添加 Remote Arc 并完成 OAuth。缺少这一步，AI 就无法访问电脑。")}</p>
            <a href="#installation-client">{tr("See UI setup steps", "查看平台内点击步骤")} ↗</a>
          </article>
          <article className="installMustDoCard">
            <span>{tr("REQUIRED 02 · LOCAL COMPUTER", "必需 02 · 目标电脑")}</span>
            <h2>{tr("Start and pair the local agent", "启动并配对本地 Agent")}</h2>
            <p>{tr("Run the CLI on the machine you want the AI to use. The MCP connection alone cannot access local files.", "在需要使用的电脑上运行本地命令。只有 MCP 连接仍无法访问本机文件。")}</p>
            <a href="#installation-command">{tr("Copy the installation command", "复制安装命令")} ↗</a>
            <a href="#installation">{tr("Device pairing steps", "查看电脑配对步骤")} ↗</a>
          </article>
        </div>

        {slug !== "cursor" && <div className="installFullWidthGuide">
          <ClientMcpGuide client={slug} endpoint={MCP_ENDPOINT}
            cursorInstallUrl={cursorMcpInstallUrl()} copyEndpoint={<CopyButton value={MCP_ENDPOINT} />} />
        </div>}

        <div className="manualLayout">
          <aside className="manualToc">
            <strong>{tr("SETUP", "配置")}</strong>
            <a href="#installation-command">{tr("Installation command", "安装命令")}</a>
            <a href="#installation-client">{tr("MCP App / Connector (required)", "MCP App / Connector（必需）")}</a>
            <a href="#installation">{tr("Computer setup (required)", "电脑端配置（必需）")}</a>
            <a href="#installation-example">{tr("Example session (after setup)", "示例会话（安装之后）")}</a>
            <a href="/connect-ai">{tr("Connect another AI", "连接其他 AI")}</a>
            <a href="/docs">{tr("Documentation", "文档")}</a>
          </aside>

          <article className="manualArticle">
            {slug === "cursor" && <ClientMcpGuide client={slug} endpoint={MCP_ENDPOINT}
              cursorInstallUrl={cursorMcpInstallUrl()} copyEndpoint={<CopyButton value={MCP_ENDPOINT} />} />}
            <section id="installation">
              <h2>{tr("Setup", "配置")}</h2>
              <p>{tr(
                "The computer and the AI client are authorized separately. Start by pairing the computer, approve it in the browser, then add Remote Arc to the AI client.",
                "电脑与 AI 客户端分别授权。先配对电脑并在浏览器确认，再把 Remote Arc 添加到 AI 客户端。",
              )}</p>

              <ol className="manualSteps">
                <li>
                  <span>1</span>
                  <div>
                    <h3>{tr("Run Remote Arc on the computer", "在电脑上运行 Remote Arc")}</h3>
                    <p>{tr("The CLI creates a short-lived pairing request and opens the browser approval page.", "CLI 会创建一个短期配对请求，并自动打开浏览器确认页面。")}</p>
                    <div className="docsCodeLine"><code>npx remotelink</code><CopyButton value="npx remotelink" /></div>
                    <p className="installAgentVersionNote">{tr("To explicitly fetch the latest published CLI, run npx --yes remotelink@latest. Previously installed background agents do not upgrade automatically.", "需要明确从 npm 获取最新 CLI 时运行 npx --yes remotelink@latest。之前安装的后台 Agent 不会自动升级。")}</p>
                  </div>
                </li>
                <li>
                  <span>2</span>
                  <div>
                    <h3>{tr("Approve the computer and choose its permissions", "确认电脑并选择权限")}</h3>
                    <p>{tr("Match the short code. Start read-oriented, then add Trusted Write Locations, file editing, terminal access or background connection only where needed.", "核对短码。默认从读取能力开始，只在需要时添加可信写入区域、文件编辑、终端或后台连接。")}</p>
                  </div>
                </li>
                <li>
                  <span>3</span>
                  <div>
                    <h3>{tr("Connect " + config.name, "连接 " + config.name)}</h3>
                    <p>{config.steps[1]?.body}</p>
                    {"code" in (config.steps[1] || {}) && config.steps[1]?.code && (
                      <div className="docsCodeLine">
                        <code>{config.steps[1].code}</code>
                        <CopyButton value={config.steps[1].code} />
                      </div>
                    )}
                  </div>
                </li>
              </ol>

              <div className="manualNote">
                <strong>{tr("Permission boundary", "权限边界")}</strong>
                <p>{tr(
                  "Changing AI clients does not change the device policy. Trusted Write Locations, Sensitive Path Policy, Local Undo and the per-device skill list still apply.",
                  "更换 AI 客户端不会改变设备策略。可信写入区域、Sensitive Path Policy、Local Undo 和逐设备 Skill 列表仍然生效。",
                )}</p>
              </div>
            </section>

            <section className="manualFooterLinks">
              <a href="/connect-ai">{tr("Connection reference", "连接参考")} →</a>
              <a href="/docs">{tr("Read the documentation", "阅读文档")} →</a>
              <a href="/security-model">{tr("Security model", "安全模型")} →</a>
            </section>
          </article>
        </div>

        <section id="installation-example" className="installExampleFirst">
          <div className="installExampleIntro">
            <span className="eyebrow">{tr("AFTER SETUP · SEE IT IN ACTION", "完成安装后 · 查看效果")}</span>
            <h2>{tr("Example session", "示例会话")}</h2>
            <p>{tr(
              "Once setup is complete, preview how your AI selects a paired computer, calls approved tools, and returns results in chat. This is a simulation, not a live device session.",
              "完成上面的安装步骤后，可以在这里预览 AI 如何选择已配对电脑、调用获准工具，并在聊天中返回结果。这是模拟演示，不会连接真实设备。",
            )}</p>
          </div>
          <InstallTypewriterDemo config={config.demo} />
        </section>
        </>}

      </main>
    </PublicLayout>
  );
}
