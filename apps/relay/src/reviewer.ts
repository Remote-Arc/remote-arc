import {
  createSession,
  nowIso,
  randomToken,
  sessionCookie,
  sha256Hex,
  safeReturnTo as allowlistedReturnTo,
} from "./auth.js";
import { REVIEWER_DEMO_TOOLS, resetReviewerDemoState } from "./reviewer-fixture.js";
import { emailLoginEnabled } from "./email-auth.js";
import { renderLoginPage } from "./login-page.js";
import { emailFormToken } from "./email-form-csrf.js";
import { reviewerAccounts } from "./reviewer-identity.js";

type ReviewerEnv = {
  DB: D1Database;
  PUBLIC_ORIGIN: string;
  APP_ORIGIN?: string;
  MARKETING_ORIGIN?: string;
  REVIEWER_EMAIL?: string;
  REVIEWER_PASSWORD_SHA256?: string;
  REVIEWER_DEMO_DEVICE_ID?: string;
  ANTHROPIC_REVIEWER_EMAIL?: string;
  ANTHROPIC_REVIEWER_PASSWORD_SHA256?: string;
  ANTHROPIC_REVIEWER_DEMO_DEVICE_ID?: string;
  RESEND_API_KEY?: string;
  EMAIL_AUTH_SECRET?: string;
};

const appOrigin = (env: ReviewerEnv) => env.APP_ORIGIN || env.PUBLIC_ORIGIN;

function safeReturnTo(value: string | null, request: Request, env: ReviewerEnv) {
  return allowlistedReturnTo(value || "/overview", request, env);
}

export function handleLoginPage(request: Request, env: ReviewerEnv) {
  const url = new URL(request.url);
  const returnTo = safeReturnTo(url.searchParams.get("return_to"), request, env);
  const googleHref = "/auth/google?return_to=" + encodeURIComponent(returnTo);
  const reviewerEnabled = Boolean(
    (env.REVIEWER_EMAIL && env.REVIEWER_PASSWORD_SHA256) ||
    (env.ANTHROPIC_REVIEWER_EMAIL && env.ANTHROPIC_REVIEWER_PASSWORD_SHA256),
  );
  const emailEnabled = emailLoginEnabled(env);
  const { token: emailCsrf, setCookie: emailCsrfCookie } = emailFormToken(request);

  const page = renderLoginPage({ returnTo, googleHref, reviewerEnabled, emailEnabled, emailCsrf });
  if (emailCsrfCookie) page.headers.append("set-cookie", emailCsrfCookie);
  return page;
}

export async function handleReviewerLogin(request: Request, env: ReviewerEnv) {
  const reviewers = reviewerAccounts(env);
  if (!reviewers.some((entry) => entry.email && entry.passwordHash)) {
    return new Response("Reviewer access is not configured", { status: 404 });
  }

  const form = await request.formData();
  const email = String(form.get("email") || "").trim().toLowerCase();
  const password = String(form.get("password") || "");
  const returnTo = safeReturnTo(String(form.get("return_to") || "/overview"), request, env);

  const reviewer = reviewers.find(
    (entry) => entry.email && entry.passwordHash && entry.email.trim().toLowerCase() === email,
  );
  if (!reviewer || (await sha256Hex(password)) !== reviewer.passwordHash) {
    return new Response("Invalid reviewer credentials", { status: 401 });
  }
  // Reviewer identities and fixture IDs must remain separate across providers.
  if (reviewers.some((entry) => entry !== reviewer && (
    entry.email?.trim().toLowerCase() === email ||
    (reviewer.deviceId && entry.deviceId === reviewer.deviceId)
  ))) {
    return new Response("Reviewer account configuration conflict", { status: 503 });
  }

  let user = await env.DB.prepare(
    "SELECT id FROM users WHERE lower(email) = ?1 LIMIT 1",
  ).bind(email).first<{ id: string }>();

  if (user && user.id !== reviewer.userId) {
    return new Response("Reviewer account is not isolated", { status: 503 });
  }
  const reservedUser = await env.DB.prepare("SELECT email FROM users WHERE id = ?1")
    .bind(reviewer.userId).first<{ email: string }>();
  if (reservedUser && reservedUser.email.trim().toLowerCase() !== email) {
    return new Response("Reviewer account configuration conflict", { status: 503 });
  }
  if (reviewer.deviceId) {
    const device = await env.DB.prepare("SELECT user_id FROM devices WHERE id = ?1")
      .bind(reviewer.deviceId).first<{ user_id: string }>();
    if (device && device.user_id !== reviewer.userId) {
      return new Response("Reviewer device is not isolated", { status: 503 });
    }
  }
  if (!user) {
    const userId = reviewer.userId;
    await env.DB.prepare(
      `INSERT INTO users (id, google_sub, email, name, avatar_url, created_at, plan)
       VALUES (?1, ?2, ?3, ?4, NULL, ?5, 'plus') ON CONFLICT DO NOTHING`,
    ).bind(userId, reviewer.userId, email, reviewer.displayName, nowIso()).run();
    user = await env.DB.prepare("SELECT id FROM users WHERE lower(email) = ?1 LIMIT 1")
      .bind(email).first<{ id: string }>();
    if (user?.id !== userId) return new Response("Reviewer account is not isolated", { status: 503 });
  } else {
    await env.DB.prepare("UPDATE users SET plan = 'plus' WHERE id = ?1")
      .bind(user.id)
      .run();
  }

  if (reviewer.deviceId) {
    const now = nowIso();
    // Fixtures never connect as Agents; do not derive a usable credential from a public device ID.
    const credentialHash = await sha256Hex(randomToken());
    const saved = await env.DB.prepare(
      `INSERT INTO devices (
         id, user_id, name, platform, arch, hostname,
         credential_hash, created_at, last_seen, revoked_at, allowed_tools
       ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, NULL, ?10)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         platform = excluded.platform,
         arch = excluded.arch,
         hostname = excluded.hostname,
         credential_hash = excluded.credential_hash,
         last_seen = excluded.last_seen,
         revoked_at = NULL,
         allowed_tools = excluded.allowed_tools
       WHERE devices.user_id = excluded.user_id`,
    )
      .bind(
        reviewer.deviceId,
        user.id,
        "Review Desktop",
        "win32",
        "x64",
        "review-desktop",
        credentialHash,
        now,
        now,
        JSON.stringify(REVIEWER_DEMO_TOOLS),
      )
      .run();

    if (!saved.meta.changes) return new Response("Reviewer device is not isolated", { status: 503 });

    await resetReviewerDemoState(env, user.id);
  }

  const token = await createSession(user.id, env);
  return new Response(null, {
    status: 302,
    headers: {
      location: new URL(returnTo, appOrigin(env)).toString(),
      "set-cookie": sessionCookie(token),
      "cache-control": "no-store",
    },
  });
}
