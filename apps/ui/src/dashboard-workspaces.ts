export type DashboardWorkspace = "connect" | "agent";

export type DashboardTab =
  | "overview" | "devices" | "automations" | "apps" | "connect" | "security" | "monitor" | "settings"
  | "agent-chat" | "agent-goals" | "agent-routines" | "agent-skills" | "agent-activity" | "agent-settings";

// Canonical dashboard URLs are namespaced. Legacy deep links remain usable.
export const DASHBOARD_PATHS: Record<DashboardTab, string> = {
  overview: "/dashboard/connect/overview",
  devices: "/dashboard/connect/devices",
  automations: "/dashboard/connect/tasks",
  apps: "/dashboard/connect/apps",
  connect: "/dashboard/connect/clients",
  security: "/dashboard/connect/security",
  monitor: "/monitor",
  settings: "/dashboard/connect/settings",
  "agent-chat": "/dashboard/agent/chat",
  "agent-goals": "/dashboard/agent/goals",
  "agent-routines": "/dashboard/agent/routines",
  "agent-skills": "/dashboard/agent/skills",
  "agent-activity": "/dashboard/agent/activity",
  "agent-settings": "/dashboard/agent/settings",
};

export const LEGACY_DASHBOARD_PATHS: Record<string, DashboardTab> = {
  "/dashboard": "overview",
  "/dashboard/connect": "overview",
  "/dashboard/agent": "agent-chat",
  "/overview": "overview",
  "/devices": "devices",
  "/automations": "automations",
  "/apps": "apps",
  "/connect": "connect",
  "/security": "security",
  "/dashboard/connect/monitor": "monitor",
  "/settings": "settings",
};

export function dashboardTabFromPath(pathname: string): DashboardTab {
  const clean = pathname.replace(/\/+$/, "") || "/";
  return (Object.entries(DASHBOARD_PATHS).find(([, path]) => path === clean)?.[0] as DashboardTab | undefined)
    ?? LEGACY_DASHBOARD_PATHS[clean] ?? "overview";
}

export function workspaceForTab(tab: DashboardTab): DashboardWorkspace {
  return tab.startsWith("agent-") ? "agent" : "connect";
}

export type WorkspaceAutomation = {
  kind: string;
  goal_json?: string | null;
  trigger_json?: string | null;
};

export function isAgentGoalAutomation(task: WorkspaceAutomation): boolean {
  if (!task.goal_json) return false;
  try {
    return (JSON.parse(task.goal_json) as { type?: string }).type === "agent_goal";
  } catch {
    return false;
  }
}

export function isAgentRoutineAutomation(task: WorkspaceAutomation): boolean {
  if (!isAgentGoalAutomation(task) || !task.trigger_json) return false;
  try {
    const trigger = JSON.parse(task.trigger_json) as { type?: string };
    return trigger.type === "interval";
  } catch {
    return false;
  }
}

export function isVisibleInWorkspace(task: WorkspaceAutomation, tab: DashboardTab): boolean {
  if (tab === "automations") return !isAgentGoalAutomation(task);
  if (tab === "agent-goals" || tab === "agent-activity") return isAgentGoalAutomation(task);
  if (tab === "agent-routines") return isAgentRoutineAutomation(task);
  return true;
}
