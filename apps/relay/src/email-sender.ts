/** Login and follow-up mail share the same configured Resend channel. */
export type EmailSenderEnv = {RESEND_API_KEY?:string;EMAIL_FROM?:string};
export function emailSender(env:EmailSenderEnv){
 const apiKey=env.RESEND_API_KEY?.trim();
 return apiKey?{apiKey,from:env.EMAIL_FROM?.trim()||'Remote Arc <login@remotearc.app>'}:null;
}
