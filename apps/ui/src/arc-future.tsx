import { useI18n } from "./i18n.js";
import { localizedWebsiteHref } from "./marketing-paths.js";
import "./arc-future.css";
import { ArcCapabilities } from "./arc-capabilities.js";
import { ArcExecutionScene } from "./arc-workspace-scene.js";
import { ArcWhy } from "./arc-why.js";
import "./arc-why.css";
import {ProductIcon as Icon} from './product-icon.js';

// Only the concept's visual explanation is interactive. No model is called and
// no data is sent to an unimplemented waitlist or paid-hosted service.
const connectWorkspaceHref = "https://agent.remotearc.app/dashboard/connect/overview";

function ArcMark({ subtle = false }: { subtle?: boolean }) {
  return <span className={"arcV3Mark" + (subtle ? " arcV3Mark--small" : "")} aria-hidden="true"><img className="arcV3BrandImage" src="/remote-arc.svg" alt="" width="106" height="106" /></span>;
}

function ArcStatus({ children }: { children: React.ReactNode }) {
  return <span className="arcV3Status"><i aria-hidden="true" />{children}</span>;
}

export function ArcTeaser() {
  const {tr,locale}=useI18n();
  return <section className="arcProductTeaser" aria-labelledby="arcV3TeaserHeading">
    <div className="arcProductTeaserCopy"><span className="marketingLabel">{tr('THE NEXT CHAPTER / ARC','下一篇章 / ARC')}<i>{tr('Coming soon','即将上线')}</i></span>
    <h2 id="arcV3TeaserHeading">{tr('Your next personal agent.','你的下一位个人 AI 队友。')}</h2>
    <p>{tr('The same apps. The same computers. A new place to hand off the work — just tell Arc what you need.','沿用同一套应用与电脑连接，在新的工作空间里，把工作交出去。告诉 Arc 你想完成什么就好。')}</p>
    <ul><li><Icon name="chat"/>{tr('Talk naturally. Get work done.','自然对话，完成工作。')}</li><li><Icon name="device"/>{tr('Coordinate apps and your own fleet.','协调应用与自己的设备集群。')}</li><li><Icon name="routine"/>{tr('One-off tasks. Everyday routines.','一次性任务，每日 Routine。')}</li></ul>
    <a className="marketingSecondary" href={localizedWebsiteHref('/arc',locale)}>{tr('Meet Arc','认识 Arc')}<Icon name="arrowUpRight" size={16}/></a>
    <small>{tr('Connect is available today. Arc is being prepared for release.','Connect 现已可用，Arc 正在准备发布。')}</small></div>
    <div className="arcProductWindow" aria-label={tr('Illustrative Arc product preview, not a live run','Arc 产品示意，并非真实执行')}><header><img src="/remote-arc.svg" alt="" width={22} height={22}/><strong>Arc</strong><span>{tr('PRODUCT PREVIEW','产品预览')}</span></header><div className="arcProductWindowBody"><aside><span><Icon name="chat"/>{tr('Chat','对话')}</span><span><Icon name="tasks"/>{tr('Tasks','任务')}</span><span className="selected"><Icon name="routine"/>{tr('Routines','例行工作')}</span><small>{tr('YOUR TOOLS','你的工具')}</small><span><Icon name="apps"/>{tr('Apps','应用')}</span><span><Icon name="device"/>{tr('Devices','设备')}</span></aside><div className="arcProductConversation"><div className="arcProductPrompt">{tr('Every weekday at 9, prepare my morning brief.','每个工作日早上 9 点，整理我的晨间简报。')}</div><div className="arcProductResponse"><img src="/remote-arc.svg" alt="" width={22} height={22}/><p>{tr('A little less busywork. A clearer start to your day.','少一点琐事，清晰地开始每一天。')}</p></div><div className="arcProductRoutine"><div><span><Icon name="routine" size={15}/>{tr('Morning brief','晨间简报')}</span><small>{tr('Example','示例')}</small></div><p>{tr('Email priorities, today’s meetings and a plan for what comes next.','重点邮件、今天的会议，以及接下来的行动安排。')}</p><footer><span>09:00 · {tr('Weekdays','工作日')}</span><div>{['gmail','googlecalendar','notion'].map(brand=><img key={brand} src={'/app-brands/'+brand+'.svg'} alt="" width={17} height={17}/>)}</div></footer></div><div className="arcProductPreviewComposer">{tr('Tell Arc what’s next…','告诉 Arc 下一步…')}<span><Icon name="arrowUp" size={15}/></span></div></div></div></div>
  </section>;
}

export function ArcComingSoonPageContent() {
  const {tr,locale}=useI18n();
  return <main className="arcV3">
    <section className="arcV3Hero" aria-labelledby="arcV3HeroTitle">
      <div className="arcV3HeroGlow" aria-hidden="true" />
      <div className="arcV3HeroEyebrow"><ArcStatus>{tr("Arc · Coming soon", "Arc · 即将上线")}</ArcStatus></div>
      <h1 id="arcV3HeroTitle">{tr("Your apps. Your computers. One personal agent.", "你的应用与电脑，一位个人 AI 队友。")}</h1>
      <p>{tr("You already connect your AI with Remote Arc. Meet the next step: a personal agent that brings those connections together, coordinates your device fleet, and turns conversations into tasks and routines. No model API key required.", "你已经用 Remote Arc 为 AI 连接工具。接下来，让个人 AI 队友把这些连接串起来，协调设备集群，把一句话变成任务与 Routine。无需模型 API Key。")}</p>
      <div className="arcV3HeroActions"><a className="arcV3Primary" href={connectWorkspaceHref}>{tr("Use Connect now", "先使用 Connect")} <span>↗</span></a><a className="arcV3Secondary" href="#why-arc">{tr("Why use Arc?", "为什么选择 Arc？")} <span>↓</span></a><a className="arcV3Secondary" href={localizedWebsiteHref("/roadmap",locale)}>{tr("See what's next", "查看开发计划")} <span>→</span></a></div>
      <div className="arcV3HeroCue"><span />{tr("A GLIMPSE OF WHAT'S NEXT", "下一阶段产品概念")}</div>
      <ArcExecutionScene />
      <p className="arcV3Disclaimer">{tr("Product preview. Arc Chat is not open yet. Connect is available today; a 14-day Arc trial is planned for launch.", "产品预览。Arc Chat 尚未开放，Connect 现已可用；Arc 上线时计划提供 14 天试用。")}</p>
    </section>

    <ArcWhy tr={tr} connectHref={localizedWebsiteHref("/connect-ai",locale)} earlyAccessHref={localizedWebsiteHref("/roadmap",locale)} />

    <ArcCapabilities />
    <section className="arcV3Final">
      <ArcMark subtle />
      <span className="arcV3Eyebrow">{tr("THIS IS JUST THE BEGINNING", "这只是开始")}</span>
      <h2>{tr("Your work. A little more handled.", "你的工作，多一位队友。")}</h2>
      <p>{tr("Tell us what you'd delegate to Arc. We'll build it step by step, with transparent permissions, results and release status.", "告诉我们你最希望 Arc 帮你完成什么。我们将逐步交付，公开权限、执行结果与开发状态。")}</p>
      <div className="arcV3HeroActions"><a href={connectWorkspaceHref} className="arcV3Primary">{tr("Use Connect now", "先使用 Connect")} ↗</a><a href={localizedWebsiteHref("/roadmap",locale)} className="arcV3Secondary">{tr("Explore the roadmap", "查看路线图")} →</a></div>
    </section>
  </main>;
}
