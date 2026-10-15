import { useI18n } from "./i18n.js";
import { localizedWebsiteHref } from "./marketing-paths.js";
import "./arc-future.css";

// A real mailto contact action: we do not pretend that a backend waitlist exists.
const earlyAccessHref = "mailto:support@remotearc.app?subject=" +
  encodeURIComponent("Arc Early Access") +
  "&body=" + encodeURIComponent("I'd like early access to Arc. My workflow is: ");

export function ArcTeaser() {
  const { tr, locale } = useI18n();
  return <section className="arcTeaser" aria-labelledby="arc-teaser-title">
    <div className="arcTeaserCopy">
      <div className="arcEyebrow"><span className="arcSymbol" aria-hidden="true">a<span>↗</span></span>{tr("MEET ARC", "认识 ARC")}<span className="arcBadge">{tr("Coming soon", "即将推出")}</span></div>
      <h2 id="arc-teaser-title">{tr("Your AI, ready to work.", "你的 AI，真正开始工作。")}</h2>
      <p>{tr("We're building Arc, your AI teammate inside Remote Arc. Chat directly, connect your apps and delegate recurring work — with permissions you control.", "我们正在打造 Remote Arc 内置的 AI 队友：直接对话、连接应用、委派重复工作，同时由你掌控每一项权限。")}</p>
      <div className="arcTeaserChips"><span>✧ Arc Chat</span><span>⊞ {tr("Connected Apps", "应用连接")}</span><span>↻ Routines</span></div>
      <div className="arcActions"><a className="primaryButton" href={localizedWebsiteHref("/arc", locale)}>{tr("Meet Arc", "了解 Arc")} ↗</a><a className="arcTextLink" href={localizedWebsiteHref("/roadmap", locale)}>{tr("Explore roadmap", "查看路线图")} →</a></div>
      <small>{tr("A preview of what's next. Remote Arc Connect is available today.", "这里预告未来功能，Remote Arc Connect 目前已可使用。")}</small>
    </div>
    <div className="arcOrb" aria-hidden="true"><div className="arcOrbInner">arc<span>.</span></div><div className="arcOrbCaption">THINK · CONNECT · ACT</div></div>
  </section>;
}

const pillars = [
  { num:"01",title:"Arc Chat",zhTitle:"Arc Chat 对话",icon:"✧",text:"A first-party conversation with Auto model selection and clear spending limits.",zhText:"直接与内置 AI 对话，支持 Auto 模型选择和明确的费用上限。" },
  { num:"02",title:"Connected Apps",zhTitle:"Connected Apps 应用连接",icon:"⊞",text:"Bring authorized cloud apps and your own computers into one workflow.",zhText:"把已授权的云端应用与自己的电脑接入同一个工作流程。" },
  { num:"03",title:"Routines",zhTitle:"Routines 自动任务",icon:"↻",text:"Delegate repeatable jobs with reviewable actions, approvals and results.",zhText:"交付可重复的任务，查看执行、审批与最终结果。" },
];

export function ArcComingSoonPageContent() {
  const { tr,locale } = useI18n();
  return <div className="arcFuturePage">
    <section className="arcFutureHero">
      <div className="arcEyebrow"><span className="arcSymbol" aria-hidden="true">a<span>↗</span></span>{tr("A NEW WAY TO WORK", "一种全新的工作方式")}<span className="arcBadge">{tr("In development", "开发中")}</span></div>
      <h1>{tr("Meet Arc. Your AI teammate.", "认识 Arc，你的 AI 工作队友。")}</h1>
      <p>{tr("Remote Arc already lets the AI you use work on your own devices. We're building Arc to give you a direct AI chat, connected apps and routines that can continue approved work beyond a conversation.", "Remote Arc 已经能让你熟悉的 AI 在自己的设备上执行任务。现在，我们正在打造 Arc：直接对话、连接常用应用，并让经过授权的任务持续推进。")}</p>
      <div className="arcActions"><a className="primaryButton" href={earlyAccessHref}>{tr("Request early access", "申请抢先体验")} ↗</a><a className="arcOutlineLink" href={localizedWebsiteHref("/roadmap",locale)}>{tr("View roadmap", "查看路线图")} →</a></div>
      <small>{tr("Early access opens an email to our team. Arc's hosted chat and model credits are not yet publicly available.", "点击申请会打开邮件客户端联系我们。Arc 托管聊天与模型额度尚未公开开放。")}</small>
    </section>
    <section className="arcPillars" aria-label={tr("Planned features", "规划中的功能")}>
      {pillars.map(item=><article key={item.num}><div className="arcPillarTop"><span>{item.num}</span><span className="arcBadge">{tr("Planned", "规划中")}</span></div><div className="arcPillarIcon" aria-hidden="true">{item.icon}</div><h2>{locale==="zh"?item.zhTitle:item.title}</h2><p>{locale==="zh"?item.zhText:item.text}</p></article>)}
    </section>
    <section className="arcModes"><div className="arcEyebrow">{tr("ONE PLATFORM · TWO WAYS TO WORK", "一个平台，两种工作方式")}</div><h2>{tr("Bring your AI. Or work with Arc.", "带上你的 AI，或者直接交给 Arc。")}</h2>
      <div className="arcModeGrid">
        <article><span className="arcBadge arcBadgeLive">{tr("Available now", "现已可用")}</span><h3>Remote Arc Connect</h3><p>{tr("Keep ChatGPT, Claude or another compatible client. Your model thinks, Remote Arc routes approved tools to your devices. No extra Remote Arc model API key.", "继续使用 ChatGPT、Claude 等兼容客户端。原有模型负责思考，Remote Arc 连接已授权的设备工具，无须额外配置 Remote Arc 模型 API Key。")}</p><a href="/connect-ai">{tr("Connect your AI", "连接现有 AI")} →</a></article>
        <article><span className="arcBadge">{tr("Coming soon", "即将推出")}</span><h3>Arc Hosted</h3><p>{tr("Chat in Remote Arc, use apps and delegate work. Hosted model usage will have separate credits, limits and pricing; Connect's free MCP allowance will not cover it.", "在 Remote Arc 内直接对话、使用应用并委派工作。托管模型将有独立额度和价格，不包含在 Connect 的免费 MCP 调用额度中。")}</p><a href={earlyAccessHref}>{tr("Request early access", "申请体验")} →</a></article>
      </div>
    </section>
    <section className="arcFutureEnd"><h2>{tr("Permissioned by design.", "从设计开始，就尊重你的权限。")}</h2><p>{tr("We're building incrementally and will never present planned functionality as already live. Explore our transparent roadmap to follow what's next.", "我们会分阶段交付，绝不把规划中的功能包装成已上线。欢迎查看公开路线图，了解每个阶段的进展。")}</p><a className="arcTextLink" href={localizedWebsiteHref("/roadmap",locale)}>{tr("See the roadmap", "查看路线图")} ↗</a></section>
  </div>;
}

const roadmap = [
  {no:"00", enTitle:"Connect & Foundation",zhTitle:"连接与基础设施",enStatus:"Available / hardening",zhStatus:"已可用 / 持续完善",state:"live",en:"Remote MCP, permissioned devices and durable task foundations are available. Organization and controlled release foundations are being prepared.",zh:"MCP 连接、设备权限和持久任务基础已经可用，组织模型与发布保护正在完善。"},
  {no:"01",enTitle:"Arc Chat & Auto",zhTitle:"Arc Chat 与 Auto",enStatus:"In development",zhStatus:"开发中",state:"active",en:"Hosted conversation, tested Auto model routing, audit and hard inference-cost budgets.",zh:"内置对话、经过测试的 Auto 模型路由、审计及严格的模型费用上限。"},
  {no:"02",enTitle:"Billing & Early Access",zhTitle:"收费与早期体验",enStatus:"Planned · public-beta gate",zhStatus:"规划中 · 公开测试前完成",state:"future",en:"Checkout, subscriptions, usage accounting and safe free-trial budgets before public hosted-AI access.",zh:"在公开托管 AI 前完成付费、订阅、用量计费和安全的免费试用预算。"},
  {no:"03",enTitle:"Apps & Routines",zhTitle:"应用连接与 Routines",enStatus:"Planned",zhStatus:"规划中",state:"future",en:"A small reliable app catalog, reusable workflows and approved recurring tasks with visible evidence.",zh:"少量稳定的应用集成、可复用工作流程，以及有审批和执行证据的定期任务。"},
  {no:"04",enTitle:"Teach Arc & Ecosystem",zhTitle:"Teach Arc 与集成生态",enStatus:"Exploring",zhStatus:"探索中",state:"future",en:"Reusable skills and learning approved workflows from demonstrations, supported by a wider connector ecosystem.",zh:"通过受控演示学习工作流程并形成可复用技能，再逐步拓展集成生态。"}
];

export function ArcRoadmapPageContent() {
  const {tr,locale}=useI18n();
  return <main className="arcFuturePage arcRoadmapPage">
    <header className="arcRoadmapHero"><div className="arcEyebrow">{tr("BUILDING REMOTE ARC", "正在建设 REMOTE ARC")}</div><h1>{tr("Our roadmap. Without the hype.", "产品路线图，不画大饼。")}</h1><p>{tr("What works, what we're building and what we hope to explore next. Priorities can change as we learn from real users and verify security, reliability and model economics.", "诚实记录哪些已经可用、哪些正在开发，以及未来想探索的方向。具体优先级会根据用户反馈、安全性、可靠性和模型成本调整。")}</p><a className="arcTextLink" href={localizedWebsiteHref("/arc",locale)}>{tr("Meet Arc", "了解 Arc")} ↗</a></header>
    <section className="arcRoadmapRows" aria-label={tr("Development stages", "开发阶段")}>{roadmap.map(item=><article className="arcRoadmapRow" key={item.no}><span className="arcRoadmapNo">{item.no}</span><div><span className="arcEyebrow">{locale==="zh"?item.zhStatus:item.enStatus}</span><h2>{locale==="zh"?item.zhTitle:item.enTitle}</h2><p>{locale==="zh"?item.zh:item.en}</p></div><span className={"arcProgressDot arcProgressDot--"+item.state} aria-hidden="true"/></article>)}</section>
    <p className="arcRoadmapCaveat">{tr("This roadmap is directional, not a release-date promise. Current Remote Arc Connect does not include hosted model credits.", "路线图只代表开发方向，并非上线时间承诺。当前 Remote Arc Connect 不包含托管模型额度。")}</p>
    <div className="arcActions"><a className="primaryButton" href={earlyAccessHref}>{tr("Share your workflow / request access", "反馈场景 / 申请体验")} ↗</a><a className="arcTextLink" href="/connect-ai">{tr("Use Remote Arc today", "现在开始使用 Remote Arc")} →</a></div>
  </main>;
}
