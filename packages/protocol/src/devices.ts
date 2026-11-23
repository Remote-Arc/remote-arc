// The computer record GET /api/devices and /api/status return, shared by the
// Dashboard and the mobile app.
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
