import {ARC_CREDIT_RATE} from '@remotearc/protocol';

type BudgetRow={id:string;user_id:string;organization_id:string;task_id:string;limit_units:number;status:'active'|'closed'|'cancelled';created_at:string;updated_at:string};
export type ExecutionBudgetInput={id:string;userId:string;organizationId:string;taskId:string;limitUnits:number};
const safeId=(value:string)=>typeof value==='string'&&/^[\w:.-]{1,160}$/.test(value);
const now=()=>new Date().toISOString();

/** User-confirmed ceiling in wallet credit units, shared for the entire outcome.
 * Creation does not reserve or spend funds and cannot grant model authority. */
export async function createExecutionBudget(db:D1Database,input:ExecutionBudgetInput){
 if(![input.id,input.userId,input.organizationId,input.taskId].every(safeId)||!Number.isSafeInteger(input.limitUnits)||input.limitUnits<1||input.limitUnits>1000000000)throw Error('ARC_BUDGET_INVALID');
 const at=now();
 await db.batch([
  db.prepare(`INSERT OR IGNORE INTO arc_execution_budgets(id,user_id,organization_id,task_id,limit_units,status,created_at,updated_at)
   SELECT ?1,?2,?3,?4,?5,'active',?6,?6
   WHERE EXISTS(SELECT 1 FROM organization_members WHERE organization_id=?3 AND user_id=?2 AND status='active')
   AND (EXISTS(SELECT 1 FROM arc_chat_sessions WHERE id=?4 AND user_id=?2 AND organization_id=?3 AND deleted_at IS NULL)
    OR EXISTS(SELECT 1 FROM automations WHERE id=?4 AND user_id=?2))`).bind(input.id,input.userId,input.organizationId,input.taskId,input.limitUnits,at),
  ...(['credits','cost_micros'] as const).map(metric=>db.prepare(`INSERT OR IGNORE INTO billing_budgets(scope_type,scope_id,lane,metric,period_key,limit_units,updated_at)
   SELECT 'task',id,'arc_hosted',?1,'lifetime',limit_units*?2,?3 FROM arc_execution_budgets WHERE id=?4 AND user_id=?5 AND status='active'`).bind(metric,metric==='credits'?1:ARC_CREDIT_RATE.costMicrosPerUnit,at,input.id,input.userId)),
 ]);
 const row=await db.prepare('SELECT * FROM arc_execution_budgets WHERE id=?1 AND user_id=?2').bind(input.id,input.userId).first<BudgetRow>();
 if(!row)throw Error('ARC_BUDGET_NOT_AUTHORIZED');
 if(row.organization_id!==input.organizationId||row.task_id!==input.taskId||row.limit_units!==input.limitUnits)throw Error('ARC_BUDGET_IDEMPOTENCY_CONFLICT');
 return executionBudget(db,input.userId,input.id);
}
export async function executionBudget(db:D1Database,userId:string,id:string){
 const row=await db.prepare(`SELECT r.*,b.spent_units,b.reserved_units FROM arc_execution_budgets r
  JOIN billing_budgets b ON b.scope_type='task' AND b.scope_id=r.id AND b.lane='arc_hosted' AND b.metric='credits' AND b.period_key='lifetime'
  WHERE r.id=?1 AND r.user_id=?2`).bind(id,userId).first<BudgetRow&{spent_units:number;reserved_units:number}>();
 if(!row)throw Error('ARC_BUDGET_NOT_FOUND');
 return{id:row.id,taskId:row.task_id,status:row.status,limitUnits:row.limit_units,spentUnits:row.spent_units,reservedUnits:row.reserved_units,remainingUnits:row.limit_units-row.spent_units-row.reserved_units,unitsPerCredit:ARC_CREDIT_RATE.unitsPerCredit};
}
export async function closeExecutionBudget(db:D1Database,userId:string,id:string,status:'closed'|'cancelled'){
 if(!['closed','cancelled'].includes(status))throw Error('ARC_BUDGET_INVALID');
 // Pending/unknown reservations remain in the common ledger; closing never
 // makes their possible cost available for another model or employee.
 await db.prepare(`UPDATE arc_execution_budgets SET status=?1,updated_at=?2 WHERE id=?3 AND user_id=?4 AND status='active'`).bind(status,now(),id,userId).run();
 return executionBudget(db,userId,id);
}
