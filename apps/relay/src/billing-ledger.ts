export type BillingLane = "connect" | "arc_hosted";
export type BillingContext = {
  userId: string; organizationId: string; taskId: string; runId: string; operationId: string;
  lane: BillingLane;
};
export type BillingUnits = { credits: number; costMicros: number; neurons: number };
export type BillingReservationInput = BillingContext & {
  provider: "workers_ai" | "openai" | "anthropic";
  modelId: string; authorizationId: string; maximum: BillingUnits;
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
 AND EXISTS(SELECT 1 FROM automations a WHERE a.id=?4 AND a.user_id=?2)`;
function normalize(input: BillingReservationInput, at: string) {
  for (const id of [input.userId,input.organizationId,input.taskId,input.runId,input.operationId,input.modelId,input.authorizationId]) textId(id);
  if (!["connect","arc_hosted"].includes(input.lane) || !["workers_ai","openai","anthropic"].includes(input.provider)) throw new BillingDeniedError("BILLING_INVALID_CONTEXT");
  const maximum = units(input.maximum);
  if (maximum.credits < 1) throw new BillingDeniedError("BILLING_INVALID_UNITS");
  const period = at.slice(0,10), entries: Entry[] = [];
  const scopes = [["global","platform"],["organization",input.organizationId],["user",input.userId],["task",input.taskId]];
  for (const [scope_type,scope_id] of scopes) for (const metric of ["credits","cost_micros","neurons"]) {
    const amount = unitValue(maximum,metric);
    if (amount) entries.push({scope_type:scope_type!,scope_id:scope_id!,lane:input.lane,metric,period_key:period,units:amount});
  }
  const request = {userId:input.userId,organizationId:input.organizationId,taskId:input.taskId,runId:input.runId,
    operationId:input.operationId,lane:input.lane,provider:input.provider,modelId:input.modelId,authorizationId:input.authorizationId,maximum,period};
  return {requestJson:JSON.stringify(request), entriesJson:JSON.stringify(entries),entries,period};
}
/** All caps are checked in the INSERT's snapshot; D1 batch commits the reservation and counters atomically. */
export async function reserveBilling(db: D1Database, input: BillingReservationInput, at = new Date().toISOString()) {
  const n = normalize(input,at), id = crypto.randomUUID(), operationKey = JSON.stringify([input.userId,input.runId,input.operationId]);
  const authority = input.provider === "workers_ai"
    ? `EXISTS(SELECT 1 FROM billing_free_ai_pools p WHERE p.id=?9 AND p.period_key=?10 AND p.enabled=1
       AND p.managed_pool_assertion=1 AND substr(p.verified_at,1,10)=?10
       AND EXISTS(SELECT 1 FROM billing_budgets b WHERE b.scope_type='global' AND b.scope_id='platform'
       AND b.lane='arc_hosted' AND b.metric='neurons' AND b.period_key=?10
       AND b.limit_units <= p.free_neurons-p.outside_used_neurons)) AND ?7='arc_hosted' AND ?14=0`
    : `EXISTS(SELECT 1 FROM billing_model_grants g WHERE g.id=?9 AND g.user_id=?2 AND g.organization_id=?3
       AND (g.task_id IS NULL OR g.task_id=?4) AND g.provider=?8 AND g.revoked_at IS NULL
       AND g.expires_at>?12 AND g.max_cost_micros>=?14) AND ?7='arc_hosted' AND ?14>0`;
  const result = await db.batch([
    db.prepare(`INSERT OR IGNORE INTO billing_reservations
      (id,user_id,organization_id,task_id,run_id,operation_key,lane,provider,authorization_id,model_id,request_json,entries_json,status,created_at)
      SELECT ?1,?2,?3,?4,?5,?6,?7,?8,?9,?11,?13,?15,'reserved',?12
      WHERE ${userTaskAuth} AND ${authority}
      AND (SELECT COUNT(*) FROM json_each(?15) e JOIN billing_budgets b ON ${sameEntry}
        WHERE b.spent_units+b.reserved_units+json_extract(e.value,'$.units')<=b.limit_units)=?16`)
      .bind(id,input.userId,input.organizationId,input.taskId,input.runId,operationKey,input.lane,input.provider,
        input.authorizationId,n.period,input.modelId,at,n.requestJson,input.maximum.costMicros,n.entriesJson,n.entries.length),
    db.prepare(`INSERT INTO billing_events(id,reservation_id,event_type,details_json,created_at)
      SELECT ?1,id,'reserved',request_json,?2 FROM billing_reservations WHERE id=?3 AND accounted=0`).bind(crypto.randomUUID(),at,id),
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
  return {id:row.id,dispatchAllowed:Number(result[0]?.meta.changes)===1,status:row.status};
}
export type BillingSettlement = {status:"completed"|"failed"|"unknown"; actual?:BillingUnits; usage?:unknown};
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
  const entries = (JSON.parse(row.entries_json) as Entry[]).map(e=>({...e,actual:unitValue(actual,e.metric)}));
  const entriesJson = JSON.stringify(entries);
  const result = await db.batch([
    db.prepare("UPDATE billing_reservations SET status='settling',settlement_json=?1 WHERE id=?2 AND status IN ('reserved','unknown')")
      .bind(serialized,id),
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
    (SELECT id FROM automations WHERE user_id=?1)) OR (scope_type='organization' AND scope_id=?2 AND EXISTS
    (SELECT 1 FROM organization_members WHERE user_id=?1 AND organization_id=?2 AND status='active' AND role IN ('owner','admin'))))`)
    .bind(context.userId,context.organizationId,period).all()).results;
}

export async function grantPaidModel(db:D1Database,actorId:string,input:{id:string;userId:string;organizationId:string;taskId?:string;provider:"openai"|"anthropic";maxCostMicros:number;expiresAt:string},at=new Date().toISOString()) {
  await requireBillingAdmin(db,actorId);
  for(const id of [input.id,input.userId,input.organizationId])textId(id);
  integer(input.maxCostMicros);
  if(input.maxCostMicros<1||!["openai","anthropic"].includes(input.provider)||!Number.isFinite(Date.parse(input.expiresAt))||new Date(input.expiresAt).toISOString()<=at)
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
