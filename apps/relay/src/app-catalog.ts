import { z } from "zod";
import { EXTRA_PROVIDERS, EXTRA_OPERATIONS, EXTRA_PROVIDER_IDS, APP_CATEGORIES } from "./app-integrations.js";
export { APP_CATEGORIES };

export const CORE_APP_PROVIDERS = ["github", "slack", "gmail", "outlook", "google_calendar", "microsoft_calendar"] as const;
export const APP_PROVIDERS = [...CORE_APP_PROVIDERS, ...EXTRA_PROVIDER_IDS] as const;
export type AppProvider = typeof APP_PROVIDERS[number];
export type AppPermission = "read" | "write";
export type AppEnv = { DB: D1Database; PUBLIC_ORIGIN: string; APP_ORIGIN?: string; ENABLE_APPS?: string; APP_TOKEN_KEY?: string; APP_META_GRAPH_VERSION?: string; APP_GOOGLE_ADS_DEVELOPER_TOKEN?: string; APP_DAILY_PROVIDER_LIMIT?: string } & Partial<Record<`APP_${string}_CLIENT_${"ID" | "SECRET"}`, string>>;
export class AppError extends Error {
  constructor(public code: string, public status = 400) { super(code); }
}
export const providerSchema = z.enum(APP_PROVIDERS);
export const permissionSchema = z.array(z.enum(["read", "write"])).min(1).max(2).transform(v => [...new Set(["read" as const, ...v])]);
export type AppContext = { shopDomain?: string; instanceOrigin?: string; cloudIds?: string[]; graphVersion?: string; businessAccountId?: string; phoneNumberId?: string; subjectId?: string };
export type AppQuote = { payer: string; unit: string; estimatedUnits: number; maximumApprovedUnits: number; model?: string; pricingUrl: string };
export type ProviderDefinition = { name: string; brand: string; authorize: string; token: string; credential: string; scopes: Record<AppPermission, string[]>; pkce: boolean; auth?: "oauth" | "api_key"; category?: string; requiredEnv?: string[]; payer?: string; billingNote?: string; connectionNote?: string };
const googleRead = "https://www.googleapis.com/auth/";
export const APP_CATALOG: Record<AppProvider, ProviderDefinition> = {
  github: { category: "development", name: "GitHub", brand: "github", authorize: "https://github.com/login/oauth/authorize", token: "https://github.com/login/oauth/access_token", credential: "GITHUB", scopes: { read: ["read:user", "repo", "offline_access"], write: [] }, pkce: true },
  slack: { category: "communication", name: "Slack", brand: "slack", authorize: "https://slack.com/oauth/v2/authorize", token: "https://slack.com/api/oauth.v2.access", credential: "SLACK", scopes: { read: ["channels:read", "channels:history", "search:read"], write: ["chat:write"] }, pkce: false },
  gmail: { category: "email_calendar", name: "Gmail", brand: "gmail", authorize: "https://accounts.google.com/o/oauth2/v2/auth", token: "https://oauth2.googleapis.com/token", credential: "GOOGLE", scopes: { read: [googleRead + "gmail.readonly"], write: [googleRead + "gmail.modify"] }, pkce: true },
  outlook: { category: "email_calendar", name: "Outlook", brand: "microsoftoutlook", authorize: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize", token: "https://login.microsoftonline.com/common/oauth2/v2.0/token", credential: "MICROSOFT", scopes: { read: ["offline_access", "User.Read", "Mail.Read"], write: ["Mail.ReadWrite", "Mail.Send"] }, pkce: true },
  google_calendar: { category: "email_calendar", name: "Google Calendar", brand: "googlecalendar", authorize: "https://accounts.google.com/o/oauth2/v2/auth", token: "https://oauth2.googleapis.com/token", credential: "GOOGLE", scopes: { read: [googleRead + "calendar.readonly"], write: [googleRead + "calendar.events"] }, pkce: true },
  microsoft_calendar: { category: "email_calendar", name: "Outlook Calendar", brand: "microsoftoutlook", authorize: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize", token: "https://login.microsoftonline.com/common/oauth2/v2.0/token", credential: "MICROSOFT", scopes: { read: ["offline_access", "User.Read", "Calendars.Read"], write: ["Calendars.ReadWrite"] }, pkce: true },
  ...EXTRA_PROVIDERS,
};
export function credentials(env: AppEnv, provider: AppProvider) {
  const definition = APP_CATALOG[provider];
  if (definition.auth === "api_key") throw new AppError("app_uses_api_key");
  if (definition.requiredEnv?.some(key => !(env as Record<string, unknown>)[key])) throw new AppError("app_not_configured", 503);
  const prefix = definition.credential;
  const id = env[`APP_${prefix}_CLIENT_ID`];
  const secret = env[`APP_${prefix}_CLIENT_SECRET`];
  if (!id || !secret || !env.APP_TOKEN_KEY) throw new AppError("app_not_configured", 503);
  return { id, secret };
}
export const appScopes = (provider: AppProvider, permissions: AppPermission[]) => [...new Set(permissions.flatMap(p => APP_CATALOG[provider].scopes[p]))];

const text = z.string().min(1).max(4000);
const id = z.string().min(1).max(512).refine(v => !/[\r\n]/.test(v));
const page = z.number().int().min(1).max(100).default(30);
const repo = z.string().regex(/^[\w.-]+\/[\w.-]+$/).refine(v => !v.split("/").some(p => p === "." || p === ".."));
const email = z.string().email().max(320);
const header = z.string().min(1).max(300).refine(v => !/[\r\n]/.test(v));
const compose = z.object({ to: z.array(email).min(1).max(20), subject: header, body: z.string().max(50000) }).strict();
const calendarId = id.default("primary");
const dateTime = z.string().datetime({ offset: true });
const event = z.object({ summary: header, start: dateTime, end: dateTime, timeZone: z.string().max(100).default("UTC"), attendees: z.array(email).max(20).default([]) }).strict().refine(v => Date.parse(v.end) > Date.parse(v.start), "end must follow start");
export type RequestPlan = { url: string; method: "GET" | "POST" | "PATCH" | "DELETE" | "PUT"; body?: unknown; headers?: Record<string,string>; responseKind?: "json" | "text" };
export type AppOperation = { provider: AppProvider; name: string; description: string; permission: AppPermission; schema: z.ZodType; request: (a: any, context?: AppContext) => RequestPlan; quote?: (a: any) => AppQuote };
const operations: AppOperation[] = [];
function op(provider: AppProvider, name: string, description: string, schema: z.ZodType, request: (a: any) => RequestPlan, permission: AppPermission = "read") { operations.push({ provider, name, description, schema, request, permission }); }
const encode = encodeURIComponent;
const ghRepo = (r: string) => r.split("/").map(encode).join("/");
const url = (base: string, query: Record<string, unknown> = {}) => { const u = new URL(base); Object.entries(query).forEach(([k, v]) => { if (v !== undefined) u.searchParams.set(k, String(v)); }); return u.toString(); };
const gh = "https://api.github.com";
const slack = "https://slack.com/api/";
const gmail = "https://gmail.googleapis.com/gmail/v1/users/me";
const graph = "https://graph.microsoft.com/v1.0/me";
op("github", "repositories.list", "List accessible repositories", z.object({ limit: page }).strict(), a => ({ url: url(gh + "/user/repos", { per_page: a.limit, sort: "updated" }), method: "GET" }));
for (const [name, path, description] of [["issues.list", "issues", "List repository issues"], ["pulls.list", "pulls", "List pull requests"], ["actions.list", "actions/runs", "List Actions runs"]]) {
  op("github", name!, description!, z.object({ repo, limit: page }).strict(), a => ({ url: url(`${gh}/repos/${ghRepo(a.repo)}/${path}`, { per_page: a.limit }), method: "GET" }));
}
op("github", "contents.read", "Read repository content", z.object({ repo, path: z.string().max(500).refine(v => !v.split("/").some(p => p === "..") && !v.startsWith("/")), ref: id.optional() }).strict(), a => ({ url: url(`${gh}/repos/${ghRepo(a.repo)}/contents/${a.path.split("/").map(encode).join("/")}`, { ref: a.ref }), method: "GET" }));
op("github", "issues.create", "Create a repository issue", z.object({ repo, title: header, body: text }).strict(), a => ({ url: `${gh}/repos/${ghRepo(a.repo)}/issues`, method: "POST", body: { title: a.title, body: a.body } }), "write");
op("slack", "channels.list", "List public channels", z.object({ limit: page, cursor: id.optional() }).strict(), a => ({ url: url(slack + "conversations.list", { limit: a.limit, cursor: a.cursor, types: "public_channel" }), method: "GET" }));
op("slack", "channels.get", "Inspect a channel before approving a message", z.object({ channel: id }).strict(), a => ({ url: url(slack + "conversations.info", { channel: a.channel }), method: "GET" }));
op("slack", "messages.list", "Read channel messages", z.object({ channel: id, limit: page, cursor: id.optional() }).strict(), a => ({ url: url(slack + "conversations.history", a), method: "GET" }));
op("slack", "search", "Search workspace messages", z.object({ query: text, limit: page }).strict(), a => ({ url: url(slack + "search.messages", { query: a.query, count: a.limit }), method: "GET" }));
op("slack", "messages.send", "Send a channel message", z.object({ channel: id, text: text }).strict(), a => ({ url: slack + "chat.postMessage", method: "POST", body: { ...a, unfurl_links: false, unfurl_media: false } }), "write");
op("gmail", "messages.list", "Search email messages", z.object({ query: text.optional(), limit: page, pageToken: id.optional() }).strict(), a => ({ url: url(gmail + "/messages", { q: a.query, maxResults: a.limit, pageToken: a.pageToken }), method: "GET" }));
op("gmail", "messages.get", "Read one email message", z.object({ id }).strict(), a => ({ url: `${gmail}/messages/${encode(a.id)}?format=full`, method: "GET" }));
const base64Utf8 = (value: string) => {
  const bytes = new TextEncoder().encode(value); let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  return btoa(binary);
};
const rawMail = (a: z.infer<typeof compose>) => {
  const body = base64Utf8(a.body).match(/.{1,76}/g)?.join("\r\n") || "";
  return base64Utf8(`To: ${a.to.join(", ")}\r\nSubject: =?UTF-8?B?${base64Utf8(a.subject)}?=\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${body}`).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
op("gmail", "drafts.create", "Create an email draft", compose, a => ({ url: gmail + "/drafts", method: "POST", body: { message: { raw: rawMail(a) } } }), "write");
op("gmail", "messages.send", "Send the exact reviewed email", compose, a => ({ url: gmail + "/messages/send", method: "POST", body: { raw: rawMail(a) } }), "write");
op("gmail", "messages.modify", "Add or remove message labels", z.object({ id, addLabelIds: z.array(id).max(20).default([]), removeLabelIds: z.array(id).max(20).default([]) }).strict(), a => ({ url: `${gmail}/messages/${encode(a.id)}/modify`, method: "POST", body: { addLabelIds: a.addLabelIds, removeLabelIds: a.removeLabelIds } }), "write");
op("outlook", "messages.list", "Search Outlook email", z.object({ query: text.optional(), limit: page }).strict(), a => ({ url: url(graph + "/messages", { "$top": a.limit, "$search": a.query ? JSON.stringify(a.query) : undefined }), method: "GET" }));
op("outlook", "messages.get", "Read an Outlook message", z.object({ id }).strict(), a => ({ url: `${graph}/messages/${encode(a.id)}`, method: "GET" }));
op("outlook", "drafts.create", "Create an Outlook draft", compose, a => ({ url: graph + "/messages", method: "POST", body: { subject: a.subject, body: { contentType: "Text", content: a.body }, toRecipients: a.to.map((address: string) => ({ emailAddress: { address } })) } }), "write");
op("outlook", "messages.send", "Send the exact reviewed Outlook email", compose, a => ({ url: graph + "/sendMail", method: "POST", body: { message: { subject: a.subject, body: { contentType: "Text", content: a.body }, toRecipients: a.to.map((address: string) => ({ emailAddress: { address } })) }, saveToSentItems: true } }), "write");
for (const provider of ["google_calendar", "microsoft_calendar"] as const) {
  const google = provider === "google_calendar";
  const base = google ? "https://www.googleapis.com/calendar/v3" : graph;
  op(provider, "calendars.list", "List calendars", z.object({ limit: page }).strict(), a => ({ url: url(base + (google ? "/users/me/calendarList" : "/calendars"), { [google ? "maxResults" : "$top"]: a.limit }), method: "GET" }));
  const path = (calendar: string) => google ? `${base}/calendars/${encode(calendar)}/events` : calendar === "primary" ? `${base}/calendar/events` : `${base}/calendars/${encode(calendar)}/events`;
  op(provider, "events.list", "List calendar events", z.object({ calendar: calendarId, limit: page, after: dateTime.optional(), before: dateTime.optional() }).strict(), a => ({ url: url(path(a.calendar), google ? { maxResults: a.limit, timeMin: a.after, timeMax: a.before } : { "$top": a.limit, "$filter": [a.after && `start/dateTime ge '${a.after}'`, a.before && `end/dateTime le '${a.before}'`].filter(Boolean).join(" and ") || undefined }), method: "GET" }));
  op(provider, "events.get", "Read an event and its current version", z.object({ calendar: calendarId, id }).strict(), a => ({ url: `${path(a.calendar)}/${encode(a.id)}`, method: "GET" }));
  const body = (v: z.infer<typeof event>) => google ? { summary: v.summary, start: { dateTime: v.start, timeZone: v.timeZone }, end: { dateTime: v.end, timeZone: v.timeZone }, attendees: v.attendees.map(email => ({ email })) } : { subject: v.summary, start: { dateTime: v.start, timeZone: v.timeZone }, end: { dateTime: v.end, timeZone: v.timeZone }, attendees: v.attendees.map(address => ({ emailAddress: { address }, type: "required" })) };
  op(provider, "events.create", "Create an event or meeting", z.object({ calendar: calendarId, event }).strict(), a => ({ url: path(a.calendar), method: "POST", body: body(a.event) }), "write");
  op(provider, "events.update", "Update an event or meeting", z.object({ calendar: calendarId, id, event }).strict(), a => ({ url: `${path(a.calendar)}/${encode(a.id)}`, method: "PATCH", body: body(a.event) }), "write");
  op(provider, "events.delete", "Delete a calendar event", z.object({ calendar: calendarId, id }).strict(), a => ({ url: `${path(a.calendar)}/${encode(a.id)}`, method: "DELETE" }), "write");
}
export const APP_OPERATIONS = [...operations, ...EXTRA_OPERATIONS];
export function appOperation(provider: AppProvider, name: string) { const value = APP_OPERATIONS.find(o => o.provider === provider && o.name === name); if (!value) throw new AppError("unsupported_app_operation"); return value; }
