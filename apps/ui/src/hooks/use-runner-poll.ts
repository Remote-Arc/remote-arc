import { useEffect, useRef } from "react";

/** Poll one browser task at a time; failed/offscreen requests must not form a hot loop. */
export function useRunnerPoll(
  load: (signal: AbortSignal) => Promise<void>,
  key: string,
  enabled = true,
) {
  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => {
    if (!enabled) return;
    let disposed = false;
    let failures = 0;
    let timer: ReturnType<typeof setTimeout>;
    let request: AbortController | undefined;
    const pause = () => {
      clearTimeout(timer);
      request?.abort();
      request = undefined;
    };
    const poll = async () => {
      if (disposed || document.hidden || request) return;
      clearTimeout(timer);
      const current = new AbortController();
      request = current;
      try {
        await loadRef.current(current.signal);
        if (!current.signal.aborted) {
          failures = 0;
        }
      } catch {
        if (!current.signal.aborted) failures = Math.min(failures + 1, 3);
      } finally {
        if (request === current) {
          request = undefined;
          if (!disposed && !document.hidden)
            timer = setTimeout(poll, Math.min(60_000, 10_000 * 2 ** failures));
        }
      }
    };
    const visibility = () => {
      if (document.hidden) pause();
      else void poll();
    };
    document.addEventListener("visibilitychange", visibility);
    void poll();
    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", visibility);
      pause();
    };
  }, [enabled, key]);
}
