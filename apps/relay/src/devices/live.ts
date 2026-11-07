import { applicationJson } from "../platform/application-json.js";
import { getSessionUser } from "../auth/auth.js";
import { isTrustedDashboardMutation, type DashboardOriginEnv } from "../auth/dashboard-origin.js";

/** What changed for a signed-in person. The Dashboard reloads that list itself. */
export type LiveTopic = "approvals" | "attention";
export const LIVE_TOPICS: readonly LiveTopic[] = ["approvals", "attention"];

type LiveEnv = Parameters<typeof getSessionUser>[1] &
  DashboardOriginEnv & { REGISTRY: DurableObjectNamespace };

/**
 * Opens the Dashboard's change feed. The socket carries only topic names, never
 * approval, device or browser details, so it adds no data the person's own API
 * requests would not already return.
 */
export async function handleLiveConnect(request: Request, env: LiveEnv) {
  const user = await getSessionUser(request, env);
  if (!user) return applicationJson({ error: "unauthorized" }, { status: 401 });
  if (!isTrustedDashboardMutation(request, env))
    return applicationJson({ error: "same_origin_required" }, { status: 403 });
  if (request.headers.get("upgrade")?.toLowerCase() !== "websocket")
    return applicationJson({ error: "websocket_required" }, { status: 426 });
  return env.REGISTRY.getByName("user:" + user.id).fetch(
    new Request("https://registry/live", {
      headers: { Upgrade: "websocket", "x-remote-link-user-id": user.id },
    }),
  );
}

/** Best effort: an open Dashboard also refreshes on its own fallback schedule. */
export async function notifyDashboard(
  env: { REGISTRY?: DurableObjectNamespace },
  userId: string,
  topic: LiveTopic,
) {
  if (!env.REGISTRY) return;
  await env.REGISTRY.getByName("user:" + userId)
    .fetch(
      new Request("https://registry/live-notify", {
        method: "POST",
        headers: { "content-type": "application/json", "x-remote-link-user-id": userId },
        body: JSON.stringify({ topic }),
      }),
    )
    .catch(() => undefined);
}
