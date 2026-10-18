/** Signed GitHub Marketplace purchase events. Does not grant product entitlements. */
export type MarketplaceEnv = { DB: D1Database; GITHUB_MARKETPLACE_WEBHOOK_SECRET?: string };
type RecordLike = Record<string, unknown>;
const obj = (x: unknown): RecordLike => x !== null && typeof x === "object" && !Array.isArray(x) ? x as RecordLike : {};
const str = (x: unknown, max = 200): string | null => typeof x === "string" && x.length > 0 && x.length <= max ? x : null;
const id = (x: unknown): number | null => typeof x === "number" && Number.isSafeInteger(x) && x > 0 ? x : null;
const count = (x: unknown): number | null => typeof x === "number" && Number.isSafeInteger(x) && x >= 0 ? x : null;
const date = (x: unknown): string | null =>
  typeof x === "string" && x.length <= 50 && Number.isFinite(Date.parse(x)) ? new Date(x).toISOString() : null;
const VALID_ACTIONS = new Set(["purchased", "changed", "cancelled", "pending_change", "pending_change_cancelled"]);
export async function verifyMarketplaceSignature(payload: ArrayBuffer, secret: string, header: string | null): Promise<boolean> {
  if (!header || !/^sha256=[a-fA-F0-9]{64}$/.test(header)) return false;
  const signature = new Uint8Array(32);
  for (let i = 0; i < 32; ++i) signature[i] = parseInt(header.slice(7 + i * 2, 9 + i * 2), 16);
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  return crypto.subtle.verify("HMAC", key, signature, payload);
}
export async function handleMarketplaceWebhook(request: Request, env: MarketplaceEnv): Promise<Response> {
  if (request.method !== "POST") return Response.json({ error: "method_not_allowed" }, { status: 405, headers: { Allow: "POST" } });
  if (!env.GITHUB_MARKETPLACE_WEBHOOK_SECRET) return Response.json({ error: "not_configured" }, { status: 503 });
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json"))
    return Response.json({ error: "json_required" }, { status: 415 });
  if (Number(request.headers.get("content-length") || 0) > 262144)
    return Response.json({ error: "payload_too_large" }, { status: 413 });
  const raw = await request.arrayBuffer();
  if (raw.byteLength > 262144) return Response.json({ error: "payload_too_large" }, { status: 413 });
  if (!await verifyMarketplaceSignature(raw, env.GITHUB_MARKETPLACE_WEBHOOK_SECRET, request.headers.get("x-hub-signature-256")))
    return Response.json({ error: "invalid_signature" }, { status: 401 });
  const event = request.headers.get("x-github-event");
  if (event === "ping") return Response.json({ ok: true, event: "ping" });
  if (event !== "marketplace_purchase") return Response.json({ accepted: true, ignored: true }, { status: 202 });
  const deliveryId = request.headers.get("x-github-delivery");
  if (!deliveryId || !/^[a-zA-Z0-9_-]{1,128}$/.test(deliveryId))
    return Response.json({ error: "invalid_delivery" }, { status: 400 });
  let value: unknown;
  try { value = JSON.parse(new TextDecoder().decode(raw)); }
  catch { return Response.json({ error: "invalid_json" }, { status: 400 }); }
  const payload = obj(value), purchase = obj(payload.marketplace_purchase);
  const account = obj(purchase.account), plan = obj(purchase.plan);
  const action = str(payload.action, 40), accountId = id(account.id), effective = date(payload.effective_date);
  if (!action || !VALID_ACTIONS.has(action) || !accountId || !effective)
    return Response.json({ error: "invalid_purchase" }, { status: 400 });
  const now = new Date().toISOString();
  const guard = "EXISTS (SELECT 1 FROM github_marketplace_deliveries WHERE delivery_id = ?1 AND processed_at IS NULL)";
  const statements: D1PreparedStatement[] = [
    env.DB.prepare("INSERT OR IGNORE INTO github_marketplace_deliveries (delivery_id, event_name, action, account_id, received_at) VALUES (?1, 'marketplace_purchase', ?2, ?3, ?4)")
      .bind(deliveryId, action, accountId, now),
  ];
  if (action === "purchased" || action === "changed" || action === "cancelled") {
    statements.push(env.DB.prepare(
      "INSERT INTO github_marketplace_subscriptions " +
      "(account_id, account_login, account_type, plan_id, plan_name, billing_cycle, unit_count, on_free_trial, free_trial_ends_on, next_billing_date, status, effective_date, last_delivery_id, updated_at) " +
      "SELECT ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?1, ?14 WHERE " + guard + " " +
      "ON CONFLICT(account_id) DO UPDATE SET account_login=excluded.account_login, account_type=excluded.account_type, " +
      "plan_id=excluded.plan_id, plan_name=excluded.plan_name, billing_cycle=excluded.billing_cycle, unit_count=excluded.unit_count, " +
      "on_free_trial=excluded.on_free_trial, free_trial_ends_on=excluded.free_trial_ends_on, next_billing_date=excluded.next_billing_date, " +
      "status=excluded.status, effective_date=excluded.effective_date, last_delivery_id=excluded.last_delivery_id, updated_at=excluded.updated_at " +
      "WHERE excluded.effective_date >= github_marketplace_subscriptions.effective_date"
    ).bind(deliveryId, accountId, str(account.login) || "", str(account.type, 50), id(plan.id), str(plan.name),
      str(purchase.billing_cycle, 40), count(purchase.unit_count), purchase.on_free_trial === true ? 1 : 0,
      date(purchase.free_trial_ends_on), date(purchase.next_billing_date), action === "cancelled" ? "cancelled" : "active", effective, now));
    statements.push(env.DB.prepare("DELETE FROM github_marketplace_pending_changes WHERE account_id=?2 AND effective_date<=?3 AND " + guard)
      .bind(deliveryId, accountId, effective));
  } else if (action === "pending_change") {
    statements.push(env.DB.prepare(
      "INSERT INTO github_marketplace_pending_changes (account_id, plan_id, plan_name, effective_date, last_delivery_id, updated_at) " +
      "SELECT ?2, ?3, ?4, ?5, ?1, ?6 WHERE " + guard + " " +
      "ON CONFLICT(account_id) DO UPDATE SET plan_id=excluded.plan_id, plan_name=excluded.plan_name, " +
      "effective_date=excluded.effective_date, last_delivery_id=excluded.last_delivery_id, updated_at=excluded.updated_at " +
      "WHERE excluded.effective_date >= github_marketplace_pending_changes.effective_date"
    ).bind(deliveryId, accountId, id(plan.id), str(plan.name), effective, now));
  } else {
    statements.push(env.DB.prepare("DELETE FROM github_marketplace_pending_changes WHERE account_id=?2 AND " + guard)
      .bind(deliveryId, accountId));
  }
  statements.push(env.DB.prepare(
    "UPDATE github_marketplace_deliveries SET processed_at=?2 WHERE delivery_id=?1 AND processed_at IS NULL"
  ).bind(deliveryId, now));
  // Batch is transactional: duplicate deliveries cannot reapply a subscription mutation.
  const result = await env.DB.batch(statements);
  return Response.json({ accepted: true, duplicate: (result[0]?.meta?.changes ?? 0) === 0 }, { status: 202 });
}
