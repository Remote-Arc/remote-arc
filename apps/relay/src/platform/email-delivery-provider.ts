import {emailMailbox,type FollowupEmailProvider} from './email-sender.js';

type Sender={provider:FollowupEmailProvider;apiKey:string;from:string;replyTo?:string};
type Mail={idempotencyKey:string;to:string;subject:string;html:string;text:string;unsubscribe?:string};
/** Only these fixed provider URLs are reachable. This layer never retries:
 * after a timeout the provider may already have accepted this message. */
export async function deliverEmail(sender:Sender,mail:Mail,timeoutMs:number){
 const headers:Record<string,string>={authorization:'Bearer '+sender.apiKey,'content-type':'application/json'};
 let url:string,body:unknown;
 if(sender.provider==='sendpulse'){
  url='https://api.sendpulse.com/smtp/emails';
  const html=btoa(Array.from(new TextEncoder().encode(mail.html),byte=>String.fromCharCode(byte)).join(''));
  body={email:{from:emailMailbox(sender.from),to:[{email:mail.to}],...(sender.replyTo?{reply_to:emailMailbox(sender.replyTo)}:{}),subject:mail.subject,html,text:mail.text}};
 }else{
  url='https://api.resend.com/emails';headers['Idempotency-Key']=mail.idempotencyKey;
  body={from:sender.from,to:[mail.to],...(sender.replyTo?{reply_to:sender.replyTo}:{}),subject:mail.subject,html:mail.html,text:mail.text,...(mail.unsubscribe?{headers:{'List-Unsubscribe':'<'+mail.unsubscribe+'>','List-Unsubscribe-Post':'List-Unsubscribe=One-Click'}}:{})};
 }
 // Workerd supports manual/follow only. Never forward provider credentials on redirects.
 const response=await fetch(url,{method:'POST',headers,body:JSON.stringify(body),signal:AbortSignal.timeout(timeoutMs),redirect:'manual'});
 const result=await response.json().catch(()=>null) as {id?:unknown;result?:unknown}|null;
 const accepted=response.ok&&(sender.provider==='resend'||result?.result===true);
 if(accepted&&typeof result?.id==='string'&&result.id.trim())return {status:'sent',providerId:result.id,errorCode:null};
 // A 2xx response with a missing ID or malformed body is ambiguous, not proof
 // that sending failed. A documented SendPulse result:false is a rejection.
 const rejected=response.ok&&sender.provider==='sendpulse'&&result?.result===false;
 const status=rejected||!response.ok&&response.status<500&&response.status!==408?'failed':'unknown';
 return {status,providerId:null,errorCode:rejected?'provider_rejected':'provider_'+response.status};
}
