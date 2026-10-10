import { getSessionUser } from "./auth.js";

export type MarketingEmailEnv = {
  DB: D1Database;
  PUBLIC_ORIGIN: string;
  EMAIL_AUTH_SECRET?: string;
  RESEND_API_KEY?: string;
  MARKETING_REENGAGEMENT_ENABLED?: string;
  MARKETING_FROM_EMAIL?: string;
};
type PreferenceRow = { opted_in: number; consented_at: string | null; unsubscribed_at: string | null };
type Candidate = { id: string; email: string; name: string | null };

const BASE = "https://mcp.remotearc.app";
const SITE = "https://remotearc.app";
const SUPPORT = "support@remotearc.app";

function safeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}
function htmlPage(title: string, body: string, status = 200): Response {
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${safeHtml(title)} — Remote Arc</title></head><body style="margin:0;background:#f5f9fb;color:#183342;font:16px/1.7 system-ui,Arial,sans-serif"><main style="max-width:560px;margin:9vh auto;padding:32px;background:white;border:1px solid #dce7ec;border-radius:16px"><strong>REMOTE ARC</strong><h1>${safeHtml(title)}</h1>${body}<p><a href="${SITE}">Remote Arc homepage</a> · <a href="mailto:${SUPPORT}">Support</a></p></main></body></html>`, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" } });
}
async function makeSig(secret: string, id: string, email: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode("remote-arc-marketing-unsubscribe-v1:" + id + ":" + email.toLowerCase()));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}
function safeEqual(a: string, b: string): boolean {
  if (!/^[0-9a-f]{64}$/.test(a) || a.length !== b.length) return false;
  let n = 0;
  for (let i = 0; i < a.length; i++) n |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return n === 0;
}
async function unsubscribeUser(env: MarketingEmailEnv, request: Request) {
  if (!env.EMAIL_AUTH_SECRET) return null;
  const url = new URL(request.url);
  let id = url.searchParams.get("u") || "";
  let sig = url.searchParams.get("s") || "";
  if (request.method === "POST" && (!id || !sig)) {
    const form = await request.formData();
    id = String(form.get("u") || "");
    sig = String(form.get("s") || "");
  }
  if (!/^[\w-]{1,128}$/.test(id)) return null;
  const user = await env.DB.prepare("SELECT id, email FROM users WHERE id = ?1 LIMIT 1")
    .bind(id).first<{id: string; email: string}>();
  if (!user || !safeEqual(sig, await makeSig(env.EMAIL_AUTH_SECRET, user.id, user.email))) return null;
  return user;
}

export async function handleUnsubscribe(request: Request, env: MarketingEmailEnv): Promise<Response> {
  if (request.method !== "GET" && request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const user = await unsubscribeUser(env, request);
  if (!user) return htmlPage("Invalid unsubscribe link", "<p>This link is invalid. You can change your preferences from your account, or contact support.</p>", 400);
  if (request.method === "GET") {
    const url = new URL(request.url);
    const u = safeHtml(url.searchParams.get("u") || "");
    const s = safeHtml(url.searchParams.get("s") || "");
    return htmlPage("Email preferences", `<p>Stop receiving optional Remote Arc product updates and getting-started tips at <strong>${safeHtml(user.email)}</strong>.</p><form method="post"><input type="hidden" name="u" value="${u}"><input type="hidden" name="s" value="${s}"><button style="padding:12px 20px;border:0;border-radius:9px;background:#092e42;color:white;cursor:pointer">Unsubscribe from promotional emails</button></form><p>Sign-in codes and important security communications are separate from promotional emails.</p>`);
  }
  // POST supports RFC 8058 one-click and the explicit confirmation form.
  await env.DB.prepare(`INSERT INTO marketing_email_preferences (user_id,opted_in,consented_at,consent_source,unsubscribed_at,last_campaign_sent_at,updated_at)
      VALUES (?1,0,NULL,NULL,?2,NULL,?2)
      ON CONFLICT(user_id) DO UPDATE SET opted_in=0,unsubscribed_at=excluded.unsubscribed_at,updated_at=excluded.updated_at`)
    .bind(user.id, new Date().toISOString()).run();
  return htmlPage("Unsubscribed", "<p>You won't receive optional promotional emails from Remote Arc anymore. This does not affect login verification codes or essential security notifications.</p>");
}

export async function handleMarketingPreferences(request: Request, env: MarketingEmailEnv): Promise<Response> {
  const user = await getSessionUser(request, env);
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401, headers: { "cache-control": "no-store" } });
  if (request.method === "GET") {
    const preference = await env.DB.prepare("SELECT opted_in,consented_at,unsubscribed_at FROM marketing_email_preferences WHERE user_id=?1")
      .bind(user.id).first<PreferenceRow>();
    return Response.json({ opted_in: preference?.opted_in === 1, consented_at: preference?.consented_at ?? null }, { headers: { "cache-control": "no-store" } });
  }
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  // Cookie-authenticated cross-site POSTs are rejected, including a forged
  // consent checkbox; this endpoint is only for an actual dashboard action.
  const origin = request.headers.get("origin");
  if (origin !== new URL(request.url).origin || !request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return Response.json({ error: "invalid_origin" }, { status: 403 });
  }
  let input: { opted_in?: unknown };
  try { input = await request.json() as { opted_in?: unknown }; }
  catch { return Response.json({ error: "invalid_json" }, { status: 400 }); }
  if (typeof input.opted_in !== "boolean") return Response.json({ error: "invalid_preference" }, { status: 400 });
  const now = new Date().toISOString();
  await env.DB.prepare(`INSERT INTO marketing_email_preferences
    (user_id,opted_in,consented_at,consent_source,unsubscribed_at,last_campaign_sent_at,updated_at)
    VALUES (?1,?2,?3,?4,?5,NULL,?6)
    ON CONFLICT(user_id) DO UPDATE SET
      opted_in=excluded.opted_in,
      consented_at=CASE WHEN excluded.opted_in=1 THEN excluded.consented_at ELSE marketing_email_preferences.consented_at END,
      consent_source=CASE WHEN excluded.opted_in=1 THEN excluded.consent_source ELSE marketing_email_preferences.consent_source END,
      unsubscribed_at=excluded.unsubscribed_at,updated_at=excluded.updated_at`)
    .bind(user.id, input.opted_in ? 1 : 0, input.opted_in ? now : null,
      input.opted_in ? "dashboard_explicit_opt_in" : null, input.opted_in ? null : now, now).run();
  return Response.json({ opted_in: input.opted_in }, { headers: { "cache-control": "no-store" } });
}

export async function renderReengagementEmail(env: MarketingEmailEnv, candidate: Candidate) {
  if (!env.EMAIL_AUTH_SECRET) throw new Error("Email signing key missing");
  const sig = await makeSig(env.EMAIL_AUTH_SECRET, candidate.id, candidate.email);
  const unsubscribe = BASE + "/unsubscribe?u=" + encodeURIComponent(candidate.id) + "&s=" + sig;
  const firstName = (candidate.name || "").trim().split(/\s+/)[0]?.slice(0, 40) || "there";
  const title = "Your AI can do more than chat";
  const safeName = safeHtml(firstName);
  const text = [
    "Hi " + firstName + ",",
    "",
    "You created a Remote Arc account, but haven't tried a device tool call yet.",
    "You can connect your own Windows, macOS or Linux computer to the AI you already use — no new model API key required for ordinary MCP tool calls.",
    "",
    "Start here: " + SITE + "/docs",
    "On the computer you want to connect, run: npx remotelink",
    "You stay in control of the device and each enabled permission.",
    "",
    "Questions? Email " + SUPPORT,
    "Unsubscribe: " + unsubscribe,
    "Remote Arc | " + SITE,
  ].join("\n");
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head><body style="margin:0;background:#f3f7fa;font:15px/1.7 Arial,Helvetica,sans-serif;color:#274351"><div style="max-width:560px;margin:32px auto;background:white;border:1px solid #dfebef;border-radius:16px;overflow:hidden"><div style="background:#071724;padding:24px 30px;color:#f6fbff;font-weight:800;font-size:21px">Remote Arc</div><div style="padding:32px 30px"><p style="color:#2182a6;font-weight:700;font-size:12px;letter-spacing:1px">GETTING STARTED</p><h1 style="font-size:28px;line-height:1.25;color:#153245">${title}</h1><p>Hi ${safeName},</p><p>You created a Remote Arc account, but haven't tried a device tool call yet.</p><p>Connect your own Windows, Mac or Linux computer to the AI you already use. <strong>You don't need another model API key for ordinary MCP tool calls.</strong></p><div style="background:#f1f8fb;border-radius:10px;padding:16px;margin:20px 0"><span style="font-size:12px;color:#567481">On your computer:</span><div style="font-family:monospace;color:#092f43;font-weight:bold;font-size:19px">npx remotelink</div></div><p><a href="${SITE}/docs" style="display:inline-block;background:#0b394f;color:white;padding:11px 20px;border-radius:8px;text-decoration:none;font-weight:bold">View quick-start guide →</a></p><p style="font-size:13px;color:#536b79">Your computer remains under your control, with per-device permissions.</p></div><div style="padding:20px 30px;background:#f8fbfd;border-top:1px solid #e3edf1;font-size:12px;color:#637985">Remote Arc · <a href="mailto:${SUPPORT}">${SUPPORT}</a><br><a href="${unsubscribe}">Unsubscribe from product updates</a> · <a href="${SITE}/privacy">Privacy</a></div></div></body></html>`;
  return { subject: title, html, text, headers: {
    "List-Unsubscribe": "<" + unsubscribe + ">, <mailto:" + SUPPORT + "?subject=unsubscribe>",
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  }, unsubscribe };
}

/** Disabled by default. Only verified explicit opt-ins, seven days after signup,
 * who have never consumed tool credits. At most three eligible mails per cron
 * and five per UTC day across all accounts. The same user is never retried.
 */
export async function runReengagementCampaign(env: MarketingEmailEnv, now = new Date()) {
  if (env.MARKETING_REENGAGEMENT_ENABLED !== "1") return { enabled: false, sent: 0 };
  if (!env.RESEND_API_KEY || !env.EMAIL_AUTH_SECRET) throw new Error("Marketing email sending prerequisites missing");
  const dayStart = now.toISOString().slice(0, 10) + "T00:00:00.000Z";
  const oldEnough = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM marketing_email_preferences WHERE last_campaign_sent_at >= ?1")
    .bind(dayStart).first<{n: number}>();
  const remaining = Math.max(0, Math.min(3, 5 - (count?.n || 0)));
  if (!remaining) return { enabled: true, sent: 0 };
  const candidates = await env.DB.prepare(`SELECT u.id,u.email,u.name
    FROM users u JOIN marketing_email_preferences p ON p.user_id=u.id
    WHERE p.opted_in=1 AND p.consented_at IS NOT NULL AND p.last_campaign_sent_at IS NULL
      AND u.created_at < ?1 AND u.role != 'admin' AND u.id != 'reviewer-openai-v1'
      AND NOT EXISTS (SELECT 1 FROM user_monthly_usage m WHERE m.user_id=u.id AND m.tool_calls > 0)
    ORDER BY u.created_at ASC LIMIT ?2`)
    .bind(oldEnough, remaining).all<Candidate>();
  let sent = 0;
  for (const user of candidates.results || []) {
    const stamp = now.toISOString();
    const claim = await env.DB.prepare(`UPDATE marketing_email_preferences
      SET last_campaign_sent_at=?2,updated_at=?2
      WHERE user_id=?1 AND opted_in=1 AND last_campaign_sent_at IS NULL`)
      .bind(user.id, stamp).run();
    if (claim.meta?.changes !== 1) continue;
    try {
      const msg = await renderReengagementEmail(env, user);
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST", headers: { Authorization: "Bearer " + env.RESEND_API_KEY, "content-type": "application/json" },
        body: JSON.stringify({ from: env.MARKETING_FROM_EMAIL || "Remote Arc <updates@remotearc.app>", to: [user.email],
          subject: msg.subject, html: msg.html, text: msg.text, headers: msg.headers }),
      });
      if (!response.ok) throw new Error("Resend rejected reengagement email: HTTP " + response.status);
      sent++;
    } catch (error) {
      // Safe to retry after explicit failure, without re-sending claimed
      // successful messages. Ambiguous upstream timeouts must be manually
      // reconciled before enabling this optional campaign.
      console.error("marketing_send_failed", { status: error instanceof Error ? error.message : "unknown" });
      // Keep claim to avoid duplicate email after a possibly ambiguous delivery.
    }
  }
  return { enabled: true, sent };
}
