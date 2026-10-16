import { getSessionUser } from "./auth.js";

export interface LeadsEnv { DB: D1Database; PUBLIC_ORIGIN: string; APP_ORIGIN?: string; }
export type InterestKind = "early_access" | "feedback";
export const LEAD_KINDS = ["early_access", "feedback"] as const;
export const LEAD_STATUSES = ["new", "reviewed", "contacted", "closed"] as const;

const noStore = { "cache-control": "private, no-store", "x-content-type-options": "nosniff" };
const failure = (code: string, status: number) => Response.json({ error: code }, { status, headers: noStore });
const validEmail = (value: string) => /^[^\s@]{1,64}@[^\s@]{1,253}\.[^\s@]{2,}$/.test(value);
const readString = (input: unknown, max: number) => typeof input === "string" ? input.trim().slice(0,max+1) : "";
const allowedHost = (host: string) => host === "remotearc.app" || host === "www.remotearc.app" || /^pr-\d+-remote-arc-ui-preview\.nzp\.workers\.dev$/.test(host) || host === "localhost" || host === "127.0.0.1";

/** Explicit public intake: strict Origin, small payload, honeypot, bounded fields, no auto-email subscription. */
export async function submitArcInterest(request: Request, env: LeadsEnv): Promise<Response> {
  if(request.method !== "POST") return failure("method_not_allowed",405);
  const url=new URL(request.url);
  if(!allowedHost(url.hostname)) return failure("forbidden_host",403);
  if(request.headers.get("origin") !== url.origin) return failure("origin_mismatch",403);
  if(!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return failure("content_type",415);
  const size=Number(request.headers.get("content-length")||0);
  if(size>6000) return failure("payload_too_large",413);
  // Bound the actual payload even if a client omits or lies about Content-Length.
  if(request.body && request.body.locked) return failure("invalid_payload",400);
  let payload: Record<string,unknown>;
  try {
    const raw=await request.text();
    if(new TextEncoder().encode(raw).byteLength>6000) return failure("payload_too_large",413);
    payload=JSON.parse(raw) as Record<string,unknown>;
  } catch { return failure("invalid_json",400); }
  if(!payload || typeof payload !== "object" || Array.isArray(payload)) return failure("invalid_payload",400);
  if(readString(payload.website,256)) return Response.json({ ok:true },{status:202,headers:noStore});
  const kind=readString(payload.kind,20) as InterestKind;
  const email=readString(payload.email,255).toLowerCase();
  const name=readString(payload.name,100);
  const company=readString(payload.company,120);
  const message=readString(payload.message,2000);
  const locale=payload.locale === "zh"?"zh":"en";
  const source=payload.source === "roadmap"?"roadmap":payload.source==="home"?"home":"arc";
  if(!LEAD_KINDS.includes(kind)||!validEmail(email)||name.length>100||company.length>120||message.length<8||message.length>2000) return failure("validation",400);
  const now=new Date().toISOString();
  const id=crypto.randomUUID();
  await env.DB.prepare("INSERT INTO arc_interest_leads (id,kind,email,name,company,message,locale,source,status,created_at,updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,'new',?9,?9)")
    .bind(id,kind,email,name||null,company||null,message,locale,source,now).run();
  return Response.json({ok:true},{status:201,headers:noStore});
}

/** Admin service boundary: only authenticated admins can inspect or change lead state. */
export async function adminArcInterest(request: Request, env: LeadsEnv): Promise<Response> {
  const session=await getSessionUser(request,env);
  if(!session) return failure("unauthorized",401);
  if(!session.isAdmin) return failure("forbidden",403);
  const url=new URL(request.url);
  if(request.method==="GET"){
    const cursor=Math.max(0,Math.min(10000,Number(url.searchParams.get("page")||"0")||0));
    const status=url.searchParams.get("status");
    if(status && !LEAD_STATUSES.includes(status as typeof LEAD_STATUSES[number])) return failure("validation",400);
    const where=status?" WHERE status=?1":"";
    const countSql="SELECT COUNT(*) AS total FROM arc_interest_leads"+where;
    const dataSql="SELECT id,kind,email,name,company,message,locale,source,status,created_at,updated_at FROM arc_interest_leads"+where+" ORDER BY created_at DESC LIMIT 30 OFFSET "+Math.floor(cursor)*30;
    const [total,items]=await Promise.all([
      (status?env.DB.prepare(countSql).bind(status):env.DB.prepare(countSql)).first<{total:number}>(),
      (status?env.DB.prepare(dataSql).bind(status):env.DB.prepare(dataSql)).all()
    ]);
    return Response.json({total:total?.total||0,page:cursor,items:items.results||[]},{headers:noStore});
  }
  if(request.method==="PATCH"){
    if(request.headers.get("origin")!==url.origin) return failure("origin_mismatch",403);
    let body:{id?:unknown;status?:unknown};
    try{body=await request.json() as {id?:unknown;status?:unknown};}catch{return failure("invalid_json",400);}
    if(typeof body.id!=="string"||!/^[0-9a-f-]{36}$/.test(body.id)||!LEAD_STATUSES.includes(body.status as typeof LEAD_STATUSES[number]))return failure("validation",400);
    const result=await env.DB.prepare("UPDATE arc_interest_leads SET status=?1,updated_at=?2 WHERE id=?3").bind(body.status,new Date().toISOString(),body.id).run();
    if(!result.meta.changes)return failure("not_found",404);
    return Response.json({ok:true},{headers:noStore});
  }
  return failure("method_not_allowed",405);
}
