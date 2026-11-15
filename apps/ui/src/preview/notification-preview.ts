import type {
  NotificationChannel,
  NotificationEvent,
} from "../hooks/settings/use-notification-settings.js";

// Notification settings for the preview Dashboard. Nothing is delivered.
export function createNotificationPreview() {
  const events: NotificationEvent[] = [
    "decision_needed",
    "repair_succeeded",
    "run_failed",
    "notify",
  ];
  const channels: NotificationChannel[] = [
    {
      kind: "slack",
      enabled: false,
      events: ["decision_needed", "repair_succeeded", "notify"],
      last_delivery_at: null,
      last_error: null,
      unavailable: "SLACK_NOT_LINKED",
    },
    {
      kind: "webhook",
      enabled: false,
      events: [...events],
      url: null,
      has_secret: false,
      last_delivery_at: null,
      last_error: null,
      unavailable: null,
    },
  ];
  const reply = (value: unknown, status = 200) =>
    new Response(JSON.stringify(value), {
      status,
      headers: { "content-type": "application/json" },
    });
  return {
    handle(url: URL, method: string, body: unknown): Response | null {
      if (url.pathname === "/api/notifications" && method === "GET")
        return reply({ events, channels });
      const match = url.pathname.match(/^\/api\/notifications\/(slack|webhook)(\/test)?$/);
      if (!match) return null;
      const channel = channels.find((item) => item.kind === match[1])!;
      if (match[2] && method === "POST")
        return reply({ queued: false, sent: true, error: null }, 202);
      if (method !== "PUT") return reply({ error: "METHOD_NOT_ALLOWED" }, 405);
      const change = JSON.parse(String(body || "{}")) as {
        enabled?: boolean;
        events?: NotificationEvent[];
        url?: string;
      };
      if (change.enabled && channel.unavailable)
        return reply({ error: channel.unavailable, message: "Unavailable" }, 409);
      let secret: string | undefined;
      if (channel.kind === "webhook" && change.url !== undefined) {
        if (!/^https:\/\/[^/]+\.[^/]+/.test(change.url))
          return reply(
            {
              error: "NOTIFICATION_SETTINGS_INVALID",
              message: "Callback must use a public HTTPS hostname.",
            },
            400,
          );
        if (change.url !== channel.url)
          secret = "whsec_cHJldmlldy1zaWduaW5nLXNlY3JldC0wMDAwMDAwMDA=";
        channel.url = change.url;
        channel.has_secret = true;
      }
      if (change.enabled !== undefined) channel.enabled = change.enabled;
      if (change.events) channel.events = change.events;
      return reply({ events, channels, ...(secret ? { webhook_secret: secret } : {}) });
    },
  };
}
