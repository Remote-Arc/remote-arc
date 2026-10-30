

export type User = {
  arcAvailable?:boolean;
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  role: "user" | "admin";
  plan: "free" | "connect" | "plus";
  isAdmin: boolean;
};
export type DeviceTaskPermissions = { background_tasks: boolean; scheduled_tasks: boolean; adaptive_agent: boolean; source_agent: boolean; keep_awake: boolean };
export type Device = {
  capacity?: {observedAt:string;cpuPercent?:number;memoryAvailableMB:number;memoryTotalMB:number;managedProcesses?:number};
  id: string;
  name: string;
  platform: string;
  arch: string | null;
  hostname: string | null;
  created_at: string;
  last_seen: string | null;
  status: "online" | "offline";
  tools: string[];
  available_tools?: string[];
  allowed_tools?: string[] | null;
  workspace_roots?: string[];
  sensitive_paths?: string[];
  sensitive_allow_paths?: string[];
  protect_sensitive_paths?: boolean;
  undo_enabled?: boolean;
  policy_enforcement_available?: boolean;
  undo_history_available?: boolean;
  background_agent_available?: boolean;
  background_recovery_available?: boolean;
  stop_agent_available?: boolean;
  pause_agent_available?: boolean;
  execution_paused?: boolean;
  background_guard_active?: boolean;
  background_guard_pid?: number | null;
  execution_mode?: string | null;
  background_enabled?: boolean | null;
  background_service?: string | null;
  recovery_bundle_version?: string | null;
  background_seen_at?: string | null;
  background_active?: boolean;
  background_pid?: number | null;
  background_agent_version?: string | null;
  background_connected_at?: string | null;
  agent_version?: string | null;
  agent_pid?: number | null;
  connected_at?: string | null;
  automation_permissions?: DeviceTaskPermissions;
  keep_awake_available?: boolean;
};
export type UndoAction = {
  id: string;
  created_at: string;
  tool: "write_file" | "edit_block";
  path: string;
  bytes: number;
  existed_before: boolean;
  conflict_safe: boolean;
  can_undo: boolean;
  status: "ready" | "conflict" | "missing" | "legacy";
};
export type DirectoryBrowser = {
  path: string;
  parent: string | null;
  directories: Array<{
    name: string;
    path: string;
    type: "directory" | "symlink";
  }>;
  protected_entries_omitted: number;
  truncated: boolean;
};
export type ManagedProcess = {
  process_id: string;
  pid: number | null;
  command: string;
  cwd: string | null;
  status: "running" | "exited";
  exit_code: number | null;
  signal: string | null;
  started_at: string;
  ended_at: string | null;
  duration_ms: number;
  stdout_bytes: number;
  stderr_bytes: number;
};
export type DeviceExecutionLog = {
  source: "local-device";
  lines: string[];
  total_bytes: number;
  truncated: boolean;
  updated_at: string | null;
};
export type Pairing = {
  user_code: string;
  device_name: string;
  platform: string;
  arch: string | null;
  hostname: string | null;
  status: string;
  expires_at: string;
};
export type AuditEvent = {
  id: string;
  device_id: string | null;
  event_type: string;
  tool_name: string | null;
  success: number;
  request_id?: string | null;
  client_id?: string | null;
  client_name?: string | null;
  grant_id?: string | null;
  outcome?: string | null;
  created_at: string;
};
type MonthlyUsage = {
  month: string;
  used: number;
  limit: number | null;
  remaining: number | null;
  unlimited: boolean;
};
export type ProductStatus = {
  googleConfigured: boolean;
  mcpEndpoint: string;
  devices: Device[];
  totalDevices: number;
  onlineDevices: number;
  recentActivity: AuditEvent[];
  usage: MonthlyUsage;
  entitlements: {
    plan: "free" | "connect" | "plus";
    features: string[];
  };
};
export type DashboardDialog = {
  kind: "notice" | "confirm" | "prompt";
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
  placeholder?: string;
  initialValue?: string;
};
type MonitorIncident = {
  id: string;
  created_at: string;
  severity: "warning" | "error" | "critical";
  kind: string;
  status_code: number | null;
  method: string | null;
  path: string | null;
  message: string;
  ray_id: string | null;
  colo: string | null;
};
export type MonitorState = {
  status: "operational" | "degraded";
  checkedAt: string;
  worker: {
    status: "operational" | "degraded";
    errors15m: number;
    errors1h: number;
    errors24h: number;
  };
  dependencies: {
    d1: { status: string };
    durableObjects: { status: string };
  };
  account: {
    users: number;
    devices: number;
    activeTokens: number;
  };
  alerts: {
    emailConfigured: boolean;
    destination: string | null;
    cooldownMinutes: number;
    recent: Array<{
      alert_key: string;
      last_sent_at: string | null;
      last_status_code: number | null;
      last_path: string | null;
    }>;
  };
  incidents: MonitorIncident[];
};
type AutomationKind = "long_task" | "condition_watch" | "schedule_watch" | "goal_loop";
export type AutomationCreateKind = AutomationKind | "agent_goal";
type AgentGoalTool = "list_directory" | "read_file" | "read_binary_file" | "get_file_info" | "write_file" | "edit_block" | "start_process";
export type AutomationStatus =
  | "waiting" | "running" | "waiting_for_device" | "waiting_for_event"
  | "paused" | "completed" | "failed"
  | "cancelled" | "expired";
export type Automation = {
  id: string;
  user_id: string;
  name: string;
  kind: AutomationKind;
  status: AutomationStatus;
  device_id: string | null;
  trigger_json: string | null;
  action_json: string;
  goal_json: string | null;
  state_json: string | null;
  interval_seconds: number;
  next_run_at: string | null;
  expires_at: string | null;
  max_runs: number;
  run_count: number;
  run_started_count?: number;
  last_run_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};
export type AutomationDraft = {
  name: string;
  kind: AutomationCreateKind;
  trigger_mode: "now" | "at" | "interval" | "event";
  command_confirmed: boolean;
  device_id: string;
  command: string;
  cwd: string;
  goal_command: string;
  agent_objective: string;
  agent_success_criteria: string;
  agent_workspace: string;
  agent_controller: "hosted" | "source";
  agent_start_at: string;
  agent_repeat_minutes: string;
  keep_awake: boolean;
  agent_verify_command: string;
  agent_max_iterations: string;
  agent_allowed_tools: AgentGoalTool[];
  interval_minutes: string;
  schedule_minutes: string;
  max_runs: string;
  condition_source: "github" | "generic";
  condition_event: string;
  condition_match: string;
  condition_action: "device_command" | "github_merge";
  github_owner: string;
  github_repo: string;
  github_pr: string;
  github_merge_method: "merge" | "squash" | "rebase";
};
