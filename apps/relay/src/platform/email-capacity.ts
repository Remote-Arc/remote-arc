import type {FollowupEmailProvider} from './email-sender.js';

export type EmailCapacityEnv={DB:D1Database;RESEND_DAILY_EMAIL_LIMIT?:string;RESEND_MONTHLY_EMAIL_LIMIT?:string;SENDPULSE_HOURLY_EMAIL_LIMIT?:string;SENDPULSE_DAILY_EMAIL_LIMIT?:string;SENDPULSE_MONTHLY_EMAIL_LIMIT?:string};
export function emailLimit(value:string|undefined,fallback:number,max=1000000){
 const number=Number(value);
 return value!==undefined&&value.trim()!==''&&Number.isInteger(number)&&number>=0&&number<=max?number:fallback;
}
export function providerEmailLimits(env:EmailCapacityEnv,provider:FollowupEmailProvider){
 const daily=provider==='resend'?emailLimit(env.RESEND_DAILY_EMAIL_LIMIT,100):emailLimit(env.SENDPULSE_DAILY_EMAIL_LIMIT,400);
 return {daily,hourly:provider==='resend'?daily:emailLimit(env.SENDPULSE_HOURLY_EMAIL_LIMIT,50),monthly:provider==='resend'?emailLimit(env.RESEND_MONTHLY_EMAIL_LIMIT,3000):emailLimit(env.SENDPULSE_MONTHLY_EMAIL_LIMIT,12000)};
}
export const emailWindows=(now=Date.now())=>({daySince:new Date(now-86400000).toISOString(),hourSince:new Date(now-3600000).toISOString(),monthSince:new Date(now-31*86400000).toISOString()});
// These are floors reserved from follow-ups, not ceilings on OTP. OTP may use
// every remaining account slot, including the entire unused follow-up share.
export const otpReserve=(provider:FollowupEmailProvider)=>({hourly:provider==='sendpulse'?10:0,daily:40,monthly:1200});
export const followupUsageSql=(provider:string,since:string)=>`(SELECT COUNT(*) FROM user_followup_messages WHERE delivery_provider=${provider} AND status IN ('sending','sent','unknown') AND COALESCE(delivery_attempted_at,sent_at,created_at)>${since})`;
export const otpUsageSql=(provider:string,since:string)=>`(SELECT COALESCE(SUM(units),0) FROM email_otp_deliveries WHERE provider=${provider} AND status IN ('sending','sent','unknown') AND attempted_at>${since})`;

export async function emailAccountCapacity(env:EmailCapacityEnv,provider:FollowupEmailProvider){
 const limits=providerEmailLimits(env,provider),windows=emailWindows(),reserve=otpReserve(provider);
 const row=await env.DB.prepare(`SELECT ${followupUsageSql('?1','?2')} daily,${followupUsageSql('?1','?3')} hourly,${followupUsageSql('?1','?4')} monthly,${otpUsageSql('?1','?2')} otp_daily,${otpUsageSql('?1','?3')} otp_hourly,${otpUsageSql('?1','?4')} otp_monthly`).bind(provider,windows.daySince,windows.hourSince,windows.monthSince).first<Record<string,number>>();
 const window=(name:'daily'|'hourly'|'monthly')=>{const followups=Number(row?.[name]||0),otp=Number(row?.['otp_'+name]||0),limit=limits[name];return {limit,followups,otp,remaining:Math.max(0,limit-followups-otp),followupRemaining:Math.max(0,limit-followups-Math.max(otp,Math.min(reserve[name],limit)))};};
 return {daily:window('daily'),hourly:window('hourly'),monthly:window('monthly')};
}

/** Atomic account-wide reservation. OTP never checks the follow-up allocation. */
export async function reserveOtpEmail(env:EmailCapacityEnv,provider:FollowupEmailProvider){
 const id=crypto.randomUUID(),now=new Date().toISOString(),windows=emailWindows(),limits=providerEmailLimits(env,provider);
 const used=(since:string)=>`${followupUsageSql('?1',since)}+${otpUsageSql('?1',since)}`;
 const row=await env.DB.prepare(`INSERT INTO email_otp_deliveries(id,provider,status,attempted_at) SELECT ?2,?1,'sending',?3 WHERE ${used('?4')}<${limits.daily} AND ${used('?5')}<${limits.hourly} AND ${used('?6')}<${limits.monthly} RETURNING id`).bind(provider,id,now,windows.daySince,windows.hourSince,windows.monthSince).first();
 return row?id:null;
}
export async function purgeEmailCapacity(env:EmailCapacityEnv){
 await env.DB.prepare('DELETE FROM email_otp_deliveries WHERE attempted_at<?1').bind(new Date(Date.now()-32*86400000).toISOString()).run();
}
