import {renderFollowupEmail} from '../../../../packages/protocol/src/followup-email.js';
import {feedbackRewardAvailable} from '../billing/connect-rewards.js';
import {followupEmailSender,followupReplyTo} from '../platform/email-sender.js';
import {ensureContact,followupLinks,stamp,type FollowupEnv,type Message} from './followup-common.js';
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'cache-control':'private, no-store'}});
export async function dispatchFollowup(env:FollowupEnv,id:string,expectedRevision?:number,batchId?:string,timeoutMs=20000){
   const message=await env.DB.prepare('SELECT * FROM user_followup_messages WHERE id=?1').bind(id).first<Message>();if(!message)return json({error:'draft_not_found'},404);
   if((message.batch_id||undefined)!==batchId)return json({error:'batch_managed_message'},409);
   if(message.status!=='draft')return json({id,status:message.status,providerId:message.provider_id});
   if(expectedRevision!==undefined&&expectedRevision!==message.draft_revision)return json({error:'draft_conflict'},409);
   const sender=followupEmailSender(env);if(!sender)return json({error:'email_not_configured'},503);
   const contact=await ensureContact(env,message.user_id);if(!contact||contact.suppressed_at)return json({error:'recipient_suppressed'},409);if(!contact.consent_at)return json({error:'contact_permission_required'},409);if(message.recipient_email!==contact.email)return json({error:'recipient_changed'},409);
   if(batchId&&!await env.DB.prepare("SELECT id FROM user_followup_batches WHERE id=?1 AND status='queued'").bind(batchId).first())return json({error:'batch_not_queued'},409);
   const unsubscribe=new URL(env.MARKETING_ORIGIN||'https://remotearc.app').origin+'/email/follow-up/unsubscribe?token='+contact.unsubscribe_token;
   const fallback=renderFollowupEmail({...message,templateId:message.template_id,...followupLinks(env,id,message.locale),unsubscribeUrl:unsubscribe,replyTo:followupReplyTo(env),rewardAvailable:await feedbackRewardAvailable(env.DB),...(message.design_json?{design:JSON.parse(message.design_json)}:{})});
   const {html,text}=message.html_body&&message.text_body?{html:message.html_body,text:message.text_body}:fallback;
   const cutoff=new Date(Date.now()-72*3600000).toISOString(),now=stamp();
   const claimed=await env.DB.prepare(`UPDATE user_followup_messages SET status='sending' WHERE id=?1 AND status='draft' AND draft_revision=?4 AND EXISTS(SELECT 1 FROM user_followup_contacts c WHERE c.user_id=?2 AND c.suppressed_at IS NULL AND c.consent_at IS NOT NULL) AND NOT EXISTS(SELECT 1 FROM user_followup_messages m WHERE m.user_id=?2 AND m.id<>?1 AND (m.status IN ('sending','unknown') OR m.sent_at>?3)) AND (?5 IS NULL OR EXISTS(SELECT 1 FROM user_followup_batches b JOIN user_followup_batch_recipients r ON r.batch_id=b.id WHERE b.id=?5 AND b.status='queued' AND EXISTS(SELECT 1 FROM users WHERE id=b.actor_id AND role='admin') AND r.message_id=?1 AND r.status='processing')) RETURNING id`).bind(id,message.user_id,cutoff,message.draft_revision,batchId||null).first();
   if(!claimed)return json({error:'contact_cooldown_or_in_progress'},409);
   let status='unknown',providerId:string|null=null,errorCode:string|null=null;
   try{
    const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{authorization:'Bearer '+sender.apiKey,'content-type':'application/json','Idempotency-Key':'followup/'+id},body:JSON.stringify({from:sender.from,to:[contact.email],reply_to:sender.replyTo,subject:message.subject,html,text,headers:{'List-Unsubscribe':'<'+unsubscribe+'>','List-Unsubscribe-Post':'List-Unsubscribe=One-Click'}}),signal:AbortSignal.timeout(timeoutMs)});
    const result=await response.json().catch(()=>null) as {id?:string}|null;
    if(response.ok&&result?.id){status='sent';providerId=result.id;}else{status=response.status>=500?'unknown':'failed';errorCode='provider_'+response.status;}
   }catch{errorCode='delivery_unconfirmed';}
   await env.DB.prepare('UPDATE user_followup_messages SET status=?2,provider_id=?3,sent_at=?4,error_code=?5 WHERE id=?1').bind(id,status,providerId,status==='sent'?now:null,errorCode).run();
   if(status==='sent')await env.DB.prepare(`UPDATE user_followup_contacts SET status='contacted',next_followup_at=NULL,updated_at=?2 WHERE user_id=?1`).bind(message.user_id,now).run();
   return json({id,status,providerId,errorCode},status==='sent'?200:502);
}
