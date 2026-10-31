export type ArcChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

export type ArcChatSession = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  objective: string;
  criteria: string;
  messages: ArcChatMessage[];
};

const MAX_SESSIONS = 30;
const MAX_MESSAGES = 32;
const MAX_MESSAGE_LENGTH = 6000;
const SESSION_VERSION = 1;
export const arcChatStorageKey = (accountId: string) => "arc-chat-drafts-v1:" + accountId;

// This intentionally stores only user-authored goal drafts in this tab.
// These are NOT server-side Agent conversations, and they cannot execute tools.
export function loadArcChatSessions(accountId: string): ArcChatSession[] {
  try {
    if (!accountId || typeof sessionStorage === "undefined") return [];
    const data: unknown = JSON.parse(sessionStorage.getItem(arcChatStorageKey(accountId)) || "null");
    if (!data || typeof data !== "object" || Array.isArray(data)) return [];
    const record = data as { version?: unknown; sessions?: unknown };
    if (record.version !== SESSION_VERSION || !Array.isArray(record.sessions)) return [];
    return record.sessions.slice(0, MAX_SESSIONS).filter((value): value is ArcChatSession => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return false;
      const session = value as ArcChatSession;
      return typeof session.id === "string" && session.id.length <= 80
        && typeof session.title === "string" && session.title.length <= 90
        && typeof session.objective === "string" && session.objective.length <= MAX_MESSAGE_LENGTH
        && typeof session.criteria === "string" && session.criteria.length <= 2000
        && Number.isFinite(session.createdAt) && Number.isFinite(session.updatedAt)
        && Array.isArray(session.messages) && session.messages.length <= MAX_MESSAGES
        && session.messages.every(message => message && typeof message.id === "string" && message.id.length <= 80
          && (message.role === "user" || message.role === "assistant")
          && typeof message.content === "string" && message.content.length <= MAX_MESSAGE_LENGTH);
    }).sort((a, b) => b.updatedAt - a.updatedAt);
  } catch { return []; }
}

export function saveArcChatSessions(accountId: string, sessions: ArcChatSession[]) {
  try {
    if (!accountId || typeof sessionStorage === "undefined") return;
    sessionStorage.setItem(arcChatStorageKey(accountId), JSON.stringify({
      version: SESSION_VERSION,
      sessions: sessions.slice(0, MAX_SESSIONS).map(session => ({
        ...session,
        title: session.title.slice(0, 90),
        objective: session.objective.slice(0, MAX_MESSAGE_LENGTH),
        criteria: session.criteria.slice(0, 2000),
        messages: session.messages.slice(-MAX_MESSAGES).map(message => ({
          ...message, content: message.content.slice(0, MAX_MESSAGE_LENGTH),
        })),
      })),
    }));
  } catch { /* Private browsing or storage quota: keep this tab's in-memory state. */ }
}

export function arcChatTitle(objective: string) {
  const cleaned = objective.trim().replace(/\s+/g, " ");
  return cleaned.length > 48 ? cleaned.slice(0, 45).trimEnd() + "…" : cleaned || "Untitled chat";
}
