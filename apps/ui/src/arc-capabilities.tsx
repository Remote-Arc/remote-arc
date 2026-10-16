import { useState } from "react";
import { useI18n } from "./i18n.js";
import { localizedWebsiteHref } from "./marketing-paths.js";
import "./arc-capabilities.css";

type IconName = "routine" | "skills" | "apps" | "workspace" | "teach" | "shield" | "calendar" | "git" | "radar" | "play" | "pause" | "check";
const paths: Record<IconName, string> = {
  routine:"M12 6v6l4 2M3.2 8.2a9 9 0 1 1-.1 7.8M3.2 3.8v4.5h4.5",
  skills:"M12 3l2.6 5.4L20 11l-5.4 2.6L12 19l-2.6-5.4L4 11l5.4-2.6L12 3ZM19 18v4m-2-2h4",
  apps:"M3 3h8v8H3zM13 3h8v8h-8zM3 13h8v8H3zM13 13h8v8h-8z",
  workspace:"M3 7h18v13H3zM3 7V4h18v3M9 7v13M3 11h6",
  teach:"M5 4h14v16H5zM9 9l6 3-6 3V9z",
  shield:"M12 2l8 4v6c0 5-3.4 8.4-8 10-4.6-1.6-8-5-8-10V6l8-4Zm-4 10 3 3 5-6",
  calendar:"M4 6h16v15H4zM8 3v6m8-6v6M4 11h16",
  git:"M6 3v12a4 4 0 0 0 4 4h8M3 6l3-3 3 3M15 16l3 3-3 3",
  radar:"M12 2v3m0 14v3M2 12h3m14 0h3M12 12l6-6M20 12a8 8 0 1 1-8-8",
  play:"M8 5l11 7-11 7V5z",
  pause:"M8 5v14m8-14v14",
  check:"M4 12l5 5L20 6"
};
export function ArcFeatureIcon({name}:{name:IconName}){
  return <svg className="arcFeatureSvg" aria-hidden="true" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name]}/></svg>;
}

const examples=[
  {icon:"calendar" as const,en:"Daily briefing",zh:"每日简报",detailEn:"Collect updates, summarize and send for review.",detailZh:"收集动态、生成摘要并等待审核。"},
  {icon:"git" as const,en:"Project summary",zh:"项目汇总",detailEn:"Read assigned issues and prepare a progress report.",detailZh:"读取任务和 Issue，整理项目进展。"},
  {icon:"radar" as const,en:"Change monitor",zh:"变更监控",detailEn:"Detect meaningful changes, then trigger an approved workflow.",detailZh:"识别有意义的变更，再触发已授权流程。"}
];
const apps=[
  {slug:"gmail",name:"Gmail",group:"communication"},
  {slug:"googlecalendar",name:"Google Calendar",group:"communication"},
  {slug:"slack",name:"Slack",group:"communication"},
  {slug:"microsoftoutlook",name:"Outlook",group:"communication"},
  {slug:"github",name:"GitHub",group:"work"},
  {slug:"notion",name:"Notion",group:"work"},
  {slug:"linear",name:"Linear",group:"work"},
  {slug:"jira",name:"Jira",group:"work"},
  {slug:"googledrive",name:"Google Drive",group:"work"},
  {slug:"googlesheets",name:"Sheets",group:"work"},
  {slug:"googledocs",name:"Docs",group:"work"},
  {slug:"confluence",name:"Confluence",group:"work"},
  {slug:"airtable",name:"Airtable",group:"extension"},
  {slug:"hubspot",name:"HubSpot",group:"extension"},
  {slug:"salesforce",name:"Salesforce",group:"extension"},
  {slug:"discord",name:"Discord",group:"extension"},
] as const;

export function ArcCapabilities() {
  const {tr,locale}=useI18n();
  const [example,setExample]=useState(0);
  const [category,setCategory]=useState<"all"|"communication"|"work"|"extension">("all");
  const current=examples[example]!;
  return <>
    <section className="arcCapabilities" id="arc-capabilities">
      <div className="arcCapabilitiesIntro">
        <span className="arcV3Eyebrow">{tr("BUILT FOR REAL WORK", "为了真正完成工作而设计")}</span>
        <h2>{tr("More than a conversation. A place where work continues.", "不止聊天。让每一项工作，都有下文。")}</h2>
        <p>{tr("A complete environment for delegated work: long-running routines, reusable skills, connected apps and an accountable AI teammate.", "从持续运行的自动任务到可复用技能、跨应用协作，以及每一步可追溯的 AI 执行。")}</p>
      </div>
      <div className="arcCapabilitiesSpotlight">
        <div className="arcCapabilityLead">
          <span className="arcFeatureIconFrame"><ArcFeatureIcon name="routine"/></span>
          <span className="arcCapabilityKicker">ROUTINES</span>
          <h3>{tr("Keep the work moving. Even when you close the tab.", "关掉浏览器，任务依然可以继续。")}</h3>
          <p>{tr("Save a goal, pause it, resume it later. Arc is being designed to carry authorized tasks across sessions, with review checkpoints, spending caps and verifiable outcomes.", "保存、暂停、恢复长期自主任务。即使关闭浏览器，Arc 也能在明确授权、审批节点和费用上限内继续推进，并提供可验证的执行结果。")}</p>
          <ul className="arcFeaturePills"><li><ArcFeatureIcon name="pause"/>{tr("Pause & resume", "随时暂停与恢复")}</li><li><ArcFeatureIcon name="shield"/>{tr("Approvals & cost ceilings", "审批与成本上限")}</li><li><ArcFeatureIcon name="check"/>{tr("Verified results", "结果验证")}</li></ul>
        </div>
        <div className="arcRoutineDemo" aria-label={tr("Illustrative routine templates", "计划中的自动任务模板示意")}>
          <div className="arcRoutineDemoTop"><span className="arcRoutineLiveDot"/>{tr("ROUTINE CONCEPT", "ROUTINE 概念预览")}<small>{tr("NOT LIVE", "尚未开放")}</small></div>
          <div className="arcRoutineChoices">{examples.map((e,i)=><button key={e.en} type="button" className={example===i?"selected":""} aria-pressed={example===i} onClick={()=>setExample(i)}><ArcFeatureIcon name={e.icon}/><span>{locale==="zh"?e.zh:e.en}</span><span aria-hidden="true">↗</span></button>)}</div>
          <div className="arcRoutineOutcome"><span>{tr("EXAMPLE WORKFLOW", "示例工作流程")}</span><strong>{locale==="zh"?current.zh:current.en}</strong><p>{locale==="zh"?current.detailZh:current.detailEn}</p><div className="arcRoutineFlow"><span><ArcFeatureIcon name="play"/>{tr("Trigger", "触发")}</span><i/><span><ArcFeatureIcon name="shield"/>{tr("Approval", "审批")}</span><i/><span><ArcFeatureIcon name="check"/>{tr("Result", "结果")}</span></div></div>
        </div>
      </div>
      <div className="arcCapabilitiesGrid">
        <article><span className="arcFeatureIconFrame"><ArcFeatureIcon name="skills"/></span><h3>{tr("Skills that you can reuse.", "一次学会，反复使用。")}</h3><p>{tr("Give Arc a growing library of approved, testable skills instead of rewriting the same instructions for every task.", "将有效的操作沉淀成可测试、可复用的 Skill，不需要反复编写相同的提示和步骤。")}</p><span className="arcFeatureFoot">SKILL LIBRARY · REPLAY TESTS</span></article>
        <article><span className="arcFeatureIconFrame"><ArcFeatureIcon name="workspace"/></span><h3>{tr("A workspace with boundaries.", "一个有清晰边界的 Workspace。")}</h3><p>{tr("Bring organization members, connection status, permissions, independent billing and audit trails together — without crossing teams or accounts.", "管理组织成员、连接状态、权限、独立账单与审计记录；团队之间的数据和权限有明确隔离。")}</p><span className="arcFeatureFoot">TEAMS · ACCESS · BILLING</span></article>
        <article><span className="arcFeatureIconFrame"><ArcFeatureIcon name="teach"/></span><h3>{tr("Teach Arc by showing, not coding.", "演示一遍，教会 Arc。")}</h3><p>{tr("Record an approved demonstration, turn it into a reusable skill and replay tests to make sure the steps still work — no workflow editor required.", "受控录制一次操作演示，自动生成 Skill，再通过测试重放验证；不用手工搭建整条工作流。")}</p><span className="arcFeatureFoot">TEACH ARC · CONTROLLED DEMOS</span></article>
        <article><span className="arcFeatureIconFrame"><ArcFeatureIcon name="shield"/></span><h3>{tr("Your permissions. Your budget.", "你的权限，你的预算。")}</h3><p>{tr("Approvals for sensitive actions, hard model-spending limits, revocable tool access, execution logs and higher-tier model choices when the work needs them.", "敏感操作审批、模型成本硬上限、可撤销工具权限、执行日志，以及按套餐开放的高级模型选择。")}</p><span className="arcFeatureFoot">AUTO ROUTING · PREMIUM MODELS</span></article>
      </div>
    </section>

    <section className="arcAppEcosystem" id="arc-apps">
      <div className="arcAppIntro"><span className="arcV3Eyebrow">{tr("CONNECTED APPS", "连接常用应用")}</span><h2>{tr("Your tools. Finally on the same team.", "熟悉的工具，终于可以一起工作。")}</h2><p>{tr("The target ecosystem starts with communication, projects and documents, and grows through a connector SDK and an extensible Tool Registry.", "我们计划优先覆盖邮件、协作、项目与文档工具，并通过 Connector SDK 和统一 Tool Registry 持续扩展生态。")}</p><span className="arcAppDisclosure">{tr("Integration targets shown below — not live connectors or an available app catalog.", "以下均为规划中的目标集成，并非已经上线或能够立即授权连接的应用。")}</span></div>
      <div className="arcAppFilters" role="group" aria-label={tr("Explore app categories", "筛选应用类型")}>
        {(["all","communication","work","extension"] as const).map(x=><button type="button" key={x} aria-pressed={category===x} className={category===x?"selected":""} onClick={()=>setCategory(x)}>{x==="all"?tr("All apps", "全部"):x==="communication"?tr("Communication","通讯协作"):x==="work"?tr("Projects & documents","项目与文档"):tr("Expanded ecosystem","扩展生态")}</button>)}
      </div>
      <div className="arcAppGrid">{apps.filter(x=>category==="all"||x.group===category).map(app=><div className="arcAppItem" key={app.slug}><span className="arcAppIcon"><img src={"/app-brands/"+app.slug+".svg"} alt="" loading="lazy" width="28" height="28"/></span><strong>{app.name}</strong></div>)}</div>
      <div className="arcEcosystemFoot"><div><span className="arcFeatureIconFrame"><ArcFeatureIcon name="apps"/></span><p><strong>{tr("An open connector ecosystem.", "可扩展的连接器生态。")}</strong><br/>{tr("Tool Registry, connection health, permission scopes and an SDK for third-party connectors — built around reliable execution, not logo count.", "统一工具目录、连接健康状态、授权范围和第三方 Connector SDK。我们优先保证连接质量，而不是单纯堆 Logo 数量。")}</p></div><a href={localizedWebsiteHref("/early-access?source=arc-apps",locale)}>{tr("Tell us which apps matter", "告诉我们你需要哪些应用")} ↗</a></div>
    </section>
  </>;
}
