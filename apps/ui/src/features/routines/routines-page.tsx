import { useEffect, useState } from "react";
import { useI18n } from "../../hooks/use-i18n.js";
import { ProductIcon } from "../../components/product-icon.js";
import { WorkspaceLoading } from "../../components/workspace-loading.js";
import { useRoutines, type Routine, type RoutineGroup } from "../../hooks/routines/use-routines.js";
import { useTaskDecision } from "../../hooks/tasks/use-task-decision.js";
import { NewRoutineDialog } from "./new-routine-dialog.js";
import { RoutineDetail } from "./routine-detail.js";
import { RoutinesEmpty } from "./routines-empty.js";
import { GROUP_LABELS, resultLabel, resultTone, scheduleLabel } from "./routine-labels.js";
import "../../styles/tasks/task-decision.css";
import "../../styles/tasks/task-saved-steps.css";
import "../../styles/tasks/task-arc-hint.css";
import "../../styles/routines/routines-page.css";

const FILTERS: (RoutineGroup | "all")[] = [
  "all",
  "needs",
  "running",
  "scheduled",
  "paused",
  "finished",
];
const NEED_LABELS = {
  decision: "routines.labels.waitingForDecision",
  offline: "routines.labels.computerOffline",
  agent: "routines.labels.waitingForAi",
  failed: "routines.labels.failed",
} as const;

/**
 * Every routine in one place: what needs you, all routines in one list, and the
 * selected routine's detail. Routines made in Arc and saved from an AI share it.
 */
export function RoutinesPage({
  arcAvailable,
  devices,
  onChat,
  onConnectAI,
}: {
  arcAvailable: boolean;
  devices: { id: string; name: string }[];
  onChat: (prompt?: string, sessionId?: string) => void;
  onConnectAI: () => void;
}) {
  const { tr, locale } = useI18n();
  // A link (such as one an AI gives after saving a routine) opens it with ?task=.
  const [selected, setSelected] = useState<string | null>(() =>
    new URLSearchParams(location.search).get("task"),
  );
  const model = useRoutines({ arcAvailable, focus: selected });
  const decisions = useTaskDecision<{ id: string }>(() => model.reload());
  const [filter, setFilter] = useState<RoutineGroup | "all">("all"),
    [query, setQuery] = useState(""),
    [creating, setCreating] = useState(false);
  const routines = model.routines;
  useEffect(() => {
    const sync = () => setSelected(new URLSearchParams(location.search).get("task"));
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);
  const select = (id: string | null) => {
    setSelected(id);
    const url = new URL(location.href);
    if (id) url.searchParams.set("task", id);
    else url.searchParams.delete("task");
    history.replaceState(history.state, "", url);
  };
  useEffect(() => {
    if (routines && !selected && routines.length && matchMedia("(min-width: 960px)").matches)
      setSelected(routines[0]!.id);
  }, [routines, selected]);

  const time = (value: string | null) =>
    value
      ? new Date(value).toLocaleString(locale === "zh" ? "zh-CN" : "en-NZ", {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "—";
  const deviceName = (routine: Routine) =>
    routine.source === "arc"
      ? tr("routines.labels.remoteArc")
      : devices.find((device) => device.id === routine.deviceId)?.name ||
        tr("routines.labels.computer");
  const needs = (routines || []).filter((routine) => routine.need);
  const shown = (routines || []).filter(
    (routine) =>
      (filter === "all" || routine.group === filter) &&
      [routine.name, deviceName(routine)].some((value) =>
        value.toLowerCase().includes(query.trim().toLowerCase()),
      ),
  );
  const current = routines?.find((routine) => routine.id === selected) || null;

  return (
    <section className="routinesPage" data-view={current ? "detail" : "list"}>
      {creating && (
        <NewRoutineDialog
          arcAvailable={arcAvailable}
          onChat={onChat}
          onConnectAI={onConnectAI}
          onClose={() => setCreating(false)}
        />
      )}
      <header className="routinesHeader">
        <div>
          <span className="eyebrow">{tr("routines.page.eyebrow")}</span>
          <h1>{tr("routines.page.title")}</h1>
          <p>{tr("routines.page.description")}</p>
        </div>
        <button
          type="button"
          className="routinePrimary"
          aria-haspopup="dialog"
          onClick={() => setCreating(true)}
        >
          <ProductIcon name="add" size={16} />
          {tr("routines.page.newRoutine")}
        </button>
      </header>

      {model.loadFailed && (
        <div className="routineError" role="alert">
          <p>{routines ? tr("routines.page.refreshFailed") : tr("routines.page.loadFailed")}</p>
          <button type="button" className="ghostButton" onClick={model.reload}>
            {tr("routines.page.retry")}
          </button>
        </div>
      )}
      {model.missing && model.missing === selected && (
        <div className="routineError" role="status">
          <p>{tr("routines.page.missing")}</p>
          <button type="button" className="ghostButton" onClick={() => select(null)}>
            {tr("routines.page.showAll")}
          </button>
        </div>
      )}
      {!routines && !model.loadFailed && (
        <WorkspaceLoading label={tr("routines.page.loading")} variant="rows" />
      )}
      {routines && routines.length === 0 && (
        <RoutinesEmpty
          onChat={onChat}
          onConnectAI={onConnectAI}
          onNewRoutine={() => setCreating(true)}
          arcAvailable={arcAvailable}
        />
      )}

      {routines && routines.length > 0 && (
        <>
          {needs.length > 0 && (
            <section className="routinesNeeds" aria-labelledby="routines-needs">
              <h2 id="routines-needs">
                {tr("routines.page.needsYou")} <span>{needs.length}</span>
              </h2>
              <div>
                {needs.map((routine) => (
                  <article key={routine.id} data-need={routine.need} data-routine-id={routine.id}>
                    <header>
                      <strong>{routine.name}</strong>
                      <span className="routinePill">{tr(NEED_LABELS[routine.need!])}</span>
                    </header>
                    <p>
                      {routine.need === "decision"
                        ? routine.decision!.reason
                        : routine.need === "offline"
                          ? tr("routines.page.offlineDetail", { device: deviceName(routine) })
                          : routine.error && !/^[A-Z][A-Z0-9_]+$/.test(routine.error)
                            ? routine.error
                            : tr("routines.page.failedDetail")}
                    </p>
                    <footer>
                      {routine.need === "decision" && routine.saved && (
                        <>
                          <button
                            type="button"
                            className="routinePrimary"
                            disabled={decisions.busy !== null}
                            onClick={() =>
                              void decisions.decide(
                                { id: routine.id },
                                routine.decision!,
                                "retry_now",
                              )
                            }
                          >
                            {tr("tasks.taskDecision.retryNow")}
                          </button>
                          <button
                            type="button"
                            disabled={decisions.busy !== null}
                            onClick={() =>
                              void decisions.decide(
                                { id: routine.id },
                                routine.decision!,
                                "skip_run",
                              )
                            }
                          >
                            {tr("tasks.taskDecision.skipRun")}
                          </button>
                        </>
                      )}
                      <button type="button" onClick={() => select(routine.id)}>
                        {tr("routines.page.openDetail")}
                      </button>
                    </footer>
                    {decisions.errorFor(routine.id) && (
                      <p className="routineError" role="alert">
                        {decisions.errorFor(routine.id)}
                      </p>
                    )}
                  </article>
                ))}
              </div>
            </section>
          )}

          <div className="routinesToolbar">
            <div role="group" aria-label={tr("routines.page.filter")}>
              {FILTERS.map((value) => (
                <button
                  type="button"
                  key={value}
                  aria-pressed={filter === value}
                  onClick={() => setFilter(value)}
                >
                  {tr(GROUP_LABELS[value])}{" "}
                  <span>
                    {value === "all"
                      ? routines.length
                      : routines.filter((routine) => routine.group === value).length}
                  </span>
                </button>
              ))}
            </div>
            <label>
              <ProductIcon name="search" size={16} />
              <input
                type="search"
                aria-label={tr("routines.page.search")}
                placeholder={tr("routines.page.searchPlaceholder")}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
          </div>

          <div className="routinesBody">
            <section className="routinesList" aria-label={tr("routines.page.all")}>
              <div className="routinesListHead" aria-hidden="true">
                <span>{tr("routines.page.columnRoutine")}</span>
                <span>{tr("routines.page.columnRunsOn")}</span>
                <span>{tr("routines.page.columnSchedule")}</span>
                <span>{tr("routines.page.columnLastResult")}</span>
                <span>{tr("routines.page.columnNext")}</span>
              </div>
              {shown.length === 0 && (
                <p className="routineMuted routinesNoMatch">{tr("routines.page.noMatch")}</p>
              )}
              {shown.map((routine) => (
                <button
                  type="button"
                  key={routine.id}
                  className="routineRow"
                  data-routine-id={routine.id}
                  aria-pressed={routine.id === selected}
                  onClick={() => select(routine.id)}
                >
                  <span className="routineRowName">
                    <strong>{routine.name}</strong>
                    <small>
                      {routine.source === "arc"
                        ? tr("routines.labels.fromChat")
                        : tr("routines.labels.fromAi")}
                    </small>
                  </span>
                  <span>{deviceName(routine)}</span>
                  <span>{scheduleLabel(routine, tr)}</span>
                  <span className="routineRowResult" data-tone={resultTone(routine)}>
                    <i aria-hidden="true" />
                    {resultLabel(routine, tr)}
                  </span>
                  <span>
                    {(routine.status === "waiting" || routine.status === "running") &&
                    routine.nextRunAt
                      ? time(routine.nextRunAt)
                      : ""}
                  </span>
                </button>
              ))}
            </section>
            {current && (
              <RoutineDetail
                key={current.id}
                routine={current}
                deviceName={deviceName(current)}
                busy={model.busy === current.id}
                error={model.failureFor(current.id)}
                decisions={decisions}
                formatTime={time}
                onAct={(action) => void model.act(current, action)}
                onOpenConversation={(sessionId) => onChat(undefined, sessionId)}
                onBack={() => select(null)}
              />
            )}
          </div>
        </>
      )}
    </section>
  );
}
