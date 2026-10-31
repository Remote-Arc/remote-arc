import {getSessionUser,nowIso} from '../auth/auth.js';
import {writeAudit} from '../analytics/audit.js';

type CapacityEnv={DB:D1Database;PUBLIC_ORIGIN:string;APP_ORIGIN?:string;ADMIN_ORIGIN?:string};
const future=(value:unknown):value is string=>typeof value==='string'&&value.length<=64&&
  Number.isFinite(Date.parse(value))&&Date.parse(value)>Date.now();
const fail=(error:string,status:number)=>Response.json({error},{status});
async function authorize(request:Request,env:CapacityEnv){
  const user=await getSessionUser(request,env);
  if(!user)return {response:fail('unauthorized',401)};
  if(!user.isAdmin)return {response:fail('forbidden',403)};
  if(request.method!=='GET' && request.headers.get('origin')!==new URL(env.ADMIN_ORIGIN||'https://admin.remotearc.app').origin)
    return {response:fail('invalid_origin',403)};
  return {user};
}
export async function activeDeviceCapacityBonus(db:D1Database,userId:string,at=nowIso()):Promise<number>{
  const row=await db.prepare(`SELECT COALESCE(SUM(extra_devices),0) AS extra
    FROM device_capacity_grants WHERE user_id=?1 AND revoked_at IS NULL
    AND (expires_at IS NULL OR expires_at>?2)`).bind(userId,at).first<{extra:number}>();
  return row?.extra??0;
}
export async function handleAdminDeviceCapacity(request:Request,env:CapacityEnv):Promise<Response>{
  const auth=await authorize(request,env);
  if(auth.response)return auth.response;
  if(request.method==='GET'){
    const email=(new URL(request.url).searchParams.get('email')||'').trim().toLowerCase();
    if(!email||email.length>320)return fail('valid_email_required',400);
    const rows=await env.DB.prepare(`SELECT g.*,u.email FROM device_capacity_grants g
      JOIN users u ON u.id=g.user_id WHERE lower(u.email)=?1
      ORDER BY g.created_at DESC LIMIT 200`).bind(email).all();
    const target=await env.DB.prepare('SELECT id FROM users WHERE lower(email)=?1 LIMIT 1')
      .bind(email).first<{id:string}>();
    if(!target)return fail('account_not_found',404);
    return Response.json({grants:rows.results,active_extra:await activeDeviceCapacityBonus(env.DB,target.id)});
  }
  if(request.method!=='POST')return fail('method_not_allowed',405);
  const input=await request.json().catch(()=>null) as {email?:unknown;extra_devices?:unknown;reason?:unknown;expires_at?:unknown}|null;
  const email=typeof input?.email==='string'?input.email.trim().toLowerCase():'';
  const quantity=input?.extra_devices,reason=typeof input?.reason==='string'?input.reason.trim():'';
  const until=input?.expires_at===undefined||input?.expires_at===null?null:input.expires_at;
  if(!email||email.length>320||!email.includes('@'))return fail('valid_email_required',400);
  if(!Number.isSafeInteger(quantity)||Number(quantity)<1||Number(quantity)>20)return fail('extra_devices_must_be_1_to_20',400);
  if(reason.length<3||reason.length>500)return fail('reason_must_be_3_to_500_characters',400);
  if(until!==null&&!future(until))return fail('expiry_must_be_future_iso',400);
  const target=await env.DB.prepare('SELECT id,email FROM users WHERE lower(email)=?1 LIMIT 1')
    .bind(email).first<{id:string;email:string}>();
  if(!target)return fail('account_not_found',404);
  const id=crypto.randomUUID(),at=nowIso();
  // Constrain the user's combined *extra* allocation, atomically at insert time.
  const outcome=await env.DB.prepare(`INSERT INTO device_capacity_grants
    (id,user_id,extra_devices,reason,granted_by_user_id,expires_at,revoked_at,created_at)
    SELECT ?1,?2,?3,?4,?5,?6,NULL,?7 WHERE
    (SELECT COALESCE(SUM(extra_devices),0) FROM device_capacity_grants
     WHERE user_id=?2 AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>?7)) + ?3 <=100`)
    .bind(id,target.id,quantity,reason,auth.user!.id,until,at).run();
  if(!outcome.meta.changes)return fail('extra_device_capacity_exceeds_100',409);
  await writeAudit(env,{userId:auth.user!.id,eventType:'account.device_capacity_granted',
    grantId:id,outcome:'extra_devices:'+quantity});
  return Response.json({grant:{id,user_id:target.id,email:target.email,extra_devices:quantity,
    reason,expires_at:until,created_at:at},active_extra:await activeDeviceCapacityBonus(env.DB,target.id)},{status:201});
}
export async function handleAdminDeviceCapacityRevoke(request:Request,env:CapacityEnv,id:string):Promise<Response>{
  const auth=await authorize(request,env);
  if(auth.response)return auth.response;
  if(request.method!=='POST')return fail('method_not_allowed',405);
  const at=nowIso();
  const result=await env.DB.prepare(`UPDATE device_capacity_grants SET revoked_at=?1
    WHERE id=?2 AND revoked_at IS NULL`).bind(at,id).run();
  if(!result.meta.changes)return fail('grant_not_found_or_revoked',404);
  await writeAudit(env,{userId:auth.user!.id,eventType:'account.device_capacity_revoked',grantId:id});
  return Response.json({ok:true,id,revoked_at:at});
}
