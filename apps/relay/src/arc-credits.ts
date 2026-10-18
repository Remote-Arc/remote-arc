import {ARC_CREDIT_RATE,ARC_PLANS,ARC_TOPUPS,ARC_TRIAL_CREDITS} from '@remotearc/protocol';

export type CreditSource='trial'|'subscription'|'topup'|'promotion';
export type CreditRate=typeof ARC_CREDIT_RATE;
export class CreditError extends Error {constructor(code:string){super(code);}}
const safeUnits=(value:number)=>{if(!Number.isSafeInteger(value)||value<0||value>2000000000)throw new CreditError('ARC_CREDITS_INVALID_UNITS');return value;};
const iso=(value:string)=>{if(!Number.isFinite(Date.parse(value)))throw new CreditError('ARC_CREDITS_INVALID_DATE');return new Date(value).toISOString();};
export const costCreditUnits=(costMicros:number)=>Math.ceil(safeUnits(costMicros)/ARC_CREDIT_RATE.costMicrosPerUnit);
export const displayCredits=(units:number)=>{if(!Number.isSafeInteger(units)||units<0)throw new CreditError('ARC_CREDITS_INVALID_UNITS');return units/ARC_CREDIT_RATE.unitsPerCredit;};

type Grant={userId:string;source:CreditSource;sourceRef:string;units:number;startsAt?:string;expiresAt?:string|null;reason:string;actorId?:string;alreadySpentUnits?:number};
/** Only verified receipts or a real administrator can provision paid/promotional
 * lots. Repeated source events cannot change their original owner or allowance. */
export async function grantArcCredits(db:D1Database,input:Grant,at=new Date().toISOString()){
  const granted=safeUnits(input.units),spent=safeUnits(input.alreadySpentUnits??0);
  if(!granted||spent>granted||!input.userId||!input.sourceRef||input.sourceRef.length>200||!input.reason.trim()||input.reason.length>500||!['trial','subscription','topup','promotion'].includes(input.source))throw new CreditError('ARC_CREDITS_INVALID_GRANT');
  const start=iso(input.startsAt||at),expiry=input.expiresAt?iso(input.expiresAt):null;
  if(expiry&&expiry<=start)throw new CreditError('ARC_CREDITS_INVALID_DATE');
  if(input.source==='trial'&&(granted!==ARC_TRIAL_CREDITS*ARC_CREDIT_RATE.unitsPerCredit||input.sourceRef!=='trial:'+input.userId+':'+start))throw new CreditError('ARC_CREDITS_INVALID_TRIAL');
  let receipt:{product_id:string;amount_cents:number;period_start:string|null;period_end:string|null}|null=null;
  if(input.source==='subscription'||input.source==='topup'){
    receipt=await db.prepare("SELECT product_id,amount_cents,period_start,period_end FROM arc_payment_receipts WHERE id=?1 AND user_id=?2 AND state='paid' AND currency='usd'").bind(input.sourceRef,input.userId).first();
    if(!receipt)throw new CreditError('ARC_CREDITS_GRANT_NOT_AUTHORIZED');
    const product=input.source==='subscription'?ARC_PLANS.find(p=>p.id===receipt!.product_id&&p.monthlyPriceCents>0):ARC_TOPUPS.find(p=>p.id===receipt!.product_id);
    const credits=product&&('monthlyCredits' in product?product.monthlyCredits:product.credits),price=product&&('monthlyPriceCents' in product?product.monthlyPriceCents:product.priceCents);
    if(!product||granted!==credits!*ARC_CREDIT_RATE.unitsPerCredit||receipt.amount_cents!==price||spent!==0)throw new CreditError('ARC_CREDITS_RECEIPT_MISMATCH');
    if(input.source==='subscription'&&(receipt.period_start!==start||receipt.period_end!==expiry||!expiry))throw new CreditError('ARC_CREDITS_RECEIPT_MISMATCH');
    if(input.source==='topup'&&expiry!==null)throw new CreditError('ARC_CREDITS_RECEIPT_MISMATCH');
  }
  const id=crypto.randomUUID();
  await db.batch([
    db.prepare(`INSERT OR IGNORE INTO arc_credit_lots(id,user_id,source,source_ref,granted_units,spent_units,starts_at,expires_at,reason,actor_id,created_at)
      SELECT ?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11 WHERE
      (?3='trial' AND EXISTS(SELECT 1 FROM arc_trials t WHERE t.user_id=?2 AND t.started_at=?7 AND t.expires_at=?8))
      OR (?3='promotion' AND EXISTS(SELECT 1 FROM users WHERE id=?10 AND role='admin'))
      OR (?3 IN ('subscription','topup') AND EXISTS(SELECT 1 FROM arc_payment_receipts r WHERE r.id=?4 AND r.user_id=?2 AND r.state='paid' AND r.product_id=?12 AND r.amount_cents=?13 AND r.period_start IS ?14 AND r.period_end IS ?15))`)
      .bind(id,input.userId,input.source,input.sourceRef,granted,spent,start,expiry,input.reason,input.actorId??null,at,receipt?.product_id??null,receipt?.amount_cents??null,receipt?.period_start??null,receipt?.period_end??null),
    db.prepare(`INSERT OR IGNORE INTO arc_credit_events(id,user_id,event_type,lot_id,units,reason,created_at)
      SELECT 'grant:'||id,user_id,'granted',id,granted_units,reason,created_at FROM arc_credit_lots WHERE source_ref=?1`).bind(input.sourceRef),
  ]);
  const row=await db.prepare('SELECT id,user_id,source,granted_units,starts_at,expires_at FROM arc_credit_lots WHERE source_ref=?1').bind(input.sourceRef).first<{id:string;user_id:string;source:string;granted_units:number;starts_at:string;expires_at:string|null}>();
  if(!row)throw new CreditError('ARC_CREDITS_GRANT_NOT_AUTHORIZED');
  if(row.user_id!==input.userId||row.source!==input.source||row.granted_units!==granted||(input.startsAt&&row.starts_at!==start)||row.expires_at!==expiry)throw new CreditError('ARC_CREDITS_GRANT_CONFLICT');
  return row.id;
}

const availableLot=`l.revoked_at IS NULL AND l.starts_at<=?12 AND (l.expires_at IS NULL OR l.expires_at>?12)`;
/** Embedded in the same INSERT snapshot as provider authority and spending caps. */
export const creditAuthoritySql=(maximum:number)=>`COALESCE((SELECT SUM(l.granted_units-l.spent_units-l.reserved_units) FROM arc_credit_lots l WHERE l.user_id=?2 AND ${availableLot}),0)>=${safeUnits(maximum)}`;

export function reserveCreditStatements(db:D1Database,reservationId:string,userId:string,maximum:number,at:string){
  safeUnits(maximum);
  return [
    db.prepare(`INSERT INTO arc_credit_allocations(reservation_id,lot_id,ordinal,units)
      WITH eligible AS (SELECT id,expires_at,created_at,granted_units-spent_units-reserved_units AS available FROM arc_credit_lots
        WHERE user_id=?2 AND revoked_at IS NULL AND starts_at<=?4 AND (expires_at IS NULL OR expires_at>?4) AND granted_units>spent_units+reserved_units),
      ranked AS (SELECT *,ROW_NUMBER() OVER (ORDER BY COALESCE(expires_at,'9999'),created_at,id) AS ordinal,
        COALESCE(SUM(available) OVER (ORDER BY COALESCE(expires_at,'9999'),created_at,id ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),0) AS prior FROM eligible)
      SELECT ?1,id,ordinal,MIN(available,?3-prior) FROM ranked WHERE prior<?3
        AND EXISTS(SELECT 1 FROM billing_reservations WHERE id=?1 AND accounted=0)`)
      .bind(reservationId,userId,maximum,at),
    db.prepare(`UPDATE arc_credit_lots SET reserved_units=reserved_units+(SELECT a.units FROM arc_credit_allocations a WHERE a.reservation_id=?1 AND a.lot_id=arc_credit_lots.id)
      WHERE EXISTS(SELECT 1 FROM arc_credit_allocations a JOIN billing_reservations r ON r.id=a.reservation_id WHERE a.reservation_id=?1 AND a.lot_id=arc_credit_lots.id AND r.accounted=0)`)
      .bind(reservationId),
  ];
}

/** Called only after billing's atomic reserved/unknown -> settling claim. */
export function settleCreditStatements(db:D1Database,reservationId:string,userId:string,actual:number,at:string){
  safeUnits(actual);
  return [
    db.prepare(`UPDATE arc_credit_allocations AS a SET spent_units=MIN(units,MAX(0,?2-COALESCE((SELECT SUM(previous.units) FROM arc_credit_allocations previous WHERE previous.reservation_id=a.reservation_id AND previous.ordinal<a.ordinal),0)))
      WHERE reservation_id=?1 AND EXISTS(SELECT 1 FROM billing_reservations r WHERE r.id=?1 AND r.status='settling')`)
      .bind(reservationId,actual),
    db.prepare(`UPDATE arc_credit_lots AS l SET reserved_units=reserved_units-(SELECT a.units FROM arc_credit_allocations a WHERE a.reservation_id=?1 AND a.lot_id=l.id),
      spent_units=spent_units+(SELECT a.spent_units FROM arc_credit_allocations a WHERE a.reservation_id=?1 AND a.lot_id=l.id)
      WHERE EXISTS(SELECT 1 FROM arc_credit_allocations a JOIN billing_reservations r ON r.id=a.reservation_id WHERE a.reservation_id=?1 AND a.lot_id=l.id AND r.status='settling')`)
      .bind(reservationId),
    db.prepare(`INSERT OR IGNORE INTO arc_credit_events(id,user_id,event_type,reservation_id,units,reason,created_at)
      SELECT 'settle:'||id,?2,'settled',id,?3,'Recorded model usage',?4 FROM billing_reservations WHERE id=?1 AND status='settling'`)
      .bind(reservationId,userId,actual,at),
  ];
}

export async function creditBalance(db:D1Database,userId:string,at=new Date().toISOString()){
  at=iso(at);
  const lots=(await db.prepare(`SELECT id,source,granted_units,spent_units,reserved_units,starts_at,expires_at,revoked_at FROM arc_credit_lots WHERE user_id=?1 ORDER BY COALESCE(expires_at,'9999'),created_at,id LIMIT 500`).bind(userId).all<{id:string;source:CreditSource;granted_units:number;spent_units:number;reserved_units:number;starts_at:string;expires_at:string|null;revoked_at:string|null}>()).results;
  const totals=await db.prepare(`SELECT COALESCE(SUM(CASE WHEN revoked_at IS NULL AND starts_at<=?2 AND (expires_at IS NULL OR expires_at>?2) THEN granted_units-spent_units-reserved_units ELSE 0 END),0) AS available,COALESCE(SUM(reserved_units),0) AS pending,COUNT(*) AS count FROM arc_credit_lots WHERE user_id=?1`).bind(userId,at).first<{available:number;pending:number;count:number}>();
  const active=lots.filter(l=>!l.revoked_at&&l.starts_at<=at&&(!l.expires_at||l.expires_at>at));
  return {
    available:displayCredits(totals?.available??0),
    pending:displayCredits(totals?.pending??0),
    bucketsTruncated:(totals?.count??0)>lots.length,
    buckets:lots.map(l=>({id:l.id,source:l.source,granted:displayCredits(l.granted_units),spent:displayCredits(l.spent_units),pending:displayCredits(l.reserved_units),available:active.includes(l)?displayCredits(l.granted_units-l.spent_units-l.reserved_units):0,startsAt:l.starts_at,expiresAt:l.expires_at,revoked:Boolean(l.revoked_at)})),
  };
}

export async function revokeCreditLot(db:D1Database,actorId:string,lotId:string,reason:string,at=new Date().toISOString()){
  if(reason.trim().length<10||reason.length>500)throw new CreditError('ARC_CREDITS_REASON_REQUIRED');
  const admin=await db.prepare("SELECT id FROM users WHERE id=?1 AND role='admin'").bind(actorId).first();
  if(!admin)throw new CreditError('ARC_CREDITS_ADMIN_REQUIRED');
  const result=await db.batch([
    db.prepare('UPDATE arc_credit_lots SET revoked_at=?1 WHERE id=?2 AND revoked_at IS NULL').bind(at,lotId),
    db.prepare(`INSERT OR IGNORE INTO arc_credit_events(id,user_id,event_type,lot_id,units,reason,created_at)
      SELECT 'revoke:'||id,user_id,'revoked',id,granted_units-spent_units-reserved_units,?2,?3 FROM arc_credit_lots WHERE id=?1 AND revoked_at=?3`).bind(lotId,reason,at),
  ]);
  return Boolean(result[0]?.meta.changes);
}
