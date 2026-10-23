import {
  createSession,
  nowIso,
  sessionCookie,
  sha256Hex,
  safeReturnTo as allowlistedReturnTo,
} from "./auth.js";
import { REVIEWER_DEMO_TOOLS, resetReviewerDemoState } from "./reviewer-fixture.js";
import { emailLoginEnabled } from "./email-auth.js";
import { renderLoginPage } from "./login-page.js";
import { emailFormToken } from "./email-form-csrf.js";

type ReviewerEnv = {
  DB: D1Database;
  PUBLIC_ORIGIN: string;
  APP_ORIGIN?: string;
  MARKETING_ORIGIN?: string;
  REVIEWER_EMAIL?: string;
  REVIEWER_PASSWORD_SHA256?: string;
  REVIEWER_DEMO_DEVICE_ID?: string;
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
  const reviewerEnabled = Boolean(env.REVIEWER_EMAIL && env.REVIEWER_PASSWORD_SHA256);
  const emailEnabled = emailLoginEnabled(env);
  const { token: emailCsrf, setCookie: emailCsrfCookie } = emailFormToken(request);

  const page = renderLoginPage({ returnTo, googleHref, reviewerEnabled, emailEnabled, emailCsrf });
  if (emailCsrfCookie) page.headers.append("set-cookie", emailCsrfCookie);
  return page;
}

export async function handleReviewerLogin(request: Request, env: ReviewerEnv) {
  if (!env.REVIEWER_EMAIL || !env.REVIEWER_PASSWORD_SHA256) {
    return new Response("Reviewer access is not configured", { status: 404 });
  }

  const form = await request.formData();
  const email = String(form.get("email") || "").trim().toLowerCase();
  const password = String(form.get("password") || "");
  const returnTo = safeReturnTo(String(form.get("return_to") || "/overview"), request, env);

  if (
    email !== env.REVIEWER_EMAIL.trim().toLowerCase() ||
    (await sha256Hex(password)) !== env.REVIEWER_PASSWORD_SHA256
  ) {
    return new Response("Invalid reviewer credentials", { status: 401 });
  }

  let user = await env.DB.prepare(
    "SELECT id FROM users WHERE email = ?1 LIMIT 1",
  ).bind(email).first<{ id: string }>();

  if (!user) {
    const userId = "reviewer-openai-v1";
    await env.DB.prepare(
      `INSERT INTO users (id, google_sub, email, name, avatar_url, created_at, plan)
       VALUES (?1, ?2, ?3, ?4, NULL, ?5, 'plus')`,
    ).bind(userId, "reviewer-openai-v1", email, "OpenAI Reviewer", nowIso()).run();
    user = { id: userId };
  } else {
    await env.DB.prepare("UPDATE users SET plan = 'plus' WHERE id = ?1")
      .bind(user.id)
      .run();
  }

  if (env.REVIEWER_DEMO_DEVICE_ID) {
    const now = nowIso();
    const credentialHash = await sha256Hex(
      `reviewer-fixture:${env.REVIEWER_DEMO_DEVICE_ID}`,
    );
    await env.DB.prepare(
      `INSERT INTO devices (
         id, user_id, name, platform, arch, hostname,
         credential_hash, created_at, last_seen, revoked_at, allowed_tools
       ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, NULL, ?10)
       ON CONFLICT(id) DO UPDATE SET
         user_id = excluded.user_id,
         name = excluded.name,
         platform = excluded.platform,
         arch = excluded.arch,
         hostname = excluded.hostname,
         last_seen = excluded.last_seen,
         revoked_at = NULL,
         allowed_tools = excluded.allowed_tools`,
    )
      .bind(
        env.REVIEWER_DEMO_DEVICE_ID,
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