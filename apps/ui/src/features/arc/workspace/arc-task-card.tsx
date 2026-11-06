import type { Translate } from "../../../locales/locale-catalog.js";
import { ProductIcon as Icon } from "../../../components/product-icon.js";
import "../../../styles/arc/workspace/arc-task-card.css";
export type ArcWork = {
  id: string;
  name: string;
  kind: "task" | "routine";
  status: string;
  schedule: {
    type: string;
    time?: string;
    timezone?: string;
    everyMinutes?: number;
    weekdays?: number[];
  };
  nextRunAt: string | null;
  runCount: number;
  error: string | null;
  conversationId: string | null;
  originSessionId?: string;
  latestRun?: { id: string; status: string; error: string | null; createdAt: string } | null;
};
type Tr = Translate;
const weekdays = [
  "arc.workspace.arcTaskCard.weekday.sun",
  "arc.workspace.arcTaskCard.weekday.mon",
  "arc.workspace.arcTaskCard.weekday.tue",
  "arc.workspace.arcTaskCard.weekday.wed",
  "arc.workspace.arcTaskCard.weekday.thu",
  "arc.workspace.arcTaskCard.weekday.fri",
  "arc.workspace.arcTaskCard.weekday.sat",
] as const;
export function arcWorkSchedule(work: ArcWork, tr: Tr) {
  const schedule = work.schedule;
  if (schedule.type === "interval")
    return tr("arc.workspace.arcTaskCard.everyMinutes", { everyMinutes: schedule.everyMinutes });
  if (schedule.type !== "daily") return tr("arc.workspace.arcTaskCard.oneOffTask");
  const days =
    schedule.weekdays?.map((day) => (weekdays[day] ? tr(weekdays[day]) : "")).join(" / ") ||
    tr("arc.workspace.arcTaskCard.everyDay");
  return `${days} · ${schedule.time} · ${schedule.timezone}`;
}
export function ArcTaskCard({
  work,
  tr,
  currentSessionId,
  onOpen,
  onManage,
}: {
  work: ArcWork;
  tr: Tr;
  currentSessionId?: string;
  onOpen: (id: string) => void;
  onManage: (prompt: string, id?: string) => void;
}) {
  const current = work.conversationId === currentSessionId,
    latest = work.latestRun;
  const attention =
    ["failed", "unknown", "paused"].includes(work.status) ||
    Boolean(latest && ["failed", "unknown"].includes(latest.status));
  const status = attention
    ? tr("arc.workspace.arcTaskCard.needsAttention")
    : work.status === "waiting"
      ? tr("arc.workspace.arcTaskCard.scheduled")
      : work.status === "running"
        ? tr("arc.workspace.arcTaskCard.running")
        : work.status === "completed"
          ? tr("arc.workspace.arcTaskCard.finished")
          : work.status === "cancelled"
            ? tr("arc.workspace.arcTaskCard.cancelled")
            : work.status;
  const when = (date: string) =>
    new Date(date).toLocaleString(tr("arc.workspace.arcTaskCard.enNz"), {
      ...(work.schedule.timezone ? { timeZone: work.schedule.timezone } : {}),
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  return (
    <article
      className="arcTaskCard arcWorkCard"
      data-task-id={work.id}
      data-attention={attention}
      aria-label={tr("arc.workspace.arcTaskCard.task") + ": " + work.name}
    >
      <header>
        <span className="arcTaskCardKind">
          <Icon name={work.kind === "routine" ? "routine" : "tasks"} size={16} />
          {current
            ? tr("arc.workspace.arcTaskCard.taskConversation")
            : tr("arc.workspace.arcTaskCard.savedTask")}
        </span>
        <span className="arcTaskCardStatus">{status}</span>
      </header>
      <h2>{work.name}</h2>
      <p className="arcTaskCardSchedule">{arcWorkSchedule(work, tr)}</p>
      <p>
        {work.nextRunAt
          ? tr("arc.workspace.arcTaskCard.nextRun") + " · " + when(work.nextRunAt)
          : tr("arc.workspace.arcTaskCard.noNextRunScheduled")}
      </p>
      {latest ? (
        <p className="arcTaskCardOutcome">
          <Icon name={attention ? "history" : "activity"} size={14} />
          {tr("arc.workspace.arcTaskCard.lastRun")} · {when(latest.createdAt)} ·{" "}
          {["failed", "unknown"].includes(latest.status)
            ? tr("arc.workspace.arcTaskCard.incompleteReviewResults")
            : latest.status === "succeeded"
              ? tr("arc.workspace.arcTaskCard.runFinishedReviewTheAnswer")
              : tr("arc.workspace.arcTaskCard.inProgress")}
        </p>
      ) : (
        <p>{tr("arc.workspace.arcTaskCard.noRunsYetThisConversationWill")}</p>
      )}
      {attention && (
        <p role="status">{tr("arc.workspace.arcTaskCard.reviewTheLastResultBeforeRetrying")}</p>
      )}
      <footer>
        {!current && work.conversationId && (
          <button
            type="button"
            className="arcTaskCardPrimary"
            onClick={() => onOpen(work.conversationId!)}
          >
            {tr("arc.workspace.arcTaskCard.openTaskConversation")}
            <Icon name="arrowUpRight" size={14} />
          </button>
        )}
        {current && work.originSessionId && (
          <button type="button" onClick={() => onOpen(work.originSessionId!)}>
            {tr("arc.workspace.arcTaskCard.originalRequest")}
          </button>
        )}
        <button
          type="button"
          onClick={() =>
            onManage(
              tr("arc.workspace.arcTaskCard.reviewTaskIdItsLastResult", {
                name: work.name,
                id: work.id,
              }),
              work.originSessionId,
            )
          }
        >
          {tr("arc.workspace.arcTaskCard.reviewManage")}
        </button>
      </footer>
    </article>
  );
}
