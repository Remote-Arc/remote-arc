import { useState, type FormEvent } from "react";
import "./agent-chat-workspace.css";

type Translate = (english: string, chinese: string) => string;
type Props = {
  tr: Translate;
  onlineDevices: number;
  goalCount: number;
  onPrepareGoal: (objective: string) => void;
  onOpenGoals: () => void;
  onManageApps: () => void;
};

export function AgentChatWorkspace({ tr, onlineDevices, goalCount, onPrepareGoal, onOpenGoals, onManageApps }: Props) {
  const [prompt, setPrompt] = useState("");
  const examples = [
    tr("Inspect my open PRs, run the relevant tests, and report what needs attention.", "检查我的待合并 PR，运行相关测试并汇报风险。"),
    tr("Organize the documents on my connected computer without touching sensitive paths.", "整理已连接电脑上的文档，不触碰敏感路径。"),
    tr("Check a project's status and prepare a verified deployment plan.", "检查项目状态并准备经过验证的部署计划。"),
  ];

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const objective = prompt.trim();
    if (!objective) return;
    onPrepareGoal(objective);
  };

  return (
    <section className="agentChatWorkspace" aria-label={tr("Arc Agent workspace", "Arc Agent 工作区")}>
      <header className="agentChatHeader">
        <div className="agentChatIdentity"><span className="agentChatMark" aria-hidden="true">✦</span><div><strong>Arc Agent</strong><small>{tr("Your workspace, one conversation away", "通过对话驱动你的工作区")}</small></div></div>
        <button type="button" className="ghostButton" onClick={onOpenGoals}>{tr("View goals", "查看目标")} <span aria-hidden="true">→</span></button>
      </header>
      <div className="agentChatCenter">
        <span className="agentChatEmblem" aria-hidden="true">✦</span>
        <h1>{tr("What should Arc work on?", "想让 Arc 帮你做什么？")}</h1>
        <p>{tr("Describe the result you want. Arc can use your connected devices and approved tools. Review the execution permissions before starting.", "告诉 Arc 你想达成的结果。Arc 可以使用已连接设备和授权工具；开始执行前请确认权限与执行条件。")}</p>
        <div className="agentChatSuggestions">
          {examples.map((example) => <button type="button" key={example} onClick={() => setPrompt(example)}>{example}<span aria-hidden="true">↗</span></button>)}
        </div>
      </div>
      <form className="agentChatComposer" onSubmit={submit}>
        <label htmlFor="agent-goal-prompt">{tr("Describe your goal", "描述你的目标")}</label>
        <textarea id="agent-goal-prompt" value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder={tr("Ask Arc to work on a goal...", "告诉 Arc 你想完成的工作…")} rows={3} maxLength={6000} />
        <div className="agentChatComposerFooter"><span>{tr("Goal draft · review before execution", "目标草稿 · 执行前确认")}</span><button className="primaryButton" type="submit" disabled={!prompt.trim()}>{tr("Review goal", "确认目标")} <span aria-hidden="true">→</span></button></div>
      </form>
      <footer className="agentChatFooter">
        <span>{onlineDevices} {tr("devices online", "台设备在线")} · {goalCount} {tr("saved goals", "个已保存目标")}</span>
        <button type="button" onClick={onManageApps}>{tr("Manage shared Apps in Connect", "在 Connect 中管理共享 Apps")} →</button>
      </footer>
      <p className="agentChatReadiness">{tr("Goal creation is available now. Free-form, multi-turn Arc conversations will be enabled when the hosted chat runtime is ready; this input does not pretend to generate a chat reply.", "当前支持从自然语言草稿创建 Agent Goal。完整的多轮 Arc 对话需要原生 Chat Runtime 上线，这里不会伪装生成 AI 回复。")}</p>
    </section>
  );
}
