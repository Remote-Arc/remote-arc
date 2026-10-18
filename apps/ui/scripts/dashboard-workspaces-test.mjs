import assert from "node:assert/strict";
import test from "node:test";
import {
  DASHBOARD_PATHS, LEGACY_DASHBOARD_PATHS, dashboardTabFromPath, workspaceForTab,
  isAgentGoalAutomation, isAgentRoutineAutomation, isVisibleInWorkspace,
} from "../src/dashboard-workspaces.ts";

const plainTask = { kind: "schedule_watch", goal_json: null, trigger_json: '{"type":"interval"}' };
const aiGoal = { kind: "goal_loop", goal_json: '{"type":"agent_goal"}', trigger_json: '{"type":"now"}' };
const aiRoutine = { kind: "long_task", goal_json: '{"type":"agent_goal"}', trigger_json: '{"type":"interval"}' };

test("each canonical dashboard route resolves to its tab", () => {
  for (const [tab, path] of Object.entries(DASHBOARD_PATHS)) {
    assert.equal(dashboardTabFromPath(path), tab);
    assert.equal(dashboardTabFromPath(path + "/"), tab);
    assert.equal(workspaceForTab(tab), tab.startsWith("agent-") ? "agent" : "connect");
  }
});

test("existing deep links remain compatible", () => {
  for (const [path, tab] of Object.entries(LEGACY_DASHBOARD_PATHS)) {
    assert.equal(dashboardTabFromPath(path), tab);
  }
  assert.equal(dashboardTabFromPath("/unknown"), "overview");
});

test("only AI-goals enter Arc Agent goals while plain tasks stay Connect", () => {
  assert.equal(isAgentGoalAutomation(plainTask), false);
  assert.equal(isAgentGoalAutomation(aiGoal), true);
  assert.equal(isVisibleInWorkspace(plainTask, "automations"), true);
  assert.equal(isVisibleInWorkspace(aiGoal, "automations"), false);
  assert.equal(isVisibleInWorkspace(aiGoal, "agent-goals"), true);
  assert.equal(isVisibleInWorkspace(plainTask, "agent-goals"), false);
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
