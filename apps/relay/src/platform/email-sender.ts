/** OTP prefers Resend and can borrow SendPulse capacity; follow-ups never fail over. */
export type EmailSenderEnv = {RESEND_API_KEY?:string;EMAIL_FROM?:string;SENDPULSE_API_KEY?:string};
export function emailSender(env:EmailSenderEnv){
 const apiKey=env.RESEND_API_KEY?.trim();
 return apiKey?{apiKey,from:env.EMAIL_FROM?.trim()||'Remote Arc <login@remotearc.app>'}:null;
}
export type FollowupEmailProvider='resend'|'sendpulse';
export type FollowupSenderEnv=EmailSenderEnv&{FOLLOWUP_FROM?:string;FOLLOWUP_REPLY_TO?:string;FOLLOWUP_EMAIL_PROVIDER?:string;SENDPULSE_API_KEY?:string};
export function followupEmailProvider(env:FollowupSenderEnv):FollowupEmailProvider|null{
 const provider=env.FOLLOWUP_EMAIL_PROVIDER?.trim()||'resend';
 return provider==='resend'||provider==='sendpulse'?provider:null;
}
export const followupReplyTo=(env:FollowupSenderEnv)=>env.FOLLOWUP_REPLY_TO?.trim()||'support@remotearc.app';
export function emailMailbox(value:string){
 if(/[\r\n]/.test(value))return null;
 const match=value.trim().match(/^(?:(.*?)\s*<([^<>]+)>|([^<>]+))$/);
 const email=(match?.[2]||match?.[3]||'').trim(),name=match?.[1]?.trim();
 return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)?{...(name?{name}:{}),email}:null;
}
export function otpEmailSenders(env:EmailSenderEnv){
 const primary=emailSender(env),senders:{provider:FollowupEmailProvider;apiKey:string;from:string}[]=[];
 if(primary)senders.push({provider:'resend',...primary});
 const apiKey=env.SENDPULSE_API_KEY?.trim(),from=env.EMAIL_FROM?.trim()||'Remote Arc <login@remotearc.app>';
 if(apiKey&&emailMailbox(from))senders.push({provider:'sendpulse',apiKey,from});
 return senders;
}
export function followupEmailSender(env:FollowupSenderEnv){
 const provider=followupEmailProvider(env);
 const apiKey=provider==='sendpulse'?env.SENDPULSE_API_KEY?.trim():provider==='resend'?env.RESEND_API_KEY?.trim():null;
 const from=env.FOLLOWUP_FROM?.trim()||'Remote Arc <support@remotearc.app>',replyTo=followupReplyTo(env);
 if(provider==='sendpulse'&&(!emailMailbox(from)||!emailMailbox(replyTo)))return null;
 return provider&&apiKey?{provider,apiKey,from,replyTo}:null;
}
