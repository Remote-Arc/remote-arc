import type { Translate } from "../../../locales/locale-catalog.js";
import { WorkspaceLoading } from "../../../components/workspace-loading.js";
import { useState } from "react";
import { arcRequest, type ChatMessage } from "../../../hooks/arc/use-arc-chat.js";
import { workStepLabel, workStepStatus } from "../chat/arc-work-summary.js";
export function ArcExecutionLog({
  runId,
  sessionId,
  tr,
}: {
  runId: string;
  sessionId: string;
  tr: Translate;
}) {
  const [events, setEvents] = useState<ChatMessage[] | null>(null),
    [error, setError] = useState(false),
    [loading, setLoading] = useState(false);
  async function load() {
    if (events || loading) return;
    setLoading(true);
    setError(false);
    try {
      const value = await arcRequest<{ messages: ChatMessage[] }>(
        "sessions/" + encodeURIComponent(sessionId),
      );
      setEvents(
        value.messages.filter(
          (message) =>
            message.role === "tool" &&
            (message.run_id === runId || message.id.startsWith(runId + ":")),
        ),
      );
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }
  return (
    <details
      className="arcActivityExecutionLog"
      onToggle={(event) => {
        if (event.currentTarget.open) void load();
      }}
    >
      <summary>{tr("arc.workspace.arcExecutionLog.executionLog")}</summary>
      {loading && (
        <WorkspaceLoading label={tr("arc.workspace.arcExecutionLog.loading")} variant="compact" />
      )}
      {error && (
        <button type="button" onClick={() => void load()}>
          {tr("arc.workspace.arcExecutionLog.couldNotLoadRetry")}
        </button>
      )}
      {events && (
        <div>
          {events.length === 0 ? (
            <p>{tr("arc.workspace.arcExecutionLog.noToolActionsWereRecordedFor")}</p>
          ) : (
            events.map((message) => (
              <article key={message.id}>
                <strong>{message.text || workStepLabel(message.tool, tr)}</strong>
                <p>{workStepStatus(message.status, tr)}</p>
              </article>
            ))
          )}
        </div>
      )}
    </details>
  );
}
