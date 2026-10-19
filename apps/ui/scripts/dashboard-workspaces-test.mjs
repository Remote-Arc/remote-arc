import assert from "node:assert/strict";
import test from "node:test";
import {
  DASHBOARD_PATHS, LEGACY_DASHBOARD_PATHS, dashboardTabFromPath, workspaceForTab, availableDashboardTab,
  isAgentGoalAutomation, isAgentRoutineAutomation, isVisibleInWorkspace,
} from "../src/dashboard-workspaces.ts";

const plainTask = { kind: "schedule_watch", goal_json: null, trigger_json: '{"type":"interval"}' };
const aiGoal = { kind: "goal_loop", goal_json: '{"type":"agent_goal"}', trigger_json: '{"type":"now"}' };
const aiRoutine = { kind: "long_task", goal_json: '{"type":"agent_goal"}', trigger_json: '{"type":"interval"}' };

test("Connect release redirects every Arc deep link and preserves shared connections", () => {
  for (const [tab, path] of Object.entries(DASHBOARD_PATHS)) {
    assert.equal(workspaceForTab(availableDashboardTab(dashboardTabFromPath(path))), 'connect');
    if (tab !== 'automations') assert.equal(availableDashboardTab(tab, true), tab);
  }
  assert.equal(availableDashboardTab('agent-apps'), 'apps');
  assert.equal(availableDashboardTab('agent-devices'), 'devices');
  assert.equal(availableDashboardTab('agent-settings'), 'settings');
  assert.equal(availableDashboardTab(dashboardTabFromPath('/automations')), 'overview');
});

test("each canonical dashboard route resolves to its tab", () => {
  for (const [tab, path] of Object.entries(DASHBOARD_PATHS)) {
    assert.equal(dashboardTabFromPath(path), tab === 'automations' ? 'agent-goals' : tab);
    assert.equal(dashboardTabFromPath(path + "/"), tab === 'automations' ? 'agent-goals' : tab);
    assert.equal(workspaceForTab(tab), tab.startsWith("agent-") ? "agent" : "connect");
  }
});

test("existing deep links remain compatible", () => {
  for (const [path, tab] of Object.entries(LEGACY_DASHBOARD_PATHS)) {
    assert.equal(dashboardTabFromPath(path), tab === 'automations' ? 'agent-goals' : tab);
  }
  assert.equal(dashboardTabFromPath("/unknown"), "overview");
});

test("Arc tasks include one-off work while routines have a separate view", () => {
  assert.equal(isAgentGoalAutomation(plainTask), false);
  assert.equal(isAgentGoalAutomation(aiGoal), true);
  assert.equal(isVisibleInWorkspace(plainTask, "automations"), true);
  assert.equal(isVisibleInWorkspace(aiGoal, "automations"), false);
  assert.equal(isVisibleInWorkspace(aiGoal, "agent-goals"), true);
  assert.equal(isVisibleInWorkspace(plainTask, "agent-goals"), true);
  assert.equal(isVisibleInWorkspace(aiRoutine, "agent-goals"), false);
  assert.equal(isVisibleInWorkspace(aiRoutine, "agent-activity"), true);
});

test("routine classification requires an AI goal with an actual time trigger", () => {
  assert.equal(isAgentRoutineAutomation(aiRoutine), true);
  assert.equal(isAgentRoutineAutomation(aiGoal), false);
  assert.equal(isAgentRoutineAutomation(plainTask), false);
  assert.equal(isVisibleInWorkspace(aiRoutine, "agent-routines"), true);
  assert.equal(isVisibleInWorkspace(aiGoal, "agent-routines"), false);
});

test("malformed JSON never crosses the workspace boundary", () => {
  const malformed = { kind: "long_task", goal_json: "{", trigger_json: "oops" };
  assert.equal(isAgentGoalAutomation(malformed), false);
  assert.equal(isAgentRoutineAutomation(malformed), false);
  assert.equal(isVisibleInWorkspace(malformed, "automations"), true);
});
