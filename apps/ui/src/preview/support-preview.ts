import type {
  SupportDetail,
  SupportThread,
  SupportMessage,
  SupportStatus,
  BetaStatus,
} from "../features/admin/support-inbox-model.js";

// Synthetic, browser-local records only. Never contacts a mail provider or Google.
export function createSupportPreview(storage: Pick<Storage, "getItem" | "setItem">) {
  const ago = (minutes: number) => new Date(Date.now() - minutes * 60000).toISOString(),
    support = "support@remotearc.app";
  const thread = (
    id: string,
    email: string,
    subject: string,
    status: SupportStatus,
    minutes: number,
    source: SupportThread["source"] = "email",
    beta: BetaStatus | null = null,
  ): SupportThread => ({
    id,
    sender_email: email,
    subject,
    status,
    last_message_at: ago(minutes),
    source,
    beta_status: beta,
    last_direction: "inbound",
    last_delivery_status: "received",
  });
  const mail = (
    id: string,
    email: string,
    body: string,
    minutes: number,
    direction: SupportMessage["direction"] = "inbound",
    deliveryStatus = "received",
    source: SupportMessage["source"] = "email",
  ): SupportMessage => ({
    id,
    direction,
    source,
    from: direction === "outbound" ? support : email,
    to: direction === "outbound" ? email : support,
    subject: "Support request",
    body,
    deliveryStatus,
    createdAt: ago(minutes),
  });
  const initial: SupportDetail[] = [
    {
      thread: thread(
        "preview-support-beta",
        "maya@example.invalid",
        "Google Apps Beta application",
        "open",
        15,
        "google-beta",
        "pending",
      ),
      beta: {
        googleEmail: "maya.google@example.invalid",
        providers: ["gmail", "google_calendar", "google_drive"],
        status: "pending",
        reviewedAt: null,
      },
      messages: [
        mail(
          "preview-application",
          "maya@example.invalid",
          "Submitted from an authenticated Remote Arc account (web form).\nRemote Arc account: maya@example.invalid\nGoogle account to add as a tester: maya.google@example.invalid\nRequested Apps: Gmail, Google Calendar, Google Drive\nPurpose: Plan my week and prepare replies.",
          15,
          "inbound",
          "received",
          "application",
        ),
      ],
    },
    {
      thread: thread(
        "preview-support-customer",
        "alex@example.invalid",
        "My Mac shows online, but a command times out",
        "open",
        32,
      ),
      messages: [
        mail(
          "preview-customer-message",
          "alex@example.invalid",
          "Hi, my Mac shows online, but commands time out after I close the lid. What should I check?",
          32,
        ),
      ],
    },
    {
      thread: {
        ...thread(
          "preview-support-waiting",
          "taylor@example.invalid",
          "Thanks for helping me connect my computer",
          "waiting",
          80,
        ),
        last_direction: "outbound",
        last_delivery_status: "sent",
      },
      messages: [
        mail(
          "preview-waiting-in",
          "taylor@example.invalid",
          "I paired my computer. How do I connect it to my AI client?",
          120,
        ),
        mail(
          "preview-waiting-out",
          "taylor@example.invalid",
          "Hi Taylor, your computer is paired. Follow the installation guide for your AI client, then try listing your computers. Reply if you get stuck.",
          80,
          "outbound",
          "sent",
          "reply",
        ),
      ],
    },
    {
      thread: {
        ...thread(
          "preview-support-unknown",
          "riley@example.invalid",
          "Check my connection",
          "open",
          140,
        ),
        last_direction: "outbound",
        last_delivery_status: "unknown",
      },
      messages: [
        mail(
          "preview-unknown-in",
          "riley@example.invalid",
          "Can you help me check my connection?",
          180,
        ),
        mail(
          "preview-unknown-out",
          "riley@example.invalid",
          "Hi Riley, please tell us which step you reached.",
          140,
          "outbound",
          "unknown",
          "reply",
        ),
      ],
    },
  ];
  const key = "remotearc-support-preview-v1";
  const entries: SupportDetail[] = JSON.parse(storage.getItem(key) || "null") || initial;
  const persist = () => storage.setItem(key, JSON.stringify(entries)),
    json = (value: unknown, status = 200) => Response.json(value, { status });
  return {
    handle(url: URL, method: string, body?: BodyInit | null) {
      const path = url.pathname.slice("/api/admin/support-inbox".length),
        value = typeof body === "string" ? JSON.parse(body) : {};
      if (!path && method === "GET") {
        const source = url.searchParams.get("source") || "all",
          status = url.searchParams.get("status") || "all";
        if (
          !["all", "email", "google-beta"].includes(source) ||
          !["all", "open", "waiting", "resolved"].includes(status)
        )
          return json({ error: "INVALID_FILTER" }, 400);
        return json({
          items: entries
            .map((item) => item.thread)
            .filter(
              (item) =>
                (source === "all" || source === item.source) &&
                (status === "all" || status === item.status),
            ),
        });
      }
      const [id, action] = path.slice(1).split("/"),
        detail = entries.find((item) => item.thread.id === id);
      if (!detail) return json({ error: "NOT_FOUND" }, 404);
      if (method === "GET" && !action) return json(detail);
      if (action === "google-beta" && method === "PATCH") {
        if (!detail.beta || detail.beta.status !== "pending")
          return json({ error: "beta_request_not_pending" }, 409);
        if (value.decision === "approve" && value.googleTestUserAdded !== true)
          return json({ error: "google_test_user_confirmation_required" }, 400);
        if (!["approve", "decline"].includes(value.decision))
          return json({ error: "INVALID_REQUEST" }, 400);
        const status = value.decision === "approve" ? "approved" : "declined";
        detail.beta.status = status;
        detail.beta.reviewedAt = new Date().toISOString();
        detail.thread.beta_status = status;
        persist();
        return json({ status });
      }
      if (
        action === "status" &&
        method === "PATCH" &&
        ["open", "waiting", "resolved"].includes(value.status)
      ) {
        detail.thread.status = value.status;
        persist();
        return json({ status: value.status });
      }
      if (action === "reply" && method === "POST") {
        const existing = detail.messages.find((item) => item.id === value.requestId);
        if (existing) return json({ status: existing.deliveryStatus, duplicate: true });
        if (detail.messages.some((item) => item.deliveryStatus === "unknown"))
          return json({ error: "previous_delivery_unconfirmed" }, 409);
        const message = mail(
          value.requestId,
          detail.thread.sender_email,
          value.message,
          0,
          "outbound",
          "sent",
          "reply",
        );
        detail.messages.push(message);
        Object.assign(detail.thread, {
          status: "waiting",
          last_message_at: message.createdAt,
          last_direction: "outbound",
          last_delivery_status: "sent",
        });
        persist();
        return json({ status: "sent" });
      }
      if (action === "reconcile" && method === "PATCH") {
        const message = detail.messages.find(
          (item) => item.id === value.messageId && item.deliveryStatus === "unknown",
        );
        if (
          !message ||
          !["sent", "failed"].includes(value.outcome) ||
          String(value.evidence || "").trim().length < 10
        )
          return json({ error: "INVALID_REQUEST" }, 400);
        message.deliveryStatus = value.outcome;
        detail.thread.last_delivery_status = value.outcome;
        persist();
        return json({ status: value.outcome });
      }
      return json({ error: "NOT_FOUND" }, 404);
    },
  };
}
