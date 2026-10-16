import { useI18n } from "./i18n.js";
import { localizedWebsiteHref } from "./marketing-paths.js";
import "./arc-future.css";
import { ArcCapabilities } from "./arc-capabilities.js";
import { ArcExecutionScene } from "./arc-workspace-scene.js";
import { ArcWhy } from "./arc-why.js";
import "./arc-why.css";

// Only the concept's visual explanation is interactive. No model is called and
// no data is sent to an unimplemented waitlist or paid-hosted service.
const earlyAccessHref = "/early-access?source=arc";

function ArcMark({ subtle = false }: { subtle?: boolean }) {
  return <span className={"arcV3Mark" + (subtle ? " arcV3Mark--small" : "")} aria-hidden="true"><img className="arcV3BrandImage" src="/remote-arc.svg" alt="" width="106" height="106" /></span>;
}

function ArcStatus({ children }: { children: React.ReactNode }) {
  return <span className="arcV3Status"><i aria-hidden="true" />{children}</span>;
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

export function ArcComingSoonPageContent() {
  const {tr,locale}=useI18n();
  return <main className="arcV3">
    <section className="arcV3Hero" aria-labelledby="arcV3HeroTitle">
      <div className="arcV3HeroGlow" aria-hidden="true" />
      <div className="arcV3HeroEyebrow"><ArcStatus>{tr("Introducing Arc · In development", "认识 Arc · 开发中")}</ArcStatus></div>
      <h1 id="arcV3HeroTitle">{tr("Your AI team. Your device fleet.", "你的 AI 队友，你的设备集群。")}</h1>
      <p>{tr("Bring your computers, tools and working rules together. We’re building Arc as a dedicated workspace for AI teammates that work across the environments you control.", "把你的电脑、工具和工作规则汇聚在一起。我们正在打造 Arc：让 AI 队友在你掌控的工作环境中协同执行的专门工作空间。")}</p>
      <div className="arcV3HeroActions"><a className="arcV3Primary" href={localizedWebsiteHref(earlyAccessHref,locale)}>{tr("Get early access", "申请抢先体验")} <span>↗</span></a><a className="arcV3Secondary" href="#why-arc">{tr("Why use Arc?", "为什么选择 Arc？")} <span>↓</span></a><a className="arcV3Secondary" href={localizedWebsiteHref("/roadmap",locale)}>{tr("See what's next", "查看开发计划")} <span>→</span></a></div>
      <div className="arcV3HeroCue"><span />{tr("A GLIMPSE OF WHAT'S NEXT", "下一阶段产品概念")}</div>
      <ArcExecutionScene />
      <p className="arcV3Disclaimer">{tr("Concept only. Arc Hosted is not publicly available yet. The early-access form collects product interest only.", "此为概念展示。Arc 托管服务尚未公开开放，抢先体验表单仅用于收集使用意向。")}</p>
    </section>

    <ArcWhy tr={tr} connectHref={localizedWebsiteHref("/connect-ai",locale)} earlyAccessHref={localizedWebsiteHref(earlyAccessHref,locale)} />

    <ArcCapabilities />
    <section className="arcV3Final">
      <ArcMark subtle />
      <span className="arcV3Eyebrow">{tr("THIS IS JUST THE BEGINNING", "这只是开始")}</span>
      <h2>{tr("Help us build what comes next.", "下一步，由真实需求决定。")}</h2>
      <p>{tr("Tell us what you'd delegate to Arc. We'll build it step by step, with transparent permissions, results and release status.", "告诉我们你最希望 Arc 帮你完成什么。我们将逐步交付，公开权限、执行结果与开发状态。")}</p>
      <div className="arcV3HeroActions"><a href={localizedWebsiteHref(earlyAccessHref,locale)} className="arcV3Primary">{tr("Share your workflow", "分享你的需求")} ↗</a><a href={localizedWebsiteHref("/roadmap",locale)} className="arcV3Secondary">{tr("Explore the roadmap", "查看路线图")} →</a></div>
    </section>
  </main>;
}
