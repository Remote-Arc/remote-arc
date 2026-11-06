import {
  ACTIVATION_STAGES,
  type ActivationEvidence,
  type ActivationSort,
} from "../../../../packages/protocol/src/admin-activation.js";

export type AdminUserRow = ActivationEvidence & {
  id: string;
  email: string;
  name: string | null;
  created_at: string;
  role: string;
  plan: string;
  used: number;
  extra: number;
  device_count: number;
  computer_count: number;
  last_activity: string | null;
  has_plus_grant: number;
  linked_login: "google" | "email_only";
  first_mcp_client: string | null;
};
// Must stay textually identical to the partial-index predicates in
// 0078_admin_query_indexes.sql, or SQLite will not use those indexes.
const SUCCESSFUL_AUDIT =
  "event_type='mcp.tool_call' AND success=1 AND device_id IS NOT NULL AND (outcome IS NULL OR outcome='allowed')";
const SUCCESSFUL_PRODUCT_EVENT =
  "source='server' AND outcome='succeeded' AND name IN ('device.tool.completed','app.call.succeeded','task.run.succeeded')";

export function activationOptions(url: URL) {
  const stage = url.searchParams.get("activation") || "all";
  const sort = url.searchParams.get("sort") || "usage";
  if (stage !== "all" && !ACTIVATION_STAGES.some((item) => item.id === stage))
    throw Error("invalid_activation");
  if (!["recent", "usage", "activation_asc", "activation_desc"].includes(sort))
    throw Error("invalid_sort");
  return {
    stage,
    sort: sort as ActivationSort,
    query: (url.searchParams.get("query") || "").trim().slice(0, 100),
  };
}

/** Only operator-verified public-plugin OAuth client IDs count as plugin provenance.
 * Dynamic client names and registered redirect URIs are client-supplied, not proof. */
function pluginClientIds(value: string | undefined) {
  if (!value) return "[]";
  try {
    const ids: unknown = JSON.parse(value);
    if (
      !Array.isArray(ids) ||
      ids.length > 50 ||
      ids.some((id) => typeof id !== "string" || !/^[A-Za-z0-9_:-]{1,200}$/.test(id))
    )
      throw Error();
    return JSON.stringify([...new Set(ids)]);
  } catch {
    throw Error("invalid_public_plugin_client_ids");
  }
}

export async function listAdminUsers(
  db: D1Database,
  input: ReturnType<typeof activationOptions> & {
    now: string;
    month: string;
    page: number;
    pageSize: number;
    freeLimit: number;
    plusLimit: number;
    pluginOAuthClientIds?: string;
    resource: string;
  },
) {
  const args = [
    input.month,
    input.now,
    "%" + input.query.replace(/[\\%_]/g, "\\$&") + "%",
    input.stage,
    input.pageSize,
    input.page * input.pageSize,
    input.freeLimit,
    input.plusLimit,
    new Date(Date.parse(input.now) - 7 * 86400000).toISOString(),
    pluginClientIds(input.pluginOAuthClientIds),
    input.resource,
  ];
  // Source ledgers are intentionally separate from charged calls and login/page views.
  // Device audit success proves an operation, not completion of an end-to-end goal.
  // Each predicate matches a partial index from 0078_admin_query_indexes.sql, so the
  // first and latest success per user are index seeks instead of a scan of every success.
  const sources = [
    ["audit_events", "created_at", SUCCESSFUL_AUDIT],
    ["app_calls", "updated_at", "status='succeeded'"],
    ["arc_chat_runs", "updated_at", "status='succeeded'"],
    ["product_events", "occurred_at", SUCCESSFUL_PRODUCT_EVENT],
  ] as const;
  const seek = (fn: "MIN" | "MAX", user: string, after = "") =>
    sources.map(
      ([table, at, predicate]) =>
        `(SELECT ${fn}(${at}) FROM ${table} WHERE user_id=${user} AND ${predicate}${after ? ` AND ${at}>=${after}` : ""} AND ${at}<=?2)`,
    );
  // SQLite's multi-argument MIN/MAX return NULL when any argument is NULL.
  const earliest = (values: string[]) =>
    `NULLIF(MIN(${values.map((value) => `COALESCE(${value},'~')`).join(",")}),'~')`;
  const latest = (values: string[]) =>
    `NULLIF(MAX(${values.map((value) => `COALESCE(${value},'')`).join(",")}),'')`;
  const cte = (credits: boolean) => `WITH RECURSIVE candidates AS MATERIALIZED (
    SELECT * FROM users WHERE email LIKE ?3 ESCAPE '\\' OR COALESCE(name,'') LIKE ?3 ESCAPE '\\'
  ), success_summary AS MATERIALIZED (
    SELECT id user_id,${earliest(seek("MIN", "u.id"))} first_success_at,${latest(seek("MAX", "u.id"))} last_success_at
    FROM candidates u
  ), facts AS MATERIALIZED (SELECT u.id,u.email,u.name,u.created_at,u.role,u.plan,
    CASE WHEN u.google_sub LIKE 'email:%' THEN 'email_only' ELSE 'google' END AS linked_login,
    (SELECT COALESCE(NULLIF(c.client_name,''),'MCP client') FROM oauth_tokens t LEFT JOIN oauth_clients c ON c.client_id=t.client_id
      WHERE t.user_id=u.id AND t.resource=?11 ORDER BY t.created_at,t.client_id LIMIT 1) first_mcp_client,
    (SELECT MIN(t.created_at) FROM oauth_tokens t WHERE t.user_id=u.id AND t.resource=?11) first_mcp_connected_at,
    (SELECT COUNT(DISTINCT t.client_id) FROM oauth_tokens t WHERE t.user_id=u.id AND t.resource=?11) mcp_connections,
    (SELECT COUNT(DISTINCT t.client_id) FROM oauth_tokens t WHERE t.user_id=u.id AND t.resource=?11 AND t.revoked_at IS NULL AND (t.expires_at>?2 OR t.refresh_expires_at>?2)) active_mcp_connections,
    (SELECT COUNT(DISTINCT t.client_id) FROM oauth_tokens t WHERE t.user_id=u.id AND t.resource=?11 AND t.client_id IN (SELECT value FROM json_each(?10))) plugin_connections,
    COALESCE(um.tool_calls,0) used,
    ${credits ? "(SELECT COALESCE(SUM(extra_calls),0) FROM user_call_credit_grants g WHERE g.user_id=u.id AND g.month_key=?1)" : "0"} extra,
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
    ss.first_success_at,ss.last_success_at,
    CASE WHEN ss.first_success_at IS NULL THEN 0 WHEN substr(ss.first_success_at,1,10)<>substr(ss.last_success_at,1,10) THEN 2 ELSE 1 END __success_day_span
    FROM candidates u LEFT JOIN user_monthly_usage um ON um.user_id=u.id AND um.month_key=?1 LEFT JOIN success_summary ss ON ss.user_id=u.id
  ), staged AS MATERIALIZED (SELECT *,CASE
    WHEN __success_day_span>=2 AND last_success_at>=?9 THEN 'returning_active'
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
    recent: "created_at DESC,id",
    usage:
      "CASE WHEN role='admin' THEN 0 ELSE used*1.0 / MAX(1,(CASE WHEN plan='plus' OR has_plus_grant THEN ?8 ELSE ?7 END)+extra) END DESC,created_at DESC,id",
    activation_asc: `activation_stage='history_unknown',CASE activation_stage ${ACTIVATION_STAGES.map((stage, index) => `WHEN '${stage.id}' THEN ${index}`).join(" ")} END,created_at ASC,id`,
    activation_desc: `activation_stage='history_unknown',CASE activation_stage ${ACTIVATION_STAGES.map((stage, index) => `WHEN '${stage.id}' THEN ${index}`).join(" ")} END DESC,created_at DESC,id`,
  }[input.sort];
  async function read(credits: boolean) {
    type CountedUser = AdminUserRow & { [key: `__activation_${number}`]: number };
    const aliases = ACTIVATION_STAGES.map((_, index) => `__activation_${index}` as const);
    // Materialized facts prevent correlated evidence lookups being re-evaluated
    // for each facet. Window counts preserve global facets before pagination.
    const rows = await db
      .prepare(
        cte(credits) +
          `,
      counted AS (SELECT *,${ACTIVATION_STAGES.map((stage, index) => `SUM(activation_stage='${stage.id}') OVER() ${aliases[index]}`).join(",")} FROM matched),
      page AS MATERIALIZED (SELECT * FROM counted WHERE ?4='all' OR activation_stage=?4 ORDER BY ${order} LIMIT ?5 OFFSET ?6),
      -- Exact successful days for this page only: jump from each successful day to
      -- the next one with index seeks, so reads grow with active days, not with calls.
      success_days(user_id,day) AS (
        SELECT id,substr(first_success_at,1,10) FROM page WHERE first_success_at IS NOT NULL
        UNION ALL
        SELECT user_id,substr(${earliest(seek("MIN", "success_days.user_id", "date(success_days.day,'+1 day')"))},1,10)
        FROM success_days WHERE day IS NOT NULL
      )
      SELECT page.*,(SELECT COUNT(DISTINCT day) FROM success_days d WHERE d.user_id=page.id) successful_days
      FROM page ORDER BY ${order}`,
      )
      .bind(...args)
      .all<CountedUser>();
    const activationCounts = Object.fromEntries(
      ACTIVATION_STAGES.map((stage, index) => [
        stage.id,
        Number(rows.results[0]?.[aliases[index]!] || 0),
      ]),
    );
    // An empty selected stage / out-of-range page has no row carrying counts.
    // Preserve the old global-facet contract with a fallback only in that case.
    if (!rows.results.length && (input.page > 0 || input.stage !== "all")) {
      const counts = await db
        .prepare(
          cte(credits) +
            " SELECT activation_stage,COUNT(*) count FROM matched GROUP BY activation_stage",
        )
        .bind(...args)
        .all<{ activation_stage: string; count: number }>();
      for (const row of counts.results) activationCounts[row.activation_stage] = Number(row.count);
    }
    return {
      users: rows.results.map(
        (row) =>
          Object.fromEntries(
            // Internal facet counters and the day-span hint never leave the query.
            Object.entries(row).filter(([key]) => !key.startsWith("__")),
          ) as AdminUserRow,
      ),
      activationCounts,
      filteredTotal:
        input.stage === "all"
          ? Object.values(activationCounts).reduce((sum, count) => sum + count, 0)
          : activationCounts[input.stage] || 0,
      creditsReady: credits,
    };
  }
  try {
    return await read(true);
  } catch (error) {
    if (!/no such table:\s*user_call_credit_grants/i.test(String(error))) throw error;
    return read(false);
  }
}
