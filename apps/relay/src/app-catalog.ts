import { z } from "zod";
import type {PlatformLaunchEnv} from './platform-launch.js';
import { SLACK_SCOPES, SLACK_OPERATIONS } from "./app-slack.js";
import { EXTRA_PROVIDERS, EXTRA_OPERATIONS, EXTRA_PROVIDER_IDS, APP_CATEGORIES } from "./app-integrations.js";
export { APP_CATEGORIES };

export const CORE_APP_PROVIDERS = ["github", "slack", "gmail", "outlook", "google_calendar", "microsoft_calendar"] as const;
export const APP_PROVIDERS = [...CORE_APP_PROVIDERS, ...EXTRA_PROVIDER_IDS] as const;
export type AppProvider = typeof APP_PROVIDERS[number];
export type AppPermission = "read" | "write";
export type AppEnv = PlatformLaunchEnv & { DB: D1Database; PUBLIC_ORIGIN: string; APP_ORIGIN?: string; DASHBOARD_ORIGIN?: string; ENABLE_APPS?: string; APP_TOKEN_KEY?: string; APP_VERCEL_INTEGRATION_SLUG?: string; APP_META_GRAPH_VERSION?: string; APP_GOOGLE_ADS_DEVELOPER_TOKEN?: string; APP_DAILY_PROVIDER_LIMIT?: string; APP_PLATFORM_FUNDED_COSTS?:string } & Partial<Record<`APP_${string}_CLIENT_${"ID" | "SECRET"}`, string>>;
export class AppError extends Error {
  constructor(public code: string, public status = 400) { super(code); }
}
export const providerSchema = z.enum(APP_PROVIDERS);
export const permissionSchema = z.array(z.enum(["read", "write"])).min(1).max(2).transform(v => [...new Set(["read" as const, ...v])]);
export type AppContext = { vercelConfigurationId?: string; vercelTeamId?: string; supabaseOrganizationIds?: string[]; shopDomain?: string; instanceOrigin?: string; cloudIds?: string[]; graphVersion?: string; businessAccountId?: string; phoneNumberId?: string; subjectId?: string };
export type AppQuote = { payer: string; unit: string; estimatedUnits: number; maximumApprovedUnits: number; model?: string; pricingUrl: string };
export type ProviderDefinition = { name: string; brand: string; authorize: string; token: string; credential: string; scopes: Record<AppPermission, string[]>; pkce: boolean; auth?: "oauth" | "api_key"; category?: string; requiredEnv?: string[]; payer?: string; billingNote?: string; connectionNote?: string };
const googleRead = "https://www.googleapis.com/auth/";
export const APP_CATALOG: Record<AppProvider, ProviderDefinition> = {
  github: { category: "development", name: "GitHub", brand: "github", authorize: "https://github.com/login/oauth/authorize", token: "https://github.com/login/oauth/access_token", credential: "GITHUB", scopes: { read: ["read:user", "repo", "offline_access"], write: [] }, pkce: true },
  slack: { category: "communication", name: "Slack", brand: "slack", authorize: "https://slack.com/oauth/v2/authorize", token: "https://slack.com/api/oauth.v2.access", credential: "SLACK", scopes: SLACK_SCOPES, pkce: false },
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
export type AppOperation = { provider: AppProvider; name: string; description: string; permission: AppPermission; requiredScopes?: string[]; anyScopes?: string[]; schema: z.ZodType; request: (a: any, context?: AppContext) => RequestPlan; quote?: (a: any) => AppQuote };
const operations: AppOperation[] = [];
function op(provider: AppProvider, name: string, description: string, schema: z.ZodType, request: (a: any) => RequestPlan, permission: AppPermission = "read") { operations.push({ provider, name, description, schema, request, permission }); }
const encode = encodeURIComponent;
const ghRepo = (r: string) => r.split("/").map(encode).join("/");
const url = (base: string, query: Record<string, unknown> = {}) => { const u = new URL(base); Object.entries(query).forEach(([k, v]) => { if (v !== undefined) u.searchParams.set(k, String(v)); }); return u.toString(); };
const gh = "https://api.github.com";
const gmail = "https://gmail.googleapis.com/gmail/v1/users/me";
const graph = "https://graph.microsoft.com/v1.0/me";
op("github", "repositories.list", "List accessible repositories", z.object({ limit: page }).strict(), a => ({ url: url(gh + "/user/repos", { per_page: a.limit, sort: "updated" }), method: "GET" }));
for (const [name, path, description] of [["issues.list", "issues", "List repository issues"], ["actions.list", "actions/runs", "List Actions runs"]]) {
  op("github", name!, description!, z.object({ repo, limit: page }).strict(), a => ({ url: url(`${gh}/repos/${ghRepo(a.repo)}/${path}`, { per_page: a.limit }), method: "GET" }));
}
op("github", "pulls.list", "List pull requests", z.object({ repo, limit: page, state: z.enum(["open", "closed", "all"]).optional() }).strict(), a => ({ url: url(`${gh}/repos/${ghRepo(a.repo)}/pulls`, { per_page: a.limit, state: a.state }), method: "GET" }));
op("github", "contents.read", "Read repository content", z.object({ repo, path: z.string().max(500).refine(v => !v.split("/").some(p => p === "..") && !v.startsWith("/")), ref: id.optional() }).strict(), a => ({ url: url(`${gh}/repos/${ghRepo(a.repo)}/contents/${a.path.split("/").map(encode).join("/")}`, { ref: a.ref }), method: "GET" }));
op("github", "issues.create", "Create a repository issue", z.object({ repo, title: header, body: text }).strict(), a => ({ url: `${gh}/repos/${ghRepo(a.repo)}/issues`, method: "POST", body: { title: a.title, body: a.body } }), "write");
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
// Common follow-through actions, using the same encrypted connection and dispatch ledger.
op('github','issues.get','Read one issue',z.object({repo,number:z.number().int().positive()}).strict(),a=>({url:`${gh}/repos/${ghRepo(a.repo)}/issues/${a.number}`,method:'GET'}));
op('github','issues.update','Update an issue title, body or state',z.object({repo,number:z.number().int().positive(),title:header.optional(),body:text.optional(),state:z.enum(['open','closed']).optional()}).strict().refine(a=>a.title!==undefined||a.body!==undefined||a.state!==undefined),a=>({url:`${gh}/repos/${ghRepo(a.repo)}/issues/${a.number}`,method:'PATCH',body:{title:a.title,body:a.body,state:a.state}}),'write');
op('github','comments.list','Read issue or pull request comments',z.object({repo,number:z.number().int().positive(),limit:page}).strict(),a=>({url:url(`${gh}/repos/${ghRepo(a.repo)}/issues/${a.number}/comments`,{per_page:a.limit}),method:'GET'}));
op('github','comments.create','Comment on an issue or pull request',z.object({repo,number:z.number().int().positive(),body:text}).strict(),a=>({url:`${gh}/repos/${ghRepo(a.repo)}/issues/${a.number}/comments`,method:'POST',body:{body:a.body}}),'write');
op('github','pulls.get','Read a pull request and merge status',z.object({repo,number:z.number().int().positive()}).strict(),a=>({url:`${gh}/repos/${ghRepo(a.repo)}/pulls/${a.number}`,method:'GET'}));
op('github','pulls.files','Read changed files and patches in a pull request',z.object({repo,number:z.number().int().positive(),limit:page}).strict(),a=>({url:url(`${gh}/repos/${ghRepo(a.repo)}/pulls/${a.number}/files`,{per_page:a.limit}),method:'GET'}));
op('github','branches.list','List repository branches',z.object({repo,limit:page}).strict(),a=>({url:url(`${gh}/repos/${ghRepo(a.repo)}/branches`,{per_page:a.limit}),method:'GET'}));
op('github','actions.get','Read one Actions run',z.object({repo,id}).strict(),a=>({url:`${gh}/repos/${ghRepo(a.repo)}/actions/runs/${encode(a.id)}`,method:'GET'}));
op('github','actions.rerun','Rerun an Actions workflow',z.object({repo,id}).strict(),a=>({url:`${gh}/repos/${ghRepo(a.repo)}/actions/runs/${encode(a.id)}/rerun`,method:'POST'}),'write');
for(const [name,path]of [['labels.list','labels'],['drafts.list','drafts'],['threads.list','threads']] as const)op('gmail',name,'List Gmail '+path,z.object({limit:page,pageToken:id.optional()}).strict(),a=>({url:url(gmail+'/'+path,path==='labels'?{}:{maxResults:a.limit,pageToken:a.pageToken}),method:'GET'}));
op('gmail','threads.get','Read all messages in a Gmail thread',z.object({id}).strict(),a=>({url:`${gmail}/threads/${encode(a.id)}?format=full`,method:'GET'}));
op('gmail','drafts.get','Read an email draft',z.object({id}).strict(),a=>({url:`${gmail}/drafts/${encode(a.id)}`,method:'GET'}));
op('gmail','drafts.send','Send an existing email draft',z.object({id}).strict(),a=>({url:gmail+'/drafts/send',method:'POST',body:{id:a.id}}),'write');
op('gmail','drafts.delete','Delete an email draft',z.object({id}).strict(),a=>({url:`${gmail}/drafts/${encode(a.id)}`,method:'DELETE'}),'write');
op('gmail','messages.trash','Move an email to Trash',z.object({id}).strict(),a=>({url:`${gmail}/messages/${encode(a.id)}/trash`,method:'POST'}),'write');
op('gmail','messages.untrash','Restore an email from Trash',z.object({id}).strict(),a=>({url:`${gmail}/messages/${encode(a.id)}/untrash`,method:'POST'}),'write');
op('gmail','labels.create','Create an email label',z.object({name:header}).strict(),a=>({url:gmail+'/labels',method:'POST',body:{name:a.name,labelListVisibility:'labelShow',messageListVisibility:'show'}}),'write');
op('outlook','folders.list','List Outlook mail folders',z.object({limit:page}).strict(),a=>({url:url(graph+'/mailFolders',{'$top':a.limit}),method:'GET'}));
op('outlook','attachments.list','List message attachments',z.object({id}).strict(),a=>({url:`${graph}/messages/${encode(a.id)}/attachments`,method:'GET'}));
op('outlook','messages.reply','Reply to an Outlook message',z.object({id,comment:text}).strict(),a=>({url:`${graph}/messages/${encode(a.id)}/reply`,method:'POST',body:{comment:a.comment}}),'write');
op('outlook','messages.move','Move a message to an existing folder',z.object({id,destinationId:id}).strict(),a=>({url:`${graph}/messages/${encode(a.id)}/move`,method:'POST',body:{destinationId:a.destinationId}}),'write');
op('outlook','messages.markRead','Set the read state of a message',z.object({id,isRead:z.boolean()}).strict(),a=>({url:`${graph}/messages/${encode(a.id)}`,method:'PATCH',body:{isRead:a.isRead}}),'write');
op('outlook','drafts.send','Send an existing Outlook draft',z.object({id}).strict(),a=>({url:`${graph}/messages/${encode(a.id)}/send`,method:'POST'}),'write');
op('google_calendar','calendars.get','Read calendar details and time zone',z.object({calendar:calendarId}).strict(),a=>({url:'https://www.googleapis.com/calendar/v3/calendars/'+encode(a.calendar),method:'GET'}));
op('google_calendar','availability.query','Find busy intervals across calendars',z.object({calendars:z.array(id).min(1).max(20),start:dateTime,end:dateTime}).strict().refine(a=>Date.parse(a.end)>Date.parse(a.start)),a=>({url:'https://www.googleapis.com/calendar/v3/freeBusy',method:'POST',body:{timeMin:a.start,timeMax:a.end,items:a.calendars.map((id:string)=>({id}))}}));
op('microsoft_calendar','calendars.get','Read calendar details',z.object({id}).strict(),a=>({url:graph+'/calendars/'+encode(a.id),method:'GET'}));
op('microsoft_calendar','events.accept','Accept a meeting invitation',z.object({id,comment:text.optional(),sendResponse:z.boolean().default(true)}).strict(),a=>({url:graph+'/events/'+encode(a.id)+'/accept',method:'POST',body:{comment:a.comment,sendResponse:a.sendResponse}}),'write');
op('microsoft_calendar','events.decline','Decline a meeting invitation',z.object({id,comment:text.optional(),sendResponse:z.boolean().default(true)}).strict(),a=>({url:graph+'/events/'+encode(a.id)+'/decline',method:'POST',body:{comment:a.comment,sendResponse:a.sendResponse}}),'write');
export const APP_OPERATIONS = [...operations, ...SLACK_OPERATIONS, ...EXTRA_OPERATIONS];
export function appOperation(provider: AppProvider, name: string) { const value = APP_OPERATIONS.find(o => o.provider === provider && o.name === name); if (!value) throw new AppError("unsupported_app_operation"); return value; }
