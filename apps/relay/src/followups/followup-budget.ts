import type {FollowupEnv} from './followup-common.js';

// Follow-ups and sign-in codes share one sending account (Resend's free plan
// allows 100 emails a day). Follow-ups stop at their own daily cap so a bulk
// send never uses up the codes' share.
export const DEFAULT_FOLLOWUP_DAILY_LIMIT=60;
export function followupDailyLimit(env:FollowupEnv){
 const value=Number(env.FOLLOWUP_DAILY_EMAIL_LIMIT);
 return env.FOLLOWUP_DAILY_EMAIL_LIMIT!==undefined&&Number.isInteger(value)&&value>=0&&value<=10000?value:DEFAULT_FOLLOWUP_DAILY_LIMIT;
}
/** Rolling 24 hours. Uncertain deliveries count, since the provider may have sent them. */
export async function followupEmailBudget(env:FollowupEnv){
 const since=new Date(Date.now()-24*3600000).toISOString();
 const row=await env.DB.prepare(`SELECT COUNT(*) used FROM user_followup_messages WHERE sent_at>?1 OR (status IN ('sending','unknown') AND created_at>?1)`).bind(since).first<{used:number}>();
 const limit=followupDailyLimit(env),used=Number(row?.used||0);
 return {limit,used,remaining:Math.max(0,limit-used)};
}
