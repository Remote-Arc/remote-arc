import { BrowserAuthSetting } from "./browser-auth-setting.js";
import { recordProductView } from './product-events.js';
import { DeviceBrowserSessions, RunnerAttentionList, RunnerAttentionSetting } from "./runner-view.js";
import { BROWSER_RUNNER_TOOLS, browserRunnerEnabled, isBrowserRunnerTool, toggledDeviceTools } from "./device-tools.js";
import type { ArcMention } from './arc-skill-mentions.js';
import { WorkspaceLoading } from './workspace-loading.js';
import { AppsManager } from "./apps-manager.js";
import { DeviceFleetOverview, DeviceCapacity } from "./device-fleet-overview.js";
import { OverviewGreeting } from "./overview-greeting.js";
import { ArcWorkWorkspace } from "./arc-workspace.js";
import { ConnectTasks } from "./connect-tasks.js";
import { ProductIcon, type ProductIconName } from "./product-icon.js";
import { WorkspacePicker } from "./workspace-picker.js";
import { DASHBOARD_PATHS, dashboardTabFromPath, workspaceForTab, availableDashboardTab, isVisibleInWorkspace, type DashboardTab } from "./dashboard-workspaces.js";
import { CHATGPT_PLUGIN_URL } from "./client-links.js";
import { taskNeedsAgent, taskNeedsAttention } from "./dashboard-task-view.js";
import { newPlannedDraft, buildPlannedContract } from "./planned-goal-form.js";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "./i18n.js";
import { localizedWebsiteHref } from "./marketing-paths.js";
import { DashboardSettings } from "./dashboard-settings.js";
import { AdminOperations } from "./admin-operations.js";
import { UsageConversionBanner } from "./usage-conversion.js";
import { UI_PREVIEW } from "./preview.js";
import type { SecurityGrant, SecurityState } from "@remotearc/protocol";
import { parsePendingApprovals, parsePersistentApprovals, parseSecurityState, type PendingApproval, type PersistentApproval } from "./security-state.js";
import { SecurityAuthorizations } from "./security-authorizations.js";
import { ApprovalRequest, PersistentPermissions, type ApprovalChoice } from "./security-approvals.js";
import { waitForAgentOffline, waitForRecoveryState } from "./background-recovery.js";
import { isOlderRelease, goUpdateCommands } from "./agent-update-guide.js";
import { type AuditEvent, type Automation, type AutomationCreateKind, type AutomationDraft, type AutomationStatus, type DashboardDialog, type Device, type DeviceExecutionLog, type DeviceTaskPermissions, type DirectoryBrowser, type ManagedProcess, type MonitorState, type ProductStatus, type UndoAction, type User } from "./app-types.js";
import { CLAUDE_CONNECTORS_URL, MARKETING_ORIGIN, MCP_ENDPOINT, cursorMcpInstallUrl } from "./app-config.js";
import { DEVELOPER_DEVICE_TOOLS, DEVICE_TOOL_CATALOG, type DeviceAccessPreset, SAFE_DEVICE_TOOLS, deviceAccessPreset, legacyTaskPermissions, platformLabel } from "./device-presets.js";
import { Brand, CopyButton, HelpTip, ThemeSwitcher, aiClients } from "./public-layout.js";

declare const __REMOTEARC_CLI_VERSION__: string;
const LATEST_AGENT_VERSION = __REMOTEARC_CLI_VERSION__;
const ArcNativeChat = React.lazy(() => import("./arc-native-chat.js").then(module => ({default:module.ArcNativeChat})));
const ArcTeammates = React.lazy(() => import('./arc-teams-page.js').then(module=>({default:module.ArcTeamsPage})));
const ArcSkills = React.lazy(() => import("./arc-skills.js").then(module => ({default:module.ArcSkills})));
function DashboardNavIcon({ tab }: { tab: DashboardTab }) {
 const names: Partial<Record<DashboardTab,ProductIconName>> = {overview:'overview',devices:'device','agent-devices':'device',apps:'apps','agent-apps':'apps',connect:'link',security:'shield',monitor:'activity','agent-chat':'chat','agent-goals':'tasks','agent-routines':'routine','agent-skills':'spark','agent-activity':'activity',automations:'tasks'};
 return <ProductIcon name={names[tab] || 'settings'}/>;
}
const timeAgo = (value?: string | null) => {
  if (!value) return "—";
  const delta = Math.max(0, Date.now() - new Date(value).getTime());
  if (delta < 60_000) return "now";
  if (delta < 3_600_000) return Math.floor(delta / 60_000) + "m";
  if (delta < 86_400_000) return Math.floor(delta / 3_600_000) + "h";
  return Math.floor(delta / 86_400_000) + "d";
};
function Metric({ label, value, detail, good = false }: { label: string; value: React.ReactNode; detail: string; good?: boolean }) {
  return (
    <article className="metricCard">
      <div className="metricTop"><span>{label}</span><i className={"statusDot " + (good ? "good" : "")}/></div>
      <strong>{value}</strong><small>{detail}</small>
    </article>
  );
}
export function Dashboard({
  user,
  devices,
  status,
  refreshAll,
  signOut,
}: {
  user: User;
  devices: Device[];
  status: ProductStatus | null;
  refreshAll: () => Promise<void>;
  signOut: () => Promise<void>;
}) {
  const { tr, locale, setLocale } = useI18n();
  const arcAvailable = user.arcAvailable===true;
  const hasPlus = user.plan === "plus" || user.isAdmin;
  const [showAdd, setShowAdd] = useState(false);
  const [arcNavigationOpen,setArcNavigationOpen]=useState(false);
  const [arcEntry,setArcEntry] = useState<{prompt?:string;sessionId?:string;references?:ArcMention[];version:number}>(()=>({version:0,prompt:new URLSearchParams(location.search).get('prompt')?.slice(0,6000)||undefined,sessionId:new URLSearchParams(location.search).get('session')?.slice(0,160)||undefined}));
  const [deviceQuery, setDeviceQuery] = useState("");
  const [deviceFilter, setDeviceFilter] = useState<"all" | "online" | "offline">("all");
  const [backgroundUpdatingId, setBackgroundUpdatingId] = useState<string | null>(null);
  const [backgroundTargetEnabled, setBackgroundTargetEnabled] = useState<boolean | null>(null);
  const [backgroundPhase, setBackgroundPhase] = useState<"applying" | "verifying" | "stopping">("applying");
  const backgroundMutationInFlight = useRef(false);
  const runtimeMutationInFlight = useRef(false);
  const [runtimeUpdatingId, setRuntimeUpdatingId] = useState<string | null>(null);
  const [runtimeTargetPaused, setRuntimeTargetPaused] = useState<boolean | null>(null);
  const [managedDeviceId, setManagedDeviceId] = useState<string | null>(null);
  const [devicePanel, setDevicePanel] = useState<"access" | "tasks" | "activity">("access");
  const [securityState, setSecurityState] = useState<SecurityState | null>(null);
  const [securityError, setSecurityError] = useState(false);
  const securityRefreshRevision = useRef(0);
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([]);
  const [persistentApprovals, setPersistentApprovals] = useState<PersistentApproval[]>([]);
  const [securityBusy, setSecurityBusy] = useState(false);
  const [monitorState, setMonitorState] = useState<MonitorState | null>(null);
  const [monitorLoading, setMonitorLoading] = useState(false);
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [taskScheduler, setTaskScheduler] = useState<{ state: string; last_success_at: string | null; overdue_count: number } | null>(null);
  const [taskCapabilities, setTaskCapabilities] = useState<{ hosted_planner: boolean; github_merge: boolean } | null>(null);
  const [createdTask, setCreatedTask] = useState<Automation | null>(null);
  const [createdTaskOutcome, setCreatedTaskOutcome] = useState<{ title: string; detail: string } | null>(null);
  const [automationLoading, setAutomationLoading] = useState(false);
  const [automationLoadError, setAutomationLoadError] = useState(false);
  const [automationQuery, setAutomationQuery] = useState(() => new URLSearchParams(location.search).get("task") || "");
  const [automationFilter, setAutomationFilter] = useState<"all" | "active" | "attention" | "finished">("all");
  const [deviceTaskBusy, setDeviceTaskBusy] = useState<string | null>(null);
  const [sensitivePolicyBusyId, setSensitivePolicyBusyId] = useState<string | null>(null);
  const [automationBusy, setAutomationBusy] = useState<string | null>(null);
  const [showAutomationCreate, setShowAutomationCreate] = useState(false);
  const [createdWebhook, setCreatedWebhook] = useState<string | null>(null);
  const [plannedDraft, setPlannedDraft] = useState(newPlannedDraft);
  const [automationDraft, setAutomationDraft] = useState<AutomationDraft>({
    name: "",
    kind: "long_task",
    trigger_mode: "now",
    command_confirmed: false,
    device_id: "",
    command: "",
    cwd: "",
    goal_command: "",
    agent_objective: "",
    agent_success_criteria: "",
    agent_workspace: "",
    agent_controller: "hosted",
    agent_start_at: "",
    agent_repeat_minutes: "",
    keep_awake: false,
    agent_verify_command: "",
    agent_max_iterations: "720",
    agent_allowed_tools: ["list_directory", "read_file", "get_file_info", "edit_block", "start_process"],
    interval_minutes: "1",
    schedule_minutes: "60",
    max_runs: "",
    condition_source: "github",
    condition_event: "workflow_run",
    condition_match: '{"action":"completed","workflow_run.conclusion":"success"}',
    condition_action: "device_command",
    github_owner: "yaohuangguan",
    github_repo: "remote-arc",
    github_pr: "",
    github_merge_method: "merge",
  });
  const [undoByDevice, setUndoByDevice] = useState<Record<string, UndoAction[]>>({});
  const [undoLoading, setUndoLoading] = useState<string | null>(null);
  const [undoErrors, setUndoErrors] = useState<Record<string, string>>({});
  const [processesByDevice, setProcessesByDevice] = useState<Record<string, ManagedProcess[]>>({});
  const [processLoading, setProcessLoading] = useState<string | null>(null);
  const [processErrors, setProcessErrors] = useState<Record<string, string>>({});
  const [executionLogsByDevice, setExecutionLogsByDevice] = useState<Record<string, DeviceExecutionLog>>({});
  const [executionLogLoading, setExecutionLogLoading] = useState<string | null>(null);
  const [executionLogErrors, setExecutionLogErrors] = useState<Record<string, string>>({});
  const [directoryPicker, setDirectoryPicker] = useState<{
    device: Device;
    browser: DirectoryBrowser | null;
    loading: boolean;
    error: string;
  } | null>(null);
  const [dialog, setDialog] = useState<DashboardDialog | null>(null);
  const [dialogValue, setDialogValue] = useState("");
  const dialogResolver = useRef<((value: boolean | string | null) => void) | null>(null);
  const dialogElement = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!dialog || !dialogElement.current) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const host = dialogElement.current;
    const controls = () => Array.from(host.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]')).filter(item => item.getClientRects().length);
    (dialog.kind === 'prompt' ? host.querySelector<HTMLInputElement>('input') : controls()[0])?.focus();
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); settleDialog(dialog.kind === 'notice' ? true : null); }
      if (event.key !== 'Tab') return;
      const items = controls(), first = items[0], last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); if (previous?.isConnected) previous.focus(); };
  }, [dialog]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem('remotearc.sidebar.collapsed') === '1'; } catch { return false; }
  });
  const [active, setActive] = useState<DashboardTab>(() => availableDashboardTab(dashboardTabFromPath(location.pathname),arcAvailable));
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

  function settleDialog(value: boolean | string | null) {
    const resolve = dialogResolver.current;
    dialogResolver.current = null;
    setDialog(null);
    if (resolve) resolve(value);
  }

  function showNotice(title: string, message: string) {
    return new Promise<void>((resolve) => {
      dialogResolver.current = () => resolve();
      setDialogValue("");
      setDialog({
        kind: "notice",
        title,
        message,
        confirmLabel: tr("Got it", "知道了"),
      });
    });
  }

  async function signOutSafely() {
    try { await signOut(); }
    catch { await showNotice(tr("Could not sign out", "暂时无法退出登录"), tr("Your sign-out could not be confirmed. Check your connection and try again.", "尚未确认退出登录，请检查网络连接后重试。")); }
  }

  function askConfirm(
    title: string,
    message: string,
    confirmLabel = tr("Continue", "继续"),
    tone: "default" | "danger" = "default",
  ) {
    return new Promise<boolean>((resolve) => {
      dialogResolver.current = (value) => resolve(value === true);
      setDialogValue("");
      setDialog({
        kind: "confirm",
        title,
        message,
        confirmLabel,
        cancelLabel: tr("Cancel", "取消"),
        tone,
      });
    });
  }

  function askPrompt(
    title: string,
    message: string,
    initialValue = "",
    placeholder = "",
    confirmLabel = tr("Save", "保存"),
  ) {
    return new Promise<string | null>((resolve) => {
      dialogResolver.current = (value) =>
        resolve(typeof value === "string" ? value : null);
      setDialogValue(initialValue);
      setDialog({
        kind: "prompt",
        title,
        message,
        confirmLabel,
        cancelLabel: tr("Cancel", "取消"),
        placeholder,
        initialValue,
      });
    });
  }

  async function refreshSecurity() {
    const revision = ++securityRefreshRevision.current;
    try {
      const [securityResponse, approvalsResponse, permissionsResponse] = await Promise.all([
        fetch("/api/security"), fetch("/api/approvals"), fetch("/api/approvals/permissions"),
      ]);
      if (!securityResponse.ok || !approvalsResponse.ok || !permissionsResponse.ok) throw new Error("Security data unavailable");
      const [security, approvals, permissions] = await Promise.all([
        securityResponse.json().then(parseSecurityState), approvalsResponse.json().then(parsePendingApprovals), permissionsResponse.json().then(parsePersistentApprovals),
      ]);
      if (!security || !approvals || !permissions) throw new Error("Invalid security response");
      if (revision !== securityRefreshRevision.current) return;
      setSecurityState(security);
      setPendingApprovals(approvals);
      setPersistentApprovals(permissions);
      setSecurityError(false);
    } catch {
      if (revision !== securityRefreshRevision.current) return;
      setSecurityState(null);
      setPendingApprovals([]);
      setPersistentApprovals([]);
      setSecurityError(true);
    }
  }

  async function decidePendingApproval(
    approval: PendingApproval,
    decision: ApprovalChoice,
  ) {
    if (UI_PREVIEW || !securityState || securityBusy) return;
    setSecurityBusy(true);
    try {
      const response = await fetch(
        "/api/approvals/" + encodeURIComponent(approval.id) + "/decision",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ decision }),
        },
      );
      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { error?: string };
        await showNotice(
          tr("Approval was not updated", "审批未更新"),
          payload.error || tr("Please refresh and try again.", "请刷新后重试。"),
        );
        return;
      }
      await refreshSecurity();
      await refreshAll();
    } catch {
      await showNotice(tr("Approval was not updated", "审批未更新"), tr("Check your connection and try again.", "请检查网络后重试。"));
    } finally {
      setSecurityBusy(false);
    }
  }

  async function revokeSavedApproval(permission: PersistentApproval) {
    if (UI_PREVIEW || !securityState || securityBusy) return;
    setSecurityBusy(true);
    try {
      const response = await fetch("/api/approvals/" + encodeURIComponent(permission.id) + "/revoke", { method: "POST" });
      if (!response.ok) throw new Error("revoke failed");
      await refreshSecurity();
    } catch {
      await showNotice(tr("Permission was not revoked", "权限未撤销"), tr("Refresh and try again.", "请刷新后重试。"));
    } finally { setSecurityBusy(false); }
  }

  // Approval prompts stay responsive, while the expensive OAuth grants summary
  // is loaded on entry / explicit action and refreshed only once per minute.
  async function refreshPendingApprovals() {
    try {
      const response = await fetch("/api/approvals");
      if (!response.ok) return;
      const pending = parsePendingApprovals(await response.json());
      if (pending) setPendingApprovals(pending);
    } catch { /* Retain the last known state until the next poll. */ }
  }

  useEffect(() => {
    if (active !== "security") return;
    void refreshSecurity();
    const approvalsTimer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refreshPendingApprovals();
    }, 5_000);
    const securityTimer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refreshSecurity();
    }, 60_000);
    return () => {
      window.clearInterval(approvalsTimer);
      window.clearInterval(securityTimer);
    };
  }, [active]);

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
    setAutomationLoading(true);
    try {
      const response = await fetch("/api/automations");
      if (!response.ok) throw new Error("Tasks unavailable");
      const payload = await response.json() as { automations?: Automation[]; capabilities?: { hosted_planner: boolean; github_merge: boolean }; scheduler?: { state: string; last_success_at: string | null; overdue_count: number } };
      setAutomations(Array.isArray(payload.automations) ? payload.automations : []);
      setTaskCapabilities(payload.capabilities || null);
      setTaskScheduler(payload.scheduler || null);
      setAutomationLoadError(false);
    } catch {
      setAutomationLoadError(true);
    } finally {
      setAutomationLoading(false);
    }
  }

  useEffect(() => {
    if (active !== "overview" && workspaceForTab(active) !== "agent") return;
    void refreshAutomations();
    const timer = window.setInterval(() => void refreshAutomations(), 15_000);
    return () => window.clearInterval(timer);
  }, [active]);

  useEffect(() => {
    if (automationDraft.device_id || !devices.length) return;
    const preferred = devices.find((device) => device.status === "online") || devices[0];
    if (preferred) {
      setAutomationDraft((current) => ({ ...current, device_id: preferred.id }));
    }
  }, [devices, automationDraft.device_id]);

  async function createDashboardAutomation() {
    if (UI_PREVIEW) return;
    const name = automationDraft.name.trim() || (automationDraft.kind === "agent_goal" ? automationDraft.agent_objective.trim().slice(0, 120) : "");
    const command = automationDraft.command.trim();
    const isAgentGoal = automationDraft.kind === "agent_goal";
    const isGitHubMerge =
      automationDraft.kind === "condition_watch" &&
      automationDraft.condition_action === "github_merge";

    if (!name) {
      await showNotice(
        tr("Missing automation name", "缺少自动化名称"),
        tr("Give this persistent task a name.", "请为这条持久任务填写名称。"),
      );
      return;
    }
    if (
      isAgentGoal &&
      (!automationDraft.device_id ||
        !automationDraft.agent_objective.trim() ||
        !automationDraft.agent_success_criteria.trim() ||
        automationDraft.agent_allowed_tools.length === 0)
    ) {
      await showNotice(
        tr("Agent Goal details required", "Agent Goal 信息不完整"),
        tr(
          "Choose a device, provide the objective and success criteria, and explicitly select at least one Agent Goal tool.",
          "请选择设备、填写目标与成功标准，并明确选择至少一个 Agent Goal Tool。",
        ),
      );
      return;
    }
    if (
      isGitHubMerge &&
      (!automationDraft.github_owner.trim() ||
        !automationDraft.github_repo.trim() ||
        !/^\d+$/.test(automationDraft.github_pr.trim()))
    ) {
      await showNotice(
        tr("GitHub PR details required", "需要 GitHub PR 信息"),
        tr(
          "Repository owner, repository name and pull request number are required.",
          "需要填写仓库 Owner、仓库名和 Pull Request 编号。",
        ),
      );
      return;
    }
    if (!isAgentGoal && !isGitHubMerge && (!command || !automationDraft.device_id || !automationDraft.cwd.trim())) {
      await showNotice(
        tr("Missing automation details", "自动化信息不完整"),
        tr("Device, executable command and an approved working directory are required.", "需要设备、可执行命令以及已批准的工作目录。"),
      );
      return;
    }
    if (isAgentGoal && automationDraft.agent_allowed_tools.includes("start_process") && !automationDraft.agent_workspace.trim()) {
      await showNotice(tr("Workspace required", "需要工作区"), tr("Terminal access needs a working directory inside this computer's approved locations.", "终端访问需要填写这台电脑已批准位置中的工作目录。")); return;
    }

    if (!isAgentGoal && !isGitHubMerge && !automationDraft.command_confirmed) {
      await showNotice(tr("Confirm executable instructions", "请确认可执行指令"), tr("This field runs shell code verbatim. Use Complete a goal for natural-language requests.", "这里会原样运行 shell 代码。自然语言需求请选择完成一个目标。"));
      return;
    }
    let plannedContract: ReturnType<typeof buildPlannedContract> | undefined;
    if (isAgentGoal) {
      try { plannedContract = buildPlannedContract(plannedDraft.enabled ? plannedDraft : { ...newPlannedDraft(), maxMinutes: plannedDraft.maxMinutes }); }
      catch (error) {
        await showNotice(tr("Plan details required", "计划信息不完整"), String(error));
        return;
      }
    }
    const intervalMinutes = Number(automationDraft.interval_minutes || "5");
    const scheduleMinutes = Number(automationDraft.schedule_minutes || "60");
    const maxRunsRaw = automationDraft.max_runs.trim();
    const body: Record<string, unknown> = {
      name,
      kind: automationDraft.kind,
      keep_awake: automationDraft.keep_awake,
      interval_seconds: Math.max(
        60,
        Math.round((Number.isFinite(intervalMinutes) ? intervalMinutes : 5) * 60),
      ),
      ...(maxRunsRaw ? { max_runs: Math.max(0, Math.round(Number(maxRunsRaw))) } : {}),
      recovery: "restart",
    };

    if (isAgentGoal) {
      body.device_id = automationDraft.device_id;
      body.agent_goal = {
        controller: automationDraft.agent_controller,        objective: automationDraft.agent_objective.trim(),
        success_criteria: automationDraft.agent_success_criteria.trim(),
        ...(automationDraft.agent_workspace.trim()
          ? { workspace: automationDraft.agent_workspace.trim() }
          : {}),
        ...(automationDraft.agent_verify_command.trim()
          ? { verify_command: automationDraft.agent_verify_command.trim() }
          : {}),
        ...(automationDraft.agent_workspace.trim()
          ? { verify_cwd: automationDraft.agent_workspace.trim() }
          : {}),
        max_iterations: Math.min(
          2000,
          Math.max(1, Math.round(Number(automationDraft.agent_max_iterations || "720"))),
        ),
        allowed_tools: automationDraft.agent_allowed_tools,
        ...(plannedContract ? { plan: plannedContract } : {}),
        ...(automationDraft.agent_controller === "source" ? { source_capabilities: { durable_context: true, resume_on_next_turn: true, autonomous_event_wakeup: false } } : {}),
      };

    } else if (isGitHubMerge) {
      body.github_merge = {
        owner: automationDraft.github_owner.trim(),
        repo: automationDraft.github_repo.trim(),
        pull_number: Number(automationDraft.github_pr),
        merge_method: automationDraft.github_merge_method,
      };
    } else {
      body.device_id = automationDraft.device_id;
      body.command = command;
      if (automationDraft.cwd.trim()) body.cwd = automationDraft.cwd.trim();
    }

    if (automationDraft.kind === "goal_loop") {
      if (!automationDraft.goal_command.trim()) {
        await showNotice(
          tr("Goal check required", "需要目标验证"),
          tr("Repeat & check needs a verification command. Exit code 0 means the goal has been reached.", "重复并验证需要填写验证命令；退出码 0 表示目标已经达成。"),
        );
        return;
      }
      body.goal = {
        command: automationDraft.goal_command.trim(),
        expected_exit_code: 0,
        ...(automationDraft.cwd.trim() ? { cwd: automationDraft.cwd.trim() } : {}),
      };
    }

    if (automationDraft.trigger_mode === "at") {
      if (!automationDraft.agent_start_at || !Number.isFinite(Date.parse(automationDraft.agent_start_at))) {
        await showNotice(tr("Start time required", "需要启动时间"), tr("Choose a valid future start time.", "请选择有效的未来启动时间。")); return;
      }
      body.schedule = { at: new Date(automationDraft.agent_start_at).toISOString() };
    } else if (automationDraft.trigger_mode === "interval") {
      body.schedule = { every_seconds: Math.max(60, Math.round(scheduleMinutes * 60)) };
    }

    if (automationDraft.trigger_mode === "event") {
      let match: Record<string, string | number | boolean | null> = {};
      try {
        const parsed = JSON.parse(automationDraft.condition_match || "{}") as unknown;
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
        match = parsed as Record<string, string | number | boolean | null>;
      } catch {
        await showNotice(
          tr("Invalid condition JSON", "条件 JSON 无效"),
          tr("Match conditions must be a JSON object using dotted payload paths.", "Match 条件必须是一个使用点号路径的 JSON 对象。"),
        );
        return;
      }
      body.condition = {
        source: isGitHubMerge ? "github" : automationDraft.condition_source,
        ...(automationDraft.condition_event.trim() ? { event: automationDraft.condition_event.trim() } : {}),
        match,
      };
    }

    const trigger = automationDraft.trigger_mode === "at" ? { type: "at", at: (body.schedule as { at: string }).at }
      : automationDraft.trigger_mode === "interval" ? { type: "interval", every_seconds: (body.schedule as { every_seconds: number }).every_seconds }
      : automationDraft.trigger_mode === "event" ? { type: "event", ...(body.condition as object) } : { type: "now" };
    const taskContract = {
      version: 1, intent: isAgentGoal ? "goal" : "command", name, device_id: body.device_id,
      trigger, keep_awake: body.keep_awake,
      ...(isAgentGoal ? { goal: body.agent_goal } : isGitHubMerge ? { github_merge: body.github_merge }
        : { command: { text: command, cwd: body.cwd, recovery: "fail", ...(body.goal ? { verification: (body.goal as { command: string }).command } : {}) } }),
      limits: { check_interval_seconds: body.interval_seconds, ...(body.max_runs !== undefined ? { max_runs: body.max_runs } : {}) },
    };

    setAutomationBusy("create");
    try {
      const response = await fetch("/api/automations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ task: taskContract }),
      });
      const payload = await response.json().catch(() => ({})) as {
        error?: string;
        webhook?: { url?: string } | null;
        automation?: Automation;
      };
      if (!response.ok) {
        await showNotice(
          tr("Automation was not created", "自动化创建失败"),
          payload.error || tr("The server rejected this automation.", "服务器拒绝了这条自动化。"),
        );
        return;
      }
      setCreatedWebhook(payload.webhook?.url || null);
      setCreatedTask(payload.automation || null);
      setCreatedTaskOutcome({ title: draftStartTitle, detail: draftStartDetail });
      if (payload.automation) {
        setAutomationQuery(payload.automation.id);
        setAutomationFilter("all");
      }
      setShowAutomationCreate(false);
      setPlannedDraft(newPlannedDraft());
      setAutomationDraft((current) => ({
        ...current,
        name: "",
        command: "",
        command_confirmed: false,
        goal_command: "",
        agent_objective: "",
        agent_success_criteria: "",
        agent_verify_command: "",
        github_pr: "",
        max_runs: "",
      }));
      await refreshAutomations();
    } catch {
      await showNotice(tr("Task creation could not be confirmed", "无法确认任务是否创建成功"), tr("Refresh the task list before trying again. The request may have reached the server, so retrying immediately could create a duplicate.", "请先刷新任务列表再重试。请求可能已到达服务器，立即重试可能产生重复任务。"));
    } finally {
      setAutomationBusy(null);
    }
  }

  async function manageDashboardAutomation(
    automation: Automation,
    action: "pause" | "resume" | "cancel",
  ) {
    if (UI_PREVIEW) return;
    if (
      action === "cancel" &&
      !(await askConfirm(
        tr("Cancel automation?", "取消自动化？"),
        tr("Remote Arc will stop orchestration and best-effort stop its currently managed process.", "Remote Arc 会停止编排，并尽力停止当前由它管理的进程。"),
        tr("Cancel automation", "取消自动化"),
        "danger",
      ))
    ) return;

    setAutomationBusy(automation.id + ":" + action);
    try {
      const response = await fetch(
        "/api/automations/" + encodeURIComponent(automation.id) + "/" + action,
        { method: "POST" },
      );
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) {
        await showNotice(
          tr("Automation was not updated", "自动化更新失败"),
          payload.error || tr("The server rejected this change.", "服务器拒绝了这次修改。"),
        );
        return;
      }
      await refreshAutomations();
    } finally {
      setAutomationBusy(null);
    }
  }

  async function setMcpPaused(paused: boolean) {
    if (UI_PREVIEW || !securityState) return;
    setSecurityBusy(true);
    try {
      const response = await fetch("/api/security/mcp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ paused }),
      });
      if (!response.ok) {
        await showNotice(
          tr("Remote MCP access was not updated", "Remote MCP 访问状态未更新"),
          tr("The server did not accept this change. Your current access state has been left unchanged.", "服务器没有接受这次修改，当前访问状态保持不变。"),
        );
        return;
      }
      await refreshSecurity();
      await refreshAll();
    } finally {
      setSecurityBusy(false);
    }
  }

  async function revokeGrant(grant: SecurityGrant) {
    if (UI_PREVIEW || !securityState) return;
    const shortId = grant.grantId.slice(0, 12) + "…";
    const expired = grant.status === "expired";
    const confirmed = await askConfirm(
      expired
        ? tr("Remove this expired authorization?", "移除这条已过期授权？")
        : tr("Disconnect this " + grant.clientName + " authorization?", "断开这条 " + grant.clientName + " 授权？"),
      expired
        ? tr(
            "Authorization " + shortId + " can no longer access Remote Arc. Removing it clears this expired grant from your account history. Your paired computers and other AI authorizations are not affected.",
            "授权 " + shortId + " 已无法继续访问 Remote Arc。移除后只会清理这条已过期授权，不会影响已配对电脑或其他 AI 授权。",
          )
        : tr(
            "Only authorization " + shortId + " will be revoked. The ChatGPT session using this grant will need to complete OAuth again. Your paired computers and other ChatGPT authorizations stay connected.",
            "只会撤销授权 " + shortId + "。正在使用这条授权的 ChatGPT 之后需要重新完成 OAuth；已配对电脑以及其他 ChatGPT 授权不会受影响。",
          ),
      expired ? tr("Remove expired grant", "移除过期授权") : tr("Disconnect authorization", "断开此授权"),
      "danger",
    );
    if (!confirmed) return;

    setSecurityBusy(true);
    try {
      const response = await fetch("/api/security/grants/" + encodeURIComponent(grant.grantId) + "/revoke", { method: "POST" });
      if (!response.ok) {
        await showNotice(
          tr("Authorization was not revoked", "授权未撤销"),
          tr("Remote Arc could not revoke this authorization. Nothing was disconnected.", "Remote Arc 无法撤销这条授权，当前连接没有发生变化。"),
        );
        return;
      }
      await refreshSecurity();
      await refreshAll();
    } finally {
      setSecurityBusy(false);
    }
  }

  async function revoke(deviceId: string) {
    const device = devices.find((item) => item.id === deviceId);
    const confirmed = await askConfirm(
      tr("Forget this device?", "删除这台设备？"),
      tr(
        (device?.name || "This device") + " will be removed from your Remote Arc account. Local files and software are not deleted. To use this runtime again, run Remote Arc locally and pair it again. Your AI-client authorizations are unchanged.",
        (device?.name || "这台设备") + " 将从 Remote Arc 账户中移除。本机文件和软件不会被删除。如需再次使用这个运行环境，请在本机重新运行 Remote Arc 并重新配对。AI 客户端授权不会受影响。",
      ),
      tr("Forget device", "删除设备"),
      "danger",
    );
    if (!confirmed) return;

    const response = await fetch(
      "/api/devices/" + encodeURIComponent(deviceId) + "/revoke",
      { method: "POST" },
    );
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      await showNotice(
        tr("Device was not removed", "设备未删除"),
        payload.error || tr(
          "Remote Arc could not remove this device. Its existing pairing is still active.",
          "Remote Arc 无法删除这台设备，现有配对仍然有效。",
        ),
      );
      return;
    }

    if (managedDeviceId === deviceId) setManagedDeviceId(null);
    await refreshAll();
  }

  async function rename(device: Device) {
    const next = (await askPrompt(
      tr("Rename device", "重命名设备"),
      tr("Choose the name shown throughout your Remote Arc dashboard.", "设置这台设备在 Remote Arc Dashboard 中显示的名称。"),
      device.name,
      tr("Device name", "设备名称"),
    ))?.trim();
    if (!next || next === device.name) return;
    await fetch("/api/devices/" + encodeURIComponent(device.id) + "/rename", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: next }),
    });
    await refreshAll();
  }

  async function saveDeviceTools(device: Device, next: readonly string[]) {
    const available = device.status === "online"
      ? (device.available_tools || device.tools)
      : Array.from(new Set([...DEVICE_TOOL_CATALOG, ...(device.available_tools || device.tools)]));
    const allowedTools = Array.from(new Set(next)).filter((tool) => available.includes(tool));
    const response = await fetch("/api/devices/" + encodeURIComponent(device.id) + "/tools", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ allowed_tools: allowedTools }),
    });
    if (!response.ok) {
      await showNotice(
        tr("Skill access was not updated", "技能权限未更新"),
        tr("Remote Arc could not save this device skill policy. The previous permissions are still in effect.", "Remote Arc 无法保存这台设备的技能策略，之前的权限仍然生效。"),
      );
      return false;
    }
    await refreshAll();
    return true;
  }

  async function updateDeviceBackground(
    device: Device,
    enabled: boolean,
    stopCurrent = false,
  ) {
    if (UI_PREVIEW || backgroundMutationInFlight.current || runtimeMutationInFlight.current) return;
    if (device.status !== "online") {
      await showNotice(
        tr("Computer is offline", "电脑当前离线"),
        tr(
          "Background mode can only be changed while the local Remote Arc agent is online. If it was disabled previously, run npx remotelink once on that computer to reconnect it.",
          "只有本机 Remote Arc Agent 在线时才能修改后台运行设置。如果之前已经关闭，请在那台电脑上运行一次 npx remotelink 重新连接。",
        ),
      );
      return;
    }
    if (!device.background_agent_available) {
      await showNotice(
        tr("Update remotelink first", "请先更新 remotelink"),
        tr(
          "This computer is running an older Remote Arc client that does not support background-agent controls yet.",
          "这台电脑正在运行旧版 Remote Arc 客户端，暂不支持后台 Agent 控制。",
        ),
      );
      return;
    }

    // Disable duplicate clicks synchronously, not after the next React render.
    backgroundMutationInFlight.current = true;
    setBackgroundUpdatingId(device.id);
    setBackgroundTargetEnabled(enabled);
    setBackgroundPhase("applying");
    try {
      const response = await fetch(
        "/api/devices/" + encodeURIComponent(device.id) + "/background",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            enabled,
            ...(enabled === false && stopCurrent ? { stop_current: true } : {}),
          }),
        },
      );
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) {
        await refreshAll();
        await showNotice(
          tr("Background setting was not updated", "后台设置未更新"),
          payload.error === "device offline" ? tr("This computer disconnected before the setting could be applied. The setting is not confirmed. Reconnect with npx remotelink on this computer, then try again.", "应用设置前这台电脑已断开连接，设置尚未确认。请在本机运行 npx remotelink 重新连接后再试。") : payload.error ||
            tr(
              "Remote Arc could not update the background connection on this computer.",
              "Remote Arc 无法更新这台电脑的后台连接设置。",
            ),
        );
        return;
      }
      if (stopCurrent) {
        // Stop is different from disabling recovery: confirm the *executor*
        // leaves the Relay, not merely that a boolean was saved in D1.
        setBackgroundPhase("stopping");
        const offline = await waitForAgentOffline(device.id, {
          read: async () => {
            const statusResponse = await fetch("/api/devices", {
              cache: "no-store",
              signal: AbortSignal.timeout(4_000),
            });
            if (!statusResponse.ok) throw new Error("Device status unavailable");
            return await statusResponse.json() as Device[];
          },
          pause: (ms) => new Promise((resolve) => window.setTimeout(resolve, ms)),
        });
        await refreshAll();
        await showNotice(
          offline ? tr("Agent stopped", "Agent 已停止") : tr("Stop still unconfirmed", "停止操作尚未确认"),
          offline
            ? tr("The Agent is offline and automatic recovery has been disabled. Restart it locally when you need access.", "Agent 已离线，自动恢复已关闭。需要重新使用时请在该电脑上启动。")
            : tr("The stop request was accepted, but the Agent has not gone offline yet. Check the device status before retrying.", "停止请求已被接受，但设备尚未确认离线。请先检查设备状态，再决定是否重试。"),
        );
        return;
      }
      // The POST acknowledges the command, but the operating-system supervisor
      // can take several seconds to start (or may still fail). Confirm a live
      // guard from a fresh device snapshot before dismissing the spinner.
      setBackgroundPhase("verifying");
      const confirmed = await waitForRecoveryState(device.id, enabled, {
        read: async () => {
          const response = await fetch("/api/devices", {
            cache: "no-store",
            signal: AbortSignal.timeout(4_000),
          });
          if (!response.ok) throw new Error("Device status unavailable");
          return await response.json() as Device[];
        },
        pause: (ms) => new Promise((resolve) => window.setTimeout(resolve, ms)),
      });
      await refreshAll();
      if (!confirmed) {
        await showNotice(
          tr("Still awaiting device confirmation", "仍在等待设备确认"),
          tr("The command was accepted, but the device has not confirmed the requested supervisor state. Check its displayed status or refresh before retrying.", "操作请求已接受，但设备尚未确认守护进程的目标状态。请先检查当前状态或刷新设备列表，再决定是否重试。"),
        );
      }
    } catch {
      await refreshAll().catch(() => undefined);
      await showNotice(tr("Background setting is unconfirmed", "后台设置尚未确认"), tr("The response was interrupted. Refresh the device state before trying again; the local setting may already have changed.", "响应已中断，请先刷新设备状态再尝试；本机设置可能已经发生变化。"));
    } finally {
      backgroundMutationInFlight.current = false;
      setBackgroundUpdatingId(null);
      setBackgroundTargetEnabled(null);
    }

  }

  async function updateDeviceRuntime(device: Device, paused: boolean) {
    if (UI_PREVIEW || runtimeMutationInFlight.current || backgroundMutationInFlight.current) return;
    if (device.status !== "online" || device.pause_agent_available !== true) return;
    runtimeMutationInFlight.current = true;
    setRuntimeUpdatingId(device.id);
    setRuntimeTargetPaused(paused);
    try {
      const response = await fetch("/api/devices/" + encodeURIComponent(device.id) + "/runtime", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ paused }),
      });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) {
        await refreshAll().catch(() => undefined);
        await showNotice(tr("Runtime change not accepted", "切换执行状态失败"),
          payload.error || tr("The current device cannot change runtime state.", "当前设备无法切换运行状态。"));
        return;
      }
      let confirmed = false;
      for (let attempt = 0; attempt < 18; attempt++) {
        await new Promise((resolve) => window.setTimeout(resolve, 1100));
        try {
          const result = await fetch("/api/devices", { cache: "no-store", signal: AbortSignal.timeout(4000) });
          if (!result.ok) continue;
          const list = await result.json() as Device[];
          const current = list.find((item) => item.id === device.id);
          if (current?.status === "online" && current.execution_paused === paused &&
            (paused ? current.tools.length === 0 : (current.available_tools?.length ?? 0) > 0)) {
            confirmed = true;
            break;
          }
        } catch { /* Transport failure does not prove a state transition. */ }
      }
      await refreshAll().catch(() => undefined);
      if (!confirmed) {
        await showNotice(tr("Runtime state unconfirmed", "执行状态尚未确认"),
          tr("The handoff may still be taking place. Refresh the device state before retrying; no second request was sent.", "执行实例可能仍在交接，请刷新设备状态确认后再重试；系统没有重复发送指令。"));
      }
    } catch {
      await refreshAll().catch(() => undefined);
      await showNotice(tr("Runtime state unconfirmed", "执行状态尚未确认"),
        tr("The response was interrupted. Check whether the device is paused before retrying.", "请求中断，请检查设备是否已经暂停，再决定是否重试。"));
    } finally {
      runtimeMutationInFlight.current = false;
      setRuntimeUpdatingId(null);
      setRuntimeTargetPaused(null);
    }
  }

  async function updateDeviceTools(device: Device, tool: string, enabled: boolean) {
    const workspaceRequired = new Set([
      "write_file",
      "edit_block",
      "undo_last_change",
      "start_process",
    ]);
    if (enabled && workspaceRequired.has(tool) && !(device.workspace_roots || []).length) {
      await showNotice(
        tr("Choose a Trusted Write Location first", "请先选择可信写入区域"),
        tr(
          "Remote Arc requires a Trusted Write Location before enabling this capability. Add one under File boundaries & recovery, then enable the tool again.",
          "Remote Arc 在开启此能力前必须先设置可信写入区域。请先在“文件边界与恢复”中添加目录，再重新开启。",
        ),
      );
      return;
    }
    if (enabled && tool === "start_process") {
      const confirmed = await askConfirm(
        tr("Enable terminal execution on " + device.name + "?", "在 " + device.name + " 上开启终端执行？"),
        tr(
          "This lets connected AI clients run shell commands that can modify files, software and external services. Safety Guard checks where deletes would land and stops ones that would reach drive roots, home, personal or system folders, plus a few other catastrophic commands, but terminal access is not an OS sandbox.",
          "这会允许已连接的 AI 运行可能修改文件、软件和外部服务的 Shell 命令。Safety Guard 会检查删除的实际落点，拦下会删到盘符根目录、主目录、个人或系统目录的命令以及少量其他灾难级命令，但终端权限并不是操作系统级沙箱。",
        ),
        tr("Enable terminal", "开启终端"),
        "danger",
      );
      if (!confirmed) return;
    }
    if (enabled && isBrowserRunnerTool(tool)) {
      const confirmed = await askConfirm(
        tr("Let AI act on websites from " + device.name + "?", "允许 AI 在 " + device.name + " 上操作网站？"),
        tr(
          "Connected AI clients will be able to click, fill, upload files from Trusted Locations and submit forms, only on the sites each task names: in a hidden Remote Arc browser window that only appears when you need to act (your own Chrome only if you ask for it). The AI never types passwords or card numbers; sign-ins saved on this computer are filled by Remote Arc itself, and a submit is never sent twice.",
          "已连接的 AI 将可以点击、填写、从可信目录上传文件并提交表单，且只能访问每个任务指定的网站：在隐藏的 Remote Arc 浏览器窗口里，只有需要你操作时才会出现（只有你要求时才用你自己的 Chrome）。AI 从不输入密码和卡号；保存在这台电脑上的登录信息由 Remote Arc 自己填写，提交也不会重复发送。",
        ),
        tr("Enable browser_runner", "开启 browser_runner"),
        "danger",
      );
      if (!confirmed) return;
    }
    const advertised = device.available_tools || device.tools;
    const baseline = device.status === "online"
      ? advertised
      : Array.from(new Set([...DEVICE_TOOL_CATALOG, ...advertised]));
    await saveDeviceTools(device, toggledDeviceTools(device.allowed_tools, baseline, tool, enabled));
  }

  async function applyDevicePreset(device: Device, preset: Exclude<DeviceAccessPreset, "custom">) {
    if (preset !== "safe" && !(device.workspace_roots || []).length) {
      await showNotice(
        tr("Choose a Trusted Write Location first", "请先选择可信写入区域"),
        tr(
          "Developer and Full Access are unavailable until this device has a Trusted Write Location.",
          "为设备指定可信写入区域后，才能开启 Developer 或 Full Access。",
        ),
      );
      return;
    }
    if (preset === "full") {
      const confirmed = await askConfirm(
        tr("Switch " + device.name + " to Full Access?", "将 " + device.name + " 切换为 Full Access？"),
        tr(
          "Full Access enables terminal execution and managed background processes. Commands may affect local files or external services and can include actions Local Undo cannot reverse.",
          "Full Access 会开启终端执行和后台进程管理。命令可能影响本地文件或外部服务，其中部分操作无法通过 Local Undo 撤销。",
        ),
        tr("Enable Full Access", "开启 Full Access"),
        "danger",
      );
      if (!confirmed) return;
    }
    const presetTools =
      preset === "safe"
        ? SAFE_DEVICE_TOOLS
        : preset === "developer"
          ? DEVELOPER_DEVICE_TOOLS
          : DEVICE_TOOL_CATALOG;
    // Changing the file/terminal preset keeps the separate browser_runner switch.
    const keepRunner = (device.allowed_tools || []).filter(isBrowserRunnerTool);
    await saveDeviceTools(device, [...presetTools, ...keepRunner]);
  }

  async function saveDeviceTaskPermission(device: Device, key: keyof DeviceTaskPermissions, enabled: boolean) {
    setDeviceTaskBusy(device.id);
    try {
      const response = await fetch("/api/devices/" + encodeURIComponent(device.id) + "/task-permissions", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...(device.automation_permissions || legacyTaskPermissions), [key]: enabled }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { error?: string };
        await showNotice(tr("Task settings were not saved", "任务设置未保存"), payload.error || tr("Please try again.", "请重试。"));
      } else await refreshAll();
    } catch {
      await showNotice(tr("Task settings were not saved", "任务设置未保存"), tr("Connection failed. Please try again.", "连接失败，请重试。"));
    } finally { setDeviceTaskBusy(null); }
  }

  async function saveDevicePolicy(
    device: Device,
    patch: Partial<Pick<Device, "workspace_roots" | "sensitive_paths" | "sensitive_allow_paths" | "protect_sensitive_paths" | "undo_enabled">>,
  ) {
    const next = {
      workspace_roots: patch.workspace_roots ?? device.workspace_roots ?? [],
      sensitive_paths: patch.sensitive_paths ?? device.sensitive_paths ?? [],
      sensitive_allow_paths: patch.sensitive_allow_paths ?? device.sensitive_allow_paths ?? [],
      protect_sensitive_paths:
        patch.protect_sensitive_paths ?? device.protect_sensitive_paths ?? true,
      undo_enabled: patch.undo_enabled ?? device.undo_enabled ?? true,
    };

    const response = await fetch(
      "/api/devices/" + encodeURIComponent(device.id) + "/policy",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...next,
          // Preserve an explicitly disabled state across other policy edits.
          acknowledge_sensitive_path_risk: next.protect_sensitive_paths === false,
        }),
      },
    );
    if (!response.ok) {
      const payload = await response.json().catch(() => ({})) as { error?: string };
      await showNotice(
        tr("Safety policy was not updated", "安全策略未更新"),
        payload.error || tr("Remote Arc could not save this device safety policy.", "Remote Arc 无法保存这台设备的安全策略。"),
      );
      return false;
    }
    await refreshAll();
    return true;
  }

  async function updateSensitiveProtection(device: Device, enabled: boolean) {
    if ((device.protect_sensitive_paths ?? true) === enabled || sensitivePolicyBusyId) return;
    setSensitivePolicyBusyId(device.id);
    try {
      if (!enabled) {
        const confirmed = await askConfirm(
          tr("Disable Sensitive Path Protection on " + device.name + "?", "关闭 " + device.name + " 的敏感路径保护？"),
          tr(
            "This disables BOTH built-in and extra protected paths for file tools. If allowed, connected AI clients may read or change credentials, .env files, SSH keys and browser profiles. Trusted Write Locations and tool permissions still apply. Prefer a narrow exception whenever possible.",
            "这会同时关闭文件工具的内置及额外敏感路径保护。只要其他权限允许，已连接的 AI 就可能读取或修改凭证、.env 文件、SSH 密钥和浏览器配置。可信写入区域及工具权限仍生效。能用单个路径例外时，建议优先使用例外。",
          ),
          tr("Disable protection", "确认关闭保护"),
          "danger",
        );
        if (!confirmed) return;
      }
      await saveDevicePolicy(device, { protect_sensitive_paths: enabled });
    } catch {
      await refreshAll().catch(() => undefined);
      await showNotice(
        tr("Sensitive protection setting unconfirmed", "敏感路径保护状态尚未确认"),
        tr(
          "The request was interrupted. Refresh and verify the device policy before trying again.",
          "请求中断。请刷新并核实设备策略，再决定是否重试。",
        ),
      );
    } finally {
      setSensitivePolicyBusyId(null);
    }
  }

  async function addPolicyPath(
    device: Device,
    kind: "workspace_roots" | "sensitive_paths" | "sensitive_allow_paths",
  ) {
    const label =
      kind === "workspace_roots"
        ? tr("Add an allowed workspace path", "添加允许访问的工作区路径")
        : kind === "sensitive_paths"
          ? tr("Add a protected sensitive path", "添加额外受保护路径")
          : tr("Allow one sensitive path exception", "添加敏感路径例外");
    const example =
      device.platform === "win32"
        ? "E:\\Coding"
        : "~/work";
    const next = (await askPrompt(
      label,
      tr(
        "Enter a local path on " + device.name + ". Example: " + example,
        "输入 " + device.name + " 上的本地路径。示例：" + example,
      ),
      "",
      example,
      tr("Add path", "添加路径"),
    ))?.trim();
    if (!next) return;
    const current = device[kind] || [];
    await saveDevicePolicy(device, {
      [kind]: Array.from(new Set([...current, next])),
    });
  }

  async function removePolicyPath(
    device: Device,
    kind: "workspace_roots" | "sensitive_paths" | "sensitive_allow_paths",
    value: string,
  ) {
    await saveDevicePolicy(device, {
      [kind]: (device[kind] || []).filter((item) => item !== value),
    });
  }

  async function browseDeviceDirectories(device: Device, path = "~") {
    setDirectoryPicker((current) => ({
      device,
      browser: current?.device.id === device.id ? current.browser : null,
      loading: true,
      error: "",
    }));
    try {
      const response = await fetch(
        "/api/devices/" +
          encodeURIComponent(device.id) +
          "/directories?path=" +
          encodeURIComponent(path),
      );
      const payload = await response.json().catch(() => ({})) as {
        browser?: DirectoryBrowser;
        error?: string;
      };
      if (!response.ok || !payload.browser) {
        setDirectoryPicker({
          device,
          browser: null,
          loading: false,
          error:
            payload.error ||
            tr("Directory browsing is unavailable on this device.", "这台设备暂时无法浏览目录。"),
        });
        return;
      }
      setDirectoryPicker({
        device,
        browser: payload.browser,
        loading: false,
        error: "",
      });
    } catch {
      setDirectoryPicker({
        device,
        browser: null,
        loading: false,
        error: tr("Could not reach this device.", "无法连接到这台设备。"),
      });
    }
  }

  async function addCurrentWorkspace() {
    if (!directoryPicker?.browser) return;
    const { device, browser } = directoryPicker;
    const current = device.workspace_roots || [];
    const saved = await saveDevicePolicy(device, {
      workspace_roots: Array.from(new Set([...current, browser.path])),
    });
    if (saved) setDirectoryPicker(null);
  }

  async function loadDeviceExecutionLog(device: Device) {
    setExecutionLogLoading(device.id);
    setExecutionLogErrors((current) => ({ ...current, [device.id]: "" }));
    try {
      const response = await fetch(
        "/api/devices/" + encodeURIComponent(device.id) + "/execution-log?limit=100",
      );
      const payload = await response.json().catch(() => ({})) as {
        log?: DeviceExecutionLog;
        error?: string;
      };
      if (!response.ok || !payload.log) {
        setExecutionLogErrors((current) => ({
          ...current,
          [device.id]:
            payload.error ||
            tr(
              "Local execution log is unavailable on this device.",
              "这台设备暂时无法读取本地执行日志。",
            ),
        }));
        return;
      }
      setExecutionLogsByDevice((current) => ({
        ...current,
        [device.id]: payload.log!,
      }));
    } catch {
      setExecutionLogErrors((current) => ({
        ...current,
        [device.id]: tr(
          "Could not reach this device to read its execution log.",
          "无法连接到这台设备读取执行日志。",
        ),
      }));
    } finally {
      setExecutionLogLoading((current) => (current === device.id ? null : current));
    }
  }

  async function loadManagedProcesses(device: Device) {
    setProcessLoading(device.id);
    setProcessErrors((current) => ({ ...current, [device.id]: "" }));
    try {
      const response = await fetch(
        "/api/devices/" + encodeURIComponent(device.id) + "/processes",
      );
      const payload = await response.json().catch(() => ({})) as {
        processes?: ManagedProcess[];
        error?: string;
      };
      if (!response.ok) {
        setProcessErrors((current) => ({
          ...current,
          [device.id]:
            payload.error ||
            tr("Managed processes are unavailable on this device.", "这台设备暂时不支持后台进程管理。"),
        }));
        return;
      }
      setProcessesByDevice((current) => ({
        ...current,
        [device.id]: payload.processes || [],
      }));
    } finally {
      setProcessLoading((current) => (current === device.id ? null : current));
    }
  }

  async function showManagedProcessOutput(device: Device, item: ManagedProcess) {
    const response = await fetch(
      "/api/devices/" +
        encodeURIComponent(device.id) +
        "/processes/" +
        encodeURIComponent(item.process_id) +
        "/output",
    );
    const payload = await response.json().catch(() => ({})) as {
      process?: ManagedProcess & { stdout?: string; stderr?: string };
      error?: string;
    };
    if (!response.ok || !payload.process) {
      await showNotice(
        tr("Process output is unavailable", "无法读取进程输出"),
        payload.error || tr("Remote Arc could not read this process output.", "Remote Arc 无法读取这个后台进程的输出。"),
      );
      return;
    }
    const stdout = payload.process.stdout || "";
    const stderr = payload.process.stderr || "";
    const combined = [
      stdout ? "stdout\n" + stdout : "",
      stderr ? "stderr\n" + stderr : "",
    ].filter(Boolean).join("\n\n");
    await showNotice(
      tr("Background process output", "后台进程输出"),
      combined.slice(-12000) || tr("No output captured yet.", "当前还没有捕获到输出。"),
    );
  }

  async function stopBackgroundProcess(device: Device, item: ManagedProcess) {
    const confirmed = await askConfirm(
      tr("Stop this background process?", "停止这个后台进程？"),
      tr(
        "Remote Arc will stop the managed process and its child process tree on " + device.name + ". This does not undo side effects the process may already have caused.",
        "Remote Arc 会在 " + device.name + " 上停止这个后台进程及其子进程树；已经产生的副作用不会因此自动撤销。",
      ),
      tr("Stop process", "停止进程"),
      "danger",
    );
    if (!confirmed) return;
    const response = await fetch(
      "/api/devices/" +
        encodeURIComponent(device.id) +
        "/processes/" +
        encodeURIComponent(item.process_id) +
        "/stop",
      { method: "POST" },
    );
    const payload = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) {
      await showNotice(
        tr("Process was not stopped", "进程未停止"),
        payload.error || tr("Remote Arc could not stop this process.", "Remote Arc 无法停止这个进程。"),
      );
      return;
    }
    await loadManagedProcesses(device);
  }

  async function loadUndoHistory(device: Device) {
    setUndoLoading(device.id);
    setUndoErrors((current) => ({ ...current, [device.id]: "" }));
    try {
      const response = await fetch(
        "/api/devices/" + encodeURIComponent(device.id) + "/undo",
      );
      const payload = await response.json().catch(() => ({})) as {
        actions?: UndoAction[];
        error?: string;
      };
      if (!response.ok) {
        setUndoErrors((current) => ({
          ...current,
          [device.id]:
            payload.error ||
            tr("Undo history is unavailable on this device.", "这台设备暂时不支持撤销历史。"),
        }));
        return;
      }
      setUndoByDevice((current) => ({
        ...current,
        [device.id]: payload.actions || [],
      }));
    } finally {
      setUndoLoading((current) => (current === device.id ? null : current));
    }
  }

  async function restoreUndoAction(device: Device, action: UndoAction) {
    const confirmed = await askConfirm(
      tr("Restore this local snapshot?", "恢复这个本机快照？"),
      tr(
        "Remote Arc will restore " + action.path + " to its state before this Remote Arc edit. The restore will run only if the current file still matches the recorded post-edit state.",
        "Remote Arc 会把 " + action.path + " 恢复到本次 Remote Arc 修改之前的状态。只有当前文件仍与当时修改后的状态一致时才会执行恢复。",
      ),
      tr("Restore file", "恢复文件"),
      "danger",
    );
    if (!confirmed) return;

    setUndoLoading(device.id);
    try {
      const response = await fetch(
        "/api/devices/" +
          encodeURIComponent(device.id) +
          "/undo/" +
          encodeURIComponent(action.id),
        { method: "POST" },
      );
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) {
        await showNotice(
          tr("Local Undo was not applied", "Local Undo 未执行"),
          payload.error || tr("Remote Arc could not safely restore this change.", "Remote Arc 无法安全恢复这次修改。"),
        );
        return;
      }
      await loadUndoHistory(device);
      await refreshAll();
    } finally {
      setUndoLoading((current) => (current === device.id ? null : current));
    }
  }

  function navigateTab(tab: DashboardTab) {
    tab = availableDashboardTab(tab,arcAvailable);
    const path = DASHBOARD_PATHS[tab];
    if (location.pathname !== path) {history.pushState({}, "", path);recordProductView();}
    if (workspaceForTab(active) !== workspaceForTab(tab)) setShowAutomationCreate(false);
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
  function openCreateInWorkspace(_workspace: "connect" | "agent", routine = false, objective = "", successCriteria = "") {
    openArcChat(objective ? objective + (successCriteria ? '\n' + successCriteria : '') : routine
      ? tr('Help me set up a routine. Ask what I need, the schedule and timezone.','帮我安排一项例行工作，先了解要做什么、执行时间和时区。')
      : tr('Help me delegate a task. Ask what result I need.','帮我安排一项任务，先了解我需要的结果。'));
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

  const automationTime = (value: string | null) => {
    if (!value) return "—";
    const delta = new Date(value).getTime() - Date.now();
    if (delta <= 0) return timeAgo(value);
    if (delta < 60_000) return tr("in <1m", "<1 分钟后");
    if (delta < 3_600_000) return tr("in " + Math.ceil(delta / 60_000) + "m", Math.ceil(delta / 60_000) + " 分钟后");
    if (delta < 86_400_000) return tr("in " + Math.ceil(delta / 3_600_000) + "h", Math.ceil(delta / 3_600_000) + " 小时后");
    return tr("in " + Math.ceil(delta / 86_400_000) + "d", Math.ceil(delta / 86_400_000) + " 天后");
  };

  const automationDisplayKind = (automation: Automation): AutomationCreateKind => {
    if (automation.kind !== "goal_loop" || !automation.goal_json) return automation.kind;
    try {
      const goal = JSON.parse(automation.goal_json) as { type?: string };
      return goal?.type === "agent_goal" ? "agent_goal" : automation.kind;
    } catch {
      return automation.kind;
    }
  };

  const automationKindLabel = (kind: AutomationCreateKind) =>
    kind === "long_task"
      ? tr("Run once", "运行一次")
      : kind === "condition_watch"
        ? tr("After an event", "事件触发")
        : kind === "schedule_watch"
          ? tr("On a timer", "定时运行")
          : kind === "agent_goal"
            ? tr("Goal task", "目标任务")
            : tr("Repeat & check", "重复并验证");

  const automationStatusLabel = (value: AutomationStatus) =>
    value === "waiting"
      ? tr("Waiting", "等待中")
      : value === "running"
        ? tr("Running", "运行中")
        : value === "waiting_for_device"
          ? tr("Waiting for device", "等待设备")
          : value === "waiting_for_event"
            ? tr("Waiting for event", "等待事件")
            : value === "paused"
              ? tr("Paused", "已暂停")
                : value === "completed"
                  ? tr("Completed", "已完成")
                  : value === "failed"
                    ? tr("Failed", "失败")
                    : value === "cancelled"
                      ? tr("Cancelled", "已取消")
                      : tr("Expired", "已过期");

  const automationTerminal = (value: AutomationStatus) =>
    ["completed", "failed", "cancelled", "expired"].includes(value);

  const automationActiveCount = automations.filter((item) =>
    ["waiting", "running", "waiting_for_device", "waiting_for_event"].includes(item.status),
  ).length;
  const backgroundConfiguredCount = devices.filter((device) => device.background_enabled === true).length;
  const draftDevice = devices.find((device) => device.id === automationDraft.device_id);
  const draftPermissions = draftDevice?.automation_permissions || legacyTaskPermissions;
  const draftIsCloud = automationDraft.kind === "condition_watch" && automationDraft.condition_action === "github_merge";
  const draftAllowedTools = draftDevice?.allowed_tools;
  const draftRequiredTools = automationDraft.kind === "agent_goal" ? automationDraft.agent_allowed_tools : ["start_process"];
  const draftToolBlocked = !draftIsCloud && draftAllowedTools != null && draftRequiredTools.some(tool => !draftAllowedTools.includes(tool));
  const draftPermissionBlocked = draftToolBlocked || (!draftIsCloud && !!draftDevice && (!draftPermissions.background_tasks
    || (["at", "interval"].includes(automationDraft.trigger_mode) && !draftPermissions.scheduled_tasks)
    || (automationDraft.kind === "agent_goal" && (!draftPermissions.adaptive_agent || (automationDraft.agent_controller === "source" && !draftPermissions.source_agent)))));
  const draftServiceBlocked = taskCapabilities !== null && (
    (automationDraft.kind === "agent_goal" && automationDraft.agent_controller === "hosted" && !taskCapabilities.hosted_planner)
    || (draftIsCloud && !taskCapabilities.github_merge));
  const sourceHasSavedCommands = plannedDraft.enabled && plannedDraft.phases.some(phase => !!phase.command.trim());
  const draftStartTitle = automationDraft.trigger_mode === "event" ? tr("Waits for a matching event", "等待匹配事件")
    : automationDraft.trigger_mode === "at" ? tr("Starts at the selected time", "在所选时间启动")
    : automationDraft.trigger_mode === "interval" ? tr("First run after the interval", "首次执行在间隔结束后")
    : automationDraft.kind === "agent_goal" && automationDraft.agent_controller === "source" ? sourceHasSavedCommands ? tr("Saved steps can run; new decisions wait for your AI", "保存的步骤可执行，新决策等待你的 AI") : tr("Needs an AI decision before starting", "启动前需要 AI 提交决策")
    : tr("Queues as soon as you create it", "创建后立即排队");
  const draftStartDetail = automationDraft.kind === "agent_goal"
    ? automationDraft.agent_controller === "source"
      ? sourceHasSavedCommands
        ? tr("Your saved phase commands can run when due. Any new reasoning still needs your connected AI chat. Copy the task reference into that chat to continue; Remote Arc cannot wake it automatically.", "已保存的阶段命令可在到期后执行，任何新判断仍需要已连接的 AI 聊天。复制任务引用到聊天中即可接续，Remote Arc 无法自动唤起它。")
        : tr("This form saves a goal, not a decision from ChatGPT. Copy the new task reference into your connected AI chat so it can read the context and submit the next action. Remote Arc cannot wake the chat automatically.", "表单保存的是目标，并非 ChatGPT 的决策。创建后将任务引用复制到已连接的 AI 聊天，让它读取上下文并提交下一步。Remote Arc 无法自动唤起聊天。")
      : tr("A configured Remote Arc hosted model chooses actions from your approved tools. It uses this goal and its results, not your ChatGPT conversation. No chat is needed to start.", "已配置的 Remote Arc 托管模型从你批准的工具中选择操作，依据这里的目标和执行结果工作，不会读取 ChatGPT 对话。启动不需要聊天。")
    : automationDraft.kind === "condition_watch"
      ? tr("Connect the webhook returned after creation to your event source. Only a matching event runs the saved action; no AI chat is needed.", "创建后将返回的 Webhook 接入事件来源。只有匹配事件才会执行保存的操作，无需 AI 聊天。")
      : automationDraft.kind === "schedule_watch"
        ? tr("The first run follows the interval; later intervals start after the previous run finishes. Remote Arc repeats the saved command without AI planning until stopped or its limit is reached.", "首次执行在间隔结束后开始，后续间隔从上次执行结束后计算。Remote Arc 无需 AI 规划，重复保存的命令，直到停止或达到限制。")
        : automationDraft.kind === "goal_loop"
          ? tr("Remote Arc repeats the same work command, then runs your check. It stops when the check exits 0 or the attempt limit is reached. It does not rewrite the command using AI.", "Remote Arc 重复同一工作命令，再执行验证；验证退出码为 0 或达到轮数上限后停止。它不会用 AI 改写命令。")
          : tr("Remote Arc starts the exact command you enter and tracks it to completion. No chat or further AI decision is needed. Closing this page does not cancel it.", "Remote Arc 启动你填写的命令并跟踪到结束，无需聊天或进一步的 AI 决策。关闭此页面不会取消任务。");
  const automationAttentionCount = automations.filter(task => isVisibleInWorkspace(task, "automations") && taskNeedsAttention(task)).length;
  const automationNeedsAgentCount = automations.filter(taskNeedsAgent).length;
  const matchesTaskFilter = (item: Automation, filter: typeof automationFilter) =>
    filter === "all" || (filter === "attention" ? taskNeedsAttention(item)
      : filter === "finished" ? automationTerminal(item.status)
      : !automationTerminal(item.status) && item.status !== "paused");
  const scopedAutomations = automations.filter((item) => isVisibleInWorkspace(item, active));
  const visibleAutomations = scopedAutomations.filter((item) => matchesTaskFilter(item, automationFilter))
    .filter((item) => !automationQuery.trim() || [item.id, item.name, deviceNameById.get(item.device_id || ""), automationKindLabel(automationDisplayKind(item))]
      .some((value) => value?.toLowerCase().includes(automationQuery.trim().toLowerCase())))
    .sort((a, b) => Number(taskNeedsAttention(b)) - Number(taskNeedsAttention(a)));
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
  const renderWorkspacePicker = (mobile = false) => (
    <WorkspacePicker workspace={workspace} arcAvailable={arcAvailable} mobile={mobile} tr={tr} onNavigate={navigateTab} />
  );

  return (
    <div className="appFrame" data-active-tab={active} data-workspace={workspace} data-sidebar-collapsed={sidebarCollapsed}>
      <aside className="sidebar">
        <div className="sidebarBrand"><Brand /><button type="button" className="sidebarCollapseToggle" aria-label={sidebarCollapsed ? tr('Expand sidebar','展开侧栏') : tr('Collapse sidebar','收起侧栏')} aria-expanded={!sidebarCollapsed} aria-controls={workspace === 'agent' ? 'arc-sidebar-nav-root' : 'dashboard-sidebar-navigation'} title={sidebarCollapsed ? tr('Expand sidebar','展开侧栏') : tr('Collapse sidebar','收起侧栏')} onClick={toggleSidebar}><ProductIcon name="panel" size={17}/></button></div>
        {renderWorkspacePicker()}
        <div id="arc-sidebar-nav-root" className="arcSidebarPortalRoot" hidden={workspace !== 'agent'} />
        {workspace === "agent" ? (
          null
        ) : (
          <>
            <div className="workspaceNavHeading">{tr("CONNECTIONS", "连接管理")}</div>
            <nav id="dashboard-sidebar-navigation" className="sideNav" aria-label={tr("Dashboard navigation", "控制台导航")}>
              {navItems.map(([id, label]) => (
                <button key={id} data-dashboard-tab={id} title={label} aria-label={label} aria-current={active === id ? "page" : undefined} className={active === id ? "active" : ""} onClick={() => navigateTab(id)}>
                  <span className="sideNavIcon"><DashboardNavIcon tab={id} /></span>
                  <span className="sideNavLabel">{label}</span>
                </button>
              ))}
            </nav>
          </>
        )}
        <div className="sidebarGlobalNavigation">
          <div className="workspaceNavHeading">{tr("ACCOUNT", "账户")}</div>
          <button type="button" aria-label={tr("Settings", "设置")} title={tr("Settings", "设置")} aria-current={active === "settings" || active === "agent-settings" ? "page" : undefined} className={active === "settings" || active === "agent-settings" ? "active" : ""} onClick={() => navigateTab(workspace === "agent" ? "agent-settings" : "settings")}><span className="sideNavIcon"><DashboardNavIcon tab="settings" /></span><span className="sideNavLabel">{tr("Settings", "设置")}</span></button>
          {user.isAdmin && <a href="https://admin.remotearc.app/" aria-label={tr("Admin", "管理员后台")} title={tr("Admin", "管理员后台")}><span className="sideNavIcon"><ProductIcon name="shield"/></span><span className="sideNavLabel">{tr("Admin", "管理员后台")}</span><ProductIcon name="arrowUpRight" size={13}/></a>}
          <a href={MARKETING_ORIGIN + "/docs"} aria-label={tr("Help & documentation", "帮助与文档")} title={tr("Help & documentation", "帮助与文档")}><span className="sideNavIcon"><ProductIcon name="book"/></span><span className="sideNavLabel">{tr("Help & documentation", "帮助与文档")}</span><ProductIcon name="arrowUpRight" size={13}/></a>
        </div>
        <div className="sidebarAccount">
          {user.avatarUrl ? <img src={user.avatarUrl} alt=""/> : <div className="avatarFallback">{(user.name || user.email).charAt(0).toUpperCase()}</div>}
          <div><strong>{user.name || "Owner"}</strong><span>{user.email}</span></div>
          <button onClick={() => void signOutSafely()} aria-label={tr("Sign out", "退出登录")}><ProductIcon name="logout"/></button>
        </div>
      </aside>

      <main className="dashboardMain">
        {active !== "agent-chat" && <RunnerAttentionList/>}
        {UI_PREVIEW && (
          <div className="previewModeBanner" role="status">
            <strong>PR PREVIEW</strong>
            <span>{tr("Interactive Arc demo · simulated data · no real accounts, tools, models or payments", "Arc 交互演示 · 模拟数据 · 不连接真实账号、工具、模型或支付")}</span>
            <a href="/device">{tr("Preview onboarding", "预览配对流程")} →</a>
          </div>
        )}
        <header className="mobileTopbar">
          {workspace === "agent" && <button className="arcWorkspaceMobileMenu" type="button" aria-label={tr("Open workspace navigation","打开工作空间导航")} onClick={()=>setArcNavigationOpen(true)}><ProductIcon name="menu"/></button>}<Brand/>
          {renderWorkspacePicker(true)}
          <div className="mobileActions"><ThemeSwitcher compact/></div>
        </header>

        {workspace === "agent" && <div className="arcChatMount" hidden={active !== "agent-chat"}>
          <React.Suspense fallback={<WorkspaceLoading label={tr("Opening Arc…","正在打开 Arc…")} variant="rows"/>}><ArcNativeChat
            key={user.id + ":" + arcEntry.version}
            initialPrompt={arcEntry.prompt}
            initialReferences={arcEntry.references}
            initialSessionId={arcEntry.sessionId}
            tr={tr}
            activeTab={active}
            navigationOpen={arcNavigationOpen}
            onNavigationChange={setArcNavigationOpen}
            onOpenChat={() => navigateTab("agent-chat")}
            accountId={user.id}
            accountName={user.name}
            totalDevices={devices.length}
            onlineDevices={devices.filter((device) => device.status === "online").length}
            onOpenGoals={() => navigateTab("agent-goals")}
            onOpenActivity={() => navigateTab("agent-activity")}
            onOpenSettings={() => navigateTab("agent-settings")}
            onOpenRoutines={() => navigateTab("agent-goals")}
            onManageApps={() => navigateTab("agent-apps")}
            onManageDevices={() => navigateTab("agent-devices")}
            onManageSkills={() => navigateTab("agent-skills")}
            onManageTeams={() => navigateTab("agent-teams")}
          /></React.Suspense>
        </div>}

        {active === "automations" && <ConnectTasks devices={devices} onConnectAI={()=>navigateTab("connect")}/>}

        {['agent-goals','agent-routines','agent-activity'].includes(active) && <ArcWorkWorkspace view={active==='agent-routines'?'routines':active==='agent-activity'?'activity':'tasks'} tr={tr} onChat={openArcChat}/>}

        {active === "agent-teams" && <section className="arcTeammatesPage"><header className="overviewTopbar"><div><span className="eyebrow">ARC / {tr('AGENTS','智能体')}</span><h1>{tr('Agents','智能体')}</h1><p>{tr('Choose who helps with your next goal. Review roles and access, then continue in Chat.','选择协助下一个目标的智能体，查看分工与权限，然后在 Chat 中推进工作。')}</p></div></header><React.Suspense fallback={<WorkspaceLoading label={tr('Loading agents…','正在读取智能体…')} variant="cards"/>}><ArcTeammates accountId={user.id} tr={tr} onWork={(prompt,reference)=>openArcChat(prompt,undefined,reference?[reference]:undefined)}/></React.Suspense></section>}
        {active === "agent-skills" && <React.Suspense fallback={<WorkspaceLoading label={tr('Loading skills…','正在加载技能…')} variant="rows"/>}><ArcSkills tr={tr} onChat={openArcChat}/></React.Suspense>}

        {active === "overview" && (
          <>
            <section className="overviewTopbar">
              <div>
                <span className="eyebrow">{tr("OVERVIEW", "概览")}</span>
                <OverviewGreeting name={user.name} tr={tr}/>
                <p>{tr("Your connections, recent work and everything that needs your attention.", "连接状态、最近的工作，以及所有需要你关注的事。")}</p>
              </div>
              <div className="overviewActions">
                <button className="ghostButton" onClick={() => setShowAdd(true)}>+ {tr("Add device", "添加设备")}</button>
                <button className="addButton arcRadiantCta" onClick={() => navigateTab("connect")}><ProductIcon name="link"/>{tr("Connect your AI", "连接你的 AI")}</button>
              </div>
            </section>
            <UsageConversionBanner usage={usage} pricingUrl={MARKETING_ORIGIN + (locale==="zh"?"/zh/pricing":"/pricing")} onManagePlan={()=>{navigateTab("settings");const target=new URL(location.href);target.searchParams.set("section","billing");history.replaceState(history.state,"",target);window.dispatchEvent(new PopStateEvent("popstate"));}} />
            <section className="overviewStatusGrid">
              <article className="overviewStatusCard"><div className="statusCardHead"><span>{tr("Devices online", "在线设备")}</span><i className={"healthDot " + ((status?.onlineDevices ?? 0) > 0 ? "good" : "idle")} /></div><strong>{status?.onlineDevices ?? 0} / {status?.totalDevices ?? devices.length}</strong><small>{tr("Ready for MCP calls", "可接受 MCP 调用")}</small></article>
                             <article className="overviewStatusCard"><div className="statusCardHead"><span>{tr('Connected Apps','应用连接')}</span><ProductIcon name="apps"/></div><strong>{tr('Your tools','你的工具')}</strong><button className="ghostButton overviewManageLink" onClick={()=>navigateTab('apps')}>{tr('Manage connections','管理连接')}<ProductIcon name="arrowUpRight" size={14}/></button></article>
              <article className="overviewStatusCard"><div className="statusCardHead"><span>{tr("Monthly usage", "本月用量")}</span><span>{usage?.unlimited ? tr("Unlimited", "无限") : Math.round(usagePct) + "%"}</span></div><strong>{(usage?.used ?? 0).toLocaleString()}</strong><div className="miniUsageBar"><i style={{ width: (usage?.unlimited ? 0 : usagePct) + "%" }} /></div><small>{usage?.unlimited ? tr("Unlimited Connect calls", "无限 Connect 调用") : tr("of", "共") + " " + usageLimitLabel + " " + tr("hosted calls", "次托管调用")}</small></article>
              <article className="overviewStatusCard endpoint"><div className="statusCardHead"><span>Remote MCP</span><span className="privacyPill">{tr("Secure", "安全")}</span></div><code>{mcpEndpoint}</code><div className="statusCardActions"><CopyButton value={mcpEndpoint} label={tr("Copy", "复制")} /><button className="ghostButton" onClick={() => navigateTab("connect")}>{tr("Manage", "管理")}</button></div></article>
            </section>

            <section className="overviewQuickGrid">
              <article className="overviewQuickCard">
                <span className="eyebrow">{tr("QUICK ACTIONS", "快捷操作")}</span>
                <div className="quickActionList">
                  <button onClick={() => setShowAdd(true)}><span><ProductIcon name="add"/></span><div><strong>{tr("Pair a computer", "配对电脑")}</strong><small>{tr("Add Windows, macOS or Linux", "添加 Windows、macOS 或 Linux")}</small></div></button>
                  <button onClick={() => navigateTab("connect")}><span><ProductIcon name="link"/></span><div><strong>{tr("Connect an AI client", "连接 AI 客户端")}</strong><small>ChatGPT · Claude · Remote MCP</small></div></button>
                  <button onClick={() => navigateTab("security")}><span><ProductIcon name="shield"/></span><div><strong>{tr("Review security", "检查安全设置")}</strong><small>{tr("Sessions, scopes and device policies", "会话、Scope 与设备权限")}</small></div></button>
                  <button onClick={() => navigateTab("apps")}><span><ProductIcon name="apps"/></span><div><strong>{tr("Connect your apps", "连接应用")}</strong><small>{tr("One account connection, available to your AI", "连接账号，让 AI 可以使用你的应用")}</small></div></button>
                </div>
              </article>
              <article className="overviewAttentionCard">
                <span className="eyebrow">{tr("ATTENTION", "需要关注")}</span>
                <div className="attentionList">
                  {!!automationAttentionCount && <button onClick={() => navigateTab('automations')}><i className="attentionIcon warn">!</i><div><strong>{automationAttentionCount} {tr("task(s) need attention", "项任务需要处理")}</strong><small>{tr("Ask your connected AI to review saved work and continue it.", "让已连接的 AI 检查保存的工作并继续处理。")}</small></div></button>}
                  {automationLoadError && <button onClick={() => void refreshAutomations()}><i className="attentionIcon warn">!</i><div><strong>{tr("Task status unavailable", "任务状态暂不可用")}</strong><small>{tr("Retry to see current progress.", "点击重试以查看当前进度。")}</small></div></button>}
                  {!devices.length && <button onClick={() => setShowAdd(true)}><i className="attentionIcon warn">!</i><div><strong>{tr("No computer paired", "还没有配对电脑")}</strong><small>{tr("Pair your first device to start using Remote Arc.", "先配对第一台设备即可开始使用 Remote Arc。")}</small></div></button>}
                  {!!devices.length && devices.some((device) => device.status === "offline") && <button onClick={() => navigateTab("devices")}><i className="attentionIcon idle">•</i><div><strong>{tr("Some devices are offline", "部分设备离线")}</strong><small>{devices.filter((device) => device.status === "offline").length} {tr("device(s) unavailable for MCP calls", "台设备当前无法接受 MCP 调用")}</small></div></button>}
                  {usagePct >= 80 && <button onClick={() => navigateTab("settings")}><i className="attentionIcon warn">!</i><div><strong>{tr("Usage is getting high", "本月额度使用较高")}</strong><small>{Math.round(usagePct)}% {tr("of your monthly hosted allowance is used", "的每月托管额度已使用")}</small></div></button>}
                  {(status?.onlineDevices ?? 0) > 0 && !hasAttention && !automationLoadError && <div className="attentionClear"><i>✓</i><div><strong>{tr("Everything looks good", "当前状态良好")}</strong><small>{tr("Devices are online and no tasks need attention.", "设备在线，目前没有待处理任务。")}</small></div></div>}
                </div>
              </article>
            </section>

            <section className="overviewMainGrid">
              <div className="panelBlock overviewDevicesPanel">
                <div className="blockHeader"><div><span className="eyebrow">{tr("DEVICES", "设备")}</span><h2>{tr("Device status", "设备状态")}</h2></div><button className="ghostButton" onClick={() => navigateTab("devices")}>{tr("Manage", "管理")}</button></div>
                <div className="overviewDeviceList">
                  {devices.slice().sort((a,b) => Number(b.status === "online") - Number(a.status === "online")).slice(0,5).map((device) => (
                    <button className="overviewDeviceRow" key={device.id} onClick={() => navigateTab("devices")}>
                      <div className="deviceIcon"><ProductIcon name="device"/></div>
                      <div><strong>{device.name}</strong><span>{platformLabel(device.platform)} · {device.hostname || tr("No hostname", "无 Hostname")}</span></div>
                      <div className="overviewDeviceMeta"><span>{device.tools.length} tools</span><small>{timeAgo(device.last_seen)}</small></div>
                      <span className={"badge " + device.status}><i/>{device.status === "online" ? tr("Online", "在线") : tr("Offline", "离线")}</span>
                    </button>
                  ))}
                  {!devices.length && <button className="overviewDeviceRow empty" onClick={() => setShowAdd(true)}><div className="deviceIcon">＋</div><div><strong>{tr("Add your first computer", "添加第一台电脑")}</strong><span>{tr("One command, then approve in your browser", "一条命令，然后在浏览器确认")}</span></div></button>}
                </div>
              </div>

              <div className="panelBlock overviewActivityPanel">
                <div className="blockHeader"><div><span className="eyebrow">{tr("RECENT ACTIVITY", "最近活动")}</span><h2>{tr("What Remote Arc did", "Remote Arc 最近做了什么")}</h2></div><span className="privacyPill">{tr("Arguments not logged", "不记录参数")}</span></div>
                <div className="activityList">
                  {(status?.recentActivity || []).map((event) => (
                    <div className="activityItem" key={event.id}><i className={event.success ? "eventIcon success" : "eventIcon failed"}>{event.success ? "✓" : "!"}</i><div><strong>{eventLabel(event)}</strong><span>{event.client_name || event.client_id?.slice(0,12) || tr("Unknown client", "未知客户端")} · {event.device_id ? deviceNameById.get(event.device_id) || event.device_id.slice(0,8) : tr("Account", "账户")} · {timeAgo(event.created_at)}{event.request_id ? " · req " + event.request_id.slice(0,8) : ""}</span></div></div>
                  ))}
                  {!status?.recentActivity?.length && <div className="activityEmpty"><strong>{tr("No activity yet", "暂无活动")}</strong><span>{tr("Pair a device or call a tool from your AI client.", "配对设备或从 AI 客户端发起工具调用。")}</span></div>}
                </div>
              </div>
            </section>


          </>
        )}

        {(active === "devices" || active === "agent-devices") && (
          <>
            <section className="overviewTopbar devicesPageHeader">
              <div>
                <span className="eyebrow">{tr("DEVICES", "设备")}</span>
                <h1>{tr("Your device fleet", "你的设备集群")}</h1>
                <p>{tr("Your computers, their capabilities, and where the next task should run.", "查看电脑、可用能力，以及下一项任务适合在哪里执行。")}</p>
              </div>
              <button className="addButton arcRadiantCta" onClick={() => setShowAdd(true)}><ProductIcon name="add"/>{tr("Add device", "添加设备")}</button>
            </section>

            <DeviceFleetOverview devices={devices} tr={tr} onChat={arcAvailable ? ()=>openArcChat(tr("Choose a suitable computer for my next task. Check my fleet capabilities and load, and ask what I need done.","为我的下一项任务选择合适电脑，先检查设备能力和负载，再确认我要做什么。")) : undefined}/>
            <section className="deviceToolbar">
              <div className="deviceSearch">
                <ProductIcon name="search"/>
                <input aria-label={tr("Search devices", "搜索设备")} value={deviceQuery} onChange={(event) => setDeviceQuery(event.target.value)} placeholder={tr("Search devices, hostname or ID", "搜索设备、Hostname 或 ID")} />
              </div>
              <div className="deviceFilters" role="group" aria-label={tr("Device status filter", "设备状态筛选")}>
                {(["all", "online", "offline"] as const).map((filter) => (
                  <button key={filter} aria-pressed={deviceFilter === filter} className={deviceFilter === filter ? "active" : ""} onClick={() => setDeviceFilter(filter)}>
                    {filter === "all" ? tr("All", "全部") : filter === "online" ? tr("Online", "在线") : tr("Offline", "离线")}
                    <span>{filter === "all" ? devices.length : devices.filter((device) => device.status === filter).length}</span>
                  </button>
                ))}
              </div>
            </section>

            <div className="deviceGrid rich deviceManagementGrid">
              {filteredDevices.map((device) => {
                const advertisedTools = device.available_tools || device.tools;
                const enabledTools = device.allowed_tools == null ? advertisedTools : device.allowed_tools;
                // Extension 0.4.0 tab opening and actions follow its click & fill switch.
                const allTools = Array.from(new Set([...DEVICE_TOOL_CATALOG, ...advertisedTools, ...enabledTools])).filter((tool) => !isBrowserRunnerTool(tool) && tool !== "browser_open_tab" && tool !== "browser_act");
                const runnerAdvertised = device.status !== "online" || BROWSER_RUNNER_TOOLS.every((tool) => advertisedTools.includes(tool));
                const runnerEnabled = browserRunnerEnabled(device.allowed_tools);
                const runnerVisible = device.platform !== "browser" && (runnerEnabled || BROWSER_RUNNER_TOOLS.some((tool) => advertisedTools.includes(tool)) || device.status === "online");
                const accessPreset = deviceAccessPreset(enabledTools, advertisedTools);
                const executionLog = executionLogsByDevice[device.id];
                const executionLogError = executionLogErrors[device.id];
                const runtimeVersion = device.agent_version
                  ? device.platform === "browser"
                    ? device.agent_version.replace(/^browser-/, "")
                    : device.agent_version
                  : null;
                const recoveryVersion = device.recovery_bundle_version || null;
                const updateAvailable =
                  device.platform !== "browser" &&
                  Boolean(runtimeVersion) &&
                  isOlderRelease(runtimeVersion, LATEST_AGENT_VERSION);
                const updateCommand =
                  device.background_enabled === true
                    ? goUpdateCommands(LATEST_AGENT_VERSION, true).join("\n")
                    : goUpdateCommands(LATEST_AGENT_VERSION, false).join("\n");
                return (
                  <article className={"deviceCard managed " + device.status} key={device.id}>
                    <div className="deviceTop">
                      <div className="deviceIdentity">
                        <div className="deviceIcon large"><ProductIcon name="device"/></div>
                        <div><h3>{device.name}</h3><span>{platformLabel(device.platform)} · {device.hostname || tr("No hostname", "未提供主机名")}</span></div>
                      </div>
                      <div className="deviceOverviewActions">
                        {updateAvailable && <span className="badge updateAvailable"><i/>{tr("Update available", "可更新")}</span>}
                        <span className={"badge " + device.status}><i/>{device.status === "online" ? tr("Online", "在线") : tr("Offline", "离线")}</span>
                        <button className="ghostButton" aria-expanded={managedDeviceId === device.id} aria-controls={"device-management-" + device.id} aria-label={tr("Manage " + device.name, "管理 " + device.name)} onClick={() => { setManagedDeviceId(managedDeviceId === device.id ? null : device.id); setDevicePanel("access"); }}>{managedDeviceId === device.id ? tr("Close", "收起") : tr("Manage", "管理")}</button>
                      </div>
                    </div>

                    <DeviceCapacity device={device} tr={tr}/>
                    <div className="deviceOverviewFacts">
                      <span><ProductIcon name="shield" size={13}/>{accessPreset === "safe" ? tr("Read only", "只读访问") : accessPreset === "developer" ? tr("Read & edit", "读取与编辑") : accessPreset === "full" ? tr("Terminal enabled", "已启用终端") : tr("Custom permissions", "自定义权限")}</span>
                      <span className="deviceRuntimeVersion"><ProductIcon name="activity" size={13}/>{device.platform === "browser" ? tr("Browser", "浏览器") : tr("Running", "运行中")} {runtimeVersion ? "v" + runtimeVersion : tr("version unknown", "版本未知")}{device.platform !== "browser" && recoveryVersion && recoveryVersion !== runtimeVersion ? " · " + tr("Recovery", "恢复包") + " v" + recoveryVersion : ""}{updateAvailable ? " · " + tr("Latest", "最新") + " v" + LATEST_AGENT_VERSION : ""}</span>
                      <span>{(device.workspace_roots || []).length} {tr("trusted folders", "个可信目录")}</span>
                      <span>{device.background_guard_active ? tr("Recovery supervisor running", "恢复守护运行中") : device.background_enabled ? tr("Startup configured · recovery unconfirmed", "自启已配置，恢复待确认") : tr("Automatic recovery off", "自动恢复关闭")}</span>
                      <span>{tr("Seen ", "最后在线：")}{timeAgo(device.last_seen)}</span>
                    </div>
                    {device.status === "offline" && <p className="deviceOfflineHint">{tr("Tasks wait until this computer reconnects. Remote Arc cannot power it on.", "任务会等待这台电脑重新连接，Remote Arc 无法远程开机。")}</p>}
                    <div id={"device-management-" + device.id} hidden={managedDeviceId !== device.id} className="deviceManagementPanel">
                      {managedDeviceId === device.id && <>
                        <div className="deviceManagementTabs" role="tablist" aria-label={tr("Device settings", "设备设置")}>
                          {([ ["access", tr("Access & files", "权限与文件")], ["tasks", tr("Background & tasks", "后台与任务")], ["activity", tr("Activity & details", "活动与详情")] ] as const).map(([panel, label]) => <button key={panel} type="button" role="tab" id={"device-tab-"+device.id+"-"+panel} aria-controls={"device-panel-"+device.id+"-"+panel} aria-selected={devicePanel === panel} tabIndex={devicePanel===panel?0:-1} className={devicePanel === panel ? "active" : ""} onKeyDown={event=>{const tabs=Array.from(event.currentTarget.parentElement!.querySelectorAll<HTMLButtonElement>('[role=tab]'));const index=tabs.indexOf(event.currentTarget);const next=event.key==='ArrowRight'?(index+1)%tabs.length:event.key==='ArrowLeft'?(index+tabs.length-1)%tabs.length:event.key==='Home'?0:event.key==='End'?tabs.length-1:null;if(next!==null){event.preventDefault();tabs[next]?.focus();tabs[next]?.click();}}} onClick={() => {
                            setDevicePanel(panel);
                            if (
                              panel === "activity" &&
                              device.status === "online" &&
                              !executionLog &&
                              executionLogLoading !== device.id
                            ) {
                              void loadDeviceExecutionLog(device);
                            }
                          }}>{label}</button>)}
                        </div>
                        <section role="tabpanel" id={"device-panel-"+device.id+"-access"} aria-labelledby={"device-tab-"+device.id+"-access"} aria-label={tr("Access and files", "权限与文件")} hidden={devicePanel !== "access"}>
                    <div className="deviceAccessSummary">
                      <div>
                        <span className="eyebrow">{tr("MCP ACCESS", "MCP 权限")}</span>
                        <strong>
                          {accessPreset === "safe"
                            ? tr("Safe · read-only", "Safe · 只读")
                            : accessPreset === "developer"
                              ? tr("Developer · files can be edited", "Developer · 可编辑文件")
                              : accessPreset === "full"
                                ? tr("Full access · terminal enabled", "Full Access · 已启用终端")
                                : tr("Custom tool policy", "自定义工具权限")}
                        </strong>
                        <p>{tr("New devices start in Safe. Enable only the skills you want this AI to use.", "新设备默认使用 Safe，只开启你愿意交给 AI 的技能。")}</p>
                      </div>

                    </div>

                    <div className="devicePresetRow">
                      <span>{tr("Quick presets", "快捷预设")}</span>
                      <div>
                        <button className={accessPreset === "safe" ? "active" : ""} onClick={() => void applyDevicePreset(device, "safe")}>
                          <strong>Safe</strong><small>{tr("Read only", "只读")}</small>
                        </button>
                        <button className={accessPreset === "developer" ? "active" : ""} onClick={() => void applyDevicePreset(device, "developer")}>
                          <strong>Developer</strong><small>{tr("Read + edit", "读写文件")}</small>
                        </button>
                        <button className={accessPreset === "full" ? "active danger" : "danger"} onClick={() => void applyDevicePreset(device, "full")}>
                          <strong>Full</strong><small>{tr("Terminal", "含终端")}</small>
                        </button>
                      </div>
                    </div>

                    <details className="deviceToolDetails">
                      <summary><span className="deviceDisclosureTitle"><ProductIcon name="settings" size={16}/>{tr("Manage individual skills", "逐项管理技能")}</span><span>{enabledTools.filter((tool) => !isBrowserRunnerTool(tool)).length + (runnerVisible && runnerEnabled ? 1 : 0)} / {allTools.length + (runnerVisible ? 1 : 0)}<ProductIcon name="chevron" size={14}/></span></summary>
                      <div className="toolToggleGrid">
                        {runnerVisible && (
                          <label className={"toolToggle" + (!runnerAdvertised ? " unavailable" : "")} key="browser_runner">
                            <input type="checkbox" checked={runnerEnabled} disabled={!runnerAdvertised && !runnerEnabled} onChange={(event) => void updateDeviceTools(device, "browser_runner_act", event.target.checked)} />
                            <span className="skillLabel">
                              <strong>browser_runner</strong>
                              <HelpTip
                                label={tr("About browser_runner", "了解 browser_runner")}
                                text={runnerAdvertised
                                  ? tr("Lets your AI open, read and act on websites, only on the sites each task names. It uses a hidden Remote Arc window (installed Chrome, Edge or Chromium) with its own sign-ins, which appears only when a page needs you and you are ready; your own Chrome is an advanced option used only when you ask for it. The AI never types passwords or card numbers, one-time codes can be filled from your connected email, and a submit is never sent twice.", "允许你的 AI 打开、读取和操作网站，只能访问每个任务指定的网站。使用隐藏的 Remote Arc 窗口（已安装的 Chrome、Edge 或 Chromium），有自己的登录状态，只有页面需要你、且你准备好时才出现；使用你自己的 Chrome 是高级选项，只有你要求时才用。AI 从不输入密码和卡号，验证码可以从你连接的邮箱里获取填写，提交不会重复发送。")
                                  : tr("Needs Remote Arc Agent 0.6.2-rc.4 or newer and Chrome, Edge or Chromium installed on this computer.", "需要 Remote Arc Agent 0.6.2-rc.4 或更新版本，并且这台电脑装有 Chrome、Edge 或 Chromium。")}
                              />
                            </span>
                          </label>
                        )}
                        {runnerEnabled && <RunnerAttentionSetting deviceId={device.id}/>}
                        {(runnerEnabled || device.platform === "browser") && <BrowserAuthSetting deviceId={device.id} browserExtension={device.platform === "browser"}/>}
                        {allTools.map((tool) => {
                          const enabled = device.allowed_tools == null ? (device.status === "online" ? advertisedTools.includes(tool) : true) : device.allowed_tools.includes(tool);
                          const advertised = device.status === "online" ? advertisedTools.includes(tool) : true;
                          const description =
                            tool === "read_binary_file"
                              ? tr("Read bounded binary byte ranges on every plan. This device switch and account authorization are still required.", "所有套餐均可读取有界的二进制字节区间。仍需账号授权并开启这个设备开关。")
                              : tool === "undo_last_change"
                              ? tr("AI permission: lets the connected AI invoke the newest Local Undo snapshot. Snapshot creation is controlled separately under Recovery below.", "AI 权限：允许已连接的 AI 调用最新一条 Local Undo 快照。是否创建快照由下方 Recovery 中的 Local Undo 单独控制。")
                              : tool === "start_process"
                                ? tr("Run shell commands on this computer.", "在这台电脑上执行 Shell 命令。")
                                : tool === "process_status" || tool === "process_output"
                                  ? tr("Inspect a Remote Arc managed background process.", "查看由 Remote Arc 管理的后台进程。")
                                  : tool === "stop_process"
                                    ? tr("Stop a Remote Arc managed background process.", "停止由 Remote Arc 管理的后台进程。")
                                    : tr("Allow this AI client to use this native Remote Arc skill.", "允许 AI 客户端使用这个 Remote Arc 原生技能。");
                          return (
                            <label className={"toolToggle" + (!advertised ? " unavailable" : "")} key={tool}>
                              <input type="checkbox" checked={enabled} disabled={!advertised} onChange={(event) => void updateDeviceTools(device, tool, event.target.checked)} />
                              <span className="skillLabel">
                                <strong>{tool}</strong>
                                <HelpTip
                                  label={tr("About " + tool, "了解 " + tool)}
                                  text={description}
                                />
                              </span>
                            </label>
                          );
                        })}
                      </div>
                      {device.status === "offline" && <span className="offlineTools">{tr("Offline: changes are saved now and enforced the next time this device connects.", "设备离线：修改会立即保存，并在设备下次连接时生效。")}</span>}
                    </details>

                    <details className="deviceSafetyDetails">
                      <summary>
                        <span className="deviceDisclosureTitle"><ProductIcon name="shield" size={16}/>{tr("File boundaries & recovery", "文件边界与恢复")}</span>
                        <span>
                          {(device.protect_sensitive_paths ?? true)
                            ? tr("Sensitive paths protected", "敏感路径已保护")
                            : tr("Sensitive protection off", "敏感路径保护已关闭")}
                          {" · "}
                          {(device.workspace_roots || []).length
                            ? (device.workspace_roots || []).length + " " + tr("workspaces", "个工作区")
                            : tr("read-only until scoped", "未设范围时仅只读")}<ProductIcon name="chevron" size={14}/>
                        </span>
                      </summary>

                      <div className="deviceSafetyBody">
                        {!device.policy_enforcement_available && device.status === "online" && (
                          <p className="policyWarning">{tr(
                            "This device is still running an older remotelink client. Policy settings are saved now, but symlink-safe local enforcement activates after you restart it with the latest npm release.",
                            "这台设备仍在运行旧版 remotelink。策略会立即保存，但防符号链接绕过的本机强制执行，需要用最新版 npm 客户端重启后才会生效。",
                          )}</p>
                        )}
                        <div className="policyToggleRow">
                          <div className="labelWithHelp">
                            <strong>{tr("Sensitive Path Policy", "敏感路径策略")}</strong>
                            <HelpTip
                              label={tr("About Sensitive Path Policy", "了解敏感路径策略")}
                              text={tr(
                                "Enabled by default. Protects built-in credential locations such as .ssh, .aws, browser profiles and .env files, plus extra protected paths. You can turn it off per device after a warning; prefer a narrow exception whenever possible.",
                                "默认开启。保护 .ssh、.aws、浏览器配置、.env 等内置敏感位置以及额外配置的保护路径。可以在确认风险后按设备关闭，但建议优先使用窄范围例外。",
                              )}
                            />
                          </div>
                          <label className="compactSwitch" title={tr("Sensitive Path Protection (enabled by default)", "敏感路径保护（默认开启）")}>
                            <input
                              type="checkbox"
                              checked={device.protect_sensitive_paths ?? true}
                              disabled={UI_PREVIEW || sensitivePolicyBusyId === device.id}
                              onChange={(event) => void updateSensitiveProtection(device, event.target.checked)}
                            />
                            <span />
                          </label>
                        </div>

                        {device.protect_sensitive_paths === false && (
                          <p className="policyWarning" role="alert">{tr(
                            "Sensitive Path Protection is OFF. Built-in and extra protected path rules are not applied to file tools. Connected AI clients can access credential paths if other tool and workspace permissions permit. Turn this back on when finished.",
                            "敏感路径保护已关闭。文件工具不再应用内置和额外保护路径规则；如果其他工具及工作区权限允许，已连接的 AI 可能访问凭证文件。使用结束后请重新开启。",
                          )}</p>
                        )}
                        <div className="policyBlock">
                          <div className="policyBlockHead">
                            <div className="labelWithHelp">
                              <strong>{tr("Trusted Write Locations", "可信写入区域")}</strong>
                              <HelpTip
                                label={tr("About Trusted Write Locations", "了解可信写入区域")}
                                text={tr(
                                  "These are trusted mutation roots. Read-only tools may inspect other non-sensitive paths, but file changes and terminal execution require a configured workspace.",
                                  "这些目录是长期可信的修改区域。只读工具仍可查看其他非敏感路径，但文件修改与终端执行必须先配置工作区。",
                                )}
                              />
                            </div>
                            <div className="policyHeaderActions">
                              <button className="ghostButton small" disabled={device.status !== "online"} onClick={() => void browseDeviceDirectories(device)}>
                                {tr("Browse folders", "浏览目录")}
                              </button>
                              <button className="ghostButton small" onClick={() => void addPolicyPath(device, "workspace_roots")}>
                                + {tr("Enter path", "输入路径")}
                              </button>
                            </div>
                          </div>
                          <div className="policyPathList">
                            {(device.workspace_roots || []).map((root) => (
                              <span className="policyPathChip" key={root}>
                                <code>{root}</code>
                                <button
                                  title={tr("Remove", "移除")}
                                  onClick={() => void removePolicyPath(device, "workspace_roots", root)}
                                >×</button>
                              </span>
                            ))}
                            {!(device.workspace_roots || []).length && (
                              <span className="policyEmpty">{tr(
                                "No trusted write workspace yet. Read-only access to non-sensitive paths still works.",
                                "尚未设置可信写入工作区；仍可只读访问其他非敏感路径。",
                              )}</span>
                            )}
                          </div>
                          {enabledTools.includes("start_process") && !!(device.workspace_roots || []).length && (
                            <p className="policyWarning">{tr(
                              "Full terminal access is not an OS sandbox. Remote Arc requires an in-scope cwd, but shell commands may still reference other paths. Use Developer mode when strict file confinement matters.",
                              "Full 终端并不是操作系统级沙箱。Remote Arc 会要求 cwd 位于工作区内，但 Shell 命令仍可能引用其他路径；需要严格文件隔离时请使用 Developer 模式。",
                            )}</p>
                          )}
                        </div>

                        <div className="policyBlock">
                          <div className="policyBlockHead">
                            <div className="labelWithHelp">
                              <strong>{tr("Extra protected paths", "额外保护路径")}</strong>
                              <HelpTip
                                label={tr("About extra protected paths", "了解额外保护路径")}
                                text={tr(
                                  "Add private folders that should remain blocked in addition to Remote Arc's built-in sensitive locations.",
                                  "在内置敏感位置之外，再添加不希望 AI 访问的私有目录。",
                                )}
                              />
                            </div>
                            <button className="ghostButton small" onClick={() => void addPolicyPath(device, "sensitive_paths")}>
                              + {tr("Protect path", "保护路径")}
                            </button>
                          </div>
                          <div className="policyPathList">
                            {(device.sensitive_paths || []).map((root) => (
                              <span className="policyPathChip protected" key={root}>
                                <code>{root}</code>
                                <button
                                  title={tr("Remove", "移除")}
                                  onClick={() => void removePolicyPath(device, "sensitive_paths", root)}
                                >×</button>
                              </span>
                            ))}
                            {!(device.sensitive_paths || []).length && (
                              <span className="policyEmpty">{tr(
                                "Built-in sensitive paths only.",
                                "当前仅使用内置敏感路径。",
                              )}</span>
                            )}
                          </div>
                        </div>

                        <div className="policyBlock">
                          <div className="policyBlockHead">
                            <div className="labelWithHelp">
                              <strong>{tr("Sensitive path exceptions", "敏感路径例外")}</strong>
                              <HelpTip
                                label={tr("About sensitive path exceptions", "了解敏感路径例外")}
                                text={tr(
                                  "Keep protection enabled globally, but explicitly allow only the sensitive files or folders this device truly needs. A sensitive-path exception grants visibility only; it does not create write authority outside Trusted Write Locations.",
                                  "保持整体敏感路径保护开启，只对确实需要访问的敏感文件或目录做窄范围例外；敏感路径例外只授予可见性，不会自动获得可信写入区域之外的修改权限。",
                                )}
                              />
                            </div>
                            <button
                              className="ghostButton small"
                              onClick={() => void addPolicyPath(device, "sensitive_allow_paths")}
                            >
                              + {tr("Allow exception", "添加例外")}
                            </button>
                          </div>
                          <div className="policyPathList">
                            {(device.sensitive_allow_paths || []).map((root) => (
                              <span className="policyPathChip exception" key={root}>
                                <code>{root}</code>
                                <button
                                  title={tr("Remove", "移除")}
                                  onClick={() => void removePolicyPath(device, "sensitive_allow_paths", root)}
                                >×</button>
                              </span>
                            ))}
                            {!(device.sensitive_allow_paths || []).length && (
                              <span className="policyEmpty">{tr(
                                "No sensitive-path exceptions.",
                                "当前没有敏感路径例外。",
                              )}</span>
                            )}
                          </div>

                        </div>

                        <div className="policyToggleRow undoPolicyToggle">
                          <div className="labelWithHelp">
                            <strong>{tr("Create Local Undo snapshots", "创建 Local Undo 快照")}</strong>
                            <HelpTip
                              label={tr("About Local Undo snapshots", "了解 Local Undo 快照")}
                              text={tr(
                                "Recovery setting: when enabled, supported file edits save the previous state on this computer. This is separate from the undo_last_change skill, which only controls whether AI may invoke an existing snapshot.",
                                "恢复设置：开启后，支持的文件修改会先在本机保存修改前状态。它和 undo_last_change 技能是两件事；后者只控制 AI 是否能调用已有快照。",
                              )}
                            />
                          </div>
                          <label className="compactSwitch">
                            <input
                              type="checkbox"
                              checked={device.undo_enabled ?? true}
                              onChange={(event) => void saveDevicePolicy(device, {
                                undo_enabled: event.target.checked,
                              })}
                            />
                            <span />
                          </label>
                        </div>

                        <div className="undoHistorySection">
                          <div className="policyBlockHead">
                            <div className="labelWithHelp">
                              <strong>{tr("Undo history", "撤销历史")}</strong>
                              <HelpTip
                                label={tr("About Undo history", "了解撤销历史")}
                                text={tr(
                                  "Loaded directly from the device on demand; this history is not persisted in the cloud.",
                                  "仅在需要时直接从设备读取，历史记录不会持久化到云端。",
                                )}
                              />
                            </div>
                            <button
                              className="ghostButton small"
                              disabled={
                                device.status !== "online" ||
                                !device.undo_history_available ||
                                undoLoading === device.id
                              }
                              onClick={() => void loadUndoHistory(device)}
                            >
                              {undoLoading === device.id ? tr("Loading…", "加载中…") : tr("Refresh", "刷新")}
                            </button>
                          </div>

                          {!device.undo_history_available && (
                            <p className="policyNotice">{tr(
                              "Undo history UI requires the latest remotelink client. Restart this device with the current npm release after the update is published.",
                              "撤销历史 UI 需要最新版 remotelink 客户端。新版本发布后，请用最新 npm 版本重启这台设备。",
                            )}</p>
                          )}

                          {!!undoErrors[device.id] && (
                            <p className="policyWarning">{undoErrors[device.id]}</p>
                          )}

                          {!!undoByDevice[device.id]?.length && (
                            <div className="undoActionList">
                              {(undoByDevice[device.id] || []).map((action) => (
                                <div className="undoActionRow" key={action.id}>
                                  <div>
                                    <strong>{action.tool}</strong>
                                    <code title={action.path}>{action.path}</code>
                                    <small>
                                      {timeAgo(action.created_at)}
                                      {" · "}
                                      {action.existed_before
                                        ? tr("restore previous content", "恢复原有内容")
                                        : tr("remove created file", "删除新建文件")}
                                      {" · "}
                                      {action.status === "ready"
                                        ? tr("ready", "可撤销")
                                        : action.status === "conflict"
                                          ? tr("conflict: file changed again", "冲突：文件后来又被修改")
                                          : action.status === "missing"
                                            ? tr("target missing", "目标文件已不存在")
                                            : tr("legacy snapshot", "旧版快照")}
                                    </small>
                                  </div>
                                  <button
                                    className="ghostButton small"
                                    disabled={
                                      undoLoading === device.id ||
                                      !(device.undo_enabled ?? true) ||
                                      !action.can_undo
                                    }
                                    title={
                                      action.can_undo
                                        ? tr("Restore this local snapshot", "恢复这个本机快照")
                                        : tr("Automatic undo is unavailable because the current file no longer matches the recorded post-edit state.", "当前文件已不再匹配当时修改后的状态，自动撤销不可用。")
                                    }
                                    onClick={() => void restoreUndoAction(device, action)}
                                  >
                                    {action.can_undo ? tr("Undo", "撤销") : tr("Unavailable", "不可撤销")}
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}

                          {undoByDevice[device.id] !== undefined && !(undoByDevice[device.id] || []).length && !undoErrors[device.id] && (
                            <p className="policyEmpty">{tr(
                              "No reversible Remote Arc file changes are currently stored.",
                              "当前没有可撤销的 Remote Arc 文件修改。",
                            )}</p>
                          )}
                        </div>
                      </div>
                    </details>

                        </section>
                        <section role="tabpanel" id={"device-panel-"+device.id+"-tasks"} aria-labelledby={"device-tab-"+device.id+"-tasks"} aria-label={tr("Background and tasks", "后台与任务")} hidden={devicePanel !== "tasks"}>
                    {updateAvailable && (
                      <div className="deviceBackgroundRow deviceUpdateRow">
                        <div>
                          <strong>{tr("Remote Arc update available", "Remote Arc 有可用更新")}</strong>
                          <span>{tr("Running: ", "运行版本：")}v{runtimeVersion} · {tr("Latest: ", "最新版本：")}v{LATEST_AGENT_VERSION}</span>
                          {recoveryVersion && <span>{tr("Installed recovery bundle: ", "已安装恢复包：")}v{recoveryVersion}</span>}
                          <span>{tr("Run the upgrade command on this computer. An older idle Agent is replaced automatically; active work asks for confirmation. Pairing, permissions and your recovery setting are preserved.", "在这台电脑上执行升级命令。旧版 Agent 空闲时会自动接替；有任务运行时会先询问确认。配对、权限和恢复设置会保留。")}</span>
                        </div>
                        <button className="ghostButton small" onClick={async () => {
                          try {
                            if (navigator.clipboard) await navigator.clipboard.writeText(updateCommand);
                            await showNotice(
                              tr("Upgrade Remote Arc", "升级 Remote Arc"),
                              updateCommand + (navigator.clipboard ? "\n\n" + tr("Copied to clipboard.", "已复制到剪贴板。") : ""),
                            );
                          } catch {
                            await showNotice(tr("Upgrade Remote Arc", "升级 Remote Arc"), updateCommand);
                          }
                        }}>{tr("Copy upgrade command", "复制升级命令")}</button>
                      </div>
                    )}
                    <div className="deviceBackgroundRow" aria-busy={backgroundUpdatingId === device.id}>
                      <div>
                        <div className="labelWithHelp">
                          <strong>{tr("Automatic recovery", "自动恢复")}</strong>
                          <HelpTip label={tr("About automatic recovery", "了解自动恢复")}
                            text={tr("The switch enables a local supervisor and login startup. It keeps your terminal and operation log open, and takes over if the executing Agent ends. Relay reconnect handles network interruptions separately. Turning recovery off preserves current execution; Stop background Agent also ends its work. Sleep, shutdown and logout can still make the device unavailable.", "此开关启用本机守护和登录自启，保留终端及操作日志，执行 Agent 结束后由守护接手。网络中断由独立的 Relay 重连处理。关闭恢复会保留当前执行；“停止后台 Agent”还会结束它的工作。睡眠、关机或退出登录仍可能让电脑不可用。")}/>
                        </div>
                        <span>{backgroundUpdatingId === device.id
                          ? backgroundPhase === "applying" ? tr("Sending device command…", "正在发送设备指令…") : backgroundPhase === "stopping" ? tr("Waiting for Agent to disconnect…", "正在等待 Agent 离线…") : tr("Waiting for supervisor confirmation…", "正在确认后台守护进程…")
                          : device.status !== "online" ? tr("Reconnect to verify the local recovery setting", "重新连接后可确认本机恢复设置") : device.background_recovery_available
                          ? device.background_enabled ? tr("Enabled · login startup and process recovery", "已启用 · 登录自启与进程恢复") : tr("Off · current execution continues", "已关闭 · 当前执行继续")
                          : tr("Older client · login startup only. Update to keep the terminal attached and recover processes.", "旧版客户端仅提供登录自启。更新客户端后支持保留终端与进程恢复。")}</span>
                        <span>{tr("Supervisor: ", "守护：")}{device.background_guard_active
                          ? tr("Running", "运行中") + (device.background_guard_pid ? " · PID " + device.background_guard_pid : "")
                          : device.status !== "online" ? tr("Unconfirmed while offline", "离线，无法确认") : tr("Not confirmed", "尚未确认")}</span>
                        <span>{tr("Execution: ", "执行：")}{device.status !== "online" ? tr("Disconnected from Relay", "Relay 已断开")
                          : device.execution_paused === true ? tr("Paused · wake-only control connected", "已暂停 · 仅唤醒控制通道在线")
                          : device.execution_mode === "foreground" ? tr("Foreground Agent connected", "前台 Agent 已连接")
                          : device.background_active ? tr("Background Agent connected", "后台 Agent 已连接") : tr("Agent connected", "Agent 已连接")}
                          {device.agent_pid ? " · PID " + device.agent_pid : ""}{device.agent_version ? " · v" + device.agent_version : ""}</span>
                      </div>
                      <div className="managedProcessActions backgroundRecoveryControls">
                        <span className="backgroundToggleProgress" data-pending={backgroundUpdatingId === device.id} id={"background-toggle-progress-" + device.id} role="status" aria-live="polite" aria-label={backgroundUpdatingId === device.id ? tr("Verifying background recovery on device", "正在设备上确认后台恢复") : undefined}>
                          <span className="backgroundToggleSpinner" aria-hidden="true" />
                        </span>
                        {device.background_enabled === true && device.background_guard_active !== true && device.status === "online" && device.background_recovery_available && (
                          <button className="ghostButton small" disabled={UI_PREVIEW || backgroundUpdatingId === device.id} onClick={() => void updateDeviceBackground(device, true, false)}>{tr("Repair recovery", "修复恢复")}</button>
                        )}
                        {device.status === "online" && (
                          <button
                            className="dangerButton small"
                            disabled={UI_PREVIEW || backgroundUpdatingId === device.id || !!runtimeUpdatingId || device.stop_agent_available !== true}
                            title={device.stop_agent_available ? tr("Disable auto-recovery and stop this computer's Agent.", "关闭自动恢复并停止此电脑的 Agent。") : tr("Update this computer's Agent to use remote Stop Agent.", "请先升级此电脑 Agent，才能远程停止。")}
                            onClick={async () => {
                              if (await askConfirm(
                                tr("Disconnect this computer completely?", "完全断开这台电脑？"),
                                tr("This disables BOTH the execution Agent and the wake-only connection, and turns off future automatic recovery. Remote Arc cannot remotely start a fully disconnected computer. You must restart it locally.", "这会同时停止执行 Agent 和仅唤醒连接，并关闭之后的自动恢复。完全断开后 Remote Arc 无法再远程启动这台电脑，必须从本机重新启动。"),
                              )) await updateDeviceBackground(device, false, true);
                            }}
                          >{device.stop_agent_available ? tr("Disconnect completely", "完全断开") : tr("Disconnect · update needed", "断开 · 需升级")}</button>
                        )}
                        <label className="compactSwitch">
                          <input type="checkbox" aria-label={tr("Automatic recovery", "自动恢复")}
                            checked={backgroundUpdatingId === device.id && backgroundTargetEnabled !== null ? backgroundTargetEnabled : device.background_enabled === true}
                            disabled={UI_PREVIEW || backgroundUpdatingId === device.id || !!runtimeUpdatingId || device.execution_paused === true || device.status !== "online" || !device.background_agent_available}
                            aria-describedby={backgroundUpdatingId === device.id ? "background-toggle-progress-" + device.id : undefined}
                            onChange={async (event) => {
                              const enabled = event.target.checked;
                              if (enabled && !device.background_recovery_available) {
                                await showNotice(tr("Update remotelink first", "请先更新 remotelink"), tr("This Agent predates process recovery and exits the terminal when enabling background mode. Use the updated CLI before enabling recovery.", "当前 Agent 尚不支持进程恢复，启用旧版后台模式会退出终端。请先使用更新后的 CLI 再启用恢复。")); return;
                              }
                              await updateDeviceBackground(device, enabled, false);
                            }}/><span/>
                        </label>
                      </div>
                    </div>

                    <div className="deviceBackgroundRow deviceRuntimePauseRow" aria-busy={runtimeUpdatingId === device.id}>
                      <div>
                        <strong>{tr("Execution control", "执行控制")}</strong>
                        <span>{runtimeUpdatingId === device.id
                          ? runtimeTargetPaused ? tr("Pausing execution and connecting the wake-only channel…", "正在停止执行并切换至仅唤醒通道…") : tr("Restoring the execution Agent…", "正在恢复执行 Agent…")
                          : device.status !== "online" ? tr("Fully disconnected · restart Remote Arc locally", "已完全断开 · 请在电脑本机启动 Remote Arc")
                          : device.execution_paused ? tr("Paused · computer tools are blocked; dashboard wake control stays connected", "已暂停 · 电脑操作已封锁，Dashboard 唤醒控制仍在线")
                          : tr("Running · AI computer tools can execute according to device permissions", "运行中 · AI 可按设备权限执行电脑操作")}</span>
                        <span>{tr("Pause keeps a minimal authenticated wake channel. Disconnect completely closes it as well.", "暂停时保留最小授权唤醒通道；完全断开则连该通道一起关闭。")}</span>
                      </div>
                      <div className="managedProcessActions backgroundRecoveryControls">
                        <span className="backgroundToggleProgress" data-pending={runtimeUpdatingId === device.id} role="status" aria-live="polite">
                          <span className="backgroundToggleSpinner" aria-hidden="true" />
                        </span>
                        <button className="ghostButton small"
                          disabled={UI_PREVIEW || !!backgroundUpdatingId || !!runtimeUpdatingId || device.status !== "online" || device.pause_agent_available !== true || (!device.execution_paused && (!device.background_enabled || !device.background_guard_active))}
                          title={device.pause_agent_available ? tr("Switch between full execution and wake-only control.", "切换完整执行和仅唤醒控制。") : tr("Upgrade remotelink for remote Pause / Resume.", "请升级 remotelink 后使用远程暂停与恢复。")}
                          onClick={async () => {
                            const resume = device.execution_paused === true;
                            if (!resume && !await askConfirm(
                              tr("Pause computer execution?", "暂停这台电脑的执行？"),
                              tr("Remote file/terminal tools will stop working and running managed operations may be interrupted. Only a minimal authenticated wake connection stays online so you can resume from Dashboard.", "远程文件与终端工具将不可用，正在执行的受管操作可能中断。设备仅保留最小授权唤醒连接，之后可通过 Dashboard 恢复。"),
                            )) return;
                            await updateDeviceRuntime(device, !device.execution_paused);
                          }}
                        >{device.pause_agent_available ? device.execution_paused ? tr("Resume Agent", "恢复 Agent") : tr("Pause Agent", "暂停 Agent") : tr("Pause / Resume · update needed", "暂停 / 恢复 · 需升级")}</button>
                      </div>
                    </div>

                    <details className="deviceTaskSettings" open>
                      <summary>{tr("Task permissions", "任务权限")}<span>{Object.values(device.automation_permissions || legacyTaskPermissions).filter(Boolean).length} / 5 {tr("enabled", "已开启")}</span></summary>
                      <p>{tr("Choose which background capabilities this computer allows. Describe tasks and routines in Arc Chat or your connected AI. Turning a permission off stops affected work.", "选择这台电脑允许使用的后台能力。在 Arc Chat 或已连接的 AI 中描述任务和例行工作即可；关闭权限会停止相关工作。")}</p>
                      {([
                        ["background_tasks", tr("Background tasks", "后台任务")],
                        ["scheduled_tasks", tr("Scheduled tasks", "定时任务")],
                        ["adaptive_agent", tr("Adaptive Agent Goals", "自主 Agent 目标任务")],
                        ["source_agent", tr("Continue with the source agent", "由当前 AI 客户端持续推进")],
                        ["keep_awake", tr("Allow a task to keep this computer awake", "允许任务期间保持电脑唤醒")],
                      ] as Array<[keyof DeviceTaskPermissions, string]>).map(([key, label]) => (
                        <div className="deviceBackgroundRow" key={key}>
                          <strong>{label}</strong>
                          <label className="compactSwitch">
                            <input type="checkbox" aria-label={label}
                              checked={(device.automation_permissions || legacyTaskPermissions)[key]}
                              disabled={UI_PREVIEW || !!deviceTaskBusy || (key === "keep_awake" && !device.keep_awake_available)}
                              onChange={(event) => void saveDeviceTaskPermission(device, key, event.target.checked)} />
                            <span />
                          </label>
                        </div>
                      ))}
                      {!device.keep_awake_available && <p>{tr("Keeping awake requires an updated device agent. Login autostart alone does not prevent sleep.", "保持唤醒需要新版设备 Agent。仅开启登录自启不会阻止电脑睡眠。")}</p>}
                      <a href="/docs/long-running-work">{tr("How long-running work operates", "了解长任务如何运行")} →</a>
                    </details>

                        </section>
                        <section role="tabpanel" id={"device-panel-"+device.id+"-activity"} aria-labelledby={"device-tab-"+device.id+"-activity"} aria-label={tr("Activity and details", "活动与详情")} hidden={devicePanel !== "activity"}>
                    {devicePanel === "activity" && device.status === "online" && runnerEnabled && runnerAdvertised && <DeviceBrowserSessions deviceId={device.id}/>}
                          <div className="deviceTechnicalIdentity"><span>{tr("Device ID", "设备 ID")} <code>{device.id}</code></span><span>{tr("Architecture", "架构")} <code>{device.arch || "—"}</code></span></div>

                    <div className="deviceExecutionLogPanel">
                      <div className="policyBlockHead">
                        <div>
                          <strong>{tr("Device execution log", "设备执行日志")}</strong>
                          <p>{tr(
                            "Read on demand from this computer's local Remote Arc operation log. File contents, full command output and raw MCP payloads are not stored here.",
                            "按需读取这台电脑本地的 Remote Arc 操作日志。这里不会保存文件内容、完整命令输出或原始 MCP Payload。",
                          )}</p>
                        </div>
                        <button
                          className="ghostButton small"
                          disabled={device.status !== "online" || executionLogLoading === device.id}
                          onClick={() => void loadDeviceExecutionLog(device)}
                        >
                          {executionLogLoading === device.id ? tr("Loading…", "加载中…") : tr("Refresh log", "刷新日志")}
                        </button>
                      </div>

                      {device.status !== "online" && (
                        <p className="policyWarning">{tr(
                          "This device is offline. Its execution log remains local and can be read after it reconnects.",
                          "这台设备当前离线。执行日志仍保留在本机，重新上线后即可读取。",
                        )}</p>
                      )}

                      {!!executionLogError && (
                        <p className="policyWarning">{executionLogError}</p>
                      )}

                      {!!executionLog?.lines.length && (
                        <>
                          <div className="deviceExecutionLogMeta">
                            <span>{tr("Source", "来源")}: {tr("Local device", "本机")}</span>
                            <span>{executionLog.updated_at
                              ? tr("Updated ", "更新于 ") + timeAgo(executionLog.updated_at)
                              : tr("No timestamp", "无时间戳")}</span>
                            {executionLog.truncated && <span>{tr("Showing recent entries", "仅显示最近记录")}</span>}
                          </div>
                          <div className="deviceExecutionLog" role="log" aria-label={tr("Recent Remote Arc execution log", "最近 Remote Arc 执行日志")}>
                            {executionLog.lines.map((line, index) => (
                              <code
                                key={index}
                                className={
                                  line.includes("  error  ") || line.includes("tool.fail")
                                    ? "error"
                                    : line.includes("  warn  ")
                                      ? "warn"
                                      : line.includes("  success  ") || line.includes("tool.done")
                                        ? "success"
                                        : line.includes("  event  ") || line.includes("tool.call")
                                          ? "event"
                                          : ""
                                }
                              >
                                {line}
                              </code>
                            ))}
                          </div>
                        </>
                      )}

                      {executionLog !== undefined &&
                        !executionLog.lines.length &&
                        !executionLogError && (
                          <p className="policyEmpty">{tr(
                            "No Remote Arc execution events have been recorded locally yet.",
                            "本机暂时还没有 Remote Arc 执行记录。",
                          )}</p>
                        )}
                    </div>

                    <details className="deviceProcessDetails">
                      <summary>
                        {tr("Managed background processes", "后台进程管理")}
                        <span>
                          {processesByDevice[device.id]
                            ? (processesByDevice[device.id] || []).filter((item) => item.status === "running").length + " " + tr("running", "个运行中")
                            : tr("load on demand", "按需读取")}
                        </span>
                      </summary>
                      <div className="managedProcessBody">
                        <div className="policyBlockHead">
                          <div className="labelWithHelp">
                            <strong>{tr("Processes started by Remote Arc", "由 Remote Arc 启动的进程")}</strong>
                            <HelpTip
                              label={tr("About managed background processes", "了解后台进程管理")}
                              text={tr(
                                "Only workload processes started with Remote Arc's managed process mode appear here. The Remote Arc connection agent itself is shown separately under Background connection above.",
                                "这里只显示通过 Remote Arc 后台进程模式启动的工作负载。Remote Arc 自己的连接 Agent 会单独显示在“后台与任务”页。",
                              )}
                            />
                          </div>
                          <button
                            className="ghostButton small"
                            disabled={device.status !== "online" || processLoading === device.id}
                            onClick={() => void loadManagedProcesses(device)}
                          >
                            {processLoading === device.id ? tr("Loading…", "加载中…") : tr("Refresh", "刷新")}
                          </button>
                        </div>

                        {!!processErrors[device.id] && (
                          <p className="policyWarning">{processErrors[device.id]}</p>
                        )}

                        {!!processesByDevice[device.id]?.length && (
                          <div className="managedProcessList">
                            {(processesByDevice[device.id] || []).map((item) => (
                              <div className="managedProcessRow" key={item.process_id}>
                                <div className="managedProcessState">
                                  <i className={item.status === "running" ? "running" : "exited"} />
                                  <div>
                                    <strong>{item.status === "running" ? tr("Running", "运行中") : tr("Exited", "已退出")}</strong>
                                    <small>PID {item.pid || "—"} · {timeAgo(item.started_at)}</small>
                                  </div>
                                </div>
                                <div className="managedProcessCommand">
                                  <code title={item.command}>{item.command}</code>
                                  <small>{item.cwd || tr("Default working directory", "默认工作目录")}</small>
                                </div>
                                <div className="managedProcessActions">
                                  <button className="ghostButton small" onClick={() => void showManagedProcessOutput(device, item)}>
                                    {tr("Output", "查看输出")}
                                  </button>
                                  {item.status === "running" && (
                                    <button className="dangerButton small" onClick={() => void stopBackgroundProcess(device, item)}>
                                      {tr("Stop", "停止")}
                                    </button>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {processesByDevice[device.id] !== undefined && !(processesByDevice[device.id] || []).length && !processErrors[device.id] && (
                          <p className="policyEmpty">{tr(
                            "No Remote Arc managed background processes are currently retained on this device.",
                            "这台设备当前没有由 Remote Arc 管理并保留的后台进程。",
                          )}</p>
                        )}
                      </div>
                    </details>

                    <div className="deviceActions managedActions">
                      <button className="ghostButton" onClick={() => void rename(device)}>{tr("Rename", "重命名")}</button>
                      <CopyButton value={device.id} label={tr("Copy ID", "复制 ID")}/>
                    </div>
                        </section>
                    <div className="deviceDangerZone">
                      <div>
                        <strong>{tr("Forget device", "删除设备")}</strong>
                        <span>{tr(
                          "Remove this pairing from Remote Arc. Local files stay untouched, and this runtime can be paired again later.",
                          "从 Remote Arc 删除这条设备配对。本机文件不会被删除，之后仍可以重新配对这个运行环境。",
                        )}</span>
                      </div>
                      <button className="dangerButton" onClick={() => void revoke(device.id)}>{tr("Forget device", "删除设备")}</button>
                    </div>
                      </>}
                    </div>
                  </article>
                );
              })}

              {!devices.length && <article className="emptyCard wide deviceEmptyState"><div className="emptyIcon">⌁</div><h3>{tr("No paired computers", "暂无已配对电脑")}</h3><p>{tr("Windows, macOS and Linux are supported. No public IP or port forwarding required.", "支持 Windows、macOS 与 Linux，无需公网 IP 或端口映射。")}</p><button className="goldButton" onClick={() => setShowAdd(true)}>+ {tr("Add your first device", "添加第一台设备")}</button></article>}
              {!!devices.length && !filteredDevices.length && <article className="emptyCard wide"><div className="emptyIcon">⌕</div><h3>{tr("No matching devices", "没有匹配设备")}</h3><p>{tr("Try another search or clear the status filter.", "尝试其他搜索词，或清除状态筛选。")}</p><button onClick={() => { setDeviceQuery(""); setDeviceFilter("all"); }}>{tr("Clear filters", "清除筛选")}</button></article>}
            </div>
          </>
        )}

        {(active === "apps" || active === "agent-apps") && <AppsManager />}

        {active === "connect" && (
          <>
            <section className="overviewTopbar connectPageHeader">
              <div>
                <span className="eyebrow">{tr("CONNECT AI", "连接 AI")}</span>
                <h1>{tr("AI connections", "AI 连接")}</h1>
                <p>{tr("Connect supported AI clients to your Remote Arc MCP endpoint.", "把支持的 AI 客户端连接到 Remote Arc MCP 地址。")}</p>
              </div>
              <div className="connectReadyPill"><i />{tr("Remote MCP ready", "Remote MCP 已就绪")}</div>
            </section>

            <section className="connectOverview">
              <article className="connectEndpointPanel">
                <div className="connectPanelHeader">
                  <div>
                    <span className="eyebrow">{tr("YOUR REMOTE MCP ENDPOINT", "你的 REMOTE MCP 地址")}</span>
                    <h2>{tr("Remote MCP endpoint", "Remote MCP 地址")}</h2>
                    <p>{tr("Your AI connects here. Remote Arc handles OAuth, device discovery and routing behind it.", "AI 只需要连接这个地址；OAuth、设备发现和请求路由都由 Remote Arc 处理。")}</p>
                  </div>
                  <span className="connectSecurityBadge">OAuth 2.1 + PKCE</span>
                </div>
                <div className="connectEndpointBox">
                  <code>{mcpEndpoint}</code>
                  <CopyButton value={mcpEndpoint} label={tr("Copy endpoint", "复制地址")} />
                </div>
              </article>

              <aside className="connectHealthPanel">
                <span className="eyebrow">{tr("CONNECTION STATUS", "连接状态")}</span>
                <div className="connectHealthRow"><span><i className="healthDot good" />Remote MCP</span><strong>{tr("Ready", "就绪")}</strong></div>
                <div className="connectHealthRow"><span><i className="healthDot good" />OAuth</span><strong>{tr("Enabled", "已启用")}</strong></div>
                <div className="connectHealthRow"><span><i className={"healthDot " + (devices.length ? "good" : "idle")} />{tr("Paired devices", "已配对设备")}</span><strong>{devices.length}</strong></div>
                <button className="ghostButton connectDevicesButton" onClick={() => navigateTab("devices")}>{tr("Manage devices", "管理设备")}</button>
              </aside>
            </section>

            <section className="connectClientSection">
              <div className="connectSectionHeading">
                <div><span className="eyebrow">{tr("AI CLIENTS", "AI 客户端")}</span><h2>{tr("Clients", "客户端")}</h2></div>
                <p>{tr("ChatGPT is the recommended path. Other Remote MCP clients can use the same production endpoint.", "推荐优先使用 ChatGPT；其他支持 Remote MCP 的客户端也可以使用同一个生产地址。")}</p>
              </div>

              <div className="connectClientGrid connectAgentLaunchers">
                <article className="connectClientCard primary">
                  <div className="connectClientTop">
                    <div className="connectClientIdentity"><img className="monoLogo" src={aiClients[0].icon} alt="" /><div><span className="eyebrow">CHATGPT</span><h3>ChatGPT</h3></div></div>
                    <span className="clientState recommended">{tr("Plugins", "Plugins")}</span>
                  </div>
                  <p>{tr("Install the published Remote Arc plugin, connect the same account as your paired computer, then choose Try in chat. Custom MCP is an optional alternative in the setup guide.", "安装已上架的 Remote Arc 插件，连接与配对电脑相同的账号，再选择 Try in chat。安装指南中仍保留 Custom MCP 作为可选替代方式。")}</p>
                  <div className="connectClientActions">
                    <a className="connectAgentAction" href={CHATGPT_PLUGIN_URL} target="_blank" rel="noreferrer"><span>{tr("Open official plugin", "打开官方插件")}</span><b>↗</b></a>
                    <a className="connectClientGuide" href={MARKETING_ORIGIN + localizedWebsiteHref("/install/chatgpt", locale)} target="_blank" rel="noreferrer"><ProductIcon name="book" size={14} /><span>{tr("Remote Arc setup guide", "Remote Arc 官方安装指南")}</span><span aria-hidden="true">↗</span></a>
                  </div>
                </article>

                <article className="connectClientCard">
                  <div className="connectClientTop">
                    <div className="connectClientIdentity"><img className="colorLogo" src={aiClients[1].icon} alt="" /><div><span className="eyebrow">CLAUDE</span><h3>Claude</h3></div></div>
                    <span className="clientState">{tr("Connectors", "Connectors")}</span>
                  </div>
                  <p>{tr("Open Claude Connectors. The Remote Arc endpoint is copied automatically so you can add it as a Remote MCP connector.", "打开 Claude Connectors；Remote Arc Endpoint 会自动复制，可直接添加为 Remote MCP Connector。")}</p>
                  <div className="connectClientActions">
                    <a className="connectAgentAction" href={CLAUDE_CONNECTORS_URL} target="_blank" rel="noreferrer" onClick={() => void navigator.clipboard?.writeText(mcpEndpoint).catch(() => undefined)}><span>{tr("Open Claude Connectors", "打开 Claude Connectors")}</span><b>↗</b></a>
                    <a className="connectClientGuide" href={MARKETING_ORIGIN + localizedWebsiteHref("/install/claude", locale)} target="_blank" rel="noreferrer"><ProductIcon name="book" size={14} /><span>{tr("Remote Arc setup guide", "Remote Arc 官方安装指南")}</span><span aria-hidden="true">↗</span></a>
                  </div>
                </article>

                <article className="connectClientCard">
                  <div className="connectClientTop">
                    <div className="connectClientIdentity"><img className="colorLogo" src={aiClients[2].icon} alt="" /><div><span className="eyebrow">CURSOR</span><h3>Cursor</h3></div></div>
                    <span className="clientState">{tr("One-click MCP", "一键 MCP")}</span>
                  </div>
                  <p>{tr("Use Cursor's MCP install deeplink. Cursor reviews the Remote Arc configuration before installation and then completes OAuth.", "使用 Cursor 官方 MCP 安装 Deeplink；Cursor 会先确认 Remote Arc 配置，再完成 OAuth。")}</p>
                  <div className="connectClientActions">
                    <a className="connectAgentAction" href={cursorMcpInstallUrl()}><span>{tr("Add to Cursor", "添加到 Cursor")}</span><b>↗</b></a>
                    <a className="connectClientGuide" href={MARKETING_ORIGIN + localizedWebsiteHref("/install/cursor", locale)} target="_blank" rel="noreferrer"><ProductIcon name="book" size={14} /><span>{tr("Remote Arc setup guide", "Remote Arc 官方安装指南")}</span><span aria-hidden="true">↗</span></a>
                  </div>
                </article>

                <article className="connectClientCard">
                  <div className="connectClientTop">
                    <div className="connectClientIdentity"><span className="protocolMark large">M</span><div><span className="eyebrow">REMOTE MCP</span><h3>{tr("Other MCP client", "其他 MCP 客户端")}</h3></div></div>
                    <span className="clientState">{tr("Manual", "手动")}</span>
                  </div>
                  <p>{tr("Copy the production endpoint and open the Remote MCP reference for any compatible client.", "复制生产 Endpoint，并打开 Remote MCP 参考文档用于其他兼容客户端。")}</p>
                  <div className="connectClientActions">
                    <a className="connectAgentAction" href={MARKETING_ORIGIN + localizedWebsiteHref("/docs/mcp", locale)} target="_blank" rel="noreferrer" onClick={() => void navigator.clipboard?.writeText(mcpEndpoint).catch(() => undefined)}><span>{tr("Copy endpoint & open docs", "复制地址并打开文档")}</span><b>↗</b></a>
                    <a className="connectClientGuide" href={MARKETING_ORIGIN + localizedWebsiteHref("/remote-mcp", locale)} target="_blank" rel="noreferrer"><ProductIcon name="book" size={14} /><span>{tr("Remote Arc setup guide", "Remote Arc 官方安装指南")}</span><span aria-hidden="true">↗</span></a>
                  </div>
                </article>
              </div>
            </section>

            <section className="connectGuide">
              <div className="connectSectionHeading compact">
                <div><span className="eyebrow">{tr("SETUP", "配置")}</span><h2>{tr("Connection flow", "连接流程")}</h2></div>
              </div>
              <div className="connectTimeline">
                <article><span className="timelineNumber">01</span><div><strong>{tr("Add Remote Arc", "添加 Remote Arc")}</strong><p>{tr("Choose your AI client above, follow its setup instructions and add the Remote MCP endpoint if needed.", "选择上方的 AI 客户端，按对应指南配置，必要时添加 Remote MCP 地址。")}</p></div></article>
                <article><span className="timelineNumber">02</span><div><strong>{tr("Authorize your account", "授权你的账户")}</strong><p>{tr("Remote Arc opens OAuth once. Your AI receives scoped access to the account you approve.", "Remote Arc 会打开一次 OAuth 授权；AI 只获得你批准账户范围内的权限。")}</p></div></article>
                <article><span className="timelineNumber">03</span><div><strong>{tr("Talk to a device by name", "直接说设备名称")}</strong><p>{tr("Remote Arc discovers your paired devices and enforces each device's tool policy before routing a request.", "Remote Arc 会发现已配对设备，并在路由请求前执行每台设备自己的工具权限策略。")}</p></div></article>
              </div>
            </section>

            <section className="connectTryPanel">
              <div className="connectTryCopy"><span className="eyebrow">{tr("EXAMPLES", "示例")}</span><h2>{tr("Example prompts", "示例指令")}</h2><p>{tr("Once connected, refer to the device and the task. Remote Arc handles MCP routing.", "连接后只需要说明设备和任务，MCP 路由由 Remote Arc 处理。")}</p></div>
              <div className="connectPromptGrid">
                {[
                  tr("Show me my connected computers.", "看看我已连接的电脑。"),
                  tr("Which of my devices are online?", "哪些设备现在在线？"),
                  tr("List the projects on my Mac.", "列出我 Mac 上的项目。"),
                  tr("Read package.json on my desktop.", "读取我桌面电脑上的 package.json。"),
                  tr("Run the tests on my desktop.", "在我的桌面电脑上运行测试。"),
                  tr("Show me the processes running on my computer.", "看看我电脑上正在运行哪些进程。"),
                ].map((prompt) => <code key={prompt}>{prompt}</code>)}
              </div>
            </section>
          </>
        )}

        {active === "security" && (
          <>
            <section className="securityTopbar">
              <div>
                <span className="eyebrow">{tr("SECURITY", "安全")}</span>
                <h1>{tr("Security center", "安全中心")}</h1>
              </div>
              <div className="securityTopActions">
                <button className={securityState?.mcpPaused ? "goldButton" : "dangerButton"} disabled={UI_PREVIEW || securityBusy || !securityState} onClick={() => void setMcpPaused(!securityState?.mcpPaused)}>
                  {securityState?.mcpPaused ? tr("Resume AI MCP access", "恢复 AI MCP 访问") : tr("Pause AI MCP access", "暂停 AI MCP 访问")}
                </button>
              </div>
            </section>

            {securityError && <section className="policyWarning" role="alert">
              <strong>{tr("Could not load security data", "无法加载安全数据")}</strong>
              <p>{tr("Your current access state could not be verified. Refresh to try again.", "当前访问状态暂无法确认，请刷新后重试。")}</p>
              <button className="ghostButton" disabled={securityBusy} onClick={() => void refreshSecurity()}>{tr("Retry", "重试")}</button>
            </section>}

            <section className="securityPanel securityGrantsPanel">
              <div className="securityPanelHeader">
                <div>
                  <span className="eyebrow">{tr("PENDING APPROVALS", "待审批")}</span>
                  <div className="headingWithHelp">
                    <h2>{tr("Pending approvals", "待审批请求")} <span className="approvalCount">{pendingApprovals.length}</span></h2>
                  </div>
                </div>
                <button className="ghostButton" disabled={securityBusy} onClick={() => void refreshSecurity()}>{tr("Refresh", "刷新")}</button>
              </div>
              <div className="securityGrantList">
                {pendingApprovals.map(approval => <ApprovalRequest key={approval.id} approval={approval}
                  deviceNames={deviceNameById} disabled={UI_PREVIEW || securityBusy || !securityState} decide={decidePendingApproval}/>)}
                {!pendingApprovals.length && (
                  <div className="securityEmptyState compact">
                    <strong>{securityState ? tr("No pending approvals", "暂无待审批请求") : securityError ? tr("Approvals unavailable", "暂无法获取审批请求") : tr("Loading approvals…", "正在加载审批请求…")}</strong>
                    {securityState && <span>{tr("Out-of-scope file changes will appear here and in an interactive remotelink terminal.", "超出可信写入范围的文件修改会显示在这里，也会显示在交互式 remotelink 终端中。")}</span>}
                  </div>
                )}
              </div>
            </section>

            <section className="securityPanel securityGrantsPanel">
              <div className="securityPanelHeader">
                <div>
                  <span className="eyebrow">{tr("CONNECTED AI ACCESS", "已连接 AI 访问")}</span>
                  <div className="headingWithHelp">
                    <h2>{tr("AI authorizations", "AI 授权")}</h2>
                  </div>
                </div>
                <button className="ghostButton" disabled={securityBusy} onClick={() => void refreshSecurity()}>{tr("Refresh", "刷新")}</button>
              </div>
              {securityState && securityState.grants.length > 0 && (
                <SecurityAuthorizations grants={securityState.grants} busy={securityBusy}
                  preview={UI_PREVIEW} timeAgo={timeAgo} revoke={revokeGrant} />
              )}
              {securityState && !securityState.grants.length && <div className="securityEmptyState compact"><strong>{tr("No AI authorizations", "暂无 AI 授权")}</strong><button className="ghostButton" onClick={() => navigateTab("connect")}>{tr("Connect AI", "连接 AI")}</button></div>}
              {!securityState && <div className="securityEmptyState compact"><strong>{securityError ? tr("Authorizations unavailable", "暂无法获取授权") : tr("Loading access grants…", "正在加载访问授权…")}</strong></div>}
            </section>

            {securityState && <PersistentPermissions permissions={persistentApprovals} disabled={UI_PREVIEW || securityBusy} deviceNames={deviceNameById} revoke={revokeSavedApproval}/>}

            <section className="securityDeviceSection">
              <article className="securityPanel securityExposurePanel">
                <div className="securityPanelHeader">
                  <div><span className="eyebrow">{tr("DEVICES", "设备")}</span><h2>{tr("Device permissions", "设备权限")}</h2></div>
                  <button className="ghostButton" onClick={() => navigateTab("devices")}>{tr("Manage", "管理")}</button>
                </div>
                <div className="securityDeviceList">
                  {devices.slice().sort((a,b) => Number(b.status === "online") - Number(a.status === "online")).map((device) => {
                    const enabledCount = device.allowed_tools?.length ?? device.tools.length;
                    return <button className="securityDeviceRow" key={device.id} onClick={() => navigateTab("devices")}>
                      <div className="deviceIcon"><ProductIcon name="device"/></div>
                      <div><strong>{device.name}</strong><span>{platformLabel(device.platform)} · {device.hostname || tr("No hostname", "无 Hostname")}</span></div>
                      <div className="securityExposureMeta"><strong>{enabledCount}</strong><span>{tr("tools enabled", "个工具已启用")}</span></div>
                      <span className={"badge " + device.status}><i />{device.status}</span>
                    </button>;
                  })}
                  {!devices.length && <div className="securityEmptyState"><strong>{tr("No paired devices", "暂无配对设备")}</strong><button className="ghostButton" onClick={() => setShowAdd(true)}>{tr("Add device", "添加设备")}</button></div>}
                </div>
              </article>

            </section>

            <section className="securityActivitySection">
              <article className="securityPanel">
                <div className="securityPanelHeader">
                  <div><span className="eyebrow">{tr("AUDIT ACTIVITY", "审计活动")}</span><h2>{tr("Recent access", "最近访问")}</h2></div>
                </div>
                <div className="securityAuditList">
                  {(status?.recentActivity || []).slice(0,6).map((event) => (
                    <div className="securityAuditRow" key={event.id}>
                      <i className={event.success ? "eventIcon success" : "eventIcon failed"}>{event.success ? "✓" : "!"}</i>
                      <div><strong>{eventLabel(event)}</strong><span>{event.client_name || event.client_id?.slice(0,12) || tr("Unknown client", "未知客户端")} · {event.device_id ? deviceNameById.get(event.device_id) || event.device_id.slice(0,8) : tr("Account", "账户")} · {timeAgo(event.created_at)}{event.request_id ? " · req " + event.request_id.slice(0,8) : ""}</span></div>
                      <b>{event.success ? tr("Allowed", "已允许") : tr("Failed", "失败")}</b>
                    </div>
                  ))}
                  {!status?.recentActivity?.length && <div className="securityEmptyState compact"><strong>{tr("No audit events yet", "暂无审计事件")}</strong></div>}
                </div>
              </article>

            </section>


          </>
        )}

        {active === "monitor" && user.isAdmin && (
          <>
            <section className="overviewTopbar monitorTopbar">
              <div>
                <span className="eyebrow">{tr("MONITOR", "监控")}</span>
                <h1>{tr("Service health", "服务健康度")}</h1>
                <p>{tr("Worker errors, dependencies and alert delivery for Remote Arc production.", "查看 Remote Arc 生产环境的 Worker 错误、依赖状态与告警投递。")}</p>
              </div>
              <button className="ghostButton" disabled={monitorLoading} onClick={() => void refreshMonitor()}>
                {monitorLoading ? tr("Refreshing…", "刷新中…") : tr("Refresh", "刷新")}
              </button>
            </section>

            <section className="monitorSummary">
              <div className={"monitorHealth " + (monitorState?.status || "unknown")}>
                <span>{tr("Overall", "整体状态")}</span>
                <strong>{monitorState?.status === "operational" ? tr("Operational", "运行正常") : monitorState?.status === "degraded" ? tr("Degraded", "存在异常") : tr("Loading", "加载中")}</strong>
                <small>{monitorState ? tr("Checked ", "检查于 ") + new Date(monitorState.checkedAt).toLocaleTimeString() : "—"}</small>
              </div>
              <div><span>5xx · 15m</span><strong>{monitorState?.worker.errors15m ?? "—"}</strong><small>{tr("Recent errors", "最近错误")}</small></div>
              <div><span>5xx · 1h</span><strong>{monitorState?.worker.errors1h ?? "—"}</strong><small>{tr("Last hour", "过去一小时")}</small></div>
              <div><span>5xx · 24h</span><strong>{monitorState?.worker.errors24h ?? "—"}</strong><small>{tr("Last 24 hours", "过去 24 小时")}</small></div>
            </section>

            <AdminOperations />

            <section className="monitorMainGrid">
              <article className="monitorPanel">
                <div className="monitorPanelHeader">
                  <div><span className="eyebrow">{tr("RECENT INCIDENTS", "最近异常")}</span><h2>{tr("Production errors", "生产错误")}</h2></div>
                  <span className="privacyPill">{monitorState?.incidents.length ?? 0} {tr("shown", "条")}</span>
                </div>
                <div className="monitorIncidentList">
                  {(monitorState?.incidents || []).map((incident) => (
                    <div className={"monitorIncidentRow " + incident.severity} key={incident.id}>
                      <span className="monitorIncidentCode">{incident.status_code || "ERR"}</span>
                      <div className="monitorIncidentBody">
                        <strong>{incident.method ? incident.method + " " : ""}{incident.path || incident.kind}</strong>
                        <small>{incident.message}</small>
                        <code>{incident.ray_id ? "CF-Ray " + incident.ray_id : incident.kind}{incident.colo ? " · " + incident.colo : ""}</code>
                      </div>
                      <time>{timeAgo(incident.created_at)}</time>
                    </div>
                  ))}
                  {monitorState && !monitorState.incidents.length && (
                    <div className="monitorEmpty">✓ {tr("No recorded production errors.", "暂无已记录的生产错误。")}</div>
                  )}
                  {!monitorState && <div className="monitorEmpty">{tr("Loading monitor data…", "正在加载监控数据…")}</div>}
                </div>
              </article>

              <aside className="monitorSide">
                <section>
                  <span className="eyebrow">{tr("DEPENDENCIES", "依赖")}</span>
                  <div className="monitorCheck"><span><i className="healthDot good" />Cloudflare Worker</span><strong>{monitorState?.worker.status || "—"}</strong></div>
                  <div className="monitorCheck"><span><i className="healthDot good" />D1</span><strong>{monitorState?.dependencies.d1.status || "—"}</strong></div>
                  <div className="monitorCheck"><span><i className="healthDot good" />Durable Objects</span><strong>{monitorState?.dependencies.durableObjects.status || "—"}</strong></div>
                </section>
                <section>
                  <span className="eyebrow">{tr("ALERTING", "告警")}</span>
                  <div className="monitorAlertState">
                    <strong>{monitorState?.alerts.emailConfigured ? tr("Email active", "邮件告警已启用") : tr("Email channel pending", "邮件通道待启用")}</strong>
                    <span>{monitorState?.alerts.destination || "moviegoer24@gmail.com"}</span>
                    <small>{monitorState?.alerts.emailConfigured ? tr("5xx and exceptions are rate-limited to one email per alert type every 10 minutes.", "5xx 与异常告警按类型限频，每 10 分钟最多一封。") : tr("Monitoring is active. Cloudflare Email Service is not enabled for this account yet, so incidents are stored here but email delivery is pending.", "监控已经生效；当前 Cloudflare Email Service 尚未对账号开放，因此异常会记录在这里，但邮件投递仍待启用。")}</small>
                  </div>
                </section>
                <section>
                  <span className="eyebrow">{tr("SERVICE", "服务")}</span>
                  <div className="monitorCheck"><span>{tr("Users", "用户")}</span><strong>{monitorState?.account.users ?? "—"}</strong></div>
                  <div className="monitorCheck"><span>{tr("Devices", "设备")}</span><strong>{monitorState?.account.devices ?? "—"}</strong></div>
                  <div className="monitorCheck"><span>{tr("Active OAuth tokens", "有效 OAuth Token")}</span><strong>{monitorState?.account.activeTokens ?? "—"}</strong></div>
                </section>
              </aside>
            </section>
          </>
        )}

        {(active === "settings" || active === "agent-settings") && (
          <>
            <section className="pageHeader dashboardUtilityHeader">
              <div>
                <span className="eyebrow">{tr("ACCOUNT & WORKSPACE", "账号与工作空间")}</span>
                <h1>{tr("Settings", "设置")}</h1>
                <p>{tr("Manage your account, workspaces, connections and plan in one place.", "集中管理账号、工作空间、连接权限和订阅方案。")}</p>
              </div>
            </section>
            <DashboardSettings
              accountId={arcAvailable?user.id:undefined}
              currentName={user.name}
              currentEmail={user.email}
              locale={locale}
              setLocale={setLocale}
              hasPlus={hasPlus}
              usage={usage}
              usageLimitLabel={usageLimitLabel}
              mcpEndpoint={mcpEndpoint}
              marketingOrigin={MARKETING_ORIGIN}
              onSignOut={signOutSafely}
              onNavigate={destination => navigateTab(workspace === "agent" && destination === "apps" ? "agent-apps" : workspace === "agent" && destination === "devices" ? "agent-devices" : destination)}
            />
          </>
        )}

        <footer className="dashboardFooter"><span>Remote Arc · agent.remotearc.app</span><div><a href={MARKETING_ORIGIN + "/pricing"}>{tr("Pricing", "价格")}</a><a href={MARKETING_ORIGIN + "/docs"}>{tr("Docs", "文档")}</a><a href={MARKETING_ORIGIN + "/docs/mcp"}>MCP</a><a href={MARKETING_ORIGIN + "/privacy"}>{tr("Privacy", "隐私")}</a><a href={MARKETING_ORIGIN + "/terms"}>{tr("Terms", "条款")}</a><a href={MARKETING_ORIGIN + "/support"}>{tr("Support", "支持")}</a></div></footer>
      </main>

      <nav className="mobileBottomNav" aria-label={tr("Dashboard navigation", "控制台导航")}>
        {mobileNavItems.map(([id, label]) => (
          <button key={id} data-dashboard-tab={id} aria-current={active === id ? "page" : undefined} className={active === id ? "active" : ""} onClick={() => navigateTab(id)}>
            <span aria-hidden="true"><DashboardNavIcon tab={id} /></span>
            <small>{id === "overview" ? tr("Home", "首页") : id === "connect" ? tr("Clients", "客户端") : id === "agent-chat" ? tr("Home", "首页") : label}</small>
          </button>
        ))}
        <button data-dashboard-tab="settings" aria-current={active === "settings" || active === "agent-settings" ? "page" : undefined} className={active === "settings" || active === "agent-settings" ? "active" : ""} onClick={() => navigateTab(workspace === "agent" ? "agent-settings" : "settings")}><span aria-hidden="true"><DashboardNavIcon tab="settings"/></span><small>{tr("Settings", "设置")}</small></button>
      </nav>

      {directoryPicker && (
        <div className="modalBackdrop" onMouseDown={() => setDirectoryPicker(null)}>
          <section className="modal directoryPickerModal" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modalClose" onClick={() => setDirectoryPicker(null)}>×</button>
            <span className="eyebrow">{tr("CHOOSE WORKSPACE", "选择工作区")}</span>
            <h2>{tr("Choose a folder on " + directoryPicker.device.name, "选择 " + directoryPicker.device.name + " 上的目录")}</h2>
            <p>{tr(
              "Remote Arc will add the selected folder to Trusted Write Locations. Sensitive paths remain protected.",
              "Remote Arc 会把所选目录加入可信写入区域；敏感路径保护仍然生效。",
            )}</p>

            {directoryPicker.browser && (
              <div className="directoryPickerPath">
                <code>{directoryPicker.browser.path}</code>
                {directoryPicker.browser.parent && (
                  <button className="ghostButton small" onClick={() => void browseDeviceDirectories(directoryPicker.device, directoryPicker.browser!.parent!)}>
                    ↑ {tr("Parent", "上一级")}
                  </button>
                )}
              </div>
            )}

            <div className="directoryPickerList">
              {directoryPicker.loading && <div className="directoryPickerEmpty">{tr("Loading folders…", "正在加载目录…")}</div>}
              {!directoryPicker.loading && !!directoryPicker.error && (
                <div className="policyWarning">{directoryPicker.error}</div>
              )}
              {!directoryPicker.loading && !directoryPicker.error && directoryPicker.browser?.directories.map((entry) => (
                <button
                  className="directoryPickerEntry"
                  key={entry.path}
                  onClick={() => void browseDeviceDirectories(directoryPicker.device, entry.path)}
                >
                  <span>{entry.type === "symlink" ? "↗" : "▣"}</span>
                  <strong>{entry.name}</strong>
                  <small>›</small>
                </button>
              ))}
              {!directoryPicker.loading && !directoryPicker.error && directoryPicker.browser && !directoryPicker.browser.directories.length && (
                <div className="directoryPickerEmpty">{tr("No visible child folders.", "没有可见的子目录。")}</div>
              )}
            </div>

            {directoryPicker.browser && directoryPicker.browser.protected_entries_omitted > 0 && (
              <p className="directoryPickerNote">{tr(
                directoryPicker.browser.protected_entries_omitted + " protected folder(s) are hidden by Sensitive Path Policy.",
                "有 " + directoryPicker.browser.protected_entries_omitted + " 个受保护目录已被 Sensitive Path Policy 隐藏。",
              )}</p>
            )}

            <div className="dialogActions">
              <button className="ghostButton" onClick={() => setDirectoryPicker(null)}>{tr("Cancel", "取消")}</button>
              <button className="primaryButton" disabled={!directoryPicker.browser || directoryPicker.loading} onClick={() => void addCurrentWorkspace()}>
                {tr("Use this folder", "使用当前目录")}
              </button>
            </div>
          </section>
        </div>
      )}

      {dialog && (
        <div className="modalBackdrop" onMouseDown={() => settleDialog(dialog.kind === "notice" ? true : null)}>
          <section ref={dialogElement} role="dialog" aria-modal="true" aria-labelledby="dashboard-dialog-title" className={"modal appDialog " + (dialog.tone === "danger" ? "danger" : "")} onMouseDown={(event) => event.stopPropagation()}>
            <button className="modalClose" aria-label={tr("Close", "关闭")} onClick={() => settleDialog(dialog.kind === "notice" ? true : null)}>×</button>
            <span className="eyebrow">
              {dialog.kind === "prompt"
                ? tr("INPUT REQUIRED", "需要输入")
                : dialog.tone === "danger"
                  ? tr("CONFIRM ACTION", "确认操作")
                  : tr("REMOTE ARC", "REMOTE ARC")}
            </span>
            <h2 id="dashboard-dialog-title">{dialog.title}</h2>
            <p>{dialog.message}</p>
            {dialog.kind === "prompt" && (
              <input
                className="dialogInput"
                autoFocus
                value={dialogValue}
                placeholder={dialog.placeholder}
                onChange={(event) => setDialogValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && dialogValue.trim()) settleDialog(dialogValue.trim());
                  if (event.key === "Escape") settleDialog(null);
                }}
              />
            )}
            <div className="dialogActions">
              {dialog.kind !== "notice" && (
                <button className="ghostButton" onClick={() => settleDialog(null)}>
                  {dialog.cancelLabel || tr("Cancel", "取消")}
                </button>
              )}
              <button
                className={dialog.tone === "danger" ? "dangerButton" : "primaryButton"}
                disabled={dialog.kind === "prompt" && !dialogValue.trim()}
                onClick={() => settleDialog(dialog.kind === "prompt" ? dialogValue.trim() : true)}
              >
                {dialog.confirmLabel}
              </button>
            </div>
          </section>
        </div>
      )}

      {showAdd && (
        <div className="modalBackdrop" onMouseDown={() => setShowAdd(false)}>
          <section className="modal" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modalClose" onClick={() => setShowAdd(false)}>×</button>
            <span className="eyebrow">{tr("ADD A DEVICE", "添加设备")}</span>
            <h2>{tr("Connect a computer in one command.", "一条命令连接电脑。")}</h2>
            <p>{tr("No repository clone, environment file, token copy, public IP or router configuration. New devices start with read-only skills enabled.", "无需 clone 仓库、环境文件、复制 Token、公网 IP 或路由器配置。新设备默认只开启只读技能。")}</p>
            <div className="commandLabel">{tr("Recommended · Safe by default", "推荐 · 默认 Safe")}</div>
            <div className="commandBox"><code>{command}</code><CopyButton value={command}/></div>
            <p><a href="/downloads" target="_blank" rel="noopener noreferrer">{tr("Install without Node.js: native download or Homebrew", "无需 Node.js：直接下载或使用 Homebrew")} →</a></p>
            <div className="commandLabel secondary">{tr("Optional local hard lock · always read-only", "可选本机硬限制 · 始终只读")}</div>
            <div className="commandBox muted"><code>{safeCommand}</code><CopyButton value={safeCommand}/></div>
            <div className="onboardingSteps">
              <div><b>1</b><span><strong>{tr("Run the command", "运行命令")}</strong><small>npm / npx · Node.js 20+</small></span></div>
              <div><b>2</b><span><strong>{tr("Match the pairing code", "确认配对码")}</strong><small>{tr("The browser opens automatically", "浏览器会自动打开")}</small></span></div>
              <div><b>3</b><span><strong>{tr("Authorize the computer", "授权电脑")}</strong><small>{tr("It appears here after connecting", "连接后会自动出现在这里")}</small></span></div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
