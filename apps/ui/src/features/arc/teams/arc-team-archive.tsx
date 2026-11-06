import type { Translate } from "../../../locales/locale-catalog.js";
import { useEffect, useState } from "react";
import Markdown from "react-markdown";
import { arcRequest } from "../../../hooks/arc/use-arc-chat.js";
export function ArcTeamArchive({ roomId, tr }: { roomId: string; tr: Translate }) {
  const [messages, setMessages] = useState<
      { id: string; role: string; text: string; speaker?: { name: string } }[] | null
    >(null),
    [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void arcRequest<{ messages: NonNullable<typeof messages> }>(
      "rooms/" + encodeURIComponent(roomId),
      undefined,
      controller.signal,
    )
      .then((value) => {
        if (!controller.signal.aborted)
          setMessages(
            value.messages.filter(
              (m) => ["user", "assistant"].includes(m.role) && !m.id.endsWith(":intent"),
            ),
          );
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      });
    return () => controller.abort();
  }, [roomId]);
  return (
    <details className="arcTeamArchive">
      <summary>{tr("arc.teams.arcTeamArchive.previousTeamWorkReadOnly")}</summary>
      <p>{tr("arc.teams.arcTeamArchive.continueNewWorkInArcChat")}</p>
      {error && <p role="status">{tr("arc.teams.arcTeamArchive.couldNotLoadThisRecord")}</p>}
      {messages?.map((message) => (
        <article key={message.id}>
          <strong>
            {message.role === "user"
              ? tr("arc.teams.arcTeamArchive.you")
              : message.speaker?.name || "Arc"}
          </strong>
          <Markdown skipHtml>{message.text}</Markdown>
        </article>
      ))}
    </details>
  );
}
