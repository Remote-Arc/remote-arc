import { useI18n } from "./i18n.js";
import { localizedWebsiteHref } from "./marketing-paths.js";
import "./arc-future.css";

// Public previews are intentionally non-interactive. Arc Hosted and the waitlist
// backend do not exist yet, so this page never pretends to run a model.
const earlyAccessHref = "mailto:support@remotearc.app?subject=" +
  encodeURIComponent("Arc early access") +
  "&body=" + encodeURIComponent("The workflow I'd like Arc to handle is: ");

function ArcMark({ subtle = false }: { subtle?: boolean }) {
  return <span className={"arcV3Mark" + (subtle ? " arcV3Mark--small" : "")} aria-hidden="true"><span className="arcV3MarkCore" /><span className="arcV3MarkSlash" /></span>;
}

function ArcStatus({ children }: { children: React.ReactNode }) {
  return <span className="arcV3Status"><i aria-hidden="true" />{children}</span>;
}

function ArcExecutionScene() {
  const {tr} = useI18n();
  return <div className="arcV3Stage" aria-label={tr("Concept illustration: a request flows through Arc to connected tools and a reviewable result. This is not a live interface.", "Arc 产品概念图：请求通过 Arc 连接工具并生成待审核结果，并非已上线功能。")}>
    <div className="arcV3StageBackdrop" aria-hidden="true" />
    <div className="arcV3StageLabel"><i />{tr("PRODUCT CONCEPT / NOT LIVE", "产品概念 / 尚未上线")}</div>
    <div className="arcV3Prompt">
      <span className="arcV3PromptSymbol">↗</span>
      <div className="arcV3PromptText"><span>{tr("A request for Arc", "给 Arc 的任务")}</span><strong>{tr("Prepare my weekly project update", "整理本周项目进展")}</strong></div>
      <span className="arcV3PromptSend" aria-hidden="true">↑</span>
    </div>
    <div className="arcV3Energy" aria-hidden="true"><span /></div>
    <div className="arcV3Nexus">
      <div className="arcV3NexusAura" aria-hidden="true" />
      <div className="arcV3NexusCore"><ArcMark /></div>
      <div className="arcV3NexusLabel"><strong>arc</strong><small>{tr("Plans · Routes · Verifies", "规划 · 调度 · 验证")}</small></div>
    </div>
    <div className="arcV3Branch" aria-hidden="true"><span className="arcV3BranchStem" /><span className="arcV3BranchBar" /></div>
    <div className="arcV3Nodes">
      <div className="arcV3Node"><span className="arcV3NodeGlyph">⌘</span><div><strong>{tr("Apps", "云应用")}</strong><small>GitHub · Notion</small></div></div>
      <div className="arcV3Node arcV3Node--main"><span className="arcV3NodeGlyph">▣</span><div><strong>{tr("Devices", "个人设备")}</strong><small>Mac · Windows</small></div></div>
      <div className="arcV3Node"><span className="arcV3NodeGlyph">◷</span><div><strong>Routines</strong><small>{tr("Scheduled work", "定期任务")}</small></div></div>
    </div>
    <div className="arcV3Merge" aria-hidden="true" />
    <div className="arcV3Outcome"><span className="arcV3OutcomeTick">✓</span><div><strong>{tr("Weekly update, ready to review", "项目进展已整理，等待审核")}</strong><small>{tr("Verified output · Your approval before sharing", "可查看结果 · 分享前由你审批")}</small></div><span className="arcV3OutcomeArrow">↗</span></div>
  </div>;
}

export function ArcTeaser() {
  const {tr,locale}=useI18n();
  return <section className="arcV3Teaser" aria-labelledby="arcV3TeaserHeading">
    <div className="arcV3TeaserAmbient" aria-hidden="true" />
    <div className="arcV3TeaserLine">{tr("THE NEXT CHAPTER OF REMOTE ARC", "REMOTE ARC 的下一篇章")} <span>·</span> {tr("IN DEVELOPMENT", "开发中")}</div>
    <ArcMark subtle />
    <h2 id="arcV3TeaserHeading">{tr("Meet Arc. Work beyond the conversation.", "认识 Arc。让工作不止于对话。")}</h2>
    <p>{tr("Your future AI teammate. One place for conversations, connected apps and real work across your devices.", "即将到来的 AI 队友，让对话、云端应用和真实设备汇聚在一起，完成你的工作。")}</p>
    <a className="arcV3TeaserAction" href={localizedWebsiteHref("/arc",locale)}>{tr("Discover Arc", "了解 Arc")} <span aria-hidden="true">↗</span></a>
    <span className="arcV3TeaserEndnote">{tr("Coming soon · Connect is available today", "即将推出 · Connect 现已可用")}</span>
  </section>;
}

const story = [
  {id:"01", en:"Start with intent",zh:"只需说出目标",detailEn:"Describe the result you want. Arc turns it into bounded, reviewable work.",detailZh:"告诉 Arc 你想要的结果，Arc 将目标转化成有边界、可审核的工作。",glyph:"⌁"},
  {id:"02", en:"Work across tools",zh:"连接真实工具",detailEn:"Cloud apps and devices, connected only within the permissions you give.",detailZh:"云端应用与个人设备协同执行，每项操作都遵守你的授权。",glyph:"⌘"},
  {id:"03", en:"See what got done",zh:"看到真实成果",detailEn:"Review results and approvals instead of taking an AI's word for it.",detailZh:"检查执行结果和审批记录，而不只是相信 AI 的口头汇报。",glyph:"✓"}
] as const;

export function ArcComingSoonPageContent() {
  const {tr,locale}=useI18n();
  return <main className="arcV3">
    <section className="arcV3Hero" aria-labelledby="arcV3HeroTitle">
      <div className="arcV3HeroGlow" aria-hidden="true" />
      <div className="arcV3HeroEyebrow"><ArcStatus>{tr("Introducing Arc · In development", "认识 Arc · 开发中")}</ArcStatus></div>
      <h1 id="arcV3HeroTitle">{tr("AI that moves work forward.", "让 AI，真正推动工作。")}</h1>
      <p>{tr("From conversation to connected action. We're building Arc, the AI teammate that can work with your apps and computers — with you in control.", "从一句话到真正的执行。我们正在打造 Arc：一个能够连接应用与电脑，同时始终由你掌控权限的 AI 队友。")}</p>
      <div className="arcV3HeroActions"><a className="arcV3Primary" href={earlyAccessHref}>{tr("Get early access", "申请抢先体验")} <span>↗</span></a><a className="arcV3Secondary" href={localizedWebsiteHref("/roadmap",locale)}>{tr("See what's next", "查看开发计划")} <span>→</span></a></div>
      <div className="arcV3HeroCue"><span />{tr("A GLIMPSE OF WHAT'S NEXT", "下一阶段产品概念")}</div>
      <ArcExecutionScene />
      <p className="arcV3Disclaimer">{tr("Concept only. Arc Hosted is not publicly available. Early access opens an email draft.", "此为概念展示。Arc 托管服务尚未公开开放，申请体验将打开邮件草稿。")}</p>
    </section>

    <section className="arcV3Journey" aria-labelledby="arcV3JourneyTitle">
      <span className="arcV3Eyebrow">01 — {tr("FROM WORDS TO WORK", "从对话到执行")}</span>
      <h2 id="arcV3JourneyTitle">{tr("One request. A thousand possibilities.", "一句需求，连接更多可能。")}</h2>
      <p className="arcV3SectionIntro">{tr("Arc is designed to turn an intention into work that you can actually inspect.", "Arc 的目标不是生成更多回答，而是把你的想法变成有证据可查的执行成果。")}</p>
      <div className="arcV3JourneyRail">
        {story.map((step,index)=><article key={step.id} className="arcV3JourneyStep">
          <span className="arcV3JourneyNumber">{step.id}</span>
          <div className="arcV3JourneyGlyph" aria-hidden="true">{step.glyph}</div>
          <h3>{locale==="zh"?step.zh:step.en}</h3>
          <p>{locale==="zh"?step.detailZh:step.detailEn}</p>
          {index!==story.length-1&&<div className="arcV3JourneyTrail" aria-hidden="true" />}
        </article>)}
      </div>
    </section>

    <section className="arcV3Split" aria-labelledby="arcV3ModesTitle">
      <span className="arcV3Eyebrow">02 — {tr("ONE PLATFORM", "同一个平台")}</span>
      <h2 id="arcV3ModesTitle">{tr("Bring your AI. Or meet Arc.", "继续用熟悉的 AI，或者认识 Arc。")}</h2>
      <div className="arcV3Modes">
        <article className="arcV3Mode"><span className="arcV3ModeNumber">01 / {tr("AVAILABLE TODAY", "现已可用")}</span><h3>Remote Arc Connect</h3><p>{tr("Use ChatGPT, Claude or another compatible AI. Remote Arc connects it to authorized tools on your computers. No extra Remote Arc model API key required.", "继续使用 ChatGPT、Claude 等兼容 AI，连接电脑上的授权工具，不需要额外开通 Remote Arc 模型 API Key。")}</p><a href="/connect-ai">{tr("Connect your AI", "连接现有 AI")} ↗</a></article>
        <div className="arcV3ModesConnector" aria-hidden="true"><ArcMark subtle /></div>
        <article className="arcV3Mode"><span className="arcV3ModeNumber">02 / {tr("COMING SOON", "即将推出")}</span><h3>Arc Hosted</h3><p>{tr("Talk to Arc directly and hand off work across apps and devices. Hosted model use will have separate pricing and usage limits; Connect's free MCP allowance does not cover it.", "直接与 Arc 对话，委派跨应用与设备的工作。托管模型将有独立费用和额度，不包含在 Connect 的免费 MCP 调用中。")}</p><a href={earlyAccessHref}>{tr("Request access", "申请体验")} ↗</a></article>
      </div>
    </section>

    <section className="arcV3Final">
      <ArcMark subtle />
      <span className="arcV3Eyebrow">{tr("THIS IS JUST THE BEGINNING", "这只是开始")}</span>
      <h2>{tr("Help us build what comes next.", "下一步，由真实需求决定。")}</h2>
      <p>{tr("Tell us what you'd delegate to Arc. We'll build it step by step, with transparent permissions, results and release status.", "告诉我们你最希望 Arc 帮你完成什么。我们将逐步交付，公开权限、执行结果与开发状态。")}</p>
      <div className="arcV3HeroActions"><a href={earlyAccessHref} className="arcV3Primary">{tr("Share your workflow", "分享你的需求")} ↗</a><a href={localizedWebsiteHref("/roadmap",locale)} className="arcV3Secondary">{tr("Explore the roadmap", "查看路线图")} →</a></div>
    </section>
  </main>;
}

const milestones=[
  {id:"01",en:"The foundation",zh:"连接与安全基础",enFlag:"AVAILABLE / HARDENING",zhFlag:"已可用 / 持续完善",state:"live",enBody:"Remote MCP, device permissions and persistent tasks are already part of Remote Arc. Organization and controlled release safeguards are being completed.",zhBody:"Remote MCP、设备权限与持久任务已可用，组织架构及受控发布机制仍在完善。"},
  {id:"02",en:"Arc Chat & Auto",zh:"Arc Chat 与 Auto",enFlag:"IN DEVELOPMENT",zhFlag:"开发中",state:"now",enBody:"Hosted chat, audited model routing and reliable execution within strict provider-cost ceilings.",zhBody:"独立托管对话、可审计模型路由，以及严格费用限制内的可靠任务执行。"},
  {id:"03",en:"Billing & early access",zh:"付费与早期体验",enFlag:"PUBLIC BETA GATE",zhFlag:"公开测试前必须完成",state:"later",enBody:"Checkout, subscription management, metered AI credits and bounded free trials before Arc is made available publicly.",zhBody:"公开 Arc 之前必须完成支付、订阅管理、模型用量与封顶的免费试用。"},
  {id:"04",en:"Connected apps & routines",zh:"应用连接与自动任务",enFlag:"PLANNED",zhFlag:"规划中",state:"later",enBody:"Carefully supported app integrations, resumable workflows and recurring jobs with reviewable outcomes.",zhBody:"稳定的应用集成、可恢复工作流和有结果可审核的定期任务。"},
  {id:"05",en:"Teach Arc & ecosystem",zh:"Teach Arc 与开放生态",enFlag:"EXPLORING",zhFlag:"探索中",state:"later",enBody:"Reusable skills from approved demonstrations and an extensible integration ecosystem.",zhBody:"从已授权的演示中学习可复用技能，并逐步构建开放的连接器生态。"}
] as const;

export function ArcRoadmapPageContent() {
  const {tr,locale}=useI18n();
  return <main className="arcV3 arcV3Roadmap">
    <header className="arcV3RoadmapHero">
      <ArcMark subtle />
      <span className="arcV3Eyebrow">REMOTE ARC / {tr("THE ROAD AHEAD", "未来路线图")}</span>
      <h1>{tr("Building what comes next.", "让每一步，都看得见。")}</h1>
      <p>{tr("The next era of Remote Arc is taking shape. Here's what's available, what's in development and what's still on the horizon — no invented launch dates.", "Remote Arc 正在进化。这些是我们已经交付、正在开发与未来探索的方向；不承诺尚未确定的发布日期。")}</p>
      <div className="arcV3RoadmapFocus"><ArcStatus>{tr("Current focus: Arc Chat & Auto", "当前重点：Arc Chat 与 Auto")}</ArcStatus></div>
    </header>
    <section className="arcV3Milestones" aria-label={tr("Development milestones", "开发里程碑")}>
      {milestones.map((item,index)=><article className={"arcV3Milestone arcV3Milestone--"+item.state} key={item.id}>
        <span className="arcV3MilestoneIndex">{item.id} <span className="arcV3MilestoneDot" /></span>
        <span className="arcV3MilestoneStatus">{locale==="zh"?item.zhFlag:item.enFlag}</span>
        <h2>{locale==="zh"?item.zh:item.en}</h2>
        <p>{locale==="zh"?item.zhBody:item.enBody}</p>
        {index < milestones.length-1 && <span className="arcV3MilestoneSpine" aria-hidden="true" />}
      </article>)}
    </section>
    <footer className="arcV3RoadmapFinish">
      <span className="arcV3Eyebrow">{tr("SHAPE WHAT'S NEXT", "一起决定下一步")}</span>
      <h2>{tr("What should Arc do for you?", "你希望 Arc 帮你完成什么？")}</h2>
      <p>{tr("We're listening. Tell us the workflows you'd like to automate.", "欢迎告诉我们，你最想交给 AI 自动完成的工作。")}</p>
      <a href={earlyAccessHref} className="arcV3Primary">{tr("Tell us", "告诉我们")} ↗</a>
      <a href={localizedWebsiteHref("/arc",locale)} className="arcV3BackLink">← {tr("Meet Arc", "认识 Arc")}</a>
      <small>{tr("Plans can change. Current Connect usage does not include Arc Hosted model credits.", "路线图可能调整。现有 Connect 服务不包含 Arc 托管模型额度。")}</small>
    </footer>
  </main>;
}
