import { getSessionUser } from "../auth.js";
import {createFeedbackRewardClaim} from '../connect-rewards.js';

export type EngagementEnv = {
  DB: D1Database;
  REGISTRY: DurableObjectNamespace;
  PUBLIC_ORIGIN: string;
  APP_ORIGIN?: string;
  MARKETING_ORIGIN?: string;
  ENGAGEMENT_RATE_LIMITER?: { limit(input: { key: string }): Promise<{ success: boolean }> };
};
type Category = "early_access" | "feedback";
type SubmissionInput = {category:Category;email:string;name:string;message:string;source:string;website:string;consent:boolean};

const noStore = { "cache-control": "private, no-store", "x-content-type-options": "nosniff" };
const error = (code: string, status: number) => Response.json({ error: code }, { status, headers: noStore });

export function validateSubmission(input: unknown): SubmissionInput | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const p = input as Record<string,unknown>;
  const category = p.category;
  const email = typeof p.email === "string" ? p.email.trim().toLowerCase() : "";
  const name = typeof p.name === "string" ? p.name.trim() : "";
  const message = typeof p.message === "string" ? p.message.trim() : "";
  const source = typeof p.source === "string" ? p.source.trim() : "website";
  const website = typeof p.website === "string" ? p.website : "";
  if (category !== "early_access" && category !== "feedback") return null;
  if (p.consent !== true || website.length > 0 || name.length > 100 ||
    source.length > 64 || !/^[a-z0-9_:/.-]+$/i.test(source) ||
    !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email) || email.length > 254 ||
    message.length < 10 || message.length > 3000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(message)) return null;
  return {category,email,name,message,source,website,consent:true};
}

/**
 * Ingress boundary. No identity data or raw IPs recorded. Requires explicit contact consent.
 * Cloudflare rate limits enforce a platform cost bound before any D1 insert.
 */
export async function submitWebsiteInterest(request: Request, env: EngagementEnv): Promise<Response> {
  if (request.method !== "POST") return error("method_not_allowed",405);
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) return error("invalid_origin",403);
  const type = request.headers.get("content-type")?.split(";")[0]?.trim();
  if (type !== "application/json") return error("unsupported_media_type",415);
  const ip = request.headers.get("cf-connecting-ip");
  // Avoid uncontrolled writes if the dedicated platform protection is absent.
  if (!env.ENGAGEMENT_RATE_LIMITER) return error("temporarily_unavailable",503);
  const {success} = await env.ENGAGEMENT_RATE_LIMITER.limit({key:"website-form:" + (ip || "anonymous")});
  if (!success) return Response.json({error:"rate_limited"}, {status:429,headers:{...noStore,"retry-after":"60"}});
  const raw = await request.text();
  if (raw.length > 7500) return error("payload_too_large",413);
  let parsed:unknown;
  try { parsed=JSON.parse(raw); } catch { return error("invalid_json",400); }
  const value=validateSubmission(parsed);
  if (!value) return error("invalid_submission",400);
  const metadata=parsed as Record<string,unknown>,requestId=metadata.requestId===undefined?crypto.randomUUID():String(metadata.requestId),rewardVersionId=typeof metadata.rewardVersionId==='string'?metadata.rewardVersionId:'';
  if(!/^[a-f0-9-]{36}$/i.test(requestId)||rewardVersionId.length>160)return error('invalid_request_id',400);
  const account=rewardVersionId&&value.category==='feedback'?await getSessionUser(request,env):null;
  const rewardUser=account&&account.email.toLowerCase()===value.email?account:null;
  const now = new Date().toISOString();
  try {
    await env.DB.prepare(`INSERT INTO website_submissions
      (id, category, email, name, message, source, consent_at, status, created_at, updated_at,user_id)
      VALUES (?1,?2,?3,?4,?5,?6,?7,'new',?7,?7,?8) ON CONFLICT DO NOTHING`)
      .bind(requestId,value.category,value.email,value.name,value.message,value.source,now,rewardUser?.id??null).run();
  } catch(e) {
    if (/no such table/i.test(String(e))) return error("service_not_ready",503);
    throw e;
  }
  // Same response for first-time and duplicate early access addresses.
  let reward:unknown=null;
  if(rewardVersionId){
    const saved=await env.DB.prepare('SELECT user_id,email,message,source FROM website_submissions WHERE id=?1').bind(requestId).first<{user_id:string|null;email:string;message:string;source:string}>();
    if(!rewardUser)reward={status:'sign_in_required'};
    else if(!saved||saved.user_id!==rewardUser.id||saved.email!==value.email||saved.message!==value.message||saved.source!==value.source)return error('submission_id_conflict',409);
    else reward=await createFeedbackRewardClaim(env.DB,requestId,rewardUser.id,rewardVersionId,now)||{status:'terms_changed_or_limit_reached'};
  }
  return Response.json({ok:true,...(reward?{reward}:{})}, {status:201,headers:noStore});
}

async function admin(request:Request,env:EngagementEnv) {
  const user=await getSessionUser(request,env);
  if(!user) return {failed:error("unauthorized",401)};
  if(!user.isAdmin) return {failed:error("forbidden",403)};
  return {user};
}
export async function listWebsiteSubmissions(request:Request,env:EngagementEnv):Promise<Response> {
  if(request.method!=="GET") return error("method_not_allowed",405);
  const auth=await admin(request,env);if(auth.failed)return auth.failed;
  const url=new URL(request.url);
  const page=Math.min(200,Math.max(0,Number(url.searchParams.get("page")||0)|0));
  const filter=url.searchParams.get("category")||"all";
  if(!["all","early_access","feedback"].includes(filter))return error("invalid_category",400);
  const category=filter==="all"?null:filter;
  try {
    const [rows,total,byCategory] = await Promise.all([
      env.DB.prepare(`SELECT id,category,email,name,message,source,status,consent_at,created_at,updated_at
        FROM website_submissions WHERE (?1 IS NULL OR category=?1)
        ORDER BY created_at DESC LIMIT 40 OFFSET ?2`).bind(category,page*40).all(),
      env.DB.prepare(`SELECT COUNT(*) AS count FROM website_submissions WHERE (?1 IS NULL OR category=?1)`).bind(category).first<{count:number}>(),
      env.DB.prepare(`SELECT category, COUNT(*) AS count FROM website_submissions GROUP BY category`).all<{category:Category,count:number}>(),
    ]);
    return Response.json({page,pageSize:40,total:total?.count||0,counts:byCategory.results||[],items:rows.results||[]},{headers:noStore});
  } catch(e) {
    if(/no such table/i.test(String(e)))return error("service_not_ready",503);
    throw e;
  }
}
export async function updateWebsiteSubmission(request:Request,env:EngagementEnv,id:string):Promise<Response> {
  if(request.method!=="PATCH" && request.method!=="DELETE") return error("method_not_allowed",405);
  const auth=await admin(request,env);if(auth.failed)return auth.failed;
  if(request.headers.get("origin")!==new URL(request.url).origin)return error("invalid_origin",403);
  if(!/^[0-9a-f-]{36}$/i.test(id)) return error("invalid_id",400);
  try {
    if(request.method==="DELETE"){
      const deleted=await env.DB.prepare("DELETE FROM website_submissions WHERE id=?1").bind(id).run();
      return Response.json({ok:true,deleted:Boolean(deleted.meta.changes)},{headers:noStore});
    }
    const body=await request.json().catch(()=>null) as {status?:unknown}|null;
    if(!body || !["new","reviewed","contacted","archived"].includes(String(body.status)))return error("invalid_status",400);
    const updated=await env.DB.prepare("UPDATE website_submissions SET status=?1,updated_at=?2 WHERE id=?3")
      .bind(body.status,new Date().toISOString(),id).run();
    return Response.json({ok:true,updated:Boolean(updated.meta.changes)},{headers:noStore});
  } catch(e) {
    if(/no such table/i.test(String(e)))return error("service_not_ready",503);
    throw e;
  }
}
