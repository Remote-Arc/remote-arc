import {z} from 'zod';
import {sha256Hex} from '../auth/auth.js';
import {FOLLOWUP_TEMPLATES,personalizeFollowupText} from '../../../../packages/protocol/src/followup-templates.js';
import {renderFollowupEmail} from '../../../../packages/protocol/src/followup-email.js';
import {feedbackRewardAvailable} from '../billing/connect-rewards.js';
import {followupEmailSender} from '../platform/email-sender.js';
import {ensureContact,followupLinks,designSchema,stamp,type FollowupEnv} from './followup-common.js';
import {dispatchFollowup} from './followup-delivery.js';
import {followupEmailBudget} from './followup-budget.js';

const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'cache-control':'private, no-store'}});
export const FOLLOWUP_BATCH_LIMIT=100;
const userIds=z.array(z.string().min(1).max(160)).min(1).max(FOLLOWUP_BATCH_LIMIT).refine(ids=>new Set(ids).size===ids.length);
const optionalBasis=z.preprocess(value=>value==null||typeof value==='string'&&!value.trim()?'existing':value,z.enum(['existing','support','agreed']));
const batchSchema=z.object({id:z.uuid(),title:z.string().trim().min(1).max(120),userIds,templateId:z.enum(FOLLOWUP_TEMPLATES.map(t=>t.id)),locale:z.enum(['en','zh']),subject:z.string().trim().min(1).max(200).refine(s=>!/[\r\n]/.test(s)),body:z.string().trim().min(20).max(6000),design:designSchema,basis:optionalBasis,basisNote:z.string().trim().max(500).default('')}).strict();
type Batch={id:string;actor_id:string;status:string;basis:string;basis_note:string;from_email:string;reply_to:string;payload_json:string};

export async function followupBlock(env:FollowupEnv,userId:string){
 const contact=await ensureContact(env,userId);if(!contact)return 'user_not_found';
 if(contact.suppressed_at)return 'recipient_suppressed';
 const conflict=await env.DB.prepare(`SELECT status,sent_at FROM user_followup_messages WHERE user_id=?1 AND (status IN ('sending','unknown') OR sent_at>?2) LIMIT 1`).bind(userId,new Date(Date.now()-72*3600000).toISOString()).first<{status:string}>();
 return conflict?['sending','unknown'].includes(conflict.status)?'delivery_unconfirmed':'contact_cooldown':null;
}
const summarySql=`SELECT b.id,b.title,b.template_id,b.locale,b.status,b.created_at,b.queued_at,b.finished_at,b.actor_id,
 COUNT(r.user_id) total,COALESCE(SUM(r.status='pending'),0) pending,COALESCE(SUM(r.status='processing'),0) processing,COALESCE(SUM(r.status='sent'),0) sent,
 COALESCE(SUM(r.status='failed'),0) failed,COALESCE(SUM(r.status='unknown'),0) unknown,COALESCE(SUM(r.status='skipped'),0) skipped,COALESCE(SUM(r.status='cancelled'),0) cancelled
 FROM user_followup_batches b LEFT JOIN user_followup_batch_recipients r ON r.batch_id=b.id`;
async function batchDetail(env:FollowupEnv,id:string,previewUser?:string|null){
 const batch=await env.DB.prepare(summarySql+' WHERE b.id=?1 GROUP BY b.id').bind(id).first();if(!batch)return null;
 const recipients=await env.DB.prepare(`SELECT r.user_id,r.message_id,r.status,r.error_code,r.attempts,u.name,u.email,m.subject,m.body,m.sent_at
 FROM user_followup_batch_recipients r JOIN users u ON u.id=r.user_id LEFT JOIN user_followup_messages m ON m.id=r.message_id WHERE r.batch_id=?1 ORDER BY u.email`).bind(id).all();
 const preview=await env.DB.prepare(`SELECT m.user_id,m.subject,m.html_body FROM user_followup_messages m JOIN user_followup_batch_recipients r ON r.message_id=m.id WHERE r.batch_id=?1 AND (?2 IS NULL OR m.user_id=?2) ORDER BY r.status='pending' DESC,m.created_at LIMIT 1`).bind(id,previewUser||null).first();
 const config=await env.DB.prepare('SELECT from_email,reply_to,basis,basis_note FROM user_followup_batches WHERE id=?1').bind(id).first();
 return {batch,recipients:recipients.results,preview,sender:config?{from:config.from_email,replyTo:config.reply_to}:null,basis:config?.basis,basisNote:config?.basis_note,emailConfigured:Boolean(followupEmailSender(env)),emailBudget:await followupEmailBudget(env)};
}

/** Called only after the shared admin session, host and CSRF checks. */
export async function handleFollowupBatches(request:Request,env:FollowupEnv,actorId:string,read:()=>Promise<unknown>){
 const url=new URL(request.url),path=url.pathname.slice('/api/admin/followups'.length);
 if(path==='/bulk-status'&&request.method==='PATCH'){
  const value=z.object({userIds,status:z.enum(['new','contacted','waiting','resolved']),nextFollowupAt:z.iso.datetime({offset:true}).nullable().optional()}).strict().parse(await read());
  for(const id of value.userIds){if(!await ensureContact(env,id))return json({error:'user_not_found'},404);}
  const statements=value.userIds.map(id=>env.DB.prepare(`UPDATE user_followup_contacts SET status=?2,next_followup_at=CASE WHEN ?3 THEN ?4 ELSE next_followup_at END,updated_at=?5 WHERE user_id=?1 AND suppressed_at IS NULL`).bind(id,value.status,Number(value.nextFollowupAt!==undefined),value.nextFollowupAt||null,stamp()));
  await env.DB.batch(statements);return json({ok:true});
 }
 if(path==='/batches'&&request.method==='GET')return json({items:(await env.DB.prepare(summarySql+' GROUP BY b.id ORDER BY b.created_at DESC LIMIT 50').all()).results,limit:FOLLOWUP_BATCH_LIMIT});
 if(path==='/batches'&&request.method==='POST'){
  const value=batchSchema.parse(await read()),payload=JSON.stringify({...value,userIds:[...value.userIds].sort()}),sender=followupEmailSender(env);
  if(!sender)return json({error:'email_not_configured'},503);
  const existing=await env.DB.prepare('SELECT * FROM user_followup_batches WHERE id=?1').bind(value.id).first<Batch>();
  if(existing&&(existing.actor_id!==actorId||existing.payload_json!==payload))return json({error:'batch_conflict'},409);
  if(existing&&existing.status!=='preparing')return json(await batchDetail(env,value.id));
  const contacts=[];
  for(const id of value.userIds){const contact=await ensureContact(env,id);if(!contact)return json({error:'user_not_found'},404);contacts.push(contact);}
  await env.DB.prepare(`INSERT OR IGNORE INTO user_followup_batches(id,actor_id,title,template_id,locale,subject,body,design_json,basis,basis_note,from_email,reply_to,payload_json,status,created_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,'preparing',?14)`).bind(value.id,actorId,value.title,value.templateId,value.locale,value.subject,value.body,JSON.stringify(value.design),value.basis,value.basisNote,sender.from,sender.replyTo,payload,stamp()).run();
  const rewardAvailable=await feedbackRewardAvailable(env.DB);
  for(const contact of contacts){
   if(await env.DB.prepare('SELECT user_id FROM user_followup_batch_recipients WHERE batch_id=?1 AND user_id=?2').bind(value.id,contact.user_id).first())continue;
   const block=await followupBlock(env,contact.user_id),hash=await sha256Hex(value.id+':'+contact.user_id);
   const id=hash.slice(0,8)+'-'+hash.slice(8,12)+'-8'+hash.slice(13,16)+'-a'+hash.slice(17,20)+'-'+hash.slice(20,32);
   if(block){await env.DB.prepare(`INSERT OR IGNORE INTO user_followup_batch_recipients(batch_id,user_id,status,error_code,updated_at) SELECT ?1,?2,'skipped',?3,?4 WHERE EXISTS(SELECT 1 FROM user_followup_batches WHERE id=?1 AND status='preparing')`).bind(value.id,contact.user_id,block,stamp()).run();continue;}
   const links=followupLinks(env,id,value.locale),values={name:contact.name?.slice(0,160)||(value.locale==='zh'?'朋友':'there'),...links};
   const subject=personalizeFollowupText(value.subject,value.locale,values).replace(/[\r\n]/g,' ').slice(0,200),body=personalizeFollowupText(value.body,value.locale,values);
   const unsubscribeUrl=new URL(env.MARKETING_ORIGIN||'https://remotearc.app').origin+'/email/follow-up/unsubscribe?token='+contact.unsubscribe_token;
   const rendered=renderFollowupEmail({subject,body,templateId:value.templateId,locale:value.locale,design:value.design,...links,unsubscribeUrl,replyTo:sender.replyTo,rewardAvailable});
   // Recipient and personalized content become one atomic, immutable snapshot.
   await env.DB.batch([
    env.DB.prepare(`INSERT OR IGNORE INTO user_followup_messages(id,user_id,actor_id,template_id,locale,subject,body,status,created_at,recipient_email,design_json,html_body,text_body,batch_id) SELECT ?1,?2,?3,?4,?5,?6,?7,'draft',?8,?9,?10,?11,?12,?13 WHERE EXISTS(SELECT 1 FROM user_followup_batches WHERE id=?13 AND status='preparing')`).bind(id,contact.user_id,actorId,value.templateId,value.locale,subject,body,stamp(),contact.email,JSON.stringify(value.design),rendered.html,rendered.text,value.id),
    env.DB.prepare(`INSERT OR IGNORE INTO user_followup_batch_recipients(batch_id,user_id,message_id,status,updated_at) SELECT ?1,?2,?3,'pending',?4 WHERE EXISTS(SELECT 1 FROM user_followup_batches WHERE id=?1 AND status='preparing')`).bind(value.id,contact.user_id,id,stamp())
   ]);
  }
  await env.DB.prepare(`UPDATE user_followup_batches SET status='draft' WHERE id=?1 AND status='preparing' AND (SELECT COUNT(*) FROM user_followup_batch_recipients WHERE batch_id=?1)=?2`).bind(value.id,value.userIds.length).run();
  return json(await batchDetail(env,value.id),201);
 }
 const match=path.match(/^\/batches\/([a-f0-9-]{36})(?:\/(queue|cancel))?$/);if(!match)return json({error:'not_found'},404);
 const id=match[1]!,batch=await env.DB.prepare('SELECT * FROM user_followup_batches WHERE id=?1').bind(id).first<Batch>();if(!batch)return json({error:'batch_not_found'},404);
 if(!match[2]&&request.method==='GET')return json(await batchDetail(env,id,url.searchParams.get('previewUser')));
 if(match[2]==='queue'&&request.method==='POST'){
  if(['queued','completed'].includes(batch.status))return json(await batchDetail(env,id));
  if(batch.status!=='draft')return json({error:'batch_not_ready'},409);
  const sender=followupEmailSender(env);if(!sender)return json({error:'email_not_configured'},503);
  if(sender.from!==batch.from_email||sender.replyTo!==batch.reply_to)return json({error:'sender_changed'},409);
  if(!await env.DB.prepare(`SELECT user_id FROM user_followup_batch_recipients WHERE batch_id=?1 AND status='pending' LIMIT 1`).bind(id).first())return json({error:'no_eligible_recipients'},409);
  const basis=batch.basis==='support'?'User requested installation or product support':'User agreed to this product follow-up';
  const reason=basis+(batch.basis_note?': '+batch.basis_note:'');
  await env.DB.batch([
   env.DB.prepare(`UPDATE user_followup_contacts SET consent_at=COALESCE(consent_at,?2),consent_note=CASE WHEN consent_at IS NULL THEN ?3 ELSE consent_note END,updated_at=?2 WHERE ?4<>'existing' AND suppressed_at IS NULL AND user_id IN (SELECT user_id FROM user_followup_batch_recipients WHERE batch_id=?1 AND status='pending') AND EXISTS(SELECT 1 FROM user_followup_batches WHERE id=?1 AND status='draft')`).bind(id,stamp(),reason,batch.basis),
   env.DB.prepare(`UPDATE user_followup_batches SET status='queued',queued_at=?2,actor_id=?3 WHERE id=?1 AND status='draft'`).bind(id,stamp(),actorId)
  ]);
  return json(await batchDetail(env,id),202);
 }
 if(match[2]==='cancel'&&request.method==='POST'){
  await env.DB.batch([
   env.DB.prepare(`UPDATE user_followup_batches SET status='cancelled',finished_at=?2 WHERE id=?1 AND status IN ('preparing','draft','queued')`).bind(id,stamp()),
   env.DB.prepare(`UPDATE user_followup_batch_recipients SET status='cancelled',error_code='batch_cancelled',updated_at=?2 WHERE batch_id=?1 AND status='pending' AND EXISTS(SELECT 1 FROM user_followup_batches WHERE id=?1 AND status='cancelled')`).bind(id,stamp())
  ]);return json(await batchDetail(env,id));
 }
 return json({error:'method_not_allowed'},405);
}

/** A durable D1 queue drained by the minute cron, also warmed after explicit queueing. */
export async function runFollowupBatches(env:FollowupEnv,options:{pause?:(ms:number)=>Promise<void>;budgetMs?:number}={}){
 const sender=followupEmailSender(env);if(!sender)return;
 const token=crypto.randomUUID(),now=stamp(),deadline=Date.now()+(options.budgetMs??24000),pause=options.pause??(ms=>new Promise(resolve=>setTimeout(resolve,ms)));
 const lease=await env.DB.prepare(`UPDATE user_followup_dispatch_lease SET token=?1,expires_at=?2 WHERE id=1 AND expires_at<=?3 RETURNING id`).bind(token,new Date(Date.now()+120000).toISOString(),now).first();if(!lease)return;
 try{
  // A previous invocation may have stopped after the provider accepted a send.
  // Preserve that uncertainty rather than sending the same message again.
  await env.DB.prepare(`UPDATE user_followup_messages SET status='unknown',error_code='delivery_unconfirmed' WHERE status='sending' AND id IN (SELECT message_id FROM user_followup_batch_recipients WHERE status='processing')`).run();
  await env.DB.prepare(`UPDATE user_followup_batch_recipients SET status=CASE (SELECT status FROM user_followup_messages WHERE id=message_id) WHEN 'draft' THEN CASE WHEN EXISTS(SELECT 1 FROM user_followup_batches WHERE id=batch_id AND status='cancelled') THEN 'cancelled' ELSE 'pending' END WHEN 'sent' THEN 'sent' WHEN 'failed' THEN 'failed' ELSE 'unknown' END,error_code=CASE WHEN (SELECT status FROM user_followup_messages WHERE id=message_id) IN ('unknown','sending') THEN 'delivery_unconfirmed' ELSE error_code END,updated_at=?1 WHERE status='processing'`).bind(stamp()).run();
  for(let count=0;count<20&&Date.now()<deadline-5000;count++){
   // Over the daily cap, recipients stay pending and a later run continues.
   if((await followupEmailBudget(env)).remaining<=0)break;
   const item=await env.DB.prepare(`SELECT r.*,b.actor_id,b.from_email,b.reply_to FROM user_followup_batch_recipients r JOIN user_followup_batches b ON b.id=r.batch_id WHERE b.status='queued' AND r.status='pending' AND (r.next_attempt_at IS NULL OR r.next_attempt_at<=?1) ORDER BY b.queued_at,r.user_id LIMIT 1`).bind(stamp()).first<{batch_id:string;user_id:string;message_id:string;actor_id:string;from_email:string;reply_to:string;attempts:number}>();if(!item)break;
   const claimed=await env.DB.prepare(`UPDATE user_followup_batch_recipients SET status='processing',attempts=attempts+1,updated_at=?3 WHERE batch_id=?1 AND user_id=?2 AND status='pending' AND EXISTS(SELECT 1 FROM user_followup_batches WHERE id=?1 AND status='queued') RETURNING user_id`).bind(item.batch_id,item.user_id,stamp()).first();if(!claimed)continue;
   const actor=await env.DB.prepare('SELECT role FROM users WHERE id=?1').bind(item.actor_id).first<{role:string}>();
   let status='skipped',error:string|null=null;
   if(actor?.role!=='admin')error='actor_no_longer_admin';
   else if(sender.from!==item.from_email||sender.replyTo!==item.reply_to)error='sender_changed';
   else{
    const result=await dispatchFollowup(env,item.message_id,1,item.batch_id,Math.min(15000,Math.max(1000,deadline-Date.now()-1000)));
    const value=await result.json() as {status?:string;error?:string;errorCode?:string};
    status=value.status==='sent'?'sent':value.status==='unknown'||value.status==='sending'?'unknown':value.status==='failed'?'failed':'skipped';error=value.errorCode||value.error||null;
    if(error==='daily_email_budget_reached')status='pending';
    else if(error==='provider_429'&&item.attempts<4){
     await env.DB.prepare(`UPDATE user_followup_messages SET status='draft',error_code=NULL WHERE id=?1 AND status='failed'`).bind(item.message_id).run();status='pending';
    }
   }
   await env.DB.prepare(`UPDATE user_followup_batch_recipients SET status=?3,error_code=?4,next_attempt_at=?5,updated_at=?6 WHERE batch_id=?1 AND user_id=?2 AND status='processing'`).bind(item.batch_id,item.user_id,status,error,status==='pending'?new Date(Date.now()+60000*2**item.attempts).toISOString():null,stamp()).run();
   await pause(1000);
  }
  await env.DB.prepare(`UPDATE user_followup_batches SET status='completed',finished_at=?1 WHERE status='queued' AND NOT EXISTS(SELECT 1 FROM user_followup_batch_recipients WHERE batch_id=user_followup_batches.id AND status IN ('pending','processing'))`).bind(stamp()).run();
 }finally{await env.DB.prepare(`UPDATE user_followup_dispatch_lease SET token=NULL,expires_at=?2 WHERE id=1 AND token=?1`).bind(token,stamp()).run();}
}
