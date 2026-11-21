import { useI18n } from "../../hooks/use-i18n.js";
import type { AgentRun } from "../../hooks/agents/use-agent-runs.js";
import { STATE_LABELS } from "./agent-labels.js";

/** Every agent, newest first; selecting one opens it beside the others. */
export function AgentSidebar({
  runs,
  open,
  deviceName,
  onOpen,
}: {
  runs: AgentRun[];
  open: string[];
  deviceName: (run: AgentRun) => string;
  onOpen: (id: string) => void;
}) {
  const { tr } = useI18n();
  return (
    <nav className="orchSidebar" aria-label={tr("orchestration.page.title")}>
      <ul>
        {runs.map((run) => (
          <li key={run.id}>
            <button
              type="button"
              aria-current={open.includes(run.id) ? "true" : undefined}
              onClick={() => onOpen(run.id)}
            >
              <span className={"orchDot is-" + run.state} aria-hidden="true" />
              <strong>{run.title}</strong>
              <small>
                {tr(
                  run.agent === "claude"
                    ? "orchestration.agent.claude"
                    : "orchestration.agent.codex",
                )}
                {" · "}
                {deviceName(run)}
                {" · "}
                {tr(STATE_LABELS[run.state])}
              </small>
            </button>
          </li>
        ))}
        {!runs.length && <li className="orchEmpty">{tr("orchestration.page.empty")}</li>}
      </ul>
    </nav>
  );
}
