import type { Translate } from "../../locales/locale-catalog.js";
import { taskDecision } from "../../hooks/tasks/use-task-decision.js";
import { canonicalErrorEnvelope } from "../../../../../packages/protocol/src/error-codes.js";
import { WorkspaceLoading } from "../../components/workspace-loading.js";
import React, { useEffect, useRef, useState } from "react";
import { useI18n } from "../../hooks/use-i18n.js";
import type { PlannedProgress } from "./planned-goal-view.js";
const PlannedGoalProgress = React.lazy(() =>
  import("./planned-goal-view.js").then((module) => ({ default: module.PlannedGoalProgress })),
);

type Task = {
  id: string;
  status: string;
  state_json: string | null;
  created_at: string;
  updated_at?: string;
  last_run_at: string | null;
  expires_at: string | null;
  interval_seconds: number;
  last_error: string | null;
  kind?: string;
  next_run_at?: string | null;
  goal_json?: string | null;
  action_json?: string;
};
type Progress = {
  planned?: PlannedProgress;
  phase?: string;
  process_id?: string;
  agent?: {
    iteration?: number;
    last_decision_summary?: string;
    completion_evidence?: string;
    observation?: string;
  };
};
type Run = {
  id: string;
  attempt: number;
  status: string;
  exit_code: number | null;
  output_summary: string | null;
  error: string | null;
  started_at: string;
};

export function taskProgress(task: Pick<Task, "state_json">): Progress {
  try {
    return (JSON.parse(task.state_json || "{}") || {}) as Progress;
  } catch {
    return {};
  }
}

// A saved plan may be incomplete while a background goal is being initialized.
export function isPlannedProgress(value: unknown): value is PlannedProgress {
  if (!value || typeof value !== "object") return false;
  const p = value as Partial<PlannedProgress>;
  const plan = p.plan;
  return (
    typeof p.started_at === "string" &&
    !!plan &&
    typeof plan === "object" &&
    !!plan.time_policy &&
    typeof plan.time_policy === "object" &&
    Array.isArray(plan.phases) &&
    plan.phases.every(
      (phase) => phase && typeof phase.id === "string" && typeof phase.objective === "string",
    ) &&
    Array.isArray(p.outcomes) &&
    p.outcomes.every(
      (item) => item && typeof item.id === "string" && typeof item.outcome === "string",
    ) &&
    Array.isArray(p.checks) &&
    p.checks.every((item) => item && typeof item.name === "string") &&
    Array.isArray(p.rejected) &&
    p.rejected.every((item) => item && typeof item.evidence === "string")
  );
}

export function taskNeedsAgent(task: Pick<Task, "state_json" | "status">) {
  return (
    task.status === "waiting_for_event" &&
    ["awaiting_agent", "needs_reasoning"].includes(taskProgress(task).phase || "")
  );
}

export function taskNeedsAttention(task: Pick<Task, "state_json" | "status">) {
  return (
    taskNeedsAgent(task) ||
    taskDecision(task) !== null ||
    ["waiting_for_device", "failed", "expired"].includes(task.status)
  );
}

export function taskActivity(
  task: Pick<Task, "status" | "state_json" | "kind" | "next_run_at">,
  tr: Translate,
) {
  if (task.status === "completed") return tr("tasks.dashboardTaskView.completedViewRunHistory");
  if (task.status === "failed") return tr("tasks.dashboardTaskView.executionFailedInspectTheError");
  if (task.status === "cancelled")
    return tr("tasks.dashboardTaskView.cancelledOrchestrationStopped");
  if (task.status === "expired")
    return tr("tasks.dashboardTaskView.timeLimitReachedInspectTheOutcome");
  if (taskDecision(task)) return tr("tasks.dashboardTaskView.waitingForYourDecision");
  if (task.status === "paused") return tr("tasks.dashboardTaskView.pausedResumeWhenReady");
  if (task.status === "waiting_for_device")
    return tr("tasks.dashboardTaskView.waitingForTheComputerToReconnect");
  if (taskNeedsAgent(task)) return tr("tasks.dashboardTaskView.waitingForAnAiDecisionIn");
  if (task.status === "waiting_for_event")
    return tr("tasks.dashboardTaskView.waitingForAMatchingWebhook");
  const progress = taskProgress(task);
  if (progress.planned?.finalizing)
    return tr("tasks.dashboardTaskView.finalizingAndCheckingTheOutcome");
  if (["agent_verify_running", "goal_running"].includes(progress.phase || ""))
    return tr("tasks.dashboardTaskView.verifyingTheResult");
  if (
    ["agent_process_running", "step_running", "planned_process_running"].includes(
      progress.phase || "",
    ) ||
    progress.process_id
  )
    return tr("tasks.dashboardTaskView.savedCommandIsRunning");
  if (task.status === "running") return tr("tasks.dashboardTaskView.workingThroughTheNextStep");
  if (task.next_run_at && Date.parse(task.next_run_at) > Date.now())
    return tr("tasks.dashboardTaskView.waitingForTheNextScheduledRun");
  return tr("tasks.dashboardTaskView.queuedStartsWhenTheDeviceIs");
}

export function TaskResults({
  task,
  referenceControl,
  reveal = false,
}: {
  task: Task;
  referenceControl?: React.ReactNode;
  reveal?: boolean;
}) {
  const { tr, locale } = useI18n();
  const linked = new URLSearchParams(location.search).get("task") === task.id;
  const [open, setOpen] = useState(linked);
  const details = useRef<HTMLDetailsElement>(null);
  const [runs, setRuns] = useState<Run[] | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const progress = taskProgress(task);
  const planned = isPlannedProgress(progress.planned) ? progress.planned : null;
  useEffect(() => {
    if (!linked && !reveal) return;
    setOpen(true);
    const frame = requestAnimationFrame(() => details.current?.scrollIntoView({ block: "start" }));
    return () => cancelAnimationFrame(frame);
  }, [linked, reveal]);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    let fetching = false;
    async function load() {
      if (fetching) return;
      fetching = true;
      try {
        const response = await fetch("/api/automations/" + encodeURIComponent(task.id), {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Unavailable");
        const data = (await response.json().then(canonicalErrorEnvelope)) as { runs?: Run[] };
        if (!controller.signal.aborted) {
          setRuns(Array.isArray(data.runs) ? data.runs.slice(0, 10) : []);
          setError(false);
        }
      } catch {
        if (!controller.signal.aborted) setError(true);
      } finally {
        fetching = false;
      }
    }
    void load();
    const timer = window.setInterval(() => void load(), 15_000);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [open, task.id, task.updated_at, retry]);

  const timestamp = (value: string | null) =>
    value ? new Date(value).toLocaleString(locale === "zh" ? "zh-CN" : "en-US") : "—";
  const phaseLabel = taskActivity(task, tr);
  let instructions: {
    objective?: string;
    success_criteria?: string;
    controller?: string;
    steps?: { command?: string; cwd?: string; type?: string }[];
  } = {};
  try {
    instructions =
      task.goal_json && JSON.parse(task.goal_json)?.type === "agent_goal"
        ? JSON.parse(task.goal_json)
        : JSON.parse(task.action_json || "{}");
  } catch {
    /* Invalid legacy record remains visible through status/error. */
  }
  const chatReference = (
    <div className="taskChatReference">
      <strong>{tr("tasks.dashboardTaskView.referenceThisSavedTask")}</strong>
      {referenceControl}
      <code>{task.id}</code>
      <p>{tr("tasks.dashboardTaskView.useAClientConnectedToThe")}</p>
    </div>
  );

  return (
    <details
      ref={details}
      open={open}
      className="automationDetails"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>
        {tr("tasks.dashboardTaskView.progressResults")}
        <span aria-hidden="true">›</span>
      </summary>
      {open && (
        <div className="taskResultsBody">
          {!["completed", "failed", "cancelled", "expired"].includes(task.status) && (
            <div className="taskProgressPanel">
              <strong>{phaseLabel}</strong>
              {progress.agent && (
                <span>
                  {tr("tasks.dashboardTaskView.planningTurn")} {progress.agent.iteration || 0}
                </span>
              )}
              {progress.agent?.last_decision_summary && (
                <p>{progress.agent.last_decision_summary}</p>
              )}
              {taskNeedsAgent(task) && (
                <p>{tr("tasks.dashboardTaskView.theSourceAiMustReadThe")}</p>
              )}
            </div>
          )}
          {taskNeedsAgent(task) && chatReference}
          {progress.agent?.completion_evidence && (
            <div className="taskEvidence">
              <strong>{tr("tasks.dashboardTaskView.completionEvidence")}</strong>
              <p>{progress.agent.completion_evidence}</p>
            </div>
          )}
          {planned && (
            <React.Suspense
              fallback={
                <WorkspaceLoading
                  label={tr("tasks.dashboardTaskView.loadingSavedPlan")}
                  variant="rows"
                />
              }
            >
              <PlannedGoalProgress value={planned} expiresAt={task.expires_at} />
            </React.Suspense>
          )}
          {progress.planned && !planned && (
            <p role="status">{tr("tasks.dashboardTaskView.planDetailsAreStillSyncingThe")}</p>
          )}
          {task.last_error && <p className="automationLastError">{task.last_error}</p>}
          <div className="taskRunHistory" aria-busy={open && runs === null && !error}>
            <h3>{tr("tasks.dashboardTaskView.recentRuns")}</h3>
            {error && (
              <p role="status">
                {tr("tasks.dashboardTaskView.runHistoryCouldNotBeLoaded")}{" "}
                <button className="ghostButton" onClick={() => setRetry((value) => value + 1)}>
                  {tr("tasks.dashboardTaskView.retry")}
                </button>
              </p>
            )}
            {open && runs === null && !error && (
              <WorkspaceLoading
                label={tr("tasks.dashboardTaskView.loadingResults")}
                variant="rows"
              />
            )}
            {runs?.length === 0 && <p>{tr("tasks.dashboardTaskView.noRunHasStartedSavingA")}</p>}
            {runs?.map((run) => (
              <details className="taskRun" key={run.id}>
                <summary>
                  <strong>
                    {tr("tasks.dashboardTaskView.run")} {run.attempt}
                  </strong>
                  <span>
                    {run.status === "completed"
                      ? tr("tasks.dashboardTaskView.completed")
                      : run.status === "running"
                        ? tr("tasks.dashboardTaskView.running")
                        : run.status === "failed"
                          ? tr("tasks.dashboardTaskView.failed")
                          : run.status === "cancelled"
                            ? tr("tasks.dashboardTaskView.cancelled")
                            : run.status}
                  </span>
                  <time dateTime={run.started_at}>{timestamp(run.started_at)}</time>
                  {run.exit_code !== null && (
                    <span>
                      {tr("tasks.dashboardTaskView.exit")} {run.exit_code}
                    </span>
                  )}
                </summary>
                {run.error && <p className="automationLastError">{run.error}</p>}
                {run.output_summary ? (
                  <pre>{run.output_summary.slice(0, 12000)}</pre>
                ) : (
                  <p>{tr("tasks.dashboardTaskView.noOutputRecordedYet")}</p>
                )}
              </details>
            ))}
          </div>
          <details className="taskTechnicalDetails">
            <summary>{tr("tasks.dashboardTaskView.timingChatReference")}</summary>
            <div className="automationDetailGrid">
              <div>
                <span>{tr("tasks.dashboardTaskView.created")}</span>
                <strong>{timestamp(task.created_at)}</strong>
              </div>
              <div>
                <span>{tr("tasks.dashboardTaskView.lastRun")}</span>
                <strong>{timestamp(task.last_run_at)}</strong>
              </div>
              <div>
                <span>{tr("tasks.dashboardTaskView.expires")}</span>
                <strong>
                  {task.expires_at
                    ? timestamp(task.expires_at)
                    : tr("tasks.dashboardTaskView.noExpiry")}
                </strong>
              </div>
              <div>
                <span>{tr("tasks.dashboardTaskView.checkInterval")}</span>
                <strong>
                  {Math.round(task.interval_seconds / 60)} {tr("tasks.dashboardTaskView.min")}
                </strong>
              </div>
            </div>
            {!taskNeedsAgent(task) && chatReference}
            <div className="taskSavedInstructions">
              <strong>{tr("tasks.dashboardTaskView.savedInstructions")}</strong>
              {instructions.objective ? (
                <>
                  <p>{instructions.objective}</p>
                  <p>
                    {tr("tasks.dashboardTaskView.successCriteria")}: {instructions.success_criteria}
                  </p>
                  <p>
                    {tr("tasks.dashboardTaskView.decisionExecutor")}:{" "}
                    {instructions.controller === "source"
                      ? tr("tasks.dashboardTaskView.connectedAiClient")
                      : tr("tasks.dashboardTaskView.hostedAi")}
                  </p>
                </>
              ) : (
                instructions.steps?.map((step, index) =>
                  step.command ? (
                    <div key={index}>
                      <p>
                        {tr("tasks.dashboardTaskView.shellCommandExecutedVerbatim")}
                        {step.cwd ? ` · ${step.cwd}` : ""}
                      </p>
                      <pre>{step.command}</pre>
                    </div>
                  ) : (
                    <p key={index}>{step.type}</p>
                  ),
                )
              )}
            </div>
          </details>
          <p className="automationDetailNote">
            <a href="/docs/long-running-work">
              {tr("tasks.dashboardTaskView.understandTaskRecoveryAndCompletionChecks")} →
            </a>
          </p>
        </div>
      )}
    </details>
  );
}
