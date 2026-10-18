import { AppError, appOperation, type AppProvider } from "./app-catalog.js";
import { providerJson, type AppTokens } from "./app-oauth.js";
import { sha256Hex } from "./auth.js";

export type AppReview = { target: Record<string, unknown>; hash: string };
const stable = (value: unknown): string => value === null || typeof value !== "object" ? JSON.stringify(value) : Array.isArray(value) ? "[" + value.map(stable).join(",") + "]" : "{" + Object.keys(value).sort().map(key => JSON.stringify(key) + ":" + stable((value as Record<string, unknown>)[key])).join(",") + "}";
export function reviewRead(provider: AppProvider, operation: string, args: Record<string, unknown>) {
  if (provider === "slack") {
    if (["messages.send", "messages.schedule", "bookmarks.add"].includes(operation)) return { operation: "channels.get", args: { channel: args.channel || args.channel_id } };
    if (["messages.update", "messages.delete", "reactions.add", "reactions.remove", "pins.add", "pins.remove"].includes(operation)) return { operation: "messages.get", args: { channel: args.channel, ts: args.ts || args.timestamp } };
  }
  if (provider === "gmail" && operation === "messages.modify") return { operation: "messages.get", args: { id: args.id } };
  if ((provider === "google_calendar" || provider === "microsoft_calendar") && ["events.update", "events.delete"].includes(operation)) return { operation: "events.get", args: { calendar: args.calendar, id: args.id } };
  return null;
}
export async function loadAppReview(provider: AppProvider, operation: string, args: Record<string, unknown>, tokens: AppTokens, fetcher: typeof fetch): Promise<AppReview | null> {
  const read = reviewRead(provider, operation, args);
  if (!read) return null;
  const adapter = appOperation(provider, read.operation);
  const plan = adapter.request(adapter.schema.parse(read.args));
  const data = await providerJson(plan.url, { headers: { authorization: `Bearer ${tokens.accessToken}`, accept: "application/json", "user-agent": "Remote-Arc-Apps" } }, fetcher);
  let target: Record<string, unknown>;
  if (provider === "slack") {
    if (read.operation === "messages.get") {
      const message = data.messages?.find((item: Record<string, unknown>) => item.ts === read.args.ts);
      if (!message || typeof message.text !== "string") throw new AppError("app_review_unavailable", 502);
      target = { channel: args.channel, ts: message.ts, text: message.text, author: message.user || message.bot_id, edited: message.edited, blocks: message.blocks, attachments: message.attachments };
    } else {
      const channel = data.channel;
      if (!channel?.id || !(typeof channel.name === "string" || typeof channel.user === "string")) throw new AppError("app_review_unavailable", 502);
      target = { id: channel.id, name: channel.name || channel.user, directMessage: Boolean(channel.is_im), private: channel.is_private, archived: channel.is_archived };
    }
  } else if (provider === "gmail") {
    if (!data.id || !data.payload) throw new AppError("app_review_unavailable", 502);
    target = { id: data.id, threadId: data.threadId, message: data.payload };
  } else {
    const etag = data.etag || data["@odata.etag"];
    if (!data.id || typeof etag !== "string" || etag.length > 1024 || /[\r\n]/.test(etag)) throw new AppError("app_review_unavailable", 502);
    target = { id: data.id, etag, title: data.summary ?? data.subject, start: data.start, end: data.end, attendees: data.attendees, organizer: data.organizer, recurrence: data.recurrence, cancelled: data.isCancelled ?? (data.status === "cancelled") };
  }
  // Match the JSON value that will be encrypted and shown in the approval UI.
  target = JSON.parse(JSON.stringify(target)) as Record<string, unknown>;
  return { target, hash: await sha256Hex(stable(target)) };
}
export async function verifyAppReview(provider: AppProvider, operation: string, args: Record<string, unknown>, tokens: AppTokens, review: AppReview | null, fetcher: typeof fetch): Promise<Record<string, string>> {
  if (!reviewRead(provider, operation, args)) return {};
  if (!review) throw new AppError("app_review_unavailable", 409);
  const current = await loadAppReview(provider, operation, args, tokens, fetcher);
  if (!current || current.hash !== review.hash) throw new AppError("app_review_changed", 409);
  // Google documents conditional modification. Graph also receives its entity
  // tag; the preceding readback always checks the approved target explicitly.
  return typeof review.target.etag === "string" ? { "if-match": review.target.etag } : {};
}
