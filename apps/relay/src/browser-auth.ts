import {getSessionUser} from "./auth.js";
import {writeAudit} from "./audit.js";
import {isTrustedDashboardMutation} from "./dashboard-origin.js";

export type BrowserAuthPermissions = {otp:boolean;captcha:boolean;origins:string[];mailbox:string};
export const NO_BROWSER_AUTH: BrowserAuthPermissions = {otp:false,captcha:false,origins:[],mailbox:""};
type Env = Parameters<typeof getSessionUser>[1];
export function parseBrowserAuth(raw:unknown):BrowserAuthPermissions {
  try {
    const v = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!v || typeof v !== "object" || typeof v.otp !== "boolean" || typeof v.captcha !== "boolean" ||
        !Array.isArray(v.origins) || v.origins.length > 20 || typeof v.mailbox !== "string" || v.mailbox.length > 254) throw Error();
    const origins = [...new Set<string>(v.origins.map((origin:unknown) => {
      if (typeof origin !== "string" || origin.length > 260) throw Error();
      const u = new URL(origin);
      if (u.username || u.password || u.search || u.hash || u.hostname.includes("*") || u.pathname !== "/" ||
          (u.protocol !== "https:" && !(u.protocol === "http:" && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(u.hostname)))) throw Error();
      return u.origin;
    }))];
    const mailbox = v.mailbox.trim().toLowerCase();
    if (mailbox && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mailbox)) throw Error();
    if ((v.otp || v.captcha) && !origins.length) throw Error();
    return {otp:v.otp,captcha:v.captcha,origins,mailbox};
  } catch { return {...NO_BROWSER_AUTH,origins:[]}; }
}
export async function browserAuthForDevice(env:Pick<Env,"DB">,userId:string,deviceId:string) {
  try {
    const row = await env.DB.prepare("SELECT browser_auth_permissions FROM devices WHERE id=?1 AND user_id=?2 AND revoked_at IS NULL")
      .bind(deviceId,userId).first<{browser_auth_permissions:string}>();
    return parseBrowserAuth(row?.browser_auth_permissions);
  } catch (error) {
    if (!/no such column:\s*browser_auth_permissions/i.test(String(error))) throw error;
    return {...NO_BROWSER_AUTH,origins:[]};
  }
}
export async function handleBrowserAuth(request:Request,env:Env) {
  const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{"cache-control":"no-store"}});
  const user=await getSessionUser(request,env);
  if(!user)return json({error:"unauthorized"},401);
  const deviceId=new URL(request.url).pathname.split("/")[3] || "";
  const owned=await env.DB.prepare("SELECT id,platform FROM devices WHERE id=?1 AND user_id=?2 AND revoked_at IS NULL").bind(deviceId,user.id).first<{id:string;platform:string}>();
  if(!owned)return json({error:"device_not_found"},404);
  if(request.method==="GET")return json(await browserAuthForDevice(env,user.id,deviceId));
  if(request.method!=="POST")return json({error:"method_not_allowed"},405);
  if(!isTrustedDashboardMutation(request,env))return json({error:"same_origin_required"},403);
  const input=await request.json().catch(()=>null) as BrowserAuthPermissions|null;
  const value=parseBrowserAuth(input);
  if(!input || Object.keys(input).some(k=>!["otp","captcha","origins","mailbox"].includes(k)) ||
      typeof input.otp!=="boolean" || typeof input.captcha!=="boolean" ||
      (input.otp!==value.otp || input.captcha!==value.captcha) ||
      !Array.isArray(input.origins) || input.origins.length!==value.origins.length ||
      typeof input.mailbox!=="string" || (input.mailbox.trim() && !value.mailbox)) {
    return json({error:"Provide valid exact website origins, OTP/CAPTCHA choices and an optional email address."},400);
  }
  if(owned.platform==="browser" && value.captcha)return json({error:"Use Browser Runner on a linked computer for CAPTCHA authorization."},400);
  const result=await env.DB.prepare("UPDATE devices SET browser_auth_permissions=?1 WHERE id=?2 AND user_id=?3 AND revoked_at IS NULL")
    .bind(JSON.stringify(value),deviceId,user.id).run();
  if(!result.meta.changes)return json({error:"device_not_found"},404);
  await writeAudit(env,{userId:user.id,deviceId,eventType:"device.browser_auth_updated",outcome:JSON.stringify(value)});
  return json(value);
}
