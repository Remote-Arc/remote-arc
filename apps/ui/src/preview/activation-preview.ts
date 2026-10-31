import { ACTIVATION_STAGES, type ActivationEvidence } from '../../../../packages/protocol/src/admin-activation.js';

/** Synthetic preview data only. Production classification is performed in D1. */
export function previewActivationUsers<T extends { id: string; email: string; name: string; created_at: string; used: number; allowance: number | null; device_count: number; online_devices: number }>(seeds: T[], url: URL) {
  const ago = (days: number) => new Date(Date.now() - days * 86400000).toISOString();
  const registered = seeds[0]!;
  const rows = [...seeds, ...ACTIVATION_STAGES.slice(0, 5).map((stage, i) => ({ ...registered,
    id: 'activation-' + stage.id, email: `sample-${i + 1}@example.com`, name: stage.zh,
    used: 0, allowance: 10000, device_count: i >= 3 ? 1 : 0, online_devices: 0,
  })), { ...registered, id: 'activation-history_unknown', email: 'history@example.com', name: 'Historical account', used: 0, allowance: 10000, device_count: 1, online_devices: 0 }];
  const users = rows.map((row, i) => {
    const stage = i === 0 ? 'returning_active' : i === 1 ? 'activated' : i === 2 ? 'online_no_success' : row.id.replace('activation-', '') as ActivationEvidence['activation_stage'];
    const success = stage === 'activated' || stage === 'returning_active';
    const connected = ['plugin_connected_no_device', 'mcp_connected_no_device', 'online_no_success', 'activated', 'returning_active'].includes(stage);
    return { ...row, role: i >= seeds.length ? 'user' : (row as T & {role:string}).role,
      linked_login: i === 0 ? 'google' : 'email_only', computer_count: row.device_count,
      live_status_verified: true, live_agent_versions: row.online_devices > 0 ? ['0.6.5'] : [],
      first_mcp_client: connected ? 'ChatGPT' : null, activation_stage: stage,
      mcp_connections: connected ? 1 : 0, active_mcp_connections: connected ? 1 : 0,
      plugin_connections: stage === 'plugin_connected_no_device' ? 1 : 0,
      first_mcp_connected_at: connected ? ago(3) : null,
      first_computer_paired_at: row.device_count > 0 ? ago(3) : null,
      first_computer_online_at: ['online_no_success', 'activated', 'returning_active'].includes(stage) ? ago(2) : null,
      first_success_at: success ? ago(2) : null, last_success_at: success ? ago(1) : null,
      successful_days: stage === 'returning_active' ? 2 : success ? 1 : 0,
      online_history_complete: stage === 'history_unknown' ? 0 : 1,
    };
  });
  const query = (url.searchParams.get('query') || '').toLowerCase();
  const matched = users.filter(user => (user.name + ' ' + user.email).toLowerCase().includes(query));
  const activationCounts = Object.fromEntries(ACTIVATION_STAGES.map(stage => [stage.id, matched.filter(user => user.activation_stage === stage.id).length]));
  const stage = url.searchParams.get('activation') || 'all';
  const selected = matched.filter(user => stage === 'all' || user.activation_stage === stage);
  const rank = (user: typeof users[number]) => ACTIVATION_STAGES.findIndex(stage => stage.id === user.activation_stage);
  const sort = url.searchParams.get('sort') || 'usage';
  selected.sort((a, b) => sort.startsWith('activation_')
    ? Number(a.activation_stage === 'history_unknown') - Number(b.activation_stage === 'history_unknown') || (rank(a) - rank(b)) * (sort === 'activation_desc' ? -1 : 1)
    : sort === 'recent' ? b.created_at.localeCompare(a.created_at) : (b.allowance ? b.used / b.allowance : 0) - (a.allowance ? a.used / a.allowance : 0));
  const page = Math.max(0, Number(url.searchParams.get('page') || 0) | 0);
  return { users: selected.slice(page * 30, (page + 1) * 30), filteredTotal: selected.length, activationCounts, page, userCount: users.length };
}
