import { useState } from "react";
import { useI18n } from "../../hooks/use-i18n.js";
import { useRoutineRuns, type Routine } from "../../hooks/routines/use-routines.js";
import type { useTaskDecision } from "../../hooks/tasks/use-task-decision.js";
import { TaskDecisionCard } from "../tasks/task-decision-card.js";
import { TaskArcHint } from "../tasks/task-arc-hint.js";
import { TaskSavedSteps, type SavedStep } from "../tasks/task-saved-steps.js";
import { resultLabel, resultTone, scheduleLabel } from "./routine-labels.js";

type Plan = { steps?: SavedStep[]; on_failure?: SavedStep[]; auto_repair?: boolean };
type Goal = { type?: string; command?: string; expected_exit_code?: number };
const parse = <T,>(value: string | null | undefined): T | null => {
  try {
    return JSON.parse(value || "null") as T;
  } catch {
    return null;
  }
};

/** The selected routine: actions, how it runs and its recent runs. */
export function RoutineDetail({
  routine,
  deviceName,
  busy,
  error,
  decisions,
  formatTime,
  onAct,
  onOpenConversation,
  onBack,
}: {
  routine: Routine;
  deviceName: string;
  busy: boolean;
  error: string | null;
  decisions: ReturnType<typeof useTaskDecision<{ id: string }>>;
  formatTime: (value: string | null) => string;
  onAct: (action: "pause" | "resume" | "cancel" | "run_now") => void;
  onOpenConversation: (sessionId: string) => void;
  onBack: () => void;
}) {
  const { tr } = useI18n();
  const [confirmOff, setConfirmOff] = useState(false);
  const runs = useRoutineRuns(routine);
  const plan = parse<Plan>(routine.saved?.action_json);
  const goal = parse<Goal>(routine.saved?.goal_json);
  const finished = ["completed", "failed", "cancelled", "expired"].includes(routine.status);
  const conversation = routine.work?.conversationId;

  return (
    <aside
      className="routineDetail"
      aria-label={tr("routines.detail.label", { name: routine.name })}
      data-routine-id={routine.id}
    >
      <button type="button" className="routineDetailBack" onClick={onBack}>
        ← {tr("routines.detail.back")}
      </button>
      <header className="routineDetailHeader">
        <span className="routineDetailMeta">
          {routine.source === "arc" ? tr("routines.labels.fromChat") : tr("routines.labels.fromAi")}
          {" · "}
          {deviceName} · {scheduleLabel(routine, tr)}
        </span>
        <h2>{routine.name}</h2>
        <p className="routineDetailResult" data-tone={resultTone(routine)}>
          <span aria-hidden="true" />
          {resultLabel(routine, tr)}
          {routine.lastRun?.at ? " · " + formatTime(routine.lastRun.at) : ""}
        </p>
      </header>

      <div className="routineDetailActions">
        {routine.status === "waiting" && (
          <button
            type="button"
            className="routinePrimary"
            disabled={busy}
            onClick={() => onAct("run_now")}
          >
            {tr("routines.detail.runNow")}
          </button>
        )}
        {conversation && (
          <button type="button" onClick={() => onOpenConversation(conversation)}>
            {tr("routines.detail.openConversation")}
          </button>
        )}
        {!finished && routine.status !== "paused" && (
          <button type="button" disabled={busy} onClick={() => onAct("pause")}>
            {tr("routines.detail.pause")}
          </button>
        )}
        {routine.status === "paused" && !routine.decision && (
          <button type="button" disabled={busy} onClick={() => onAct("resume")}>
            {tr("routines.detail.resume")}
          </button>
        )}
        {!finished &&
          !routine.decision &&
          (confirmOff ? (
            <button
              type="button"
              className="routineDanger"
              disabled={busy}
              onClick={() => {
                setConfirmOff(false);
                onAct("cancel");
              }}
            >
              {tr("routines.detail.confirmTurnOff")}
            </button>
          ) : (
            <button type="button" onClick={() => setConfirmOff(true)}>
              {tr("routines.detail.turnOff")}
            </button>
          ))}
      </div>
      {error && (
        <p className="routineError" role="alert">
          {error}
        </p>
      )}

      {routine.decision && routine.saved && (
        <TaskDecisionCard
          decision={routine.decision}
          busy={decisions.busy === routine.id}
          disabled={busy || decisions.busy !== null}
          error={decisions.errorFor(routine.id)}
          formatTime={(value) => formatTime(value)}
          onDecide={(choice) =>
            void decisions.decide({ id: routine.id }, routine.decision!, choice)
          }
          onTurnOff={() => setConfirmOff(true)}
        />
      )}
      {routine.repairNeedsArc && <TaskArcHint />}

      <section className="routineDetailSection">
        <h3>{tr("routines.detail.howItRuns")}</h3>
        {routine.saved ? (
          <>
            <div className="taskSavedInstructions">
              <TaskSavedSteps steps={plan?.steps || []} onFailure={plan?.on_failure} />
            </div>
            <dl className="routineFacts">
              <dt>{tr("routines.detail.acceptance")}</dt>
              <dd>
                {goal?.type === "command_exit" && goal.command ? (
                  <code>{goal.command}</code>
                ) : (
                  tr("routines.detail.noAcceptance")
                )}
              </dd>
              <dt>{tr("routines.detail.repair")}</dt>
              <dd>
                {plan?.auto_repair === false
                  ? tr("routines.detail.repairOff")
                  : routine.repairNeedsArc
                    ? tr("routines.detail.repairNeedsPlan")
                    : tr("routines.detail.repairOn")}
              </dd>
              <dt>{tr("routines.detail.notifications")}</dt>
              <dd>
                <a href="/settings?section=notifications">{tr("routines.detail.chooseChannels")}</a>
              </dd>
            </dl>
          </>
        ) : (
          <p className="routineMuted">{tr("routines.detail.arcRunsInConversation")}</p>
        )}
      </section>

      <section className="routineDetailSection">
        <h3>{tr("routines.detail.recentRuns")}</h3>
        {routine.saved ? (
          runs === null ? (
            <p className="routineMuted">{tr("routines.detail.loadingRuns")}</p>
          ) : runs.length === 0 ? (
            <p className="routineMuted">{tr("routines.detail.noRuns")}</p>
          ) : (
            <ul className="routineRuns">
              {runs.slice(0, 8).map((run) => (
                <li
                  key={run.id}
                  data-tone={
                    run.status === "completed"
                      ? "passed"
                      : run.status === "running"
                        ? "running"
                        : "failed"
                  }
                >
                  <span aria-hidden="true" />
                  <div>
                    <strong>{formatTime(run.finished_at || run.started_at)}</strong>
                    {" · "}
                    {run.status === "completed"
                      ? tr("routines.labels.passed")
                      : run.status === "running"
                        ? tr("routines.labels.running")
                        : run.exit_code !== null
                          ? tr("routines.labels.failedWithCode", { code: run.exit_code })
                          : tr("routines.labels.failed")}
                    {run.error && <p className="routineMuted">{run.error}</p>}
                    {run.output_summary && (
                      <details>
                        <summary>{tr("routines.detail.output")}</summary>
                        <pre>{run.output_summary.slice(-4000)}</pre>
                      </details>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )
        ) : routine.lastRun ? (
          <p className="routineMuted">
            {formatTime(routine.lastRun.at)} · {resultLabel(routine, tr)}
          </p>
        ) : (
          <p className="routineMuted">{tr("routines.detail.noRuns")}</p>
        )}
      </section>
    </aside>
  );
}
