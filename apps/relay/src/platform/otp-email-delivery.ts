import {otpEmailSenders,type EmailSenderEnv} from './email-sender.js';
import {reserveOtpEmail,type EmailCapacityEnv} from './email-capacity.js';
import {deliverEmail} from './email-delivery-provider.js';

export async function deliverOtpEmail(env:EmailSenderEnv&EmailCapacityEnv,to:string,message:{subject:string;html:string;text:string}){
 for(const sender of otpEmailSenders(env)){
  const id=await reserveOtpEmail(env,sender.provider);if(!id)continue;
  let status='unknown';
  try{status=(await deliverEmail(sender,{idempotencyKey:'otp/'+id,to,...message},8000)).status;}catch{/* A request may already have been accepted. */}
  try{await env.DB.prepare('UPDATE email_otp_deliveries SET status=?2 WHERE id=?1').bind(id,status).run();}catch{return 'unknown';}
  if(status==='sent'||status==='unknown')return status;
  // Only a confirmed rejection permits trying the next account. The same OTP
  // is used for both attempts; neither timeout nor malformed success retries.
 }
 return 'failed';
}
