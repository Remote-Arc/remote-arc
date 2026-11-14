import { useRef, useState } from "react";
import { canonicalErrorEnvelope } from "../../../../../packages/protocol/src/error-codes.js";
import { useI18n } from "../use-i18n.js";

export type DecisionChoice = "retry_now" | "skip_run" | "turn_off";
export type TaskDecisionKind = "repair_failed" | "failure_streak" | "budget_stop" | "blocked";

/** The decision a held routine waits for, as the Relay stores it in the Task state. */
export type TaskDecision = {
  id: string;
  kind: TaskDecisionKind;
  reason: string;
  evidence?: string;
  options: DecisionChoice[];
  created_at: string;
  timeout_at?: string;
  on_timeout?: "skip_run";
};

const KINDS: readonly TaskDecisionKind[] = [
  "repair_failed",
  "failure_streak",
  "budget_stop",
  "blocked",
];

/** Reads a pending decision from a Task; anything malformed counts as none. */
export function taskDecision(task: {
  status: string;
  state_json: string | null;
}): TaskDecision | null {
  if (task.status !== "paused" || !task.state_json) return null;
  try {
    const decision = (JSON.parse(task.state_json) as { decision?: Partial<TaskDecision> }).decision;
    if (
      !decision ||
      typeof decision.id !== "string" ||
      !KINDS.includes(decision.kind as TaskDecisionKind) ||
      typeof decision.reason !== "string" ||
      !Array.isArray(decision.options)
    )
      return null;
    return decision as TaskDecision;
  } catch {
    return null;
  }
}

/** Settles a held routine's decision through the Dashboard API. */
export function useTaskDecision<T extends { id: string }>(onSettled: (automation: T) => void) {
  const { tr } = useI18n();
  const pending = useRef(false);
  const [busy, setBusy] = useState<string | null>(null),
    [failure, setFailure] = useState<{ taskId: string; message: string } | null>(null);

  async function decide(task: T, decision: TaskDecision, choice: "retry_now" | "skip_run") {
    if (pending.current) return;
    pending.current = true;
    setBusy(task.id);
    setFailure(null);
    try {
      const response = await fetch(
        "/api/automations/" + encodeURIComponent(task.id) + "/" + choice,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ decision_id: decision.id }),
        },
      );
      const value = (await response
        .json()
        .then(canonicalErrorEnvelope)
        .catch(() => ({}))) as { automation?: T; error?: string };
      if (!response.ok || !value.automation || value.automation.id !== task.id)
        throw new Error(value.error || tr("tasks.taskDecision.couldNotSave"));
      onSettled(value.automation);
    } catch (error) {
      setFailure({
        taskId: task.id,
        message: error instanceof Error ? error.message : tr("tasks.taskDecision.couldNotSave"),
      });
    } finally {
      pending.current = false;
      setBusy(null);
    }
  }

  /** The last failed decision's message, for the Task it belongs to. */
  const errorFor = (taskId: string) => (failure?.taskId === taskId ? failure.message : null);
  return { busy, errorFor, decide };
}
