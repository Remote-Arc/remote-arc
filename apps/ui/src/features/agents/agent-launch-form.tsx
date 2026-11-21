import { useState } from "react";
import { useI18n } from "../../hooks/use-i18n.js";
import type { AgentKind, AgentRunTarget } from "../../hooks/agents/use-agent-runs.js";

export type LaunchDevice = {
  id: string;
  name: string;
  status: "online" | "offline";
  workspace_roots?: string[];
};

/**
 * Chooses the agent, the prompt and where it runs. Each row is one agent in
 * its own worktree; a row may repeat a computer for parallel attempts.
 */
export function AgentLaunchForm({
  devices,
  fanoutLimit,
  busy,
  onStart,
}: {
  devices: LaunchDevice[];
  fanoutLimit: number;
  busy: boolean;
  onStart: (agent: AgentKind, prompt: string, targets: AgentRunTarget[]) => void;
}) {
  const { tr } = useI18n();
  const usable = devices.filter(
    (device) => device.status === "online" && (device.workspace_roots || []).length > 0,
  );
  const first = usable[0];
  const [agent, setAgent] = useState<AgentKind>("claude"),
    [prompt, setPrompt] = useState(""),
    [targets, setTargets] = useState<AgentRunTarget[]>(
      first ? [{ device_id: first.id, repo_path: first.workspace_roots![0]! }] : [],
    );

  if (!usable.length) return <p className="orchNotice">{tr("orchestration.launch.noComputer")}</p>;

  const update = (index: number, patch: Partial<AgentRunTarget>) =>
    setTargets(targets.map((target, i) => (i === index ? { ...target, ...patch } : target)));
  const ready =
    prompt.trim().length > 0 &&
    targets.length > 0 &&
    targets.every((target) => target.repo_path.trim().length > 0);

  return (
    <form
      className="orchLaunch"
      onSubmit={(event) => {
        event.preventDefault();
        if (ready && !busy) onStart(agent, prompt.trim(), targets);
      }}
    >
      <fieldset className="orchChoice">
        <legend>{tr("orchestration.launch.agent")}</legend>
        {(["claude", "codex"] as const).map((kind) => (
          <label key={kind}>
            <input
              type="radio"
              name="agent"
              value={kind}
              checked={agent === kind}
              onChange={() => setAgent(kind)}
            />
            {tr(kind === "claude" ? "orchestration.agent.claude" : "orchestration.agent.codex")}
          </label>
        ))}
      </fieldset>

      <label className="orchField">
        <span>{tr("orchestration.launch.prompt")}</span>
        <textarea
          value={prompt}
          maxLength={20000}
          rows={5}
          placeholder={tr("orchestration.launch.promptPlaceholder")}
          onChange={(event) => setPrompt(event.target.value)}
        />
      </label>

      <div className="orchTargets">
        <span>{tr("orchestration.launch.where")}</span>
        {targets.map((target, index) => {
          const device = usable.find((item) => item.id === target.device_id);
          return (
            <div className="orchTarget" key={index}>
              <select
                aria-label={tr("orchestration.launch.computer")}
                value={target.device_id}
                onChange={(event) => {
                  const next = usable.find((item) => item.id === event.target.value)!;
                  update(index, { device_id: next.id, repo_path: next.workspace_roots![0]! });
                }}
              >
                {usable.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
              <input
                aria-label={tr("orchestration.launch.folder")}
                list={"orchRoots-" + index}
                value={target.repo_path}
                onChange={(event) => update(index, { repo_path: event.target.value })}
              />
              <datalist id={"orchRoots-" + index}>
                {(device?.workspace_roots || []).map((root) => (
                  <option key={root} value={root} />
                ))}
              </datalist>
              {targets.length > 1 && (
                <button
                  type="button"
                  className="orchGhost"
                  onClick={() => setTargets(targets.filter((_, i) => i !== index))}
                >
                  {tr("orchestration.launch.remove")}
                </button>
              )}
            </div>
          );
        })}
        {targets.length < fanoutLimit ? (
          <button
            type="button"
            className="orchGhost"
            onClick={() => setTargets([...targets, { ...targets[targets.length - 1]! }])}
          >
            {tr("orchestration.launch.addCopy")}
          </button>
        ) : (
          <small>{tr("orchestration.launch.fanoutLimit", { count: fanoutLimit })}</small>
        )}
      </div>

      <p className="orchHint">{tr("orchestration.launch.hint")}</p>
      <button type="submit" className="orchPrimary" disabled={!ready || busy}>
        {tr("orchestration.launch.start", { count: targets.length })}
      </button>
    </form>
  );
}
