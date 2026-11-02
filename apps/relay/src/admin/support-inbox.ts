import PostalMime from 'postal-mime';
import {seal,unseal} from '../apps/app-oauth.js';
import {followupEmailSender} from '../platform/email-sender.js';
import {deliverEmail} from '../platform/email-delivery-provider.js';
import {emailWindows,providerEmailLimits,otpReserve,followupUsageSql,supportUsageSql,otpUsageSql} from '../platform/email-capacity.js';

export type SupportEnv={
  DB:D1Database;
  APP_TOKEN_KEY?:string;
  SUPPORT_FORWARD_TO?:string;
  FOLLOWUP_EMAIL_PROVIDER?:string;
  FOLLOWUP_FROM?:string;
  FOLLOWUP_REPLY_TO?:string;
  SENDPULSE_API_KEY?:string;
  RESEND_API_KEY?:string;
  SENDPULSE_HOURLY_EMAIL_LIMIT?:string;
  SENDPULSE_DAILY_EMAIL_LIMIT?:string;
  SENDPULSE_MONTHLY_EMAIL_LIMIT?:string;
};
const SUPPORT='support@remotearc.app';
/** Compact, email-client-safe branding for personal support replies.
 * This is an in-message logo, not a Gmail inbox sender avatar (BIMI).
 * Keep the operator's exact message and escape untrusted HTML. */
export function renderSupportReplyHtml(message:string):string{
  const safe=message.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="color-scheme" content="light"></head>
<body style="margin:0;padding:22px 12px;background:#f6f8fa;color:#182b36;font:16px/1.65 Arial,Helvetica,sans-serif">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:600px;margin:0 auto;border-collapse:separate;border-spacing:0">
<tr><td style="padding:20px 24px;background:#0d1d29;border-radius:12px 12px 0 0">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td style="padding-right:13px" valign="middle"><img src="https://remotearc.app/remote-arc-192.png" alt="Remote Arc" width="40" height="40" style="width:40px;height:40px;display:block;border:0;border-radius:9px"></td>
<td valign="middle" style="color:#fff;font-size:18px;font-weight:700">Remote Arc <span style="display:block;font-size:12px;color:#b4d2dd;font-weight:400">Support</span></td>
</tr></table></td></tr>
<tr><td style="padding:28px 24px;background:#fff;border:1px solid #dce5eb;border-top:0">
<div style="white-space:pre-wrap;overflow-wrap:anywhere;font-size:16px;line-height:1.7;color:#182b36">${safe}</div>
<div style="border-top:1px solid #e6ebef;margin-top:28px;padding-top:16px;font-size:12px;line-height:1.6;color:#5d6a72">Remote Arc Support<br><a href="https://remotearc.app" style="color:#0b658a;text-decoration:none">remotearc.app</a></div>
</td></tr></table></body></html>`;
}
const emailPattern=/^[^\s@<>\r\n]+@[^\s@<>\r\n]+\.[^\s@<>\r\n]+$/;
const safeAddress=(input:string)=>{const value=input.trim().toLowerCase();return value.length<=254&&emailPattern.test(value)?value:null;};
const normalizeSubject=(input:string)=>input.replace(/[\r\n\0]/g,' ').replace(/\s+/g,' ').trim().slice(0,230)||'(no subject)';
const subjectKey=(subject:string)=>normalizeSubject(subject).replace(/^(?:(?:re|fw|fwd):\s*)+/ig,'').toLowerCase().slice(0,200);
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'cache-control':'no-store'}});
const error=(code:string,status:number)=>json({error:code},status);
const toHex=(bytes:Uint8Array)=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
async function hashMail(raw:ArrayBuffer){return toHex(new Uint8Array(await crypto.subtle.digest('SHA-256',raw)));}

export type ParsedSupportMail={
  sender:string; subject:string; body:string; messageId:string; inReplyTo:string;
};
/** Ingest authenticated Email Worker events only. This function is never mounted on HTTP. */
export async function ingestSupportMessage(env:SupportEnv,entry:ParsedSupportMail){
  const sender=safeAddress(entry.sender);
  if(!sender||sender===SUPPORT) return {stored:false,reason:'invalid_sender'};
  const subject=normalizeSubject(entry.subject),key=subjectKey(subject),now=new Date().toISOString();
  const external=entry.messageId.replace(/[\r\n]/g,'').slice(0,500);
  const existing=await env.DB.prepare('SELECT id FROM support_messages WHERE external_message_id=?1').bind(external).first<{id:string}>();
  if(existing)return {stored:false,reason:'duplicate'};
  let thread=await env.DB.prepare(
    'SELECT t.id FROM support_threads t JOIN support_messages m ON m.thread_id=t.id WHERE m.external_message_id=?1 LIMIT 1'
  ).bind(entry.inReplyTo.replace(/[\r\n]/g,'').slice(0,500)).first<{id:string}>();
  if(!thread)thread=await env.DB.prepare(
    "SELECT id FROM support_threads WHERE sender_email=?1 AND subject_key=?2 AND last_message_at>datetime('now','-45 days') ORDER BY last_message_at DESC LIMIT 1"
  ).bind(sender,key).first<{id:string}>();
  const threadId=thread?.id||crypto.randomUUID(),id=crypto.randomUUID();
  const ciphertext=await seal(env as Parameters<typeof seal>[0],entry.body.slice(0,22000),'support:message:'+id);
  if(!thread)await env.DB.prepare('INSERT INTO support_threads(id,sender_email,subject,subject_key,status,created_at,updated_at,last_message_at) VALUES(?1,?2,?3,?4,\'open\',?5,?5,?5)')
    .bind(threadId,sender,subject,key,now).run();
  try{
    await env.DB.prepare('INSERT INTO support_messages(id,thread_id,direction,from_address,to_address,subject,body_encrypted,external_message_id,in_reply_to,delivery_status,created_at) VALUES(?1,?2,\'inbound\',?3,?4,?5,?6,?7,?8,\'received\',?9)')
      .bind(id,threadId,sender,SUPPORT,subject,ciphertext,external,entry.inReplyTo.slice(0,500),now).run();
  }catch(e){
    // Identical RFC Message-ID may be routed twice or retried by Cloudflare.
    const check=await env.DB.prepare('SELECT id FROM support_messages WHERE external_message_id=?1').bind(external).first();
    if(check)return {stored:false,reason:'duplicate'};
    throw e;
  }
  await env.DB.prepare('UPDATE support_threads SET last_message_at=?1,updated_at=?1,status=\'open\' WHERE id=?2').bind(now,threadId).run();
  return {stored:true,threadId};
}
export async function handleInboundSupportEmail(message:ForwardableEmailMessage,env:SupportEnv){
  if(message.to.trim().toLowerCase()!==SUPPORT){message.setReject('Unknown recipient');return;}
  // No hardcoded personal address; activate routing only after the verified
  // Cloudflare destination has been configured in Worker variables.
  const forward=safeAddress(env.SUPPORT_FORWARD_TO||'');
  if(!forward||forward===SUPPORT)throw new Error('support_forward_to_unconfigured');
  try{
    if(message.rawSize<=1_500_000){
      const raw=await new Response(message.raw).arrayBuffer();
      const parsed=await PostalMime.parse(raw);
      const body=(parsed.text||parsed.html?.replace(/<[^>]*>/g,' ').replace(/&nbsp;/g,' ')||'').trim();
      const messageId=parsed.messageId?.trim()||'<sha256-'+await hashMail(raw)+'@remotearc.app>';
      await ingestSupportMessage(env,{
        sender:parsed.from?.address||message.from,
        subject:parsed.subject||'(no subject)',
        body,
        messageId,
        inReplyTo:String(parsed.headers?.find(h=>h.key.toLowerCase()==='in-reply-to')?.value||''),
      });
    }
  }catch{
    // Forwarding survives D1 outages, malformed MIME, or a missing encryption key.
    console.error('support_email_ingest_failed');
  }
  await message.forward(forward);
}
type Thread={id:string;sender_email:string;subject:string;status:string;last_message_at:string};
type Msg={id:string;thread_id:string;direction:string;from_address:string;to_address:string;subject:string;body_encrypted:string;external_message_id:string|null;in_reply_to:string|null;provider_id:string|null;delivery_status:string;error_code:string|null;created_at:string};
async function readThread(env:SupportEnv,id:string){
  const thread=await env.DB.prepare('SELECT id,sender_email,subject,status,last_message_at FROM support_threads WHERE id=?1').bind(id).first<Thread>();
  if(!thread)return null;
  const rows=await env.DB.prepare('SELECT * FROM support_messages WHERE thread_id=?1 ORDER BY created_at ASC LIMIT 100').bind(id).all<Msg>();
  const messages=await Promise.all((rows.results||[]).map(async m=>({
    id:m.id,direction:m.direction,from:m.from_address,to:m.to_address,subject:m.subject,
    body:await unseal<string>(env as Parameters<typeof unseal>[0],m.body_encrypted,'support:message:'+m.id),
    deliveryStatus:m.delivery_status,createdAt:m.created_at,providerId:m.provider_id,
  })));
  const beta=await env.DB.prepare('SELECT google_email,providers_json,status,reviewed_at FROM google_app_beta_requests WHERE support_thread_id=?1').bind(id).first<{google_email:string;providers_json:string;status:string;reviewed_at:string|null}>();
  return {thread,messages,...(beta?{beta:{googleEmail:beta.google_email,providers:JSON.parse(beta.providers_json),status:beta.status,reviewedAt:beta.reviewed_at}}:{})};
}
export async function handleAdminSupportInbox(request:Request,env:SupportEnv,operatorId:string):Promise<Response>{
  const url=new URL(request.url),path=url.pathname;
  if(path==='/api/admin/support-inbox'&&request.method==='GET'){
    const status=url.searchParams.get('status')||'all';
    if(!['all','open','waiting','resolved'].includes(status))return error('invalid_status',400);
    const rows=await env.DB.prepare(
      "SELECT id,sender_email,subject,status,last_message_at FROM support_threads WHERE (?1='all' OR status=?1) ORDER BY last_message_at DESC LIMIT 80"
    ).bind(status).all<Thread>();
    return json({items:rows.results||[]});
  }
  const match=path.match(/^\/api\/admin\/support-inbox\/([a-f0-9-]{36})(?:\/(reply|status|reconcile|google-beta))?$/);
  if(!match)return error('not_found',404);
  const id=match[1]!;
  if(request.method==='GET'&&!match[2]){
    const thread=await readThread(env,id);return thread?json(thread):error('not_found',404);
  }
  const body=await request.json().catch(()=>null) as Record<string,unknown>|null;
  if(!body||typeof body!=='object')return error('invalid_request',400);
  if(request.method==='PATCH'&&match[2]==='google-beta'){
    if(!['approve','decline'].includes(body.decision as string)||body.decision==='approve'&&body.googleTestUserAdded!==true||Object.keys(body).some(key=>!['decision','googleTestUserAdded'].includes(key)))return error('google_test_user_confirmation_required',400);
    const status=body.decision==='approve'?'approved':'declined';
    const changed=await env.DB.prepare("UPDATE google_app_beta_requests SET status=?1,reviewed_by=?2,reviewed_at=?3 WHERE support_thread_id=?4 AND status='pending' RETURNING user_id").bind(status,operatorId,new Date().toISOString(),id).first();
    if(!changed)return error('beta_request_not_pending',409);
    return json({status});
  }
  if(request.method==='PATCH'&&match[2]==='status'){
    if(!['open','waiting','resolved'].includes(body.status as string))return error('invalid_status',400);
    const result=await env.DB.prepare('UPDATE support_threads SET status=?1,updated_at=?2 WHERE id=?3').bind(body.status,new Date().toISOString(),id).run();
    return result.meta?.changes?json({status:body.status}):error('not_found',404);
  }
  if(request.method==='PATCH'&&match[2]==='reconcile'){
    const messageId=typeof body.messageId==='string'?body.messageId:'';
    const result=body.outcome;
    const evidence=typeof body.evidence==='string'?body.evidence.trim():'';
    if(!/^[-a-f0-9]{36}$/i.test(messageId)||!['sent','failed'].includes(result as string)||evidence.length<10||evidence.length>300||/[\r\n]/.test(evidence))return error('invalid_delivery_review',400);
    // Only unknown submissions are manually adjudicated. A fresh 'sending'
    // record may still be in flight and must not be overwritten.
    const revised=await env.DB.prepare("UPDATE support_messages SET delivery_status=?1,delivery_review_note=?2,delivery_reviewed_at=?3,delivery_reviewed_by=?4 WHERE id=?5 AND thread_id=?6 AND direction='outbound' AND delivery_status='unknown' RETURNING id")
      .bind(result,evidence,new Date().toISOString(),operatorId,messageId,id).first();
    if(!revised)return error('delivery_not_reviewable',409);
    if(result==='sent')await env.DB.prepare("UPDATE support_threads SET status='waiting',updated_at=?1 WHERE id=?2").bind(new Date().toISOString(),id).run();
    return json({status:result});
  }
  if(request.method!=='POST'||match[2]!=='reply')return error('method_not_allowed',405);
  const message=typeof body.message==='string'?body.message.trim():'';
  const requestId=typeof body.requestId==='string'?body.requestId:'';
  if(!message||message.length>15000||!/^[-a-f0-9]{36}$/i.test(requestId))return error('invalid_reply',400);
  const thread=await env.DB.prepare('SELECT * FROM support_threads WHERE id=?1').bind(id).first<Thread>();
  if(!thread)return error('not_found',404);
  const to=safeAddress(thread.sender_email);
  if(!to||to===SUPPORT)return error('invalid_recipient',400);
  const sender=followupEmailSender(env);
  if(!sender||sender.provider!=='sendpulse'||sender.replyTo?.trim().toLowerCase()!==SUPPORT||sender.from.toLowerCase().indexOf('<'+SUPPORT+'>')<0)return error('support_sender_unavailable',503);
  const existing=await env.DB.prepare('SELECT delivery_status,provider_id FROM support_messages WHERE id=?1').bind(requestId).first<{delivery_status:string;provider_id:string|null}>();
  if(existing)return json({status:existing.delivery_status,providerId:existing.provider_id,duplicate:true});
  const pending=await env.DB.prepare("SELECT id FROM support_messages WHERE thread_id=?1 AND direction='outbound' AND delivery_status IN('sending','unknown') LIMIT 1").bind(id).first();
  if(pending)return error('previous_delivery_unconfirmed',409);
  const now=new Date().toISOString(),subject='Re: '+normalizeSubject(thread.subject).replace(/^(?:re:\s*)+/i,'');
  const encrypted=await seal(env as Parameters<typeof seal>[0],message,'support:message:'+requestId);
  const windows=emailWindows(Date.parse(now)),limits=providerEmailLimits(env,'sendpulse'),reserve=otpReserve('sendpulse');
  const hasSlot=(since:string,name:'daily'|'hourly'|'monthly')=>
    `${followupUsageSql("'sendpulse'",since)}+${supportUsageSql("'sendpulse'",since)}+MAX(${otpUsageSql("'sendpulse'",since)},${Math.min(limits[name],reserve[name])})<${limits[name]}`;
  let claimed;
  try{
    // Single INSERT statement atomically claims capacity with shared OTP and
    // marketing usage; concurrent support sends cannot pass the final slot.
    claimed=await env.DB.prepare(`INSERT INTO support_messages(id,thread_id,direction,from_address,to_address,subject,body_encrypted,delivery_status,created_at)
      SELECT ?1,?2,'outbound',?3,?4,?5,?6,'sending',?7
      WHERE ${hasSlot('?8','daily')} AND ${hasSlot('?9','hourly')} AND ${hasSlot('?10','monthly')} RETURNING id`)
      .bind(requestId,id,SUPPORT,to,subject,encrypted,now,windows.daySince,windows.hourSince,windows.monthSince).first();
  }catch{
    return error('previous_delivery_unconfirmed',409);
  }
  if(!claimed)return error('support_email_capacity_exhausted',429);
  let outcome:{status:string;providerId:string|null;errorCode:string|null};
  try{
    const html=renderSupportReplyHtml(message);
    outcome=await deliverEmail(sender,{idempotencyKey:requestId,to,subject,html,text:message},12500);
  }catch{outcome={status:'unknown',providerId:null,errorCode:'delivery_uncertain'};}
  await env.DB.prepare("UPDATE support_messages SET delivery_status=?1,provider_id=?2,error_code=?3 WHERE id=?4")
    .bind(outcome.status,outcome.providerId,outcome.errorCode,requestId).run();
  if(outcome.status==='sent')await env.DB.prepare("UPDATE support_threads SET status='waiting',last_message_at=?1,updated_at=?1 WHERE id=?2").bind(now,id).run();
  return json({status:outcome.status,providerId:outcome.providerId},outcome.status==='sent'?200:outcome.status==='failed'?502:202);
}
