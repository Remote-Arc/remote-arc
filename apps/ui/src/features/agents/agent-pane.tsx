import { useEffect, useRef, useState } from "react";
import { useI18n } from "../../hooks/use-i18n.js";
import { useAgentConversation, type AgentRun } from "../../hooks/agents/use-agent-runs.js";
import { AgentTimeline } from "./agent-timeline.js";
import { STATE_LABELS } from "./agent-labels.js";

/** One agent's conversation, side by side with others: timeline, changes and a message box. */
export function AgentPane({
  id,
  deviceName,
  busy,
  onStop,
  onRemove,
  onClose,
  onChange,
}: {
  id: string;
  deviceName: (run: AgentRun) => string;
  busy: boolean;
  onStop: () => void;
  onRemove: () => void;
  onClose: () => void;
  onChange: () => void;
}) {
  const { tr } = useI18n();
  const conversation = useAgentConversation(id, onChange);
  const [draft, setDraft] = useState("");
  const end = useRef<HTMLDivElement>(null);
  const run = conversation.run;
  const count = conversation.turns.reduce((n, turn) => n + turn.messages.length, 0);
  useEffect(() => {
    end.current?.scrollIntoView?.({ block: "end" });
  }, [count, conversation.turns.length]);

  if (!run)
    return <article className="orchPane is-loading">{tr("orchestration.pane.loading")}</article>;
  const summary = run.summary;
  const blocked = !run.can_send
    ? run.state === "running"
      ? tr("orchestration.pane.waitForReply")
      : tr("orchestration.pane.cannotContinue")
    : null;
  return (
    <article className="orchPane" aria-label={run.title}>
      <header className="orchPaneHeader">
        <div>
          <strong>{run.title}</strong>
          <small>
            {tr(
              run.agent === "claude" ? "orchestration.agent.claude" : "orchestration.agent.codex",
            )}
            {" · "}
            {deviceName(run)}
            {" · "}
            <code>{run.branch}</code>
          </small>
        </div>
        <span className={"orchState is-" + run.state}>{tr(STATE_LABELS[run.state])}</span>
        <button
          type="button"
          className="orchGhost"
          aria-label={tr("orchestration.pane.close")}
          onClick={onClose}
        >
          ×
        </button>
      </header>

      {summary && (
        <p className="orchChanges">
          {tr("orchestration.pane.changes", {
            files: summary.files_changed + summary.untracked,
            insertions: summary.insertions,
            deletions: summary.deletions,
            commits: summary.commits,
          })}
          {run.usage && run.usage.cost_usd > 0 && ` · $${run.usage.cost_usd.toFixed(2)}`}
        </p>
      )}

      <div className="orchPaneBody">
        <AgentTimeline turns={conversation.turns} />
        {run.error && run.state !== "running" && <p className="orchError">{run.error}</p>}
        {run.state === "needs_user" && (
          <p className="orchNotice">{tr("orchestration.pane.needsUser")}</p>
        )}
        <div ref={end} />
      </div>

      <form
        className="orchComposer"
        onSubmit={async (event) => {
          event.preventDefault();
          if (draft.trim() && (await conversation.send(draft.trim()))) setDraft("");
        }}
      >
        <textarea
          value={draft}
          rows={2}
          maxLength={20000}
          disabled={!run.can_send}
          placeholder={blocked ?? tr("orchestration.pane.messagePlaceholder")}
          aria-label={tr("orchestration.pane.message")}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey))
              event.currentTarget.form?.requestSubmit();
          }}
        />
        <div className="orchComposerActions">
          {run.state === "running" ? (
            <button type="button" className="orchDanger" disabled={busy} onClick={onStop}>
              {tr("orchestration.pane.stop")}
            </button>
          ) : (
            run.has_worktree && (
              <button
                type="button"
                className="orchGhost"
                disabled={busy}
                onClick={() => {
                  if (
                    window.confirm(tr("orchestration.pane.removeConfirm", { branch: run.branch }))
                  )
                    onRemove();
                }}
              >
                {tr("orchestration.pane.remove")}
              </button>
            )
          )}
          <button
            type="submit"
            className="orchPrimary"
            disabled={!run.can_send || !draft.trim() || conversation.sending}
          >
            {tr("orchestration.pane.send")}
          </button>
        </div>
        {conversation.failure && <p className="orchError">{conversation.failure}</p>}
      </form>
    </article>
  );
}
