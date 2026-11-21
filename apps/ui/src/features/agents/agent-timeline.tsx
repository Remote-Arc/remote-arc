import { useI18n } from "../../hooks/use-i18n.js";
import type { AgentTurn } from "../../hooks/agents/use-agent-runs.js";
import { STATE_LABELS } from "./agent-labels.js";

/** The conversation: each message the person sent, then what the agent said and did. */
export function AgentTimeline({ turns }: { turns: AgentTurn[] }) {
  const { tr } = useI18n();
  return (
    <ol className="orchTimeline">
      {turns.map((turn) => (
        <li key={turn.idx} className="orchTurn">
          <p className="orchBubble is-user">{turn.prompt}</p>
          {turn.messages.map((message, index) =>
            message.kind === "tool" ? (
              <p key={index} className={"orchTool is-" + message.status}>
                <span>{message.name}</span>
                {message.detail && <code>{message.detail}</code>}
              </p>
            ) : (
              <p
                key={index}
                className={"orchBubble " + (message.kind === "error" ? "is-error" : "is-agent")}
              >
                {message.text}
              </p>
            ),
          )}
          {turn.state === "running" ? (
            <p className="orchWorking" aria-live="polite">
              {tr("orchestration.timeline.working")}
            </p>
          ) : (
            <p className="orchTurnFooter">
              <span className={"orchState is-" + turn.state}>{tr(STATE_LABELS[turn.state])}</span>
              {turn.usage && (
                <small>
                  {tr("orchestration.timeline.tokens", {
                    tokens: (turn.usage.input_tokens + turn.usage.output_tokens).toLocaleString(),
                  })}
                  {turn.usage.cost_usd !== null && ` · $${turn.usage.cost_usd.toFixed(2)}`}
                </small>
              )}
              {turn.error && <small className="orchTurnError">{turn.error}</small>}
            </p>
          )}
        </li>
      ))}
    </ol>
  );
}
