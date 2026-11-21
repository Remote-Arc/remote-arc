import { useCallback, useEffect, useRef, useState } from "react";

export type AgentKind = "claude" | "codex";
export type AgentRunState = "running" | "done" | "failed" | "needs_user" | "stopped";

export type AgentMessage =
  | { kind: "user"; text: string }
  | { kind: "assistant"; text: string }
  | { kind: "tool"; name: string; detail: string; status: "running" | "ok" | "error" }
  | { kind: "error"; text: string };

export type AgentRateLimit = {
  status: string;
  windows: { name: string; utilization: number; resets_at: string }[];
  at: string;
};

/** One agent as the Relay reports it in GET /api/agent-runs. */
export type AgentRun = {
  id: string;
  group_id: string;
  device_id: string;
  agent: AgentKind;
  title: string;
  repo_path: string;
  worktree_path: string;
  branch: string;
  state: AgentRunState;
  turns: number;
  usage: { cost_usd: number; input_tokens: number; output_tokens: number } | null;
  summary: {
    files_changed: number;
    insertions: number;
    deletions: number;
    untracked: number;
    commits: number;
  } | null;
  error: string | null;
  created_at: string;
  updated_at: string;
  finished_at: string | null;
  worktree_removed: boolean;
  has_worktree: boolean;
  can_send: boolean;
};

export type AgentTurn = {
  idx: number;
  prompt: string;
  state: AgentRunState;
  exit_code: number | null;
  messages: AgentMessage[];
  usage: { input_tokens: number; output_tokens: number; cost_usd: number | null } | null;
  error: string | null;
  created_at: string;
  finished_at: string | null;
};

export type AgentRunTarget = { device_id: string; repo_path: string };

export async function agentRequest(path: string, init?: RequestInit) {
  const response = await fetch("/api/agent-runs" + path, {
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

const LIST_REFRESH_MS = 15_000;

/** Lists, starts and controls the signed-in person's agents. */
export function useAgentRuns() {
  const [runs, setRuns] = useState<AgentRun[] | null>(null),
    [quota, setQuota] = useState<{ claude: AgentRateLimit | null }>({ claude: null }),
    [fanoutLimit, setFanoutLimit] = useState(1),
    [loadFailed, setLoadFailed] = useState(false),
    [busy, setBusy] = useState(false),
    [failure, setFailure] = useState<string | null>(null);
  const pending = useRef(false);

  const load = useCallback(async () => {
    try {
      const value = (await agentRequest("")) as {
        runs: AgentRun[];
        quota: { claude: AgentRateLimit | null };
        fanout_limit: number;
      };
      setRuns(value.runs);
      setQuota(value.quota);
      setFanoutLimit(value.fanout_limit);
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  // While an agent works, the list refreshes itself.
  const live = (runs || []).some((run) => run.state === "running");
  useEffect(() => {
    if (!live) return;
    const timer = setInterval(() => void load(), LIST_REFRESH_MS);
    return () => clearInterval(timer);
  }, [live, load]);

  async function act<T>(action: () => Promise<T>): Promise<T | null> {
    if (pending.current) return null;
    pending.current = true;
    setBusy(true);
    setFailure(null);
    try {
      const value = await action();
      await load();
      return value;
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error));
      return null;
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  const start = (agent: AgentKind, prompt: string, targets: AgentRunTarget[]) =>
    act(
      async () =>
        (await agentRequest("", {
          method: "POST",
          body: JSON.stringify({ agent, prompt, targets }),
        })) as { group_id: string; runs: AgentRun[] },
    );
  const stop = (id: string) => act(() => agentRequest("/" + id + "/stop", { method: "POST" }));
  const removeWorktree = (id: string) =>
    act(() =>
      agentRequest("/" + id + "/remove", {
        method: "POST",
        body: JSON.stringify({ confirm: true }),
      }),
    );

  return {
    runs,
    quota,
    fanoutLimit,
    loadFailed,
    busy,
    failure,
    reload: load,
    start,
    stop,
    removeWorktree,
  };
}

const LIVE_REFRESH_MS = 3_000;

/**
 * One agent's conversation. While the agent works, it refreshes every few
 * seconds with ?live=1, which reads the agent's newest events from the computer.
 */
export function useAgentConversation(id: string, onChange?: () => void) {
  const [run, setRun] = useState<AgentRun | null>(null),
    [turns, setTurns] = useState<AgentTurn[]>([]),
    [sending, setSending] = useState(false),
    [failure, setFailure] = useState<string | null>(null);
  const changed = useRef(onChange);
  changed.current = onChange;

  const load = useCallback(async () => {
    try {
      const value = (await agentRequest("/" + id + "?live=1")) as {
        run: AgentRun;
        turns: AgentTurn[];
      };
      setRun((before) => {
        if (before && before.state !== value.run.state) changed.current?.();
        return value.run;
      });
      setTurns(value.turns);
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error));
    }
  }, [id]);
  useEffect(() => {
    void load();
  }, [load]);
  const running = run?.state === "running";
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => void load(), LIVE_REFRESH_MS);
    return () => clearInterval(timer);
  }, [running, load]);

  const send = async (text: string) => {
    if (sending) return false;
    setSending(true);
    setFailure(null);
    try {
      await agentRequest("/" + id + "/messages", {
        method: "POST",
        body: JSON.stringify({ text }),
      });
      await load();
      changed.current?.();
      return true;
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error));
      return false;
    } finally {
      setSending(false);
    }
  };

  return { run, turns, sending, failure, send, reload: load };
}
