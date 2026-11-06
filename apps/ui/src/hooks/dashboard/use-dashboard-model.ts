import { canonicalErrorEnvelope } from "../../../../../packages/protocol/src/error-codes.js";
import { recordProductView } from "../../lib/product-events.js";
import type { ArcMention } from "../arc/use-arc-skill-mentions.js";
import {
  DASHBOARD_PATHS,
  dashboardTabFromPath,
  workspaceForTab,
  availableDashboardTab,
  isVisibleInWorkspace,
  type DashboardTab,
} from "../../lib/dashboard-workspaces.js";
import { taskNeedsAttention } from "../../features/tasks/dashboard-task-view.js";
import { useEffect, useMemo, useState } from "react";
import { useI18n, useMessages } from "../use-i18n.js";
import { should } from "../../lib/ui-access.js";
import { usePermission } from "../use-permission.js";
import {
  type AuditEvent,
  type Automation,
  type Device,
  type ProductStatus,
  type User,
} from "../../types/app-types.js";
import { MCP_ENDPOINT } from "../../config/app-config.js";
import { useDashboardDialogs } from "./use-dashboard-dialogs.js";
import { useDashboardSecurity } from "./use-dashboard-security.js";
import { useDeviceActions } from "./use-device-actions.js";

export type DashboardProps = {
  user: User;
  devices: Device[];
  status: ProductStatus | null;
  refreshAll: () => Promise<void>;
  signOut: () => Promise<void>;
};

// All Dashboard state and actions. Views receive this model and read what they need.
export function useDashboardModel({ user, devices, status, refreshAll, signOut }: DashboardProps) {
  const { tr, locale, setLocale } = useI18n();
  const labels = useMessages("dashboard");
  const arcAvailable = should("arcAvailable", user);
  const { can } = usePermission(user);
  const hasPlus = can("billing:plus");
  const [showAdd, setShowAdd] = useState(false);
  const [arcNavigationOpen, setArcNavigationOpen] = useState(false);
  const [arcEntry, setArcEntry] = useState<{
    prompt?: string;
    sessionId?: string;
    references?: ArcMention[];
    version: number;
  }>(() => ({
    version: 0,
    prompt: new URLSearchParams(location.search).get("prompt")?.slice(0, 6000) || undefined,
    sessionId: new URLSearchParams(location.search).get("session")?.slice(0, 160) || undefined,
  }));
  const [deviceQuery, setDeviceQuery] = useState("");
  const [deviceFilter, setDeviceFilter] = useState<"all" | "online" | "offline">("all");
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [automationLoadError, setAutomationLoadError] = useState(false);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem("remotearc.sidebar.collapsed") === "1";
    } catch {
      return false;
    }
  });

  const [active, setActive] = useState<DashboardTab>(() =>
    availableDashboardTab(dashboardTabFromPath(location.pathname), arcAvailable),
  );
  const dialogs = useDashboardDialogs({ tr });
  const { showNotice, askConfirm, askPrompt } = dialogs;
  const security = useDashboardSecurity({ active, tr, refreshAll, showNotice, askConfirm });
  const deviceActions = useDeviceActions({
    devices,
    tr,
    refreshAll,
    showNotice,
    askConfirm,
    askPrompt,
  });

  useEffect(() => {
    const syncRoute = () => {
      const requested = dashboardTabFromPath(location.pathname);
      const resolved = availableDashboardTab(requested, arcAvailable);
      if (requested !== resolved) history.replaceState({}, "", DASHBOARD_PATHS[resolved]);
      setActive(resolved);
    };
    syncRoute();
    window.addEventListener("popstate", syncRoute);
    return () => window.removeEventListener("popstate", syncRoute);
  }, [arcAvailable]);

  const command = "npx remotelink";
  const safeCommand = command + " --safe";
  const mcpEndpoint = MCP_ENDPOINT;
  const deviceNameById = useMemo(
    () => new Map(devices.map((device) => [device.id, device.name])),
    [devices],
  );

  const filteredDevices = useMemo(() => {
    const query = deviceQuery.trim().toLowerCase();
    return devices
      .filter((device) => deviceFilter === "all" || device.status === deviceFilter)
      .filter(
        (device) =>
          !query ||
          [device.name, device.hostname, device.platform, device.arch, device.id].some((value) =>
            String(value || "")
              .toLowerCase()
              .includes(query),
          ),
      )
      .sort((a, b) => Number(b.status === "online") - Number(a.status === "online"));
  }, [devices, deviceFilter, deviceQuery]);

  const usage = status?.usage;
  const usagePct = usage?.limit ? Math.min(100, (usage.used / usage.limit) * 100) : 0;

  const usageLimitLabel = usage?.unlimited
    ? tr("hooks.dashboard.useDashboardModel.unlimited")
    : (usage?.limit ?? 10000).toLocaleString();

  async function signOutSafely() {
    try {
      await signOut();
    } catch {
      await showNotice(
        tr("hooks.dashboard.useDashboardModel.couldNotSignOut"),
        tr("hooks.dashboard.useDashboardModel.yourSignOutCouldNotBe"),
      );
    }
  }

  async function refreshAutomations() {
    try {
      const response = await fetch("/api/automations");
      if (!response.ok) throw new Error("Tasks unavailable");
      const payload = (await response.json().then(canonicalErrorEnvelope)) as {
        automations?: Automation[];
      };
      setAutomations(Array.isArray(payload.automations) ? payload.automations : []);
      setAutomationLoadError(false);
    } catch {
      setAutomationLoadError(true);
    }
  }

  useEffect(() => {
    if (active !== "overview" && workspaceForTab(active) !== "agent") return;
    void refreshAutomations();
    const timer = window.setInterval(() => void refreshAutomations(), 15_000);
    return () => window.clearInterval(timer);
  }, [active]);

  function navigateTab(tab: DashboardTab) {
    tab = availableDashboardTab(tab, arcAvailable);
    const path = DASHBOARD_PATHS[tab];
    if (location.pathname !== path) {
      history.pushState({}, "", path);
      recordProductView();
    }
    setActive(tab);
  }

  function toggleSidebar() {
    const next = !sidebarCollapsed;
    setSidebarCollapsed(next);
    try {
      localStorage.setItem("remotearc.sidebar.collapsed", next ? "1" : "0");
    } catch {}
  }

  function openArcChat(prompt?: string, sessionId?: string, references?: ArcMention[]) {
    if (!arcAvailable) {
      navigateTab("connect");
      return;
    }
    setArcEntry((current) => ({ prompt, sessionId, references, version: current.version + 1 }));
    navigateTab("agent-chat");
    const url = new URL(location.href);
    if (sessionId) url.searchParams.set("session", sessionId);
    else url.searchParams.delete("session");
    history.replaceState(history.state, "", url);
  }

  const eventLabel = (event: AuditEvent) => {
    if (event.event_type === "device.paired")
      return tr("hooks.dashboard.useDashboardModel.devicePaired");
    if (event.event_type === "device.revoked")
      return tr("hooks.dashboard.useDashboardModel.deviceRevoked");
    if (event.event_type === "device.renamed")
      return tr("hooks.dashboard.useDashboardModel.deviceRenamed");
    if (event.event_type === "device.policy_updated")
      return tr("hooks.dashboard.useDashboardModel.deviceSafetyPolicyUpdated");
    if (event.event_type === "device.undo_restored")
      return tr("hooks.dashboard.useDashboardModel.localChangeRestored");
    if (event.event_type === "mcp.tool_call") return "MCP · " + (event.tool_name || "tool");
    if (event.event_type === "security.mcp_paused")
      return tr("hooks.dashboard.useDashboardModel.remoteMcpPaused");
    if (event.event_type === "security.mcp_resumed")
      return tr("hooks.dashboard.useDashboardModel.remoteMcpResumed");
    if (event.event_type === "security.oauth_grant_revoked")
      return tr("hooks.dashboard.useDashboardModel.aiAccessRevoked");
    return event.event_type;
  };

  const automationAttentionCount = automations.filter(
    (task) => isVisibleInWorkspace(task, "automations") && taskNeedsAttention(task),
  ).length;
  const hasAttention =
    automationAttentionCount > 0 ||
    devices.some((device) => device.status === "offline") ||
    usagePct >= 80;
  const workspace = workspaceForTab(active);

  const navItems: Array<[DashboardTab, string]> =
    workspace === "agent"
      ? [
          ["agent-chat", labels.chat],
          ["agent-goals", labels.tasks],
          ["agent-activity", labels.activity],
          ["agent-apps", labels.apps],
          ["agent-devices", labels.devices],
          ["agent-skills", labels.skills],
        ]
      : [
          ["overview", labels.overview],
          ["devices", labels.devices],
          ["automations", labels.tasks],
          ["apps", labels.apps],
          ["connect", labels.aiClients],
          ["security", labels.securityAccess],
        ];

  const mobileNavItems = navItems
    .filter(([id]) => !["agent-activity", "agent-skills", "agent-devices"].includes(id))
    .slice(0, workspace === "connect" ? 5 : 4);

  if (workspace === "connect") mobileNavItems.push(["security", labels.security]);

  return {
    user,
    devices,
    status,
    refreshAll,
    ...dialogs,
    ...security,
    ...deviceActions,
    tr,
    locale,
    setLocale,
    arcAvailable,
    can,
    hasPlus,
    showAdd,
    setShowAdd,
    arcNavigationOpen,
    setArcNavigationOpen,
    arcEntry,
    setArcEntry,
    deviceQuery,
    setDeviceQuery,
    deviceFilter,
    setDeviceFilter,
    automations,
    setAutomations,
    automationLoadError,
    setAutomationLoadError,
    sidebarCollapsed,
    setSidebarCollapsed,
    active,
    setActive,
    command,
    safeCommand,
    mcpEndpoint,
    deviceNameById,
    filteredDevices,
    usage,
    usagePct,
    usageLimitLabel,
    signOutSafely,
    refreshAutomations,
    navigateTab,
    toggleSidebar,
    openArcChat,
    eventLabel,
    automationAttentionCount,
    hasAttention,
    workspace,
    navItems,
    mobileNavItems,
  };
}

export type DashboardModel = ReturnType<typeof useDashboardModel>;
