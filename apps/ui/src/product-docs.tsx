import toolIndex from "../../../packages/docs/src/tool-index.generated.json" with {type:"json"};
import {TOOL_GROUPS} from "../../../packages/docs/src/tool-reference-meta.js";
import { localizedWebsiteHref } from "./marketing-paths.js";
import React from "react";
import { useI18n } from "./i18n.js";
import { ArchitectureDeepDive } from "./architecture-deep-dive.js";
import { BrowserModes } from "./browser-modes.js";
import "./public-docs.css";

const endpoint = "https://mcp.remotearc.app/mcp";
const engineering = "https://github.com/Remote-Arc/remote-arc/blob/master/docs/";

export const publicToolGroups = Object.entries(TOOL_GROUPS).map(([id,copy])=>({...copy,scope:[...new Set(toolIndex.remote.filter(tool=>tool.group===id).flatMap(tool=>tool.scopes))].join(" · "),tools:toolIndex.remote.filter(tool=>tool.group===id).map(tool=>tool.name)})).filter(group=>group.tools.length);
const toolCount=toolIndex.remote.length;

export function TaskAvailability() {
  const { tr } = useI18n();
  return <aside className="docsAvailability">
    <strong>{tr("About availability", "关于可用状态")}</strong>
    <p>{tr("Arc Tasks and Routines run bounded hosted AI work using your trial or paid Arc Credits, even when its chat tab is closed. Connect Tasks save approved deterministic commands, schedules and condition watches; new AI decisions still need a compatible active host. Computer work requires an online Agent and device permissions; cloud App work does not need a paired computer. A UI preview uses simulated data.","Arc Task 与 Routine 使用试用或付费 Arc Credits 执行有界的托管 AI 工作，无需一直打开聊天标签页。Connect Task 保存已授权的确定性命令、定时与条件监听；新的 AI 决策仍需兼容且可用的宿主。电脑工作还需在线 Agent 和设备权限；云端应用工作无需配对电脑。界面预览使用模拟数据。")}</p>
  </aside>;
}

function Code({ children }: { children: string }) {
  return <pre className="docsExample"><code>{children}</code></pre>;
}

function ToolReference() {
  const { tr, locale } = useI18n();
  return <>
    <p>{tr(`The groups below cover ${toolCount} MCP tools for devices, saved work and connected apps. Your client shows the tools enabled for your account. Computer tools also depend on the selected device's permissions and installed Agent. process_status and process_output require computer:write. App tools use list_apps to discover an operation and schema, then call_app to execute it in a linked account; they do not require a paired computer.`, `下列分组包含 ${toolCount} 个 MCP 工具，覆盖设备、已保存工作和连接的应用。客户端显示当前账号已开放的工具。电脑工具还取决于目标设备权限与已安装 Agent；process_status 和 process_output 需要 computer:write。Apps 工具通过 list_apps 搜索操作与参数结构，再使用 call_app 在已连接账号上执行，无需配对电脑。`)}</p>
    <p>{tr("All Connect tool capabilities are available on every plan, including binary reads, temporary file links, background commands, schedules, condition watches, source-controlled Agent Goals and supported keep-awake. Free retains 10,000 tool calls per month. Account authorization and device permissions still apply; hosted model access and third-party charges are separate. Check Settings → Plan & usage for your current allowance.", "所有套餐均可使用全部 Connect 工具能力，包括二进制读取、临时文件链接、后台命令、定时任务、条件监听、由原 AI 接续的 Agent Goal 和受支持的保持唤醒。Free 每月仍为 10,000 次工具调用。账号授权和设备权限仍须满足；托管模型和第三方服务费用另计。在设置 → 套餐与用量查看当前额度。")}</p>
    <p><a href={localizedWebsiteHref("/docs/tools",locale)}>{tr("Search all tools, App operations and parameters","搜索全部工具、Apps 操作与参数")} →</a></p>
    <div className="toolReferenceList">{publicToolGroups.map(group => <div key={group.en}>
      <h3>{tr(group.en, group.zh)}</h3><code>{group.tools.join(" · ")}</code><p>{tr("Scopes used in this group: ", "本组使用的 OAuth Scope：")}{group.scope}</p>
    </div>)}</div>
    <p>{tr("Background-service controls and power leases are internal device/Dashboard helpers; local MCP additionally exposes directory browsing, Undo lists and managed-process lists. MCP event methods are protocol extensions, not additional tools.", "后台服务控制与保持唤醒租约是设备或 Dashboard 内部辅助能力；本地 MCP 另外提供目录浏览、Undo 列表与受管进程列表。MCP 事件方法属于协议扩展，不计入工具数量。")}</p>
  </>;
}

function SelectedSections({ children, sectionIds }: { children: React.ReactNode; sectionIds?: readonly string[] }) {
  return <>{React.Children.toArray(children).filter(child => {
    if (!sectionIds) return true;
    if (!React.isValidElement<{ id?: string }>(child)) return false;
    return child.type === ArchitectureDeepDive ? sectionIds.includes("architecture-deep") : Boolean(child.props.id && sectionIds.includes(child.props.id.replace(/^docs-/, "")));
  })}</>;
}

export function Documentation({ sectionIds, title, description }: { sectionIds?: readonly string[]; title?: string; description?: string } = {}) {
  const { tr, locale } = useI18n();
  const contents = [
    ["start", tr("Set up once", "一次配置")], ["model", tr("Chat, tools and Tasks", "聊天、工具与 Task")],
    ["routing", tr("System architecture", "系统架构")],
    ["architecture-deep", tr("Architecture deep dive", "架构技术详解")],
    ["architecture-trust", tr("Trust boundaries", "信任边界")],
    ["architecture-task", tr("Task lifecycle", "任务状态机")],
    ["architecture-persistence", tr("Persistence and recovery", "持久化与恢复")],
    ["architecture-data", tr("Storage and privacy", "存储与隐私")],
    ["architecture-limits", tr("Experimental boundaries", "实验能力边界")],
    ["policy", tr("Device permissions", "设备权限")],
    ["files", tr("Files and Undo", "文件与 Undo")], ["processes", tr("Processes and recovery", "进程与恢复")],
    ["automations", tr("Durable task modes", "持久任务模式")], ["continuation", tr("AI reasoning boundary", "AI 推理边界")],
    ["schedule", tr("Scheduling and sleep", "调度与休眠")], ["browser", tr("Browser context", "浏览器上下文")],
    ["sandbox", tr("Execution and isolation", "执行与隔离")], ["tools", tr("MCP tool reference", "MCP 工具参考")],
    ["data", tr("Data handling", "数据处理")], ["troubleshoot", tr("Troubleshooting", "排查问题")], ["limits", tr("Availability and limits", "可用状态与边界")],
  ];
  return <main className="technicalDoc productDocs">
    <header className="articleHeader">
      <span className="eyebrow">{tr("DOCUMENTATION", "文档")}</span>
      <h1>{title || tr("Your AI. Your computer. Work that can continue.", "你的 AI、你的电脑，可以持续推进的工作。")}</h1>
      <p>{description || tr("Pair a computer, choose its permissions and connect your AI through Remote MCP. Use ordinary tools for immediate work, or a durable Task when work needs to continue, wait for an event or run later.", "配对电脑、选择设备权限，再通过 Remote MCP 连接 AI。即时操作直接使用工具；需要持续推进、等待事件或稍后执行的工作，则保存为持久 Task。")}</p>
      <div className="articleMetaLinks"><a href={localizedWebsiteHref("/docs/mcp", locale)}>{tr("MCP reference", "MCP 接入参考")} →</a><a href={localizedWebsiteHref("/docs/long-running-work", locale)}>{tr("Long-running work", "持续工作指南")} →</a><a href={localizedWebsiteHref("/use-cases", locale)}>{tr("Use cases", "使用场景")} →</a></div>
      {(!sectionIds || sectionIds.includes("automations")) && <TaskAvailability />}
    </header>
    <div className="technicalDocLayout">
      <aside className="articleToc"><strong>{tr("CONTENTS", "目录")}</strong>{contents.filter(([id]) => !sectionIds || sectionIds.includes(id!)).map(([id, title]) => <a key={id} href={"#docs-" + id}>{title}</a>)}</aside>
      <article className="technicalArticle"><SelectedSections sectionIds={sectionIds}>
        <section id="docs-start">
          <h2>{tr("Set up the computer and the AI client once", "电脑和 AI 客户端各配置一次")}</h2>
          <p>{tr("On the Windows, macOS or Linux computer that owns the project, install the native Agent using a download, Homebrew or npm/npx. Only the npm/npx command below requires Node.js 20 or newer. The Agent opens a short-lived browser pairing flow. Sign in, compare the code and approve the correct machine.", "在保存项目的 Windows、macOS 或 Linux 电脑上，通过直接下载、Homebrew 或 npm/npx 安装原生 Agent。只有下面的 npm/npx 命令需要 Node.js 20 或更高版本。Agent 会打开短期浏览器配对流程；登录、核对配对码并确认正确的电脑。")}</p>
          <Code>npx remotelink@latest</Code>
          <p>{tr("Without Node.js on macOS or Linux (including WSL), use the native shell installer, then run remotelink to pair:", "macOS 或 Linux（包括 WSL）没有 Node.js 时，使用原生安装脚本，然后运行 remotelink 配对：")}</p>
          <Code>{"curl -fsSL https://remotearc.app/install.sh | sh\nremotelink"}</Code>
          <p>{tr("The installer verifies SHA256 and installs to ~/.local/bin without sudo. If that directory is outside PATH, it prints the full command to run. Set REMOTEARC_INSTALL_DIR to an absolute directory to choose another location. Stop the Agent before rerunning the installer to upgrade.", "安装脚本验证 SHA256，无需 sudo，默认安装到 ~/.local/bin。如果该目录不在 PATH 中，会显示完整启动路径。可通过 REMOTEARC_INSTALL_DIR 指定其他绝对路径。升级时先停止 Agent，再重新运行安装脚本。")}</p>
          <p><a href={localizedWebsiteHref("/downloads", locale)}>{tr("Native downloads, Homebrew, upgrades and stopping the Agent", "原生下载、Homebrew、升级与停止 Agent")} →</a></p>
          <p>{tr("New devices start with read-oriented tools. File editing, terminal execution, workspace roots and login background connection are separate choices. Finish setup before connecting your AI. The background switch installs an OS login service only after setup, and Dashboard reports its verified local state.", "新设备从读取类工具开始。文件编辑、终端执行、工作区目录和登录后台连接可以分别选择。完成设备设置后再连接 AI；后台开关会在完成设置后安装 OS 登录服务，Dashboard 显示的是本机确认后的状态。")}</p>
          <Code>{endpoint}</Code>
          <p>{tr("Connect the AI client to this endpoint and complete Remote Arc OAuth. Use the client-specific installation guide for ChatGPT, Claude or Cursor. Pairing a computer and authorizing an AI client are independent: you can revoke either relationship separately.", "将 AI 客户端连接到这个地址并完成 Remote Arc OAuth。ChatGPT、Claude 和 Cursor 各有安装指南。配对电脑与授权 AI 客户端是两条独立关系，可以分别撤销。")}</p>
          <div className="articleMetaLinks"><a href={localizedWebsiteHref("/remote-mcp", locale)}>{tr("What is a remote MCP server?", "什么是 Remote MCP Server？")} →</a><a href={localizedWebsiteHref("/install/chatgpt", locale)}>ChatGPT →</a><a href={localizedWebsiteHref("/install/claude", locale)}>Claude →</a><a href={localizedWebsiteHref("/install/cursor", locale)}>Cursor →</a></div>
        </section>
        <section id="docs-model">
          <h2>{tr("Keep using your AI chat", "继续从 AI 聊天入口使用")}</h2>
          <p>{tr("Ask for work in the chat you already use and name the target computer. Reading a file, inspecting a process or running a short command is an ordinary tool call. It does not create a Task for every operation.", "直接在平时的 AI 聊天中说明工作和目标电脑。读文件、查看进程或运行短命令属于普通工具调用，不会每次操作都创建一个 Task。")}</p>
          <p>{tr("A Task is a saved unit of ongoing work: its goal or fixed plan, trigger, device, approved capabilities, deadline and progress. It can contain many tool calls. When you request ongoing or scheduled work, the AI can save that Task inside your authorization; you do not need to fill out a Dashboard form. Dashboard is there to inspect results, pause or cancel tasks and change device permissions.", "Task 是一项保存下来的持续工作，包含目标或固定计划、触发方式、设备、已批准能力、期限和进度，可以包含很多次工具调用。你要求持续或定时工作时，AI 可以在授权范围内保存 Task，无需手动填写 Dashboard 表单。控制台用于查看结果、暂停或取消任务，以及修改设备权限。")}</p>
        </section>
        <section id="docs-routing">
          <h2>{tr("How execution reaches your computer", "执行如何抵达你的电脑")}</h2>
          <p>{tr("The local execution plane is Go: apps/agent contains pairing, Relay sessions, process recovery and journals; packages/execution-core is an independent Go module for file/process tools, local policy and Undo. They compile into one native executable. The npm CLI only installs and launches it. TypeScript remains in the cloud Relay, Dashboard, shared wire contracts and explicit apps/agent-ts / packages/execution-core-ts fallback.", "本地执行面采用 Go：apps/agent 负责配对、Relay 会话、进程恢复和日志；packages/execution-core 是独立 Go 模块，负责文件与进程工具、本地策略和 Undo。两者编译为一个原生可执行文件，npm CLI 负责安装和启动。TypeScript 继续用于云端 Relay、Dashboard、共享协议及显式 apps/agent-ts / packages/execution-core-ts 回退。")}</p>
          <div className="articleFlow"><code>AI / Plugin</code><span>→</span><code>OAuth · MCP</code><span>→</span><code>Cloudflare Worker</code><span>→</span><code>Durable Object</code><span>→</span><code>outbound WSS</code><span>→</span><code>{tr("Local agent", "本地 Agent")}</code></div>
          <p>{tr("The Worker authenticates the account and client, checks policy and selects the device. Per-user Durable Objects route live requests over the device's outbound WebSocket. D1 stores accounts, authorization, policies and durable task progress. Commands and file operations execute on the paired computer using its installed software.", "Worker 认证账户与客户端、检查策略并选择设备。每用户 Durable Object 通过设备主动建立的出站 WebSocket 路由实时请求；D1 保存账户、授权、策略和持久任务进度。命令和文件操作在已配对电脑上执行，使用本机已经安装的软件。")}</p>
          <p>{tr("No public inbound port, router forwarding or VPN is required. Persistence is handled by the task scheduler and database; the device connection provides execution when the computer is available.", "无需公网入站端口、路由器映射或 VPN。任务调度器和数据库负责持久化，设备连接在电脑可用时提供真实执行。")}</p>
          <div className="articleMetaLinks"><a href={engineering + "system-architecture.en.md"}>{tr("Engineering reference (English)", "英文工程参考")} ↗</a><a href={engineering + "system-architecture.md"}>{tr("Chinese reference", "中文工程参考")} ↗</a></div>
        </section>
        <ArchitectureDeepDive />
        <section id="docs-policy">
          <h2>{tr("Choose permissions for each computer", "分别选择每台电脑的权限")}</h2>
          <div className="docsTableWrap"><table className="articleTable"><thead><tr><th>{tr("Control", "控制项")}</th><th>{tr("What it governs", "控制什么")}</th></tr></thead><tbody>
            <tr><td>OAuth scopes</td><td>{tr("The AI client's account-level authorization. Device policy still applies.", "AI 客户端的账户级授权，仍需遵守设备策略。")}</td></tr>
            <tr><td>{tr("Allowed tools", "允许的工具")}</td><td>{tr("Read, edit, terminal and browser capabilities. Read-only, Developer and Full are convenience presets; individual tools remain controllable.", "读取、编辑、终端和浏览器能力。只读、Developer 和 Full 是快捷预设，工具仍可逐项控制。")}</td></tr>
            <tr><td>Trusted Write Locations</td><td>{tr("Persistent roots where file mutation can happen without per-request approval; scoped terminal commands also require an in-scope cwd.", "可无需逐次审批进行文件修改的长期可信目录；受范围限制的终端命令也要求 cwd 位于这些目录内。")}</td></tr>
            <tr><td>Sensitive Path Policy</td><td>{tr("Credential and browser-profile paths, with narrow explicit exceptions.", "凭证和浏览器 Profile 路径保护，可配置窄范围例外。")}</td></tr>
            <tr><td>Safety Guard</td><td>{tr("Before a terminal command runs, resolves where each delete would land and refuses drive roots, home and personal folders, system and credential folders, the Undo store and targets it cannot resolve unambiguously. Defense in depth, not an OS sandbox.", "终端命令执行前算出每个删除的实际落点，拒绝盘符根目录、主目录和个人文件夹、系统与凭证目录、Undo 存储以及无法明确解析的目标。属于纵深防御，不是 OS 沙箱。")}</td></tr>
            <tr><td>{tr("Task permissions", "任务权限")}</td><td>{tr("Background work, scheduling, adaptive goals, source-agent continuation and task keep-awake, each with its own switch.", "后台工作、定时、自主目标、源 Agent 续接和任务保持唤醒各有独立开关。")}</td></tr>
            <tr><td>{tr("Local ceiling", "本机权限上限")}</td><td>{tr("npx remotelink --safe keeps a local read-only ceiling that Dashboard cannot expand.", "npx remotelink --safe 设置本机只读上限，Dashboard 无法远程扩大。")}</td></tr>
          </tbody></table></div>
          <p>{tr("Task permissions do not grant missing file or terminal tools. Source continuation and task keep-awake require opt-in. Turning off a task permission cancels affected active tasks. Changing the frozen device tool/path policy stops unattended work; it does not grant an old Task new authority.", "任务权限不会额外授予缺失的文件或终端工具。源续接和任务保持唤醒需要明确开启；关闭任务权限会取消受影响的活动任务。修改已冻结的设备工具或路径策略会停止无人值守工作，不会扩大旧 Task 的权限。")}</p>
        </section>
        <section id="docs-files">
          <h2>{tr("Files, protected paths and Local Undo", "文件、受保护路径和 Local Undo")}</h2>
          <p>{tr("File reads and writes are independent. The local core resolves paths, including symlinks, before enforcing workspace roots and sensitive-path protection. You can allow one required credential file without disabling all sensitive-path protection.", "文件读取和写入权限独立。本地核心先解析路径，包括符号链接，再执行工作区和敏感路径检查。需要某个凭证文件时，可以设置窄范围例外，无需关闭全部保护。")}</p>
          <p>{tr("Supported write_file and edit_block edits can save the previous file state under ~/.remotearc/undo. Snapshots stay on the computer. Undo checks the current file hash before restoring, so a newer change is not silently overwritten. Shell edits, deployments, database changes and external API actions are outside Local Undo.", "受支持的 write_file 和 edit_block 修改可将旧文件状态保存到 ~/.remotearc/undo，快照留在本机。Undo 恢复前会检查当前文件 Hash，避免静默覆盖后续修改。Shell 编辑、部署、数据库修改和外部 API 动作不属于 Local Undo。")}</p>
        </section>
        <section id="docs-processes">
          <h2>{tr("A process handle and a durable Task have different lifetimes", "进程句柄与持久 Task 的寿命不同")}</h2>
          <p>{tr("list_processes inspects OS processes without granting shell execution. start_process requires terminal permission and can run synchronously or in background mode. Background mode returns process_id; process_status, process_output and stop_process use that local agent handle.", "list_processes 查看 OS 进程，不等于授予 Shell 执行。start_process 要求终端权限，可以同步执行或后台运行；后台模式返回 process_id，供 process_status、process_output 和 stop_process 使用。")}</p>
          <div className="docsTableWrap"><table className="articleTable"><thead><tr><th>{tr("What persists", "保存的对象")}</th><th>{tr("After an interruption", "中断后会怎样")}</th></tr></thead><tbody>
            <tr><td>{tr("Direct background process", "直接后台进程")}</td><td>{tr("Its handle and captured output are in the running agent's memory. They are lost on agent restart; a machine reboot ends the old OS process.", "句柄和捕获的输出保存在当前 Agent 内存中，Agent 重启后丢失；电脑重启会结束旧 OS 进程。")}</td></tr>
            <tr><td>{tr("Durable Task", "持久 Task")}</td><td>{tr("The saved contract, progress and run history remain in D1. After device reconnection, execution continues from the saved state according to the recovery policy.", "合同、进度和运行历史保存在 D1。设备重连后，根据恢复策略从保存的状态继续处理。")}</td></tr>
            <tr><td>{tr("Always-on OS service", "常驻 OS 服务")}</td><td>{tr("Use a service manager for a daemon that must be restarted and supervised independently of an AI Task.", "需要独立于 AI Task 长期启动和监督的守护进程，应由服务管理器负责。")}</td></tr>
          </tbody></table></div>
          <p>{tr("For a known, acknowledged process whose handle is lost, a deterministic Task can restart the attempt or fail, according to recovery. Restart creates a new attempt; it does not revive the same PID. Agent Goals inspect the current state before choosing another action. If dispatch happened without an acknowledged result, the system records uncertainty and avoids blindly replaying the effect.", "对于已确认启动、但后来丢失句柄的进程，确定性 Task 会按 recovery 重新启动尝试或失败。重新启动产生新的尝试，不是恢复原 PID。Agent Goal 会先检查当前状态再决定下一步。如果已派发操作却没有确认结果，系统会记录不确定性，避免盲目重放副作用。")}</p>
          <p>{tr("Use a durable long_task for a lengthy build, export or script. Use launchd, systemd or Windows Services when the workload is a permanent service. These choices solve different lifecycle needs.", "长时间构建、导出或脚本可使用持久 long_task。工作负载属于常驻服务时，再使用 launchd、systemd 或 Windows 服务。两者解决不同的生命周期需求。")}</p>
        </section>
        <section id="docs-automations">
          <h2>{tr("Durable tasks save execution, not an immortal AI", "持久 Task 保存执行状态，不等于 AI 永久在线")}</h2>
          <p>{tr("Use a durable Task when the work is already concrete: an approved command, working directory, trigger, retry bound and optional verification command. Remote Arc persists that contract and run state independently of the chat that created it.", "当工作已经明确时使用持久 Task：已批准命令、工作目录、触发条件、重试边界以及可选验收命令。Remote Arc 独立于创建它的聊天保存这份契约和运行状态。")}</p>
          <div className="docsTableWrap"><table className="articleTable"><thead><tr><th>{tr("Mode", "模式")}</th><th>{tr("Behavior", "行为")}</th></tr></thead><tbody>
            <tr><td>{tr("Long task", "长任务")}</td><td>{tr("Start and track one known command after the chat turn ends.", "聊天结束后启动并跟踪一个已知命令。")}</td></tr>
            <tr><td>{tr("Schedule", "定时任务")}</td><td>{tr("Run approved deterministic work later or at a completion-based interval.", "稍后或按完成间隔执行已批准的确定性工作。")}</td></tr>
            <tr><td>{tr("Condition watch", "条件监听")}</td><td>{tr("Wait for a configured event, then run the approved action.", "等待配置事件后执行已批准动作。")}</td></tr>
            <tr><td>{tr("Verification loop", "验收循环")}</td><td>{tr("Repeat the same bounded work and check until success or a saved stop condition.", "重复同一有界工作与验收，直到成功或触发保存的停止条件。")}</td></tr>
          </tbody></table></div>
          <p>{tr("A one-minute cloud scheduler advances due Tasks with persisted leases and revisions. Saving a Task is not evidence that it ran; Dashboard shows actual run state, results and scheduler health separately.", "云端一分钟调度器通过持久租约与 revision 推进到期 Task。保存成功不等于实际执行；Dashboard 会分别显示真实运行状态、结果和调度健康。")}</p>
        </section>
        <section id="docs-continuation">
          <h2>{tr("Fresh AI judgment has a hard boundary", "新的 AI 判断有明确边界")}</h2>
          <p>{tr("Connect keeps deterministic commands and waits durable without continuous model inference. A new diagnosis or strategy needs an active compatible host. Arc Tasks and Routines separately start bounded hosted model runs using saved instructions and account Credits.", "Connect 可以在模型不持续推理时持久执行确定性命令与等待。新的诊断或策略需要可用且兼容的宿主；Arc Task 与 Routine 则按保存的指令启动有界托管模型运行，使用账号 Credits。")}</p>
          <p>{tr("Connect cannot promise to wake the same external chat for a new reasoning turn. Experimental source-goal and hosted-goal tools appear only when enabled and use explicit continuation contracts; they do not provide unlimited reasoning or override permissions and budgets.", "Connect 不保证能唤醒同一外部聊天并开始新推理。实验性源目标与托管目标工具仅在开启时提供，使用明确的续跑契约，不提供无限推理，也不会绕过权限或预算。")}</p>
          <a href={localizedWebsiteHref("/docs/long-running-work", locale)}>{tr("Durable-task boundaries", "持久任务边界")} →</a>
        </section>
        <section id="docs-schedule">
          <h2>{tr("Future starts, recurring work and keeping the computer awake", "未来启动、周期工作与电脑保持唤醒")}</h2>
          <p>{tr("Durable deterministic Tasks support a future ISO timestamp or interval schedule. Recurring runs of the same task do not overlap, and the next interval starts from the previous run's completion. These Connect contracts do not add calendar cron or missed-run backfill. Arc Routines separately support local-time schedules with IANA timezones and DST handling.", "持久确定性 Task 支持未来 ISO 时间或间隔调度。同一任务不重叠运行，下一次间隔从上轮完成开始计算；这些 Connect 契约不提供日历 Cron 或错过运行补跑；Arc Routine 另行支持本地时间、IANA 时区与夏令时处理。")}</p>
          <p>{tr("The current native Agent separates process recovery from Relay reconnect. Normal launches keep the terminal open. macOS launchd/Linux systemd supervise a daemon; Windows login starts a hidden supervisor that restarts its Agent. One Agent executes while other terminals show its operation log. Recovery off preserves execution; Stop background Agent is separate. Windows needs its supervisor to remain running. Sleep and power loss still make the computer unavailable. Update all running instances to use the execution lease.", "当前原生 Agent 将进程恢复与 Relay 重连分开。正常启动保留终端。macOS launchd/Linux systemd 守护 Agent；Windows 登录启动隐藏守护并在 Agent 结束后重启。仅一个 Agent 执行，其他终端显示操作日志。关闭恢复保留执行，停止后台 Agent 是独立操作。Windows 守护本身需要保持运行。睡眠和断电仍会让设备不可用；所有运行实例都需更新才会遵守执行锁。")}</p>
          <p>{tr("Task keep-awake requires both device permission and keep_awake=true on that task, plus a compatible local agent. Active tasks renew short-lived OS power requests; completion, cancellation, pause or lease expiry releases them. This does not power on a shut-down computer, defeat forced sleep or permanently change power settings. Future tasks need an available computer when they start.", "任务保持唤醒同时要求设备授权、任务设置 keep_awake=true 和兼容的本地 Agent。活动任务续租短期 OS 电源请求，完成、取消、暂停或租约到期后释放。它不能启动已关机电脑、阻止强制休眠或永久修改电源设置；未来任务开始时电脑需要可用。")}</p>
        </section>
        <section id="docs-browser">
          <h2>{tr("Read the tabs you explicitly share", "读取你明确共享的标签页")}</h2>
          <p>{tr("The Chrome companion adds scoped page context to the same MCP connection. Share as many tabs as you need; Remote Arc has no fixed tab-count cap, and every tab starts read-only. You can separately enable Click & fill for one shared tab. Interaction requires a fresh page snapshot, rejects stale element refs, and blocks recognized password, payment-card and file-picker fields. OTP login and registration require website approval in Dashboard Browser authentication. Browser tools remain ordinary scoped MCP tools; durable deterministic Tasks do not gain extra browser authority.", "Chrome Companion 为同一 MCP 连接提供受控页面上下文。可以同时共享任意数量的标签页，Remote Arc 不设置固定数量上限，每个标签页默认只读；需要时再对某一个已共享标签页单独开启 Click & fill。交互必须基于最新页面快照，过期元素引用会被拒绝，并阻止能够通过标准字段类型或 autocomplete 元数据识别出的密码、支付卡与文件选择字段。OTP 验证码登录、注册需在 Dashboard 浏览器认证中批准目标网站。浏览器工具仍是普通的受控 MCP 工具；持久确定性 Task 不会因此获得额外浏览器权限。")}</p>
          <a href={localizedWebsiteHref("/docs/mcp#chrome-browser", locale)}>{tr("Install the browser companion", "安装浏览器 Companion")} →</a>
        </section>
        <section id="docs-sandbox">
          <h2>{tr("Native execution and sandbox isolation", "本机执行与沙箱隔离")}</h2>
          <p>{tr("Sandbox isolation would place commands in an OS-enforced environment with restricted files, processes, credentials and network access. Remote Arc currently executes as the local OS user. Tool permissions, workspace paths and Safety Guard reduce reach and mistakes, but do not create an OS sandbox. A shell can reference paths beyond cwd and use the local user's network access.", "沙箱隔离是把命令放进由 OS 强制约束的环境，限制文件、进程、凭证和网络访问。Remote Arc 当前以本机 OS 用户身份执行。工具权限、工作区路径和 Safety Guard 可以缩小能力与减少误操作，但不构成 OS 沙箱；Shell 仍能引用 cwd 之外的路径并使用本机用户的网络权限。")}</p>
          <p>{tr("An AI client's own sandbox protects its execution environment; it does not automatically contain commands sent through MCP to your computer. For constrained file-only work, keep terminal disabled. For stronger isolation now, pair a dedicated restricted OS account or an isolated machine you manage. A container or VM requires its own correctly configured boundary.", "AI 客户端自身的沙箱保护的是它的运行环境，不会自动隔离通过 MCP 发到你电脑上的命令。仅需受限文件操作时应关闭终端。现阶段若需要更强隔离，可以配对受限的独立 OS 账户或你管理的隔离设备；容器或虚拟机仍需要正确配置自身边界。")}</p>
          <p>{tr("A selectable isolated execution profile is a future design, not a working Dashboard feature. Native access remains useful for your existing projects and tools. The engineering decision explains when isolation is appropriate and what must be verified before adding an isolation switch.", "可选隔离执行配置属于未来设计，当前 Dashboard 没有已实现的沙箱功能。本机访问仍适合已有项目与工具链；技术决策文档说明哪些场景需要隔离，以及增加开关前必须验证的边界。")}</p>
          <a href={engineering + "execution-isolation.md"}>{tr("Isolation design decision", "隔离技术决策")} ↗</a>
        </section>
        <section id="docs-tools"><h2>{tr("Public MCP tools", "公开 MCP 工具")}</h2><ToolReference /></section>
        <section id="docs-data">
          <h2>{tr("What passes through the relay, and what is saved", "哪些内容经过 Relay，哪些会保存")}</h2>
          <p>{tr("Active file contents, tool arguments and command output pass through the hosted relay and your chosen AI client. Transport uses HTTPS/WSS; this is not zero-knowledge end-to-end encryption. Operational audit records retain metadata such as tool, device, time and outcome rather than raw payloads.", "当前文件内容、工具参数和命令输出会经过托管 Relay 并返回所选 AI 客户端。传输使用 HTTPS/WSS，不属于 zero-knowledge 端到端加密。运行审计保留工具、设备、时间和结果等元数据，而非原始 Payload。")}</p>
          <p>{tr("Durable task storage is separate from audit storage. It saves approved commands/plans, objectives, verification, policy snapshots, run summaries, factual memory, bounded observations and completion evidence. Observations can contain file content or command output. Pending source decisions can contain edit content; their bodies are cleared after consumption, while idempotency hashes remain.", "持久任务存储独立于审计存储，会保存已批准的命令或计划、目标、验证、策略快照、运行摘要、事实记忆、受限观察和完成证据。观察可能包含文件内容或命令输出；待消费源决策可能包含编辑内容，消费后清除正文并保留幂等 Hash。")}</p>
          <p>{tr("Hosted goals send bounded context to the configured planner provider. Source goals return it to the authorized source client. Task event callbacks use an encrypted stored signing secret and carry short change metadata; readers obtain full context through authorized tools. Full local process capture and Undo snapshots have local retention limits.", "托管目标把受限上下文发送到配置的 Planner 服务，源目标则返回给已授权源客户端。任务事件回调使用加密保存的签名 Secret，仅携带简短变化元数据；完整上下文通过授权工具读取。本地完整进程捕获和 Undo 快照有各自的保留限制。")}</p>
          <p>{tr("Arc additionally stores encrypted chat messages, tool observations, selected Skills and bounded personal memories for hosted work. Relevant context is sent to the selected model provider. Inspect or delete personal notes in Memory settings; chat history, App accounts and device access have separate controls.", "Arc 还为托管工作保存加密聊天消息、工具观察、选择的技能与有界个人记忆，相关上下文会发送到所选模型服务商。可在记忆设置查看或删除个人笔记；聊天历史、应用账号与设备访问分别管理。")}</p>
          <a href={localizedWebsiteHref("/privacy", locale)}>{tr("Privacy details", "隐私详情")} →</a>
        </section>
        <section id="docs-troubleshoot">
          <h2>{tr("When work is not progressing", "工作没有推进时")}</h2>
          <ul className="articleBulletList">
            <li>{tr("Device offline: check power, login, local agent and network. Reconnect can resume a saved Task; the relay cannot wake a powered-off machine.", "设备离线：检查供电、登录、本地 Agent 和网络。重连可继续保存的 Task，Relay 无法唤醒已关机设备。")}</li>
            <li>{tr("Tool unavailable: inspect device_tools, device policy and the local --safe ceiling. A Task switch alone does not enable terminal access.", "工具不可用：检查 device_tools、设备策略和本机 --safe 上限。单独打开任务开关不会授予终端能力。")}</li>
            <li>{tr("Needs fresh AI judgment: the deterministic Task should stop or wait. Resume it from an active supported AI host rather than pretending the original Chat is still running.", "需要新的 AI 判断：确定性 Task 应停止或等待，由可用且受支持的 AI 宿主重新接手，而不是假装原 Chat 仍在运行。")}</li>
            <li>{tr("Policy changed or result unknown: read the error and journal, inspect the actual state, then choose a safe next step. Do not repeat an uncertain external effect blindly.", "策略变化或结果未知：阅读错误与日志、检查真实状态，再选择安全的下一步，不要盲目重复不确定的外部副作用。")}</li>
            <li>{tr("Finished without independent verification: provide a reliable verification command next time. A completion label alone is not an independent test.", "没有独立验证便显示完成：下次提供可靠验收命令。完成标签本身不等于独立测试。")}</li>
          </ul>
        </section>
        <section id="docs-limits">
          <h2>{tr("Availability and practical limits", "可用状态与实际边界")}</h2>
          <p>{tr("Remote MCP exposes authorized App and device tools. Connect persists deterministic task contracts, with experimental goal tools where enabled. Arc provides bounded hosted chat, Tasks, Routines and AI teams Beta on the same account connections. Availability still depends on configuration, access, device version and Credits.", "Remote MCP 提供已授权的应用与设备工具。Connect 保存确定性任务契约，开启实验能力时另有目标工具。Arc 在同一账号连接之上提供有界托管聊天、Task、Routine 和 AI 团队 Beta。可用性仍取决于配置、权限、设备版本与 Credits。")}</p>
          <p>{tr("Remote Arc does not provide GUI desktop control, arbitrary shell containment, exactly-once external effects or guaranteed model reasoning duration. Set a deliverable, verification and reasonable limits; treat failed, expired, cancelled and blocked work as distinct outcomes.", "Remote Arc 当前不提供 GUI 桌面控制、任意 Shell 隔离、外部副作用 exactly-once 保证或固定模型推理时长。请设置交付物、验收和合理限制，区分失败、到期、取消与阻塞结果。")}</p>
          <div className="articleEndLinks"><a href={localizedWebsiteHref("/docs/long-running-work", locale)}>{tr("Long-running work", "持续工作")} →</a><a href={localizedWebsiteHref("/security-model", locale)}>{tr("Security model", "安全模型")} →</a><a href={localizedWebsiteHref("/use-cases", locale)}>{tr("Use cases", "使用场景")} →</a></div>
        </section>
      </SelectedSections></article>
    </div>
  </main>;
}

export function McpReference() {
  const { tr, locale } = useI18n();
  return <main className="technicalDoc productDocs">
    <header className="articleHeader"><span className="eyebrow">REMOTE MCP</span><h1>{tr("One connection for your apps and computers.", "一次连接，使用你的应用与电脑。")}</h1>
      <p>{tr("Add Remote Arc to a compatible AI client, sign in and choose what it can access. This reference covers authorization, app actions, device tools and browser sharing.", "在兼容 AI 客户端中添加 Remote Arc，登录并选择可访问的能力。本参考介绍账号授权、应用操作、设备工具与浏览器共享。")}</p>
      <Code>{endpoint}</Code>
    </header>
    <div className="technicalDocLayout"><aside className="articleToc"><strong>{tr("CONTENTS", "目录")}</strong>{[
      ["mcp-connect", tr("Connect your client", "连接客户端")], ["mcp-auth", tr("Authorization", "授权")], ["mcp-device", tr("Select a device", "选择设备")],
      ["mcp-apps", tr("Use connected apps", "使用连接的应用")], ["mcp-tools", tr("Tools and scopes", "工具与 Scope")], ["browser-runner", tr("Task browsers", "任务浏览器")], ["your-chrome", tr("Your Chrome (advanced)", "你的 Chrome（高级）")], ["chrome-browser", tr("Browser companion", "浏览器 Companion")],
    ].map(([id, label]) => <a key={id} href={"#" + id}>{label}</a>)}</aside><article className="technicalArticle">
      <section id="mcp-connect"><h2>{tr("Connect using the client installation path", "通过客户端安装入口连接")}</h2>
        <p>{tr("In ChatGPT, install the published Remote Arc plugin and connect your account. Other compatible clients can add the HTTPS endpoint through their remote MCP settings. To use computer tools, also install the local Agent and pair that computer to the same Remote Arc account. The public ChatGPT plugin's connected-App tools are still under review; Arc and supported custom MCP connections retain their App integrations.", "ChatGPT 用户安装已上架的 Remote Arc 插件并连接账号；其他兼容客户端可在 Remote MCP 设置中添加 HTTPS 地址。使用电脑工具时，还需安装本地 Agent，并将电脑配对到同一个 Remote Arc 账号。公开 ChatGPT 插件的 Apps 工具仍在审核，Arc 和受支持的 Custom MCP 连接继续提供 Apps 集成。")}</p>
        <p><a href="https://developers.openai.com/plugins/deploy/connect-chatgpt" target="_blank" rel="noreferrer">{tr("Official OpenAI connection guide", "OpenAI 官方连接指南")} ↗</a></p>
        <p>{tr("Claude uses a custom Remote MCP connector and OAuth. Cursor can use the generated MCP installation link or its remote server configuration. Other clients must support the endpoint transport and OAuth discovery; compatibility does not imply they can continue an agent overnight.", "Claude 使用自定义 Remote MCP Connector 和 OAuth；Cursor 可使用生成的 MCP 安装链接或远程服务器配置。其他客户端需要支持此端点的传输和 OAuth 发现。连接兼容不代表具备过夜 Agent 续接能力。")}</p>
        <div className="articleMetaLinks"><a href={localizedWebsiteHref("/install/chatgpt", locale)}>ChatGPT →</a><a href={localizedWebsiteHref("/install/claude", locale)}>Claude →</a><a href={localizedWebsiteHref("/install/cursor", locale)}>Cursor →</a></div>
      </section>
      <section id="mcp-auth"><h2>{tr("OAuth and device access are separate", "OAuth 与设备权限分离")}</h2>
        <p>{tr("The endpoint uses OAuth authorization code flow with PKCE and published discovery metadata. Sign in to Remote Arc and review the requested scopes. Device credentials stay with the local agent; you do not paste a computer credential into the AI client. Revoking a client grant, pausing account MCP access or revoking a device can stop access independently.", "端点使用带 PKCE 的 OAuth 授权码流程和公开发现元数据。登录 Remote Arc 并核对请求 Scope；设备凭证留在本地 Agent，不需要粘贴给 AI 客户端。客户端授权撤销、账户 MCP 暂停和设备撤销可分别切断访问。")}</p>
        <p>{tr("Task permission is persistent authority for the saved work. Every future device action still checks ownership, revocation, approved tools and the local path policy. Account MCP Pause blocks AI client requests but does not disconnect device Agents or terminate independently running tasks. Device Pause shuts down the execution Core while preserving only an authenticated wake connection; Resume restores execution. Disconnect Completely closes both connections and disables remote waking.", "任务授权赋予的是已保存工作的持续执行能力；未来每次设备动作仍检查归属、撤销、已批准工具和本地路径策略。账户级 MCP Pause 只拦截 AI 客户端请求，不会让设备 Agent 断开或终止独立运行的任务。设备 Pause 关闭执行 Core，仅保留已认证的唤醒连接；Resume 恢复执行。完全断开会关闭两种连接并停用远程唤醒。")}</p>
      </section>
      <section id="mcp-device"><h2>{tr("Discover before acting", "先发现设备，再操作")}</h2>
        <ol><li>{tr("Call list_devices and resolve the user-named computer to device_id.", "调用 list_devices，把用户指定的电脑解析为 device_id。")}</li><li>{tr("Call device_tools for the tools available on that computer.", "调用 device_tools，查看目标电脑实际开放的工具。")}</li><li>{tr("Pass device_id with device tool calls; check the workspace and action's permission before a write or command.", "设备工具调用传入 device_id，写入或执行命令前检查工作区与动作权限。")}</li></ol>
        <Code>{'{ "device_id": "<id returned by list_devices>", "path": "/your/workspace/README.md" }'}</Code>
        <p>{tr("Path syntax is the target computer's syntax. Ordinary calls need an online device. A saved Task can wait for reconnection; that does not make a direct call durable.", "路径采用目标电脑的语法。普通调用要求设备在线；保存的 Task 可以等待重连，但不代表直接调用也具备持久化能力。")}</p>
      </section>
      <section id="mcp-apps"><h2>{tr("Discover and use connected apps", "发现与使用连接的应用")}</h2>
        <p>{tr("Connect an available app in your workspace's Apps page. In Arc, ask to use that account for a specific result. Supported MCP connections expose the fixed catalog through three tools: list_apps lists your connected accounts and searches actions by use_case, run_app_read_action runs one read-only action and run_app_write_action runs one change you asked for. Every action and its exact arguments are listed in those two tools' schemas. These tools are still under review for the public ChatGPT plugin and may not yet be available through that listing.", "在工作空间的 Apps 页面连接已开放应用，再在 Arc 中说明要通过该账号完成什么。受支持的 MCP 连接通过三个工具提供固定目录：list_apps 列出已连接账号并按 use_case 搜索操作，run_app_read_action 执行一个只读操作，run_app_write_action 执行一个你要求的更改。每个操作及其准确参数都逐一列在这两个工具的 Schema 中。这些工具在公开 ChatGPT 插件中仍待审核，可能暂时无法通过该公开条目使用。")}</p>
        <Code>{'{ "provider": "github" }'}</Code>
        <p>{tr("When these tools are available in your client, supply the matching connectionId, the action ID (for example github.issues.create) with its arguments, and a stable requestId. The AI client needs apps:read, plus apps:write for changes. Provider permissions still apply; Remote Arc adds no separate per-operation approval. Your AI client's own confirmation settings may still apply.", "客户端已开放这些工具时，传入匹配的 connectionId、操作 ID（例如 github.issues.create）及其 arguments，以及稳定的 requestId。AI 客户端需要 apps:read，修改还需 apps:write。操作仍受服务商权限约束，Remote Arc 不增加逐次审批；AI 客户端自身的确认设置仍可能适用。")}</p>
        <p>{tr("Reuse the same requestId when checking a request after a timeout. If the result is unknown, inspect it before starting another write. Reconnect an account if permissions are missing or authorization has expired. Some app operations use a separately billed provider API account.", "超时后核查同一请求时，请复用原 requestId。结果不明时先检查结果，再决定是否发起新写入。权限不足或授权过期时重新连接账号。部分应用操作会消耗单独计费的服务商 API 用量。")}</p>
        <a href={localizedWebsiteHref("/docs/apps",locale)}>{tr("Apps connection guide", "Apps 连接指南")} →</a>
      </section>
      <section id="mcp-tools"><h2>{tr("Tools and required scopes", "工具与所需 Scope")}</h2><ToolReference /></section>
      <BrowserModes />
      <section id="browser-runner"><h2>{tr("Runner: sign in once, reuse your profile", "Runner：登录一次，复用浏览器资料")}</h2>
        <p>{tr("Enable Browser Runner for the computer in Dashboard and keep its Agent running. The default Runner uses a separate browser profile. In Agent 0.6.3, Runner keeps its window in the background. Inspect a snapshot after submission or navigation. If needs_user is reported, resume the same task_id with headless=false to show its existing window, let the user complete sign-in or verification, then inspect another snapshot. Automatic post-submit handoff and live view are pending release. Choose one profile per person, sign in once, and reuse that profile in later tasks and chats. Sign-ins entered in its window are saved locally unless browserRunnerSaveLogins is disabled. You can also add a site-bound sign-in with remotelink vault add on the computer. fill_secret fills it only on its saved sites; the password stays out of the AI conversation.", "在 Dashboard 为电脑开启 Browser Runner，并保持 Agent 运行。默认 Runner 使用独立的浏览器资料。使用 Agent 0.6.3 时，Runner 将窗口保持在后台。提交或跳转后读取快照；如返回 needs_user，使用同一 task_id 和 headless=false 显示原窗口，让用户完成登录或验证，再读取新快照。提交后自动交接与实时画面尚待发布。为每个人选定一份 profile，登录一次，后续任务和聊天复用该 profile。窗口中输入的登录信息会保存在本机，除非关闭 browserRunnerSaveLogins；也可在电脑终端用 remotelink vault add 添加限定网站的登录信息。fill_secret 只在保存时指定的网站填写，密码不会进入 AI 对话。")}</p>
        <Code>{'{ "device_id": "<computer>", "task_id": "application", "browser": "runner", "profile": "jenny", "allowed_origins": ["https://jobs.example.com"], "start_url": "https://jobs.example.com" }'}</Code>
        <p>{tr("Allowed sites apply to both Runner modes. Embedded forms on other sites also need to be named. Approve OTP login/registration and supported CAPTCHA controls per website in Dashboard Browser authentication. Codes come from the connected mail app; unsupported challenges and payment details need you. Review answers before authorizing a final submission.", "两种 Runner 模式都受 allowed_origins 限制，其他网站的内嵌表单也需列入允许范围。在 Dashboard 浏览器认证中按网站批准 OTP 登录、注册和支持的 CAPTCHA 控件操作。验证码从已连接的邮箱应用获取；不支持的挑战和支付信息仍需你处理。最终提交前先核对答案并授权。")}</p>
      </section>
      <section id="your-chrome"><h2>{tr("Connect the Chrome you already use", "连接你正在使用的 Chrome")}</h2>
        <p>{tr("Advanced and optional. Your AI uses Runner unless you ask it to use your own Chrome: in this mode Chrome asks you to click Allow for every new connection and shows a control banner, which can interrupt what you are doing.", "高级、可选。除非你要求 AI 使用你自己的 Chrome，否则都使用 Runner：这个模式下每次新连接 Chrome 都会请你点「允许」，并显示受控提示，可能打断你手上的事。")}</p>
        <ol><li>{tr("Open Chrome 144 or later on the linked computer. Visit chrome://inspect/#remote-debugging and enable Allow remote debugging for this browser instance.", "在已连接的电脑上打开 Chrome 144 或更新版本，进入 chrome://inspect/#remote-debugging，勾选「允许对此浏览器实例进行远程调试」。")}</li><li>{tr("Start the task with browser=your_chrome. Leave profile and headless out. Chrome asks you to click Allow for the connection.", "使用 browser=your_chrome 启动任务，不传 profile 和 headless；在 Chrome 的连接提示中点击「允许」。")}</li><li>{tr("The task opens its own window using your current sign-ins. Several tasks share the connection. A new connection needs Allow again; Chrome shows a control banner while connected.", "任务会使用现有登录状态打开自己的窗口，多个任务共用连接。每次建立新连接仍需授权；连接期间 Chrome 会显示受控提示。")}</li></ol>
        <Code>{'{ "device_id": "<computer>", "task_id": "chrome-application", "browser": "your_chrome", "allowed_origins": ["https://jobs.example.com"], "start_url": "https://jobs.example.com" }'}</Code>
        <p>{tr("If Chrome is waiting for Allow, retry the same task_id after approving; the pending request lasts 3 minutes. Closing a task closes its own tab. The connection disconnects 5 minutes after the last task detaches; unused tasks pause after 20 minutes. Stopping the Agent disconnects and leaves task windows for later recovery. If already disconnected, closing a task reports tab_left_open so you can close that window manually. Your other tabs and Chrome profile are kept.", "若 Chrome 正等待授权，点击「允许」后用同一 task_id 重试，授权请求保留 3 分钟。关闭任务会关闭它自己的标签页。最后一个任务脱离连接后 5 分钟会断开；未使用的任务在 20 分钟后暂停。停止 Agent 会断开连接并保留任务窗口，方便之后恢复。若已经断开，关闭任务会返回 tab_left_open，可手动关闭该窗口。你原有的标签页和 Chrome 资料会保留。")}</p>
        <p><a href="https://developer.chrome.com/blog/chrome-devtools-mcp-debug-your-browser-session" target="_blank" rel="noreferrer">{tr("Chrome's connection and permission guide", "Chrome 官方连接与授权说明")} ↗</a></p>
      </section>
      <section id="chrome-browser"><h2>{tr("Install the scoped Chrome companion", "安装受控 Chrome Companion")}</h2>
        <p><a href={localizedWebsiteHref("/chrome-extension", locale)}>{tr("Open the Chrome Companion download and installation page", "打开 Chrome Companion 下载与安装页面")} →</a></p>
        <p>{tr("Download and unzip the companion. In chrome://extensions, enable Developer mode, choose Load unpacked and select the extracted folder. Open its popup, select Connect to Remote Arc and approve browser pairing. Then allow a site once when your AI asks (or from the popup), or explicitly Share this tab. It is an unpacked beta, not a Chrome Web Store extension; downloaded versions must be reloaded manually.", "下载并解压 Companion，在 chrome://extensions 开启开发者模式，选择「加载已解压的扩展程序」并指定解压文件夹。打开扩展，点击 Connect to Remote Arc 并批准浏览器配对。之后在 AI 请求时（或在扩展弹窗里）允许一次网站，或手动 Share this tab。此 Beta 尚未上架 Chrome Web Store；以后更新仍需重新下载并加载。")}</p>
        <p>{tr("Use shared_tab_list to select tab_id when several tabs are shared. shared_tab_read returns the page with a snapshotId plus stable refs for that snapshot, and can also return the selected text, links or one table. shared_tab_click and shared_tab_fill require both that snapshot and an explicit per-tab Click & fill grant; a click invalidates the snapshot and the page must be read again. With extension 0.4.0, shared_tab_open opens a tab on a site you allowed and shared_tab_act clicks, fills, selects, presses keys, scrolls, navigates, goes back, waits and fills whole forms there; anything that orders, pays, posts or submits needs effect=submit with an idempotency_key, is sent once, and is settled with action=confirm.", "同时共享多个标签页时，用 shared_tab_list 选择 tab_id。shared_tab_read 会返回页面内容、snapshotId 和当前快照内的元素 ref，也可以一并返回选中文字、链接或某个表格；shared_tab_click 与 shared_tab_fill 只有在该标签页明确开启 Click & fill 后才能使用。每次点击都会使当前快照失效，下一次交互前必须重新读取页面。扩展 0.4.0 起，shared_tab_open 可在你允许的网站上打开标签页，shared_tab_act 可在其中点击、填写、选择、按键、滚动、跳转、后退、等待和一次填写整个表单；下单、付款、发布或提交需要 effect=submit 和 idempotency_key，只发送一次，并用 action=confirm 确认结果。")}</p>
      </section>
      <footer className="articleEndLinks"><a href={localizedWebsiteHref("/docs", locale)}>{tr("Product documentation", "产品文档")} →</a><a href={localizedWebsiteHref("/security-model", locale)}>{tr("Security model", "安全模型")} →</a></footer>
    </article></div>
  </main>;
}
