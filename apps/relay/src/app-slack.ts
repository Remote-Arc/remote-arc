import { z } from "zod";
import type { AppOperation } from "./app-catalog.js";

// User OAuth scopes. Workspace policy and channel membership remain authoritative.
export const SLACK_SCOPES = {
  read: ["channels:read", "channels:history", "groups:read", "groups:history", "im:read", "im:history", "mpim:read", "mpim:history", "search:read", "users:read", "users:read.email", "team:read", "emoji:read", "reactions:read", "pins:read", "bookmarks:read", "files:read"],
  write: ["chat:write", "reactions:write", "pins:write", "bookmarks:write"],
};
const id = z.string().min(1).max(512).refine(v => !/[\r\n]/.test(v));
const ts = z.string().regex(/^\d{10,16}\.\d{1,6}$/);
const text = z.string().min(1).max(4000);
const limit = z.number().int().min(1).max(100).default(30);
const historyLimit = z.number().int().min(1).max(15).default(15);
const page = { limit, cursor: id.optional() };
const channel = { channel: id };
const message = { ...channel, timestamp: ts };
const name = z.string().regex(/^[a-zA-Z0-9_+-]{1,100}$/);
const historyScopes = ["channels:history", "groups:history", "im:history", "mpim:history"];
const channelScopes = ["channels:read", "groups:read", "im:read", "mpim:read"];
const operations: AppOperation[] = [];
function read(name: string, description: string, method: string, schema: z.ZodType, scopes: string[], map: (a: any) => Record<string, unknown> = a => a, post = false) {
  operations.push({ provider: "slack", name, description, permission: "read", schema, requiredScopes: scopes === channelScopes || scopes === historyScopes ? [] : scopes, anyScopes: scopes === channelScopes || scopes === historyScopes ? scopes : undefined, request: a => {
    const query = map(a);
    const u = new URL("https://slack.com/api/" + method);
    if (!post) Object.entries(query).forEach(([k, v]) => { if (v !== undefined) u.searchParams.set(k, String(v)); });
    return { url: u.toString(), method: post ? "POST" : "GET", ...(post ? {body: query} : {}) };
  } });
}
function write(name: string, description: string, method: string, schema: z.ZodType, scopes: string[], map: (a: any) => Record<string, unknown> = a => a) {
  operations.push({ provider: "slack", name, description, permission: "write", schema, requiredScopes: scopes, request: a => ({ url: "https://slack.com/api/" + method, method: "POST", body: map(a) }) });
}
read("channels.list", "List accessible channels and direct messages", "conversations.list", z.object({...page, types: z.enum(["public_channel", "private_channel", "im", "mpim"]).default("public_channel")}).strict(), channelScopes);
read("channels.get", "Inspect a channel or direct message", "conversations.info", z.object(channel).strict(), channelScopes);
read("channels.members", "List members of a conversation", "conversations.members", z.object({...channel, ...page}).strict(), channelScopes);
read("messages.list", "Read conversation history (up to 15 messages)", "conversations.history", z.object({...channel, limit: historyLimit, cursor: id.optional(), oldest: ts.optional(), latest: ts.optional()}).strict(), historyScopes);
read("messages.get", "Read one exact message for review", "conversations.history", z.object({...channel, ts}).strict(), historyScopes, a => ({channel:a.channel, oldest:a.ts, latest:a.ts, inclusive:true, limit:1}));
read("threads.replies", "Read a message thread (up to 15 messages)", "conversations.replies", z.object({...channel, ts, limit: historyLimit, cursor: id.optional()}).strict(), historyScopes);
read("messages.permalink", "Get a permanent link to a message", "chat.getPermalink", z.object({...channel, message_ts:ts}).strict(), []);
read("search", "Search workspace messages", "search.messages", z.object({query:text, limit, page:z.number().int().min(1).max(100).default(1)}).strict(), ["search:read"], a=>({query:a.query,count:a.limit,page:a.page}));
read("search.files", "Search workspace files", "search.files", z.object({query:text, limit, page:z.number().int().min(1).max(100).default(1)}).strict(), ["search:read"], a=>({query:a.query,count:a.limit,page:a.page}));
read("auth.test", "Check the connected Slack account", "auth.test", z.object({}).strict(), []);
read("team.info", "Read workspace details", "team.info", z.object({}).strict(), ["team:read"]);
read("users.list", "List workspace members", "users.list", z.object(page).strict(), ["users:read"]);
read("users.get", "Read a workspace member profile", "users.info", z.object({user:id}).strict(), ["users:read"]);
read("users.lookup", "Find a workspace member by email", "users.lookupByEmail", z.object({email:z.string().email().max(320)}).strict(), ["users:read.email"]);
read("emoji.list", "List workspace custom emoji", "emoji.list", z.object({}).strict(), ["emoji:read"]);
read("reactions.get", "Read reactions on a message", "reactions.get", z.object(message).strict(), ["reactions:read"]);
read("reactions.list", "List a member's reactions", "reactions.list", z.object({...page,user:id.optional()}).strict(), ["reactions:read"]);
read("pins.list", "List pinned items in a conversation", "pins.list", z.object(channel).strict(), ["pins:read"]);
read("bookmarks.list", "List bookmarks in a conversation", "bookmarks.list", z.object({channel_id:id}).strict(), ["bookmarks:read"]);
read("files.list", "List accessible workspace files", "files.list", z.object({user:id.optional(),channel:id.optional(),count:limit,page:z.number().int().min(1).max(100).default(1)}).strict(), ["files:read"]);
read("files.get", "Read file details and sharing metadata", "files.info", z.object({file:id}).strict(), ["files:read"]);
read("scheduled.list", "List messages scheduled by this connection", "chat.scheduledMessages.list", z.object({...page,channel:id.optional()}).strict(), [], a=>a, true);
write("messages.send", "Send a message or reply to a thread", "chat.postMessage", z.object({...channel,text,thread_ts:ts.optional()}).strict(), ["chat:write"], a=>({...a,unfurl_links:false,unfurl_media:false}));
write("messages.update", "Edit your own message", "chat.update", z.object({...channel,ts,text}).strict(), ["chat:write"]);
write("messages.delete", "Delete your own exact message", "chat.delete", z.object({...channel,ts}).strict(), ["chat:write"]);
write("messages.schedule", "Schedule a message for later delivery", "chat.scheduleMessage", z.object({...channel,text,post_at:z.number().int().positive(),thread_ts:ts.optional()}).strict(), ["chat:write"], a=>({...a,unfurl_links:false,unfurl_media:false}));
write("scheduled.delete", "Cancel a message scheduled by this connection", "chat.deleteScheduledMessage", z.object({...channel,scheduled_message_id:id}).strict(), ["chat:write"]);
write("reactions.add", "Add an emoji reaction to a message", "reactions.add", z.object({...message,name}).strict(), ["reactions:write"]);
write("reactions.remove", "Remove your emoji reaction from a message", "reactions.remove", z.object({...message,name}).strict(), ["reactions:write"]);
write("pins.add", "Pin an exact message in a conversation", "pins.add", z.object(message).strict(), ["pins:write"]);
write("pins.remove", "Unpin an exact message in a conversation", "pins.remove", z.object(message).strict(), ["pins:write"]);
write("bookmarks.add", "Add a link bookmark to a conversation", "bookmarks.add", z.object({channel_id:id,title:z.string().min(1).max(100),link:z.string().url().max(2000).refine(v=>{const u=new URL(v);return u.protocol==="https:"&&!u.username&&!u.password;})}).strict(), ["bookmarks:write"], a=>({...a,type:"link"}));
export const SLACK_OPERATIONS = operations;
