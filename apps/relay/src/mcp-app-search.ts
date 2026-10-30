import { z } from "zod";
import { APP_OPERATIONS, type AppEnv } from "./app-catalog.js";
import { listApps } from "./apps.js";
import { appDiscoverySchema as baseSchema, discoverApps } from "./app-discovery.js";
import { APP_ACTION_TOOLS } from "./mcp-app-actions.js";

export const appDiscoverySchema = baseSchema.safeExtend({
  use_case: z.string().max(300).optional(),
  includeSchemas: z.boolean().default(false),
}).strict();

const stopWords = new Set(["a", "an", "the", "to", "in", "on", "for", "from", "with", "of", "and", "my", "me", "please", "using", "by", "i", "want", "can"]);
const norm = (s: string) => s.toLowerCase().replace(/[._/-]/g, " ").replace(/\s+/g, " ").trim();
// Common Chinese intent words map to catalog vocabulary. This is a small,
 // deterministic lexical aid, not an LLM or claim of full semantic search.
const intentAliases: Array<[RegExp, string]> = [
  [/发(?:送|个|一条)?消息|发帖|发布/g, " send message post "],
  [/创建|新建|制作|生成/g, " create "],
  [/演示文稿|幻灯片|PPT/gi, " presentation slides "],
  [/谷歌/g, " google "],
  [/邮件|电邮/g, " email gmail "],
  [/日历|会议/g, " calendar event "],
  [/表格/g, " sheet spreadsheet "],
  [/搜索|查看|读取|查找|列出|查询/g, " search list read "],
  [/评论|回复/g, " comment reply "],
  [/频道/g, " channel "],
  [/删除|移除/g, " delete "],
  [/发/g, " send "],
];
const terms = (s: string) => {
  const expanded = intentAliases.reduce((value, [pattern, translation]) => value.replace(pattern, translation), s);
  return [...new Set(norm(expanded).split(/[^\p{L}\p{N}]+/u).filter(t => t.length > 1 && !stopWords.has(t)))];
};
type ListedApps = Awaited<ReturnType<typeof listApps>>;
type ListedApp = ListedApps["apps"][number];
type ListedOperation = ListedApp["operations"][number];
const relevance = (app: ListedApp, operation: ListedOperation, tokens: string[]): number => {
  if (!tokens.length) return 1;
  const label = norm(app.provider + " " + app.name);
  const action = norm(operation.name + " " + operation.description);
  const category = norm(app.category ?? "");
  const score = tokens.reduce((sum, token) =>
    sum + (action.includes(token) ? 5 : 0) + (label.includes(token) ? 4 : 0) + (category.includes(token) ? 1 : 0), 0);
  // Don't show unrelated tools for vague searches. Two matching terms beat
  // generic provider-only matches (e.g. "create Google Slides presentation").
  const matches = tokens.filter(token => action.includes(token) || label.includes(token) || category.includes(token)).length;
  return matches >= Math.min(tokens.length, 2) ? score : 0;
};

export async function discoverMcpAppTools(env: AppEnv, userId: string, raw: unknown = {}, options: { excludeRunway?: boolean } = {}) {
  const input = appDiscoverySchema.parse(raw);
  if (!input.use_case && !input.includeSchemas) {
    const legacy = await discoverApps(env, userId, {
      provider: input.provider, category: input.category, query: input.query,
      limit: input.limit, cursor: input.cursor,
    }, options.excludeRunway ? { excludeProvider: "runway" } : {});
    return { ...legacy, mode: "providers", operationCatalogSize: options.excludeRunway
      ? APP_OPERATIONS.filter(operation => operation.provider !== "runway").length : APP_OPERATIONS.length };
  }
  const all = await listApps(env, userId);
  const query = (input.use_case || input.query || "").trim();
  const tokens = terms(query);
  const matchingApps = all.apps.filter(app =>
    (!options.excludeRunway || app.provider !== "runway") &&
    (!input.provider || app.provider === input.provider) && (!input.category || app.category === input.category));
  const connections = all.connections.filter(account => matchingApps.some(app => app.provider === account.provider));
  const matchingAccounts = connections.filter(account => !input.query ||
    norm(account.accountLabel + " " + account.provider).includes(norm(input.query)) || Boolean(input.use_case) || Boolean(input.provider));

  const accounts = matchingAccounts.slice(input.cursor, input.cursor + input.limit)
    .map(({ id, provider, accountLabel, status }) => ({ id, provider, accountLabel, status }));

  // A default list_apps request only returns provider summaries / owned
  // connections. Loading thousands of tokens of schemas is opt-in.
  if (!query && !input.provider) {
    const page = matchingApps.slice(input.cursor, input.cursor + input.limit);
    return {
      enabled: all.enabled, mode: "providers",
      total: matchingAccounts.length, nextCursor: input.cursor + input.limit < matchingAccounts.length ? input.cursor + input.limit : null,
      connections: accounts,
      apps: page.map(({ operations, ...app }) =>
        ({ provider: app.provider, name: app.name, category: app.category, configured: app.configured,
          operationCount: operations.length, connected: connections.some(c => c.provider === app.provider && c.status === "active") })),
      operationCatalogSize: (options.excludeRunway ? matchingApps : all.apps).reduce((count, app) => count + app.operations.length, 0),
      guidance: `Search with use_case to find action IDs. Run reads with ${APP_ACTION_TOOLS.read} and user-requested changes with ${APP_ACTION_TOOLS.write}, passing a connectionId for the same provider; external changes require user authorization.`,
    };
  }

  const ranked = matchingApps.flatMap(app => app.operations.map(operation =>
    ({ app, operation, score: relevance(app, operation, tokens) })))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score || a.app.provider.localeCompare(b.app.provider) || a.operation.name.localeCompare(b.operation.name));
  const page = ranked.slice(input.cursor, input.cursor + input.limit);
  const relevantProviders = new Set(page.map(item => item.app.provider));
  return {
    enabled: all.enabled, mode: "operations", total: ranked.length,
    nextCursor: input.cursor + page.length < ranked.length ? input.cursor + page.length : null,
    connectionTotal: matchingAccounts.length,
    nextConnectionCursor: !query && input.cursor + input.limit < matchingAccounts.length ? input.cursor + input.limit : null,
    connections: matchingAccounts.filter(account => relevantProviders.has(account.provider))
      .slice(query ? 0 : input.cursor, (query ? 0 : input.cursor) + input.limit)
      .map(({ id, provider, accountLabel, status }) => ({ id, provider, accountLabel, status })),
    operations: page.map(({ app, operation }) => ({
      provider: app.provider, providerName: app.name, action: `${app.provider}.${operation.name}`, operation: operation.name,
      description: operation.description, permission: operation.permission,
      configured: app.configured,
      connected: connections.some(account => account.provider === app.provider && account.status === "active"),
      ...(input.includeSchemas ? { inputSchema: operation.inputSchema } : {}),
    })),
    guidance: `Run a read action with ${APP_ACTION_TOOLS.read} or a change with ${APP_ACTION_TOOLS.write}: operation {action, arguments matching inputSchema}, a connectionId for the same provider, and a stable requestId. A write may send, delete, publish or incur costs; do not infer approval from discovery.`,
  };
}
