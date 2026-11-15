import type { Translate } from "../../locales/locale-catalog.js";
import type { Routine, RoutineGroup } from "../../hooks/routines/use-routines.js";

const WEEKDAYS = [
  "routines.labels.sun",
  "routines.labels.mon",
  "routines.labels.tue",
  "routines.labels.wed",
  "routines.labels.thu",
  "routines.labels.fri",
  "routines.labels.sat",
] as const;

/** When a routine runs, in a few words. */
export function scheduleLabel(routine: Routine, tr: Translate) {
  const schedule = routine.schedule;
  if (schedule.type === "interval") {
    const minutes = schedule.minutes;
    if (minutes === 1440) return tr("routines.labels.everyDay");
    if (minutes > 0 && minutes % 1440 === 0)
      return tr("routines.labels.everyDays", { n: minutes / 1440 });
    if (minutes > 0 && minutes % 60 === 0)
      return minutes === 60
        ? tr("routines.labels.everyHour")
        : tr("routines.labels.everyHours", { n: minutes / 60 });
    return tr("routines.labels.everyMinutes", { n: minutes });
  }
  if (schedule.type === "daily") {
    const days =
      schedule.weekdays && schedule.weekdays.length < 7
        ? schedule.weekdays.map((day) => (WEEKDAYS[day] ? tr(WEEKDAYS[day]) : "")).join(" ")
        : tr("routines.labels.everyDay");
    return days + " " + schedule.time;
  }
  if (schedule.type === "event")
    return schedule.source === "github"
      ? tr("routines.labels.githubEvent", { event: schedule.event || "" })
      : tr("routines.labels.webhookEvent");
  return tr("routines.labels.once");
}

/** What the last run showed. */
export function resultLabel(routine: Routine, tr: Translate) {
  if (routine.need === "decision") return tr("routines.labels.waitingForDecision");
  if (routine.need === "offline") return tr("routines.labels.computerOffline");
  if (routine.need === "agent") return tr("routines.labels.waitingForAi");
  if (!routine.lastRun) return tr("routines.labels.noRunsYet");
  if (routine.lastRun.result === "passed") return tr("routines.labels.passed");
  if (routine.lastRun.result === "running") return tr("routines.labels.running");
  return routine.lastRun.exitCode !== null
    ? tr("routines.labels.failedWithCode", { code: routine.lastRun.exitCode })
    : tr("routines.labels.failed");
}

/** passed | failed | warning | idle, for the result dot. */
export function resultTone(routine: Routine) {
  if (routine.need === "decision" || routine.need === "failed") return "failed";
  if (routine.need) return "warning";
  if (!routine.lastRun) return "idle";
  if (routine.lastRun.result === "passed") return "passed";
  if (routine.lastRun.result === "running") return "running";
  return "failed";
}

export const GROUP_LABELS = {
  all: "routines.labels.all",
  needs: "routines.labels.needsYou",
  running: "routines.labels.runningGroup",
  scheduled: "routines.labels.scheduled",
  paused: "routines.labels.paused",
  finished: "routines.labels.finished",
} as const satisfies Record<RoutineGroup | "all", string>;
