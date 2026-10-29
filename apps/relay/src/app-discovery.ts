import { z } from "zod";
import { APP_PROVIDERS, APP_CATEGORIES, type AppEnv } from "./app-catalog.js";
import { listApps } from "./apps.js";

export const appDiscoverySchema = z.object({
  provider: z.enum(APP_PROVIDERS).optional(),
  category: z.enum(APP_CATEGORIES.map(c => c.id) as [string, ...string[]]).optional(),
  query: z.string().max(100).optional(),
  use_case: z.string().max(300).optional(),
  includeSchemas: z.boolean().default(false),
  limit: z.number().int().min(1).max(25).default(12),
  cursor: z.number().int().min(0).max(10000).default(0),
}).strict();

const stopWords = new Set(["a", "an", "the", "to", "in", "on", "for", "from", "with", "of", "and", "my", "me", "please", "using", "by", "i", "want", "can"]);
const norm = (s: string) => s.toLowerCase().replace(/[._/-]/g, " ").replace(/\s+/g, " ").trim();
const terms = (s: string) => [...new Set(norm(s).split(/[^\p{L}\p{N}]+/u).filter(t => t.length > 1 && !stopWords.has(t)))];
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

export async function discoverApps(env: AppEnv, userId: string, raw: unknown = {}) {
  const input = appDiscoverySchema.parse(raw);
  const all = await listApps(env, userId);
  // Preserve the original discoverApps / list_apps provider-discovery API for
  // existing clients. Explicit use_case or includeSchemas opts into the
  // bounded operation search; neither mode can execute an operation.
  if (!input.use_case && !input.includeSchemas) {
    const query = input.query?.trim().toLowerCase();
    const filtered = all.apps.filter(app => (!input.provider || app.provider === input.provider)
      && (!input.category || app.category === input.category)
      && (!query || [app.name, app.provider, app.category, ...app.operations.flatMap(operation =>
        [operation.name, operation.description])].some(value => value?.toLowerCase().includes(query))));
    const page = filtered.slice(input.cursor, input.cursor + input.limit);
    const ids = new Set(page.map(app => app.provider));
    return {
      enabled: all.enabled, mode: "providers", categories: APP_CATEGORIES,
      operationCatalogSize: all.apps.reduce((sum, app) => sum + app.operations.length, 0),
      total: filtered.length,
      nextCursor: input.cursor + page.length < filtered.length ? input.cursor + page.length : null,
      apps: page.map(({ operations, ...app }) => ({
        ...app, operationCount: operations.length,
        readOperationCount: operations.filter(operation => operation.permission === "read").length,
        writeOperationCount: operations.filter(operation => operation.permission === "write").length,
        ...(input.provider ? { operations } : {}),
      })),
      connections: all.connections.filter(connection => ids.has(connection.provider)),
      guidance: "To search specific operations across apps, use use_case; set includeSchemas=true to retrieve a bounded set of exact operation schemas. Call_app always checks the linked account and provider scopes.",
    };
  }
  const query = (input.use_case || input.query || "").trim();
  const tokens = terms(query);
  const matchingApps = all.apps.filter(app =>
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
      operationCatalogSize: all.apps.reduce((count, app) => count + app.operations.length, 0),
      guidance: "Search with use_case, then set includeSchemas=true for matching actions. call_app accepts only fixed operation IDs; external changes require user authorization.",
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
      provider: app.provider, providerName: app.name, operation: operation.name,
      description: operation.description, permission: operation.permission,
      configured: app.configured,
      connected: connections.some(account => account.provider === app.provider && account.status === "active"),
      ...(input.includeSchemas ? { inputSchema: operation.inputSchema } : {}),
    })),
    guidance: "Use call_app with connectionId, exact operation name, arguments matching inputSchema, and a stable requestId. A write may send, delete, publish or incur costs; do not infer approval from discovery.",
  };
}
