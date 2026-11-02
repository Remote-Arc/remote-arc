import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
// @ts-ignore Test renderer is provided by this workspace.
import { act, create } from "react-test-renderer";
import { I18nProvider } from "../src/app/i18n.js";
import { TaskResults, isPlannedProgress } from "../src/features/tasks/dashboard-task-view.js";
import { ConnectTasksErrorBoundary } from "../src/features/tasks/connect-tasks-error-boundary.js";

const originalLocation = (globalThis as any).location;
const originalWindow = (globalThis as any).window;
(globalThis as any).location = { hostname: "agent.remotearc.app", pathname: "/dashboard/connect/tasks", search: "" };
(globalThis as any).window = { location: (globalThis as any).location };

try {
  const task = {
    id: "task-1", status: "running", state_json: JSON.stringify({ planned: { plan: {} } }),
    created_at: "2026-11-02T00:00:00Z", updated_at: "2026-11-02T00:00:00Z",
    last_run_at: null, expires_at: null, interval_seconds: 0, last_error: null,
  };
  const render = () => renderToStaticMarkup(<I18nProvider><TaskResults task={task} /></I18nProvider>);
  assert.doesNotMatch(render(), /taskResultsBody/, "Closed task details must not eagerly render their hidden body");

  assert.equal(isPlannedProgress({ plan: {} }), false, "A partially persisted plan must never reach the progress component");
  assert.equal(isPlannedProgress({ plan: { phases: [], time_policy: {} }, outcomes: [], checks: [], rejected: [], started_at: "2026-11-02T00:00:00Z" }), true);
  assert.equal(isPlannedProgress(null), false);
  assert.equal(isPlannedProgress("bad"), false);
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  (globalThis as any).location.hostname = "admin.remotearc.app"; // Suppress client telemetry in this isolated test.
  (globalThis as any).window.location.reload = () => { reloads++; };
  let reloads = 0;
  const Broken = () => { throw new Error("simulated task render failure"); };
  const previousError = console.error;
  let root: ReturnType<typeof create> | undefined;
  try {
    console.error = () => {}; // React reports the expected caught exception.
    await act(async () => {
      root = create(<ConnectTasksErrorBoundary tr={(en) => en}><Broken /></ConnectTasksErrorBoundary>);
    });
  } finally { console.error = previousError; }
  assert.match(JSON.stringify(root!.toJSON()), /Tasks couldn't be displayed/);
  await act(async () => root!.root.findByType("button").props.onClick());
  assert.equal(reloads, 1, "The fallback must let users reload without losing their tasks");
  await act(async () => root!.unmount());
  console.log("PASS: closed tasks defer details, incomplete plans are gated, render errors show an actionable fallback");
} finally {
  (globalThis as any).location = originalLocation;
  (globalThis as any).window = originalWindow;
}
