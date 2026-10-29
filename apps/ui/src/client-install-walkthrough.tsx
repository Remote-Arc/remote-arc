import React, { useEffect, useState } from "react";
import { useI18n } from "./i18n.js";
import "./client-install-walkthrough.css";

type Client = "claude" | "chatgpt" | "gemini";
type StepKind = "add" | "auth" | "connect" | "tools" | "approval" | "running" | "result"
  | "gpt-create" | "gpt-plugin" | "gpt-running" | "gpt-result"
  | "gemini-url" | "gemini-auth" | "gemini-connect" | "gemini-use" | "gemini-ready";

const filenames: Record<StepKind, string> = {
  add: "01-add-custom-connector.png",
  auth: "02-oauth-settings.png",
  connect: "03-connect.png",
  tools: "04-tool-permissions.png",
  approval: "05-tool-approval.png",
  running: "06-scan-progress.png",
  result: "07-readonly-scan-result.png",
  "gpt-create": "01-create-custom-mcp.png",
  "gpt-plugin": "02-plugin-ready.png",
  "gpt-running": "03-run-in-chat.png",
  "gpt-result": "04-mac-result.png",
  "gemini-url": "step-01.png",
  "gemini-auth": "step-02.png",
  "gemini-connect": "step-03.png",
  "gemini-use": "step-04.png",
  "gemini-ready": "step-05.png",
};

function GuideScreenshot({ client, src, alt }: { client: Client; src: string; alt: string }) {
  return <div className={"claudeGuideImageArea claudeGuideImageArea--" + client}>
    <img src={src} alt={alt} decoding="async" />
  </div>;
}

export function ClientInstallWalkthrough({ client }: { client: Client }) {
  const { tr } = useI18n();
  const [selected, setSelected] = useState(0);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    setSelected(0);
    setExpanded(false);
  }, [client]);
  useEffect(() => {
    if (!expanded) return;
    const onEscape = (e: KeyboardEvent) => { if (e.key === "Escape") setExpanded(false); };
    document.addEventListener("keydown", onEscape);
    return () => document.removeEventListener("keydown", onEscape);
  }, [expanded]);
  const claudeSteps: { kind: StepKind; group: string; title: string; detail: string; note: string }[] = [
    {
      kind: "add", group: tr("SET UP", "添加连接"),
      title: tr("Add a custom connector", "添加自定义连接器"),
      detail: tr("In Claude, open Customize → Connectors. Click + Add in the top-right corner and choose Add custom connector. Name it Remote Arc and paste the MCP URL above, then Continue.",
        "在 Claude 的 Customize → Connectors 页面，点击右上角 + Add → Add custom connector。名称填写 Remote Arc，粘贴上面的 MCP 地址并点击 Continue。"),
      note: tr("The URL must end in /mcp. Do not paste an npx command.", "URL 必须包含 /mcp；不要填入 npx 命令。"),
    },
    {
      kind: "auth", group: tr("SET UP", "添加连接"),
      title: tr("Choose OAuth sign-in", "选择 OAuth 登录"),
      detail: tr("Select Sign in now under Authentication, then Use Claude's published identity under OAuth client (recommended). Click Add.",
        "Authentication 选择 Sign in now；OAuth client 选择 Use Claude's published identity（推荐）。最后点击 Add。"),
      note: tr("Do not choose No sign-in just because Claude labels it Detected. Remote Arc requires account authorization.",
        "即使 No sign-in 显示 Detected，也不要选它。Remote Arc 需要账户 OAuth 授权。"),
    },
    {
      kind: "connect", group: tr("SET UP", "添加连接"),
      title: tr("Connect your Remote Arc account", "连接 Remote Arc 账户"),
      detail: tr("Open the new Remote Arc connector and click Connect. Complete the Remote Arc authorization in the browser.",
        "打开新建的 Remote Arc Connector，点击 Connect，在浏览器中完成 Remote Arc 账户登录与授权。"),
      note: tr("Connecting the account does not pair your computer. Keep the Remote Arc agent online on the device you want to use.",
        "登录账户不等于电脑已配对。目标设备还需要保持 Remote Arc Agent 在线。"),
    },
    {
      kind: "tools", group: tr("PERMISSIONS", "工具权限"),
      title: tr("Review tool permissions", "检查工具权限"),
      detail: tr("After connection, Claude shows the Remote Arc tools. Choose whether it asks before individual tool calls. Keep approval on for sensitive actions.",
        "连接后，Claude 会列出 Remote Arc 工具。你可以设置每个工具是否需要 Claude 端授权；敏感操作建议保留审批。"),
      note: tr("Claude's tool permissions do not override Remote Arc's device-side Safety Guard or workspace restrictions.",
        "Claude 端权限不会绕过 Remote Arc 设备端 Safety Guard 或 Workspace 限制。"),
    },
    {
      kind: "approval", group: tr("TRY IT", "开始使用"),
      title: tr("Approve the first tool call", "批准第一次工具调用"),
      detail: tr("Enable Remote Arc from the chat’s + → Connectors menu, then ask Claude to use it. Review any tool approval shown before the first call.",
        "在对话的 ＋ → Connectors 菜单中启用 Remote Arc，再让 Claude 使用它。首次调用时检查出现的工具授权提示。"),
      note: tr("For a safer first test, start with read-only operations such as listing devices.",
        "第一次测试建议从列设备等只读操作开始。"),
    },
    {
      kind: "running", group: tr("TRY IT", "开始使用"),
      title: tr("Let Claude work on your computer", "让 Claude 开始执行"),
      detail: tr("For example, ask Claude why your Windows C: drive is using space. Remote Arc can inspect permitted folders without modifying them.",
        "例如，让 Claude 分析 Windows C 盘空间占用。Remote Arc 可以在授权范围内只读检查目录，而无需修改文件。"),
      note: tr("Disk scans can take a while. A slow response does not mean the connection failed.",
        "磁盘扫描可能需要一点时间，响应较慢不代表连接失败。"),
    },
    {
      kind: "result", group: tr("TRY IT", "开始使用"),
      title: tr("Review the results", "查看执行结果"),
      detail: tr("Claude returns a folder-by-folder breakdown. Confirm that the result is read-only before approving any cleanup or changes.",
        "Claude 会汇总各目录占用空间。要清理文件之前，先确认结果并单独审核任何写入操作。"),
      note: tr("The example numbers are illustrative, not a live scan of your device.", "示例数值仅用于说明，并非你的设备实时扫描结果。"),
    },
  ];
  const chatgptSteps: { kind: StepKind; group: string; title: string; detail: string; note: string }[] = [
    {
      kind: "gpt-create", group: tr("CONNECT", "添加连接"),
      title: tr("Add a custom MCP server", "创建自定义 MCP Server"),
      detail: tr("In ChatGPT Plugins, add a custom MCP server. Enter Remote Arc as the name and https://mcp.remotearc.app/mcp as the Server URL, select OAuth, review the warning, then choose Create as a plugin.",
        "在 ChatGPT Plugins 中添加自定义 MCP Server。名称输入 Remote Arc，Server URL 填写 https://mcp.remotearc.app/mcp，认证选择 OAuth，阅读提示后点击 Create as a plugin。"),
      note: tr("The exact menu depends on your account and workspace. Use the full HTTPS URL including /mcp; no local API keys are required.",
        "菜单入口取决于账户和工作区权限。必须填写包含 /mcp 的完整 HTTPS 地址，不需要本地 API Key。"),
    },
    {
      kind: "gpt-plugin", group: tr("AUTHORIZE", "授权连接"),
      title: tr("Confirm the Remote Arc plugin", "确认 Remote Arc 插件"),
      detail: tr("Complete the Remote Arc OAuth sign-in when prompted. Open the Remote Arc plugin details and check that it is connected. Choose Try in chat to start using it.",
        "根据提示完成 Remote Arc OAuth 登录。打开 Remote Arc 插件详情确认连接，随后点击 Try in chat 开始使用。"),
      note: tr("A connected plugin is not the same as an online computer. The target computer must also be paired and running Remote Arc.",
        "插件连接成功不代表电脑已在线；目标设备还需要先配对并运行 Remote Arc。"),
    },
    {
      kind: "gpt-running", group: tr("TRY IT", "开始使用"),
      title: tr("Ask ChatGPT to use Remote Arc", "让 ChatGPT 开始使用 Remote Arc"),
      detail: tr("In a chat, select @Remote Arc and request a read-only action — for example: 'Could you help summarize my Mac information?' ChatGPT will call the tools your device makes available.",
        "在对话中选择 @Remote Arc，提出一个只读请求，例如“Could you help summarize my Mac information?”，ChatGPT 会调用设备已开放的工具。"),
      note: tr("The first invocation may need approval. Remote Arc’s own device-side policies still apply.",
        "首次调用可能需要批准，而且 Remote Arc 本机权限策略仍然生效。"),
    },
    {
      kind: "gpt-result", group: tr("RESULT", "执行结果"),
      title: tr("Review your Mac's live details", "查看 Mac 的真实执行结果"),
      detail: tr("ChatGPT returns information gathered through your Mac via Remote Arc, such as hardware details, storage and battery health. The screenshot shows a real completed session.",
        "ChatGPT 会通过 Remote Arc 读取 Mac 的硬件、存储、电池健康等信息。这张图展示的是实际完成的一次任务。"),
      note: tr("This is an example session, not your computer's current live status. Only approved read operations were used.",
        "这里展示的是历史实际操作案例，不代表你当前设备的实时状态；示例仅涉及已授权的读取操作。"),
    },
  ];
  const geminiSteps: { kind: StepKind; group: string; title: string; detail: string; note: string }[] = [
    {
      kind: "gemini-url", group: tr("CONNECT", "添加连接"),
      title: tr("Add the Remote Arc MCP URL", "添加 Remote Arc MCP 地址"),
      detail: tr("In Gemini on the web, open Settings → Connected Apps (sometimes under Personal Intelligence). Under Custom apps, add https://mcp.remotearc.app/mcp and select Next.",
        "在 Gemini 网页版进入 Settings → Connected Apps（部分账号在 Personal Intelligence 下），在 Custom apps 中添加 https://mcp.remotearc.app/mcp 并点击 Next。"),
      note: tr("Enter the complete HTTPS URL including /mcp. No API key or local command is needed in Gemini.", "填写包含 /mcp 的完整 HTTPS 地址；Gemini 中不需要 API Key 或本地命令。"),
    },
    {
      kind: "gemini-auth", group: tr("AUTHORIZE", "授权连接"),
      title: tr("Review Google account linking", "核对 Google 账户关联授权"),
      detail: tr("Google displays the account linking permission screen. Read the requested scopes carefully before proceeding with Remote Arc authorization.",
        "Google 会展示账户关联与权限确认页面。继续授权 Remote Arc 前，先核对页面列出的权限范围。"),
      note: tr("Only authorize a connector you trust. Google explicitly warns that custom connected apps have not been reviewed.", "只授权你信任的连接器；Google 会明确提示自定义连接器未经审核。"),
    },
    {
      kind: "gemini-connect", group: tr("CONNECT", "完成连接"),
      title: tr("Name and connect the custom app", "命名并连接自定义 App"),
      detail: tr("After linking, name the custom app Remote Arc. Review the available MCP actions, then select Connect.",
        "完成账户关联后将自定义应用命名为 Remote Arc，核对列出的 MCP 工具，然后点击 Connect。"),
      note: tr("Visible actions reflect the MCP server, not blanket permission to bypass the local device policy.", "列出的工具来自 MCP 服务，不代表可以绕过设备端权限策略。"),
    },
    {
      kind: "gemini-use", group: tr("START", "开始使用"),
      title: tr("Select Remote Arc with @", "用 @ 选择 Remote Arc"),
      detail: tr("In a Gemini chat, enter @ and select Remote Arc. Some versions also offer Use now from the custom app details.",
        "在 Remote Arc 连接器详情页打开更多菜单，用 @ 选择 Remote Arc，即可在 Gemini 中开始使用。"),
      note: tr("Keep your computer online with npx remotelink before requesting device tools.", "调用设备工具前，请确保目标电脑正在运行 npx remotelink 并在线。"),
    },
    {
      kind: "gemini-ready", group: tr("TRY IT", "验证连接"),
      title: tr("Try a read-only task in Gemini", "在 Gemini 中进行只读测试"),
      detail: tr("Ask Gemini to list your paired Remote Arc devices and available tools. Start with read-only operations to confirm the connector is working.",
        "让 Gemini 列出已配对的 Remote Arc 设备和可用工具，先用只读操作确认连接正常。"),
      note: tr("A connected app still needs an online, explicitly paired device for real computer access.", "连接器显示成功后，仍需要电脑在线并完成设备配对才能操作真实电脑。"),
    },
  ];
  const steps = client === "claude" ? claudeSteps : client === "gemini" ? geminiSteps : chatgptSteps;
  const count = steps.length;
  const step = steps[selected]!;
  const src = "/" + (client === "claude" ? "claude-setup/" : client === "gemini" ? "guides/gemini/" : "chatgpt-setup/") + filenames[step.kind];
  const move = (next: number) => setSelected(Math.max(0, Math.min(count - 1, next)));
  const clientName = client === "claude" ? "Claude" : client === "gemini" ? "Gemini" : "ChatGPT";

  return <div className="claudeWalkthrough">
    <div className="claudeGuideIntro">
      <div>
        <span className="eyebrow">{tr("REAL SCREENSHOT WALKTHROUGH", "真实截图操作指南")}</span>
        <h3>{tr("Set up Remote Arc in " + clientName, "在 " + clientName + " 中连接 Remote Arc")}</h3>
        <p>{tr("Step-by-step with original screenshots. Select a step above the image or open it at full size.",
          "全部使用真实界面截图。点击顶部步骤切换，点击截图放大或查看原始尺寸。")}</p>
      </div>
      <span className="claudeGuideCount" aria-live="polite">
        {String(selected + 1).padStart(2, "0")} <span>/ {String(count).padStart(2, "0")}</span>
      </span>
    </div>
    <div className="claudeGuideLayout">
      <nav className="claudeGuideNav" aria-label={tr(clientName + " installation steps", clientName + " 安装步骤")}>
        {steps.map((item, index) => <button type="button" key={item.kind}
          className={selected === index ? "claudeGuideStep active" : "claudeGuideStep"}
          aria-current={selected === index ? "step" : undefined}
          onClick={() => move(index)}>
          <span className="claudeGuideStepNum">{String(index + 1).padStart(2, "0")}</span>
          <span className="claudeGuideStepText"><small>{item.group}</small><strong>{item.title}</strong></span>
        </button>)}
      </nav>
      <div className="claudeGuideMain">
        <div className="claudeGuideText">
          <span>{tr("STEP", "步骤")} {String(selected + 1).padStart(2, "0")}</span>
          <h4>{step.title}</h4><p>{step.detail}</p>
        </div>
        <button className="claudeGuidePreview" type="button" onClick={() => setExpanded(true)}
          aria-label={tr("Enlarge the original screenshot", "放大真实截图")}>
          <GuideScreenshot client={client} src={src} alt={step.title} />
          <span className="claudeGuidePreviewCaption">↗ {tr("Click to enlarge screenshot", "点击查看大图")}</span>
        </button>
        <p className="claudeGuideHint"><span aria-hidden="true">ⓘ</span>{step.note}</p>
        <div className="claudeGuideControls">
          <button type="button" onClick={() => move(selected - 1)} disabled={selected === 0}>← {tr("Previous", "上一步")}</button>
          <span className="claudeGuideProgress" aria-hidden="true"><i style={{ width: ((selected + 1) / count) * 100 + "%" }} /></span>
          <button type="button" onClick={() => move(selected + 1)} disabled={selected === count - 1}>{tr("Next step", "下一步")} →</button>
        </div>
      </div>
    </div>
    {expanded && <div className="claudeGuideOverlay" onClick={() => setExpanded(false)}>
      <div className="claudeGuideModal" role="dialog" aria-modal="true" aria-label={step.title} onClick={(e) => e.stopPropagation()}>
        <div className="claudeGuideModalHeader">
          <strong>{String(selected + 1).padStart(2, "0")} · {step.title}</strong>
          <div className="claudeGuideModalActions">
            <a href={src} target="_blank" rel="noopener noreferrer">{tr("Open original ↗", "查看原图 ↗")}</a>
            <button type="button" onClick={() => setExpanded(false)} aria-label={tr("Close", "关闭")}>×</button>
          </div>
        </div>
        <div className="claudeGuideModalContent"><GuideScreenshot client={client} src={src} alt={step.title} /></div>
        <p>{step.note}</p>
      </div>
    </div>}
  </div>;
}
