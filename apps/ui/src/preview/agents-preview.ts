import type { AgentRun, AgentTurn } from "../hooks/agents/use-agent-runs.js";

// Agent Orchestration for the preview Dashboard: two agents on the preview
// computers, and a reply a moment after each message. Nothing runs.
export function createAgentsPreview(now = Date.now()) {
  const iso = (offset: number) => new Date(now + offset).toISOString();
  const base = {
    group_id: "ag_preview",
    usage: null,
    summary: null,
    error: null,
    finished_at: null,
    worktree_removed: false,
    has_worktree: true,
  };
  const runs: AgentRun[] = [
    {
      ...base,
      id: "ar_00000000a001",
      device_id: "preview-mac",
      agent: "claude",
      title: "Fix the flaky date parser test",
      repo_path: "/Users/sam/work/app",
      worktree_path: "/Users/sam/work/app/.remote-arc/worktrees/ar_00000000a001",
      branch: "ra/agent-00000000a001",
      state: "done",
      turns: 1,
      usage: { cost_usd: 0.42, input_tokens: 182_000, output_tokens: 4_100 },
      summary: { files_changed: 2, insertions: 18, deletions: 6, untracked: 1, commits: 0 },
      created_at: iso(-40 * 60_000),
      updated_at: iso(-31 * 60_000),
      finished_at: iso(-31 * 60_000),
      can_send: true,
    },
    {
      ...base,
      id: "ar_00000000a002",
      device_id: "preview-win",
      agent: "codex",
      title: "Add pagination to the orders API",
      repo_path: "C:\\Users\\Sam\\work\\shop",
      worktree_path: "C:\\Users\\Sam\\work\\shop\\.remote-arc\\worktrees\\ar_00000000a002",
      branch: "ra/agent-00000000a002",
      state: "running",
      turns: 1,
      created_at: iso(-6 * 60_000),
      updated_at: iso(-20_000),
      can_send: false,
    },
  ];
  const turns: Record<string, AgentTurn[]> = {
    ar_00000000a001: [
      {
        idx: 1,
        prompt: "Fix the flaky date parser test and explain the cause.",
        state: "done",
        exit_code: 0,
        messages: [
          { kind: "assistant", text: "I'll run the test a few times to see how it fails." },
          {
            kind: "tool",
            name: "Bash",
            detail: "npm test -- date-parser --repeat 20",
            status: "error",
          },
          { kind: "tool", name: "Read", detail: "src/date/parse.ts", status: "ok" },
          { kind: "tool", name: "Edit", detail: "src/date/parse.ts", status: "ok" },
          {
            kind: "tool",
            name: "Bash",
            detail: "npm test -- date-parser --repeat 20",
            status: "ok",
          },
          {
            kind: "assistant",
            text: "The parser read the local time zone, so the test failed whenever it ran near midnight UTC. It now parses in UTC, and 20 runs in a row pass.",
          },
        ],
        usage: { input_tokens: 182_000, output_tokens: 4_100, cost_usd: 0.42 },
        error: null,
        created_at: iso(-40 * 60_000),
        finished_at: iso(-31 * 60_000),
      },
    ],
    ar_00000000a002: [
      {
        idx: 1,
        prompt: "Add cursor pagination to GET /orders, with tests.",
        state: "running",
        exit_code: null,
        messages: [
          {
            kind: "tool",
            name: "Command",
            detail: "rg -n \"router.get('/orders'\" src",
            status: "ok",
          },
          {
            kind: "tool",
            name: "Edit",
            detail: "src/routes/orders.ts, src/db/orders.ts",
            status: "ok",
          },
          { kind: "tool", name: "Command", detail: "npm test -- orders", status: "running" },
        ],
        usage: null,
        error: null,
        created_at: iso(-6 * 60_000),
        finished_at: null,
      },
    ],
  };
  // A message gets its reply on the second read, as a real turn would after a while.
  const pendingReads: Record<string, number> = {};
  const reply = (value: unknown, status = 200) =>
    new Response(JSON.stringify(value), {
      status,
      headers: { "content-type": "application/json" },
    });

  return {
    handle(url: URL, method: string, body: unknown): Response | null {
      const match = url.pathname.match(
        /^\/api\/agent-runs(?:\/(ar_[0-9a-f]{12})(?:\/(messages|stop|remove))?)?$/,
      );
      if (!match) return null;
      const [, id, action] = match;
      if (!id && method === "GET")
        return reply({
          runs,
          fanout_limit: 5,
          quota: {
            claude: {
              status: "allowed",
              windows: [
                { name: "five_hour", utilization: 0.34, resets_at: iso(2.5 * 3600_000) },
                { name: "seven_day", utilization: 0.21, resets_at: iso(4 * 86_400_000) },
              ],
              at: iso(-31 * 60_000),
            },
          },
        });
      const run = runs.find((item) => item.id === id);
      if (!run) return reply({ error: "NOT_FOUND", message: "No such agent run." }, 404);
      if (!action && method === "GET") {
        const history = turns[run.id]!;
        const last = history[history.length - 1]!;
        if (
          last.state === "running" &&
          pendingReads[run.id] !== undefined &&
          --pendingReads[run.id]! <= 0
        ) {
          last.state = "done";
          last.finished_at = new Date().toISOString();
          for (const message of last.messages) if (message.kind === "tool") message.status = "ok";
          last.messages.push({
            kind: "assistant",
            text: "Done. The new test covers an empty page and the last page.",
          });
          last.usage = {
            input_tokens: 24_000,
            output_tokens: 900,
            cost_usd: run.agent === "claude" ? 0.08 : null,
          };
          run.state = "done";
          run.can_send = true;
          delete pendingReads[run.id];
        }
        return reply({ run, turns: history });
      }
      if (action === "messages" && method === "POST") {
        if (!run.can_send)
          return reply({ error: "AGENT_RUN_ACTIVE", message: "The agent is still working." }, 409);
        const text = String((JSON.parse(String(body || "{}")) as { text?: string }).text || "");
        run.turns += 1;
        run.state = "running";
        run.can_send = false;
        turns[run.id]!.push({
          idx: run.turns,
          prompt: text,
          state: "running",
          exit_code: null,
          messages: [
            {
              kind: "tool",
              name: run.agent === "claude" ? "Write" : "Edit",
              detail: "test/pagination.test.ts",
              status: "running",
            },
          ],
          usage: null,
          error: null,
          created_at: new Date().toISOString(),
          finished_at: null,
        });
        pendingReads[run.id] = 2;
        return reply({ run }, 201);
      }
      if (action === "stop" && method === "POST") {
        run.state = "stopped";
        run.can_send = true;
        const last = turns[run.id]!.at(-1)!;
        last.state = "stopped";
        return reply({ run });
      }
      return reply({ error: "NOT_FOUND" }, 404);
    },
  };
}
