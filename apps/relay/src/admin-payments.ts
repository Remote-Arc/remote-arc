import {z} from 'zod';
import {getSessionUser} from './auth.js';
import {activeCommercial,commercialCatalog,commercialMode,saveCommercialDraft,publishCommercialDraft,type CommercialEnv} from './arc-commercial-config.js';
import {savePromotionDraft,publishPromotion,disablePromotion} from './arc-promotions.js';
import {StripeError,stripeConfigured} from './stripe-client.js';
import {fundingOverview,updateFunding} from './arc-funding.js';
import {listAdminTrials} from './arc-trial-admin.js';

export type AdminPaymentsEnv=CommercialEnv&{PUBLIC_ORIGIN:string;ADMIN_ORIGIN?:string};
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'cache-control':'private, no-store'}});
async function body(request:Request){
 const reader=request.body?.getReader();if(!reader)throw new StripeError('invalid_request',400);
 let length=0;const chunks:Uint8Array[]=[];
 try{for(;;){const chunk=await reader.read();if(chunk.done)break;length+=chunk.value.length;if(length>16384){await reader.cancel();throw new StripeError('request_too_large',413);}chunks.push(chunk.value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw new StripeError('invalid_request',400);}
}
export async function paymentOverview(env:AdminPaymentsEnv){
 const mode=commercialMode(env),at=new Date().toISOString(),from=at.slice(0,7)+'-01T00:00:00.000Z';
 const [revenue,recurring,receipts,issues,events,cost]=await Promise.all([
  env.DB.prepare(`SELECT r.state,COUNT(*) receipts,COALESCE(SUM(r.amount_cents),0) cents FROM arc_payment_receipts r LEFT JOIN arc_commercial_versions v ON v.id=r.commercial_version_id WHERE COALESCE(v.mode,'live')=?1 AND r.verified_at>=?2 GROUP BY r.state`).bind(mode,from).all(),
  env.DB.prepare(`SELECT COUNT(DISTINCT s.user_id) customers,COALESCE(SUM(json_extract(v.config_json,'$.monthlyPriceCents')),0) cents FROM arc_billing_subscriptions s JOIN arc_commercial_versions v ON v.id=COALESCE(s.commercial_version_id,'seed:live:'||s.product_id) WHERE v.mode=?1 AND s.status='active' AND s.cancel_at_period_end=0 AND s.period_end>?2`).bind(mode,at).first(),
  env.DB.prepare(`SELECT r.id,r.product_id,r.state,r.amount_cents,r.discount_cents,r.verified_at,r.commercial_version_id,u.email FROM arc_payment_receipts r JOIN users u ON u.id=r.user_id LEFT JOIN arc_commercial_versions v ON v.id=r.commercial_version_id WHERE COALESCE(v.mode,'live')=?1 ORDER BY r.verified_at DESC LIMIT 50`).bind(mode).all(),
  env.DB.prepare("SELECT i.*,u.email FROM arc_payment_issues i JOIN users u ON u.id=i.user_id WHERE i.status='open' ORDER BY i.updated_at DESC LIMIT 50").all(),
  env.DB.prepare("SELECT id,status,error_code,created_at FROM arc_payment_events WHERE status!='processed' ORDER BY created_at DESC LIMIT 50").all(),
  env.DB.prepare(`SELECT COALESCE(SUM(json_extract(settlement_json,'$.actual.costMicros')),0) micros FROM billing_reservations WHERE lane='arc_hosted' AND status IN ('completed','failed') AND created_at>=?1`).bind(from).first(),
 ]);
 return{mode,configured:stripeConfigured(env),month:at.slice(0,7),revenue:revenue.results,recurring,modelCost:cost,receipts:receipts.results,issues:issues.results,events:events.results};
}
export async function handleAdminPayments(request:Request,env:AdminPaymentsEnv){
 const origin=new URL(env.ADMIN_ORIGIN||'https://admin.remotearc.app').origin;
 if(new URL(request.url).origin!==origin)return json({error:'admin_host_required'},404);
 const user=await getSessionUser(request,env);if(!user?.isAdmin)return json({error:user?'forbidden':'unauthorized'},user?403:401);
 if(request.method!=='GET'&&(request.headers.get('origin')!==origin||request.headers.get('content-type')?.split(';')[0]!=='application/json'))return json({error:'invalid_origin_or_type'},403);
 try{
  const path=new URL(request.url).pathname;
  if(request.method==='GET'&&path==='/api/admin/payments/trials')return json(await listAdminTrials(env.DB,new URL(request.url)));
  if(request.method==='GET'&&path==='/api/admin/payments'){
   const mode=commercialMode(env),[overview,catalog,versions,audit,promotions]=await Promise.all([
    paymentOverview(env),commercialCatalog(env),env.DB.prepare('SELECT * FROM arc_commercial_versions WHERE mode=?1 ORDER BY created_at DESC LIMIT 100').bind(mode).all(),
    env.DB.prepare('SELECT a.*,u.email actor_email FROM arc_commercial_audit a LEFT JOIN users u ON u.id=a.actor_id WHERE a.mode=?1 ORDER BY a.created_at DESC LIMIT 50').bind(mode).all(),
    env.DB.prepare(`SELECT p.*,u.email target_email,(SELECT COUNT(*) FROM arc_promotion_redemptions r WHERE r.promotion_id=p.id) redemptions,(SELECT status FROM arc_promotion_assignments a WHERE a.promotion_id=p.id AND a.user_id=p.target_user_id) assignment_status FROM arc_billing_promotions p LEFT JOIN users u ON u.id=p.target_user_id WHERE p.mode=?1 ORDER BY p.created_at DESC LIMIT 100`).bind(mode).all(),
   ]);
   const trial=await activeCommercial(env,'arc-trial-v1');
   return json({...overview,funding:await fundingOverview(env.DB),catalog:{...catalog,trial:{...catalog.trial,versionId:trial.id,revision:trial.revision}},versions:versions.results,audit:audit.results,promotions:promotions.results});
  }
  if(request.method!=='POST')return json({error:'method_not_allowed'},405);
  if(path==='/api/admin/payments/funding')return json(await updateFunding(env.DB,user.id,await body(request)));
  if(path==='/api/admin/payments/config/drafts'){
   const input=z.object({id:z.uuid(),kind:z.enum(['plan','topup','trial']),revision:z.number().int().positive(),config:z.unknown()}).strict().parse(await body(request));
   return json(await saveCommercialDraft(env,user.id,input));
  }
  if(path==='/api/admin/payments/promotions/drafts')return json(await savePromotionDraft(env,user.id,await body(request)));
  const action=path.match(/^\/api\/admin\/payments\/(config|promotions)\/([a-f0-9-]{36})\/(publish|disable)$/);
  if(!action)return json({error:'not_found'},404);
  z.object({}).strict().parse(await body(request));const id=z.uuid().parse(action[2]);
  if(action[1]==='config'&&action[3]==='publish')return json(await publishCommercialDraft(env,user.id,id));
  if(action[1]==='promotions')return json(await(action[3]==='publish'?publishPromotion(env,user.id,id):disablePromotion(env,user.id,id)));
  return json({error:'not_found'},404);
 }catch(e){return json({error:e instanceof StripeError?e.code:e instanceof z.ZodError?'invalid_configuration':'payments_unavailable'},e instanceof StripeError?e.status:e instanceof z.ZodError?400:503);}
}
