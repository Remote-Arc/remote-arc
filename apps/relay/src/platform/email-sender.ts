/** Authentication mail always uses Resend. Follow-ups select a separate transport. */
export type EmailSenderEnv = {RESEND_API_KEY?:string;EMAIL_FROM?:string};
export function emailSender(env:EmailSenderEnv){
 const apiKey=env.RESEND_API_KEY?.trim();
 return apiKey?{apiKey,from:env.EMAIL_FROM?.trim()||'Remote Arc <login@remotearc.app>'}:null;
}
export type FollowupProvider='resend'|'sendpulse';
export type FollowupSenderEnv=EmailSenderEnv&{
 FOLLOWUP_FROM?:string;FOLLOWUP_REPLY_TO?:string;
 FOLLOWUP_PROVIDER?:string;SENDPULSE_API_KEY?:string;
};
export const followupReplyTo=(env:FollowupSenderEnv)=>env.FOLLOWUP_REPLY_TO?.trim()||'support@remotearc.app';
export function followupEmailSender(env:FollowupSenderEnv){
 // Preserve the previous Resend behaviour until an explicit provider cutover.
 // Invalid values fail closed instead of silently sending through another service.
 const provider=env.FOLLOWUP_PROVIDER?.trim().toLowerCase()||'resend';
 if(provider!=='resend'&&provider!=='sendpulse')return null;
 const apiKey=(provider==='sendpulse'?env.SENDPULSE_API_KEY:env.RESEND_API_KEY)?.trim();
 return apiKey?{provider:provider as FollowupProvider,apiKey,from:env.FOLLOWUP_FROM?.trim()||'Remote Arc <support@remotearc.app>',replyTo:followupReplyTo(env)}:null;
}
