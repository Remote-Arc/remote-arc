import { getSessionUser } from "./auth.js";
import { isTrustedDashboardMutation } from "./dashboard-origin.js";
import { callDevice } from "./device-call.js";
import {
  slackApi,
  slackInstallation,
  type SlackBotEnv,
} from "./slack-bot-common.js";

export type RunnerEnv = SlackBotEnv;
export type RunnerAttentionEvent = {
  type: "runner_attention";
  event_id: string;
  session_id: string;
  task_id: string;
  kind: "captcha" | "sign_in" | "otp" | "scope" | "reminder" | "resolved";
  origin: string;
};
const idPattern = /^[A-Za-z0-9_-]{1,100}$/;
const json = (value: unknown, status = 200) =>
  Response.json(value, { status, headers: { "cache-control": "no-store" } });
export function parseRunnerAttention(
  value: unknown,
): RunnerAttentionEvent | null {
  const input = value as Partial<RunnerAttentionEvent> | null;
  if (
    !input ||
    input.type !== "runner_attention" ||
    !idPattern.test(input.session_id || "") ||
    !/^[a-f0-9]{32}$/.test(input.event_id || "") ||
    !["captcha", "sign_in", "otp", "scope", "reminder", "resolved"].includes(
      input.kind || "",
    )
  )
    return null;
  try {
    const url = new URL(input.origin || "");
    if (
      !["https:", "http:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.origin.length > 300
    )
      return null;
    // Only a validated origin crosses the notification boundary. Discard title,
    // page content, URLs with paths/queries, and all unexpected device fields.
    return {
      type: "runner_attention",
      event_id: input.event_id!,
      session_id: input.session_id!,
      task_id: input.session_id!,
      kind: input.kind!,
      origin: url.origin,
    };
  } catch {
    return null;
  }
}
export const runnerViewPath = (device: string, session: string) =>
  "/dashboard/browser/" +
  encodeURIComponent(device) +
  "/" +
  encodeURIComponent(session);
const actionName = (kind: string) =>
  kind === "captcha"
    ? "complete a verification"
    : kind === "otp"
      ? "enter a verification code"
      : kind === "scope"
        ? "review a site permission"
        : "sign in";

export async function recordRunnerAttention(
  env: RunnerEnv,
  userId: string,
  deviceId: string,
  input: unknown,
  fetcher: typeof fetch = fetch,
) {
  const event = parseRunnerAttention(input);
  if (!event) return;
  if (
    !(await env.DB.prepare(
      "SELECT id FROM devices WHERE id=?1 AND user_id=?2 AND revoked_at IS NULL",
    )
      .bind(deviceId, userId)
      .first())
  )
    return;
  const previous = await env.DB.prepare(
    "SELECT resolved_at FROM runner_attention WHERE user_id=?1 AND device_id=?2 AND session_id=?3 AND event_id=?4",
  )
    .bind(userId, deviceId, event.session_id, event.event_id)
    .first<{ resolved_at: string | null }>();
  if (previous?.resolved_at) return;
  const now = new Date().toISOString();
  if (event.kind === "resolved") {
    // A tombstone also covers a resolved event received before its initial
    // notification after reconnect, so late events cannot reopen a completed stop.
    await env.DB.prepare(
      `INSERT INTO runner_attention(id,user_id,device_id,session_id,event_id,kind,origin,created_at,resolved_at)
      VALUES(?1,?2,?3,?4,?5,'resolved',?6,?7,?7)
      ON CONFLICT(user_id,device_id,session_id,event_id) DO UPDATE SET resolved_at=COALESCE(runner_attention.resolved_at,excluded.resolved_at)`,
    )
      .bind(
        crypto.randomUUID(),
        userId,
        deviceId,
        event.session_id,
        event.event_id,
        event.origin,
        now,
      )
      .run();
    return;
  }
  if (event.kind === "reminder") {
    await env.DB.prepare(
      "UPDATE runner_attention SET reminded_at=COALESCE(reminded_at,?1) WHERE user_id=?2 AND device_id=?3 AND session_id=?4 AND event_id=?5 AND resolved_at IS NULL",
    )
      .bind(now, userId, deviceId, event.session_id, event.event_id)
      .run();
  } else {
    await env.DB.prepare(
      "UPDATE runner_attention SET resolved_at=COALESCE(resolved_at,?1) WHERE user_id=?2 AND device_id=?3 AND session_id=?4 AND event_id<>?5 AND resolved_at IS NULL",
    )
      .bind(now, userId, deviceId, event.session_id, event.event_id)
      .run();
    await env.DB.prepare(
      `INSERT OR IGNORE INTO runner_attention(id,user_id,device_id,session_id,event_id,kind,origin,run_id,created_at)
      VALUES(?1,?2,?3,?4,?5,?6,?7,(SELECT run_id FROM runner_session_links WHERE user_id=?2 AND device_id=?3 AND session_id=?4),?8)`,
    )
      .bind(
        crypto.randomUUID(),
        userId,
        deviceId,
        event.session_id,
        event.event_id,
        event.kind,
        event.origin,
        now,
      )
      .run();
  }
  const row = await env.DB.prepare(
    "SELECT id,kind,run_id,resolved_at FROM runner_attention WHERE user_id=?1 AND device_id=?2 AND session_id=?3 AND event_id=?4",
  )
    .bind(userId, deviceId, event.session_id, event.event_id)
    .first<{
      id: string;
      kind: string;
      run_id: string | null;
      resolved_at: string | null;
    }>();
  if (!row?.run_id || row.resolved_at) return;
  const job = await env.DB.prepare(
    `SELECT e.team_id,e.channel_id,e.reply_channel,e.thread_ts,e.source_ts,e.slack_user_id,e.event_type FROM slack_arc_events e
    JOIN slack_arc_links l ON l.team_id=e.team_id AND l.slack_user_id=e.slack_user_id AND l.user_id=e.user_id AND l.status='active'
    WHERE e.run_id=?1 AND e.user_id=?2 ORDER BY e.created_at DESC LIMIT 1`,
  )
    .bind(row.run_id, userId)
    .first<{
      team_id: string;
      channel_id: string | null;
      reply_channel: string | null;
      thread_ts: string | null;
      source_ts: string | null;
      slack_user_id: string;
      event_type: string;
    }>();
  if (!job) return;
  const installation = await slackInstallation(env, job.team_id);
  if (!installation) return;
  // Public mentions must never copy private device activity into the channel.
  const channel =
    job.event_type === "message"
      ? job.reply_channel || job.channel_id
      : job.reply_channel;
  if (!channel) return;
  const field =
    event.kind === "reminder" ? "slack_reminded_at" : "slack_notified_at";
  // Claim before posting; an uncertain Slack acknowledgement is never retried.
  const claimed = await env.DB.prepare(
    `UPDATE runner_attention SET ${field}=?1 WHERE id=?2 AND ${field} IS NULL AND resolved_at IS NULL RETURNING id`,
  )
    .bind(now, row.id)
    .first();
  if (!claimed) return;
  const url =
    (env.DASHBOARD_ORIGIN || "https://agent.remotearc.app") +
    runnerViewPath(deviceId, event.session_id);
  const host = new URL(event.origin).host.replace(/[<>&]/g, "");
  const text = `${event.kind === "reminder" ? "Reminder: " : ""}${host} needs you to ${actionName(row.kind)}. Your browser task is waiting. <${url}|Open live view> · Use “I'm done” there after you finish. This does not authorize a submit.`;
  try {
    await slackApi(
      env,
      installation,
      "chat.postMessage",
      {
        channel,
        ...(job.event_type === "message" && (job.thread_ts || job.source_ts)
          ? { thread_ts: job.thread_ts || job.source_ts }
          : {}),
        text,
        unfurl_links: false,
        unfurl_media: false,
      },
      fetcher,
    );
  } catch {
    /* Keep the claim: an unknown delivery must not post twice. The Dashboard remains available. */
  }
}

export async function handleRunnerRequest(request: Request, env: RunnerEnv) {
  const user = await getSessionUser(request, env);
  if (!user) return json({ error: "unauthorized" }, 401);
  const url = new URL(request.url);
  if (request.method === "POST" && !isTrustedDashboardMutation(request, env))
    return json({ error: "same_origin_required" }, 403);
  if (url.pathname === "/api/runner/attention" && request.method === "GET") {
    const arcSession = url.searchParams.get("arc_session_id");
    const rows = await env.DB.prepare(
      `SELECT a.id,a.device_id,a.session_id,a.kind,a.origin,a.run_id,a.created_at,a.reminded_at,d.name AS device_name
      FROM runner_attention a JOIN devices d ON d.id=a.device_id AND d.user_id=a.user_id AND d.revoked_at IS NULL
      LEFT JOIN arc_chat_runs r ON r.id=a.run_id AND r.user_id=a.user_id
      WHERE a.user_id=?1 AND a.resolved_at IS NULL AND (?2 IS NULL OR r.session_id=?2) ORDER BY a.created_at DESC LIMIT 20`,
    )
      .bind(user.id, arcSession)
      .all();
    return json({ attention: rows.results });
  }
  // Device cards can list active task browsers without a CAPTCHA/sign-in alert.
  // Expose only owner-scoped, bounded metadata; never full URLs, profiles or logins.
  const sessionsRoute = url.pathname.match(/^\/api\/runner\/sessions\/([A-Za-z0-9_-]+)$/);
  if (sessionsRoute && request.method === "GET") {
    const deviceId = sessionsRoute[1]!;
    const owned = await env.DB.prepare(
      "SELECT allowed_tools FROM devices WHERE id=?1 AND user_id=?2 AND revoked_at IS NULL",
    ).bind(deviceId, user.id).first<{ allowed_tools: string | null }>();
    if (!owned) return json({ error: "forbidden" }, 403);
    let allowed: unknown;
    try { allowed = JSON.parse(owned.allowed_tools || "[]"); } catch { allowed = []; }
    if (!Array.isArray(allowed) || !allowed.includes("browser_runner_status") || !allowed.includes("browser_runner_snapshot"))
      return json({ error: "runner_disabled" }, 403);
    try {
      const result = unwrapRunnerResult(await callDevice(
        env,
        { userId: user.id, clientId: "dashboard", grantId: null, scope: "browser:read", resource: env.PUBLIC_ORIGIN },
        deviceId, "browser_runner_status", {},
      ));
      const sessions = (Array.isArray(result.sessions) ? result.sessions : [])
        .filter((item: any) => item && item.browser_running === true && idPattern.test(item.session_id || ""))
        .slice(0, 20)
        .map((item: any) => {
          let hostname = "";
          try {
            const parsed = new URL(item.last_url || "");
            if (parsed.protocol === "https:" || parsed.protocol === "http:") hostname = parsed.hostname.slice(0, 120);
          } catch { /* Never disclose malformed or untrusted page URLs. */ }
          return {
            session_id: item.session_id,
            state: ["active", "needs_user", "paused"].includes(item.state) ? item.state : "active",
            hostname,
          };
        });
      return json({ sessions });
    } catch {
      return json({ error: "device_unavailable" }, 503);
    }
  }
  const resolve = url.pathname.match(
    /^\/api\/runner\/attention\/([A-Za-z0-9-]+)\/resolve$/,
  );
  if (resolve && request.method === "POST") {
    const row = await env.DB.prepare(
      "SELECT device_id,session_id FROM runner_attention WHERE id=?1 AND user_id=?2 AND resolved_at IS NULL",
    )
      .bind(resolve[1], user.id)
      .first<{ device_id: string; session_id: string }>();
    if (!row) return json({ error: "not_found" }, 404);
    // A fresh scan, not a submit, is the only device operation this button can cause.
    try {
      const result = await callDevice(
        env,
        {
          userId: user.id,
          clientId: "dashboard",
          grantId: null,
          scope: "browser:read",
          resource: env.PUBLIC_ORIGIN,
        },
        row.device_id,
        "browser_runner_wait",
        { session_id: row.session_id, until: "user_done", timeout_ms: 1000 },
      );
      const value = unwrapRunnerResult(result);
      if (value.state === "met")
        await env.DB.prepare(
          "UPDATE runner_attention SET resolved_at=COALESCE(resolved_at,?1) WHERE id=?2 AND user_id=?3",
        )
          .bind(new Date().toISOString(), resolve[1], user.id)
          .run();
      return json({
        resolved: value.state === "met",
        state: value.state,
        reason: value.reason,
      });
    } catch {
      return json(
        {
          error: "device_unavailable",
          message:
            "The task could not be checked. Reconnect the device and try again.",
        },
        503,
      );
    }
  }
  const settings = url.pathname.match(
    /^\/api\/runner\/settings\/([A-Za-z0-9_-]+)$/,
  );
  const session = url.pathname.match(
    /^\/api\/runner\/(view|session)\/([A-Za-z0-9_-]+)\/([A-Za-z0-9_-]{1,100})$/,
  );
  const device = settings?.[1] || session?.[2];
  if (!device) return json({ error: "not_found" }, 404);
  const owned = await env.DB.prepare(
    "SELECT id,runner_attention_mode,allowed_tools FROM devices WHERE id=?1 AND user_id=?2 AND revoked_at IS NULL",
  )
    .bind(device, user.id)
    .first<{
      id: string;
      runner_attention_mode: string;
      allowed_tools: string | null;
    }>();
  if (!owned) return json({ error: "forbidden" }, 403);
  if (settings) {
    if (request.method === "GET")
      return json({ runner_attention_mode: owned.runner_attention_mode });
    if (request.method !== "POST")
      return json({ error: "method_not_allowed" }, 405);
    const input = (await request.json().catch(() => null)) as any;
    if (
      !["notify_only", "show_and_notify"].includes(input?.runner_attention_mode)
    )
      return json({ error: "invalid_mode" }, 400);
    await env.DB.prepare(
      "UPDATE devices SET runner_attention_mode=?1 WHERE id=?2 AND user_id=?3",
    )
      .bind(input.runner_attention_mode, device, user.id)
      .run();
    return json({ runner_attention_mode: input.runner_attention_mode });
  }
  if (request.method !== "GET")
    return json({ error: "method_not_allowed" }, 405);
  if (session![1] === "view") {
    let tools: unknown;
    try {
      tools = JSON.parse(owned.allowed_tools || "[]");
    } catch {
      tools = [];
    }
    if (!Array.isArray(tools) || !tools.includes("browser_runner_snapshot"))
      return json({ error: "runner_disabled" }, 403);
    if (!isTrustedDashboardMutation(request, env))
      return json({ error: "same_origin_required" }, 403);
    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket")
      return json({ error: "websocket_required" }, 426);
    return env.REGISTRY.getByName("user:" + user.id).fetch(
      new Request("https://registry/runner-view", {
        headers: {
          Upgrade: "websocket",
          "x-remote-link-user-id": user.id,
          "x-remote-link-device-id": device,
          "x-runner-session-id": session![3]!,
        },
      }),
    );
  }
  try {
    return json(
      unwrapRunnerResult(
        await callDevice(
          env,
          {
            userId: user.id,
            clientId: "dashboard",
            grantId: null,
            scope: "browser:read",
            resource: env.PUBLIC_ORIGIN,
          },
          device,
          "browser_runner_status",
          { session_id: session![3] },
        ),
      ),
    );
  } catch {
    return json({ error: "device_unavailable" }, 503);
  }
}
function unwrapRunnerResult(value: unknown): Record<string, any> {
  const result = value as any;
  if (result?.content?.[0]?.type === "text") {
    try {
      return JSON.parse(result.content[0].text);
    } catch {
      return {};
    }
  }
  return result && typeof result === "object" ? result : {};
}
