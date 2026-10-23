import {z} from 'zod';
import {getSessionUser} from './auth.js';
import {FOLLOWUP_TEMPLATES} from '../../../packages/protocol/src/followup-templates.js';
import {escapeAuthHtml} from './auth-page.js';
import {renderFollowupEmail} from '../../../packages/protocol/src/followup-email.js';
import {feedbackRewardAvailable} from './connect-rewards.js';
import {followupEmailSender,followupReplyTo,type FollowupSenderEnv} from './email-sender.js';

export type FollowupEnv=FollowupSenderEnv&{DB:D1Database;PUBLIC_ORIGIN:string;APP_ORIGIN?:string;MARKETING_ORIGIN?:string};
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'cache-control':'private, no-store'}});
const designSchema=z.object({layout:z.enum(['letter','spotlight','digest']),accent:z.string().regex(/^#[\da-f]{6}$/i),eyebrow:z.string().max(100),headline:z.string().max(200),intro:z.string().max(500),buttonLabel:z.string().max(80),highlights:z.array(z.object({title:z.string().max(100),body:z.string().max(600)}).strict()).max(3)}).strict();
const stamp=()=>new Date().toISOString();
type Contact={user_id:string;email:string;name:string|null;consent_at:string|null;suppressed_at:string|null;unsubscribe_token:string};
type Message={id:string;user_id:string;subject:string;body:string;template_id:string;locale:'en'|'zh';recipient_email:string;status:string;created_at:string;provider_id:string|null;design_json:string|null;html_body:string|null;text_body:string|null;draft_revision:number};
async function ensureContact(env:FollowupEnv,userId:string){
 await env.DB.prepare(`INSERT OR IGNORE INTO user_followup_contacts(user_id,unsubscribe_token,updated_at) SELECT id,?2,?3 FROM users WHERE id=?1`).bind(userId,crypto.randomUUID(),stamp()).run();
 return env.DB.prepare('SELECT c.*,u.email,u.name FROM user_followup_contacts c JOIN users u ON u.id=c.user_id WHERE c.user_id=?1').bind(userId).first<Contact>();
}
async function input(request:Request){
 if(Number(request.headers.get('content-length')||0)>24000)throw Error('request_too_large');
 const reader=request.body?.getReader();if(!reader)throw Error('invalid_request');let length=0;const chunks:Uint8Array[]=[];
 try{for(;;){const part=await reader.read();if(part.done)break;length+=part.value.length;if(length>24000){await reader.cancel();throw Error('request_too_large');}chunks.push(part.value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 return JSON.parse(new TextDecoder().decode(bytes));
}
export function followupLinks(env:FollowupEnv,id:string,locale:string){
 const site=new URL(env.MARKETING_ORIGIN||'https://remotearc.app').origin,prefix=locale==='zh'?'/zh':'';
 return {feedbackUrl:site+prefix+'/feedback?source='+encodeURIComponent('followup:'+id),setupUrl:site+prefix+'/connect-ai'};
}
export async function handleUserFollowups(request:Request,env:FollowupEnv){
 const user=await getSessionUser(request,env);if(!user)return json({error:'unauthorized'},401);if(!user.isAdmin)return json({error:'forbidden'},403);
 if(request.method!=='GET'&&(request.headers.get('origin')!==new URL(request.url).origin||request.headers.get('content-type')?.split(';')[0]!=='application/json'))return json({error:'invalid_origin_or_type'},403);
 const url=new URL(request.url),path=url.pathname;
 try{
  if(path==='/api/admin/followups'&&request.method==='GET'){
   const segment=url.searchParams.get('segment')||'all',query=(url.searchParams.get('query')||'').slice(0,100),page=Math.min(500,Math.max(0,Number(url.searchParams.get('page')||0)|0));
   if(!['all','unconnected','device-only','unused','active','due','suppressed'].includes(segment))return json({error:'invalid_segment'},400);
   const where=`(email LIKE ?1 OR COALESCE(name,'') LIKE ?1) AND (?2='all' OR (?2='unconnected' AND devices=0 AND apps=0) OR (?2='device-only' AND devices>0 AND mcp_connections=0 AND suppressed_at IS NULL) OR (?2='unused' AND calls=0 AND arc_runs=0) OR (?2='active' AND (calls>0 OR arc_runs>0)) OR (?2='due' AND next_followup_at<=?3 AND suppressed_at IS NULL) OR (?2='suppressed' AND suppressed_at IS NOT NULL))`;
   const cte=`WITH people AS (SELECT u.id,u.email,u.name,u.created_at,c.status,c.note,c.next_followup_at,c.consent_at,c.consent_note,c.suppressed_at,
    (SELECT COUNT(*) FROM devices d WHERE d.user_id=u.id AND d.revoked_at IS NULL) devices,
    (SELECT COUNT(*) FROM app_connections a WHERE a.user_id=u.id AND a.status='active') apps,
    (SELECT COUNT(DISTINCT COALESCE(t.grant_id,t.access_token_hash)) FROM oauth_tokens t WHERE t.user_id=u.id AND t.revoked_at IS NULL AND (t.expires_at>?3 OR t.refresh_expires_at>?3)) mcp_connections,
    COALESCE((SELECT SUM(tool_calls) FROM user_monthly_usage m WHERE m.user_id=u.id),0) calls,
    (SELECT COUNT(*) FROM arc_chat_runs r WHERE r.user_id=u.id) arc_runs,
    (SELECT MAX(sent_at) FROM user_followup_messages m WHERE m.user_id=u.id AND m.status='sent') last_contact_at,
    (SELECT COUNT(*) FROM website_submissions s WHERE lower(s.email)=lower(u.email) AND s.source IN (SELECT 'followup:'||id FROM user_followup_messages m WHERE m.user_id=u.id)) feedback_count
    FROM users u LEFT JOIN user_followup_contacts c ON c.user_id=u.id)`;
   const args=['%'+query+'%',segment,stamp()];
   const [rows,total]=await Promise.all([env.DB.prepare(cte+` SELECT * FROM people WHERE ${where} ORDER BY CASE WHEN next_followup_at<=?3 THEN 0 ELSE 1 END,created_at DESC LIMIT 30 OFFSET ?4`).bind(...args,page*30).all(),env.DB.prepare(cte+` SELECT COUNT(*) count FROM people WHERE ${where}`).bind(...args).first<{count:number}>()]);
   return json({items:rows.results,total:total?.count||0,page,pageSize:30,emailConfigured:Boolean(followupEmailSender(env)),templates:FOLLOWUP_TEMPLATES});
  }
  if(path==='/api/admin/followups/drafts'&&request.method==='POST'){
   const value=z.object({id:z.uuid(),userId:z.string().min(1).max(160),templateId:z.enum(FOLLOWUP_TEMPLATES.map(t=>t.id)),locale:z.enum(['en','zh']),subject:z.string().trim().min(1).max(200).refine(s=>!/[\r\n]/.test(s)),body:z.string().trim().min(20).max(6000),design:designSchema.optional(),expectedRevision:z.number().int().positive().optional()}).strict().parse(await input(request));
   const contact=await ensureContact(env,value.userId);if(!contact)return json({error:'user_not_found'},404);
   const existing=await env.DB.prepare('SELECT * FROM user_followup_messages WHERE id=?1').bind(value.id).first<Message>();
   if(existing){
    if(existing.user_id!==value.userId)return json({error:'draft_conflict'},409);
    const same=existing.subject===value.subject&&existing.body===value.body&&existing.template_id===value.templateId&&existing.locale===value.locale&&(existing.design_json||null)===(value.design?JSON.stringify(value.design):null);
    if(same)return json({id:existing.id,status:existing.status,htmlBody:existing.html_body,revision:existing.draft_revision,...followupLinks(env,existing.id,value.locale)});
    if(existing.status!=='draft')return json({error:'draft_not_editable'},409);
    if(value.expectedRevision!==existing.draft_revision)return json({error:'draft_conflict'},409);
   }
   const unsubscribeUrl=new URL(env.MARKETING_ORIGIN||'https://remotearc.app').origin+'/email/follow-up/unsubscribe?token='+contact.unsubscribe_token;
   const rendered=renderFollowupEmail({...value,...followupLinks(env,value.id,value.locale),unsubscribeUrl,replyTo:followupReplyTo(env),rewardAvailable:await feedbackRewardAvailable(env.DB)});
   if(existing){
    const updated=await env.DB.prepare(`UPDATE user_followup_messages SET template_id=?2,locale=?3,subject=?4,body=?5,design_json=?6,html_body=?7,text_body=?8,draft_revision=draft_revision+1 WHERE id=?1 AND status='draft' AND draft_revision=?9 RETURNING draft_revision`).bind(value.id,value.templateId,value.locale,value.subject,value.body,value.design?JSON.stringify(value.design):null,rendered.html,rendered.text,value.expectedRevision!).first<{draft_revision:number}>();
    if(!updated)return json({error:'draft_conflict'},409);
    return json({id:value.id,status:'draft',htmlBody:rendered.html,revision:updated.draft_revision,...followupLinks(env,value.id,value.locale)});
   }
   await env.DB.prepare(`INSERT INTO user_followup_messages(id,user_id,actor_id,template_id,locale,subject,body,status,created_at,recipient_email,design_json,html_body,text_body) VALUES(?1,?2,?3,?4,?5,?6,?7,'draft',?8,?9,?10,?11,?12)`).bind(value.id,value.userId,user.id,value.templateId,value.locale,value.subject,value.body,stamp(),contact.email,value.design?JSON.stringify(value.design):null,rendered.html,rendered.text).run();
   return json({id:value.id,status:'draft',htmlBody:rendered.html,revision:1,...followupLinks(env,value.id,value.locale)},201);
  }
  const match=path.match(/^\/api\/admin\/followups\/([^/]+)(?:\/(send))?$/);if(!match)return json({error:'not_found'},404);
  const id=decodeURIComponent(match[1]!);if(id.length>160)return json({error:'invalid_id'},400);
  if(match[2]==='send'&&request.method==='POST'){
   const options=z.object({expectedRevision:z.number().int().positive().optional()}).strict().parse(await input(request));
   const message=await env.DB.prepare('SELECT * FROM user_followup_messages WHERE id=?1').bind(id).first<Message>();if(!message)return json({error:'draft_not_found'},404);
   if(message.status!=='draft')return json({id,status:message.status,providerId:message.provider_id});
   if(options.expectedRevision!==undefined&&options.expectedRevision!==message.draft_revision)return json({error:'draft_conflict'},409);
   const sender=followupEmailSender(env);if(!sender)return json({error:'email_not_configured'},503);
   const contact=await ensureContact(env,message.user_id);if(!contact||contact.suppressed_at)return json({error:'recipient_suppressed'},409);if(!contact.consent_at)return json({error:'contact_permission_required'},409);if(message.recipient_email!==contact.email)return json({error:'recipient_changed'},409);
   const unsubscribe=new URL(env.MARKETING_ORIGIN||'https://remotearc.app').origin+'/email/follow-up/unsubscribe?token='+contact.unsubscribe_token;
   const fallback=renderFollowupEmail({...message,templateId:message.template_id,...followupLinks(env,id,message.locale),unsubscribeUrl:unsubscribe,replyTo:followupReplyTo(env),rewardAvailable:await feedbackRewardAvailable(env.DB),...(message.design_json?{design:JSON.parse(message.design_json)}:{})});
   const {html,text}=message.html_body&&message.text_body?{html:message.html_body,text:message.text_body}:fallback;
   const cutoff=new Date(Date.now()-72*3600000).toISOString(),now=stamp();
   const claimed=await env.DB.prepare(`UPDATE user_followup_messages SET status='sending' WHERE id=?1 AND status='draft' AND draft_revision=?4 AND EXISTS(SELECT 1 FROM user_followup_contacts c WHERE c.user_id=?2 AND c.suppressed_at IS NULL AND c.consent_at IS NOT NULL) AND NOT EXISTS(SELECT 1 FROM user_followup_messages m WHERE m.user_id=?2 AND m.id<>?1 AND (m.status IN ('sending','unknown') OR m.sent_at>?3)) RETURNING id`).bind(id,message.user_id,cutoff,message.draft_revision).first();
   if(!claimed)return json({error:'contact_cooldown_or_in_progress'},409);
   let status='unknown',providerId:string|null=null,errorCode:string|null=null;
   try{
    const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{authorization:'Bearer '+sender.apiKey,'content-type':'application/json','Idempotency-Key':'followup/'+id},body:JSON.stringify({from:sender.from,to:[contact.email],reply_to:sender.replyTo,subject:message.subject,html,text,headers:{'List-Unsubscribe':'<'+unsubscribe+'>','List-Unsubscribe-Post':'List-Unsubscribe=One-Click'}}),signal:AbortSignal.timeout(20000)});
    const result=await response.json().catch(()=>null) as {id?:string}|null;
    if(response.ok&&result?.id){status='sent';providerId=result.id;}else{status=response.status>=500?'unknown':'failed';errorCode='provider_'+response.status;}
   }catch{errorCode='delivery_unconfirmed';}
   await env.DB.prepare('UPDATE user_followup_messages SET status=?2,provider_id=?3,sent_at=?4,error_code=?5 WHERE id=?1').bind(id,status,providerId,status==='sent'?now:null,errorCode).run();
   if(status==='sent')await env.DB.prepare(`UPDATE user_followup_contacts SET status='contacted',updated_at=?2 WHERE user_id=?1`).bind(message.user_id,now).run();
   return json({id,status,providerId,errorCode},status==='sent'?200:502);
  }
  if(request.method==='GET'){
   const [contact,messages]=await Promise.all([ensureContact(env,id),env.DB.prepare('SELECT id,template_id,locale,subject,body,status,provider_id,created_at,sent_at,error_code,design_json,html_body,draft_revision FROM user_followup_messages WHERE user_id=?1 ORDER BY created_at DESC LIMIT 50').bind(id).all()]);
   const sender=followupEmailSender(env);
   return contact?json({contact,messages:messages.results,emailConfigured:Boolean(sender),sender:sender?{from:sender.from,replyTo:sender.replyTo}:null,rewardAvailable:await feedbackRewardAvailable(env.DB)}):json({error:'user_not_found'},404);
  }
  if(request.method==='PATCH'){
   const value=z.object({status:z.enum(['new','contacted','waiting','resolved']),note:z.string().max(2000),nextFollowupAt:z.iso.datetime({offset:true}).nullable(),consentNote:z.string().trim().max(500),permission:z.boolean(),suppress:z.boolean()}).strict().parse(await input(request));
   if(value.permission&&value.consentNote.length<8)return json({error:'permission_note_required'},400);
   if(!await ensureContact(env,id))return json({error:'user_not_found'},404);
   // A recipient unsubscribe can never be undone from the admin interface.
   await env.DB.prepare(`UPDATE user_followup_contacts SET status=?2,note=?3,next_followup_at=?4,consent_at=CASE WHEN ?5 THEN COALESCE(consent_at,?8) ELSE NULL END,consent_note=?6,suppressed_at=CASE WHEN ?7 THEN COALESCE(suppressed_at,?8) ELSE suppressed_at END,updated_at=?8 WHERE user_id=?1`).bind(id,value.status,value.note,value.nextFollowupAt,Number(value.permission),value.consentNote,Number(value.suppress),stamp()).run();
   return json({ok:true});
  }
  return json({error:'method_not_allowed'},405);
 }catch(error){if(/UNIQUE constraint failed: user_followup_messages.user_id/.test(String(error)))return json({error:'contact_cooldown_or_in_progress'},409);if(error instanceof z.ZodError||error instanceof SyntaxError||error instanceof Error&&['request_too_large','invalid_request'].includes(error.message))return json({error:'invalid_request'},400);throw error;}
}
export async function handleFollowupUnsubscribe(request:Request,env:FollowupEnv){
 const token=new URL(request.url).searchParams.get('token')||'';
 if(!/^[0-9a-f-]{36}$/i.test(token))return new Response('Invalid link',{status:400});
 if(!['GET','POST'].includes(request.method))return new Response('Method not allowed',{status:405});
 const contact=await env.DB.prepare('SELECT user_id FROM user_followup_contacts WHERE unsubscribe_token=?1').bind(token).first();if(!contact)return new Response('Invalid link',{status:404});
 if(request.method==='POST'){await env.DB.prepare('UPDATE user_followup_contacts SET suppressed_at=COALESCE(suppressed_at,?2),next_followup_at=NULL,updated_at=?2 WHERE unsubscribe_token=?1').bind(token,stamp()).run();return new Response('Follow-up emails stopped. / 已停止回访邮件。',{headers:{'content-type':'text/plain; charset=utf-8','cache-control':'no-store'}});}
 return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Remote Arc · Email preferences</title><body style="font:16px/1.8 system-ui;max-width:540px;margin:12vh auto;padding:24px;color:#242428"><h1>Stop follow-up emails?</h1><p>不再接收 Remote Arc 回访邮件？</p><p>Your account and essential sign-in emails will stay available.<br>账号和必要的登录邮件不受影响。</p><form method="post" action="?token=${escapeAuthHtml(token)}"><button style="padding:12px 20px;border-radius:8px;border:0;background:#242428;color:white;cursor:pointer">Stop follow-ups / 停止回访</button></form></body></html>`,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",'referrer-policy':'no-referrer'}});
}
