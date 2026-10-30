type TrackingEnv={DB:D1Database};
export type BusinessScene='email_login'|'google_login'|'device_pairing';
const stages:Record<BusinessScene,readonly string[]>={email_login:['started','delivered','verification','verified','completed'],google_login:['started','callback','verified','completed'],device_pairing:['started','opened','signed_in','approved','credential','online']};
/** Analytics is fail-open and never changes auth, payment or device results. */
export async function startBusinessFlow(env:TrackingEnv,input:{id:string;scene:BusinessScene;userId?:string|null;deviceId?:string|null;dimension?:string|null;at?:string;expiresAt:string}){
 try{
  const at=input.at||new Date().toISOString();
  await env.DB.batch([
   env.DB.prepare('INSERT OR IGNORE INTO business_flow_attempts(id,scene,user_id,device_id,dimension,started_at,expires_at) VALUES(?1,?2,?3,?4,?5,?6,?7)').bind(input.id,input.scene,input.userId||null,input.deviceId||null,input.dimension||null,at,input.expiresAt),
   env.DB.prepare("INSERT OR IGNORE INTO business_flow_steps(flow_id,step,occurred_at) SELECT id,'started',started_at FROM business_flow_attempts WHERE id=?1").bind(input.id),
  ]);
 }catch{console.warn('business_flow_start_unavailable');}
}
export async function advanceBusinessFlow(env:TrackingEnv,id:string,scene:BusinessScene,step:string,input:{userId?:string|null;deviceId?:string|null;at?:string}={}){
 if(!stages[scene].includes(step))return;
 try{
  const at=input.at||new Date().toISOString(),complete=step===stages[scene].at(-1);
  await env.DB.batch([
   env.DB.prepare('UPDATE business_flow_attempts SET user_id=COALESCE(user_id,?3),device_id=COALESCE(device_id,?4),succeeded_at=CASE WHEN ?5=1 THEN COALESCE(succeeded_at,?6) ELSE succeeded_at END WHERE id=?1 AND scene=?2').bind(id,scene,input.userId||null,input.deviceId||null,Number(complete),at),
   env.DB.prepare('INSERT OR IGNORE INTO business_flow_steps(flow_id,step,occurred_at) SELECT id,?3,?4 FROM business_flow_attempts WHERE id=?1 AND scene=?2 AND started_at<=?4').bind(id,scene,step,at),
  ]);
 }catch{console.warn('business_flow_step_unavailable');}
}
export async function failBusinessFlow(env:TrackingEnv,id:string,reason:string){
 try{await env.DB.prepare('UPDATE business_flow_attempts SET failed_at=COALESCE(failed_at,?2),failure_reason=?3 WHERE id=?1 AND succeeded_at IS NULL').bind(id,new Date().toISOString(),reason).run();}catch{console.warn('business_flow_outcome_unavailable');}
}
export async function recordBusinessActivity(env:TrackingEnv,userId:string,at=new Date().toISOString()){
 try{await env.DB.batch([env.DB.prepare(`INSERT INTO business_activity_days(user_id,day,first_at,last_at) VALUES(?1,?2,?3,?3)
 ON CONFLICT(user_id,day) DO UPDATE SET first_at=MIN(first_at,excluded.first_at),last_at=MAX(last_at,excluded.last_at)`)
 .bind(userId,at.slice(0,10),at),env.DB.prepare(`UPDATE business_cohort_users SET
 returned_d1=MAX(returned_d1,CASE WHEN date(registered_at,'+1 day')=?2 THEN 1 ELSE 0 END),
 returned_d7=MAX(returned_d7,CASE WHEN date(registered_at,'+7 day')=?2 THEN 1 ELSE 0 END),
 returned_d30=MAX(returned_d30,CASE WHEN date(registered_at,'+30 day')=?2 THEN 1 ELSE 0 END)
 WHERE user_id=?1`).bind(userId,at.slice(0,10))]);}catch{console.warn('business_activity_unavailable');}
}
export async function recordDeviceOnline(env:TrackingEnv,deviceId:string,userId:string){
 try{
  const flows=await env.DB.prepare("SELECT id FROM business_flow_attempts WHERE scene='device_pairing' AND device_id=?1 AND user_id=?2 AND succeeded_at IS NULL").bind(deviceId,userId).all<{id:string}>();
  for(const flow of flows.results)await advanceBusinessFlow(env,flow.id,'device_pairing','online',{userId,deviceId});
 }catch{console.warn('business_device_online_unavailable');}
}
export async function linkBusinessReceipt(env:TrackingEnv,checkoutId:string|undefined,receiptId:string,userId:string,productId:string){
 if(!checkoutId)return;
 try{await env.DB.prepare(`UPDATE arc_billing_checkouts SET receipt_id=COALESCE(receipt_id,?2)
 WHERE id=?1 AND user_id=?3 AND product_id=?4 AND EXISTS(SELECT 1 FROM arc_payment_receipts r
 WHERE r.id=?2 AND r.user_id=?3 AND r.product_id=?4 AND r.state='paid')`).bind(checkoutId,receiptId,userId,productId).run();}catch{console.warn('business_receipt_link_unavailable');}
}
export async function purgeBusinessMetrics(env:TrackingEnv){
 try{
  await env.DB.prepare('DELETE FROM business_flow_attempts WHERE id IN (SELECT id FROM business_flow_attempts WHERE started_at<?1 LIMIT 5000)').bind(new Date(Date.now()-180*86400000).toISOString()).run();
  await env.DB.prepare('DELETE FROM business_activity_days WHERE day<?1').bind(new Date(Date.now()-400*86400000).toISOString().slice(0,10)).run();
  await env.DB.prepare('DELETE FROM business_cohort_users WHERE registered_at<?1').bind(new Date(Date.now()-400*86400000).toISOString()).run();
 }catch{console.warn('business_metrics_retention_unavailable');}
}
