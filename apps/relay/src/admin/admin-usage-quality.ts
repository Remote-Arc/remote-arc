type Summary=Record<string,number|null>;
const n=(row:Summary|null,key:string)=>Number(row?.[key]??0);

/** Metadata aggregates only: no arguments, messages, results or provider tokens. */
export async function adminUsageQuality(db:D1Database,userId:string,from:string,until:string){
  const [device,apps,arc,cost]=await Promise.all([
    db.prepare(`SELECT
      COALESCE(SUM(CASE WHEN success=1 AND tool_name IS NOT NULL AND tool_name NOT IN ('process_status','browser_runner_wait') THEN 1 ELSE 0 END),0) AS operations,
      COALESCE(SUM(CASE WHEN tool_name IN ('process_status','browser_runner_wait') THEN 1 ELSE 0 END),0) AS state_checks
      FROM audit_events WHERE user_id=?1 AND event_type='mcp.tool_call' AND created_at>=?2 AND created_at<?3`).bind(userId,from,until).first<Summary>(),
    db.prepare(`SELECT COUNT(*) AS total,
      COALESCE(SUM(CASE WHEN a.status='succeeded' THEN 1 ELSE 0 END),0) AS succeeded,
      COALESCE(SUM(CASE WHEN a.status='failed' THEN 1 ELSE 0 END),0) AS failed,
      COALESCE(SUM(CASE WHEN a.status='unknown' THEN 1 ELSE 0 END),0) AS unknown
      FROM app_calls a JOIN app_connections c ON c.id=a.connection_id AND c.user_id=a.user_id
      WHERE a.user_id=?1 AND a.created_at>=?2 AND a.created_at<?3`).bind(userId,from,until).first<Summary>(),
    db.prepare(`SELECT COUNT(*) AS total,
      COALESCE(SUM(CASE WHEN status='succeeded' THEN 1 ELSE 0 END),0) AS succeeded,
      COALESCE(SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END),0) AS failed,
      COALESCE(SUM(CASE WHEN status='unknown' THEN 1 ELSE 0 END),0) AS unknown
      FROM arc_chat_runs WHERE user_id=?1 AND created_at>=?2 AND created_at<?3`).bind(userId,from,until).first<Summary>(),
    db.prepare(`WITH entries AS (
      SELECT status,accounted,CASE WHEN json_valid(settlement_json) THEN settlement_json ELSE '{}' END AS settlement
      FROM billing_reservations WHERE user_id=?1 AND lane='arc_hosted' AND created_at>=?2 AND created_at<?3
    ), measured AS (
      SELECT CASE WHEN status IN ('completed','failed') AND accounted=1
        AND json_type(settlement,'$.actual.costMicros')='integer'
        AND json_extract(settlement,'$.actual.costMicros')>=0
        THEN json_extract(settlement,'$.actual.costMicros') ELSE NULL END AS micros FROM entries
    ) SELECT COUNT(*) AS total,COUNT(micros) AS known,SUM(micros) AS micros FROM measured`).bind(userId,from,until).first<Summary>(),
  ]);
  const known=n(cost,'known');
  return {
    work:{deviceOperations:n(device,'operations'),stateChecks:n(device,'state_checks'),
      apps:{total:n(apps,'total'),succeeded:n(apps,'succeeded'),failed:n(apps,'failed'),unknown:n(apps,'unknown')},
      arc:{total:n(arc,'total'),succeeded:n(arc,'succeeded'),failed:n(arc,'failed'),unknown:n(arc,'unknown')},
      completedGoals:null,retries:null},
    cost:{currency:'USD',modelCostMicros:known?n(cost,'micros'):null,settledRequests:known,
      unresolvedRequests:Math.max(0,n(cost,'total')-known),cloudCostMicros:null,totalCostMicros:null,
      basis:'recorded_usage_and_model_prices'},
  };
}
