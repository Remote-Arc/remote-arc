import { applicationJson } from "../platform/application-json.js";
import { canonicalErrorCode } from "../../../../packages/protocol/src/error-codes.js";
import { observationActor } from "./observation-context.js";
import { getSessionUser } from "../auth/auth.js";
import { recordBusinessActivity } from "./business-tracking.js";
import {
  recordProductEvent,
  eventStatement,
  eventContext,
  eventIdentity,
  safeEventError,
  uuid,
  type EventEnv,
} from "./product-events.js";
type Env = EventEnv & {
  PUBLIC_ORIGIN: string;
  APP_ORIGIN?: string;
  DASHBOARD_ORIGIN?: string;
  MARKETING_ORIGIN?: string;
  ADMIN_ORIGIN?: string;
  PRODUCT_EVENTS_RATE_LIMITER?: { limit(input: { key: string }): Promise<{ success: boolean }> };
};
export const browserEvents: Record<
  string,
  { domain: string; outcome: "succeeded" | "accepted" | "failed" | "waiting" }
> = {
  "page.viewed": { domain: "navigation", outcome: "accepted" },
  "billing.offer.selected": { domain: "billing", outcome: "accepted" },
  "billing.checkout.viewed": { domain: "billing", outcome: "accepted" },
  "billing.checkout.continued": { domain: "billing", outcome: "accepted" },
  "billing.payment.mounted": { domain: "billing", outcome: "accepted" },
  "billing.payment.load_failed": { domain: "billing", outcome: "failed" },
  "billing.payment.completed_client": { domain: "billing", outcome: "accepted" },
  "billing.confirmation.waiting": { domain: "billing", outcome: "waiting" },
  "billing.confirmation.displayed": { domain: "billing", outcome: "accepted" },
  "billing.checkout.abandoned_client": { domain: "billing", outcome: "accepted" },
  "client.network.failed": { domain: "client", outcome: "failed" },
  "client.runtime.failed": { domain: "client", outcome: "failed" },
};
export const viewRoutes = [
  "/checkout",
  "/device",
  "/settings",
  "/overview",
  "/devices",
  "/apps",
  "/connect",
  "/security",
  "/automations",
  "/dashboard/agent/chat",
  "/dashboard/agent/tasks",
  "/dashboard/connect/overview",
  "/dashboard/connect/devices",
  "/dashboard/connect/apps",
  "/dashboard/agent/skills",
  "/dashboard/agent/routines",
];
export async function boundedEventJson(
  request: Pick<Request, "headers" | "body">,
  limit = 16384,
  allowSse = false,
) {
  if (Number(request.headers.get("content-length")) > limit) throw Error("body_too_large");
  const reader = request.body?.getReader();
  if (!reader) throw Error("empty_body");
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.length;
      if (size > limit) {
        void reader.cancel().catch(() => {});
        throw Error("body_too_large");
      }
      chunks.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  const text = new TextDecoder().decode(bytes);
  return JSON.parse(
    (allowSse && text.startsWith("event:")) || (allowSse && text.startsWith("data:"))
      ? text
          .split("\n")
          .find((line) => line.startsWith("data: "))
          ?.slice(6) || "null"
      : text,
  );
}
export async function ingestProductEvents(request: Request, env: Env) {
  const url = new URL(request.url),
    origin = env.DASHBOARD_ORIGIN || env.APP_ORIGIN || env.PUBLIC_ORIGIN;
  if (
    url.origin !== new URL(origin).origin &&
    url.origin !== new URL(env.ADMIN_ORIGIN || "https://admin.remotearc.app").origin
  )
    return applicationJson({ error: "not_found" }, { status: 404 });
  if (request.method !== "POST")
    return applicationJson({ error: "method_not_allowed" }, { status: 405 });
  if (
    request.headers.get("origin") !== url.origin ||
    request.headers.get("content-type")?.split(";")[0] !== "application/json"
  )
    return applicationJson({ error: "invalid_origin_or_type" }, { status: 403 });
  const user = await getSessionUser(request, env);
  if (
    url.origin === new URL(env.ADMIN_ORIGIN || "https://admin.remotearc.app").origin &&
    user &&
    !user.isAdmin
  )
    return applicationJson({ error: "forbidden" }, { status: 403 });
  if (!user) return applicationJson({ error: "unauthorized" }, { status: 401 });
  if (
    env.PRODUCT_EVENTS_RATE_LIMITER &&
    !(await env.PRODUCT_EVENTS_RATE_LIMITER.limit({ key: "product-events:" + user.id })).success
  )
    return applicationJson({ error: "rate_limited" }, { status: 429 });
  try {
    const input = await boundedEventJson(request);
    if (
      !input ||
      Object.keys(input).some((k) => !["journeyId", "events"].includes(k)) ||
      !uuid(input.journeyId) ||
      !Array.isArray(input.events) ||
      input.events.length < 1 ||
      input.events.length > 20
    )
      throw Error("invalid");
    const count = await env.DB.prepare(
      "SELECT COUNT(*) n FROM product_events WHERE user_id=?1 AND source='browser' AND occurred_at>=?2",
    )
      .bind(user.id, new Date(Date.now() - 60000).toISOString())
      .first<{ n: number }>();
    if ((count?.n || 0) + input.events.length > 120)
      return applicationJson({ error: "rate_limited" }, { status: 429 });
    const receivedAt = Date.now(),
      activityTimes: string[] = [];
    const events = input.events.map((e: any) => {
      if (
        !e ||
        Object.keys(e).some(
          (k) =>
            !["id", "name", "occurredAt", "entityId", "route", "errorCode", "traceId"].includes(k),
        ) ||
        !uuid(e.id) ||
        !Object.hasOwn(browserEvents, e.name) ||
        (e.traceId !== undefined && !uuid(e.traceId)) ||
        (e.entityId !== undefined && !eventIdentity(e.entityId)) ||
        (e.route !== undefined &&
          !viewRoutes.includes(e.route) &&
          !(
            e.name === "client.network.failed" &&
            [
              "/api/billing",
              "/api/apps",
              "/api/devices",
              "/api/arc",
              "/api/automations",
              "/api/admin",
              "/api/runner",
              "/api/browser-auth",
              "/api/device",
              "/api/pairing",
              "/api/slack",
              "/auth",
              "/oauth",
              "/api",
            ].includes(e.route)
          ))
      )
        throw Error("invalid");
      let at = new Date(receivedAt).toISOString();
      if (e.occurredAt !== undefined) {
        const time = Date.parse(e.occurredAt);
        if (
          typeof e.occurredAt !== "string" ||
          !Number.isFinite(time) ||
          time < receivedAt - 300000 ||
          time > receivedAt + 5000
        )
          throw Error("invalid_time");
        at = new Date(Math.min(receivedAt, time)).toISOString();
      }
      const spec = browserEvents[e.name]!;
      if (e.name === "page.viewed") activityTimes.push(at);
      return eventStatement(
        env,
        {
          ...spec,
          id: e.id,
          name: e.name,
          source: "browser",
          userId: user.id,
          journeyId: input.journeyId,
          traceId: e.traceId,
          entityId: e.entityId,
          route: e.route,
          errorCode:
            e.name === "client.network.failed"
              ? "NETWORK_ERROR"
              : e.errorCode
                ? "CLIENT_ERROR"
                : undefined,
        },
        at,
      );
    });
    await env.DB.batch(events);
    await Promise.all(
      [...new Map(activityTimes.map((at) => [at.slice(0, 10), at])).values()].map((at) =>
        recordBusinessActivity(env, user.id, at),
      ),
    );
    return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
  } catch {
    return applicationJson(
      { error: "events_unavailable_or_invalid" },
      { status: 400, headers: { "cache-control": "no-store" } },
    );
  }
}
const exact: Record<string, [string, string]> = {
  "/auth/email/request": ["auth", "auth.email.requested"],
  "/auth/email/verify": ["auth", "auth.email.verify_requested"],
  "/auth/google/callback": ["auth", "auth.google.callback"],
  "/auth/reviewer": ["auth", "auth.reviewer.login"],
  "/oauth/decision": ["oauth", "oauth.consent"],
  "/oauth/token": ["oauth", "oauth.token"],
  "/api/device/start": ["devices", "device.pairing.started"],
  "/api/device/token": ["devices", "device.token.requested"],
  "/api/pairing/approve": ["devices", "device.pairing.approved"],
  "/api/billing/checkout": ["billing", "billing.checkout.created"],
  "/api/billing/checkout/abandon": ["billing", "billing.checkout.abandoned"],
  "/api/billing/plan/change": ["billing", "billing.plan.changed"],
  "/api/billing/subscription/renewal": ["billing", "billing.renewal.changed"],
  "/api/billing/payment-method/setup": ["billing", "billing.payment_method.setup"],
  "/api/billing/payment-method/confirm": ["billing", "billing.payment_method.confirmed"],
  "/api/billing": ["billing", "billing.offers.loaded"],
  "/api/billing/webhook": ["billing", "billing.webhook.received"],
};
export function requestEventRoute(request: Request) {
  const path = new URL(request.url).pathname,
    method = request.method;
  if (
    exact[path] &&
    (method === "POST" || path === "/auth/google/callback" || path === "/api/billing")
  )
    return { domain: exact[path]![0], name: exact[path]![1], route: path };
  if (
    method !== "OPTIONS" &&
    !["/api/product-events", "/api/monitor", "/api/device/heartbeat"].includes(path) &&
    !path.startsWith("/api/admin/monitoring") &&
    path !== "/api/admin/metrics"
  ) {
    const families = [
      ["/api/billing", "billing"],
      ["/api/arc", "tasks"],
      ["/api/automations", "automations"],
      ["/api/apps", "apps"],
      ["/api/devices", "devices"],
      ["/api/device", "devices"],
      ["/api/pairing", "devices"],
      ["/api/runner", "devices"],
      ["/api/browser-auth", "devices"],
      ["/api/slack", "apps"],
      ["/api/admin", "admin"],
      ["/auth", "auth"],
      ["/oauth", "oauth"],
      ["/mcp", "mcp"],
      ["/api", "platform"],
    ] as const;
    for (const [prefix, domain] of families)
      if (path === prefix || path.startsWith(prefix + "/"))
        return {
          domain,
          name:
            ((
              {
                tasks: "task",
                automations: "automation",
                apps: "app",
                devices: "device",
              } as Record<string, string>
            )[domain] || domain) + ".request",
          route: prefix + "/:action",
          failuresOnly:
            method === "GET" ||
            method === "HEAD" ||
            !["tasks", "automations", "apps", "devices"].includes(domain),
        };
  }
  return null;
}
export async function observeProductRequest(
  request: Request,
  response: Response,
  env: Env,
  started: number,
  context = eventContext(request),
) {
  const spec = requestEventRoute(request);
  if (spec?.domain === "mcp" && request.method !== "POST" && response.status < 400) return;
  if (
    !spec ||
    ("failuresOnly" in spec && spec.failuresOnly && response.status < 400 && spec.domain !== "mcp")
  )
    return;
  try {
    // Clone synchronously, before the caller returns/consumes the response body.
    const copy =
      spec.domain === "mcp" ||
      (response.headers.get("content-type")?.includes("application/json") &&
        (response.status >= 400 ||
          !["GET", "HEAD"].includes(request.method) ||
          spec.name === "billing.checkout.created" ||
          spec.name === "billing.offers.loaded"))
        ? response.clone()
        : null;
    const user =
      new URL(request.url).pathname === "/api/billing/webhook"
        ? null
        : observationActor(request)
          ? { id: observationActor(request)! }
          : await getSessionUser(request, env);
    let result: any = null;
    if (copy) {
      try {
        result = await boundedEventJson(copy, 16384, spec.domain === "mcp");
      } catch {}
    }
    const resultFailure =
      spec.domain !== "mcp" &&
      response.status < 400 &&
      (result?.ok === false || ["failed", "unknown"].includes(result?.status));
    const protocolFailure =
      spec.domain === "mcp" && response.status < 400 && typeof result?.error?.code === "number";
    if (spec.domain === "mcp" && response.status < 400 && !protocolFailure) return;
    const error = protocolFailure
      ? "MCP_PROTOCOL_ERROR"
      : response.status >= 400 || resultFailure
        ? safeEventError(
            typeof result?.error === "object"
              ? result?.error?.code
              : result?.error || result?.errorCode || result?.code,
          )
        : undefined;
    if (
      (response.status >= 400 || resultFailure || protocolFailure) &&
      env.PRODUCT_EVENTS_RATE_LIMITER &&
      !(
        await env.PRODUCT_EVENTS_RATE_LIMITER.limit({
          key: "business-failure:" + (user?.id || "anonymous") + ":" + (error || "REQUEST_FAILED"),
        })
      ).success
    )
      return;
    let deviceId: string | null = null;
    const match = new URL(request.url).pathname.match(
      /^\/api\/devices\/([A-Za-z0-9_-]{1,180})(?:\/|$)/,
    );
    if (match && user) {
      const owned = await env.DB.prepare("SELECT id FROM devices WHERE id=?1 AND user_id=?2")
        .bind(match[1], user.id)
        .first<{ id: string }>();
      deviceId = owned?.id || null;
    }
    const entityId =
      spec.name === "billing.checkout.created" ? eventIdentity(result?.sessionId) : null;
    if (entityId && user)
      await env.DB.prepare(
        "UPDATE arc_billing_checkouts SET journey_id=COALESCE(journey_id,?1),trace_id=COALESCE(trace_id,?2) WHERE session_id=?3 AND user_id=?4",
      )
        .bind(context.journeyId, context.traceId, entityId, user.id)
        .run();
    const pairingWait =
      spec.name === "device.token.requested" &&
      [400, 428].includes(response.status) &&
      canonicalErrorCode(result?.error) === "AUTHORIZATION_PENDING";
    await recordProductEvent(env, {
      ...spec,
      ...context,
      source: "server",
      outcome: pairingWait
        ? "waiting"
        : response.status >= 400 || protocolFailure || resultFailure
          ? "failed"
          : spec.name.endsWith(".request") || spec.domain === "auth" || spec.domain === "oauth"
            ? "accepted"
            : "succeeded",
      userId: user?.id,
      entityId,
      deviceId,
      operation: request.method,
      errorCode: error,
      httpStatus: response.status,
      durationMs: Date.now() - started,
    });
    if (spec.name === "billing.offers.loaded" && response.ok && result?.enabled === false)
      await recordProductEvent(env, {
        domain: "billing",
        name: "billing.checkout.unavailable",
        source: "server",
        outcome: "failed",
        userId: user?.id,
        ...context,
        errorCode: "BILLING_NOT_CONFIGURED",
      });
  } catch {
    console.warn("product_request_observation_failed");
  }
}
