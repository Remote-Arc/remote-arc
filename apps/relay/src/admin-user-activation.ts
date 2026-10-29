import { ACTIVATION_STAGES, type ActivationEvidence, type ActivationSort } from '../../../packages/protocol/src/admin-activation.js';

export type AdminUserRow = ActivationEvidence & {
  id: string; email: string; name: string | null; created_at: string; role: string; plan: string;
  used: number; extra: number; device_count: number; computer_count: number;
  last_activity: string | null; has_plus_grant: number; linked_login: 'google' | 'email_only';
  first_mcp_client: string | null;
};
export function activationOptions(url: URL) {
  const stage = url.searchParams.get('activation') || 'all';
  const sort = url.searchParams.get('sort') || 'usage';
  if (stage !== 'all' && !ACTIVATION_STAGES.some(item => item.id === stage)) throw Error('invalid_activation');
  if (!['recent', 'usage', 'activation_asc', 'activation_desc'].includes(sort)) throw Error('invalid_sort');
  return { stage, sort: sort as ActivationSort, query: (url.searchParams.get('query') || '').trim().slice(0, 100) };
}

/** Only operator-verified public-plugin OAuth client IDs count as plugin provenance.
 * Dynamic client names and registered redirect URIs are client-supplied, not proof. */
function pluginClientIds(value: string | undefined) {
  if (!value) return '[]';
  try {
    const ids: unknown = JSON.parse(value);
    if (!Array.isArray(ids) || ids.length > 50 || ids.some(id => typeof id !== 'string' || !/^[A-Za-z0-9_:-]{1,200}$/.test(id))) throw Error();
    return JSON.stringify([...new Set(ids)]);
  } catch { throw Error('invalid_public_plugin_client_ids'); }
}

export async function listAdminUsers(db: D1Database, input: ReturnType<typeof activationOptions> & {
  now: string; month: string; page: number; pageSize: number; freeLimit: number; plusLimit: number;
  pluginOAuthClientIds?: string; resource: string;
}) {
  const args = [input.month, input.now, '%' + input.query.replace(/[\\%_]/g, '\\$&') + '%', input.stage,
    input.pageSize, input.page * input.pageSize, input.freeLimit, input.plusLimit,
    new Date(Date.parse(input.now) - 7 * 86400000).toISOString(), pluginClientIds(input.pluginOAuthClientIds), input.resource];
  // Source ledgers are intentionally separate from charged calls and login/page views.
  // Device audit success proves an operation, not completion of an end-to-end goal.
  const cte = (credits: boolean) => `WITH successful_use AS (
    SELECT user_id,created_at AS at FROM audit_events WHERE event_type='mcp.tool_call' AND success=1 AND device_id IS NOT NULL AND (outcome IS NULL OR outcome='allowed')
    UNION ALL SELECT user_id,updated_at FROM app_calls WHERE status='succeeded'
    UNION ALL SELECT user_id,updated_at FROM arc_chat_runs WHERE status='succeeded'
    UNION ALL SELECT user_id,occurred_at FROM product_events WHERE source='server' AND outcome='succeeded' AND name IN ('device.tool.completed','app.call.succeeded','task.run.succeeded')
  ), success_summary AS (
    SELECT user_id,MIN(at) first_success_at,MAX(at) last_success_at,COUNT(DISTINCT substr(at,1,10)) successful_days
    FROM successful_use WHERE at<=?2 GROUP BY user_id
  ), facts AS (SELECT u.id,u.email,u.name,u.created_at,u.role,u.plan,
    CASE WHEN u.google_sub LIKE 'email:%' THEN 'email_only' ELSE 'google' END AS linked_login,
    (SELECT COALESCE(NULLIF(c.client_name,''),'MCP client') FROM oauth_tokens t LEFT JOIN oauth_clients c ON c.client_id=t.client_id
      WHERE t.user_id=u.id AND t.resource=?11 ORDER BY t.created_at,t.client_id LIMIT 1) first_mcp_client,
    (SELECT MIN(t.created_at) FROM oauth_tokens t WHERE t.user_id=u.id AND t.resource=?11) first_mcp_connected_at,
    (SELECT COUNT(DISTINCT t.client_id) FROM oauth_tokens t WHERE t.user_id=u.id AND t.resource=?11) mcp_connections,
    (SELECT COUNT(DISTINCT t.client_id) FROM oauth_tokens t WHERE t.user_id=u.id AND t.resource=?11 AND t.revoked_at IS NULL AND (t.expires_at>?2 OR t.refresh_expires_at>?2)) active_mcp_connections,
    (SELECT COUNT(DISTINCT t.client_id) FROM oauth_tokens t WHERE t.user_id=u.id AND t.resource=?11 AND t.client_id IN (SELECT value FROM json_each(?10))) plugin_connections,
    COALESCE(um.tool_calls,0) used,
    ${credits ? '(SELECT COALESCE(SUM(extra_calls),0) FROM user_call_credit_grants g WHERE g.user_id=u.id AND g.month_key=?1)' : '0'} extra,
    (SELECT COUNT(*) FROM devices d WHERE d.user_id=u.id AND d.revoked_at IS NULL) device_count,
    (SELECT COUNT(*) FROM devices d WHERE d.user_id=u.id AND d.revoked_at IS NULL AND d.platform<>'browser') computer_count,
    (SELECT MIN(d.created_at) FROM devices d WHERE d.user_id=u.id AND d.platform<>'browser') first_computer_paired_at,
    (SELECT MIN(s.occurred_at) FROM business_flow_attempts f JOIN business_flow_steps s ON s.flow_id=f.id
      JOIN devices d ON d.id=f.device_id AND d.user_id=f.user_id
      WHERE f.user_id=u.id AND f.scene='device_pairing' AND s.step='online' AND d.platform<>'browser') first_computer_online_at,
    CASE WHEN EXISTS(SELECT 1 FROM devices d WHERE d.user_id=u.id AND d.platform<>'browser')
      AND NOT EXISTS(SELECT 1 FROM devices d WHERE d.user_id=u.id AND d.platform<>'browser'
        AND (d.created_at<COALESCE((SELECT value FROM business_metrics_state WHERE key='flow_since'),'9999')
          OR NOT EXISTS(SELECT 1 FROM business_flow_attempts f WHERE f.device_id=d.id AND f.user_id=u.id AND f.scene='device_pairing' AND f.evidence='observed')))
      THEN 1 ELSE 0 END online_history_complete,
    (SELECT MAX(created_at) FROM audit_events a WHERE a.user_id=u.id) last_activity,
    EXISTS(SELECT 1 FROM plan_grants g WHERE g.user_id=u.id AND g.plan='plus' AND g.revoked_at IS NULL AND (g.expires_at IS NULL OR g.expires_at>?2)) has_plus_grant,
    ss.first_success_at,ss.last_success_at,COALESCE(ss.successful_days,0) successful_days
    FROM users u LEFT JOIN user_monthly_usage um ON um.user_id=u.id AND um.month_key=?1 LEFT JOIN success_summary ss ON ss.user_id=u.id
  ), staged AS (SELECT *,CASE
    WHEN successful_days>=2 AND last_success_at>=?9 THEN 'returning_active'
    WHEN first_success_at IS NOT NULL THEN 'activated'
    WHEN first_computer_online_at IS NOT NULL THEN 'online_no_success'
    WHEN first_computer_paired_at IS NOT NULL AND online_history_complete=1 THEN 'paired_never_online'
    WHEN first_computer_paired_at IS NOT NULL THEN 'history_unknown'
    WHEN plugin_connections>0 THEN 'plugin_connected_no_device'
    WHEN mcp_connections>0 THEN 'mcp_connected_no_device'
    WHEN used>0 THEN 'history_unknown'
    ELSE 'registered_only' END activation_stage FROM facts
  ), matched AS (SELECT * FROM staged WHERE email LIKE ?3 ESCAPE '\\' OR COALESCE(name,'') LIKE ?3 ESCAPE '\\')`;
  const order = {
    recent: 'created_at DESC,id',
    usage: 'CASE WHEN role=\'admin\' THEN 0 ELSE used*1.0 / MAX(1,(CASE WHEN plan=\'plus\' OR has_plus_grant THEN ?8 ELSE ?7 END)+extra) END DESC,created_at DESC,id',
    activation_asc: `activation_stage='history_unknown',CASE activation_stage ${ACTIVATION_STAGES.map((stage, index) => `WHEN '${stage.id}' THEN ${index}`).join(' ')} END,created_at ASC,id`,
    activation_desc: `activation_stage='history_unknown',CASE activation_stage ${ACTIVATION_STAGES.map((stage, index) => `WHEN '${stage.id}' THEN ${index}`).join(' ')} END DESC,created_at DESC,id`,
  }[input.sort];
  async function read(credits: boolean) {
    const [rows, counts] = await Promise.all([
      db.prepare(cte(credits) + ` SELECT * FROM matched WHERE ?4='all' OR activation_stage=?4 ORDER BY ${order} LIMIT ?5 OFFSET ?6`).bind(...args).all<AdminUserRow>(),
      db.prepare(cte(credits) + ' SELECT activation_stage,COUNT(*) count FROM matched GROUP BY activation_stage').bind(...args).all<{activation_stage: string; count: number}>(),
    ]);
    const activationCounts = Object.fromEntries(ACTIVATION_STAGES.map(stage => [stage.id, 0]));
    for (const row of counts.results || []) activationCounts[row.activation_stage] = Number(row.count);
    return { users: rows.results || [], activationCounts, filteredTotal: input.stage === 'all'
      ? Object.values(activationCounts).reduce((sum, count) => sum + count, 0) : activationCounts[input.stage] || 0, creditsReady: credits };
  }
  try { return await read(true); }
  catch (error) {
    if (!/no such table:\s*user_call_credit_grants/i.test(String(error))) throw error;
    return read(false);
  }
}
