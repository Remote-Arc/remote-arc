import { APP_WORKFLOW_EXAMPLES, translateCopy } from "./app-workflow-examples.js";
import { LOCAL_CREATIVE_EXAMPLES } from "./local-creative-examples.js";
import { AppsDirectory } from "./apps-directory.js";
import React, { useEffect, useRef, useState } from "react";
import { useI18n } from "./i18n.js";
import { ProductIcon } from "./product-icon.js";
import { InteractiveWorkDemo } from "./landing-interactive-demo.js";
import { ArcTeaser } from "./arc-future.js";
import { InstallCommands } from "./install-commands.js";
import { localizedWebsiteHref } from "./marketing-paths.js";
import "./landing-content.css";

export function HeroHeadline({mode='arc'}:{mode?:'connect'|'arc'}) {
  const {tr,locale}=useI18n();const arc=mode==='arc';
  return <TypewriterHeadline key={locale+mode} fixedLine={arc?tr('Your AI agent.','你的 AI 智能体。'):tr('Your AI.','你常用的 AI。')} accessible={arc?tr('Your AI agent. Ready around the clock.','你的 AI 智能体，随时接手工作。'):tr('Your AI. Connected in seconds.','你常用的 AI，转眼接入真实工作。')} phrases={arc?[tr('Ready around the clock.','随时接手工作。'),tr('Real work, real results.','认真做事，交付结果。'),tr('Keep work moving.','让工作持续推进。')]:[tr('Connected in seconds.','转眼接入真实工作。'),tr('Your tools. Your rules.','你的工具，你定规则。'),tr('Ready for real work.','从对话到真正动手。')]} />;
}

export function HomeHeroCopy({mode,arcAvailable,arcHref,connectHref}:{mode:'connect'|'arc';arcAvailable:boolean;arcHref:string;connectHref:string}){
 const {tr,locale}=useI18n(),arc=mode==='arc';
 return <div className="heroCopy" data-product={mode}>
  <span className="eyebrow heroProductLabel"><i/>{arc?tr('NEXT-GENERATION AI AGENT','新一代 AI AGENT'):tr('AI INFRASTRUCTURE','AI 基础设施')}</span>
  <HeroHeadline mode={mode}/>
  <p>{arc?tr('Give Arc an outcome. Your AI agent works across your apps and computers, follows up with tasks and routines, and brings back results you can inspect.','把目标交给 Arc。你的 AI 智能体调用应用与电脑，通过任务和例行工作持续跟进，交付可核查的结果。'):tr('Connect ChatGPT, Claude, Gemini or Cursor to your apps and computers in seconds. Bring leading AI into your real workflow, with access you control.','把 ChatGPT、Claude、Gemini 或 Cursor 快速接入你的应用与电脑。让顶尖 AI 融入真实工作流，访问范围由你掌控。')}</p>
  <div className="landingActions">
   <a className="primaryButton marketingPrimary" href={arc?arcHref:connectHref}>{arc?(arcAvailable?tr('Start your free trial','开始免费试用'):tr('Explore Arc','了解 Arc')):tr('Connect your AI','连接你的 AI')}<ProductIcon name="arrowUpRight" size={16}/></a>
   <a className="marketingSecondary" href={arc?localizedWebsiteHref("/arc",locale):"#how-it-works"}>{arc?tr("Meet Arc","认识 Arc"):tr("See it in action","看看如何工作")}<ProductIcon name="arrowUpRight" size={15}/></a>
  </div>
  {!arc && <InstallCommands />}
  <div className="heroSupportingInfo">
   <div className="heroProofLine"><span className="heroAccountFact"><ProductIcon name="check" size={14}/><span>{arc?tr('No model API key required','无需模型 API Key'):tr('Works with your existing AI account','沿用你现有的 AI 账户')}</span></span><span className="heroPlatforms">Windows · Mac · Linux</span></div>
   <a className="heroSecurityLink" href="/security-model"><ProductIcon name="shield" size={14}/><span>{tr('Scoped access · device policies · local Undo','限定访问范围 · 设备策略 · 本地 Undo')}</span><ProductIcon name="arrowUpRight" size={12}/></a>
   <a className="heroTaskAvailability" href={arc?'/connect-ai':'/arc'}><img src={arc?'/connect-logo.svg':'/remote-arc.svg'} width="14" height="14" alt=""/><span>{arc?tr('Already use ChatGPT or Claude? Explore Connect','已经在用 ChatGPT 或 Claude？了解 Connect'):tr('Want an AI agent? Meet Arc','想把目标直接交给 AI 智能体？认识 Arc')}</span><ProductIcon name="arrowUpRight" size={12}/></a>
  </div>
 </div>;
}

export function HomeSecurityIntro(){
 const {tr}=useI18n();
 return <section className="homeSecurityIntro" aria-label={tr('Control and security','权限与安全')}>
  <header><div><span className="eyebrow">{tr('YOUR DEVICES. YOUR RULES.','你的设备，你来设定边界。')}</span><h2>{tr('Let AI work. Keep control.','让 AI 动手，让权限有界。')}</h2></div><a href="/security-model">{tr('Explore the security model','了解安全模型')} <span aria-hidden="true">↗</span></a></header>
  <div className="homeSecurityCapabilities">
   <article><ProductIcon name="shield" size={19}/><h3>{tr('Access you define','你定义的访问范围')}</h3><p>{tr('Choose tools and trusted directories for each computer. Pause or revoke access when you need to.','为每台电脑选择工具与可信目录，并可随时暂停或撤销访问。')}</p></article>
   <article><ProductIcon name="device" size={19}/><h3>{tr('Work runs on your computers','工作在你的电脑上执行')}</h3><p>{tr('Use the projects and software already there. Devices connect outward over encrypted connections.','沿用本机已有的项目与软件，设备通过加密的出站连接接入。')}</p></article>
   <article><ProductIcon name="history" size={19}/><h3>{tr('Activity you can inspect','可追踪，也可核对')}</h3><p>{tr('Inspect tool activity and results. Restore supported file edits from Undo snapshots kept on the device.','查看工具活动与结果，通过保留在本机的 Undo 快照恢复受支持的文件修改。')}</p></article>
  </div>
 </section>;
}

function TypewriterHeadline({phrases,fixedLine,accessible}:{phrases:[string,...string[]];fixedLine:string;accessible:string}) {
  const [frame, setFrame] = useState({ index: 0, length: phrases[0].length, deleting: false });
  const [reducedMotion, setReducedMotion] = useState(() => typeof window==='undefined'||window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [visible, setVisible] = useState(() => typeof document==='undefined'||!document.hidden);
  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onMotion = () => setReducedMotion(motion.matches);
    const onVisibility = () => setVisible(!document.hidden);
    motion.addEventListener("change", onMotion);
    document.addEventListener("visibilitychange", onVisibility);
    return () => { motion.removeEventListener("change", onMotion); document.removeEventListener("visibilitychange", onVisibility); };
  }, []);
  const phrase = phrases[frame.index] ?? phrases[0];
  useEffect(() => {
    if (reducedMotion || !visible) return;
    const delay = frame.deleting ? 48 : frame.length === phrase.length ? 2600 : 100;
    const timer = window.setTimeout(() => setFrame(previous => {
      if (previous.deleting) return previous.length === 0 ? { index: (previous.index + 1) % phrases.length, length: 0, deleting: false } : { ...previous, length: previous.length - 1 };
      return previous.length >= phrase.length ? { ...previous, deleting: true } : { ...previous, length: previous.length + 1 };
    }), delay);
    return () => window.clearTimeout(timer);
  }, [frame.deleting, frame.length, phrase.length, phrases.length, reducedMotion, visible]);
  return <div className="heroHeadlineGroup">
    <h1 className="heroHeadline"><span className="heroAccessible">{accessible}</span><span aria-hidden="true"><span className="heroFixedLine">{fixedLine}</span><span className="heroTypeLine">{phrases.map(value=><span className="heroTypeMeasure" key={value}>{value}</span>)}<span className="heroTypeVisible">{reducedMotion ? phrase : phrase.slice(0, frame.length)}</span></span></span></h1>
  </div>;
}

export function ConnectionFilm() {
  const { tr, locale } = useI18n();
  const videoRef = useRef<HTMLVideoElement>(null);
  const autoplayAttempted = useRef(false);
  const [chapter, setChapter] = useState(0);
  const chapters = [
    { at: 0, title: tr("Choose your client", "选择 AI 客户端"), body: tr("Open the connection path for ChatGPT, Claude, Gemini, Cursor or another Remote MCP client.", "打开 ChatGPT、Claude、Gemini、Cursor 或其他 Remote MCP 客户端的连接入口。") },
    { at: 7, title: tr("Authorize in the client", "在客户端完成授权"), body: tr("The client opens Remote Arc OAuth. Review the scopes and authorize your account there.", "客户端会打开 Remote Arc OAuth，在那里核对 Scope 并授权账户。") },
    { at: 14, title: tr("Reuse your devices", "复用已配对设备"), body: tr("Ask in your AI chat. The same paired computers and their individual permissions apply.", "回到 AI 聊天提出请求，复用同一批已配对电脑和各自权限。") },
  ] as const;
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onMotion = () => { if (motion.matches) video.pause(); };
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry) return;
      if (!entry.isIntersecting) video.pause();
      else if (!motion.matches && !autoplayAttempted.current) {
        autoplayAttempted.current = true;
        void video.play().catch(() => undefined);
      }
    }, { threshold: .45 });
    const onVisibility = () => { if (document.hidden) video.pause(); };
    observer.observe(video);
    motion.addEventListener("change", onMotion);
    document.addEventListener("visibilitychange", onVisibility);
    return () => { observer.disconnect(); motion.removeEventListener("change", onMotion); document.removeEventListener("visibilitychange", onVisibility); };
  }, []);
  return <div className="connectionFilm">
    <div className="connectionFilmHeader"><span className="filmLiveMark" aria-hidden="true" /><strong>{tr("Inside Remote Arc", "Remote Arc 实际界面")}</strong><span>{tr("Product walkthrough", "产品流程演示")}</span></div>
    <video ref={videoRef} muted playsInline controls preload="metadata" poster="/demos/connect-workflow-poster.webp" aria-label={tr("Recorded Remote Arc interface walkthrough with example devices", "使用示例设备录制的 Remote Arc 实际界面流程演示")}
      onTimeUpdate={() => { const time = videoRef.current?.currentTime || 0; setChapter(time >= 14 ? 2 : time >= 7 ? 1 : 0); }}>
      <source src="/demos/connect-workflow.webm" type="video/webm" /><source src="/demos/connect-workflow.mp4" type="video/mp4" />
      <track kind="captions" src="/demos/connect-workflow-en.vtt" srcLang="en" label="English" default={locale === "en"} /><track kind="captions" src="/demos/connect-workflow-zh.vtt" srcLang="zh" label="中文" default={locale === "zh"} />
    </video>
    <div className="filmChapters" aria-label={tr("Video chapters", "视频章节")}>{chapters.map((item, index) => <button type="button" key={item.at} aria-pressed={chapter === index} onClick={() => { if (videoRef.current) videoRef.current.currentTime = item.at; setChapter(index); }}><span>{"0" + (index + 1)}</span>{item.title}</button>)}</div>
    <p className="filmDescription">{(chapters[chapter] ?? chapters[0]).body}</p>
    <p className="filmDisclosure">{tr("Recorded from the real product UI with example data. External client installation and OAuth are explained, not performed in this recording.", "录制自真实产品界面，使用示例数据。本片说明外部客户端安装与 OAuth 步骤，不执行真实授权。")}</p>
  </div>;
}


/** Reused by the homepage and the Remote MCP guide so example behavior stays identical. */
export function LandingInteractiveDemo() {
  const { tr } = useI18n();
  const scenarios = [
    { id: "code", label: tr("Fix a project", "修复项目"), request: tr("“On my workstation, find the failing test, fix the code and show me the verified diff.”", "“在我的工作站上找到失败测试、修复代码，给我看验证后的 diff。”"), result: tr("An actual change in your checkout, with test results you can inspect.", "真实仓库中的修改，以及可检查的测试结果。"), steps: [tr("Find the named computer and its permitted tools", "确认指定电脑与可用工具"), tr("Read the code and reproduce the failure", "读取代码、复现失败"), tr("Edit the affected files and rerun tests", "修改相关文件、重新测试"), tr("Return the diff, evidence and remaining issues", "返回 diff、证据与未解决问题")], tools: "read_file · edit_block · start_process", permission: tr("File editing + terminal", "文件编辑 + 终端"), link: "remote-development" },
    ...LOCAL_CREATIVE_EXAMPLES.map(example => ({id:example.id,label:translateCopy(example.label,tr),request:translateCopy(example.request,tr),result:translateCopy(example.result,tr),permission:translateCopy(example.permission,tr),link:example.link})),
    ...APP_WORKFLOW_EXAMPLES.map(example => ({ id: example.id, label: translateCopy(example.label, tr), request: translateCopy(example.request, tr), result: translateCopy(example.result, tr), permission: translateCopy(example.permission, tr), link: "remote-development" })),
    { id: "slides", label: tr("Create a PPT", "制作 PPT"), request: tr("“Use my existing notes and charts to make a 12-slide presentation. Save an editable .pptx and verify its slide count.”", "“把我已有的笔记和图表做成 12 页演示文稿，保存可编辑的 PPTX 并检查页数。”"), result: tr("An editable presentation saved on the selected computer, verified with a local script.", "在指定电脑上生成可编辑演示文稿，并通过本机脚本核验。"), steps: [tr("Inspect the notes, charts and installed slide library", "检查笔记、图表及已安装的 PPT 库"), tr("Generate the deck in the approved output folder", "在获授权的目录生成幻灯片"), tr("Inspect the slide count and document structure", "检查页数与文档结构")], tools: "read_file · start_process · get_file_info", permission: tr("Files + authorized terminal + installed PPTX library", "文件 + 已授权终端 + 本机 PPTX 库"), link: "presentation-deck" },
    { id: "excel", label: tr("Build an Excel report", "生成 Excel"), request: tr("“Combine my monthly CSVs into an Excel workbook with deduplicated rows, totals and a trend chart. Check the totals.”", "“把月度 CSV 合并为 Excel，去重、汇总并绘制趋势图，最后核对合计。”"), result: tr("A checked .xlsx workbook with reconciled source totals.", "带有合计核验结果的 .xlsx 工作簿。"), steps: [tr("Inspect source CSVs and their columns", "检查 CSV 和字段"), tr("Build the workbook with locally installed tools", "使用本机安装的工具生成 Excel"), tr("Reconcile totals and check the output file", "核对总数并检查输出文件")], tools: "read_file · start_process · get_file_info", permission: tr("Files + authorized terminal + installed XLSX library", "文件 + 已授权终端 + 本机 XLSX 库"), link: "spreadsheet-report" },
  ] as const;
  return <InteractiveWorkDemo scenarios={scenarios} />;
}

/** The homepage's existing AI / MCP / computer architecture illustration. */
export function LandingArchitectureDiagram() {
  const { tr } = useI18n();
  return <>
      <div className="goalContract"><header><span>{tr("YOUR CHAT → REAL TOOLS", "AI 对话 → 真实工具")}</span><strong>{tr("One chat. Real execution.", "一个对话，真正执行。")}</strong></header><dl>
        <div><dt>{tr("The brain", "负责思考")}</dt><dd>{tr("Your existing AI chat and model", "你已经在使用的 AI 聊天与模型")}</dd></div><div><dt>{tr("The bridge", "负责连接")}</dt><dd>{tr("Remote Arc · MCP, device permissions and routing", "Remote Arc · MCP、设备权限与路由")}</dd></div><div><dt>{tr("The tools", "负责执行")}</dt><dd>{tr("Your computer · files, terminal and processes", "你的电脑 · 文件、终端与进程")}</dd></div>
      </dl><div className="goalCycle"><span>{tr("Think", "思考")}</span><b>→</b><span>{tr("Use tools", "调用工具")}</span><b>→</b><span>{tr("Verify", "验证")}</span><b>↺</b></div><p>{tr("No separate model API key is required. Your AI provider's plan, message and context limits still apply; Remote Arc has separate tool-call limits. Stronger models may handle harder work, but permissions stay under your control.", "无需单独配置模型 API Key。AI 服务商的套餐、消息和上下文限制仍适用，Remote Arc 另有工具调用额度。更强的模型可以处理更难的任务，但授权始终由你掌控。")}</p></div>
  </>;
}

export function LandingContent() {
  const { tr } = useI18n();
  const [faqCategory, setFaqCategory] = useState(0);
  const faqGroups: { id: string; title: string; entries: [string, React.ReactNode][] }[] = [
    { id: "product", title: tr("Product & setup", "产品与使用"), entries: [
      [tr("What is Remote Arc? Is it a remote desktop?", "Remote Arc 是什么？是远程桌面吗？"), <>{tr("Remote Arc connects AI to your Apps and your own computers. Arc is your personal agent workspace: describe work in chat, use your connections, and save tasks or recurring routines. Connect brings the same tools to your existing compatible AI chat through MCP. Computer tools run through the local Agent, with intelligent device selection and your device permissions.", "Remote Arc 将 AI 连接到你的应用和自己的电脑。Arc 是你的个人智能体工作空间：在聊天中描述工作、使用已连接的应用与设备，并保存任务或例行工作。Connect 则通过 MCP，把同一套工具接入你已有的兼容 AI 聊天。电脑操作由本机 Agent 执行，支持智能设备选择并遵守设备权限。")} <a href="/use-cases">{tr("Explore workflows", "查看使用场景")} →</a></>],
      [tr("Do I need a paid AI plan, API key or token credits?", "需要 AI 会员、模型 API Key 或充值 Token 吗？"), <>{tr("You do not need to bring a model API key. Arc Chat is available with a free Auto trial and paid Plus / Pro plans. Hosted models follow the allowance shown for your account. Connect uses the AI chat you already have, so it needs no separate model API balance; your chat provider's plan and tool-call restrictions still apply. Remote Arc's hosted usage limits and any charges from services connected with your own accounts remain separate.", "你无需自带模型 API Key。Arc Chat 已开放，提供 Auto 免费试用与 Plus / Pro 付费套餐，平台模型使用量遵循账号展示的额度。Connect 使用你已有的 AI 聊天，无需单独充值模型 API；原 AI 服务商的套餐和工具调用限制仍然适用。Remote Arc 的托管使用额度，以及通过自有账号连接的其他服务费用，分别计算。")} <a href="/pricing">{tr("See plans", "查看套餐")} →</a></>],
      [tr("I installed the ChatGPT plugin. How do I connect my computer?", "已经安装 ChatGPT 插件，怎么连接自己的电脑？"), <>{tr("Try in chat opens a conversation; it does not install the local Agent. Run Remote Arc on your computer, approve pairing using the same Remote Arc account as the plugin, and keep the computer and Agent online. Then ask ChatGPT to list your computers. Native downloads are available if you do not have Node.js.", "Try in chat 只会打开聊天，不会安装本地 Agent。请在电脑上运行 Remote Arc，用与插件相同的 Remote Arc 账号完成配对，并保持电脑和 Agent 在线。之后让 ChatGPT 列出你的电脑；没有 Node.js 也可使用原生下载。")} <a href="/install/chatgpt">{tr("ChatGPT setup guide", "ChatGPT 安装指南")} →</a></>],
      [tr("Which computers can I connect?", "哪些电脑可以连接？"), tr("Windows, macOS and Linux computers with the local Agent installed. Native downloads and Homebrew need no Node.js; only npm/npx installation requires Node.js 20+. Pair each computer to your account and choose its permissions separately. Actual available tools depend on the installed Agent and local environment.", "安装本地 Agent 的 Windows、macOS 与 Linux 电脑均可。直接下载和 Homebrew 安装不需要 Node.js；只有 npm/npx 安装方式需要 Node.js 20+。每台电脑分别配对到账户、选择权限，实际可用工具取决于已安装 Agent 和本机环境。")],
      [tr("Can I use it from my phone or outside my home network?", "能在手机上或外网使用吗？"), tr("Yes, through an AI client that supports the connection and tool calls on that device. Your paired computer connects outbound to the hosted relay, so your chat does not need to share its LAN. The computer, agent and internet connection still need to be available.", "可以，前提是该设备上的 AI 客户端支持连接与工具调用。已配对电脑向托管 Relay 建立出站连接，所以聊天端无需和电脑处于同一局域网。目标电脑、本地 Agent 与互联网连接仍需可用。")],
      [tr("What does it cost?", "怎么收费？"), <>{tr("Connect has a monthly tool-call allowance. Arc uses Credits for model work, with a time-limited Auto trial and paid Plus / Pro plans. Current trial terms, prices and payment availability are shown on the pricing page; your account’s allowance is in Settings. Your existing AI-chat subscription and connected-service bills remain separate.", "Connect 提供月度工具调用额度。Arc 使用 Credits 计量模型工作，提供限时 Auto 试用与 Plus / Pro 付费套餐。当前试用条款、价格及付费开放状态见价格页，账号实际额度可在设置中查看。已有的 AI 聊天订阅与已连接服务的费用分别计算。" )} <a href="/pricing">{tr("See plans", "查看套餐")} →</a></>],
    ] },
    { id: "security", title: tr("Security & control", "安全与控制"), entries: [
      [tr("How much access am I giving the AI?", "AI 会获得多少电脑权限？"), <>{tr("You choose tools per device, while OAuth scopes constrain the client. Ordinary non-sensitive reads can remain broad; persistent file changes stay inside Trusted Write Locations. An out-of-scope write pauses for approval. Sensitive paths remain separately protected. Terminal is a separate high-risk capability and is not contained by an OS sandbox.", "你为每台设备选择工具，OAuth Scope 同时限制客户端。普通非敏感读取可以保持灵活；持续文件修改只发生在可信写入区域内，越界写入会暂停等待审批。敏感路径继续独立保护；终端是单独的高风险能力，并没有 OS 沙箱隔离。" )} <a href="/security-model">{tr("Read the security model", "了解安全模型")} →</a></>],
      [tr("Do I have to open a port or share my computer password?", "需要开放端口或提供电脑密码吗？"), tr("No inbound Remote Arc port or OS login password is needed. The agent connects outbound to the relay over encrypted transport and uses a device credential obtained through pairing. The AI client authorizes through OAuth. These credentials still need protection and can be revoked.", "不需要开放 Remote Arc 入站端口或提供 OS 登录密码。Agent 通过加密传输向 Relay 建立出站连接，使用配对获得的设备凭证；AI 客户端通过 OAuth 授权。这些凭证仍需保护，也可以撤销。")],
      [tr("Do my files stay private? What leaves the computer?", "文件是否私密？哪些内容会离开电脑？"), <>{tr("Requested file content, tool arguments and command output pass through the relay to your AI provider. Durable tasks also store their contract, bounded observations, memory and evidence. Undo snapshots stay local. HTTPS/WSS protects transport; this is not zero-knowledge end-to-end encryption.", "请求的文件内容、工具参数与命令输出会经过 Relay 返回 AI 服务。持久任务还保存合同、受限观察、工作记忆与证据，Undo 快照留在本机。HTTPS/WSS 保护传输，但不是 zero-knowledge 端到端加密。" )} <a href="/privacy">{tr("Read data handling", "查看数据处理说明")} →</a></>],
      [tr("Is Pause AI MCP the same as pausing a device?", "安全页的「暂停 AI MCP」等于暂停整个设备吗？"), <>{tr("No. Pause AI MCP is account-wide: it blocks authenticated calls from connected AI chat clients, but does not stop your paired computers or independently running local tasks. Device Pause is different: on a supported native Agent it blocks computer-tool execution while keeping a small authenticated wake channel for Resume. Disconnect completely stops both channels and requires starting the Agent locally again.", "不是。「暂停 AI MCP」是账户级开关：它会拦截 AI 聊天客户端的 MCP 调用，但不会停止已经配对的电脑，也不会自动终止本机独立任务。设备级「暂停 Agent」则禁止电脑工具执行，仅保留恢复所需的最小授权通道；「完全断开」会连唤醒通道也关闭，之后必须在电脑本机重新启动。")} <a href="/overview">{tr("Manage devices", "管理设备")} →</a></>],
      [tr("Are the credentials for AI clients or for my computers?", "安全页里的凭证属于 AI 客户端还是电脑？"), tr("Both, but they are separate. Each connected AI chat client receives its own revocable OAuth grant. Each paired computer stores a separate device credential locally; Remote Arc stores its hash in the hosted database. Revoking one AI client's grant does not unpair your machines.", "两者都有，但完全分离：每个已授权 AI 聊天客户端有独立、可撤销的 OAuth Grant；每台已配对电脑则在本机保存单独的 Device Credential，云端只保存其哈希。撤销某个 AI 客户端，不会让所有电脑重新配对。")],
      [tr("Can I revoke access or stop ongoing work?", "能撤销访问或停止正在进行的工作吗？"), tr("Use Dashboard to revoke a device or AI-client grant, disable device tools, or ask your connected AI to pause/cancel saved tasks. Account MCP pause blocks authenticated MCP calls. Removing access does not undo earlier effects or automatically terminate every process already started.", "可在 Dashboard 撤销设备或 AI 客户端授权、关闭设备工具，或让已连接的 AI 暂停/取消已保存 Task。账户 MCP Pause 会阻止已认证 MCP 调用。撤销访问不会撤回此前副作用，也不等于自动终止所有已启动进程。")],
      [tr("Can I undo everything the AI changes?", "AI 的所有修改都能撤销吗？"), tr("Local Undo can restore supported file-tool edits when enabled, using snapshots on that device. It does not roll back shell commands, Git operations, deleted files or external service actions. Review the requested work and its permissions before execution.", "开启 Local Undo 后，可用设备上的快照恢复受支持的文件工具修改。它不回滚 Shell 命令、Git 操作、文件删除或外部服务动作。执行前应核对请求的工作和权限。")],
    ] },
    { id: "tasks", title: tr("Tasks & availability", "任务与在线状态"), entries: [
      [tr("Does every request become a Task?", "每次请求都是一个 Task 吗？"), tr("No. File reads and short commands are ordinary tool calls. A Task saves work that should continue, wait for a condition or run later. Your AI can create it under your authorization; Ask your connected AI to inspect and manage it.", "不是。读取文件和短命令属于普通工具调用。Task 保存需要持续推进、等待条件或稍后执行的工作。AI 可以在授权范围内创建，可让已连接的 AI 按需查看与管理。")],
      [tr("Can the AI keep working while I sleep?", "我睡觉后 AI 能继续工作吗？"), <>{tr("When it launches, Arc is designed to continue saved tasks and run recurring routines without keeping your browser open, while model access, usage budget and required connections remain available. Work that uses your computer needs that computer online. Connect can track long commands and saved schedules; further AI reasoning in an external chat depends on that AI client's support.", "Arc 上线后将支持在浏览器关闭后继续已保存的任务、执行例行工作，前提是模型访问、使用额度与所需连接可用。使用电脑的操作需要目标电脑保持在线。Connect 能跟踪长命令和已保存的调度；外部聊天中的后续 AI 推理取决于该 AI 客户端的支持。" )} <a href="/docs/long-running-work">{tr("See requirements", "查看运行条件")} →</a></>],
      [tr("What if the computer sleeps, disconnects or restarts?", "电脑睡眠、断网或重启后会怎样？"), tr("New local work waits while the device is unreachable. Durable progress remains, and recovery follows the saved policy after the OS session and agent reconnect. An old process handle is not restored. Optional task keep-awake can help an active computer stay awake; it cannot wake an offline device or start a powered-off computer.", "设备不可达时，新的本机操作等待。持久进度仍在，OS 用户会话与 Agent 重连后按保存策略恢复，不恢复旧进程句柄。可选任务保持唤醒能帮助运行中的电脑不休眠，但不能唤醒离线设备或启动已关机电脑。")],
    ] },
  ];
  const currentFaq = faqGroups[faqCategory] ?? faqGroups[0]!;

  return <div className="landingContent">
    <section className="landingWork sectionBlock" id="how-it-works">
      <header className="modernSectionIntro"><span className="eyebrow">{tr("JUST CHAT. GET THINGS DONE.", "就在 AI 聊天里，真正做成事")}</span><h2>{tr("Don’t just chat. Watch AI do the work.", "别只和 AI 聊天，让它真正动手。")}</h2><p>{tr("Use the AI chat you already have. Tell it what to do, and Remote Arc connects it to your approved tools and computers. Pick a task to see the conversation, tool calls and results side by side.", "直接在你平时用的 AI 聊天里说出需求，Remote Arc 连接你已授权的工具与电脑。选个案例，看看对话、工具调用与结果如何一步步衔接。")}</p><div className="chatSellingPoints"><span>{tr("No extra model API key", "无需额外模型 API Key")}</span><span>{tr("No API token top-ups", "不用充值 API Token")}</span><span>{tr("Compatible free chat plans work too", "兼容的免费聊天套餐也能用")}</span></div></header>
      <LandingInteractiveDemo />
    </section>

    <ArcTeaser />

    <AppsDirectory />

    <section className="landingUnexpected sectionBlock" id="unexpected-workflows">
      <header className="modernSectionIntro">
        <span className="eyebrow">{tr("AI CHAT → REAL WORKFLOWS", "连接 MCP，让聊天成为行动")}</span>
        <h2>{tr("All this, from a simple AI chat.", "原来在 AI 聊天里，这些也能做。")}</h2>
        <p>{tr("No separate agent workspace or model API integration. Just ask in a compatible AI chat, let Remote Arc use the software and files already on your computer, and review the actual results. You decide which tools it can use.", "不用另外搭建 Agent 工作区，也不用购买模型 API。只要在支持 MCP 的 AI 聊天里说出需求，Remote Arc 就能调用你电脑上已有的软件和文件。执行什么、能用哪些工具由你授权，结果也能检查。")}</p>
      </header>
      <div className="unexpectedGrid">
        <a className="unexpectedCard" href="/use-cases/presentation-deck"><span className="unexpectedSymbol" aria-hidden="true">▣</span><span className="eyebrow">{tr("DOCUMENTS → SLIDES", "资料 → PPT")}</span><h3>{tr("A folder of notes becomes an editable slide deck", "一文件夹资料，变成可编辑 PPT")}</h3><p>{tr("Generate a deck from local outlines and charts; validate the slides with your installed document tooling.", "用本地大纲与图表生成演示文稿，再利用已有文档工具检查页数。")}</p><span className="unexpectedLink">{tr("Explore slides", "了解 PPT 场景")} ↗</span></a>
        <a className="unexpectedCard" href="/use-cases/spreadsheet-report"><span className="unexpectedSymbol" aria-hidden="true">▦</span><span className="eyebrow">{tr("HUNDREDS OF FILES → EXCEL", "数百份文件 → EXCEL")}</span><h3>{tr("Turn scattered records into a checked workbook", "把零散数据汇总成可核验的 Excel")}</h3><p>{tr("Deduplicate local CSVs, build formulas and charts, and reconcile totals before presenting the result.", "批量整理本机 CSV、去重、创建公式与图表，并核对合计。")}</p><span className="unexpectedLink">{tr("Explore spreadsheets", "了解表格场景")} ↗</span></a>
        <a className="unexpectedCard" href="/use-cases/desktop-automation"><span className="unexpectedSymbol" aria-hidden="true">⌖</span><span className="eyebrow">{tr("LOCAL GUI SCRIPTS", "本机桌面脚本")}</span><h3>{tr("Automate the software that has no API", "没 API 的桌面软件，也能试着自动化")}</h3><p>{tr("Run a reviewed mouse-and-keyboard script through an authorized terminal, if the OS and desktop tools support it. No native mouse MCP yet.", "在系统支持且已授权的情况下，通过终端执行鼠标键盘脚本。目前尚无原生鼠标 MCP 工具。")}</p><span className="unexpectedLink">{tr("See the boundaries", "查看使用条件")} ↗</span></a>
        <a className="unexpectedCard" href="/use-cases/cross-device-handoff"><span className="unexpectedSymbol" aria-hidden="true">⇄</span><span className="eyebrow">{tr("WINDOWS + MAC", "WINDOWS + MAC")}</span><h3>{tr("One chat, two computers, independently verified", "一次对话，操作两台电脑分别验收")}</h3><p>{tr("Diagnose a Windows build and verify the same change on a connected Mac, with each device's own permissions.", "检查 Windows 上的构建，再到已连接的 Mac 上独立验证，权限各自管理。")}</p><span className="unexpectedLink">{tr("Explore multi-device work", "了解多设备场景")} ↗</span></a>
      </div>
      <p className="unexpectedDisclosure">{tr("Presentation and spreadsheet work uses file and terminal tools with compatible software installed on your computer. Check that the required software is available and review the generated files.", "演示文稿和表格工作通过文件、终端工具与电脑上已安装的兼容软件完成。开始前请确认所需软件可用，并检查生成的文件。")}</p>
    </section>

    <div className="sectionResourceLinks"><a href="/remote-mcp">{tr("New to Remote MCP? Read the practical guide", "初次接触 Remote MCP？查看实用指南")} →</a><a href="/docs/mcp">{tr("MCP technical reference", "MCP 技术参考")} →</a></div>

    <section className="landingSetup sectionBlock" id="connect-once">
      <header className="modernSectionIntro"><span className="eyebrow">{tr("BEYOND THE CONNECTION", "连接，只是开始")}</span><h2>{tr("More than an MCP server.", "不止是 MCP 服务器。")}<br /><span>{tr("Controlled access to your computers, with durable tasks.", "再加上可持久保存的确定性任务。")}</span></h2><p>{tr("MCP connects your AI to tools. Remote Arc brings those tools to your own computers, persists approved deterministic tasks, and gives you control over the access behind every action.", "MCP 让 AI 连接工具。Remote Arc 把工具带到你自己的电脑上，持久保存已授权的确定性任务，并让你掌控每次操作背后的权限。")}</p></header>
      <div className="platformCapabilities">
        <article><span className="platformCapabilityIndex">01 · {tr("CONNECT", "连接")}</span><h3>{tr("Your real working environment", "进入真实工作环境")}</h3><p>{tr("Reach your paired Windows, macOS and Linux computers from a compatible AI client. Work with the files, projects and tools already there.", "从兼容的 AI 客户端访问已配对的 Windows、macOS 和 Linux，使用已有文件、项目与工具。")}</p><div className="platformCapabilityTags"><span>{tr("Multiple devices", "多设备")}</span><span>{tr("OAuth access", "OAuth 授权")}</span></div><a href="/connect-ai">{tr("Connect your AI", "连接你的 AI")} →</a></article>
        <article><span className="platformCapabilityIndex">02 · {tr("EXECUTE", "执行")}</span><h3>{tr("Saved work that keeps moving", "保存任务，持续推进")}</h3><p>{tr("Track long commands and run approved work on timers or events. Task state persists across chat disconnects; fresh AI judgment is deliberately outside this production guarantee.", "跟踪长命令，并按时间或事件执行已授权工作。任务状态可跨聊天断开持久保存；新的 AI 判断不属于当前生产能力保证。")}</p><div className="platformCapabilityTags"><span>{tr("Tasks", "任务")}</span><span>{tr("Progress & results", "进度与结果")}</span></div><a href="/docs/long-running-work">{tr("Explore task execution", "了解任务执行")} →</a></article>
        <article><span className="platformCapabilityIndex">03 · {tr("CONTROL", "掌控")}</span><h3>{tr("Authority stays with you", "权限始终由你掌控")}</h3><p>{tr("Choose tools and trusted write locations per device. Review write approvals, inspect activity, restore supported file edits and revoke access.", "按设备选择工具和可信写入区域，审批写入请求、查看活动、恢复受支持的文件修改，并随时撤销访问。")}</p><div className="platformCapabilityTags"><span>{tr("Device policies", "设备策略")}</span><span>Local Undo</span></div><a href="/security-model">{tr("Understand the boundaries", "了解执行边界")} →</a></article>
      </div>
    </section>

    <section className="landingControl sectionBlock" id="your-controls">
      <header className="modernSectionIntro"><span className="eyebrow">{tr("BUILT FOR TRUST · CONTROL BY DESIGN", "为安全而设计 · 每一步由你决定")}</span><h2>{tr("Real computer access. Real boundaries.", "让 AI 真正动手，也让安全与隐私有边界。")}</h2><p>{tr("Every action an AI takes passes the same five checks before it touches your computer. Afterwards you can still undo it, review it or cut access.", "AI 的每一次操作，在碰到你的电脑之前都要通过同样的五道检查；执行之后，你仍然可以撤销、查看记录或切断访问。")}</p></header>
      <ol className="trustChain">
        {[
          [tr("Which AI", "哪个 AI"), tr("Each AI client gets its own OAuth grant and scopes. Revoke one without touching the others.", "每个 AI 客户端有独立的 OAuth 授权与 Scope，撤销一个不影响其他。"), tr("OAuth grant", "OAuth 授权")],
          [tr("Which computer", "哪台电脑"), tr("Each computer has its own credential. A revoked device is refused on the very next call.", "每台电脑有独立凭证；设备一经撤销，下一次调用就会被拒绝。"), tr("Device credential", "设备凭证")],
          [tr("Which tools", "哪些工具"), tr("Tools are switched on per device. New devices start read-only, and the terminal is a separate opt-in.", "工具按设备单独开启。新设备默认只读，终端需要另外开启。"), "Safe · Developer · Full"],
          [tr("Which folders", "哪些目录"), tr("Writes stay inside folders you trust; anything else asks first. .ssh, .aws, browser profiles and .env stay protected.", "写入只发生在你信任的目录内，其他位置先征求同意；.ssh、.aws、浏览器 Profile 和 .env 始终受保护。"), tr("Trusted Write Locations", "可信写入区域")],
          [tr("What gets deleted", "会删到哪里"), tr("Safety Guard works out where every terminal delete would land and stops drives, home folders, system and credential paths.", "Safety Guard 算出每个终端删除的实际落点，拦下会删到盘符、主目录、系统和凭证路径的命令。"), "Safety Guard 2.0"],
        ].map(([title, text, chip], index) => <li key={title}><span>{String(index + 1).padStart(2, "0")}</span><h3>{title}</h3><p>{text}</p><code>{chip}</code></li>)}
      </ol>
      <div className="trustAfter"><strong>{tr("After it runs", "执行之后")}</strong><span>{tr("Local Undo for supported file edits", "受支持文件修改的本机 Undo")}</span><span>{tr("Activity and approval history", "活动与审批记录")}</span><span>{tr("Pause, or fully disconnect", "暂停，或彻底断开")}</span></div>
      <div className="safetyExample">
        <div className="safetyStory"><span className="eyebrow">SAFETY GUARD 2.0</span><h3>{tr("Room to work. Boundaries you set.", "让 AI 放手工作，边界由你设定。")}</h3><p>{tr("AI can clear build caches, temp files and old downloads for you. Safety Guard follows nested quoting, variables, wildcards and pipelines to find the real target, so a slip that would wipe a drive is stopped before anything is deleted.", "AI 可以帮你清理构建缓存、临时文件和旧下载。Safety Guard 会穿过多层引号、变量、通配符和管道找到真正的删除目标，一个可能清空整个磁盘的失误会在删除任何文件之前被拦下。")}</p><a className="safetyLearnLink" href="/security-model">{tr("See how access is controlled", "了解权限如何控制")} →</a></div>
        <figure className="safetyTerminal"><figcaption><span aria-hidden="true">● ● ●</span><span>{tr("Illustration · checking where a delete lands", "示例 · 检查删除实际落点")}</span></figcaption><div className="safetyPolicyBody">
          <div className="safetyPolicyRequest blocked"><div><code>start_process</code><span>{tr("BLOCKED", "已拦截")}</span></div><code className="safetyPath">{String.raw`cmd /c rd /s /q \ "\\?\D:\Videos\cache"`}</code><pre>{String.raw`Blocked by Remote Arc Safety Guard: deleting a drive, share or filesystem root (D:\).`}</pre><p>{tr("A quoting slip turned the first target into \\, the root of drive D:. Nothing was deleted; the AI is asked to retry with one literal path.", "引号处理失误让第一个目标变成了 \\，也就是 D 盘根目录。没有删除任何文件；AI 会被要求改用一个明确的绝对路径重试。")}</p></div>
          <div className="safetyPolicyRequest allowed"><div><code>start_process</code><span>{tr("ALLOWED", "允许执行")}</span></div><code className="safetyPath">{String.raw`rd /s /q "D:\Videos\cache"`}</code><p>{tr("The same cleanup with a literal path resolves to the cache folder only, so it runs.", "同样的清理改用明确路径后只落在缓存目录内，于是正常执行。")}</p></div>
        </div></figure>
      </div>
      <p className="securityPrivacyNote">{tr("Your computer connects outward over encrypted connections; there is no desktop stream, and Undo snapshots stay on the device. Content you ask the AI to read passes through the Relay to your AI provider. These checks are defense in depth, not an OS sandbox: allowed commands run as your OS user.", "电脑通过加密连接主动向外连接；没有桌面串流，Undo 快照留在本机。你让 AI 读取的内容会经 Relay 传给 AI 服务商。这些检查是纵深防御，不是操作系统沙箱：被允许的命令以你的 OS 用户身份运行。")}</p>
      <div className="sectionResourceLinks"><a href="/security-model">{tr("Security model", "安全模型")} →</a><a href="/privacy">{tr("Privacy & data handling", "隐私与数据处理")} →</a><a href="/docs#docs-sandbox">{tr("Execution boundaries", "执行边界")} →</a></div>
    </section>

    <section className="landingQuestions sectionBlock">
      <header className="modernSectionIntro"><span className="eyebrow">{tr("BEFORE YOU CONNECT", "连接前了解")}</span><h2>{tr("The questions that matter.", "真正需要了解的问题。")}</h2><p>{tr("What it does, what you authorize and what happens to your data.", "能做什么、授权了什么，以及数据如何处理。")}</p></header>
      <div className="faqContent">
        <div className="faqCategories" role="tablist" aria-label={tr("FAQ topics", "常见问题分类")}>{faqGroups.map((group, index) => <button key={group.id} type="button" role="tab" id={"faq-tab-" + group.id} aria-controls={"faq-panel-" + group.id} aria-selected={faqCategory === index} tabIndex={faqCategory === index ? 0 : -1} onClick={() => setFaqCategory(index)} onKeyDown={event => {
          const next = event.key === "ArrowRight" ? (index + 1) % faqGroups.length : event.key === "ArrowLeft" ? (index + faqGroups.length - 1) % faqGroups.length : event.key === "Home" ? 0 : event.key === "End" ? faqGroups.length - 1 : null;
          if (next === null) return; event.preventDefault(); setFaqCategory(next); document.getElementById("faq-tab-" + faqGroups[next]!.id)?.focus();
        }}>{group.title}</button>)}</div>
        <div className="modernFaq" role="tabpanel" id={"faq-panel-" + currentFaq.id} aria-labelledby={"faq-tab-" + currentFaq.id}>{currentFaq.entries.map(([question, answer]) => <details key={question}><summary>{question}<span aria-hidden="true"><ProductIcon name="add" size={17}/></span></summary><p>{answer}</p></details>)}</div>
      </div>
    </section>


  </div>;
}
