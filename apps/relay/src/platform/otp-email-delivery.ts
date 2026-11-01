import {otpEmailSenders,type EmailSenderEnv} from './email-sender.js';
import {reserveOtpEmail,type EmailCapacityEnv} from './email-capacity.js';
import {deliverEmail} from './email-delivery-provider.js';

export async function deliverOtpEmail(env:EmailSenderEnv&EmailCapacityEnv,to:string,message:{subject:string;html:string;text:string}){
 let outcome:'failed'|'unknown'='failed';
 for(const sender of otpEmailSenders(env)){
  // A ledger failure must not hide an earlier send that may have arrived.
  const id=await reserveOtpEmail(env,sender.provider).catch(()=>null);if(!id)continue;
  let status='unknown';
  try{status=(await deliverEmail(sender,{idempotencyKey:'otp/'+id,to,...message},8000)).status;}catch{/* A request may already have been accepted. */}
  try{await env.DB.prepare('UPDATE email_otp_deliveries SET status=?2 WHERE id=?1').bind(id,status).run();}catch{return 'unknown';}
  if(status==='sent')return status;
  // Every attempt repeats the same OTP, so a duplicate costs far less than a
  // stranded sign-in: try the next account after a rejection or uncertainty.
  if(status==='unknown')outcome='unknown';
 }
 return outcome;
}
