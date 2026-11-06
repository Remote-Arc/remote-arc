import type { Translate } from "../../../locales/locale-catalog.js";
import { ArcTaskCard, type ArcWork } from "./arc-task-card.js";
import { WorkspaceLoading } from "../../../components/workspace-loading.js";
import { useEffect, useState } from "react";
import { arcRequest } from "../../../hooks/arc/use-arc-chat.js";
import { ArcExecutionLog } from "./arc-execution-log.js";
import { ProductIcon as Icon } from "../../../components/product-icon.js";
type Work = ArcWork;
type Run = {
  id: string;
  session_id: string;
  status: string;
  step: number;
  tokens_used: number;
  error_code: string | null;
  created_at: string;
  updated_at?: string;
  automation_id: string | null;
  title?: string;
};
export function ArcWorkWorkspace({
  view,
  tr,
  onChat,
}: {
  view: "tasks" | "routines" | "activity";
  tr: Translate;
  onChat: (prompt?: string, sessionId?: string) => void;
  onOpenTeams?: () => void;
}) {
  const [data, setData] = useState<{ work: Work[]; runs: Run[] } | null>(null),
    [error, setError] = useState(false),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all"),
    [revision, setRevision] = useState(0),
    [kind, setKind] = useState(view === "routines" ? "routine" : "all"),
    [draft, setDraft] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const refresh = async () => {
      try {
        const value = await arcRequest<{ work: Work[]; runs: Run[] }>(
          "work",
          undefined,
          controller.signal,
        );
        if (controller.signal.aborted) return;
        setData(value);
        setError(false);
      } catch {
        if (!controller.signal.aborted) setError(true);
      }
      if (!controller.signal.aborted) timer = setTimeout(refresh, 5000);
    };
    void refresh();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [revision]);
  const title =
    view === "activity"
      ? tr("arc.workspace.arcWorkspace.activity")
      : tr("arc.workspace.arcWorkspace.tasks");
  const description =
    view === "activity"
      ? tr("arc.workspace.arcWorkspace.everyExecutionItsConversationAndIts")
      : tr("arc.workspace.arcWorkspace.onePlaceForWorkYouDelegate");
  const prompt = tr("arc.workspace.arcWorkspace.helpMeCreateAndMaintainA");
  const starters = [
    {
      icon: "routine" as const,
      name: tr("arc.workspace.arcWorkspace.morningBrief"),
      detail: tr("arc.workspace.arcWorkspace.everyWeekdayEmailCalendar"),
      prompt: tr("arc.workspace.arcWorkspace.everyWeekdayAtPrepareMyMorning"),
    },
    {
      icon: "tasks" as const,
      name: tr("arc.workspace.arcWorkspace.releaseReadiness"),
      detail: tr("arc.workspace.arcWorkspace.oneTimeGithubProjectChecks"),
      prompt: tr("arc.workspace.arcWorkspace.createAOneOffTaskTo"),
    },
    {
      icon: "activity" as const,
      name: tr("arc.workspace.arcWorkspace.weeklyProjectReview"),
      detail: tr("arc.workspace.arcWorkspace.weeklyProgressNextSteps"),
      prompt: tr("arc.workspace.arcWorkspace.everyFridaySummarizeProgressAndOpen"),
    },
    {
      icon: "device" as const,
      name: tr("arc.workspace.arcWorkspace.computerCheckIn"),
      detail: tr("arc.workspace.arcWorkspace.oneTimeDevicesOngoingWork"),
      prompt: tr("arc.workspace.arcWorkspace.createAOneOffTaskTo2"),
    },
  ];
  const status = (value: string) =>
    ({
      succeeded: tr("arc.workspace.arcWorkspace.runFinished"),
      completed: tr("arc.workspace.arcWorkspace.runFinished"),
      waiting: tr("arc.workspace.arcWorkspace.scheduled"),
      queued: tr("arc.workspace.arcWorkspace.queued"),
      thinking: tr("arc.workspace.arcWorkspace.thinking"),
      working: tr("arc.workspace.arcWorkspace.working"),
      running: tr("arc.workspace.arcWorkspace.working"),
      paused: tr("arc.workspace.arcWorkspace.paused"),
      cancelled: tr("arc.workspace.arcWorkspace.stopped"),
      failed: tr("arc.workspace.arcWorkspace.needsAttention"),
      unknown: tr("arc.workspace.arcWorkspace.checkResult"),
    })[value] || value;
  const when = (value: string | null) =>
    value
      ? new Date(value).toLocaleString(tr("arc.workspace.arcWorkspace.enUs"), {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : null;
  const matches = (name: string, value: string) =>
    name.toLowerCase().includes(query.trim().toLowerCase()) &&
    (filter === "all" ||
      (filter === "active" &&
        ["queued", "thinking", "working", "waiting", "running"].includes(value)) ||
      (filter === "finished" && ["succeeded", "completed", "cancelled"].includes(value)) ||
      (filter === "attention" && ["failed", "unknown", "paused"].includes(value)));
  const work = (data?.work || []).filter(
    (w) => (kind === "all" || w.kind === kind) && matches(w.name, w.status),
  );
  const runs = (data?.runs || []).filter((r) => matches(r.title || r.id, r.status));
  return (
    <section className="arcWorkPage" data-work-view={view === "activity" ? "activity" : "tasks"}>
      <header className="overviewTopbar">
        <div>
          <span className="eyebrow">ARC / {title.toUpperCase()}</span>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        <button
          className="addButton arcRadiantCta"
          type="button"
          onClick={() => onChat(view === "activity" ? undefined : prompt)}
        >
          <Icon name="add" />
          {tr("arc.workspace.arcWorkspace.createWithArc")}
        </button>
      </header>
      {view !== "activity" && (
        <>
          <form
            className="arcWorkComposer"
            onSubmit={(event) => {
              event.preventDefault();
              if (draft.trim()) onChat(prompt + "\n\n" + draft.trim());
            }}
          >
            <label htmlFor="arc-work-request">
              {tr("arc.workspace.arcWorkspace.whatCanArcTakeOffYour")}
            </label>
            <textarea
              id="arc-work-request"
              rows={2}
              maxLength={4000}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={tr("arc.workspace.arcWorkspace.everyWeekdayAtPrepareMyMorning2")}
            />
            <footer>
              <span>{tr("arc.workspace.arcWorkspace.describeItArcSetsItUp")}</span>
              <button className="arcRadiantCta" type="submit" disabled={!draft.trim()}>
                {tr("arc.workspace.arcWorkspace.continueWithArc")}
                <Icon name="arrowUpRight" size={14} />
              </button>
            </footer>
          </form>
          <section
            className="arcTaskStarters"
            aria-label={tr("arc.workspace.arcWorkspace.taskStarters")}
          >
            <div className="arcWorkSectionHeader">
              <h2>{tr("arc.workspace.arcWorkspace.startWithALittleInspiration")}</h2>
              <span>{tr("arc.workspace.arcWorkspace.personalizeInConversation")}</span>
            </div>
            <div>
              {starters.map((starter) => (
                <button type="button" key={starter.name} onClick={() => onChat(starter.prompt)}>
                  <Icon name={starter.icon} />
                  <strong>{starter.name}</strong>
                  <small>{starter.detail}</small>
                  <Icon name="arrowUpRight" size={14} />
                </button>
              ))}
            </div>
          </section>
          <div
            className="arcTaskKinds"
            role="group"
            aria-label={tr("arc.workspace.arcWorkspace.taskFrequency")}
          >
            {[
              ["all", tr("arc.workspace.arcWorkspace.allTasks")],
              ["task", tr("arc.workspace.arcWorkspace.oneOff")],
              ["routine", tr("arc.workspace.arcWorkspace.recurring")],
            ].map(([value, label]) => (
              <button
                type="button"
                key={value}
                aria-pressed={kind === value}
                onClick={() => setKind(value!)}
              >
                {label}
                <span>
                  {(data?.work || []).filter((w) => value === "all" || w.kind === value).length}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
      <div className="arcWorkToolbar">
        <label className="arcWorkSearch">
          <Icon name="search" />
          <input
            type="search"
            aria-label={tr("arc.workspace.arcWorkspace.searchWork")}
            placeholder={tr("arc.workspace.arcWorkspace.searchWork2")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <div role="group" aria-label={tr("arc.workspace.arcWorkspace.filterWork")}>
          {[
            ["all", tr("arc.workspace.arcWorkspace.all")],
            ["active", tr("arc.workspace.arcWorkspace.active")],
            ["attention", tr("arc.workspace.arcWorkspace.attention")],
            ["finished", tr("arc.workspace.arcWorkspace.finished")],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={filter === id}
              onClick={() => setFilter(id!)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {error && data && (
        <div className="arcWorkRefreshError" role="alert">
          <p>{tr("arc.workspace.arcWorkspace.couldNotRefreshYourWorkShowing")}</p>
          <button
            type="button"
            className="ghostButton"
            onClick={() => setRevision((value) => value + 1)}
          >
            {tr("arc.workspace.arcWorkspace.tryAgain")}
          </button>
        </div>
      )}
      {error && !data ? (
        <div className="arcWorkEmpty" role="alert">
          <Icon name="history" size={28} />
          <h2>{tr("arc.workspace.arcWorkspace.workIsUnavailableRightNow")}</h2>
          <p>{tr("arc.workspace.arcWorkspace.couldNotLoadYourWorkCheck")}</p>
          <button className="ghostButton" onClick={() => setRevision((value) => value + 1)}>
            {tr("arc.workspace.arcWorkspace.tryAgain")}
          </button>
        </div>
      ) : !data ? (
        <WorkspaceLoading label={tr("arc.workspace.arcWorkspace.loadingYourWork")} />
      ) : (
        <>
          {view !== "activity" && (
            <div className="arcWorkGrid arcWorkTaskCards">
              {work.map((w) => (
                <ArcTaskCard
                  key={w.id}
                  work={w}
                  tr={tr}
                  onOpen={(id) => onChat(undefined, id)}
                  onManage={onChat}
                />
              ))}
            </div>
          )}
          {view === "activity" && runs.length > 0 && (
            <div className="arcWorkRuns">
              <div className="arcWorkSectionHeader">
                <h2>{tr("arc.workspace.arcWorkspace.executionHistory")}</h2>
                <span>{tr("arc.workspace.arcWorkspace.reviewTheAnswerAndReturnedEvidence")}</span>
              </div>
              {runs.map((r) => {
                const job = data?.work.find((w) => w.id === r.automation_id);
                return (
                  <div className="arcActivityRun" key={r.id}>
                    <button
                      type="button"
                      className="arcWorkRun"
                      onClick={() => onChat(undefined, r.session_id)}
                    >
                      <span className="arcWorkRunIcon">
                        <Icon
                          name={
                            job?.kind === "routine"
                              ? "routine"
                              : r.status === "succeeded"
                                ? "chat"
                                : ["unknown", "failed"].includes(r.status)
                                  ? "history"
                                  : "chat"
                          }
                        />
                      </span>
                      <span>
                        <strong>
                          {job?.name || r.title || tr("arc.workspace.arcWorkspace.arcConversation")}
                        </strong>
                        <small>
                          {job
                            ? job.kind === "routine"
                              ? tr("arc.workspace.arcWorkspace.routineRun")
                              : tr("arc.workspace.arcWorkspace.taskRun")
                            : tr("arc.workspace.arcWorkspace.chatRun")}{" "}
                          · {when(r.created_at)} · {r.step} {tr("arc.workspace.arcWorkspace.steps")}{" "}
                          · {r.tokens_used.toLocaleString()} tokens
                        </small>
                      </span>
                      <span className={"arcWorkStatus " + r.status}>{status(r.status)}</span>
                      <Icon name="arrowUpRight" size={16} />
                    </button>
                    <ArcExecutionLog runId={r.id} sessionId={r.session_id} tr={tr} />
                  </div>
                );
              })}
            </div>
          )}
          {(view === "activity" ? !runs.length : !work.length) && (
            <div className="arcWorkEmpty">
              <span className="arcWorkEmptyIcon">
                <Icon
                  name={
                    view === "routines" ? "routine" : view === "activity" ? "activity" : "tasks"
                  }
                  size={27}
                />
              </span>
              <h2>
                {query || filter !== "all"
                  ? tr("arc.workspace.arcWorkspace.noMatchingWork")
                  : view === "routines"
                    ? tr("arc.workspace.arcWorkspace.makeRoomInYourDay")
                    : view === "activity"
                      ? tr("arc.workspace.arcWorkspace.everyRunLeavesAClearTrail")
                      : tr("arc.workspace.arcWorkspace.goodWorkStartsWithAConversation")}
              </h2>
              <p>
                {query || filter !== "all"
                  ? tr("arc.workspace.arcWorkspace.tryADifferentSearchOrFilter")
                  : view === "routines"
                    ? tr("arc.workspace.arcWorkspace.everyWeekdayAtSummarizeMyInbox")
                    : view === "activity"
                      ? tr("arc.workspace.arcWorkspace.completedAndOngoingChatTaskAnd")
                      : tr("arc.workspace.arcWorkspace.describeATaskAboveOrChoose")}
              </p>
              <button
                className="ghostButton"
                onClick={() => onChat(view === "activity" ? undefined : prompt)}
              >
                {tr("arc.workspace.arcWorkspace.startAConversation")}
                <Icon name="arrowUpRight" size={15} />
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
