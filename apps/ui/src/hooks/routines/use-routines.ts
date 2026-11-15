import { useCallback, useEffect, useRef, useState } from "react";
import { canonicalErrorEnvelope } from "../../../../../packages/protocol/src/error-codes.js";
import { arcRequest } from "../arc/use-arc-chat.js";
import { taskDecision, type TaskDecision } from "../tasks/use-task-decision.js";
import { taskRepairNeedsArc } from "../tasks/task-state.js";
import { isVisibleInWorkspace } from "../../lib/dashboard-workspaces.js";
import type { ArcWork } from "../../features/arc/workspace/arc-task-card.js";

/** A Task saved from a connected AI, as GET /api/automations lists it. */
export type SavedTask = {
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
  last_run_status?: string | null;
  last_run_exit_code?: number | null;
  last_run_finished_at?: string | null;
};

export type RoutineSchedule =
  | { type: "interval"; minutes: number }
  | { type: "daily"; time: string; timezone?: string; weekdays?: number[] }
  | { type: "once"; at?: string | null }
  | { type: "event"; source: string; event?: string };

export type RoutineNeed = "decision" | "offline" | "agent" | "failed";
export type RoutineGroup = "needs" | "running" | "paused" | "finished" | "scheduled";
export type RoutineResult = "passed" | "failed" | "running" | "none";

/** One row of the routines page, whether Arc made it or an AI saved it. */
export type Routine = {
  id: string;
  name: string;
  source: "ai" | "arc";
  status: string;
  deviceId: string | null;
  schedule: RoutineSchedule;
  nextRunAt: string | null;
  lastRun: { result: RoutineResult; at: string | null; exitCode: number | null } | null;
  need: RoutineNeed | null;
  group: RoutineGroup;
  decision: TaskDecision | null;
  repairNeedsArc: boolean;
  error: string | null;
  saved?: SavedTask;
  work?: ArcWork;
};

export type RoutineRun = {
  id: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  exit_code: number | null;
  error: string | null;
  output_summary: string | null;
};

const TERMINAL = ["completed", "failed", "cancelled", "expired"];
const json = (value: string | null) => {
  try {
    return JSON.parse(value || "null");
  } catch {
    return null;
  }
};

function savedSchedule(task: SavedTask): RoutineSchedule {
  const trigger = json(task.trigger_json) as {
    type?: string;
    every_seconds?: number;
    at?: string;
    source?: string;
    event?: string;
  } | null;
  if (trigger?.type === "interval")
    return { type: "interval", minutes: Math.round((trigger.every_seconds || 0) / 60) };
  if (trigger?.type === "webhook")
    return { type: "event", source: trigger.source || "generic", event: trigger.event };
  if (trigger?.type === "at") return { type: "once", at: trigger.at };
  return { type: "once", at: null };
}

function result(status: string | null | undefined): RoutineResult {
  if (!status) return "none";
  if (["completed", "succeeded"].includes(status)) return "passed";
  if (["running", "queued", "thinking", "working"].includes(status)) return "running";
  return "failed";
}

function group(status: string, need: RoutineNeed | null): RoutineGroup {
  if (need) return "needs";
  if (TERMINAL.includes(status)) return "finished";
  if (status === "paused") return "paused";
  if (status === "running") return "running";
  return "scheduled";
}

/** A saved Task as a routine row. */
export function routineFromSaved(task: SavedTask): Routine {
  const decision = taskDecision(task);
  const phase = (json(task.state_json) as { phase?: string } | null)?.phase || "";
  const need: RoutineNeed | null = decision
    ? "decision"
    : task.status === "waiting_for_device"
      ? "offline"
      : task.status === "waiting_for_event" && ["awaiting_agent", "needs_reasoning"].includes(phase)
        ? "agent"
        : ["failed", "expired"].includes(task.status)
          ? "failed"
          : null;
  return {
    id: task.id,
    name: task.name,
    source: "ai",
    status: task.status,
    deviceId: task.device_id,
    schedule: savedSchedule(task),
    nextRunAt: task.next_run_at,
    lastRun: task.last_run_status
      ? {
          result: result(task.last_run_status),
          at: task.last_run_finished_at ?? task.last_run_at,
          exitCode: task.last_run_exit_code ?? null,
        }
      : null,
    need,
    group: group(task.status, need),
    decision,
    repairNeedsArc: Boolean(taskRepairNeedsArc(task)),
    error: task.last_error,
    saved: task,
  };
}

/** An Arc task as a routine row. */
export function routineFromWork(work: ArcWork): Routine {
  const failed = Boolean(work.latestRun && ["failed", "unknown"].includes(work.latestRun.status));
  const need: RoutineNeed | null = ["failed", "unknown"].includes(work.status)
    ? "failed"
    : work.status === "paused" && failed
      ? "failed"
      : null;
  const schedule: RoutineSchedule =
    work.schedule.type === "interval"
      ? { type: "interval", minutes: work.schedule.everyMinutes || 0 }
      : work.schedule.type === "daily"
        ? {
            type: "daily",
            time: work.schedule.time || "",
            timezone: work.schedule.timezone,
            weekdays: work.schedule.weekdays,
          }
        : { type: "once", at: null };
  return {
    id: work.id,
    name: work.name,
    source: "arc",
    status: work.status,
    deviceId: null,
    schedule,
    nextRunAt: work.nextRunAt,
    lastRun: work.latestRun
      ? { result: result(work.latestRun.status), at: work.latestRun.createdAt, exitCode: null }
      : null,
    need,
    group: group(work.status, need),
    decision: null,
    repairNeedsArc: false,
    error: work.error,
    work,
  };
}

/** Needs first, then running, scheduled, paused and finished; newest name order within. */
const ORDER: RoutineGroup[] = ["needs", "running", "scheduled", "paused", "finished"];
export const sortRoutines = (items: Routine[]) =>
  [...items].sort((a, b) => ORDER.indexOf(a.group) - ORDER.indexOf(b.group));

/**
 * Loads every routine (Arc's and those saved from an AI) and acts on them.
 * `focus` is a routine a link points to: one older than the list's limit is
 * loaded on its own, and one that does not exist is reported as `missing`.
 */
export function useRoutines({
  arcAvailable,
  focus = null,
}: {
  arcAvailable: boolean;
  focus?: string | null;
}) {
  const [listed, setRoutines] = useState<Routine[] | null>(null),
    [linked, setLinked] = useState<Routine | null>(null),
    [missing, setMissing] = useState<string | null>(null),
    [loadFailed, setLoadFailed] = useState(false),
    [revision, setRevision] = useState(0),
    [busy, setBusy] = useState<string | null>(null),
    [failure, setFailure] = useState<{ id: string; message: string } | null>(null);
  const pending = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      try {
        const [saved, arc] = await Promise.all([
          fetch("/api/automations", { signal: controller.signal }).then(async (response) => {
            if (!response.ok) throw new Error("unavailable");
            return (
              (await response.json().then(canonicalErrorEnvelope)) as {
                automations: SavedTask[];
              }
            ).automations;
          }),
          arcAvailable
            ? // A failed refresh keeps the last list and says so; it never drops Arc's rows.
              arcRequest<{ work: ArcWork[] }>("work", undefined, controller.signal).then(
                (value) => value.work,
              )
            : Promise.resolve([] as ArcWork[]),
        ]);
        if (controller.signal.aborted) return;
        setRoutines(
          sortRoutines([
            ...arc.map(routineFromWork),
            ...saved
              .filter((task) => isVisibleInWorkspace(task, "automations"))
              .map(routineFromSaved),
          ]),
        );
        setLoadFailed(false);
      } catch {
        if (!controller.signal.aborted) setLoadFailed(true);
      }
      if (!controller.signal.aborted) timer = setTimeout(load, 15000);
    };
    void load();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [arcAvailable, revision]);

  // The list refreshes every 15 seconds; the link is looked up again only when
  // it changes, the list first loads, or it appears in or leaves the list.
  const loaded = listed !== null,
    found = Boolean(focus && listed?.some((routine) => routine.id === focus));
  useEffect(() => {
    setLinked(null);
    setMissing(null);
    if (!focus || !loaded || found) return;
    const controller = new AbortController();
    fetch("/api/automations/" + encodeURIComponent(focus), { signal: controller.signal })
      .then(async (response) => {
        if (response.status === 404) return setMissing(focus);
        if (!response.ok) return;
        const value = (await response.json().then(canonicalErrorEnvelope)) as {
          automation?: SavedTask;
        };
        if (!controller.signal.aborted && value.automation)
          setLinked(routineFromSaved(value.automation));
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [focus, loaded, found, revision]);
  const routines =
    listed && linked && !listed.some((routine) => routine.id === linked.id)
      ? [...listed, linked]
      : listed;

  const act = useCallback(
    async (routine: Routine, action: "pause" | "resume" | "cancel" | "run_now") => {
      if (pending.current) return false;
      pending.current = true;
      setBusy(routine.id);
      setFailure(null);
      try {
        const response = await fetch(
          "/api/automations/" + encodeURIComponent(routine.id) + "/" + action,
          { method: "POST" },
        );
        const value = (await response
          .json()
          .then(canonicalErrorEnvelope)
          .catch(() => ({}))) as { error?: string };
        if (!response.ok) throw new Error(value.error || String(response.status));
        setRevision((n) => n + 1);
        return true;
      } catch (error) {
        setFailure({
          id: routine.id,
          message: error instanceof Error ? error.message : String(error),
        });
        return false;
      } finally {
        pending.current = false;
        setBusy(null);
      }
    },
    [],
  );

  return {
    routines,
    /** The linked routine's ID when it does not exist. */
    missing,
    loadFailed,
    reload: () => setRevision((n) => n + 1),
    busy,
    failureFor: (id: string) => (failure?.id === id ? failure.message : null),
    act,
  };
}

/** The runs of one saved routine, newest first. */
export function useRoutineRuns(routine: Routine | null) {
  const [runs, setRuns] = useState<RoutineRun[] | null>(null);
  const id = routine?.saved ? routine.id : null;
  const updated = routine?.saved?.updated_at;
  useEffect(() => {
    setRuns(null);
    if (!id) return;
    const controller = new AbortController();
    fetch("/api/automations/" + encodeURIComponent(id), { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : { runs: [] }))
      .then((value: { runs?: RoutineRun[] }) => {
        if (!controller.signal.aborted) setRuns(value.runs || []);
      })
      .catch(() => {
        if (!controller.signal.aborted) setRuns([]);
      });
    return () => controller.abort();
  }, [id, updated]);
  return runs;
}
