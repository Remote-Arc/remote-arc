import { recordProductView } from '../product-events.js';
import type { ArcMention } from '../arc-skill-mentions.js';
import { DASHBOARD_PATHS, dashboardTabFromPath, workspaceForTab, availableDashboardTab, isVisibleInWorkspace, type DashboardTab } from "../dashboard-workspaces.js";
import { taskNeedsAttention } from "../dashboard-task-view.js";
import { useEffect, useMemo, useState } from "react";
import { useI18n } from "../i18n.js";
import { type AuditEvent, type Automation, type Device, type MonitorState, type ProductStatus, type User } from "../app-types.js";
import { MCP_ENDPOINT } from "../app-config.js";
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
  const arcAvailable = user.arcAvailable===true;
  const hasPlus = user.plan === "plus" || user.isAdmin;
  const [showAdd, setShowAdd] = useState(false);
  const [arcNavigationOpen,setArcNavigationOpen]=useState(false);
  const [arcEntry,setArcEntry] = useState<{prompt?:string;sessionId?:string;references?:ArcMention[];version:number}>(()=>({version:0,prompt:new URLSearchParams(location.search).get('prompt')?.slice(0,6000)||undefined,sessionId:new URLSearchParams(location.search).get('session')?.slice(0,160)||undefined}));
  const [deviceQuery, setDeviceQuery] = useState("");
  const [deviceFilter, setDeviceFilter] = useState<"all" | "online" | "offline">("all");
  const [monitorState, setMonitorState] = useState<MonitorState | null>(null);
  const [monitorLoading, setMonitorLoading] = useState(false);
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [automationLoadError, setAutomationLoadError] = useState(false);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem('remotearc.sidebar.collapsed') === '1'; } catch { return false; }
  });

  const [active, setActive] = useState<DashboardTab>(() => availableDashboardTab(dashboardTabFromPath(location.pathname),arcAvailable));
  const dialogs = useDashboardDialogs({ tr });
  const { showNotice, askConfirm, askPrompt } = dialogs;
  const security = useDashboardSecurity({ active, tr, refreshAll, showNotice, askConfirm });
  const deviceActions = useDeviceActions({ devices, tr, refreshAll, showNotice, askConfirm, askPrompt });

  useEffect(() => {
    const syncRoute = () => {
      const requested = dashboardTabFromPath(location.pathname);
      const resolved = availableDashboardTab(requested,arcAvailable);
      if (requested !== resolved) history.replaceState({}, '', DASHBOARD_PATHS[resolved]);
      setActive(resolved);
    };
    syncRoute();
    window.addEventListener("popstate", syncRoute);
    return () => window.removeEventListener("popstate", syncRoute);
  }, [arcAvailable]);

  const command = "npx remotelink";
  const safeCommand = command + " --safe";
  const mcpEndpoint = MCP_ENDPOINT;
  const deviceNameById = useMemo(() => new Map(devices.map((device) => [device.id, device.name])), [devices]);

  const filteredDevices = useMemo(() => {
    const query = deviceQuery.trim().toLowerCase();
    return devices
      .filter((device) => deviceFilter === "all" || device.status === deviceFilter)
      .filter((device) => !query || [device.name, device.hostname, device.platform, device.arch, device.id].some((value) => String(value || "").toLowerCase().includes(query)))
      .sort((a, b) => Number(b.status === "online") - Number(a.status === "online"));
  }, [devices, deviceFilter, deviceQuery]);

  const usage = status?.usage;
  const usagePct = usage?.limit ? Math.min(100, (usage.used / usage.limit) * 100) : 0;

  const usageLimitLabel = usage?.unlimited
    ? tr("Unlimited", "无限")
    : (usage?.limit ?? 10000).toLocaleString();

  async function signOutSafely() {
    try { await signOut(); }
    catch { await showNotice(tr("Could not sign out", "暂时无法退出登录"), tr("Your sign-out could not be confirmed. Check your connection and try again.", "尚未确认退出登录，请检查网络连接后重试。")); }
  }

  async function refreshMonitor() {
    if (!user.isAdmin) return;
    setMonitorLoading(true);
    try {
      const response = await fetch("/api/monitor");
      if (!response.ok) return;
      setMonitorState(await response.json() as MonitorState);
    } finally {
      setMonitorLoading(false);
    }
  }

  useEffect(() => {
    if (active !== "monitor" || !user.isAdmin) return;
    void refreshMonitor();
  }, [active, user.isAdmin]);

  async function refreshAutomations() {
    try {
      const response = await fetch("/api/automations");
      if (!response.ok) throw new Error("Tasks unavailable");
      const payload = await response.json() as { automations?: Automation[] };
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
    tab = availableDashboardTab(tab,arcAvailable);
    const path = DASHBOARD_PATHS[tab];
    if (location.pathname !== path) {history.pushState({}, "", path);recordProductView();}
    setActive(tab);
  }

  function toggleSidebar() {
    const next = !sidebarCollapsed;
    setSidebarCollapsed(next);
    try { localStorage.setItem('remotearc.sidebar.collapsed', next ? '1' : '0'); } catch {}
  }

  function openArcChat(prompt?:string,sessionId?:string,references?:ArcMention[]) {
    if (!arcAvailable) { navigateTab('connect'); return; }
    setArcEntry(current=>({prompt,sessionId,references,version:current.version+1}));
    navigateTab('agent-chat');
    const url=new URL(location.href);if(sessionId)url.searchParams.set('session',sessionId);else url.searchParams.delete('session');history.replaceState(history.state,'',url);
  }

  const eventLabel = (event: AuditEvent) => {
    if (event.event_type === "device.paired") return tr("Device paired", "设备已配对");
    if (event.event_type === "device.revoked") return tr("Device revoked", "设备已撤销");
    if (event.event_type === "device.renamed") return tr("Device renamed", "设备已重命名");
    if (event.event_type === "device.policy_updated") return tr("Device safety policy updated", "设备安全策略已更新");
    if (event.event_type === "device.undo_restored") return tr("Local change restored", "本机修改已恢复");
    if (event.event_type === "mcp.tool_call") return "MCP · " + (event.tool_name || "tool");
    if (event.event_type === "security.mcp_paused") return tr("Remote MCP paused", "Remote MCP 已暂停");
    if (event.event_type === "security.mcp_resumed") return tr("Remote MCP resumed", "Remote MCP 已恢复");
    if (event.event_type === "security.oauth_grant_revoked") return tr("AI access revoked", "AI 访问已撤销");
    return event.event_type;
  };

  const automationAttentionCount = automations.filter(task => isVisibleInWorkspace(task, "automations") && taskNeedsAttention(task)).length;
  const hasAttention = automationAttentionCount > 0 || devices.some((device) => device.status === "offline") || usagePct >= 80;
  const workspace = workspaceForTab(active);

  const navItems: Array<[DashboardTab, string]> = workspace === "agent" ? [
    ["agent-chat", tr("Chat", "对话")],
    ["agent-goals", tr("Tasks", "任务")],
    ["agent-activity", tr("Activity", "活动")],
    ["agent-apps", tr("Apps", "应用")],
    ["agent-devices", tr("Devices", "设备")],
    ["agent-skills", tr("Skills", "技能")],
  ] : [
    ["overview", tr("Overview", "概览")],
    ["devices", tr("Devices", "设备")],
    ["automations", tr("Tasks", "任务")],
    ["apps", tr("Apps", "应用")],
    ["connect", tr("AI clients", "AI 客户端")],
    ["security", tr("Security & access", "安全与授权")],
  ];

  const mobileNavItems = navItems.filter(([id]) => !["agent-activity", "agent-skills", "agent-devices"].includes(id)).slice(0,workspace === "connect" ? 5 : 4);

  if (workspace === "connect") mobileNavItems.push(["security", tr("Security", "安全")]);

  return {
    user, devices, status, refreshAll,
    ...dialogs, ...security, ...deviceActions,
    tr, locale, setLocale, arcAvailable, hasPlus, showAdd, setShowAdd, arcNavigationOpen, setArcNavigationOpen, arcEntry, setArcEntry, deviceQuery, setDeviceQuery, deviceFilter, setDeviceFilter, monitorState, setMonitorState, monitorLoading, setMonitorLoading, automations, setAutomations, automationLoadError, setAutomationLoadError, sidebarCollapsed, setSidebarCollapsed, active, setActive, command, safeCommand, mcpEndpoint, deviceNameById, filteredDevices, usage, usagePct, usageLimitLabel, signOutSafely, refreshMonitor, refreshAutomations, navigateTab, toggleSidebar, openArcChat, eventLabel, automationAttentionCount, hasAttention, workspace, navItems, mobileNavItems,
  };
}

export type DashboardModel = ReturnType<typeof useDashboardModel>;
