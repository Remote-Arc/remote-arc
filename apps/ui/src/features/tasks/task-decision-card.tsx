import { useI18n } from "../../hooks/use-i18n.js";
import type { TaskDecision } from "../../hooks/tasks/use-task-decision.js";

const TITLES = {
  repair_failed: "tasks.taskDecision.titleRepairFailed",
  failure_streak: "tasks.taskDecision.titleFailureStreak",
  budget_stop: "tasks.taskDecision.titleBudgetStop",
  blocked: "tasks.taskDecision.titleBlocked",
} as const;

/** A held routine's decision: what happened, the evidence and the choices. */
export function TaskDecisionCard({
  decision,
  busy,
  disabled,
  error,
  formatTime,
  onDecide,
  onTurnOff,
}: {
  decision: TaskDecision;
  busy: boolean;
  disabled: boolean;
  error: string | null;
  formatTime: (value: string) => string;
  onDecide: (choice: "retry_now" | "skip_run") => void;
  onTurnOff: (trigger: HTMLButtonElement) => void;
}) {
  const { tr } = useI18n();
  return (
    <section className="taskDecision" aria-label={tr("tasks.taskDecision.label")}>
      <p className="taskDecisionTitle">{tr(TITLES[decision.kind])}</p>
      <p className="taskDecisionReason">{decision.reason}</p>
      {decision.evidence && (
        <details className="taskDecisionEvidence">
          <summary>{tr("tasks.taskDecision.lastOutput")}</summary>
          <pre>{decision.evidence}</pre>
        </details>
      )}
      {decision.on_timeout === "skip_run" && decision.timeout_at && (
        <p className="taskDecisionTimeout">
          {tr("tasks.taskDecision.skippedAt", { time: formatTime(decision.timeout_at) })}
        </p>
      )}
      <div className="taskDecisionActions">
        {decision.options.includes("retry_now") && (
          <button
            type="button"
            className="primaryButton"
            disabled={disabled}
            onClick={() => onDecide("retry_now")}
          >
            {busy ? tr("tasks.taskDecision.updating") : tr("tasks.taskDecision.retryNow")}
          </button>
        )}
        {decision.options.includes("skip_run") && (
          <button
            type="button"
            className="ghostButton"
            disabled={disabled}
            onClick={() => onDecide("skip_run")}
          >
            {tr("tasks.taskDecision.skipRun")}
          </button>
        )}
        {decision.options.includes("turn_off") && (
          <button
            type="button"
            className="ghostButton"
            disabled={disabled}
            onClick={(event) => onTurnOff(event.currentTarget)}
          >
            {tr("tasks.taskDecision.turnOff")}
          </button>
        )}
      </div>
      {error && (
        <p className="taskDecisionError" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
