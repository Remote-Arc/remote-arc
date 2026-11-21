import { useEffect, useState } from "react";
import { useI18n } from "../../hooks/use-i18n.js";
import { WorkspaceLoading } from "../../components/workspace-loading.js";
import { useAgentRuns, type AgentRun } from "../../hooks/agents/use-agent-runs.js";
import { AgentLaunchForm, type LaunchDevice } from "./agent-launch-form.js";
import { AgentPane } from "./agent-pane.js";
import { AgentSidebar } from "./agent-sidebar.js";
import { QuotaBar } from "./quota-bar.js";
import "../../styles/agents/orchestration.css";

/** Conversations side by side on a wide screen; one on a narrow one. */
const MAX_PANES = 3;

function openFromUrl() {
  return (new URLSearchParams(location.search).get("run") || "")
    .split(",")
    .filter((id) => /^ar_[0-9a-f]{12}$/.test(id))
    .slice(0, MAX_PANES);
}

/**
 * Agent Orchestration: the person's coding agents (Claude Code, Codex) on
 * their own computers, each in its own Git worktree, as conversations they can
 * follow and continue side by side.
 */
export function OrchestrationPage({ devices }: { devices: LaunchDevice[] }) {
  const { tr } = useI18n();
  const model = useAgentRuns();
  const [open, setOpen] = useState<string[]>(openFromUrl);
  const [launching, setLaunching] = useState(false);
  const show = (ids: string[]) => {
    setOpen(ids);
    const url = new URL(location.href);
    if (ids.length) url.searchParams.set("run", ids.join(","));
    else url.searchParams.delete("run");
    history.replaceState(history.state, "", url);
  };
  // A newly opened agent joins the panes; the oldest pane makes room.
  const openRun = (id: string) => show(open.includes(id) ? open : [...open, id].slice(-MAX_PANES));
  useEffect(() => {
    if (model.runs && model.runs.length === 0) setLaunching(true);
  }, [model.runs]);

  if (!model.runs)
    return model.loadFailed ? (
      <p className="orchError">{tr("orchestration.page.loadFailed")}</p>
    ) : (
      <WorkspaceLoading label={tr("orchestration.page.title")} />
    );

  const deviceName = (run: AgentRun) =>
    devices.find((device) => device.id === run.device_id)?.name ||
    tr("orchestration.page.computer");
  const panes = open.filter((id) => model.runs!.some((run) => run.id === id));
  const running = model.runs.filter((run) => run.state === "running").length;

  return (
    <section className="orchPage" data-panes={panes.length}>
      <header className="overviewTopbar orchHeader">
        <div>
          <span className="eyebrow">{tr("orchestration.page.eyebrow")}</span>
          <h1>{tr("orchestration.page.title")}</h1>
          <p>
            {tr("orchestration.page.description")}{" "}
            {running > 0 && tr("orchestration.page.running", { count: running })}
          </p>
        </div>
        <button type="button" className="orchPrimary" onClick={() => setLaunching(!launching)}>
          {launching ? tr("orchestration.page.hideLaunch") : tr("orchestration.page.new")}
        </button>
      </header>

      <QuotaBar claude={model.quota.claude} />
      {model.failure && <p className="orchError">{model.failure}</p>}

      {launching && (
        <AgentLaunchForm
          devices={devices}
          fanoutLimit={model.fanoutLimit}
          busy={model.busy}
          onStart={async (agent, prompt, targets) => {
            const started = await model.start(agent, prompt, targets);
            if (started) {
              setLaunching(false);
              show([...open, ...started.runs.map((run) => run.id)].slice(-MAX_PANES));
            }
          }}
        />
      )}

      <div className="orchBody">
        <AgentSidebar runs={model.runs} open={panes} deviceName={deviceName} onOpen={openRun} />
        <div className="orchPanes">
          {panes.map((id) => (
            <AgentPane
              key={id}
              id={id}
              deviceName={deviceName}
              busy={model.busy}
              onStop={() => void model.stop(id)}
              onRemove={() => void model.removeWorktree(id)}
              onClose={() => show(panes.filter((other) => other !== id))}
              onChange={() => void model.reload()}
            />
          ))}
          {!panes.length && model.runs.length > 0 && (
            <p className="orchHint">{tr("orchestration.page.pickOne")}</p>
          )}
        </div>
      </div>
    </section>
  );
}
