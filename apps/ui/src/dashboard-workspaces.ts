export type DashboardWorkspace = "connect" | "agent";

// Arc is prepared in the codebase but is not part of the public Connect release.
export const ARC_WORKSPACE_AVAILABLE = false;

export type DashboardTab =
  | "overview" | "devices" | "automations" | "apps" | "connect" | "security" | "monitor" | "settings"
  | "agent-apps" | "agent-devices" | "agent-chat" | "agent-goals" | "agent-routines" | "agent-skills" | "agent-activity" | "agent-settings";

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
  "agent-apps": "/dashboard/agent/apps",
  "agent-devices": "/dashboard/agent/devices",
  "agent-chat": "/dashboard/agent/chat",
  "agent-goals": "/dashboard/agent/tasks",
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
  "/dashboard/agent/goals": "agent-goals",
  "/apps": "apps",
  "/connect": "connect",
  "/security": "security",
  "/dashboard/connect/monitor": "monitor",
  "/settings": "settings",
};

export function dashboardTabFromPath(pathname: string): DashboardTab {
  const clean = pathname.replace(/\/+$/, "") || "/";
  const tab = (Object.entries(DASHBOARD_PATHS).find(([, path]) => path === clean)?.[0] as DashboardTab | undefined)
    ?? LEGACY_DASHBOARD_PATHS[clean] ?? "overview";
  return tab === "automations" ? "agent-goals" : tab;
}

export function workspaceForTab(tab: DashboardTab): DashboardWorkspace {
  return tab.startsWith("agent-") ? "agent" : "connect";
}

export function availableDashboardTab(tab: DashboardTab, arcAvailable = ARC_WORKSPACE_AVAILABLE): DashboardTab {
  if (arcAvailable || workspaceForTab(tab) === "connect") return tab;
  if (tab === "agent-apps") return "apps";
  if (tab === "agent-devices") return "devices";
  if (tab === "agent-settings") return "settings";
  return "overview";
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
  if (tab === "agent-goals") return !isAgentRoutineAutomation(task);
  if (tab === "agent-activity") return true;
  if (tab === "agent-routines") return isAgentRoutineAutomation(task);
  return true;
}
