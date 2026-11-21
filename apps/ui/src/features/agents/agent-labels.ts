import type { AgentRunState } from "../../hooks/agents/use-agent-runs.js";

export const STATE_LABELS = {
  running: "orchestration.state.running",
  done: "orchestration.state.done",
  failed: "orchestration.state.failed",
  needs_user: "orchestration.state.needs_user",
  stopped: "orchestration.state.stopped",
} as const satisfies Record<AgentRunState, string>;
