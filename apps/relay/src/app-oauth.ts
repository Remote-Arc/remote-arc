import { pkceChallenge, randomToken } from "./auth.js";
import { APP_CATALOG, AppError, appScopes, credentials, type AppEnv, type AppPermission, type AppProvider, type AppContext } from "./app-catalog.js";

import { endpoint, extraIdentity, normalizeScope, connectionContext } from "./app-auth-adapters.js";
const encoder = new TextEncoder();
const b64 = (bytes: Uint8Array) => { let text = ""; for (let i = 0; i < bytes.length; i += 8192) text += String.fromCharCode(...bytes.subarray(i, i + 8192)); return btoa(text); };
export async function seal(env: AppEnv, value: unknown, context: string) {
  let raw: Uint8Array<ArrayBuffer>;
  try { raw = Uint8Array.from(atob(env.APP_TOKEN_KEY || ""), c => c.charCodeAt(0)); } catch { throw new AppError("app_vault_not_configured", 503); }
  if (raw.length !== 32) throw new AppError("app_vault_not_configured", 503);
  const key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: encoder.encode(context) }, key, encoder.encode(JSON.stringify(value)));
  return JSON.stringify({ v: 1, iv: b64(iv), data: b64(new Uint8Array(cipher)) });
}
export async function unseal<T>(env: AppEnv, value: string, context: string): Promise<T> {
  try {
    const row = JSON.parse(value);
    if (row.v !== 1) throw new Error();
    const raw = Uint8Array.from(atob(env.APP_TOKEN_KEY || ""), c => c.charCodeAt(0));
    const key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["decrypt"]);
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: Uint8Array.from(atob(row.iv), c => c.charCodeAt(0)), additionalData: encoder.encode(context) }, key, Uint8Array.from(atob(row.data), c => c.charCodeAt(0)));
    return JSON.parse(new TextDecoder().decode(plain)) as T;
  } catch { throw new AppError("app_vault_unavailable", 503); }
}
export type AppTokens = { accessToken: string; refreshToken?: string; expiresAt: string | null; scopes: string[]; context?: AppContext };
export async function providerJson(url: string, init: RequestInit, fetcher: typeof fetch = fetch, responseKind: "json" | "text" = "json"): Promise<any> {
  let response: Response;
  try { response = await fetcher(url, { ...init, redirect: "manual", signal: AbortSignal.timeout(15000) }); }
  catch { throw new AppError("app_provider_unavailable", 503); }
  const reader = response.body?.getReader();
  const chunks: Uint8Array[] = []; let size = 0;
  if (reader) { try { for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > 1048576) { await reader.cancel(); throw new AppError("app_response_too_large", 502); } chunks.push(value); } } catch (error) { if (error instanceof AppError) throw error; throw new AppError("app_provider_unavailable", 503); } finally { reader.releaseLock(); } }
  const bytes = new Uint8Array(size); let offset = 0; chunks.forEach(chunk => { bytes.set(chunk, offset); offset += chunk.length; });
  const text = new TextDecoder().decode(bytes);
  if (responseKind === "text" && response.ok) return { text, mimeType: response.headers.get("content-type") || "text/plain" };
  let body: any; try { body = text ? JSON.parse(text) : {}; } catch { throw new AppError("app_invalid_provider_response", 502); }
  if (!response.ok || body.ok === false || body.error || body.errors?.length) {
    const error = typeof body.error === "string" ? body.error : body.error?.code;
    if (response.status === 401 || ["invalid_grant", "bad_refresh_token", "invalid_auth", "token_revoked", "token_expired"].includes(error)) throw new AppError("app_reauthorization_required", 401);
    if (response.status === 429 || error === "ratelimited") throw new AppError("app_rate_limited", 429);
    if (response.status === 412) throw new AppError("app_review_changed", 409);
    if (response.status === 403 || error === "missing_scope") throw new AppError("app_scope_required", 403);
    throw new AppError("app_provider_failed", response.status >= 500 ? 503 : 502);
  }
  if (!text && response.headers.get("x-restli-id")) return { id: response.headers.get("x-restli-id") };
  return body;
}
export async function authorizationUrl(env: AppEnv, provider: AppProvider, permissions: AppPermission[], state: string, verifier: string, context: AppContext = {}) {
  const def = APP_CATALOG[provider]; const { id } = credentials(env, provider);
  const url = new URL(endpoint(def.authorize, context));
  if (def.credential === "ATLASSIAN") { url.searchParams.set("audience", "api.atlassian.com"); url.searchParams.set("prompt", "consent"); }
  if (provider === "notion") url.searchParams.set("owner", "user");
  url.searchParams.set("client_id", id); url.searchParams.set("redirect_uri", callbackUrl(env, provider));
  url.searchParams.set("response_type", "code"); url.searchParams.set("state", state);
  url.searchParams.set(provider === "slack" ? "user_scope" : "scope", appScopes(provider, permissions).join(["slack", "shopify"].includes(provider) ? "," : " "));
  if (def.pkce) { url.searchParams.set("code_challenge", await pkceChallenge(verifier)); url.searchParams.set("code_challenge_method", "S256"); }
  if (def.credential === "GOOGLE") { url.searchParams.set("access_type", "offline"); url.searchParams.set("prompt", "consent"); url.searchParams.set("include_granted_scopes", "false"); }
  return url.toString();
}
export const callbackUrl = (env: AppEnv, provider: AppProvider) => (env.APP_ORIGIN || env.PUBLIC_ORIGIN).replace(/\/$/, "") + `/api/apps/oauth/${provider}/callback`;
export async function exchangeTokens(env: AppEnv, provider: AppProvider, input: ({ code: string; verifier: string } | { refreshToken: string; previous: AppTokens }) & { context?: AppContext }, fetcher: typeof fetch = fetch): Promise<AppTokens> {
  const def = APP_CATALOG[provider]; const { id, secret } = credentials(env, provider);
  const form = new URLSearchParams({ client_id: id, client_secret: secret });
  if ("code" in input) { form.set("grant_type", "authorization_code"); form.set("code", input.code); form.set("redirect_uri", callbackUrl(env, provider)); if (def.pkce) form.set("code_verifier", input.verifier); }
  else { form.set("grant_type", "refresh_token"); form.set("refresh_token", input.refreshToken); }
  const context = input.context || ("previous" in input ? input.previous.context : undefined) || connectionContext(env, provider);
  const headers: Record<string,string> = { "content-type": "application/x-www-form-urlencoded", accept: "application/json" };
  let body: BodyInit = form;
  if (provider === "notion") { headers.authorization = "Basic " + btoa(id + ":" + secret); form.delete("client_id"); form.delete("client_secret"); }
  if (["notion", "shopify"].includes(provider) || def.credential === "ATLASSIAN") { headers["content-type"] = "application/json"; const payload = Object.fromEntries(form); if (provider === "shopify" && "code" in input) delete payload.grant_type; body = JSON.stringify(payload); }
  const result = await providerJson(endpoint(def.token, context), { method: "POST", headers, body }, fetcher);
  if (provider === "salesforce" && typeof result.instance_url === "string") context.instanceOrigin = new URL(result.instance_url).origin;
  const token = provider === "slack" && "code" in input ? result.authed_user : result;
  if (!token || typeof token.access_token !== "string" || !token.access_token) throw new AppError("app_invalid_token_response", 502);
  const previous = "previous" in input ? input.previous : null;
  const seconds = token.expires_in === undefined ? null : Number(token.expires_in);
  if (seconds !== null && (!Number.isFinite(seconds) || seconds < 1 || seconds > 31536000)) throw new AppError("app_invalid_token_response", 502);
  return { accessToken: token.access_token, refreshToken: token.refresh_token || previous?.refreshToken, expiresAt: seconds === null ? null : new Date(Date.now() + seconds * 1000).toISOString(), scopes: (typeof token.scope === "string" ? token.scope.split(/[ ,]+/).filter(Boolean) : Array.isArray(token.scopes) && token.scopes.every((s:unknown)=>typeof s==="string") ? token.scopes : previous?.scopes || []).map((s:string)=>normalizeScope(s,provider)), context };
}
export async function providerIdentity(provider: AppProvider, tokens: AppTokens, fetcher: typeof fetch = fetch, env?: AppEnv): Promise<{ id: string; label: string }> {
  const extra = await extraIdentity(provider, tokens, fetcher, env); if (extra) return extra;
  const headers = { authorization: `Bearer ${tokens.accessToken}`, accept: "application/json", "user-agent": "Remote-Arc-Apps" };
  if (provider === "github") { const r = await providerJson("https://api.github.com/user", { headers }, fetcher); if (!r.id || !r.login) throw new AppError("app_identity_unavailable", 502); return { id: String(r.id), label: r.login }; }
  if (provider === "slack") { const r = await providerJson("https://slack.com/api/auth.test", { headers }, fetcher); if (!r.user_id || !r.team_id) throw new AppError("app_identity_unavailable", 502); return { id: `${r.team_id}:${r.user_id}`, label: `${r.team || r.team_id} / ${r.user || r.user_id}` }; }
  if (provider === "gmail") { const r = await providerJson("https://gmail.googleapis.com/gmail/v1/users/me/profile", { headers }, fetcher); if (!r.emailAddress) throw new AppError("app_identity_unavailable", 502); return { id: r.emailAddress, label: r.emailAddress }; }
  if (provider === "google_calendar") { const r = await providerJson("https://www.googleapis.com/calendar/v3/users/me/calendarList/primary", { headers }, fetcher); if (!r.id) throw new AppError("app_identity_unavailable", 502); return { id: r.id, label: r.id }; }
  const r = await providerJson("https://graph.microsoft.com/v1.0/me?$select=id,displayName,mail,userPrincipalName", { headers }, fetcher);
  if (!r.id) throw new AppError("app_identity_unavailable", 502); return { id: r.id, label: r.mail || r.userPrincipalName || r.displayName || r.id };
}
export async function revokeProvider(env: AppEnv, provider: AppProvider, tokens: AppTokens, fetcher: typeof fetch = fetch) {
  if (APP_CATALOG[provider].auth === "api_key") return { localOnly: true };
  const { id, secret } = credentials(env, provider);
  if (provider === "github") return providerJson(`https://api.github.com/applications/${encodeURIComponent(id)}/token`, { method: "DELETE", headers: { authorization: "Basic " + btoa(`${id}:${secret}`), "content-type": "application/json", "user-agent": "Remote-Arc-Apps" }, body: JSON.stringify({ access_token: tokens.accessToken }) }, fetcher);
  if (provider === "slack") return providerJson("https://slack.com/api/auth.revoke", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token: tokens.accessToken }) }, fetcher);
  if (APP_CATALOG[provider].credential === "GOOGLE") return providerJson("https://oauth2.googleapis.com/revoke", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token: tokens.refreshToken || tokens.accessToken }) }, fetcher);
  // Microsoft has no per-refresh-token revocation endpoint. Delete the local
  // capability immediately; the user can remove provider consent separately.
  const portals: Record<string,string> = { MICROSOFT:"https://myapplications.microsoft.com/", ATLASSIAN:"https://id.atlassian.com/manage-profile/apps", META:"https://www.facebook.com/settings?tab=business_tools", NOTION:"https://www.notion.so/my-integrations", LINKEDIN:"https://www.linkedin.com/mypreferences/d/permitted-services", HUBSPOT:"https://app.hubspot.com/", SALESFORCE:"https://login.salesforce.com/" };
  return { providerConsentUrl: portals[APP_CATALOG[provider].credential] || "https://" + tokens.context?.shopDomain + "/admin/settings/apps", localOnly: true };
}
export const newVerifier = () => randomToken(32);
