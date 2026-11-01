import type {FollowupProvider} from '../platform/email-sender.js';

export type FollowupTransport={provider:FollowupProvider;apiKey:string;from:string;replyTo:string};
export type FollowupPayload={
 id:string;recipient:string;subject:string;html:string;text:string;unsubscribe:string;timeoutMs:number;
};
export type FollowupDeliveryResult={
 status:'sent'|'failed'|'unknown';providerId:string|null;errorCode:string|null;
};

/** Cloudflare Workers btoa requires binary bytes; never encode Unicode text directly. */
export function utf8Base64(value:string){
 const bytes=new TextEncoder().encode(value);let binary='';
 for(let offset=0;offset<bytes.length;offset+=8192){
  binary+=String.fromCharCode(...bytes.subarray(offset,offset+8192));
 }
 return btoa(binary);
}
function address(value:string){
 const bracket=value.match(/^\s*(?:(.*?)\s*)?<([^<>\s@]+@[^<>\s@]+)>\s*$/);
 if(bracket)return {name:(bracket[1]||'Remote Arc').trim().replace(/^"|"$/g,''),email:bracket[2]!};
 if(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()))return {name:'Remote Arc',email:value.trim()};
 throw new Error('invalid_followup_address');
}

/**
 * Only the follow-up channel can choose SendPulse. Both providers retain the
 * D1 claim/unknown-delivery guard in dispatchFollowup. SendPulse does not
 * document Resend's Idempotency-Key guarantee: never retry ambiguous sends.
 */
export async function sendFollowupViaProvider(
 sender:FollowupTransport,message:FollowupPayload,
 transport:typeof fetch=fetch,
):Promise<FollowupDeliveryResult>{
 const isSendPulse=sender.provider==='sendpulse';
 let requestBody:unknown;
 try{
  if(isSendPulse){
   const from=address(sender.from),replyTo=address(sender.replyTo);
   requestBody={email:{
    subject:message.subject,
    html:utf8Base64(message.html),
    text:message.text,
    from,
    to:[{name:'',email:message.recipient}],
    reply_to:replyTo,
   }};
  }else{
   requestBody={
    from:sender.from,to:[message.recipient],reply_to:sender.replyTo,
    subject:message.subject,html:message.html,text:message.text,
    headers:{
     'List-Unsubscribe':'<'+message.unsubscribe+'>',
     'List-Unsubscribe-Post':'List-Unsubscribe=One-Click',
    },
   };
  }
 }catch{return {status:'failed',providerId:null,errorCode:'invalid_followup_address'};}
 try{
  const response=await transport(isSendPulse?'https://api.sendpulse.com/smtp/emails':'https://api.resend.com/emails',{
   method:'POST',
   headers:{
    authorization:'Bearer '+sender.apiKey,
    'content-type':'application/json',
    ...(isSendPulse?{}:{'Idempotency-Key':'followup/'+message.id}),
   },
   body:JSON.stringify(requestBody),
   signal:AbortSignal.timeout(message.timeoutMs),
  });
  const result=await response.json().catch(()=>null) as {id?:unknown;result?:unknown}|null;
  const id=typeof result?.id==='string'&&result.id.trim()?result.id:null;
  if(response.ok&&id&&(!isSendPulse||result?.result===true)){
   return {status:'sent',providerId:id,errorCode:null};
  }
  // A successful HTTP response without a recognized provider receipt is
  // ambiguous. Treat it as possibly accepted; never re-dispatch automatically.
  if(response.ok)return {status:'unknown',providerId:id,errorCode:'provider_receipt_unconfirmed'};
  return {status:response.status>=500?'unknown':'failed',providerId:null,errorCode:'provider_'+response.status};
 }catch{
  return {status:'unknown',providerId:null,errorCode:'delivery_unconfirmed'};
 }
}
