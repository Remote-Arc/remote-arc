import { useCallback, useEffect, useRef, useState } from "react";

export type NotificationChannelKind = "slack" | "webhook";
export type NotificationEvent = "decision_needed" | "repair_succeeded" | "run_failed" | "notify";

/** One channel as the Relay reports it in GET /api/notifications. */
export type NotificationChannel = {
  kind: NotificationChannelKind;
  enabled: boolean;
  events: NotificationEvent[];
  url?: string | null;
  has_secret?: boolean;
  last_delivery_at: string | null;
  last_error: string | null;
  /** Why the channel cannot be turned on yet, or null. */
  unavailable: string | null;
};
export type NotificationSettings = {
  events: NotificationEvent[];
  channels: NotificationChannel[];
};
type Change = { enabled?: boolean; events?: NotificationEvent[]; url?: string };

async function request(path: string, init?: RequestInit) {
  const response = await fetch("/api/notifications" + path, {
    ...init,
    headers: { "content-type": "application/json" },
  });
  const value = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok)
    throw Object.assign(new Error(String(value.message || value.error || response.status)), {
      code: typeof value.error === "string" ? value.error : null,
    });
  return value;
}

/** Reads and changes the signed-in person's notification channels. */
export function useNotificationSettings() {
  const [settings, setSettings] = useState<NotificationSettings | null>(null),
    [loadFailed, setLoadFailed] = useState(false),
    [busy, setBusy] = useState<NotificationChannelKind | null>(null),
    [failure, setFailure] = useState<{
      kind: NotificationChannelKind;
      code: string | null;
      message: string;
    } | null>(null),
    [secret, setSecret] = useState<string | null>(null),
    [tested, setTested] = useState<{ kind: NotificationChannelKind; sent: boolean } | null>(null);
  const pending = useRef(false);

  const load = useCallback(async () => {
    try {
      setSettings((await request("")) as unknown as NotificationSettings);
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function run(kind: NotificationChannelKind, action: () => Promise<void>) {
    if (pending.current) return;
    pending.current = true;
    setBusy(kind);
    setFailure(null);
    setTested(null);
    try {
      await action();
    } catch (error) {
      setFailure({
        kind,
        code: (error as { code?: string | null }).code ?? null,
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      pending.current = false;
      setBusy(null);
    }
  }

  const save = (kind: NotificationChannelKind, change: Change) =>
    run(kind, async () => {
      // A chosen event shows at once; the saved settings replace it, or a failure undoes it.
      const before = settings;
      if (change.events && before)
        setSettings({
          ...before,
          channels: before.channels.map((channel) =>
            channel.kind === kind ? { ...channel, events: change.events! } : channel,
          ),
        });
      try {
        const value = await request("/" + kind, { method: "PUT", body: JSON.stringify(change) });
        setSettings({ events: value.events, channels: value.channels } as NotificationSettings);
        if (typeof value.webhook_secret === "string") setSecret(value.webhook_secret);
      } catch (error) {
        if (change.events) setSettings(before);
        throw error;
      }
    });

  const sendTest = (kind: NotificationChannelKind) =>
    run(kind, async () => {
      // The Relay sends the test at once and says whether it went out.
      const value = await request("/" + kind + "/test", { method: "POST" });
      if (typeof value.error === "string")
        throw Object.assign(new Error(value.error), { code: value.error });
      setTested({ kind, sent: value.sent === true });
    });

  return {
    settings,
    loadFailed,
    reload: load,
    busy,
    /** The last failure, for the channel it belongs to. */
    failureFor: (kind: NotificationChannelKind) => (failure?.kind === kind ? failure : null),
    /** The webhook signing secret, shown once after it is created. */
    secret,
    dismissSecret: () => setSecret(null),
    /** Whether the last test went out, for the channel it belongs to. */
    testedFor: (kind: NotificationChannelKind) => (tested?.kind === kind ? tested : null),
    save,
    sendTest,
  };
}
