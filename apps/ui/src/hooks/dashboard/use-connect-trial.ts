import { useRef, useState } from "react";

/** Why the one-off Connect trial could not start, as the server names it. */
export type ConnectTrialRefusal =
  "not_needed" | "not_free" | "used" | "paid_before" | "shared_computer" | "unavailable";

/** Starts the one-off Connect trial, which never starts by itself, then lets the
 * caller reload usage. */
export function useConnectTrial(onStarted: () => unknown) {
  const [busy, setBusy] = useState(false),
    [refusal, setRefusal] = useState<ConnectTrialRefusal | null>(null),
    lock = useRef(false);
  const start = async () => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setRefusal(null);
    try {
      const response = await fetch("/api/usage/connect-trial", {
        method: "POST",
        credentials: "same-origin",
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { reason?: string };
        setRefusal((body.reason as ConnectTrialRefusal | undefined) ?? "unavailable");
        return;
      }
      await onStarted();
    } catch {
      setRefusal("unavailable");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return { start, busy, refusal };
}
