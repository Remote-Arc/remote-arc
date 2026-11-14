import { canonicalErrorEnvelope } from "../../../../../packages/protocol/src/error-codes.js";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "../../hooks/use-i18n.js";
import { ProductIcon } from "../../components/product-icon.js";
import { WorkspaceLoading } from "../../components/workspace-loading.js";
import { TaskResults, taskActivity, taskNeedsAttention } from "./dashboard-task-view.js";
import { isVisibleInWorkspace } from "../../lib/dashboard-workspaces.js";
import { taskDecision, useTaskDecision } from "../../hooks/tasks/use-task-decision.js";
import { TaskDecisionCard } from "./task-decision-card.js";
import "../../styles/tasks/connect-tasks.css";
import "../../styles/tasks/task-decision.css";

type Task = {
  id: string;
  name: string;
  kind: string;
  status: string;
  device_id: string | null;
  goal_json: string | null;
  action_json: string;
  state_json: string | null;
  trigger_json: string | null;
  created_at: string;
  updated_at: string;
  last_run_at: string | null;
  next_run_at: string | null;
  expires_at: string | null;
  interval_seconds: number;
  run_count: number;
  run_started_count?: number;
  last_error: string | null;
};
type Collection = { automations: Task[]; scheduler?: { state: string; overdue_count: number } };
const terminal = (status: string) =>
  ["completed", "failed", "cancelled", "expired"].includes(status);

export function ConnectTasks({
  devices,
  onConnectAI,
}: {
  devices: { id: string; name: string }[];
  onConnectAI: () => void;
}) {
  const { tr, locale } = useI18n();
  const [data, setData] = useState<Collection | null>(null),
    [error, setError] = useState(false),
    [revision, setRevision] = useState(0);
  const [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all"),
    [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null),
    [cancelTask, setCancelTask] = useState<Task | null>(null),
    [copyState, setCopyState] = useState<string | null>(null);
  const [selected, setSelected] = useState(() => new URLSearchParams(location.search).get("task"));
  const actionPending = useRef(false),
    mounted = useRef(false),
    dialog = useRef<HTMLDialogElement>(null),
    cancelTrigger = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    const sync = () => setSelected(new URLSearchParams(location.search).get("task"));
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      try {
        const response = await fetch("/api/automations", { signal: controller.signal });
        if (!response.ok) throw new Error("unavailable");
        const value = (await response.json().then(canonicalErrorEnvelope)) as Collection;
        if (!Array.isArray(value.automations)) throw new Error("invalid response");
        if (selected && !value.automations.some((task) => task.id === selected)) {
          const detail = await fetch("/api/automations/" + encodeURIComponent(selected), {
            signal: controller.signal,
          });
          if (detail.ok) {
            const record = (await detail.json().then(canonicalErrorEnvelope)) as {
              automation?: Task;
            };
            if (record.automation) value.automations.push(record.automation);
          } else if (detail.status !== 404) throw new Error("task unavailable");
        }
        if (!controller.signal.aborted) {
          setData(value);
          setError(false);
        }
      } catch {
        if (!controller.signal.aborted) setError(true);
      }
      if (!controller.signal.aborted) timer = setTimeout(load, 15000);
    };
    void load();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [revision, selected]);
  useEffect(() => {
    if (cancelTask) {
      dialog.current?.showModal();
    } else if (dialog.current?.open) {
      dialog.current.close();
    }
  }, [cancelTask]);
  const closeCancel = () => {
    if (actionPending.current) return;
    setCancelTask(null);
    cancelTrigger.current?.focus();
  };
  async function manage(task: Task, action: "pause" | "resume" | "cancel") {
    if (actionPending.current) return;
    actionPending.current = true;
    setBusy(task.id);
    setActionError(null);
    try {
      const response = await fetch(
        "/api/automations/" + encodeURIComponent(task.id) + "/" + action,
        { method: "POST" },
      );
      const value = (await response
        .json()
        .then(canonicalErrorEnvelope)
        .catch(() => ({}))) as { automation?: Task; error?: string };
      if (!response.ok)
        throw new Error(value.error || tr("tasks.connectTasks.theTaskCouldNotBeUpdated"));
      if (!value.automation || value.automation.id !== task.id)
        throw new Error(tr("tasks.connectTasks.theUpdateCouldNotBeConfirmed"));
      if (mounted.current) {
        setData((current) =>
          current
            ? {
                ...current,
                automations: current.automations.map((item) =>
                  item.id === task.id ? value.automation! : item,
                ),
              }
            : current,
        );
        setCancelTask(null);
        setRevision((n) => n + 1);
        cancelTrigger.current?.focus();
      }
    } catch (failure) {
      if (mounted.current) {
        setActionError(
          failure instanceof Error
            ? failure.message
            : tr("tasks.connectTasks.refreshToCheckTheTaskBefore"),
        );
        setRevision((n) => n + 1);
      }
    } finally {
      actionPending.current = false;
      if (mounted.current) setBusy(null);
    }
  }
  const decisions = useTaskDecision<Task>((automation) => {
    if (!mounted.current) return;
    setData((current) =>
      current
        ? {
            ...current,
            automations: current.automations.map((item) =>
              item.id === automation.id ? automation : item,
            ),
          }
        : current,
    );
    setRevision((n) => n + 1);
  });
  function select(task: Task) {
    setSelected(task.id);
    setQuery("");
    setFilter("all");
    const url = new URL(location.href);
    url.searchParams.set("task", task.id);
    history.replaceState(history.state, "", url);
  }
  function clearSelection() {
    setSelected(null);
    const url = new URL(location.href);
    url.searchParams.delete("task");
    history.replaceState(history.state, "", url);
  }
  async function copy(task: Task) {
    try {
      await navigator.clipboard.writeText(
        tr("tasks.connectTasks.continueThisRemoteArcTask") + task.id,
      );
      if (mounted.current) setCopyState(task.id);
    } catch {
      if (mounted.current) {
        setCopyState("manual:" + task.id);
        setActionError(tr("tasks.connectTasks.copyIsUnavailableSelectTheTask"));
      }
    }
  }
  const tasks = (data?.automations || []).filter((task) =>
    isVisibleInWorkspace(task, "automations"),
  );
  const selectedTask = selected ? tasks.find((task) => task.id === selected) : undefined;
  const shown = tasks.filter(
    (task) =>
      (!selected || task.id === selected) &&
      (filter === "all" ||
        (filter === "active" && !terminal(task.status) && task.status !== "paused") ||
        (filter === "attention" && taskNeedsAttention(task)) ||
        (filter === "finished" && terminal(task.status))) &&
      [task.name, task.id, devices.find((device) => device.id === task.device_id)?.name].some(
        (value) => value?.toLowerCase().includes(query.trim().toLowerCase()),
      ),
  );
  const time = (value: string | null) =>
    value
      ? new Date(value).toLocaleString(locale === "zh" ? "zh-CN" : "en-NZ", {
          dateStyle: "medium",
          timeStyle: "short",
        })
      : "—";
  const kind = (task: Task) => {
    try {
      if (JSON.parse(task.goal_json || "null")?.type === "agent_goal") return "Agent Goal";
    } catch {}
    return (
      (
        {
          long_task: tr("tasks.connectTasks.backgroundCommand"),
          schedule_watch: tr("tasks.connectTasks.scheduledCommand"),
          condition_watch: tr("tasks.connectTasks.eventWatch"),
          goal_loop: tr("tasks.connectTasks.verificationLoop"),
        } as Record<string, string>
      )[task.kind] || task.kind
    );
  };
  const status = (value: string) =>
    (
      ({
        waiting: tr("tasks.connectTasks.queued"),
        running: tr("tasks.connectTasks.running"),
        waiting_for_device: tr("tasks.connectTasks.waitingForComputer"),
        waiting_for_event: tr("tasks.connectTasks.waiting"),
        paused: tr("tasks.connectTasks.paused"),
        completed: tr("tasks.connectTasks.completed"),
        failed: tr("tasks.connectTasks.failed"),
        cancelled: tr("tasks.connectTasks.cancelled"),
        expired: tr("tasks.connectTasks.expired"),
      }) as Record<string, string>
    )[value] || value;
  return (
    <section className="connectTasks" aria-label={tr("tasks.connectTasks.connectTasks")}>
      <header className="overviewTopbar">
        <div>
          <span className="eyebrow">CONNECT</span>
          <h1>{tr("tasks.connectTasks.tasks")}</h1>
          <p>{tr("tasks.connectTasks.backgroundCommandsSchedulesAndSavedGoals")}</p>
        </div>
        <button type="button" className="ghostButton" onClick={() => setRevision((n) => n + 1)}>
          {tr("tasks.connectTasks.refreshTasks")}
        </button>
      </header>
      <aside className="connectTasksIntro">
        <ProductIcon name="tasks" />
        <div>
          <strong>{tr("tasks.connectTasks.createInYourConnectedAiChat")}</strong>
          <p>{tr("tasks.connectTasks.askYourAiToSaveA")}</p>
        </div>
        <button type="button" className="ghostButton" onClick={onConnectAI}>
          {tr("tasks.connectTasks.aiClients")}
          <ProductIcon name="arrowUpRight" size={14} />
        </button>
      </aside>
      {data?.scheduler && data.scheduler.state !== "healthy" && (
        <p className="connectTasksNotice" role="status">
          {tr("tasks.connectTasks.schedulingNeedsAttentionRefreshToCheck")}
        </p>
      )}
      {error && (
        <div className="connectTasksNotice" role="alert">
          <p>
            {data
              ? tr("tasks.connectTasks.couldNotRefreshTasksShowingThe")
              : tr("tasks.connectTasks.couldNotLoadTasksCheckYour")}
          </p>
          <button type="button" className="ghostButton" onClick={() => setRevision((n) => n + 1)}>
            {tr("tasks.connectTasks.retry")}
          </button>
        </div>
      )}
      {actionError && (
        <p className="connectTasksNotice" role="alert">
          {actionError}
        </p>
      )}
      {selected && (
        <div className="connectTasksSelection">
          <span>
            {tr("tasks.connectTasks.openedFromATaskLink")}
            {selectedTask ? " · " + selectedTask.name : ""}
          </span>
          <button type="button" className="textButton" onClick={clearSelection}>
            {tr("tasks.connectTasks.showAllTasks")}
          </button>
        </div>
      )}
      <div className="connectTasksToolbar">
        <label>
          <ProductIcon name="search" size={16} />
          <input
            type="search"
            aria-label={tr("tasks.connectTasks.searchConnectTasks")}
            placeholder={tr("tasks.connectTasks.searchByNameComputerOrTask")}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              if (selected) clearSelection();
            }}
          />
        </label>
        <div role="group" aria-label={tr("tasks.connectTasks.filterTasks")}>
          {[
            ["all", tr("tasks.connectTasks.all")],
            ["active", tr("tasks.connectTasks.active")],
            ["attention", tr("tasks.connectTasks.attention")],
            ["finished", tr("tasks.connectTasks.finished")],
          ].map(([id, label]) => (
            <button
              type="button"
              key={id}
              aria-pressed={filter === id}
              onClick={() => {
                setFilter(id!);
                if (selected) clearSelection();
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {!data && !error && (
        <WorkspaceLoading label={tr("tasks.connectTasks.loadingConnectTasks")} variant="rows" />
      )}
      {data && shown.length === 0 && (
        <div className="connectTasksEmpty" role="status">
          <ProductIcon name="tasks" size={25} />
          <h2>
            {selected
              ? tr("tasks.connectTasks.thisConnectTaskWasNotFound")
              : query || filter !== "all"
                ? tr("tasks.connectTasks.noMatchingTasks")
                : tr("tasks.connectTasks.noConnectTasksYet")}
          </h2>
          <p>
            {selected
              ? tr("tasks.connectTasks.checkTheTaskIdAndAccount")
              : tr("tasks.connectTasks.tasksSavedThroughYourConnectedAi")}
          </p>
        </div>
      )}
      <div className="connectTaskList">
        {shown.map((task) => (
          <article className="connectTaskCard" key={task.id} data-task-id={task.id}>
            <header>
              <div>
                <span className="connectTaskKind">
                  {kind(task)} ·{" "}
                  {task.device_id
                    ? devices.find((device) => device.id === task.device_id)?.name ||
                      tr("tasks.connectTasks.computer")
                    : tr("tasks.connectTasks.cloudAction")}
                </span>
                <h2>
                  <button type="button" onClick={() => select(task)}>
                    {task.name}
                  </button>
                </h2>
              </div>
              <span className={"connectTaskStatus " + task.status}>{status(task.status)}</span>
            </header>
            <p className="connectTaskActivity">{taskActivity(task, tr)}</p>
            {taskDecision(task) ? (
              <TaskDecisionCard
                decision={taskDecision(task)!}
                busy={decisions.busy === task.id}
                disabled={busy !== null || decisions.busy !== null}
                error={decisions.errorFor(task.id)}
                formatTime={time}
                onDecide={(choice) => void decisions.decide(task, taskDecision(task)!, choice)}
                onTurnOff={(trigger) => {
                  cancelTrigger.current = trigger;
                  setCancelTask(task);
                }}
              />
            ) : (
              task.status === "paused" && (
                <p className="connectTaskActivity">
                  {tr("tasks.connectTasks.futureStepsArePausedACommand")}
                </p>
              )
            )}
            <dl>
              <div>
                <dt>{tr("tasks.connectTasks.runsStarted")}</dt>
                <dd>{task.run_started_count ?? task.run_count}</dd>
              </div>
              <div>
                <dt>{tr("tasks.connectTasks.lastRun")}</dt>
                <dd>{time(task.last_run_at)}</dd>
              </div>
              <div>
                <dt>{tr("tasks.connectTasks.nextRun")}</dt>
                <dd>{time(task.next_run_at)}</dd>
              </div>
            </dl>
            {task.last_error && !taskDecision(task) && (
              <p className="automationLastError">{task.last_error}</p>
            )}
            <div className="connectTaskActions">
              <button type="button" className="ghostButton" onClick={() => select(task)}>
                {tr("tasks.connectTasks.viewResults")}
              </button>
              <button type="button" className="textButton" onClick={() => void copy(task)}>
                {copyState === task.id
                  ? tr("tasks.connectTasks.referenceCopied")
                  : tr("tasks.connectTasks.copyTaskReference")}
              </button>
              <span className="connectTaskActionSpacer" />
              {!terminal(task.status) && (
                <>
                  {!taskDecision(task) && (
                    <button
                      type="button"
                      className="ghostButton"
                      disabled={busy !== null}
                      onClick={() =>
                        void manage(task, task.status === "paused" ? "resume" : "pause")
                      }
                    >
                      {busy === task.id
                        ? tr("tasks.connectTasks.updating")
                        : task.status === "paused"
                          ? tr("tasks.connectTasks.resume")
                          : tr("tasks.connectTasks.pause")}
                    </button>
                  )}
                  <button
                    type="button"
                    className="ghostButton"
                    disabled={busy !== null}
                    onClick={(event) => {
                      cancelTrigger.current = event.currentTarget;
                      setCancelTask(task);
                    }}
                  >
                    {tr("tasks.connectTasks.cancelTask")}
                  </button>
                </>
              )}
            </div>
            {copyState === "manual:" + task.id && (
              <p className="connectTaskManualCopy">
                <code>{task.id}</code>
              </p>
            )}
            <TaskResults task={task} reveal={selected === task.id} />
          </article>
        ))}
      </div>
      <dialog
        ref={dialog}
        className="connectTaskCancelDialog"
        aria-labelledby="connect-task-cancel-title"
        onCancel={(event) => {
          event.preventDefault();
          closeCancel();
        }}
      >
        <h2 id="connect-task-cancel-title">{tr("tasks.connectTasks.cancelThisTask")}</h2>
        <p>{cancelTask?.name}</p>
        <p>{tr("tasks.connectTasks.futureRunsStopRemoteArcAlso")}</p>
        <div>
          <button
            type="button"
            className="ghostButton"
            disabled={busy !== null}
            onClick={closeCancel}
          >
            {tr("tasks.connectTasks.keepTask")}
          </button>
          <button
            type="button"
            className="primaryButton"
            disabled={busy !== null}
            onClick={() => {
              if (cancelTask) void manage(cancelTask, "cancel");
            }}
          >
            {busy
              ? tr("tasks.connectTasks.cancelling")
              : tr("tasks.connectTasks.confirmCancellation")}
          </button>
        </div>
        {actionError && <p role="alert">{actionError}</p>}
      </dialog>
    </section>
  );
}
