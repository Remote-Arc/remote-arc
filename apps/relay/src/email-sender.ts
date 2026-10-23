/** Login and follow-up mail share a Resend channel, with separate senders. */
export type EmailSenderEnv = {RESEND_API_KEY?:string;EMAIL_FROM?:string};
export function emailSender(env:EmailSenderEnv){
 const apiKey=env.RESEND_API_KEY?.trim();
 return apiKey?{apiKey,from:env.EMAIL_FROM?.trim()||'Remote Arc <login@remotearc.app>'}:null;
}
export type FollowupSenderEnv=EmailSenderEnv&{FOLLOWUP_FROM?:string;FOLLOWUP_REPLY_TO?:string};
export const followupReplyTo=(env:FollowupSenderEnv)=>env.FOLLOWUP_REPLY_TO?.trim()||'support@remotearc.app';
export function followupEmailSender(env:FollowupSenderEnv){
 const sender=emailSender(env);
 return sender?{apiKey:sender.apiKey,from:env.FOLLOWUP_FROM?.trim()||'Remote Arc <support@remotearc.app>',replyTo:followupReplyTo(env)}:null;
}
