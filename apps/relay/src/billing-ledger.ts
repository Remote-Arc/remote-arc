import {ARC_CREDIT_RATE} from '@remotearc/protocol';
import {costCreditUnits,creditAuthoritySql,reserveCreditStatements,settleCreditStatements} from './arc-credits.js';
export type BillingLane = "connect" | "arc_hosted";
export type BillingContext = {
  userId: string; organizationId: string; taskId: string; runId: string; operationId: string;
  lane: BillingLane; rootBudgetId?: string;
};
export type BillingUnits = { credits: number; costMicros: number; neurons: number };
export type BillingReservationInput = BillingContext & {
  provider: "workers_ai" | "openai" | "anthropic" | "openrouter";
  modelId: string; authorizationId: string; maximum: BillingUnits;
  creditWallet?: boolean;
};
type Entry = { scope_type: string; scope_id: string; lane: BillingLane; metric: string; period_key: string; units: number };
type Row = { id: string; request_json: string; entries_json: string; status: string; settlement_json: string | null };
export class BillingDeniedError extends Error {
  constructor(readonly code: string) { super(code); this.name = "BillingDeniedError"; }
}
const integer = (n: number) => {
  if (!Number.isSafeInteger(n) || n < 0) throw new BillingDeniedError("BILLING_INVALID_UNITS");
  return n;
};
const textId = (s: string) => {
  if (typeof s !== "string" || !s.trim() || s.length > 200) throw new BillingDeniedError("BILLING_INVALID_CONTEXT");
  return s;
};
const units = (v: BillingUnits): BillingUnits => ({
  credits: integer(v.credits), costMicros: integer(v.costMicros), neurons: integer(v.neurons),
});
const unitValue = (v: BillingUnits, metric: string) => metric === "cost_micros" ? v.costMicros : metric === "neurons" ? v.neurons : v.credits;
const sameEntry = `b.scope_type=json_extract(e.value,'$.scope_type') AND b.scope_id=json_extract(e.value,'$.scope_id')
 AND b.lane=json_extract(e.value,'$.lane') AND b.metric=json_extract(e.value,'$.metric')
 AND b.period_key=json_extract(e.value,'$.period_key')`;
const userTaskAuth = `EXISTS(SELECT 1 FROM organization_members m WHERE m.organization_id=?3 AND m.user_id=?2 AND m.status='active')
 AND (EXISTS(SELECT 1 FROM automations a WHERE a.id=?4 AND a.user_id=?2)
 OR EXISTS(SELECT 1 FROM arc_chat_sessions c WHERE c.id=?4 AND c.user_id=?2 AND c.organization_id=?3 AND c.deleted_at IS NULL))`;
function normalize(input: BillingReservationInput, at: string) {
  for (const id of [input.userId,input.organizationId,input.taskId,input.runId,input.operationId,input.modelId,input.authorizationId]) textId(id);
  if (!["connect","arc_hosted"].includes(input.lane) || !["workers_ai","openai","anthropic","openrouter"].includes(input.provider)) throw new BillingDeniedError("BILLING_INVALID_CONTEXT");
  if(input.rootBudgetId!==undefined){textId(input.rootBudgetId);if(input.lane!=='arc_hosted')throw new BillingDeniedError('BILLING_INVALID_ROOT_BUDGET');}
  const maximum = units(input.maximum);
  if (maximum.credits < 1) throw new BillingDeniedError("BILLING_INVALID_UNITS");
  const period = at.slice(0,10), entries: Entry[] = [];
  const scopes = [["global","platform"],["organization",input.organizationId],["user",input.userId],["task",input.taskId]];
  for (const [scope_type,scope_id] of scopes) for (const metric of ["credits","cost_micros","neurons"]) {
    const amount = unitValue(maximum,metric);
    if (amount) entries.push({scope_type:scope_type!,scope_id:scope_id!,lane:input.lane,metric,period_key:period,units:amount});
  }
  if(input.rootBudgetId){
    entries.push({scope_type:'task',scope_id:input.rootBudgetId,lane:input.lane,metric:'credits',period_key:'lifetime',units:costCreditUnits(maximum.costMicros)});
    entries.push({scope_type:'task',scope_id:input.rootBudgetId,lane:input.lane,metric:'cost_micros',period_key:'lifetime',units:maximum.costMicros});
  }
  const request = {userId:input.userId,organizationId:input.organizationId,taskId:input.taskId,runId:input.runId,
    operationId:input.operationId,lane:input.lane,provider:input.provider,modelId:input.modelId,authorizationId:input.authorizationId,maximum,period,
    ...(input.creditWallet?{creditRate:ARC_CREDIT_RATE}:{}),...(input.rootBudgetId?{rootBudgetId:input.rootBudgetId}:{})};
  return {requestJson:JSON.stringify(request), entriesJson:JSON.stringify(entries),entries,period};
}
/** All caps are checked in the INSERT's snapshot; D1 batch commits the reservation and counters atomically. */
export async function reserveBilling(db: D1Database, input: BillingReservationInput, at = new Date().toISOString()) {
  const n = normalize(input,at), id = crypto.randomUUID(), operationKey = JSON.stringify([input.userId,input.runId,input.operationId]);
  const walletMaximum=input.creditWallet?costCreditUnits(input.maximum.costMicros):0;
  if(input.creditWallet&&(input.lane!=='arc_hosted'||input.provider==='workers_ai'))throw new BillingDeniedError('BILLING_INVALID_WALLET_LANE');
  const authority = input.provider === "workers_ai"
    ? `EXISTS(SELECT 1 FROM billing_free_ai_pools p WHERE p.id=?9 AND p.period_key=?10 AND p.enabled=1
       AND p.managed_pool_assertion=1 AND substr(p.verified_at,1,10)=?10
       AND EXISTS(SELECT 1 FROM billing_budgets b WHERE b.scope_type='global' AND b.scope_id='platform'
       AND b.lane='arc_hosted' AND b.metric='neurons' AND b.period_key=?10
       AND b.limit_units <= p.free_neurons-p.outside_used_neurons)) AND ?7='arc_hosted' AND ?14=0`
    : `EXISTS(SELECT 1 FROM billing_model_grants g WHERE g.id=?9 AND g.user_id=?2 AND g.organization_id=?3
       AND (g.task_id IS NULL OR g.task_id=?4) AND g.provider=?8 AND g.revoked_at IS NULL
        AND g.expires_at>?12 AND g.max_cost_micros>=?14+COALESCE((SELECT SUM(
          CASE WHEN r.status IN ('completed','failed','settling') THEN json_extract(r.settlement_json,'$.actual.costMicros')
          ELSE json_extract(r.request_json,'$.maximum.costMicros') END)
          FROM billing_reservations r WHERE r.authorization_id=g.id),0)) AND ?7='arc_hosted' AND ?14>0`;
  await db.batch([
    db.prepare(`INSERT OR IGNORE INTO billing_reservations
      (id,user_id,organization_id,task_id,run_id,operation_key,lane,provider,authorization_id,model_id,request_json,entries_json,status,created_at)
      SELECT ?1,?2,?3,?4,?5,?6,?7,?8,?9,?11,?13,?15,'reserved',?12
       WHERE ${userTaskAuth} AND ${authority} ${input.creditWallet?'AND '+creditAuthoritySql(walletMaximum):''}
       ${input.rootBudgetId?"AND EXISTS(SELECT 1 FROM arc_execution_budgets r WHERE r.id=?17 AND r.user_id=?2 AND r.organization_id=?3 AND r.task_id=?4 AND r.status='active')":''}
      AND (SELECT COUNT(*) FROM json_each(?15) e JOIN billing_budgets b ON ${sameEntry}
        WHERE b.spent_units+b.reserved_units+json_extract(e.value,'$.units')<=b.limit_units)=?16`)
      .bind(id,input.userId,input.organizationId,input.taskId,input.runId,operationKey,input.lane,input.provider,
        input.authorizationId,n.period,input.modelId,at,n.requestJson,input.maximum.costMicros,n.entriesJson,n.entries.length,...(input.rootBudgetId?[input.rootBudgetId]:[])),
    db.prepare(`INSERT INTO billing_events(id,reservation_id,event_type,details_json,created_at)
      SELECT ?1,id,'reserved',request_json,?2 FROM billing_reservations WHERE id=?3 AND accounted=0`).bind(crypto.randomUUID(),at,id),
    ...(input.creditWallet?reserveCreditStatements(db,id,input.userId,walletMaximum,at):[]),
    db.prepare(`UPDATE billing_budgets AS b SET reserved_units=reserved_units+
      (SELECT json_extract(e.value,'$.units') FROM json_each(?1) e WHERE ${sameEntry}), updated_at=?2
      WHERE EXISTS(SELECT 1 FROM billing_reservations r WHERE r.id=?3 AND r.accounted=0)
      AND EXISTS(SELECT 1 FROM json_each(?1) e WHERE ${sameEntry})`).bind(n.entriesJson,at,id),
    db.prepare("UPDATE billing_reservations SET accounted=1 WHERE id=?1 AND accounted=0").bind(id),
  ]);
  const row = await db.prepare("SELECT id,request_json,entries_json,status,settlement_json FROM billing_reservations WHERE operation_key=?1")
    .bind(operationKey).first<Row>();
  if (!row) throw new BillingDeniedError("BILLING_QUOTA_OR_AUTHORITY_UNAVAILABLE");
  if (row.request_json !== n.requestJson) throw new BillingDeniedError("BILLING_IDEMPOTENCY_CONFLICT");
  // D1 reports sqlite3_total_changes(), including trigger writes. The freshly
  // generated ID proves ownership of this insert; an idempotent replay has a
  // different stored ID and must never dispatch the provider again.
  return {id:row.id,dispatchAllowed:row.id===id,status:row.status};
}
export type BillingSettlement = {status:"completed"|"failed"|"unknown"; actual?:BillingUnits; usage?:unknown};
/** Repair the pre-provider rejection caused by D1's trigger-inclusive change count.
 * The unique Arc step claim prevents another owner reaching the gateway. Only a
 * failed first step still at model_pending, with no decision/output and an entirely
 * unsettled reservation, proves this specific rejection never sent a provider call.
 * Unknown, settled, active and externally dispatched work is never released here. */
export async function reconcileArcDispatchRejects(db:D1Database,userId:string){
  const rejected=(await db.prepare(`SELECT b.id,b.organization_id FROM billing_reservations b
    JOIN arc_chat_runs r ON r.id=b.run_id AND r.user_id=b.user_id AND r.session_id=b.task_id
    JOIN arc_chat_steps s ON s.run_id=r.id AND s.step=0
    WHERE b.user_id=?1 AND b.lane='arc_hosted' AND b.provider='openai' AND b.model_id='arc-auto'
      AND b.status='reserved' AND b.accounted=1 AND b.settlement_json IS NULL
      AND json_extract(b.request_json,'$.operationId')='chat:0'
      AND r.status='failed' AND r.error_code='MODEL_ALREADY_DISPATCHED' AND r.step=0 AND r.tokens_used=0
      AND s.status='model_pending' AND s.decision_ciphertext IS NULL AND s.result_ciphertext IS NULL
      AND EXISTS(SELECT 1 FROM arc_funding_policy WHERE managed=1 AND b.created_at>=started_at)
      AND NOT EXISTS(SELECT 1 FROM arc_chat_messages m WHERE m.run_id=r.id AND m.role IN ('assistant','tool'))
    ORDER BY r.created_at DESC LIMIT 20`).bind(userId).all<{id:string;organization_id:string}>()).results;
  for(const row of rejected)await settleBilling(db,{userId,organizationId:row.organization_id},row.id,{
    status:'failed',actual:{credits:0,costMicros:0,neurons:0},
    usage:{reconciliation:'arc-d1-dispatch-reject-v1',providerAttempted:false},
  });
  return rejected.length;
}
/** Unknown effects keep the full reservation. A later verified settlement can reconcile it, never replay the provider. */
export async function settleBilling(db:D1Database, context:Pick<BillingContext,"userId"|"organizationId">, id:string, settlement:BillingSettlement, at=new Date().toISOString()) {
  const row = await db.prepare("SELECT id,request_json,entries_json,status,settlement_json FROM billing_reservations WHERE id=?1 AND user_id=?2 AND organization_id=?3")
    .bind(id,context.userId,context.organizationId).first<Row>();
  if (!row) throw new BillingDeniedError("BILLING_RESERVATION_NOT_FOUND");
  const serialized = JSON.stringify(settlement);
  if (["completed","failed"].includes(row.status)) {
    if (row.settlement_json!==serialized) throw new BillingDeniedError("BILLING_SETTLEMENT_CONFLICT");
    return;
  }
  if (settlement.status==="unknown") {
    await db.batch([
      db.prepare("UPDATE billing_reservations SET status='unknown',settlement_json=?1 WHERE id=?2 AND status IN ('reserved','unknown')")
        .bind(serialized,id),
      db.prepare(`INSERT OR IGNORE INTO billing_events(id,reservation_id,event_type,details_json,created_at)
        SELECT ?1,id,'unknown',?2,?3 FROM billing_reservations WHERE id=?4 AND status='unknown'`)
        .bind(crypto.randomUUID(),serialized,at,id),
    ]);
    return;
  }
  if (!settlement.actual || !["completed","failed"].includes(settlement.status)) throw new BillingDeniedError("BILLING_INVALID_SETTLEMENT");
  const actual = units(settlement.actual), maximum = (JSON.parse(row.request_json) as {maximum:BillingUnits}).maximum;
  if (actual.credits>maximum.credits || actual.costMicros>maximum.costMicros || actual.neurons>maximum.neurons) {
    await settleBilling(db,context,id,{status:"unknown",usage:settlement.usage},at);
    throw new BillingDeniedError("BILLING_USAGE_EXCEEDED_RESERVATION");
  }
  const rootBudgetId=(JSON.parse(row.request_json) as {rootBudgetId?:string}).rootBudgetId;
  const entries = (JSON.parse(row.entries_json) as Entry[]).map(e=>({...e,actual:rootBudgetId&&e.scope_id===rootBudgetId&&e.period_key==='lifetime'&&e.metric==='credits'?costCreditUnits(actual.costMicros):unitValue(actual,e.metric)}));
  const entriesJson = JSON.stringify(entries);
  const creditRate=(JSON.parse(row.request_json) as {creditRate?:typeof ARC_CREDIT_RATE}).creditRate;
  if(creditRate&&(creditRate.version!=='arc-credits-v1'||creditRate.costMicrosPerUnit!==2))throw new BillingDeniedError('BILLING_CREDIT_RATE_UNSUPPORTED');
  const result = await db.batch([
    db.prepare("UPDATE billing_reservations SET status='settling',settlement_json=?1 WHERE id=?2 AND status IN ('reserved','unknown')")
      .bind(serialized,id),
    ...(creditRate?settleCreditStatements(db,id,context.userId,Math.ceil(actual.costMicros/creditRate.costMicrosPerUnit),at):[]),
    db.prepare(`UPDATE billing_budgets AS b SET reserved_units=reserved_units-
      (SELECT json_extract(e.value,'$.units') FROM json_each(?1) e WHERE ${sameEntry}),
      spent_units=spent_units+(SELECT json_extract(e.value,'$.actual') FROM json_each(?1) e WHERE ${sameEntry}),updated_at=?2
      WHERE EXISTS(SELECT 1 FROM billing_reservations r WHERE r.id=?3 AND r.status='settling' AND r.settlement_json=?4)
      AND EXISTS(SELECT 1 FROM json_each(?1) e WHERE ${sameEntry})`).bind(entriesJson,at,id,serialized),
    db.prepare(`INSERT OR IGNORE INTO billing_events(id,reservation_id,event_type,details_json,created_at)
      SELECT ?1,id,'settled',?2,?3 FROM billing_reservations WHERE id=?4 AND status='settling' AND settlement_json=?2`)
      .bind(crypto.randomUUID(),serialized,at,id),
    db.prepare("UPDATE billing_reservations SET status=?1,settled_at=?2 WHERE id=?3 AND status='settling' AND settlement_json=?4")
      .bind(settlement.status,at,id,serialized),
  ]);
  if (Number(result[0]?.meta.changes)!==1) {
    const current=await db.prepare("SELECT settlement_json FROM billing_reservations WHERE id=?1").bind(id).first<{settlement_json:string}>();
    if(current?.settlement_json!==serialized)throw new BillingDeniedError("BILLING_SETTLEMENT_CONFLICT");
  }
}
async function requireBillingAdmin(db:D1Database,actorId:string) {
  const actor=await db.prepare("SELECT role FROM users WHERE id=?1").bind(actorId).first<{role:string}>();
  if(actor?.role!=="admin")throw new BillingDeniedError("BILLING_ADMIN_REQUIRED");
}
export async function setBillingLimit(db:D1Database,actorId:string,input:Omit<Entry,"units"> & {limit:number},at=new Date().toISOString()) {
  await requireBillingAdmin(db,actorId);
  if(!["global","organization","user","task"].includes(input.scope_type)||!["connect","arc_hosted"].includes(input.lane)||
    !["credits","cost_micros","neurons"].includes(input.metric)||!/^\d{4}-\d{2}-\d{2}$/.test(input.period_key))
    throw new BillingDeniedError("BILLING_INVALID_LIMIT");
  textId(input.scope_id);integer(input.limit);
  const row=await db.prepare(`INSERT INTO billing_budgets(scope_type,scope_id,lane,metric,period_key,limit_units,updated_at)
    VALUES(?1,?2,?3,?4,?5,?6,?7) ON CONFLICT(scope_type,scope_id,lane,metric,period_key)
    DO UPDATE SET limit_units=excluded.limit_units,updated_at=excluded.updated_at
    WHERE spent_units+reserved_units<=excluded.limit_units RETURNING limit_units`)
    .bind(input.scope_type,input.scope_id,input.lane,input.metric,input.period_key,input.limit,at).first();
  if(!row)throw new BillingDeniedError("BILLING_LIMIT_BELOW_COMMITTED_USAGE");
}
export async function getBillingUsage(db:D1Database,context:Pick<BillingContext,"userId"|"organizationId">,period=new Date().toISOString().slice(0,10)) {
  const membership=await db.prepare("SELECT 1 AS ok FROM organization_members WHERE user_id=?1 AND organization_id=?2 AND status='active'")
    .bind(context.userId,context.organizationId).first();
  if(!membership)throw new BillingDeniedError("BILLING_MEMBERSHIP_REQUIRED");
  return (await db.prepare(`SELECT scope_type,scope_id,lane,metric,period_key,limit_units,spent_units,reserved_units FROM billing_budgets
    WHERE period_key=?3 AND ((scope_type='user' AND scope_id=?1) OR (scope_type='task' AND scope_id IN
    (SELECT id FROM automations WHERE user_id=?1 UNION SELECT id FROM arc_chat_sessions WHERE user_id=?1 AND deleted_at IS NULL)) OR (scope_type='organization' AND scope_id=?2 AND EXISTS
    (SELECT 1 FROM organization_members WHERE user_id=?1 AND organization_id=?2 AND status='active' AND role IN ('owner','admin'))))`)
    .bind(context.userId,context.organizationId,period).all()).results;
}

export async function grantPaidModel(db:D1Database,actorId:string,input:{id:string;userId:string;organizationId:string;taskId?:string;provider:"openai"|"anthropic"|"openrouter";maxCostMicros:number;expiresAt:string},at=new Date().toISOString()) {
  await requireBillingAdmin(db,actorId);
  for(const id of [input.id,input.userId,input.organizationId])textId(id);
  integer(input.maxCostMicros);
  if(input.maxCostMicros<1||!["openai","anthropic","openrouter"].includes(input.provider)||!Number.isFinite(Date.parse(input.expiresAt))||new Date(input.expiresAt).toISOString()<=at)
    throw new BillingDeniedError("BILLING_INVALID_GRANT");
  const result=await db.prepare(`INSERT INTO billing_model_grants(id,user_id,organization_id,task_id,provider,max_cost_micros,expires_at,granted_by_user_id,created_at)
    SELECT ?1,?2,?3,?4,?5,?6,?7,?8,?9 WHERE EXISTS
    (SELECT 1 FROM organization_members WHERE user_id=?2 AND organization_id=?3 AND status='active')
    AND (?4 IS NULL OR EXISTS(SELECT 1 FROM automations WHERE id=?4 AND user_id=?2))`)
    .bind(input.id,input.userId,input.organizationId,input.taskId??null,input.provider,input.maxCostMicros,new Date(input.expiresAt).toISOString(),actorId,at).run();
  if(!result.meta.changes)throw new BillingDeniedError("BILLING_MEMBERSHIP_REQUIRED");
}
export async function configureFreeAiPool(db:D1Database,actorId:string,input:{id:string;period:string;mode:"dedicated_account"|"all_usage_managed";managedPoolAssertion:boolean;freeNeurons:number;outsideUsedNeurons:number},at=new Date().toISOString()) {
  await requireBillingAdmin(db,actorId);textId(input.id);integer(input.freeNeurons);integer(input.outsideUsedNeurons);
  if(!input.managedPoolAssertion||!["dedicated_account","all_usage_managed"].includes(input.mode)||
    input.period!==at.slice(0,10)||input.freeNeurons<1||input.freeNeurons>10000||input.outsideUsedNeurons>=input.freeNeurons)
    throw new BillingDeniedError("BILLING_UNVERIFIED_FREE_POOL");
  await db.prepare(`INSERT INTO billing_free_ai_pools
    (id,period_key,ownership_mode,managed_pool_assertion,free_neurons,outside_used_neurons,enabled,verified_at)
    VALUES(?1,?2,?3,1,?4,?5,1,?6) ON CONFLICT(id) DO UPDATE SET period_key=excluded.period_key,
    ownership_mode=excluded.ownership_mode,free_neurons=excluded.free_neurons,outside_used_neurons=excluded.outside_used_neurons,
    enabled=1,verified_at=excluded.verified_at`)
    .bind(input.id,input.period,input.mode,input.freeNeurons,input.outsideUsedNeurons,at).run();
}
export async function getAdminBillingUsage(db:D1Database,actorId:string,period=new Date().toISOString().slice(0,10)) {
  await requireBillingAdmin(db,actorId);
  const [budgets,reservations]=await Promise.all([
    db.prepare("SELECT * FROM billing_budgets WHERE period_key=?1 ORDER BY scope_type,scope_id LIMIT 500").bind(period).all(),
    db.prepare(`SELECT id,user_id,organization_id,task_id,run_id,lane,provider,model_id,status,created_at,settled_at
      FROM billing_reservations WHERE substr(created_at,1,10)=?1 ORDER BY created_at DESC LIMIT 200`).bind(period).all(),
  ]);
  return {budgets:budgets.results,reservations:reservations.results};
}

const billingFeatures=new Set(["apps","hosted_inference","paid_models","team_workspace"]);
export async function defineBillingPlan(db:D1Database,actorId:string,input:{id:string;lane:BillingLane;features:string[]},at=new Date().toISOString()) {
  await requireBillingAdmin(db,actorId);textId(input.id);
  if(!["connect","arc_hosted"].includes(input.lane)||!Array.isArray(input.features)||input.features.some(f=>!billingFeatures.has(f))||
    (input.lane==="connect"&&input.features.some(f=>f!=="apps")))throw new BillingDeniedError("BILLING_INVALID_PLAN");
  await db.prepare("INSERT INTO billing_plans(id,lane,features_json,created_at) VALUES(?1,?2,?3,?4)")
    .bind(input.id,input.lane,JSON.stringify([...new Set(input.features)]),at).run();
}
export async function assignBillingPlan(db:D1Database,actorId:string,input:{id:string;planId:string;subjectType:"user"|"organization";subjectId:string;expiresAt:string},at=new Date().toISOString()) {
  await requireBillingAdmin(db,actorId);
  for(const id of [input.id,input.planId,input.subjectId])textId(id);
  if(!["user","organization"].includes(input.subjectType)||!Number.isFinite(Date.parse(input.expiresAt))||new Date(input.expiresAt).toISOString()<=at)
    throw new BillingDeniedError("BILLING_INVALID_PLAN_ASSIGNMENT");
  const row=await db.prepare(`INSERT INTO billing_plan_assignments(id,plan_id,subject_type,subject_id,expires_at,granted_by_user_id,created_at)
    SELECT ?1,?2,?3,?4,?5,?6,?7 WHERE EXISTS(SELECT 1 FROM billing_plans WHERE id=?2 AND active=1) AND
    ((?3='user' AND EXISTS(SELECT 1 FROM users WHERE id=?4)) OR (?3='organization' AND EXISTS(SELECT 1 FROM organizations WHERE id=?4)))`)
    .bind(input.id,input.planId,input.subjectType,input.subjectId,new Date(input.expiresAt).toISOString(),actorId,at).run();
  if(!row.meta.changes)throw new BillingDeniedError("BILLING_PLAN_OR_SUBJECT_NOT_FOUND");
}
/** This does not replace Connect's legacy Plus calculation or grant devices, tools, money or provider access. */
export async function getBillingEntitlements(db:D1Database,context:Pick<BillingContext,"userId"|"organizationId">,lane:BillingLane,at=new Date().toISOString()) {
  if(!["connect","arc_hosted"].includes(lane))throw new BillingDeniedError("BILLING_INVALID_PLAN");
  const membership=await db.prepare("SELECT 1 AS ok FROM organization_members WHERE user_id=?1 AND organization_id=?2 AND status='active'")
    .bind(context.userId,context.organizationId).first();
  if(!membership)throw new BillingDeniedError("BILLING_MEMBERSHIP_REQUIRED");
  const rows=await db.prepare(`SELECT p.id,p.features_json FROM billing_plans p JOIN billing_plan_assignments a ON a.plan_id=p.id
    WHERE p.lane=?1 AND p.active=1 AND a.revoked_at IS NULL AND a.expires_at>?4
    AND ((a.subject_type='user' AND a.subject_id=?2) OR (a.subject_type='organization' AND a.subject_id=?3))`)
    .bind(lane,context.userId,context.organizationId,at).all<{id:string;features_json:string}>();
  return {lane,planIds:[...new Set(rows.results.map(r=>r.id))],
    features:[...new Set(rows.results.flatMap(r=>JSON.parse(r.features_json) as string[]))].sort()};
}
