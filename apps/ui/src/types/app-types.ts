export type User = {
  arcAvailable?: boolean;
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  role: "user" | "admin";
  plan: "free" | "connect" | "plus";
  isAdmin: boolean;
};
export type DeviceTaskPermissions = {
  background_tasks: boolean;
  scheduled_tasks: boolean;
  adaptive_agent: boolean;
  source_agent: boolean;
  keep_awake: boolean;
};
export type Device = {
  connection_state?: "connected" | "stale" | null;
  execution_health?: "response_unknown" | "observed" | "unknown";
  execution_last_timeout_at?: string | null;
  execution_last_success_at?: string | null;
  capacity?: {
    observedAt: string;
    cpuPercent?: number;
    memoryAvailableMB: number;
    memoryTotalMB: number;
    managedProcesses?: number;
  };
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
  /** The owner allowed AI terminal commands to shut down or restart this computer. */
  allow_power_commands?: boolean;
  /** The Agent honours allow_power_commands (power_commands_v1). */
  power_commands_available?: boolean;
  policy_enforcement_available?: boolean;
  undo_history_available?: boolean;
  background_agent_available?: boolean;
  background_recovery_available?: boolean;
  stop_agent_available?: boolean;
  pause_agent_available?: boolean;
  /** A Linux Agent running as its background service can install a newer release itself. */
  agent_update_available?: boolean;
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
  /** Beyond the plan's computer limit: still paired, but not connected. */
  plan_paused?: boolean;
  /** Place in the order that decides which computers stay active. */
  plan_position?: number | null;
  computer_limit?: number | null;
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
/** Present when a Free account has used its allowance or started its reverse
 * trial; after the trial, calls continue in the slow lane. */
export type FreeOverflow = {
  trialDays: number;
  slowLaneCallsPerMinute: number;
  trial: { startedAt: string; endsAt: string; active: boolean } | null;
  /** False when the account already used its trial, has ever subscribed, or
   * uses a computer whose trial another account already took. */
  trialAvailable?: boolean;
  slowLaneCallsThisMonth: number;
  /** Set when the only reason there is no trial is a shared computer. */
  trialUnavailableReason?: "shared_computer";
};
/** Present when a Free account still has full-speed calls this month: what
 * follows once they run out. */
export type AfterAllowance = {
  next: "trial" | "slow_lane";
  trialDays: number;
  slowLaneCallsPerMinute: number;
  /** Set when the only reason there is no trial is a shared computer. */
  trialUnavailableReason?: "shared_computer";
};
export type MonthlyUsage = {
  month: string;
  used: number;
  limit: number | null;
  remaining: number | null;
  unlimited: boolean;
  freeOverflow?: FreeOverflow;
  afterAllowance?: AfterAllowance;
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
type AutomationKind = "long_task" | "condition_watch" | "schedule_watch" | "goal_loop";
export type AutomationCreateKind = AutomationKind | "agent_goal";
type AgentGoalTool =
  | "list_directory"
  | "read_file"
  | "read_binary_file"
  | "get_file_info"
  | "write_file"
  | "edit_block"
  | "start_process";
export type AutomationStatus =
  | "waiting"
  | "running"
  | "waiting_for_device"
  | "waiting_for_event"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled"
  | "expired";
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
