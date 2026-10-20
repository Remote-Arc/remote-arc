import {z} from 'zod';
import {getSessionUser} from './auth.js';
type Env={DB:D1Database;PUBLIC_ORIGIN:string};
type Policy={id:string;revision:number;enabled:number;calls:number;valid_days:number;per_user_limit:number;total_calls_cap:number;published_at:string};
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'cache-control':'private, no-store'}});
export const feedbackRewardPolicy=(db:D1Database)=>db.prepare('SELECT v.* FROM feedback_reward_policy p JOIN feedback_reward_versions v ON v.id=p.version_id WHERE p.id=1').first<Policy>();
export async function feedbackRewardAvailable(db:D1Database){
 const row=await db.prepare('SELECT v.enabled=1 AND c.granted_calls+v.calls<=v.total_calls_cap available FROM feedback_reward_policy p JOIN feedback_reward_versions v ON v.id=p.version_id JOIN feedback_reward_campaign_usage c ON c.id=1 WHERE p.id=1').first<{available:number}>();
 return Boolean(row?.available);
}
export async function rewardAllowance(db:D1Database,userId:string,at=new Date().toISOString()){
 try{return await db.prepare(`SELECT COALESCE((SELECT SUM(granted_calls-spent_calls) FROM connect_feedback_rewards WHERE user_id=?1 AND starts_at<=?2 AND expires_at>?2),0) available,
  (SELECT COUNT(*) FROM connect_reward_consumptions WHERE user_id=?1 AND month_key=?3 AND reward_id IS NOT NULL) spentThisMonth`).bind(userId,at,at.slice(0,7)).first<{available:number;spentThisMonth:number}>();}
 catch(error){if(/no such table:\s*(connect_feedback_rewards|connect_reward_consumptions)/i.test(String(error)))return null;throw error;}
}
export async function consumeRewardCall(db:D1Database,userId:string,baseLimit:number,at=new Date().toISOString()){
 if(!Number.isSafeInteger(baseLimit)||baseLimit<1)throw new Error('Invalid Connect base allowance');
 const id=crypto.randomUUID(),month=at.slice(0,7);
 const result=await db.prepare(`INSERT INTO connect_reward_consumptions(id,user_id,month_key,reward_id,base_limit,created_at)
 SELECT ?1,?2,?3,CASE WHEN (COALESCE((SELECT tool_calls FROM user_monthly_usage WHERE user_id=?2 AND month_key=?3),0)-(SELECT COUNT(*) FROM connect_reward_consumptions WHERE user_id=?2 AND month_key=?3 AND reward_id IS NOT NULL))>=?4
  THEN (SELECT id FROM connect_feedback_rewards WHERE user_id=?2 AND starts_at<=?5 AND expires_at>?5 AND spent_calls<granted_calls ORDER BY expires_at,id LIMIT 1) ELSE NULL END,?4,?5
 WHERE (COALESCE((SELECT tool_calls FROM user_monthly_usage WHERE user_id=?2 AND month_key=?3),0)-(SELECT COUNT(*) FROM connect_reward_consumptions WHERE user_id=?2 AND month_key=?3 AND reward_id IS NOT NULL))<?4 OR EXISTS(SELECT 1 FROM connect_feedback_rewards WHERE user_id=?2 AND starts_at<=?5 AND expires_at>?5 AND spent_calls<granted_calls)
 RETURNING id`).bind(id,userId,month,baseLimit,at).first<{id:string}>();
 return result?.id===id;
}
export async function publicFeedbackReward(request:Request,env:Env){
 if(request.method!=='GET')return json({error:'method_not_allowed'},405);
 const [policy,user]=await Promise.all([feedbackRewardPolicy(env.DB),getSessionUser(request,env)]);
 const granted=await env.DB.prepare('SELECT granted_calls calls FROM feedback_reward_campaign_usage WHERE id=1').first<{calls:number}>();
 const enabled=Boolean(policy?.enabled&&(granted?.calls||0)+policy.calls<=policy.total_calls_cap);
 const own=user?await rewardAllowance(env.DB,user.id):null;
 return json({enabled,policy:enabled?{versionId:policy!.id,calls:policy!.calls,validDays:policy!.valid_days,perUserLimit:policy!.per_user_limit}:null,account:user?{email:user.email,availableCalls:own?.available||0}:null});
}
export async function createFeedbackRewardClaim(db:D1Database,submissionId:string,userId:string,versionId:string,at:string){
 const id=crypto.randomUUID();
 await db.prepare(`INSERT OR IGNORE INTO feedback_reward_claims(id,submission_id,user_id,version_id,status,created_at)
 SELECT ?1,s.id,?3,v.id,'pending',?5 FROM website_submissions s,feedback_reward_policy p JOIN feedback_reward_versions v ON v.id=p.version_id
 WHERE s.id=?2 AND s.user_id=?3 AND s.category='feedback' AND s.source NOT IN ('support','enterprise') AND v.id=?4 AND v.enabled=1
  AND ((SELECT COUNT(*) FROM connect_feedback_rewards WHERE user_id=?3)+(SELECT COUNT(*) FROM feedback_reward_claims WHERE user_id=?3 AND status='pending'))<v.per_user_limit
  AND COALESCE((SELECT granted_calls FROM feedback_reward_campaign_usage WHERE id=1),0)+v.calls<=v.total_calls_cap`).bind(id,submissionId,userId,versionId,at).run();
 return db.prepare('SELECT c.status,v.calls,v.valid_days validDays FROM feedback_reward_claims c JOIN feedback_reward_versions v ON v.id=c.version_id WHERE c.submission_id=?1 AND c.user_id=?2').bind(submissionId,userId).first();
}
const settings=z.object({revision:z.number().int().positive(),enabled:z.boolean(),calls:z.number().int().min(1).max(100000),validDays:z.number().int().min(1).max(365),perUserLimit:z.number().int().min(1).max(10),totalCallsCap:z.number().int().min(1).max(10000000)}).strict().refine(value=>value.totalCallsCap>=value.calls);
export async function handleFeedbackRewardAdmin(request:Request,env:Env){
 const actor=await getSessionUser(request,env);if(!actor?.isAdmin)return json({error:actor?'forbidden':'unauthorized'},actor?403:401);
 const path=new URL(request.url).pathname;
 if(request.method==='GET'&&path==='/api/admin/feedback-rewards'){
  const [policy,claims,totals]=await Promise.all([feedbackRewardPolicy(env.DB),env.DB.prepare(`SELECT c.*,u.email,u.name,v.calls,v.valid_days,s.message,r.id reward_id,r.expires_at FROM feedback_reward_claims c JOIN users u ON u.id=c.user_id JOIN feedback_reward_versions v ON v.id=c.version_id LEFT JOIN website_submissions s ON s.id=c.submission_id LEFT JOIN connect_feedback_rewards r ON r.claim_id=c.id ORDER BY CASE c.status WHEN 'pending' THEN 0 ELSE 1 END,c.created_at DESC LIMIT 50`).all(),env.DB.prepare('SELECT grants,granted_calls grantedCalls,spent_calls spentCalls FROM feedback_reward_campaign_usage WHERE id=1').first()]);
  return json({policy,claims:claims.results,totals});
 }
 if(request.method!=='POST')return json({error:'method_not_allowed'},405);
 if(request.headers.get('origin')!==new URL(request.url).origin||request.headers.get('content-type')?.split(';')[0]!=='application/json')return json({error:'invalid_origin_or_type'},403);
 const raw=await request.text();if(raw.length>5000)return json({error:'request_too_large'},413);
 const at=new Date().toISOString();
 try{
  if(path==='/api/admin/feedback-rewards/config'){
   const value=settings.parse(JSON.parse(raw)),id=crypto.randomUUID();
   await env.DB.batch([
    env.DB.prepare(`INSERT INTO feedback_reward_versions SELECT ?1,?2+1,?3,?4,?5,?6,?7,?8,?9 WHERE EXISTS(SELECT 1 FROM feedback_reward_policy WHERE id=1 AND revision=?2)`).bind(id,value.revision,Number(value.enabled),value.calls,value.validDays,value.perUserLimit,value.totalCallsCap,actor.id,at),
    env.DB.prepare('UPDATE feedback_reward_policy SET version_id=?1,revision=revision+1 WHERE id=1 AND revision=?2 AND EXISTS(SELECT 1 FROM feedback_reward_versions WHERE id=?1)').bind(id,value.revision),
   ]);
   const policy=await feedbackRewardPolicy(env.DB);return policy?.id===id?json({policy}):json({error:'reward_policy_changed'},409);
  }
  const match=path.match(/^\/api\/admin\/feedback-rewards\/claims\/([a-f0-9-]{36})\/(approve|reject)$/);if(!match)return json({error:'not_found'},404);
  const claimId=match[1]!,claim=await env.DB.prepare('SELECT * FROM feedback_reward_claims WHERE id=?1').bind(claimId).first<{user_id:string;status:string}>();if(!claim)return json({error:'claim_not_found'},404);
  if(match[2]==='reject'){
   await env.DB.prepare("UPDATE feedback_reward_claims SET status='rejected',reviewed_at=?2,reviewer_id=?3 WHERE id=?1 AND status='pending' AND EXISTS(SELECT 1 FROM users WHERE id=?3 AND role='admin')").bind(claimId,at,actor.id).run();
   const current=await env.DB.prepare('SELECT status FROM feedback_reward_claims WHERE id=?1').bind(claimId).first<{status:string}>();
   return current?.status==='rejected'?json({status:'rejected'}):json({error:'reward_already_granted_or_access_changed'},409);
  }
  const id='feedback:'+claimId;
  await env.DB.batch([
   env.DB.prepare(`INSERT OR IGNORE INTO connect_feedback_rewards(id,claim_id,user_id,granted_calls,starts_at,expires_at,granted_by,created_at)
    SELECT ?1,c.id,c.user_id,v.calls,?3,strftime('%Y-%m-%dT%H:%M:%fZ',?3,'+'||v.valid_days||' days'),?4,?3
    FROM feedback_reward_claims c JOIN feedback_reward_versions v ON v.id=c.version_id,feedback_reward_policy head JOIN feedback_reward_versions active ON active.id=head.version_id
    WHERE c.id=?2 AND c.status='pending' AND active.enabled=1 AND EXISTS(SELECT 1 FROM users WHERE id=?4 AND role='admin')
     AND EXISTS(SELECT 1 FROM website_submissions s WHERE s.id=c.submission_id AND s.user_id=c.user_id AND s.category='feedback' AND s.source NOT IN ('support','enterprise'))
     AND COALESCE((SELECT granted_calls FROM feedback_reward_campaign_usage WHERE id=1),0)+v.calls<=active.total_calls_cap
     AND (SELECT COUNT(*) FROM connect_feedback_rewards WHERE user_id=c.user_id)<MIN(v.per_user_limit,active.per_user_limit)`).bind(id,claimId,at,actor.id),
   env.DB.prepare("UPDATE feedback_reward_claims SET status='granted',reviewed_at=?2,reviewer_id=?3 WHERE id=?1 AND status='pending' AND EXISTS(SELECT 1 FROM connect_feedback_rewards WHERE claim_id=?1)").bind(claimId,at,actor.id),
  ]);
  const reward=await env.DB.prepare('SELECT id,granted_calls calls,expires_at expiresAt FROM connect_feedback_rewards WHERE claim_id=?1').bind(claimId).first();return reward?json({status:'granted',reward}):json({error:'reward_paused_or_limit_reached'},409);
 }catch(error){if(error instanceof z.ZodError||error instanceof SyntaxError)return json({error:'invalid_reward_settings'},400);throw error;}
}
