import { useEffect, useRef, useState } from "react";
import { onLiveStatus, subscribeLive, type LiveTopic } from "../lib/live-updates.js";

/**
 * Reloads a list when the Relay says it changed. Returns whether the feed is
 * connected, so the caller can poll slowly instead of every few seconds.
 */
export function useLiveTopic(topic: LiveTopic, onChange: () => void, enabled = true) {
  const [connected, setConnected] = useState(false);
  const latest = useRef(onChange);
  latest.current = onChange;
  useEffect(() => {
    if (!enabled) return;
    const unsubscribe = subscribeLive(topic, () => latest.current());
    const stopStatus = onLiveStatus(setConnected);
    return () => {
      stopStatus();
      unsubscribe();
      setConnected(false);
    };
  }, [topic, enabled]);
  return enabled && connected;
}
