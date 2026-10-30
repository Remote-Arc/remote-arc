import { AppsDirectory } from "./apps-directory.js";
import { AppWorkflowShowcase } from "./app-workflow-showcase.js";
import { useState } from "react";
import { useMarketingPlayback } from "./use-marketing-playback.js";
import { useI18n } from "./i18n.js";
import "./arc-capabilities.css";

type IconName = "routine" | "skills" | "apps" | "workspace" | "teach" | "shield" | "calendar" | "git" | "radar" | "play" | "pause" | "check" | "message" | "device" | "document";
const paths: Record<IconName, string> = {
  routine:"M12 6v6l4 2M3.2 8.2a9 9 0 1 1-.1 7.8M3.2 3.8v4.5h4.5",
  skills:"M5 3h9l5 5v13H5V3Zm9 0v6h5M9 12l-2 3 2 3m6-6 2 3-2 3m-3-6-1 6",
  apps:"M3 3h6v6H3zM15 3h6v6h-6zM9 15h6v6H9zM6 9v3h12V9m-6 3v3",
  workspace:"M3 7h18v13H3zM3 7V4h18v3M9 7v13M3 11h6",
  teach:"M3 8V4h4m10 0h4v4m0 8v4h-4M7 20H3v-4M9 8l10 6-5 1-2 5L9 8Z",
  shield:"M12 2l8 4v6c0 5-3.4 8.4-8 10-4.6-1.6-8-5-8-10V6l8-4Zm-4 10 3 3 5-6",
  calendar:"M4 6h16v15H4zM8 3v6m8-6v6M4 11h16",
  git:"M6 7v10m2-12h5a5 5 0 0 1 5 5v7M8 5a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM8 19a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM20 19a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z",
  radar:"M3 4h18v16H3zM3 8h18M6 14h3l2-3 3 6 2-3h2",
  play:"M8 5l11 7-11 7V5z",
  pause:"M8 5v14m8-14v14",
  check:"M4 12l5 5L20 6",
  message:"M4 4h16v12H9l-5 4V4Zm4 4h8m-8 4h5",
  device:"M3 4h18v13H3zM8 21h8m-4-4v4M6 8h6m-6 4h10",
  document:"M5 3h9l5 5v13H5V3Zm9 0v6h5M8 13h8m-8 4h5"
};
export function ArcFeatureIcon({name}:{name:IconName}){
  return <svg className="arcFeatureSvg" aria-hidden="true" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name]}/></svg>;
}

type RoutineCopy = { en: string; zh: string };
type RoutineExample = {
  icon: IconName;
  en: string;
  zh: string;
  trigger: RoutineCopy;
  task: RoutineCopy;
  preparing: RoutineCopy;
  artifact: RoutineCopy;
  filename: string;
  approval: RoutineCopy;
  sources: { slug: string; name: string; title: RoutineCopy; detail: RoutineCopy }[];
  lines: RoutineCopy[];
};

const examples: RoutineExample[] = [
  {
    icon: "calendar", en: "Daily briefing", zh: "每日简报",
    trigger: { en: "WEEKDAYS · 08:30", zh: "工作日 · 08:30" },
    task: { en: "Prepare my morning briefing", zh: "整理今天的晨间简报" },
    preparing: { en: "Turn today's updates into a clear day plan.", zh: "把今天的消息与日程，整理成清晰的行动安排。" },
    artifact: { en: "Your morning, in focus", zh: "今天的重点，一目了然" },
    filename: "morning-briefing.md",
    approval: { en: "Review the briefing before sharing it.", zh: "先检查简报，再决定是否分享。" },
    sources: [
      { slug: "gmail", name: "Gmail", title: { en: "3 priority messages", zh: "3 封重点邮件" }, detail: { en: "Alex · client review needs a reply", zh: "Alex · 客户评审等待回复" } },
      { slug: "googlecalendar", name: "Calendar", title: { en: "2 meetings today", zh: "今天有 2 场会议" }, detail: { en: "Design review · 10:00", zh: "设计评审 · 10:00" } }
    ],
    lines: [{ en: "Reply to Alex before 11:00", zh: "11:00 前回复 Alex 的评审邮件" }, { en: "Design review at 10:00 · notes attached", zh: "10:00 参加设计评审 · 附准备笔记" }]
  },
  {
    icon: "git", en: "Project summary", zh: "项目汇总",
    trigger: { en: "EVERY FRIDAY · 16:00", zh: "每周五 · 16:00" },
    task: { en: "Summarize this week's project progress", zh: "汇总本周的项目进展" },
    preparing: { en: "Match shipped changes to the project milestones.", zh: "将已合并的改动与项目里程碑逐一核对。" },
    artifact: { en: "This week's progress", zh: "本周进展，准备就绪" },
    filename: "weekly-project-update.md",
    approval: { en: "Check the summary before posting to your team.", zh: "核对摘要后，再决定是否发给团队。" },
    sources: [
      { slug: "github", name: "GitHub", title: { en: "4 pull requests merged", zh: "4 个 PR 已合并" }, detail: { en: "Authentication flow · checks passing", zh: "身份验证流程 · 检查通过" } },
      { slug: "linear", name: "Linear", title: { en: "Sprint 12 · 8 issues closed", zh: "Sprint 12 · 8 个任务完成" }, detail: { en: "Release milestone · one blocker", zh: "发布里程碑 · 1 个阻塞项" } }
    ],
    lines: [{ en: "Shipped authentication improvements", zh: "身份验证流程改进已交付" }, { en: "1 blocker needs an owner before release", zh: "发布前需为 1 个阻塞项指定负责人" }]
  },
  {
    icon: "radar", en: "Change monitor", zh: "变更监控",
    trigger: { en: "ON A MEANINGFUL CHANGE", zh: "检测到有意义的变更时" },
    task: { en: "Tell me when the release plan changes", zh: "发布计划有变更时告诉我" },
    preparing: { en: "Compare the new plan with the previous version.", zh: "对比前后版本，提取真正影响工作的变更。" },
    artifact: { en: "A change worth your attention", zh: "值得关注的变更" },
    filename: "release-plan-change.md",
    approval: { en: "Review the change before any follow-up action.", zh: "先审核变更，再决定后续行动。" },
    sources: [
      { slug: "notion", name: "Notion", title: { en: "Release plan updated", zh: "发布计划已更新" }, detail: { en: "Launch date · Oct 23 → Oct 27", zh: "发布日期 · 10 月 23 日 → 27 日" } },
      { slug: "github", name: "GitHub", title: { en: "1 related issue changed", zh: "1 个关联 Issue 有变更" }, detail: { en: "Release checklist · review needed", zh: "发布检查清单 · 等待确认" } }
    ],
    lines: [{ en: "Launch moved from Oct 23 to Oct 27", zh: "发布日期从 10 月 23 日改为 27 日" }, { en: "Review the affected release checklist", zh: "检查受影响的发布清单" }]
  }
];

function RoutineConceptDemo() {
  const { tr } = useI18n();
  const [example, setExample] = useState(0);
  const { ref, step, setStep, playing, setPlaying, running, reducedMotion } = useMarketingPlayback(4, 2800);
  const current = examples[example]!;
  const copy = (value: RoutineCopy) => tr(value.en, value.zh);
  const phases = [tr("Receive", "接收"), tr("Prepare", "整理"), tr("Review", "审核"), tr("Result", "结果")];
  const phaseTitles = [
    tr("The right context arrives.", "相关信息，已经到位。"),
    tr("Scattered updates become a draft.", "零散信息，正在变成草稿。"),
    tr("Your review is the next step.", "下一步，由你审核。"),
    tr("A result you can inspect.", "成果可查看，依据可追溯。")
  ];
  return <div className="arcRoutineDemo" ref={ref} data-running={running} data-routine-step={step} aria-label={tr("Illustrative routine templates with example data", "使用示例数据的自动任务概念演示")}>
    <div className="arcRoutineDemoTop"><span className="arcRoutineLiveDot" aria-hidden="true"/><span>{tr("ROUTINE CONCEPT", "ROUTINE 概念预览")}</span><small>{tr("EXAMPLE DATA", "示例数据")}</small><button type="button" className="arcRoutinePlayback" onClick={() => setPlaying(value => !value)} aria-label={reducedMotion ? tr("Animation disabled by your motion preference", "已按系统偏好关闭动画") : playing ? tr("Pause routine demo", "暂停 Routine 动画") : tr("Play routine demo", "播放 Routine 动画")} disabled={reducedMotion}><ArcFeatureIcon name={playing ? "pause" : "play"}/></button></div>
    <div className="arcRoutineChoices" role="group" aria-label={tr("Choose a routine example", "选择自动任务示例")}>
      {examples.map((item, index) => <button key={item.en} type="button" className={example === index ? "selected" : ""} aria-pressed={example === index} onClick={() => { setExample(index); setStep(reducedMotion ? 3 : 0); }}><ArcFeatureIcon name={item.icon}/><span>{tr(item.en, item.zh)}</span></button>)}
    </div>
    <div className="arcRoutineStory" key={current.en}>
      <div className="arcRoutineRequest"><span>{copy(current.trigger)}</span><strong>{copy(current.task)}</strong></div>
      <div className="arcRoutineSources" aria-label={tr("Example sources, not connected accounts", "示例来源，并未连接真实账号")}>
        {current.sources.map(source => <div className="arcRoutineSource" key={source.slug}>
          <span className="arcRoutineSourceLogo" data-brand={source.slug}><img src={"/app-brands/" + source.slug + ".svg"} width="24" height="24" alt={source.name}/></span>
          <div><strong>{copy(source.title)}</strong><span>{copy(source.detail)}</span></div>
          <span className={"arcRoutineSourceState" + (step > 0 ? " is-read" : "")}><ArcFeatureIcon name={step > 0 ? "check" : "document"}/></span>
        </div>)}
      </div>
      <div className="arcRoutineProgress" aria-label={tr("Preview steps", "演示步骤")}>
        {phases.map((phase, index) => <button key={phase} type="button" className={step === index ? "current" : step > index ? "complete" : ""} aria-pressed={step === index} onClick={() => { setStep(index); setPlaying(false); }}><span>{step > index ? <ArcFeatureIcon name="check"/> : "0" + (index + 1)}</span>{phase}</button>)}
      </div>
      <div className="arcRoutineWorkbench">
        <div className="arcRoutineWorkbenchHeading"><span className="arcRoutineArcLogo"><img src="/remote-arc.svg" width="24" height="24" alt="Arc"/></span><div><span>{tr("EXAMPLE WORKFLOW · NOT LIVE", "示例流程 · 尚未上线")}</span><strong>{phaseTitles[step]}</strong></div><span className={"arcRoutineBeat" + (step === 3 ? " is-done" : "")} aria-hidden="true">{step === 3 ? <ArcFeatureIcon name="check"/> : <i/>}</span></div>
        <div className="arcRoutineArtifact" data-ready={step >= 2}>
          <div className="arcRoutineArtifactHeader"><ArcFeatureIcon name="document"/><span>{step === 0 ? tr("Waiting to prepare the draft", "等待生成草稿") : copy(current.artifact)}</span><small>{step === 3 ? tr("DRAFT", "草稿") : "01"}</small></div>
          {step === 0 ? <p className="arcRoutineArtifactWaiting">{tr("Only the authorized sources enter this example.", "示例只使用已授权范围内的来源。")}</p> : step === 1 ? <div className="arcRoutineDrafting"><p>{copy(current.preparing)}</p><span/><span/><span/></div> : <ul className="arcRoutineArtifactLines">{current.lines.map(line => <li key={line.en}><ArcFeatureIcon name="check"/>{copy(line)}</li>)}</ul>}
          <div className={"arcRoutineReviewNote" + (step >= 2 ? " visible" : "")}><ArcFeatureIcon name="shield"/><span>{copy(current.approval)}</span></div>
          <div className="arcRoutineArtifactFile"><code>{step === 3 ? current.filename : tr("Source references stay with the draft", "来源依据随草稿保留")}</code><span>{step === 3 ? tr("Ready to review", "等待审核") : tr("Example data", "示例数据")}</span></div>
        </div>
      </div>
      <p className="arcRoutineScope">{tr("Simulated sources and results. No accounts connected, no messages sent.", "模拟来源与结果，不连接账号，也不发送消息。")}</p>
    </div>
  </div>;
}

export function ArcCapabilities() {
  const {tr}=useI18n();
  return <>
    <section className="arcCapabilities" id="arc-capabilities">
      <div className="arcCapabilitiesIntro">
        <span className="arcV3Eyebrow">{tr("BUILT FOR REAL WORK", "为了真正完成工作而设计")}</span>
        <h2>{tr("More than a conversation. A place where work continues.", "不止聊天。让每一项工作，都有下文。")}</h2>
        <p>{tr("A complete environment for delegated work: long-running routines, reusable skills, connected apps and an accountable AI agent.", "从持续运行的自动任务到可复用技能、跨应用协作，以及每一步可追溯的 AI 执行。")}</p>
      </div>
      <div className="arcCapabilitiesSpotlight">
        <div className="arcCapabilityLead">
          <span className="arcFeatureIconFrame"><ArcFeatureIcon name="routine"/></span>
          <span className="arcCapabilityKicker">ROUTINES</span>
          <h3>{tr("Keep the work moving. Even when you close the tab.", "关掉浏览器，任务依然可以继续。")}</h3>
          <p>{tr("Save a goal, pause it, resume it later. Arc is being designed to carry authorized tasks across sessions, with review checkpoints, spending caps and verifiable outcomes.", "保存、暂停、恢复长期自主任务。即使关闭浏览器，Arc 也能在明确授权、审批节点和费用上限内继续推进，并提供可验证的执行结果。")}</p>
          <ul className="arcFeaturePills"><li><ArcFeatureIcon name="pause"/>{tr("Pause & resume", "随时暂停与恢复")}</li><li><ArcFeatureIcon name="shield"/>{tr("Approvals & cost ceilings", "审批与成本上限")}</li><li><ArcFeatureIcon name="check"/>{tr("Verified results", "结果验证")}</li></ul>
        </div>
        <RoutineConceptDemo />
      </div>
      <div className="arcCapabilitiesGrid">
        <article><span className="arcFeatureIconFrame"><ArcFeatureIcon name="skills"/></span><h3>{tr("Skills that you can reuse.", "一次学会，反复使用。")}</h3><p>{tr("Give Arc a growing library of approved, testable skills instead of rewriting the same instructions for every task.", "将有效的操作沉淀成可测试、可复用的 Skill，不需要反复编写相同的提示和步骤。")}</p><span className="arcFeatureFoot">SKILL LIBRARY · REPLAY TESTS</span></article>
        <article><span className="arcFeatureIconFrame"><ArcFeatureIcon name="workspace"/></span><h3>{tr("A workspace with boundaries.", "一个有清晰边界的 Workspace。")}</h3><p>{tr("Bring organization members, connection status, permissions, independent billing and audit trails together — without crossing teams or accounts.", "管理组织成员、连接状态、权限、独立账单与审计记录；团队之间的数据和权限有明确隔离。")}</p><span className="arcFeatureFoot">TEAMS · ACCESS · BILLING</span></article>
        <article><span className="arcFeatureIconFrame"><ArcFeatureIcon name="teach"/></span><h3>{tr("Teach Arc by showing, not coding.", "演示一遍，教会 Arc。")}</h3><p>{tr("Record an approved demonstration, turn it into a reusable skill and replay tests to make sure the steps still work — no workflow editor required.", "受控录制一次操作演示，自动生成 Skill，再通过测试重放验证；不用手工搭建整条工作流。")}</p><span className="arcFeatureFoot">TEACH ARC · CONTROLLED DEMOS</span></article>
        <article><span className="arcFeatureIconFrame"><ArcFeatureIcon name="shield"/></span><h3>{tr("Your permissions. Your budget.", "你的权限，你的预算。")}</h3><p>{tr("Approvals for sensitive actions, hard model-spending limits, revocable tool access, execution logs and higher-tier model choices when the work needs them.", "敏感操作审批、模型成本硬上限、可撤销工具权限、执行日志，以及按套餐开放的高级模型选择。")}</p><span className="arcFeatureFoot">AUTO ROUTING · PREMIUM MODELS</span></article>
      </div>
    </section>

    <AppWorkflowShowcase />
    <AppsDirectory id="arc-apps" />
  </>;
}
