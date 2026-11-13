import type { Translate } from "../../../locales/locale-catalog.js";
import { useEffect, useRef, useState, type FormEvent } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ArcEmployee, ArcEmployeeProfile, ArcTeamRoom } from "@remotearc/protocol";
import {
  arcRequest,
  type ChatMessage,
  type ChatRun,
  type ChatService,
} from "../../../hooks/arc/use-arc-chat.js";
import { WorkspaceLoading } from "../../../components/workspace-loading.js";
import { billingRecovery } from "../../../../../../packages/protocol/src/billing-recovery.js";
import { BillingRecoveryActions } from "../../billing/billing-recovery-actions.js";

type Tr = Translate;
type RoomMessage = ChatMessage & {
  recipients?: { id: string; name: string }[];
  employeeId: string | null;
  speaker: (Pick<ArcEmployeeProfile, "name" | "avatar"> & { id: string; version: number }) | null;
  created_at: string;
};
type History = { messages: RoomMessage[]; hasMore: boolean; before: string | null };
type Snapshot = History & {
  room: ArcTeamRoom;
  employees: ArcEmployee[];
  messages: RoomMessage[];
  runs: (ChatRun & { employeeId: string; profileVersion: number })[];
  turns: { id: string; status: string }[];
  deliveries: { id: string; employee_id: string; status: string }[];
};
const plugins = [remarkGfm];
function handoffResult(value: unknown): {
  queued?: boolean;
  roomId?: string;
  target?: { name?: string };
} {
  try {
    return typeof value === "string"
      ? JSON.parse(value)
      : value && typeof value === "object"
        ? value
        : {};
  } catch {
    return {};
  }
}
export type TeamChatDraft = {
  text: string;
  recipient: string;
  mentions: string[];
  pending: { id: string; text: string; recipient: string; mentions: string[] } | null;
};
export { TeamAvatar } from "./arc-team-avatar.js";
import { TeamAvatar } from "./arc-team-avatar.js";
function failure(code: string, tr: Tr) {
  const recovery = billingRecovery(code);
  if (recovery) return tr(...recovery.message);
  if (/PAID_MODEL/.test(code)) return tr("arc.teams.arcTeamChat.yourAccountNeedsAnEligibleModel");
  if (/MEMBER|ACCESS_REVOKED|SCOPE/.test(code))
    return tr("arc.teams.arcTeamChat.anAgentSAccessChangedReview");
  return tr("arc.teams.arcTeamChat.couldNotCompleteThisRequestYour");
}
export function ArcTeamChat({
  accountId,
  roomId,
  tr,
  onBack,
  drafts,
  onOpenRoom,
}: {
  accountId: string;
  roomId: string;
  tr: Tr;
  onBack: () => void;
  drafts?: Record<string, TeamChatDraft>;
  onOpenRoom?: (roomId: string) => void;
}) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null),
    [service, setService] = useState<ChatService | null>(null),
    [text, setText] = useState(drafts?.[roomId]?.text || ""),
    [recipient, setRecipient] = useState(drafts?.[roomId]?.recipient || "auto"),
    [mentions, setMentions] = useState<string[]>(drafts?.[roomId]?.mentions || []),
    [query, setQuery] = useState<{ start: number; end: number; text: string } | null>(null),
    [choice, setChoice] = useState(0),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0),
    [earlier, setEarlier] = useState<History | null>(null),
    [loadingEarlier, setLoadingEarlier] = useState(false);
  const generation = useRef(0),
    pending = useRef<TeamChatDraft["pending"]>(drafts?.[roomId]?.pending || null),
    lock = useRef(false),
    bottom = useRef<HTMLDivElement>(null),
    messageCount = useRef(0),
    roomKey = useRef(""),
    nearBottom = useRef(true),
    editor = useRef<HTMLTextAreaElement>(null),
    latestDraft = useRef<TeamChatDraft>({ text, recipient, mentions, pending: pending.current });
  latestDraft.current = { text, recipient, mentions, pending: pending.current };
  useEffect(
    () => () => {
      if (drafts) drafts[roomId] = latestDraft.current;
    },
    [drafts, roomId],
  );
  useEffect(() => {
    const version = ++generation.current,
      controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (roomKey.current !== accountId + ":" + roomId) {
      roomKey.current = accountId + ":" + roomId;
      setSnapshot(null);
      setService(null);
      setEarlier(null);
      setLoadingEarlier(false);
      setText(drafts?.[roomId]?.text || "");
      setRecipient(drafts?.[roomId]?.recipient || "auto");
      setMentions(drafts?.[roomId]?.mentions || []);
      pending.current = drafts?.[roomId]?.pending || null;
      lock.current = false;
      setBusy(false);
      nearBottom.current = true;
    }
    setError("");
    async function refresh() {
      try {
        const [current, status] = await Promise.all([
          arcRequest<Snapshot>("rooms/" + roomId, undefined, controller.signal),
          arcRequest<ChatService>("status", undefined, controller.signal),
        ]);
        if (controller.signal.aborted || generation.current !== version) return;
        setSnapshot(current);
        setService(status);
        timer = setTimeout(
          () => void refresh(),
          current.runs.some((run) => ["queued", "thinking", "working"].includes(run.status)) ||
            current.deliveries.some((delivery) => ["queued", "claimed"].includes(delivery.status))
            ? 1200
            : 5000,
        );
      } catch (error) {
        if (!controller.signal.aborted && generation.current === version) {
          setError((error as Error).message);
          timer = setTimeout(() => void refresh(), 6000);
        }
      }
    }
    void refresh();
    return () => {
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [accountId, roomId, tr, revision]);
  useEffect(() => {
    if (snapshot && snapshot.messages.length !== messageCount.current) {
      if (nearBottom.current)
        bottom.current?.scrollIntoView({ behavior: "instant", block: "nearest" });
      messageCount.current = snapshot.messages.length;
    }
  }, [snapshot]);
  async function send(event: FormEvent) {
    event.preventDefault();
    const value = text.trim();
    if (!value || lock.current || !snapshot) return;
    const version = generation.current;
    lock.current = true;
    setBusy(true);
    setError("");
    const draft =
      pending.current?.text === value &&
      pending.current.recipient === recipient &&
      JSON.stringify(pending.current.mentions) === JSON.stringify(mentions)
        ? pending.current
        : { id: crypto.randomUUID(), text: value, recipient, mentions: [...mentions] };
    pending.current = draft;
    try {
      await arcRequest("rooms/" + roomId + "/messages", {
        method: "POST",
        body: JSON.stringify({
          requestId: draft.id,
          text: draft.text,
          ...(draft.mentions.length
            ? { employeeIds: draft.mentions }
            : ["auto", "all"].includes(draft.recipient)
              ? { audience: draft.recipient }
              : { employeeIds: [draft.recipient] }),
        }),
      });
      if (generation.current !== version) return;
      setText((current) => (current.trim() === draft.text ? "" : current));
      setMentions([]);
      setQuery(null);
      pending.current = null;
      nearBottom.current = true;
      const current = await arcRequest<Snapshot>("rooms/" + roomId);
      if (generation.current === version) {
        setSnapshot(current);
        setRevision((value) => value + 1);
      }
    } catch (error) {
      if (generation.current === version) setError((error as Error).message);
    } finally {
      if (generation.current === version) {
        lock.current = false;
        setBusy(false);
      }
    }
  }
  async function action(action: "stop" | "resume" | "trial") {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    const version = generation.current;
    try {
      await arcRequest(action === "trial" ? "trial" : "rooms/" + roomId + "/" + action, {
        method: "POST",
        body: JSON.stringify(action === "trial" ? { confirm: true } : {}),
      });
      if (version === generation.current) setRevision((value) => value + 1);
    } catch (error) {
      if (version === generation.current) setError((error as Error).message);
    } finally {
      if (version === generation.current) {
        lock.current = false;
        setBusy(false);
      }
    }
  }
  async function loadEarlier() {
    if (!snapshot || loadingEarlier) return;
    const version = generation.current;
    setLoadingEarlier(true);
    nearBottom.current = false;
    try {
      const page = await arcRequest<History>(
        "rooms/" +
          roomId +
          "/messages?before=" +
          encodeURIComponent(earlier?.before || snapshot.before || ""),
      );
      if (version === generation.current)
        setEarlier((previous) => ({
          ...page,
          messages: [...page.messages, ...(previous?.messages || [])],
        }));
    } catch (error) {
      if (version === generation.current) setError((error as Error).message);
    } finally {
      if (version === generation.current) setLoadingEarlier(false);
    }
  }
  const mentionChoices = query
    ? snapshot?.employees.filter(
        (employee) =>
          !mentions.includes(employee.id) &&
          (employee.name + " " + employee.responsibility)
            .toLocaleLowerCase()
            .includes(query.text.toLocaleLowerCase()),
      ) || []
    : [];
  function edit(value: string, caret: number) {
    setText(value);
    const match = value.slice(0, caret).match(/(?:^|\s)@([^\s@]{0,60})$/u);
    setQuery(match ? { start: caret - match[1]!.length - 1, end: caret, text: match[1]! } : null);
    setChoice(0);
  }
  function mention(id: string) {
    if (!query) return;
    const next = text.slice(0, query.start) + text.slice(query.end);
    setText(next);
    setMentions((current) => (current.includes(id) ? current : [...current, id]));
    setQuery(null);
    requestAnimationFrame(() => {
      editor.current?.focus();
      editor.current?.setSelectionRange(query.start, query.start);
    });
  }
  const messages = [
    ...new Map(
      [...(earlier?.messages || []), ...(snapshot?.messages || [])].map((message) => [
        message.id,
        message,
      ]),
    ).values(),
  ].filter((message) => !(message.role === "assistant" && message.id.endsWith(":intent")));
  const active = snapshot?.runs.find((run) =>
      ["queued", "thinking", "working"].includes(run.status),
    ),
    working = active && snapshot?.employees.find((employee) => employee.id === active.employeeId),
    paused = snapshot?.turns.some((turn) => turn.status === "paused");
  return (
    <section className="arcTeamConversation">
      <header className="arcTeamConversationHeader">
        <button type="button" className="ghostButton" onClick={onBack}>
          ← {tr("arc.teams.arcTeamChat.conversations")}
        </button>
        <div>
          <h1>{snapshot?.room.name || tr("arc.teams.arcTeamChat.conversation")}</h1>
          {snapshot && <p>{snapshot.employees.map((employee) => employee.name).join(" · ")}</p>}
        </div>
        {snapshot && (
          <details className="arcTeamRoomDetails">
            <summary>{tr("arc.teams.arcTeamChat.details")}</summary>
            <div>
              {snapshot.employees.map((employee) => (
                <p key={employee.id}>
                  <strong>{employee.name}</strong>
                  <span>{employee.responsibility}</span>
                </p>
              ))}
              <small>{tr("arc.teams.arcTeamChat.messagesAgentHandoffsAndActualTool")}</small>
            </div>
          </details>
        )}
      </header>
      {error && (
        <div className="arcTeamAlert" role="alert">
          <p>{failure(error, tr)}</p>
          <BillingRecoveryActions code={error} tr={tr} />
          <button type="button" onClick={() => setRevision((value) => value + 1)}>
            {tr("arc.teams.arcTeamChat.refreshStatus")}
          </button>
        </div>
      )}
      {!snapshot ? (
        <WorkspaceLoading variant="rows" label={tr("arc.teams.arcTeamChat.openingConversation")} />
      ) : (
        <>
          <div
            className="arcTeamConversationMessages"
            onScroll={(event) => {
              const element = event.currentTarget;
              nearBottom.current =
                element.scrollHeight - element.scrollTop - element.clientHeight < 100;
            }}
            role="log"
            aria-live="polite"
            aria-relevant="additions"
            aria-label={tr("arc.teams.arcTeamChat.conversationMessages")}
          >
            {(earlier?.hasMore ?? snapshot.hasMore) && (
              <button
                className="ghostButton arcTeamLoadEarlier"
                type="button"
                disabled={loadingEarlier}
                onClick={() => void loadEarlier()}
              >
                {loadingEarlier
                  ? tr("arc.teams.arcTeamChat.loading")
                  : tr("arc.teams.arcTeamChat.loadEarlierMessages")}
              </button>
            )}
            {!messages.length && (
              <div className="arcTeamConversationEmpty">
                <h2>{tr("arc.teams.arcTeamChat.startAConversation")}</h2>
                <p>{tr("arc.teams.arcTeamChat.askAQuestionShareAnIdea")}</p>
              </div>
            )}
            {messages.map((message) => {
              const author =
                  message.role === "user"
                    ? tr("arc.teams.arcTeamChat.you")
                    : message.speaker?.name || tr("arc.teams.arcTeamChat.agent"),
                handoff = ["message_employee", "delegate_work"].includes(message.tool || ""),
                assignment = handoff ? handoffResult(message.result) : null,
                target = handoff
                  ? snapshot.employees.find(
                      (employee) =>
                        employee.id === (message.arguments as { employeeId?: string })?.employeeId,
                    )
                  : null;
              if (message.role === "tool" && !handoff)
                return (
                  <details className="arcTeamToolObservation" key={message.id}>
                    <summary>
                      <span>{author}</span> · {message.text || message.tool}
                      <small>
                        {message.status === "completed"
                          ? tr("arc.teams.arcTeamChat.returned")
                          : message.status === "running"
                            ? tr("arc.teams.arcTeamChat.working")
                            : tr("arc.teams.arcTeamChat.needsReview")}
                      </small>
                    </summary>
                    <p>{tr("arc.teams.arcTeamChat.input")}</p>
                    <pre>{JSON.stringify(message.arguments, null, 2)}</pre>
                    <p>{tr("arc.teams.arcTeamChat.observation")}</p>
                    <pre>
                      {typeof message.result === "string"
                        ? message.result
                        : JSON.stringify(message.result, null, 2)}
                    </pre>
                  </details>
                );
              return (
                <article className={"arcTeamConversationMessage " + message.role} key={message.id}>
                  {message.speaker && <TeamAvatar employee={message.speaker} />}
                  <div>
                    <header>
                      <strong>
                        {author}
                        {handoff &&
                          " → " +
                            (target?.name ||
                              assignment?.target?.name ||
                              tr("arc.teams.arcTeamChat.agent"))}
                      </strong>
                      <time dateTime={message.created_at}>
                        {new Date(message.created_at).toLocaleTimeString(undefined, {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </time>
                    </header>
                    {message.role === "user" && message.recipients?.length ? (
                      <div className="arcTeamRecipientBadges">
                        {message.recipients.map((person) => (
                          <span key={person.id}>@{person.name}</span>
                        ))}
                      </div>
                    ) : null}
                    <div className="arcTeamMessageMarkdown">
                      <Markdown
                        remarkPlugins={plugins}
                        skipHtml
                        components={{
                          a: ({ href, children }) => (
                            <a href={href} target="_blank" rel="noopener noreferrer">
                              {children}
                            </a>
                          ),
                        }}
                      >
                        {handoff
                          ? String(
                              (message.arguments as { message?: string; instructions?: string })
                                ?.message ||
                                (message.arguments as { instructions?: string })?.instructions ||
                                message.text,
                            )
                          : message.text}
                      </Markdown>
                    </div>
                    {handoff && (
                      <div className="arcTeamHandoffStatus">
                        <span>
                          {assignment?.queued
                            ? tr("arc.teams.arcTeamChat.workHandedOff")
                            : tr("arc.teams.arcTeamChat.handoffNeedsAttention")}
                        </span>
                        {assignment?.queued && assignment.roomId && (
                          <a
                            href={
                              "/dashboard/agent/teams?room=" + encodeURIComponent(assignment.roomId)
                            }
                            onClick={(event) => {
                              if (
                                onOpenRoom &&
                                !event.ctrlKey &&
                                !event.metaKey &&
                                !event.shiftKey &&
                                !event.altKey
                              ) {
                                event.preventDefault();
                                onOpenRoom(assignment.roomId!);
                              }
                            }}
                          >
                            {tr("arc.teams.arcTeamChat.openConversation")} →
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
            {snapshot.runs
              .filter((run) => ["failed", "unknown"].includes(run.status))
              .map((run) => (
                <details className="arcTeamRunProblem" key={run.id}>
                  <summary>
                    {snapshot.employees.find((employee) => employee.id === run.employeeId)?.name ||
                      tr("arc.teams.arcTeamChat.agent")}{" "}
                    ·{" "}
                    {run.status === "unknown"
                      ? tr("arc.teams.arcTeamChat.resultNeedsChecking")
                      : tr("arc.teams.arcTeamChat.workNeedsAttention")}
                  </summary>
                  <p>{failure(run.error || "", tr)}</p>
                  <BillingRecoveryActions code={run.error || ""} tr={tr} />
                  <small>
                    {run.error} · {run.id}
                  </small>
                </details>
              ))}
            {active && (
              <p className="arcTeamLiveStatus" role="status">
                <span className="arcTeamPulse" aria-hidden="true" />
                {working?.name || tr("arc.teams.arcTeamChat.anAgent")}
                {active.status === "working"
                  ? tr("arc.teams.arcTeamChat.isWorking")
                  : tr("arc.teams.arcTeamChat.isThinking")}
              </p>
            )}
            <div ref={bottom} />
          </div>
          {service && !service.access.canUse && service.access.status !== "eligible" && (
            <p className="arcTeamAlert" role="status">
              {tr("arc.teams.arcTeamChat.yourAccountNeedsAnActivePlan")}{" "}
              <a href="/checkout">{tr("arc.teams.arcTeamChat.viewPlans")}</a>
            </p>
          )}
          {paused && (
            <div className="arcTeamAlert">
              {tr("arc.teams.arcTeamChat.thisConversationHasPausedCheckAccount")}
              <button type="button" disabled={busy} onClick={() => void action("resume")}>
                {tr("arc.teams.arcTeamChat.resume")}
              </button>
            </div>
          )}
          <form className="arcTeamComposer" onSubmit={(event) => void send(event)}>
            <label className="srOnly" htmlFor="arc-team-message">
              {tr("arc.teams.arcTeamChat.message")}
            </label>
            {mentions.length > 0 && (
              <div className="arcTeamMentionBadges">
                {mentions.map((id) => {
                  const employee = snapshot.employees.find((employee) => employee.id === id);
                  return (
                    <span key={id}>
                      @{employee?.name || tr("arc.teams.arcTeamChat.agent")}
                      <button
                        type="button"
                        aria-label={
                          tr("arc.teams.arcTeamChat.removeMention") + ": " + (employee?.name || id)
                        }
                        onClick={() =>
                          setMentions((current) => current.filter((value) => value !== id))
                        }
                      >
                        ×
                      </button>
                    </span>
                  );
                })}
              </div>
            )}
            {query && mentionChoices.length > 0 && (
              <div
                className="arcTeamMentionMenu"
                role="listbox"
                id="arc-team-mentions"
                aria-label={tr("arc.teams.arcTeamChat.mentionAnAgent")}
              >
                {mentionChoices.slice(0, 8).map((employee, index) => (
                  <button
                    type="button"
                    role="option"
                    id={"arc-team-mention-" + index}
                    aria-selected={choice === index}
                    key={employee.id}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => mention(employee.id)}
                  >
                    <TeamAvatar employee={employee} size={27} />
                    <span>
                      <strong>{employee.name}</strong>
                      <small>{employee.responsibility}</small>
                    </span>
                  </button>
                ))}
              </div>
            )}
            <textarea
              ref={editor}
              id="arc-team-message"
              aria-autocomplete="list"
              aria-controls={query && mentionChoices.length ? "arc-team-mentions" : undefined}
              aria-activedescendant={
                query && mentionChoices.length ? "arc-team-mention-" + choice : undefined
              }
              rows={3}
              maxLength={6000}
              value={text}
              onChange={(event) => edit(event.target.value, event.target.selectionStart)}
              placeholder={tr("arc.teams.arcTeamChat.talkToYourTeamTypeTo")}
              onKeyDown={(event) => {
                if (query && mentionChoices.length) {
                  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                    event.preventDefault();
                    setChoice(
                      (current) =>
                        (current +
                          (event.key === "ArrowDown" ? 1 : -1) +
                          Math.min(8, mentionChoices.length)) %
                        Math.min(8, mentionChoices.length),
                    );
                    return;
                  }
                  if (event.key === "Escape") {
                    event.preventDefault();
                    setQuery(null);
                    return;
                  }
                  if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    mention(mentionChoices[Math.min(choice, mentionChoices.length - 1)]!.id);
                    return;
                  }
                }
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  void send(event as unknown as FormEvent);
                }
              }}
            />
            <footer>
              <label>
                {tr("arc.teams.arcTeamChat.to")}{" "}
                <select
                  aria-label={tr("arc.teams.arcTeamChat.messageRecipients")}
                  value={mentions.length ? "mentions" : recipient}
                  onChange={(event) => {
                    setRecipient(event.target.value);
                    setMentions([]);
                  }}
                >
                  {mentions.length > 0 && (
                    <option value="mentions">{tr("arc.teams.arcTeamChat.mentionedAgents")}</option>
                  )}
                  <option value="auto">{tr("arc.teams.arcTeamChat.auto")}</option>
                  <option value="all">
                    {snapshot.room.kind === "direct"
                      ? snapshot.employees[0]?.name
                      : tr("arc.teams.arcTeamChat.everyone")}
                  </option>
                  {snapshot.room.kind !== "direct" &&
                    snapshot.employees.map((employee) => (
                      <option key={employee.id} value={employee.id}>
                        {employee.name}
                      </option>
                    ))}
                </select>
              </label>
              <span>{tr("arc.teams.arcTeamChat.usesYourExistingCredits")}</span>
              {active && (
                <button
                  type="button"
                  className="ghostButton"
                  onClick={() => void action("stop")}
                  disabled={busy}
                >
                  {tr("arc.teams.arcTeamChat.stop")}
                </button>
              )}
              {service?.access.status === "eligible" ? (
                <button
                  type="button"
                  className="addButton arcRadiantCta"
                  onClick={() => void action("trial")}
                  disabled={busy}
                >
                  {tr("arc.teams.arcTeamChat.startTrial")}
                </button>
              ) : (
                <button
                  type="submit"
                  className="addButton arcRadiantCta"
                  disabled={
                    busy ||
                    !text.trim() ||
                    !snapshot.employees.length ||
                    !service?.enabled ||
                    !service.access.canUse
                  }
                >
                  {busy ? tr("arc.teams.arcTeamChat.sending") : tr("arc.teams.arcTeamChat.send")} ↑
                </button>
              )}
            </footer>
          </form>
        </>
      )}
    </section>
  );
}
