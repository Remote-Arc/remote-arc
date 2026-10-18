import { useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import "./agent-chat-workspace.css";

type Translate = (english: string, chinese: string) => string;
type Goal = { id: string; name: string; status: string; updated_at: string };
type Props = {
  tr: Translate;
  onlineDevices: number;
  connectedDevices?: number;
  goals?: Goal[];
  recentGoals?: Array<{ id: string; name: string; status: string; next_run_at: string | null }>;
  onOpenGoal?: (id: string) => void;
  onCreateRoutine?: () => void;
  onPrepareGoal: (objective: string, successCriteria: string) => void;
  onOpenGoals: () => void;
  onManageApps: () => void;
  onManageDevices: () => void;
};

const Arrow = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round"/></svg>;
const Plus = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M12 5v14M5 12h14" strokeLinecap="round"/></svg>;
const Spark = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="m12 2 2.2 7.8L22 12l-7.8 2.2L12 22l-2.2-7.8L2 12l7.8-2.2L12 2Z"/></svg>;

export function AgentChatWorkspace({ tr, onlineDevices, goals = [], recentGoals = [], onOpenGoal, onPrepareGoal, onOpenGoals, onManageApps, onManageDevices }: Props) {
  const displayedGoals = goals.length ? goals : recentGoals.map((goal) => ({ ...goal, updated_at: goal.next_run_at || "" }));
  const [prompt, setPrompt] = useState("");
  const [objective, setObjective] = useState("");
  const [criteria, setCriteria] = useState("");
  const editor = useRef<HTMLTextAreaElement>(null);
  const examples = [
    { label: tr("Review a code change", "审查代码修改"), detail: tr("Inspect open PRs and flag release risks", "检查 PR 并标记发布风险"), prompt: tr("Inspect my open pull requests, run relevant checks and summarize any risks before merging.", "检查我尚未合并的 PR，运行相关测试并总结合并前的风险。") },
    { label: tr("Handle a device task", "处理设备任务"), detail: tr("Work on an available connected computer", "在可用的已连接电脑上执行"), prompt: tr("Check the health of my connected computers and identify anything that needs attention.", "检查已连接设备的健康状态，找出需要我处理的问题。") },
    { label: tr("Prepare a release", "准备项目发布"), detail: tr("Check readiness before taking action", "执行前先验证是否就绪"), prompt: tr("Review my project's current status, check the build and prepare a safe release plan.", "查看项目当前状态，检查构建并准备安全的发布计划。") },
  ];

  const begin = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const next = prompt.trim();
    if (!next) return;
    setObjective(next);
    setCriteria("");
    setPrompt("");
  };
  const newRequest = () => { setObjective(""); setPrompt(""); setCriteria(""); editor.current?.focus(); };
  const fillExample = (value: string) => { setObjective(""); setPrompt(value); requestAnimationFrame(() => editor.current?.focus()); };
  const onComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); }
  };

  return (
    <section className="arcSurface" aria-label={tr("Arc Agent workspace", "Arc Agent 工作区")}>
      <header className="arcTopbar">
        <div className="arcTopbarTitle"><span className="arcGlyph"><Spark /></span><span>Arc Agent</span><span className="arcEarlyAccess">{tr("EARLY ACCESS", "抢先体验")}</span></div>
        <button className="arcQuietButton" onClick={newRequest}><Plus />{tr("New request", "新建请求")}</button>
      </header>

      <div className="arcContent">
        <div className="arcThread">
          {objective ? (
            <div className="arcReviewFlow" aria-live="polite">
              <div className="arcUserMessage"><span>{objective}</span></div>
              <div className="arcReviewCard">
                <div className="arcReviewIcon"><Spark /></div>
                <div className="arcReviewMain">
                  <span className="arcEyebrow">{tr("STEP 1 OF 2 · PREPARE", "第 1 步 / 共 2 步 · 准备")}</span>
                  <h2>{tr("How will we know it's done?", "完成后如何验证结果？")}</h2>
                  <p>{tr("Set a clear success check. Next, you'll review the device, tools and execution permissions before anything runs.", "先明确成功标准；接下来你将检查执行设备、工具和权限。此时不会运行任何操作。")}</p>
                  <label htmlFor="arc-success-check">{tr("Success criteria", "成功标准")}</label>
                  <textarea id="arc-success-check" value={criteria} maxLength={2000} onChange={(e) => setCriteria(e.target.value)} placeholder={tr("e.g. Tests pass and a short report lists any remaining risks", "例如：测试全部通过，并生成包含剩余风险的简短报告")} rows={3}/>
                  <div className="arcReviewActions">
                    <button className="arcSecondaryAction" onClick={() => { setPrompt(objective); setObjective(""); }}>{tr("Edit request", "修改请求")}</button>
                    <button className="arcPrimaryAction" disabled={!criteria.trim()} onClick={() => onPrepareGoal(objective, criteria.trim())}>{tr("Review execution", "检查执行方案")} <Arrow /></button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="arcWelcome">
              <div className="arcWelcomeMark"><Spark /></div>
              <p className="arcEyebrow">{tr("YOUR WORK, ACROSS EVERY DEVICE", "跨设备工作空间")}</p>
              <h1>{tr("What should we work on?", "今天想完成什么？")}</h1>
              <p className="arcWelcomeText">{tr("Describe the outcome. Arc prepares a goal using your connected workspace, with execution under your control.", "描述你希望实现的结果。Arc 将基于已连接的工作空间准备目标，实际执行仍由你确认。")}</p>
            </div>
          )}

          {!objective && <div className="arcPromptArea">
            <form className="arcComposer" onSubmit={begin}>
              <label className="arcSrOnly" htmlFor="arc-request">{tr("Describe a request to Arc", "向 Arc 描述请求")}</label>
              <textarea ref={editor} id="arc-request" value={prompt} onKeyDown={onComposerKeyDown} onChange={(e) => setPrompt(e.target.value)} maxLength={6000} rows={3} placeholder={tr("Ask Arc to work on something…", "告诉 Arc 你想完成的工作…")}/>
              <div className="arcComposerToolbar">
                <div className="arcComposerContext">
                  <button type="button" onClick={onManageDevices} title={tr("Manage devices in Connect", "前往 Connect 管理设备")}><span className={"arcPresence " + (onlineDevices ? "online" : "")}/>{onlineDevices} {tr("devices", "台设备")}</button>
                  <span className="arcContextSeparator"/>
                  <button type="button" onClick={onManageApps}>{tr("Connected Apps", "已连接 Apps")} <span aria-hidden="true">↗</span></button>
                </div>
                <button className="arcSendButton" type="submit" disabled={!prompt.trim()} aria-label={tr("Continue to goal review", "继续检查目标")}><Arrow /></button>
              </div>
            </form>
            <div className="arcComposerHint">{tr("Enter to continue · Shift + Enter for new line · No action runs without review", "回车继续 · Shift + 回车换行 · 确认前不会执行操作")}</div>
          </div>}

          {!objective && <div className="arcExamples">
            <div className="arcExamplesLabel">{tr("Start with an idea", "从这些任务开始")}</div>
            <div className="arcExampleList">
              {examples.map((example) =>
                <button type="button" key={example.label} className="arcExample" onClick={() => fillExample(example.prompt)}>
                  <span><strong>{example.label}</strong><small>{example.detail}</small></span><Arrow />
                </button>
              )}
            </div>
          </div>}
        </div>

        <aside className="arcContextRail">
          <div className="arcRailSection">
            <div className="arcRailHeader"><span>{tr("YOUR WORKSPACE", "你的工作空间")}</span></div>
            <div className="arcRailMetric"><span className={"arcPresence " + (onlineDevices ? "online" : "")}/><strong>{onlineDevices} {onlineDevices === 1 ? tr("connected device", "台设备已连接") : tr("connected devices", "台设备已连接")}</strong></div>
            <p>{tr("Arc and Connect share approved access. Choose exactly what a goal can use before it runs.", "Arc 与 Connect 共用授权。每个目标执行前，都可以检查具体可使用的权限。")}</p>
            <button type="button" className="arcRailLink" onClick={onManageApps}>{tr("Manage connections", "管理连接")} <Arrow /></button>
          </div>
          <div className="arcRailDivider"/>
          <div className="arcRailSection">
            <div className="arcRailHeader"><span>{tr("RECENT RUNS", "最近执行")}</span><button onClick={onOpenGoals}>{tr("View all", "查看全部")} <span aria-hidden="true">↗</span></button></div>
            {displayedGoals.length ? (
              <div className="arcRecentRuns">{displayedGoals.slice(0, 4).map((goal) =>
                <button className="arcRecentRun" onClick={() => onOpenGoal ? onOpenGoal(goal.id) : onOpenGoals()} key={goal.id}>
                  <span className={"arcRunDot status-" + goal.status}/>
                  <span><strong>{goal.name}</strong><small>{goal.status.replaceAll("_", " ")}</small></span>
                  <Arrow />
                </button>
              )}</div>
            ) : <p className="arcEmptyRuns">{tr("No agent runs yet. Your first goal will appear here.", "还没有 Agent 执行记录。创建首个目标后会显示在这里。")}</p>}
          </div>
          <div className="arcRailFootnote">{tr("Goal preparation is available now. Multi-turn model chat is not enabled yet.", "当前可创建目标。原生多轮模型对话尚未启用。")}</div>
        </aside>
      </div>
    </section>
  );
}
