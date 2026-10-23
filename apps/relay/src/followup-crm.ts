import type {FollowupEnv} from './followup-common.js';
import {stamp} from './followup-common.js';
import {followupEmailSender} from './email-sender.js';
export async function listFollowupPeople(env:FollowupEnv,url:URL,selection=false){
 const segment=url.searchParams.get('segment')||'all',tab=url.searchParams.get('tab')||'all',query=(url.searchParams.get('query')||'').slice(0,100),page=Math.min(500,Math.max(0,Number(url.searchParams.get('page')||0)|0));
 const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'cache-control':'private, no-store'}});
 if(!['all','unconnected','device-only','unused','active','due','suppressed'].includes(segment)||!['all','pending','contacted','waiting','resolved','suppressed'].includes(tab))return json({error:'invalid_segment'},400);
 const cte=`WITH people AS (SELECT u.id,u.email,u.name,u.created_at,c.status,c.note,c.next_followup_at,c.consent_at,c.consent_note,c.suppressed_at,
    (SELECT COUNT(*) FROM user_followup_batch_recipients r JOIN user_followup_batches b ON b.id=r.batch_id WHERE r.user_id=u.id AND b.status='queued' AND r.status IN ('pending','processing')) queued_followups,
    (SELECT COUNT(*) FROM devices d WHERE d.user_id=u.id AND d.revoked_at IS NULL) devices,
    (SELECT COUNT(*) FROM app_connections a WHERE a.user_id=u.id AND a.status='active') apps,
    (SELECT COUNT(DISTINCT COALESCE(t.grant_id,t.access_token_hash)) FROM oauth_tokens t WHERE t.user_id=u.id AND t.revoked_at IS NULL AND (t.expires_at>?3 OR t.refresh_expires_at>?3)) mcp_connections,
    COALESCE((SELECT SUM(tool_calls) FROM user_monthly_usage m WHERE m.user_id=u.id),0) calls,
    (SELECT COUNT(*) FROM arc_chat_runs r WHERE r.user_id=u.id) arc_runs,
    (SELECT MAX(sent_at) FROM user_followup_messages m WHERE m.user_id=u.id AND m.status='sent') last_contact_at,
    (SELECT COUNT(*) FROM website_submissions s WHERE lower(s.email)=lower(u.email) AND s.source IN (SELECT 'followup:'||id FROM user_followup_messages m WHERE m.user_id=u.id)) feedback_count
    FROM users u LEFT JOIN user_followup_contacts c ON c.user_id=u.id)`;
 const base=`(email LIKE ?1 OR COALESCE(name,'') LIKE ?1) AND (?2='all' OR (?2='unconnected' AND devices=0 AND apps=0) OR (?2='device-only' AND devices>0 AND mcp_connections=0 AND suppressed_at IS NULL) OR (?2='unused' AND calls=0 AND arc_runs=0) OR (?2='active' AND (calls>0 OR arc_runs>0)) OR (?2='due' AND next_followup_at<=?3 AND suppressed_at IS NULL) OR (?2='suppressed' AND suppressed_at IS NOT NULL))`;
 const pending=`suppressed_at IS NULL AND COALESCE(status,'new')<>'resolved' AND (COALESCE(status,'new')='new' OR next_followup_at<=?3)`;
 const followed=`suppressed_at IS NULL AND (last_contact_at IS NOT NULL OR status IN ('contacted','waiting'))`;
 const filter=`(?4='all' OR (?4='pending' AND (${pending})) OR (?4='contacted' AND (${followed})) OR (?4='waiting' AND status='waiting' AND suppressed_at IS NULL) OR (?4='resolved' AND status='resolved' AND suppressed_at IS NULL) OR (?4='suppressed' AND suppressed_at IS NOT NULL))`;
 const orders:Record<string,string>={recent:'created_at DESC',name:'COALESCE(name,email) COLLATE NOCASE,last_contact_at DESC','last-contact':'last_contact_at DESC,created_at DESC',due:`CASE WHEN next_followup_at<=?3 THEN 0 WHEN last_contact_at IS NULL THEN 1 ELSE 2 END,next_followup_at IS NULL,next_followup_at,created_at DESC`};
 const order=orders[url.searchParams.get('sort')||'due']||orders.due,args=['%'+query+'%',segment,stamp(),tab];
 const count=await env.DB.prepare(cte+` SELECT COUNT(*) count FROM people WHERE ${base} AND ${filter}`).bind(...args).first<{count:number}>();
 if(selection){const rows=await env.DB.prepare(cte+` SELECT id FROM people WHERE ${base} AND ${filter} ORDER BY ${order} LIMIT 100`).bind(...args).all<{id:string}>();return json({ids:rows.results.map(row=>row.id),total:count?.count||0,limit:100});}
 const [rows,counts]=await Promise.all([
  env.DB.prepare(cte+` SELECT * FROM people WHERE ${base} AND ${filter} ORDER BY ${order} LIMIT 30 OFFSET ?5`).bind(...args,page*30).all(),
  env.DB.prepare(cte+` SELECT COUNT(*) 'all',COALESCE(SUM(${pending}),0) pending,COALESCE(SUM(${followed}),0) contacted,COALESCE(SUM(status='waiting' AND suppressed_at IS NULL),0) waiting,COALESCE(SUM(status='resolved' AND suppressed_at IS NULL),0) resolved,COALESCE(SUM(suppressed_at IS NOT NULL),0) suppressed,COALESCE(SUM(next_followup_at<=?3 AND suppressed_at IS NULL AND COALESCE(status,'new')<>'resolved'),0) due FROM people WHERE ${base}`).bind(...args.slice(0,3)).first()
 ]);
 return json({items:rows.results,total:count?.count||0,page,pageSize:30,counts,emailConfigured:Boolean(followupEmailSender(env))});
}
