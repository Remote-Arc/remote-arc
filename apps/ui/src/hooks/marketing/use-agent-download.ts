import { useEffect, useState } from "react";
import { detectAgentTarget, type AgentTarget } from "../../lib/agent-download.js";

/**
 * The agent build for the visitor's computer, detected after mount (client hints
 * are asynchronous). Null while detecting, during server rendering and on a phone
 * or tablet, where callers link to the downloads page instead.
 */
export function useAgentDownload() {
  const [target, setTarget] = useState<AgentTarget | null>(null);
  useEffect(() => {
    let live = true;
    void detectAgentTarget().then((detected) => {
      if (live) setTarget(detected);
    });
    return () => {
      live = false;
    };
  }, []);
  return target;
}
