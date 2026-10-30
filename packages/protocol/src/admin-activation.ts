/** Stages describe observed progress, not current connectivity or a completed user goal. */
export const ACTIVATION_STAGES = [
  { id: 'registered_only', en: 'Registered only', zh: '仅注册' },
  { id: 'plugin_connected_no_device', en: 'Plugin connected, no computer', zh: '插件已连接，未配对电脑' },
  { id: 'mcp_connected_no_device', en: 'MCP connected, no computer', zh: 'MCP 已连接，未配对电脑' },
  { id: 'paired_never_online', en: 'Paired, no online record', zh: '已配对，尚无上线记录' },
  { id: 'online_no_success', en: 'Reached online, no successful use', zh: '曾上线，尚无成功使用记录' },
  { id: 'activated', en: 'Activated', zh: '已激活' },
  { id: 'returning_active', en: 'Returning active user', zh: '回访活跃用户' },
  { id: 'history_unknown', en: 'History incomplete', zh: '历史记录不完整' },
] as const;
export type ActivationStage = typeof ACTIVATION_STAGES[number]['id'];
export type ActivationSort = 'recent' | 'usage' | 'activation_asc' | 'activation_desc';
export type ActivationEvidence = {
  activation_stage: ActivationStage;
  first_mcp_connected_at: string | null;
  mcp_connections: number;
  active_mcp_connections: number;
  plugin_connections: number;
  first_computer_paired_at: string | null;
  first_computer_online_at: string | null;
  first_success_at: string | null;
  last_success_at: string | null;
  successful_days: number;
  online_history_complete: number;
};
