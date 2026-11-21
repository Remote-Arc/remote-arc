import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "../src/app/i18n.js";
import { loadLocale } from "../src/locales/locale-catalog.js";
import { AgentLaunchForm } from "../src/features/agents/agent-launch-form.js";
import { AgentTimeline } from "../src/features/agents/agent-timeline.js";
import { AgentSidebar } from "../src/features/agents/agent-sidebar.js";
import { QuotaBar } from "../src/features/agents/quota-bar.js";
import type { AgentRun, AgentTurn } from "../src/hooks/agents/use-agent-runs.js";
import { dashboardTabFromPath, DASHBOARD_PATHS } from "../src/lib/dashboard-workspaces.js";

(globalThis as any).location = {
  hostname: "admin.remotearc.app", // Keeps client telemetry out of this isolated test.
  pathname: "/dashboard/connect/orchestration",
  search: "",
};
(globalThis as any).window = { location: (globalThis as any).location };
(globalThis as any).document = { documentElement: {}, querySelector: () => null };
await loadLocale("en", "dashboard");
await loadLocale("zh", "dashboard");

const render = (node: React.ReactNode, locale: "en" | "zh" = "en") =>
  renderToStaticMarkup(<I18nProvider initialLanguage={locale}>{node}</I18nProvider>);
const noop = () => undefined;

assert.equal(DASHBOARD_PATHS.orchestration, "/dashboard/connect/orchestration");
assert.equal(dashboardTabFromPath("/dashboard/connect/orchestration/"), "orchestration");
console.log("PASS: Agent Orchestration has its own Dashboard address");

// --- Launch form ------------------------------------------------------------
const offline = render(
  <AgentLaunchForm
    devices={[
      { id: "a", name: "Laptop", status: "offline", workspace_roots: ["/r"] },
      { id: "b", name: "Desk", status: "online", workspace_roots: [] },
    ]}
    fanoutLimit={5}
    busy={false}
    onStart={noop}
  />,
);
assert.match(offline, /need an online computer with a trusted write location/);
assert.doesNotMatch(offline, /<form/);
const devices = [
  { id: "mac", name: "MacBook", status: "online" as const, workspace_roots: ["/Users/me/code"] },
  { id: "pc", name: "Desk PC", status: "online" as const, workspace_roots: ["C:\\code"] },
];
const free = render(
  <AgentLaunchForm devices={devices} fanoutLimit={1} busy={false} onStart={noop} />,
);
assert.match(free, /value="\/Users\/me\/code"/, "the first trusted folder is suggested");
assert.match(free, /Your plan starts 1 agent\(s\) per launch\./);
assert.doesNotMatch(free, /Add another agent/);
assert.match(free, /<button type="submit" class="orchPrimary" disabled="">/);
assert.match(
  render(<AgentLaunchForm devices={devices} fanoutLimit={5} busy={false} onStart={noop} />),
  /Add another agent/,
);
assert.match(
  render(<AgentLaunchForm devices={devices} fanoutLimit={5} busy={false} onStart={noop} />, "zh"),
  /再加一个 Agent/,
);
console.log("PASS: the launch form needs an online computer and follows the plan's fan-out");

// --- Conversation -------------------------------------------------------------
const turns: AgentTurn[] = [
  {
    idx: 1,
    prompt: "Fix the parser",
    state: "done",
    exit_code: 0,
    messages: [
      { kind: "assistant", text: "Looking at it." },
      { kind: "tool", name: "Bash", detail: "npm test", status: "error" },
      { kind: "tool", name: "Edit", detail: "src/a.ts", status: "ok" },
      { kind: "assistant", text: "Fixed the off-by-one." },
    ],
    usage: { input_tokens: 1000, output_tokens: 234, cost_usd: 0.07 },
    error: null,
    created_at: "2026-11-21T00:00:00.000Z",
    finished_at: "2026-11-21T00:02:00.000Z",
  },
  {
    idx: 2,
    prompt: "Now add a test",
    state: "running",
    exit_code: null,
    messages: [{ kind: "tool", name: "Write", detail: "test/a.test.ts", status: "running" }],
    usage: null,
    error: null,
    created_at: "2026-11-21T00:03:00.000Z",
    finished_at: null,
  },
];
const timeline = render(<AgentTimeline turns={turns} />);
const order = [
  "Fix the parser",
  "Looking at it.",
  "npm test",
  "src/a.ts",
  "Fixed the off-by-one.",
  "Replied",
  "Now add a test",
  "test/a.test.ts",
  "Working…",
];
let at = -1;
for (const text of order) {
  const next = timeline.indexOf(text, at + 1);
  assert.ok(next > at, `"${text}" follows in order`);
  at = next;
}
assert.match(timeline, /class="orchBubble is-user">Fix the parser/);
assert.match(timeline, /class="orchTool is-error"><span>Bash<\/span><code>npm test<\/code>/);
assert.match(timeline, /1,234 tokens · \$0\.07/);
assert.match(render(<AgentTimeline turns={turns} />, "zh"), /工作中…/);
console.log(
  "PASS: a conversation shows each message, the agent's replies and tools with their outcome, and usage per turn",
);

// --- Agent list and quota -------------------------------------------------------
const run = (id: string, state: AgentRun["state"], title: string): AgentRun => ({
  id,
  group_id: "ag_1",
  device_id: "mac",
  agent: "claude",
  title,
  repo_path: "/r",
  worktree_path: "/r/.remote-arc/worktrees/" + id,
  branch: "ra/agent-" + id.slice(3),
  state,
  turns: 1,
  usage: null,
  summary: null,
  error: null,
  created_at: "2026-11-21T00:00:00.000Z",
  updated_at: "2026-11-21T00:00:00.000Z",
  finished_at: null,
  worktree_removed: false,
  has_worktree: true,
  can_send: state !== "running",
});
const sidebar = render(
  <AgentSidebar
    runs={[
      run("ar_000000000001", "running", "Fix login"),
      run("ar_000000000002", "needs_user", "Docs"),
    ]}
    open={["ar_000000000001"]}
    deviceName={() => "MacBook"}
    onOpen={noop}
  />,
);
assert.match(sidebar, /aria-current="true"><span class="orchDot is-running"/);
assert.match(sidebar, /Fix login<\/strong><small>Claude Code · MacBook · Working<\/small>/);
assert.match(sidebar, /Docs<\/strong><small>Claude Code · MacBook · Needs you<\/small>/);
assert.equal(render(<QuotaBar claude={null} />), "", "no quota until Claude reports it");
const quota = render(
  <QuotaBar
    claude={{
      status: "allowed",
      windows: [
        { name: "five_hour", utilization: 0.3, resets_at: "2026-11-21T15:10:00.000Z" },
        { name: "seven_day", utilization: 0.291, resets_at: "2026-11-27T12:00:00.000Z" },
      ],
      at: "2026-11-21T10:00:00.000Z",
    }}
  />,
);
assert.match(quota, /5-hour<\/span><meter[^>]*value="30"><\/meter><strong>30%/);
assert.match(quota, /7-day<\/span><meter[^>]*value="29"><\/meter><strong>29%/);
console.log(
  "PASS: the agent list marks open and working agents, and the quota bar shows Claude's windows",
);
