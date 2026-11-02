import {APP_CATALOG,type AppEnv} from './app-catalog.js';
import {GOOGLE_APP_DATA_POLICY} from './google-app-policy.js';

const googleProviders=Object.entries(APP_CATALOG).filter(([,value])=>value.credential==='GOOGLE').map(([provider])=>provider);
const providerParameters=googleProviders.map((_,index)=>'?'+(index+3)).join(',');
export const googleAppContentCutoff=(at:string)=>new Date(Date.parse(at)-GOOGLE_APP_DATA_POLICY.retentionDays*86400000).toISOString();
const purgeContent=`arguments_ciphertext='',result_ciphertext=NULL,review_ciphertext=NULL,content_purged_at=?1,
 status=CASE WHEN status IN ('pending_approval','approved') THEN 'cancelled' WHEN status='running' AND permission='write' THEN 'unknown' WHEN status='running' THEN 'failed' ELSE status END`;

/** Payloads expire; idempotency, outcome and accounting records survive. */
export async function purgeExpiredGoogleAppContent(env:Pick<AppEnv,'DB'>,at=new Date().toISOString()){
  const result=await env.DB.prepare(`UPDATE app_calls SET ${purgeContent} WHERE id IN (
    SELECT a.id FROM app_calls a JOIN app_connections c ON c.id=a.connection_id AND c.user_id=a.user_id
    WHERE a.content_purged_at IS NULL AND a.created_at<=?2 AND c.provider IN (${providerParameters})
    ORDER BY a.created_at,a.id LIMIT 100)`).bind(at,googleAppContentCutoff(at),...googleProviders).run();
  return {purged:Number(result.meta.changes)};
}

export async function eraseGoogleAppContent(env:Pick<AppEnv,'DB'>,userId:string,connectionId:string,at=new Date().toISOString()){
  // The route checks ownership and requires explicit confirmation. Generation
  // fencing stops work that has not dispatched; running writes remain uncertain.
  const result=await env.DB.batch([
    env.DB.prepare("UPDATE app_connections SET generation=generation+1,refresh_lease=NULL,refresh_lease_until=NULL,updated_at=?1 WHERE id=?2 AND user_id=?3").bind(at,connectionId,userId),
    env.DB.prepare(`UPDATE app_calls SET ${purgeContent} WHERE connection_id=?2 AND user_id=?3 AND content_purged_at IS NULL`).bind(at,connectionId,userId),
  ]);
  return {deleted:Number(result[1]?.meta.changes||0)};
}

export async function expireGoogleAppCall(env:Pick<AppEnv,'DB'>,userId:string,id:string,at=new Date().toISOString()){
  return (await env.DB.prepare(`UPDATE app_calls SET ${purgeContent} WHERE id=?2 AND user_id=?3 AND content_purged_at IS NULL RETURNING status`).bind(at,id,userId).first<{status:string}>())?.status;
}
