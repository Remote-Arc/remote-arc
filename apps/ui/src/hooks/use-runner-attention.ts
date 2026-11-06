import { useEffect, useState } from "react";
import { requestJSON } from "../features/browser-runner/runner-requests.js";

export type Attention = {
  id: string;
  device_id: string;
  device_name: string;
  session_id: string;
  kind: string;
  origin: string;
  availability?: "live" | "unavailable";
};

export function useRunnerAttention({
  enabled = true,
  arcSessionId,
}: {
  enabled?: boolean;
  arcSessionId?: string;
} = {}) {
  const [rows, setRows] = useState<Attention[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [hidden, setHidden] = useState<string[]>([]);
  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout>;
    let request: AbortController | undefined;
    const stop = () => {
      clearTimeout(timer);
      request?.abort();
      request = undefined;
    };
    const load = async () => {
      if (document.hidden || request) return;
      clearTimeout(timer);
      const current = new AbortController();
      request = current;
      try {
        const data = await requestJSON(
          "/api/runner/attention" +
            (arcSessionId ? "?arc_session_id=" + encodeURIComponent(arcSessionId) : ""),
          { signal: current.signal },
        );
        if (!Array.isArray(data.attention)) throw new Error("Invalid browser task list");
        if (!current.signal.aborted) {
          const incoming: Attention[] = data.attention;
          setRows(incoming);
          setFailed(false);
          setHidden((ids) =>
            ids.filter((id) =>
              incoming.some((row) => row.id === id && row.availability === "unavailable"),
            ),
          );
        }
      } catch {
        if (!current.signal.aborted) {
          setFailed(true);
          setRows(
            (previous) => previous?.map((row) => ({ ...row, availability: "unavailable" })) ?? null,
          );
        }
      } finally {
        if (request === current) {
          request = undefined;
          timer = setTimeout(load, 5000);
        }
      }
    };
    const syncVisibility = () => {
      if (document.hidden) stop();
      else void load();
    };
    document.addEventListener("visibilitychange", syncVisibility);
    syncVisibility();
    return () => {
      document.removeEventListener("visibilitychange", syncVisibility);
      stop();
    };
  }, [arcSessionId, enabled]);
  return {
    rows: rows?.filter((row) => row.availability !== "unavailable" || !hidden.includes(row.id)),
    failed,
    hideUnavailable: (id: string) => setHidden((ids) => [...ids, id]),
    remove: (id: string) => setRows((current) => current?.filter((row) => row.id !== id) ?? null),
  };
}
