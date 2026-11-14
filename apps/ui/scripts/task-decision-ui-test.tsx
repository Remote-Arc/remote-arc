import { loadLocale } from "../src/locales/locale-catalog.js";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
// @ts-expect-error Test renderer is provided by this workspace.
import { act, create } from "react-test-renderer";
import { I18nProvider } from "../src/app/i18n.js";
import { TaskDecisionCard } from "../src/features/tasks/task-decision-card.js";
import { taskActivity, taskNeedsAttention } from "../src/features/tasks/dashboard-task-view.js";
import { createTranslator } from "../src/locales/locale-catalog.js";
import {
  taskDecision,
  useTaskDecision,
  type TaskDecision,
} from "../src/hooks/tasks/use-task-decision.js";

(globalThis as any).location = {
  hostname: "admin.remotearc.app", // Keeps client telemetry out of this isolated test.
  pathname: "/dashboard/connect/tasks",
  search: "",
};
(globalThis as any).window = { location: (globalThis as any).location };
// The i18n provider sets the document language after it mounts.
(globalThis as any).document = { documentElement: {}, querySelector: () => null };
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
await loadLocale("en", "dashboard");
await loadLocale("zh", "dashboard");

const decision: TaskDecision = {
  id: "decision-1",
  kind: "repair_failed",
  reason: "Automatic repair ended paused: The export needs a new API key.",
  evidence: "stdout:\nupload rejected: 401",
  options: ["retry_now", "skip_run", "turn_off"],
  created_at: "2026-11-14T03:00:00.000Z",
  timeout_at: "2026-11-14T05:00:00.000Z",
  on_timeout: "skip_run",
};
const heldTask = {
  id: "task-1",
  status: "paused",
  state_json: JSON.stringify({ phase: "idle", decision }),
};

// Reading the decision from a Task.
{
  assert.deepEqual(taskDecision(heldTask), decision);
  assert.equal(taskDecision({ ...heldTask, status: "waiting" }), null, "only held Tasks decide");
  assert.equal(taskDecision({ ...heldTask, state_json: "{" }), null, "bad JSON is no decision");
  assert.equal(
    taskDecision({
      ...heldTask,
      state_json: JSON.stringify({ decision: { ...decision, kind: "unknown" } }),
    }),
    null,
    "an unknown kind is no decision",
  );
  assert.equal(taskNeedsAttention(heldTask), true, "a held routine needs attention");
  assert.equal(
    taskActivity(
      { ...heldTask, kind: "schedule_watch", next_run_at: null },
      createTranslator("en"),
    ),
    "Waiting for your decision",
    "the status line says the routine waits for a decision",
  );
  console.log(
    "PASS: a held routine's decision is read safely and marks the Task as needing attention",
  );
}

// The card shows what happened, the evidence, the timeout and the choices in both languages.
{
  const render = (language: "en" | "zh") =>
    renderToStaticMarkup(
      <I18nProvider initialLanguage={language}>
        <TaskDecisionCard
          decision={decision}
          busy={false}
          disabled={false}
          error={null}
          formatTime={() => "5:00 AM"}
          onDecide={() => {}}
          onTurnOff={() => {}}
        />
      </I18nProvider>,
    );
  const en = render("en");
  assert.match(en, /Needs your decision: automatic repair did not fix it/);
  assert.match(en, /The export needs a new API key/);
  assert.match(
    en,
    /<details[^>]*><summary>Last output<\/summary><pre>stdout:\nupload rejected: 401<\/pre>/,
  );
  assert.match(en, /this run is skipped at 5:00 AM/);
  for (const label of ["Retry now", "Skip this run", "Turn off"])
    assert.match(en, new RegExp(label));
  const zh = render("zh");
  assert.match(zh, /需要你决定：自动修复没有修好/);
  for (const label of ["现在重试", "跳过这次", "关闭"]) assert.match(zh, new RegExp(label));
  console.log(
    "PASS: the decision card shows the reason, evidence, timeout and choices in English and Chinese",
  );
}

// Deciding sends the decision id and reports the outcome to the right Task.
{
  const requests: { url: string; body: unknown }[] = [];
  let reply: Response = new Response("{}");
  (globalThis as any).fetch = async (url: string, init: RequestInit) => {
    requests.push({ url, body: JSON.parse(String(init.body)) });
    return reply;
  };
  const settled: unknown[] = [];
  let hook: ReturnType<typeof useTaskDecision<{ id: string }>> | undefined;
  const Harness = () => {
    hook = useTaskDecision<{ id: string }>((automation) => settled.push(automation));
    return null;
  };
  await act(async () => {
    create(
      <I18nProvider initialLanguage="en">
        <Harness />
      </I18nProvider>,
    );
  });

  reply = Response.json({ automation: { id: "task-1", status: "waiting" } });
  await act(async () => hook!.decide({ id: "task-1" }, decision, "retry_now"));
  assert.deepEqual(requests.at(-1), {
    url: "/api/automations/task-1/retry_now",
    body: { decision_id: "decision-1" },
  });
  assert.deepEqual(settled, [{ id: "task-1", status: "waiting" }]);
  assert.equal(hook!.errorFor("task-1"), null);

  reply = Response.json(
    { error: "That decision was already settled; read the automation again." },
    { status: 400 },
  );
  await act(async () => hook!.decide({ id: "task-1" }, decision, "skip_run"));
  assert.equal(requests.at(-1)!.url, "/api/automations/task-1/skip_run");
  assert.equal(settled.length, 1, "a refused decision is not reported as settled");
  assert.match(hook!.errorFor("task-1") || "", /already settled/);
  assert.equal(hook!.errorFor("task-2"), null, "the error stays on its own Task");
  console.log(
    "PASS: deciding posts the decision id, reports success and keeps a refusal on its Task",
  );
}
