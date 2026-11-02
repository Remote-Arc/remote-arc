import {z} from 'zod';
import {getSessionUser} from '../auth/auth.js';
import {FOLLOWUP_TEMPLATES} from '../../../../packages/protocol/src/followup-templates.js';
import {escapeAuthHtml} from '../auth/auth-page.js';
import {renderFollowupEmail} from '../../../../packages/protocol/src/followup-email.js';
import {feedbackRewardAvailable} from '../billing/connect-rewards.js';
import {followupEmailSender,followupReplyTo} from '../platform/email-sender.js';

export type {FollowupEnv} from './followup-common.js';
import {type FollowupEnv,ensureContact,followupLinks,designSchema,stamp,type Message} from './followup-common.js';
import {dispatchFollowup} from './followup-delivery.js';
import {listFollowupPeople} from './followup-crm.js';
import {handleFollowupBatches} from './followup-batches.js';
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'cache-control':'private, no-store'}});
async function input(request:Request,maxBytes=24000){
 if(Number(request.headers.get('content-length')||0)>maxBytes)throw Error('request_too_large');
 const reader=request.body?.getReader();if(!reader)throw Error('invalid_request');let length=0;const chunks:Uint8Array[]=[];
 try{for(;;){const part=await reader.read();if(part.done)break;length+=part.value.length;if(length>maxBytes){await reader.cancel();throw Error('request_too_large');}chunks.push(part.value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 return JSON.parse(new TextDecoder().decode(bytes));
}
export async function handleUserFollowups(request:Request,env:FollowupEnv){
 const user=await getSessionUser(request,env);if(!user)return json({error:'unauthorized'},401);if(!user.isAdmin)return json({error:'forbidden'},403);
 if(request.method!=='GET'&&(request.headers.get('origin')!==new URL(request.url).origin||request.headers.get('content-type')?.split(';')[0]!=='application/json'))return json({error:'invalid_origin_or_type'},403);
 const url=new URL(request.url),path=url.pathname;
 try{
  if(path==='/api/admin/followups/selection'&&request.method==='GET')return listFollowupPeople(env,url,true);
  if(path.startsWith('/api/admin/followups/batches')||path==='/api/admin/followups/bulk-status')return await handleFollowupBatches(request,env,user.id,()=>input(request,96000));
  if(path==='/api/admin/followups'&&request.method==='GET'){
   return listFollowupPeople(env,url);
  }
  if(path==='/api/admin/followups/drafts'&&request.method==='POST'){
   const value=z.object({id:z.uuid(),userId:z.string().min(1).max(160),templateId:z.enum(FOLLOWUP_TEMPLATES.map(t=>t.id)),locale:z.enum(['en','zh']),subject:z.string().trim().min(1).max(200).refine(s=>!/[\r\n]/.test(s)),body:z.string().trim().min(20).max(6000),design:designSchema.optional(),expectedRevision:z.number().int().positive().optional()}).strict().parse(await input(request));
   const contact=await ensureContact(env,value.userId);if(!contact)return json({error:'user_not_found'},404);
   const existing=await env.DB.prepare('SELECT * FROM user_followup_messages WHERE id=?1').bind(value.id).first<Message>();
   if(existing){
    if(existing.batch_id)return json({error:'batch_managed_message'},409);
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
   return dispatchFollowup(env,id,options.expectedRevision);
  }
  if(request.method==='GET'){
   const [contact,messages]=await Promise.all([ensureContact(env,id),env.DB.prepare('SELECT m.id,m.template_id,m.locale,m.subject,m.body,m.status,m.provider_id,m.created_at,m.sent_at,COALESCE(m.error_code,r.error_code) error_code,m.design_json,m.html_body,m.draft_revision,m.batch_id,b.status batch_status,r.status batch_recipient_status FROM user_followup_messages m LEFT JOIN user_followup_batches b ON b.id=m.batch_id LEFT JOIN user_followup_batch_recipients r ON r.message_id=m.id WHERE m.user_id=?1 ORDER BY m.created_at DESC LIMIT 50').bind(id).all()]);
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
const unsubscribePageHeaders={
 'content-type':'text/html; charset=utf-8',
 'cache-control':'private, no-store',
 'content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
 'referrer-policy':'no-referrer',
 'x-robots-tag':'noindex, nofollow',
};
/** Public email preference pages intentionally use English only. */
function unsubscribePage(state:'confirm'|'success'|'already',token:string){
 const title=state==='confirm'?'Stop follow-up emails?':state==='already'?"You're already unsubscribed":"You're unsubscribed";
 const description=state==='confirm'
  ?'You can stop receiving personal follow-up emails from Remote Arc.'
  :state==='already'
   ?"You're no longer receiving personal follow-up emails from Remote Arc."
   :"You've successfully stopped personal follow-up emails from Remote Arc.";
 const form=state==='confirm'
  ?'<form method="post" action="?token='+escapeAuthHtml(token)+'"><button type="submit" style="display:inline-block;border:0;border-radius:9px;background:#17212f;color:#fff;font:600 16px/1.3 system-ui,sans-serif;padding:13px 20px;cursor:pointer">Stop follow-up emails</button></form>'
  :'';
 const html=[
  '<!doctype html><html lang="en"><head><meta charset="utf-8">',
  '<meta name="viewport" content="width=device-width,initial-scale=1">',
  '<meta name="robots" content="noindex,nofollow">',
  '<title>Remote Arc | Email preferences</title></head>',
  '<body style="margin:0;background:#f8fafc;color:#17212f;font:16px/1.65 system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif">',
  '<main style="max-width:540px;margin:clamp(48px,11vh,120px) auto;padding:28px">',
  '<p style="font-size:14px;font-weight:700;letter-spacing:.04em;color:#475569;margin:0 0 22px">REMOTE ARC</p>',
  '<h1 style="font-size:clamp(27px,5vw,34px);line-height:1.2;margin:0 0 22px">'+title+'</h1>',
  '<p style="margin:0 0 15px">'+description+'</p>',
  '<p style="margin:0 0 30px;color:#475569">Your account and essential sign-in emails will not be affected.</p>',
  form,
  '<p style="font-size:14px;margin:32px 0 0;color:#64748b">Need help? <a href="mailto:support@remotearc.app" style="color:#145a86">Contact support</a>.</p>',
  '</main></body></html>',
 ].join('');
 return new Response(html,{headers:unsubscribePageHeaders});
}
export async function handleFollowupUnsubscribe(request:Request,env:FollowupEnv){
 const token=new URL(request.url).searchParams.get('token')||'';
 if(!/^[0-9a-f-]{36}$/i.test(token))return new Response('Invalid unsubscribe link',{status:400,headers:{'cache-control':'no-store','x-robots-tag':'noindex'}});
 if(!['GET','POST'].includes(request.method))return new Response('Method not allowed',{status:405,headers:{'cache-control':'no-store','allow':'GET, POST'}});
 const contact=await env.DB.prepare('SELECT user_id,suppressed_at FROM user_followup_contacts WHERE unsubscribe_token=?1').bind(token).first<{user_id:string;suppressed_at:string|null}>();
 if(!contact)return new Response('Invalid unsubscribe link',{status:404,headers:{'cache-control':'no-store','x-robots-tag':'noindex'}});
 if(request.method==='POST'){
  await env.DB.prepare('UPDATE user_followup_contacts SET suppressed_at=COALESCE(suppressed_at,?2),next_followup_at=NULL,updated_at=?2 WHERE unsubscribe_token=?1').bind(token,stamp()).run();
  return unsubscribePage('success',token);
 }
 return unsubscribePage(contact.suppressed_at?'already':'confirm',token);
}
