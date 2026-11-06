import type { Translate } from "../../../locales/locale-catalog.js";
import { useEffect, useState } from "react";
import { arcRequest } from "../../../hooks/arc/use-arc-chat.js";
import { ProductIcon as Icon } from "../../../components/product-icon.js";
import "../../../styles/arc/chat/arc-home-brief.css";

type Work = {
  id: string;
  name: string;
  kind: "task" | "routine";
  status: string;
  conversationId?: string | null;
};
type Run = {
  id: string;
  title?: string;
  status: string;
  session_id: string;
  automation_id: string | null;
};
type Brief = { work: Work[]; runs: Run[] };
type Props = {
  enabled: boolean;
  onlineDevices: number;
  totalDevices: number;
  tr: Translate;
  onTasks: () => void;
  onRoutines: () => void;
  onDevices: () => void;
  onReview: (prompt: string, sessionId?: string) => void;
};
const needsAttention = (status: string) => ["failed", "unknown", "paused"].includes(status);
const ongoing = (status: string) =>
  ["queued", "thinking", "working", "running", "waiting"].includes(status);

export function ArcHomeBrief({
  enabled,
  onlineDevices,
  totalDevices,
  tr,
  onTasks,
  onRoutines,
  onDevices,
  onReview,
}: Props) {
  const [brief, setBrief] = useState<Brief | null>(null);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    setError(false);
    void arcRequest<Brief>("work", undefined, controller.signal)
      .then((value) => {
        if (controller.signal.aborted) return;
        if (!Array.isArray(value.work) || !Array.isArray(value.runs))
          throw new Error("CHAT_UNAVAILABLE");
        setBrief(value);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      });
    return () => controller.abort();
  }, [enabled, revision]);
  if (!enabled) return null;
  if (error)
    return (
      <div className="arcHomeBriefStatus" role="status">
        <span>{tr("arc.chat.arcHomeBrief.yourWorkSummaryIsTemporarilyUnavailable")}</span>
        <button type="button" onClick={() => setRevision((value) => value + 1)}>
          {tr("arc.chat.arcHomeBrief.tryAgain")}
        </button>
      </div>
    );
  if (!brief)
    return (
      <div className="arcHomeBriefStatus" role="status">
        {tr("arc.chat.arcHomeBrief.checkingWhatNeedsYourAttention")}
      </div>
    );
  const workAttention = brief.work.filter((item) => needsAttention(item.status));
  const workIds = new Set(brief.work.map((item) => item.id));
  const latestRuns = new Map<string, Run>();
  for (const run of brief.runs)
    if (!latestRuns.has(run.session_id)) latestRuns.set(run.session_id, run);
  const runAttention = [...latestRuns.values()].filter(
    (run) => needsAttention(run.status) && (!run.automation_id || !workIds.has(run.automation_id)),
  );
  const attentionCount = workAttention.length + runAttention.length;
  const offline = Math.max(0, totalDevices - onlineDevices);
  return (
    <section className="arcHomeBrief" aria-label={tr("arc.chat.arcHomeBrief.yourWorkAtAGlance")}>
      <div className="arcHomeMetrics">
        <button type="button" onClick={onTasks}>
          <Icon name="tasks" size={16} />
          <span>{tr("arc.chat.arcHomeBrief.activeTasks")}</span>
          <strong>
            {brief.work.filter((item) => item.kind === "task" && ongoing(item.status)).length}
          </strong>
        </button>
        <button type="button" onClick={onRoutines}>
          <Icon name="routine" size={16} />
          <span>{tr("arc.chat.arcHomeBrief.scheduledRoutines")}</span>
          <strong>
            {brief.work.filter((item) => item.kind === "routine" && ongoing(item.status)).length}
          </strong>
        </button>
        <button type="button" onClick={onDevices}>
          <Icon name="device" size={16} />
          <span>{tr("arc.chat.arcHomeBrief.computersOnline")}</span>
          <strong>
            {onlineDevices}
            <small> / {totalDevices}</small>
          </strong>
        </button>
      </div>
      {(attentionCount > 0 || offline > 0) && (
        <div className="arcHomeAttention">
          <header>
            <Icon name="inbox" size={15} />
            <strong>{tr("arc.chat.arcHomeBrief.pickUpWhereYouLeftOff")}</strong>
            <span>{attentionCount + (offline ? 1 : 0)}</span>
          </header>
          {workAttention.slice(0, 3).map((item) => (
            <button
              type="button"
              key={item.id}
              onClick={() =>
                onReview(
                  tr("arc.chat.arcHomeBrief.reviewMyIdReadItsCurrent", {
                    kind: item.kind,
                    name: item.name,
                    id: item.id,
                  }),
                  item.conversationId || undefined,
                )
              }
            >
              <Icon name={item.kind === "routine" ? "routine" : "tasks"} size={16} />
              <span>
                <strong>{item.name}</strong>
                <small>
                  {item.status === "unknown"
                    ? tr("arc.chat.arcHomeBrief.checkTheResultBeforeRepeatingThis")
                    : item.status === "paused"
                      ? tr("arc.chat.arcHomeBrief.pausedReviewBeforeContinuing")
                      : tr("arc.chat.arcHomeBrief.needsYourAttention")}
                </small>
              </span>
              <Icon name="arrowUpRight" size={14} />
            </button>
          ))}
          {runAttention.slice(0, Math.max(0, 3 - workAttention.length)).map((run) => (
            <button
              type="button"
              key={run.id}
              onClick={() =>
                onReview(tr("arc.chat.arcHomeBrief.reviewTheLastRunAndIts"), run.session_id)
              }
            >
              <Icon name="history" size={16} />
              <span>
                <strong>{run.title || tr("arc.chat.arcHomeBrief.aConversationToRevisit")}</strong>
                <small>
                  {run.status === "unknown"
                    ? tr("arc.chat.arcHomeBrief.theLastActionNeedsVerification")
                    : tr("arc.chat.arcHomeBrief.reviewTheLastRun")}
                </small>
              </span>
              <Icon name="arrowUpRight" size={14} />
            </button>
          ))}
          {offline > 0 && (
            <button type="button" onClick={onDevices}>
              <Icon name="device" size={16} />
              <span>
                <strong>
                  {tr("arc.chat.arcHomeBrief.computerOffline", {
                    offline,
                    s: offline === 1 ? "" : "s",
                  })}
                </strong>
                <small>{tr("arc.chat.arcHomeBrief.computerWorkNeedsAnAvailableDevice")}</small>
              </span>
              <Icon name="arrowUpRight" size={14} />
            </button>
          )}
        </div>
      )}
    </section>
  );
}
