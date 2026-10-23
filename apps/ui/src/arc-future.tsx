import { useI18n } from "./i18n.js";
import { localizedWebsiteHref } from "./marketing-paths.js";
import "./arc-future.css";
import { ArcCapabilities } from "./arc-capabilities.js";
import { ArcExecutionScene } from "./arc-workspace-scene.js";
import { ArcWhy } from "./arc-why.js";
import "./arc-why.css";
import { SlackAgentPreview } from "./arc-connected-previews.js";
import {ProductIcon as Icon} from './product-icon.js';

// Marketing demonstrations use example data; CTAs open the real workspace.
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
    <div className="arcProductTeaserCopy"><span className="marketingLabel">{tr('THE NEXT CHAPTER / ARC','下一篇章 / ARC')}<i>{tr('Available now','现已上线')}</i></span>
    <h2 id="arcV3TeaserHeading">{tr('Your next personal agent.','你的下一位个人 AI 队友。')}</h2>
    <p>{tr('A familiar conversation. A whole fleet behind it. Chat with Remote Arc to check your devices, find a workspace and get work moving.','熟悉的聊天方式，背后是你的整个设备集群。和 Remote Arc 对话，查看设备情况、找到工作区，让工作继续。')}</p>
    <ul><li><Icon name="chat"/>{tr('Talk naturally. Get work done.','自然对话，完成工作。')}</li><li><Icon name="device"/>{tr('Coordinate apps and your own fleet.','协调应用与自己的设备集群。')}</li><li><Icon name="routine"/>{tr('One-off tasks. Everyday routines.','一次性任务，每日 Routine。')}</li></ul>
    <a className="marketingSecondary" href={localizedWebsiteHref('/arc',locale)}>{tr('Meet Arc','认识 Arc')}<Icon name="arrowUpRight" size={16}/></a>
    <small>{tr('Arc and Connect share your connections. Open Arc to try it.','Arc 与 Connect 共用你的连接，现在即可打开 Arc 体验。')}</small></div>
    <SlackAgentPreview />
  </section>;
}

export function ArcComingSoonPageContent({available=false,startHref=connectWorkspaceHref}:{available?:boolean;startHref?:string}) {
  const {tr,locale}=useI18n();
  return <main className="arcV3">
    <section className="arcV3Hero" aria-labelledby="arcV3HeroTitle">
      <div className="arcV3HeroGlow" aria-hidden="true" />
      <div className="arcV3HeroEyebrow"><ArcStatus>{available?tr("Arc · Personal agent", "Arc · 个人智能体"):tr("Arc · Check availability", "Arc · 查看可用状态")}</ArcStatus></div>
      <h1 id="arcV3HeroTitle">{tr("Your apps. Your computers. One personal agent.", "你的应用与电脑，一位个人 AI 队友。")}</h1>
      <p>{tr("You already connect your AI with Remote Arc. Meet the next step: a personal agent that brings those connections together, coordinates your device fleet, and turns conversations into tasks and routines. No model API key required.", "你已经用 Remote Arc 为 AI 连接工具。接下来，让个人 AI 队友把这些连接串起来，协调设备集群，把一句话变成任务与 Routine。无需模型 API Key。")}</p>
      <div className="arcV3HeroActions"><a className="arcV3Primary" href={available?startHref:connectWorkspaceHref}>{available?tr("Open Arc", "打开 Arc"):tr("Use Connect now", "先使用 Connect")} <span>↗</span></a><a className="arcV3Secondary" href="#why-arc">{tr("Why use Arc?", "为什么选择 Arc？")} <span>↓</span></a><a className="arcV3Secondary" href={localizedWebsiteHref("/roadmap",locale)}>{tr("See what's next", "查看开发计划")} <span>→</span></a></div>
      <div className="arcV3HeroCue"><span />{tr("ONE WORKSPACE FOR YOUR WORK", "在一个工作空间推进工作")}</div>
      <ArcExecutionScene />
      <p className="arcV3Disclaimer">{available?tr("Illustrative product demo. Open Arc to explore the workspace.","产品示意演示。打开 Arc，体验完整工作空间。"):tr("Illustrative demo. Check your workspace for current Arc access and allowance. Connect remains available.", "示意演示，当前 Arc 使用权限与额度请以工作空间为准，Connect 仍可使用。")}</p>
    </section>

    <ArcWhy tr={tr} connectHref={localizedWebsiteHref("/connect-ai",locale)} arcHref={available?startHref:connectWorkspaceHref} />

    <ArcCapabilities />
    <section className="arcV3Final">
      <ArcMark subtle />
      <span className="arcV3Eyebrow">{tr("THIS IS JUST THE BEGINNING", "这只是开始")}</span>
      <h2>{tr("Your work. A little more handled.", "你的工作，多一位队友。")}</h2>
      <p>{tr("Tell us what you'd delegate to Arc. We'll build it step by step, with transparent permissions, results and release status.", "告诉我们你最希望 Arc 帮你完成什么。我们将逐步交付，公开权限、执行结果与开发状态。")}</p>
      <div className="arcV3HeroActions"><a href={available?startHref:connectWorkspaceHref} className="arcV3Primary">{available?tr("Open Arc", "打开 Arc"):tr("Use Connect now", "先使用 Connect")} ↗</a><a href={localizedWebsiteHref("/roadmap",locale)} className="arcV3Secondary">{tr("Explore the roadmap", "查看路线图")} →</a></div>
    </section>
  </main>;
}
