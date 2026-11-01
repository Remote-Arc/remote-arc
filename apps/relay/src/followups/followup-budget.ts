import type {FollowupEnv} from './followup-common.js';
import {followupEmailProvider} from '../platform/email-sender.js';
import {emailAccountCapacity,emailLimit,emailWindows,providerEmailLimits,otpReserve,otpUsageSql,followupUsageSql} from '../platform/email-capacity.js';

// Follow-ups have their own caps and yield shared account capacity as OTP grows.
export const DEFAULT_FOLLOWUP_DAILY_LIMIT=60;
export function followupDailyLimit(env:FollowupEnv){
 return emailLimit(env.FOLLOWUP_DAILY_EMAIL_LIMIT,followupEmailProvider(env)==='sendpulse'?400:DEFAULT_FOLLOWUP_DAILY_LIMIT,10000);
}
export function followupBudgetWindows(env:FollowupEnv,now=Date.now()){
 const provider=followupEmailProvider(env)||'resend';
 return {provider,daily:followupDailyLimit(env),hourly:emailLimit(env.FOLLOWUP_HOURLY_EMAIL_LIMIT,provider==='sendpulse'?50:60,10000),monthly:emailLimit(env.FOLLOWUP_MONTHLY_EMAIL_LIMIT,provider==='sendpulse'?12000:1800),...emailWindows(now)};
}
/** Used inside the atomic draft claim, so concurrent dispatches cannot exceed a cap. */
export function followupBudgetGuard(env:FollowupEnv,now:string){
 const window=followupBudgetWindows(env,Date.parse(now));
 const limits=providerEmailLimits(env,window.provider),reserve=otpReserve(window.provider);
 const count=(since:string)=>followupUsageSql('?6',since);
 const shared=(name:'daily'|'hourly'|'monthly',since:string)=>`${count(since)}+MAX(${otpUsageSql('?6',since)},${Math.min(reserve[name],limits[name])})<${limits[name]}`;
 return {sql:`${count('?8')}<?9 AND ${count('?10')}<?11 AND ${count('?12')}<?13 AND ${shared('daily','?8')} AND ${shared('hourly','?10')} AND ${shared('monthly','?12')}`,bindings:[window.provider,now,window.daySince,window.daily,window.hourSince,window.hourly,window.monthSince,window.monthly]};
}
/** Rolling windows also count in-flight and uncertain deliveries. 31 days is
 * conservative across provider billing months, including month boundaries. */
export async function followupEmailBudget(env:FollowupEnv){
 const window=followupBudgetWindows(env);
 const account=await emailAccountCapacity(env,window.provider);
 const used=account.daily.followups,dailyRemaining=Math.max(0,Math.min(window.daily-used,account.daily.followupRemaining));
 const hourly={limit:window.hourly,used:account.hourly.followups,remaining:Math.max(0,Math.min(window.hourly-account.hourly.followups,account.hourly.followupRemaining))};
 const monthly={limit:window.monthly,used:account.monthly.followups,remaining:Math.max(0,Math.min(window.monthly-account.monthly.followups,account.monthly.followupRemaining)),windowDays:31};
 const blockedBy=dailyRemaining===0?'daily':hourly.remaining===0?'hourly':monthly.remaining===0?'monthly':null;
 return {provider:window.provider,limit:window.daily,used,remaining:Math.min(dailyRemaining,hourly.remaining,monthly.remaining),hourly,monthly,blockedBy,otpUsage:{daily:account.daily.otp,hourly:account.hourly.otp,monthly:account.monthly.otp}};
}
export const followupBudgetError=(budget:Awaited<ReturnType<typeof followupEmailBudget>>)=>budget.blockedBy?budget.blockedBy+'_email_budget_reached':null;
