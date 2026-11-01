import type { OAuthIdentity } from "../auth/auth.js";
import { getSessionUser } from "../auth/auth.js";
import { isTrustedDashboardMutation, type DashboardOriginEnv } from "../auth/dashboard-origin.js";
import { callDevice, type DeviceCallEnv } from "./device-call.js";

/**
 * One-time secrets: an AI asks the user for a value (an API key, a token) it
 * must not see. The device makes a key pair for the request, the user's
 * browser encrypts the value to it, and the Relay forwards only ciphertext.
 * The AI holds a handle, which start_process (stdin_secret) or a shared-tab
 * fill (secret) spends once on the same device.
 */
export type SecretEnv = DeviceCallEnv & DashboardOriginEnv & { DASHBOARD_ORIGIN?: string };

export const SECRET_HANDLE = /^sec_[a-z2-7]{24}$/;
export const SECRET_LIFETIME_MS = 10 * 60 * 1000;
const B64URL = /^[A-Za-z0-9_-]+$/;

type Row = {
  id: string; user_id: string; device_id: string; client_id: string | null; purpose: string; site: string | null;
  public_key: string; status: string; created_at: string; expires_at: string; delivered_at: string | null; used_at: string | null;
};

function newHandle() {
  const alphabet = "abcdefghijklmnopqrstuvwxyz234567";
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return "sec_" + Array.from(bytes, (b) => alphabet[b & 31]).join("");
}

export function secretSite(value: unknown): string | null {
  try {
    const url = new URL(String(value));
    return url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)) ? url.origin : null;
  } catch {
    return null;
  }
}

const unsupported = (platform: string) =>
  platform === "browser"
    ? "SECRET_UNSUPPORTED: this Remote Arc Browser extension is too old for one-time secrets. Ask the user to update it (Dashboard Devices shows how), then try again."
    : "SECRET_UNSUPPORTED: this computer's Remote Arc Agent cannot take one-time secrets. It needs terminal mode and a current Agent; ask the user to update it, then try again.";

/** Creates the request on the device and returns the handle and the link the user opens. */
export async function createSecretRequest(env: SecretEnv, identity: OAuthIdentity, input: { deviceId: string; purpose: string; site?: string }) {
  const device = await env.DB.prepare("SELECT id, platform FROM devices WHERE id = ?1 AND user_id = ?2 AND revoked_at IS NULL")
    .bind(input.deviceId, identity.userId).first<{ id: string; platform: string }>();
  if (!device) throw new Error("device not found or revoked");
  const purpose = input.purpose.trim().replace(/\s+/g, " ");
  if (purpose.length < 3 || purpose.length > 300) throw new Error("purpose must say in 3 to 300 characters what the secret is for.");
  let site: string | null = null;
  if (device.platform === "browser") {
    site = secretSite(input.site);
    if (!site) throw new Error("site is required for a browser: the https address of the page the secret will be filled on. It can be filled only there.");
  } else if (input.site) {
    throw new Error("site applies only to a browser device. On a computer the secret goes to start_process with stdin_secret.");
  }
  const handle = newHandle();
  let prepared: unknown;
  try {
    prepared = await callDevice(env, identity, device.id, "secret_prepare", { handle, ...(site ? { site } : {}) });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/Unsupported browser tool|Tool blocked by local permission mode|unknown tool|not supported/i.test(message)) throw new Error(unsupported(device.platform));
    if (/disabled for this device/.test(message)) {
      throw new Error('tool "secret_prepare" is disabled for this device: a one-time secret needs ' + (device.platform === "browser" ? "Click & fill" : "start_process") + " enabled for it in the Remote Arc Dashboard.");
    }
    throw error;
  }
  const publicKey = (prepared as { public_key?: unknown } | null)?.public_key;
  if (typeof publicKey !== "string" || !B64URL.test(publicKey) || publicKey.length !== 87) throw new Error(unsupported(device.platform));
  const created = new Date();
  const expires = new Date(created.getTime() + SECRET_LIFETIME_MS);
  await env.DB.prepare(
    "INSERT INTO secret_requests(id,user_id,device_id,client_id,purpose,site,public_key,status,created_at,expires_at) VALUES(?1,?2,?3,?4,?5,?6,?7,'pending',?8,?9)",
  ).bind(handle, identity.userId, device.id, identity.clientId, purpose, site, publicKey, created.toISOString(), expires.toISOString()).run();
  const url = new URL("/secret/" + handle, env.DASHBOARD_ORIGIN || env.PUBLIC_ORIGIN).toString();
  return {
    handle,
    url,
    status: "waiting_for_user",
    expires_at: expires.toISOString(),
    ...(site ? { site } : {}),
    next_action: "Give the user this link and ask them to enter the value there, not in this chat: " + url + " . Then use the handle " + handle + (site
      ? " with shared_tab_fill or shared_tab_act action=fill (secret=" + handle + ") on " + site + "."
      : " with start_process stdin_secret=" + handle + ", which gives the value to the command on standard input.") +
      " It works once, on this device only, and expires 10 minutes after the user enters it. You never see the value; do not ask for it.",
  };
}

/**
 * Checks a handle before the call that spends it, so the AI gets a clear
 * answer and a handle cannot be used on another device or site.
 */
export async function assertSecretUsable(env: SecretEnv, userId: string, deviceId: string, handle: string) {
  if (!SECRET_HANDLE.test(handle)) throw new Error("SECRET_NOT_FOUND: a secret must be a handle from request_secret, never the value itself.");
  const row = await env.DB.prepare("SELECT * FROM secret_requests WHERE id = ?1 AND user_id = ?2").bind(handle, userId).first<Row>();
  if (!row) throw new Error("SECRET_NOT_FOUND: no secret " + handle + " exists for this user. Ask for it with request_secret.");
  if (row.device_id !== deviceId) throw new Error("SECRET_WRONG_DEVICE: " + handle + " was entered for another device. Use it there, or ask again with request_secret for this device.");
  if (row.status === "used") throw new Error("SECRET_USED: " + handle + " was already used. Ask the user again with request_secret if it is needed once more.");
  if (row.status === "pending" && Date.parse(row.expires_at) > Date.now()) {
    throw new Error("SECRET_PENDING: the user has not entered " + handle + " yet. Ask them to open the link from request_secret, then call this again.");
  }
  if (row.status !== "delivered" || (row.delivered_at && Date.parse(row.delivered_at) + SECRET_LIFETIME_MS <= Date.now())) {
    throw new Error("SECRET_EXPIRED: " + handle + " expired. Ask the user again with request_secret.");
  }
  return row;
}

export async function markSecretUsed(env: SecretEnv, handle: string) {
  await env.DB.prepare("UPDATE secret_requests SET status='used', used_at=?2 WHERE id=?1 AND status='delivered'")
    .bind(handle, new Date().toISOString()).run();
}

const handleFromPath = (pathname: string) => {
  const match = pathname.match(/^\/api\/secret-requests\/([^/]+)$/);
  const handle = match?.[1] ? decodeURIComponent(match[1]) : "";
  return SECRET_HANDLE.test(handle) ? handle : "";
};
const noStore = { "cache-control": "no-store" };

/** GET: what the entry page shows. A request of another user reads as missing. */
export async function handleSecretRequestRead(request: Request, env: SecretEnv) {
  const user = await getSessionUser(request, env as never);
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401, headers: noStore });
  const handle = handleFromPath(new URL(request.url).pathname);
  const row = handle
    ? await env.DB.prepare(
      `SELECT s.*, d.name AS device_name, d.platform AS device_platform, c.client_name
       FROM secret_requests s JOIN devices d ON d.id = s.device_id
       LEFT JOIN oauth_clients c ON c.client_id = s.client_id
       WHERE s.id = ?1 AND s.user_id = ?2`,
    ).bind(handle, user.id).first<Row & { device_name: string; device_platform: string; client_name: string | null }>()
    : null;
  if (!row) return Response.json({ error: "not_found" }, { status: 404, headers: noStore });
  const expired = row.status === "pending" && Date.parse(row.expires_at) <= Date.now();
  return Response.json({
    handle: row.id,
    purpose: row.purpose,
    site: row.site,
    device: { id: row.device_id, name: row.device_name, platform: row.device_platform },
    requested_by: row.client_name || (row.client_id === "dashboard" ? "Remote Arc" : row.client_id ? "An AI client" : "Remote Arc"),
    public_key: row.status === "pending" && !expired ? row.public_key : null,
    status: expired ? "expired" : row.status,
    created_at: row.created_at,
    expires_at: row.expires_at,
  }, { headers: noStore });
}

/** POST: forwards the ciphertext the page made to the device. Nothing is stored. */
export async function handleSecretRequestSubmit(request: Request, env: SecretEnv) {
  if (!isTrustedDashboardMutation(request, env)) return Response.json({ error: "same_origin_required" }, { status: 403, headers: noStore });
  const user = await getSessionUser(request, env as never);
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401, headers: noStore });
  const handle = handleFromPath(new URL(request.url).pathname);
  const row = handle
    ? await env.DB.prepare("SELECT * FROM secret_requests WHERE id = ?1 AND user_id = ?2").bind(handle, user.id).first<Row>()
    : null;
  if (!row) return Response.json({ error: "not_found" }, { status: 404, headers: noStore });
  if (row.status !== "pending") return Response.json({ error: "already_" + row.status }, { status: 409, headers: noStore });
  if (Date.parse(row.expires_at) <= Date.now()) return Response.json({ error: "expired" }, { status: 410, headers: noStore });
  const body = await request.json().catch(() => null) as { epk?: unknown; iv?: unknown; ciphertext?: unknown } | null;
  const field = (value: unknown, min: number, max: number) => typeof value === "string" && B64URL.test(value) && value.length >= min && value.length <= max;
  if (!body || !field(body.epk, 87, 87) || !field(body.iv, 16, 16) || !field(body.ciphertext, 24, 44000)) {
    return Response.json({ error: "invalid_ciphertext" }, { status: 400, headers: noStore });
  }
  // Claim the request first, so two submissions cannot both reach the device.
  const claimed = await env.DB.prepare("UPDATE secret_requests SET status='delivering' WHERE id=?1 AND user_id=?2 AND status='pending'")
    .bind(handle, user.id).run();
  if (!claimed.meta?.changes) return Response.json({ error: "already_submitted" }, { status: 409, headers: noStore });
  try {
    await callDevice(env, { userId: user.id, clientId: "dashboard", grantId: null, scope: "", resource: env.PUBLIC_ORIGIN }, row.device_id, "secret_deliver", {
      handle, epk: body.epk, iv: body.iv, ciphertext: body.ciphertext,
    });
  } catch (error) {
    await env.DB.prepare("UPDATE secret_requests SET status='failed' WHERE id=?1").bind(handle).run();
    const message = error instanceof Error ? error.message : String(error);
    const offline = /offline|not connected|timed out/i.test(message);
    return Response.json({ error: offline ? "device_offline" : "device_rejected" }, { status: 502, headers: noStore });
  }
  await env.DB.prepare("UPDATE secret_requests SET status='delivered', delivered_at=?2 WHERE id=?1").bind(handle, new Date().toISOString()).run();
  return Response.json({ ok: true, status: "delivered" }, { headers: noStore });
}
