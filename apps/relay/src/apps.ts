import { z } from "zod";
import { getSessionUser, randomToken, sha256Hex, type OAuthIdentity } from "./auth.js";
import { isMcpPaused } from "./security.js";
import { consumeToolCall } from "./usage.js";
import { APP_CATALOG, APP_OPERATIONS, AppError, appOperation, appScopes, credentials, permissionSchema, providerSchema, type AppEnv, type AppPermission, type AppProvider } from "./app-catalog.js";
import { loadAppReview, reviewRead, verifyAppReview, type AppReview } from "./app-review.js";
import { authorizationUrl, exchangeTokens, newVerifier, providerIdentity, providerJson, revokeProvider, seal, unseal, type AppTokens } from "./app-oauth.js";

type Connection = { id: string; user_id: string; provider: AppProvider; account_id: string; account_label: string; status: string; permissions_json: string; scopes_json: string; token_ciphertext: string | null; expires_at: string | null; generation: number; last_error: string | null; updated_at: string };
type Call = { id: string; user_id: string; connection_id: string; connection_generation: number; operation: string; permission: AppPermission; request_id: string; input_hash: string; arguments_ciphertext: string; result_ciphertext: string | null; review_ciphertext: string | null; status: string; error_code: string | null; expires_at: string; created_at: string };
const now = () => new Date().toISOString();
const expires = (seconds: number) => new Date(Date.now() + seconds * 1000).toISOString();
const response = (data: unknown, status = 200) => Response.json(data, { status, headers: { "cache-control": "no-store" } });
const tokenContext = (row: Pick<Connection, "id" | "user_id" | "provider">) => `app-token:${row.user_id}:${row.provider}:${row.id}`;
const callContext = (userId: string, id: string, kind: string) => `app-call:${userId}:${id}:${kind}`;
function enabled(env: AppEnv) { if (env.ENABLE_APPS !== "1") throw new AppError("apps_not_enabled", 503); }
function sameOrigin(request: Request, env: AppEnv) {
  if (request.headers.get("origin") !== new URL(env.APP_ORIGIN || env.PUBLIC_ORIGIN).origin || new URL(request.url).origin !== new URL(env.APP_ORIGIN || env.PUBLIC_ORIGIN).origin) throw new AppError("same_origin_required", 403);
  if (["POST", "PATCH"].includes(request.method) && request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() !== "application/json") throw new AppError("json_required", 415);
}
const cleanConnection = (row: Connection) => ({ id: row.id, provider: row.provider, accountLabel: row.account_label, status: row.status, permissions: JSON.parse(row.permissions_json), scopes: JSON.parse(row.scopes_json), expiresAt: row.expires_at, lastError: row.last_error, updatedAt: row.updated_at });
async function connection(env: AppEnv, userId: string, id: string) { const row = await env.DB.prepare("SELECT * FROM app_connections WHERE id=?1 AND user_id=?2").bind(id, userId).first<Connection>(); if (!row) throw new AppError("app_connection_not_found", 404); return row; }
function requirePermission(row: Connection, permission: AppPermission) {
  if (row.status !== "active" || !row.token_ciphertext) throw new AppError("app_reauthorization_required", 409);
  if (!(JSON.parse(row.permissions_json) as string[]).includes(permission)) throw new AppError("app_permission_required", 403);
  const scopes = new Set<string>(JSON.parse(row.scopes_json));
  const required = appScopes(row.provider, [permission]).filter(s => s !== "offline_access");
  // Google may replace readonly with the broader modify scope in its response.
  const satisfies = (scope: string) => scopes.has(scope) ||
    (row.provider === "gmail" && scope.endsWith("/gmail.readonly") && scopes.has("https://www.googleapis.com/auth/gmail.modify")) ||
    (row.provider === "outlook" && scope === "Mail.Read" && scopes.has("Mail.ReadWrite")) ||
    (row.provider === "microsoft_calendar" && scope === "Calendars.Read" && scopes.has("Calendars.ReadWrite"));
  if (!required.every(satisfies)) throw new AppError("app_scope_required", 403);
}
export async function listApps(env: AppEnv, userId: string) {
  if (env.ENABLE_APPS !== "1") return { enabled: false, apps: [], connections: [] };
  const rows = await env.DB.prepare("SELECT * FROM app_connections WHERE user_id=?1 ORDER BY created_at DESC").bind(userId).all<Connection>();
  return { enabled: true, apps: Object.entries(APP_CATALOG).map(([key, def]) => { let configured = true; try { credentials(env, key as AppProvider); } catch { configured = false; } return { provider: key, name: def.name, brand: def.brand, configured, operations: APP_OPERATIONS.filter(o => o.provider === key).map(o => ({ name: o.name, description: o.description, permission: o.permission, inputSchema: z.toJSONSchema(o.schema) })), permissions: { read: def.scopes.read, write: def.scopes.write }, consentNote: key === "github" ? "GitHub OAuth repo scope includes upstream write access; Remote Arc read permission still denies all writes." : undefined }; }), connections: (rows.results || []).map(cleanConnection) };
}
async function authorize(request: Request, env: AppEnv, userId: string) {
  sameOrigin(request, env);
  const body = z.object({ provider: providerSchema, permissions: permissionSchema }).strict().parse(await request.json());
  credentials(env, body.provider);
  const state = randomToken(); const verifier = newVerifier(); const stateHash = await sha256Hex(state);
  await env.DB.prepare("DELETE FROM app_oauth_states WHERE expires_at<=?1").bind(now()).run();
  await env.DB.prepare("INSERT INTO app_oauth_states(state_hash,user_id,provider,permissions_json,verifier_ciphertext,expires_at,created_at) VALUES(?1,?2,?3,?4,?5,?6,?7)").bind(stateHash, userId, body.provider, JSON.stringify(body.permissions), await seal(env, verifier, `app-oauth:${userId}:${stateHash}`), expires(600), now()).run();
  return response({ authorizationUrl: await authorizationUrl(env, body.provider, body.permissions, state, verifier) });
}
async function callback(request: Request, env: AppEnv, userId: string, provider: AppProvider, fetcher: typeof fetch) {
  const query = new URL(request.url).searchParams; const state = query.get("state");
  if (!state || state.length > 128) throw new AppError("invalid_oauth_state");
  const stateHash = await sha256Hex(state);
  const row = await env.DB.prepare("DELETE FROM app_oauth_states WHERE state_hash=?1 AND user_id=?2 AND provider=?3 AND expires_at>?4 RETURNING *").bind(stateHash, userId, provider, now()).first<{ permissions_json: string; verifier_ciphertext: string }>();
  if (!row) throw new AppError("invalid_oauth_state");
  if (query.has("error")) throw new AppError("app_authorization_denied");
  const code = query.get("code"); if (!code || code.length > 4096) throw new AppError("missing_oauth_code");
  const verifier = await unseal<string>(env, row.verifier_ciphertext, `app-oauth:${userId}:${stateHash}`);
  const tokens = await exchangeTokens(env, provider, { code, verifier }, fetcher);
  const account = await providerIdentity(provider, tokens, fetcher);
  const existing = await env.DB.prepare("SELECT * FROM app_connections WHERE user_id=?1 AND provider=?2 AND account_id=?3").bind(userId, provider, account.id).first<Connection>();
  // Stable identity prevents concurrent first callbacks from encrypting tokens
  // for different row IDs before the unique account constraint resolves the race.
  const identityHash = await sha256Hex(JSON.stringify(["app-connection-v1", userId, provider, account.id]));
  const stableId = `${identityHash.slice(0, 8)}-${identityHash.slice(8, 12)}-8${identityHash.slice(13, 16)}-${((parseInt(identityHash[16]!, 16) & 3) | 8).toString(16)}${identityHash.slice(17, 20)}-${identityHash.slice(20, 32)}`;
  const id = existing?.id || stableId;
  const cipher = await seal(env, tokens, tokenContext({ id, user_id: userId, provider }));
  await env.DB.prepare(`INSERT INTO app_connections(id,user_id,provider,account_id,account_label,status,permissions_json,scopes_json,token_ciphertext,expires_at,created_at,updated_at)
    VALUES(?1,?2,?3,?4,?5,'active',?6,?7,?8,?9,?10,?10)
    ON CONFLICT(user_id,provider,account_id) DO UPDATE SET account_label=excluded.account_label,status='active',permissions_json=excluded.permissions_json,scopes_json=excluded.scopes_json,token_ciphertext=excluded.token_ciphertext,expires_at=excluded.expires_at,generation=app_connections.generation+1,refresh_lease=NULL,refresh_lease_until=NULL,last_error=NULL,updated_at=excluded.updated_at`)
    .bind(id, userId, provider, account.id, account.label, row.permissions_json, JSON.stringify(tokens.scopes), cipher, tokens.expiresAt, now()).run();
  return new Response(null, { status: 303, headers: { location: (env.APP_ORIGIN || env.PUBLIC_ORIGIN) + "/apps?connected=" + provider, "cache-control": "no-store" } });
}
async function accessToken(env: AppEnv, row: Connection, fetcher: typeof fetch): Promise<AppTokens> {
  const tokens = await unseal<AppTokens>(env, row.token_ciphertext!, tokenContext(row));
  if (!tokens.expiresAt || Date.parse(tokens.expiresAt) > Date.now() + 60000) return tokens;
  if (!tokens.refreshToken) { await markReauthorization(env, row, "app_reauthorization_required"); throw new AppError("app_reauthorization_required", 409); }
  const lease = randomToken(16);
  const claimed = await env.DB.prepare("UPDATE app_connections SET refresh_lease=?1,refresh_lease_until=?2 WHERE id=?3 AND user_id=?4 AND generation=?5 AND status='active' AND (refresh_lease_until IS NULL OR refresh_lease_until<?6) RETURNING id").bind(lease, expires(45), row.id, row.user_id, row.generation, now()).first();
  if (!claimed) throw new AppError("app_refresh_in_progress", 409);
  try {
    const refreshed = await exchangeTokens(env, row.provider, { refreshToken: tokens.refreshToken, previous: tokens }, fetcher);
    const updated = await env.DB.prepare("UPDATE app_connections SET token_ciphertext=?1,scopes_json=?2,expires_at=?3,refresh_lease=NULL,refresh_lease_until=NULL,last_error=NULL,updated_at=?4 WHERE id=?5 AND user_id=?6 AND generation=?7 AND refresh_lease=?8 AND status='active' RETURNING id")
      .bind(await seal(env, refreshed, tokenContext(row)), JSON.stringify(refreshed.scopes), refreshed.expiresAt, now(), row.id, row.user_id, row.generation, lease).first();
    if (!updated) { await revokeProvider(env, row.provider, refreshed, fetcher).catch(() => undefined); throw new AppError("app_connection_changed", 409); }
    return refreshed;
  } catch (error) { await markReauthorization(env, row, error instanceof AppError ? error.code : "app_refresh_failed"); throw error; }
}
async function markReauthorization(env: AppEnv, row: Connection, code: string) { await env.DB.prepare("UPDATE app_connections SET status='reauthorization_required',refresh_lease=NULL,refresh_lease_until=NULL,last_error=?1,updated_at=?2 WHERE id=?3 AND user_id=?4 AND generation=?5 AND status='active'").bind(code, now(), row.id, row.user_id, row.generation).run(); }
async function updateConnection(request: Request, env: AppEnv, userId: string, id: string, fetcher: typeof fetch) {
  sameOrigin(request, env); const row = await connection(env, userId, id);
  if (request.method === "PATCH") {
    const { permissions } = z.object({ permissions: permissionSchema }).strict().parse(await request.json());
    permissions.forEach(p => requirePermission({ ...row, permissions_json: JSON.stringify(permissions) }, p));
    await env.DB.prepare("UPDATE app_connections SET permissions_json=?1,generation=generation+1,updated_at=?2 WHERE id=?3 AND user_id=?4").bind(JSON.stringify(permissions), now(), id, userId).run();
    return response({ connection: cleanConnection(await connection(env, userId, id)) });
  }
  // Local revocation must still succeed when a vault key is unavailable.
  const tokens = row.token_ciphertext ? await unseal<AppTokens>(env, row.token_ciphertext, tokenContext(row)).catch(() => null) : null;
  await env.DB.prepare("UPDATE app_connections SET status='disconnected',token_ciphertext=NULL,generation=generation+1,refresh_lease=NULL,refresh_lease_until=NULL,updated_at=?1 WHERE id=?2 AND user_id=?3").bind(now(), id, userId).run();
  await env.DB.prepare("UPDATE app_calls SET status='cancelled',updated_at=?1 WHERE connection_id=?2 AND user_id=?3 AND status IN ('pending_approval','approved')").bind(now(), id, userId).run();
  let revocation: unknown = { localOnly: true, providerRevocationPending: Boolean(row.token_ciphertext && !tokens) }; if (tokens) try { revocation = await revokeProvider(env, row.provider, tokens, fetcher); } catch { revocation = { localOnly: true, providerRevocationPending: true }; }
  return response({ disconnected: true, revocation });
}
export const appCallSchema = z.object({ connectionId: z.string().uuid(), operation: z.string().min(1).max(80), arguments: z.record(z.string(), z.unknown()), requestId: z.string().regex(/^[\w-]{8,100}$/) }).strict();
export type AppCallInput = z.infer<typeof appCallSchema>;
const stableJson = (value: unknown): string => value === null || typeof value !== "object" ? JSON.stringify(value) : Array.isArray(value) ? "[" + value.map(stableJson).join(",") + "]" : "{" + Object.keys(value).sort().map(k => JSON.stringify(k) + ":" + stableJson((value as Record<string, unknown>)[k])).join(",") + "}";
export async function callApp(env: AppEnv, identity: Pick<OAuthIdentity, "userId" | "scope">, raw: unknown, fetcher: typeof fetch = fetch) {
  enabled(env); const input = appCallSchema.parse(raw);
  const row = await connection(env, identity.userId, input.connectionId); const operation = appOperation(row.provider, input.operation);
  const required = operation.permission === "write" ? "apps:write" : "apps:read";
  if (!identity.scope.split(/\s+/).includes(required)) throw new AppError("app_mcp_scope_required", 403);
  if (await isMcpPaused(env, identity.userId)) throw new AppError("mcp_paused", 403);
  requirePermission(row, operation.permission);
  const args = operation.schema.parse(input.arguments);
  const hash = await sha256Hex(stableJson({ connection: row.id, operation: operation.name, arguments: args }));
  let call = await env.DB.prepare("SELECT * FROM app_calls WHERE user_id=?1 AND request_id=?2").bind(identity.userId, input.requestId).first<Call>();
  if (!call) {
    const id = crypto.randomUUID(); const stamp = now();
    let review: AppReview | null = null;
    if (reviewRead(row.provider, operation.name, args as Record<string, unknown>)) {
      await consumeToolCall(env, identity.userId);
      const tokens = await accessToken(env, row, fetcher);
      const current = await connection(env, identity.userId, row.id);
      if (current.generation !== row.generation) throw new AppError("app_connection_changed", 409);
      requirePermission(current, operation.permission);
      review = await loadAppReview(row.provider, operation.name, args as Record<string, unknown>, tokens, fetcher);
    }
    await env.DB.prepare("INSERT INTO app_calls(id,user_id,connection_id,connection_generation,operation,permission,request_id,input_hash,arguments_ciphertext,review_ciphertext,status,expires_at,created_at,updated_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?13) ON CONFLICT(user_id,request_id) DO NOTHING")
      .bind(id, identity.userId, row.id, row.generation, operation.name, operation.permission, input.requestId, hash, await seal(env, args, callContext(identity.userId, id, "arguments")), review ? await seal(env, review, callContext(identity.userId, id, "review")) : null, operation.permission === "write" ? "pending_approval" : "approved", expires(600), stamp).run();
    call = await env.DB.prepare("SELECT * FROM app_calls WHERE user_id=?1 AND request_id=?2").bind(identity.userId, input.requestId).first<Call>();
  }
  if (!call) throw new AppError("app_call_unavailable", 503);
  if (call.input_hash !== hash) throw new AppError("app_request_id_conflict", 409);
  if (call.status === "succeeded") return { status: "succeeded", callId: call.id, replayed: true, untrustedData: true, result: await unseal(env, call.result_ciphertext!, callContext(identity.userId, call.id, "result")) };
  if (call.status !== "approved") return { status: call.status, callId: call.id, error: call.error_code, approvalUrl: (env.APP_ORIGIN || env.PUBLIC_ORIGIN) + "/apps#approvals", retryAutomatically: false };
  if (call.connection_generation !== row.generation || call.expires_at <= now()) throw new AppError("app_approval_expired_or_connection_changed", 409);
  // A single CAS owns execution. Neither retries nor concurrent clients repeat a write.
  const claimed = await env.DB.prepare("UPDATE app_calls SET status='running',updated_at=?1 WHERE id=?2 AND user_id=?3 AND status='approved' AND expires_at>?1 AND EXISTS(SELECT 1 FROM app_connections WHERE id=?4 AND user_id=?3 AND generation=?5 AND status='active') RETURNING id").bind(now(), call.id, identity.userId, row.id, row.generation).first();
  if (!claimed) return { status: "running", callId: call.id, retryAutomatically: false };
  let dispatched = false;
  try {
    await consumeToolCall(env, identity.userId);
    const tokens = await accessToken(env, row, fetcher);
    // Token refresh can reduce provider scopes; re-check its persisted result.
    const current = await connection(env, identity.userId, row.id);
    if (current.generation !== row.generation) throw new AppError("app_connection_changed", 409);
    requirePermission(current, operation.permission);
    const review = call.review_ciphertext ? await unseal<AppReview>(env, call.review_ciphertext, callContext(identity.userId, call.id, "review")) : null;
    const conditionalHeaders = await verifyAppReview(row.provider, operation.name, args as Record<string, unknown>, tokens, review, fetcher);
    const plan = operation.request(args); dispatched = true;
    const result = await providerJson(plan.url, { method: plan.method, headers: { authorization: `Bearer ${tokens.accessToken}`, accept: "application/json", "content-type": "application/json", "user-agent": "Remote-Arc-Apps", ...conditionalHeaders }, body: plan.body === undefined ? undefined : JSON.stringify(plan.body) }, fetcher);
    await env.DB.prepare("UPDATE app_calls SET status='succeeded',result_ciphertext=?1,updated_at=?2 WHERE id=?3 AND user_id=?4 AND status='running'").bind(await seal(env, result, callContext(identity.userId, call.id, "result")), now(), call.id, identity.userId).run();
    return { status: "succeeded", callId: call.id, untrustedData: true, verification: "provider_acknowledged", result };
  } catch (error) {
    const code = error instanceof AppError ? error.code : (error as { code?: string }).code || "app_execution_failed";
    const definiteDenial = ["app_review_changed", "app_scope_required", "app_reauthorization_required", "app_rate_limited"].includes(code);
    const status = dispatched && operation.permission === "write" && !definiteDenial ? "unknown" : "failed";
    await env.DB.prepare("UPDATE app_calls SET status=?1,error_code=?2,updated_at=?3 WHERE id=?4 AND user_id=?5 AND status='running'").bind(status, code, now(), call.id, identity.userId).run();
    if (code === "app_reauthorization_required") await markReauthorization(env, row, code);
    throw error;
  }
}
async function approvals(request: Request, env: AppEnv, userId: string, id?: string) {
  if (!id) { const rows = await env.DB.prepare("SELECT * FROM app_calls WHERE user_id=?1 AND permission='write' AND status IN ('pending_approval','approved','running','unknown') ORDER BY created_at DESC LIMIT 50").bind(userId).all<Call>(); return response({ approvals: await Promise.all((rows.results || []).map(async r => ({ id: r.id, connectionId: r.connection_id, operation: r.operation, status: r.status, expiresAt: r.expires_at, arguments: await unseal(env, r.arguments_ciphertext, callContext(userId, r.id, "arguments")), review: r.review_ciphertext ? (await unseal<AppReview>(env, r.review_ciphertext, callContext(userId, r.id, "review"))).target : undefined }))) }); }
  sameOrigin(request, env); const { approve } = z.object({ approve: z.boolean() }).strict().parse(await request.json());
  const changed = await env.DB.prepare("UPDATE app_calls SET status=?1,updated_at=?2 WHERE id=?3 AND user_id=?4 AND status='pending_approval' AND expires_at>?2 AND EXISTS(SELECT 1 FROM app_connections c WHERE c.id=app_calls.connection_id AND c.user_id=?4 AND c.generation=app_calls.connection_generation AND c.status='active') RETURNING id").bind(approve ? "approved" : "rejected", now(), id, userId).first();
  if (!changed) throw new AppError("app_approval_unavailable", 409);
  return response({ status: approve ? "approved" : "rejected", callId: id });
}
export async function handleApps(request: Request, env: AppEnv, fetcher: typeof fetch = fetch): Promise<Response> {
  try {
    const user = await getSessionUser(request, env); if (!user) return response({ error: "unauthorized" }, 401);
    const path = new URL(request.url).pathname;
    if (path === "/api/apps" && request.method === "GET") return response(await listApps(env, user.id));
    enabled(env);
    if (path === "/api/apps/authorize" && request.method === "POST") return await authorize(request, env, user.id);
    const oauth = path.match(/^\/api\/apps\/oauth\/([^/]+)\/callback$/);
    if (oauth && request.method === "GET") return await callback(request, env, user.id, providerSchema.parse(oauth[1]), fetcher);
    const item = path.match(/^\/api\/apps\/connections\/([\w-]+)$/);
    if (item && ["PATCH", "DELETE"].includes(request.method)) return await updateConnection(request, env, user.id, item[1]!, fetcher);
    if (path === "/api/apps/call" && request.method === "POST") { sameOrigin(request, env); return response(await callApp(env, { userId: user.id, scope: "apps:read apps:write" }, await request.json(), fetcher)); }
    if (path === "/api/apps/approvals" && request.method === "GET") return await approvals(request, env, user.id);
    const decision = path.match(/^\/api\/apps\/approvals\/([\w-]+)$/);
    if (decision && request.method === "POST") return await approvals(request, env, user.id, decision[1]);
    return response({ error: "not_found" }, 404);
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) return response({ error: "invalid_app_request" }, 400);
    return response({ error: error instanceof AppError ? error.code : "app_service_unavailable" }, error instanceof AppError ? error.status : 503);
  }
}
