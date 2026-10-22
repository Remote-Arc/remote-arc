import {handleUserFollowups,type FollowupEnv} from './user-followups.js';
import {handleAdminPayments,type AdminPaymentsEnv} from './admin-payments.js';
import {handleFeedbackRewardAdmin} from './connect-rewards.js';
import { getSessionUser } from "./auth.js";
import {handleArcAdminBilling} from './arc-admin-billing.js';
import { handleAdminBilling, handleAdminCallCredits, handleAdminOperations, type OpsEnv } from "./admin-operations.js";
import { handleAdminPlanGrantRevoke, handleAdminPlanGrants } from "./plan-admin.js";
import {handleAdminDeviceCapacity,handleAdminDeviceCapacityRevoke} from './device-capacity-admin.js';
import { listWebsiteSubmissions, updateWebsiteSubmission, type EngagementEnv } from "./domains/engagement.js";
import { handleMonitorState, type MonitorEnv } from "./monitor.js";

export type AdminServiceEnv = OpsEnv & EngagementEnv & MonitorEnv & FollowupEnv & AdminPaymentsEnv & { ADMIN_ORIGIN?: string; ADMIN_SERVICE_MODE?: string; ADMIN_UI?: { fetch(request: Request): Promise<Response> } };
export const ADMIN_CONTRACT_VERSION = "1";
const methods: Record<string, readonly string[]> = {
  "/api/me": ["GET"], "/api/monitor": ["GET"],
  "/api/admin/operations": ["GET"], "/api/admin/billing": ["GET"],
  '/api/admin/arc-billing':['GET'],
  "/api/admin/call-credits": ["POST"], "/api/admin/plan-grants": ["GET", "POST"],
  "/api/admin/device-capacity": ["GET","POST"],
  "/api/admin/submissions": ["GET"],
};

export function adminApiMethods(path: string): readonly string[] | null {
  if(path==='/api/admin/feedback-rewards')return ['GET'];
  if(path==='/api/admin/feedback-rewards/config'||/^\/api\/admin\/feedback-rewards\/claims\/[a-f0-9-]{36}\/(approve|reject)$/.test(path))return ['POST'];
  if(path==='/api/admin/payments')return ['GET'];
  if(path==='/api/admin/payments/trials')return ['GET'];
  if(path==='/api/admin/payments/funding')return ['POST'];
  if(/^\/api\/admin\/payments\/(config|promotions)\/drafts$/.test(path)||/^\/api\/admin\/payments\/(config|promotions)\/[a-f0-9-]{36}\/(publish|disable)$/.test(path))return ['POST'];
  if(path==='/api/admin/followups')return ['GET'];
  if(path==='/api/admin/followups/drafts')return ['POST'];
  if(/^\/api\/admin\/followups\/[^/]+\/send$/.test(path))return ['POST'];
  if(/^\/api\/admin\/followups\/[^/]+$/.test(path))return ['GET','PATCH'];
  if (Object.hasOwn(methods, path)) return methods[path]!;
  if (/^\/api\/admin\/plan-grants\/[a-zA-Z0-9-]+\/revoke$/.test(path)) return ["POST"];
  if (/^\/api\/admin\/device-capacity\/[a-zA-Z0-9-]+\/revoke$/.test(path)) return ["POST"];
  if (/^\/api\/admin\/submissions\/[a-zA-Z0-9-]+$/.test(path)) return ["PATCH", "DELETE"];
  return null;
}

function finish(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("cache-control", "private, no-store");
  headers.set("x-remote-arc-admin-contract", ADMIN_CONTRACT_VERSION);
  return new Response(response.body, { status: response.status, headers });
}
const failure = (error: string, status: number) => finish(Response.json({ error }, { status }));

// A dedicated named service entrypoint calls this handler. The public relay
// keeps its existing host restriction and can be disabled independently.
export async function handleAdminServiceRequest(request: Request, env: AdminServiceEnv): Promise<Response> {
  const url = new URL(request.url);
  const expectedOrigin = new URL(env.ADMIN_ORIGIN || "https://admin.remotearc.app").origin;
  if (url.origin !== expectedOrigin) return failure("admin_host_required", 404);
  const allowed = adminApiMethods(url.pathname);
  if (!allowed) return failure("not_found", 404);
  if (!allowed.includes(request.method)) return failure("method_not_allowed", 405);
  if (!["GET", "HEAD"].includes(request.method)) {
    if (request.headers.get("origin") !== expectedOrigin) return failure("invalid_origin", 403);
    if (request.headers.get("content-type")?.split(";")[0]?.trim() !== "application/json") return failure("unsupported_media_type", 415);
  }
  // Never accept an actor/role forwarded by the browser or caller. Resolve
  // the real shared session on every operation, including role revocation.
  const user = await getSessionUser(request, env);
  if (!user) return failure("unauthorized", 401);
  if (!user.isAdmin) return failure("forbidden", 403);

  if(url.pathname.startsWith('/api/admin/followups'))return finish(await handleUserFollowups(request,env));
  if(url.pathname.startsWith('/api/admin/payments'))return finish(await handleAdminPayments(request,env));
  if(url.pathname.startsWith('/api/admin/feedback-rewards'))return finish(await handleFeedbackRewardAdmin(request,env));
  let response: Response;
  switch (url.pathname) {
    case "/api/me": response = Response.json({ authenticated: true, user }); break;
    case "/api/monitor": response = await handleMonitorState(request, env); break;
    case "/api/admin/operations": response = await handleAdminOperations(request, env); break;
    case "/api/admin/billing": response = await handleAdminBilling(request, env); break;
    case '/api/admin/arc-billing': response = await handleArcAdminBilling(request,env);break;
    case "/api/admin/call-credits": response = await handleAdminCallCredits(request, env); break;
    case "/api/admin/plan-grants": response = await handleAdminPlanGrants(request, env); break;
    case "/api/admin/device-capacity": response = await handleAdminDeviceCapacity(request, env); break;
    case "/api/admin/submissions": response = await listWebsiteSubmissions(request, env); break;
    default: {
      const revoke = url.pathname.match(/^\/api\/admin\/plan-grants\/([a-zA-Z0-9-]+)\/revoke$/);
      const capacityRevoke=url.pathname.match(/^\/api\/admin\/device-capacity\/([a-zA-Z0-9-]+)\/revoke$/);
      response = capacityRevoke ? await handleAdminDeviceCapacityRevoke(request,env,capacityRevoke[1]!)
        : revoke ? await handleAdminPlanGrantRevoke(request, env, revoke[1]!)
        : await updateWebsiteSubmission(request, env, url.pathname.split("/").at(-1)!);
    }
  }
  return finish(response);
}

export async function publicAdminResponse(request: Request, env: AdminServiceEnv): Promise<Response | null> {
  if (env.ADMIN_SERVICE_MODE === undefined || env.ADMIN_SERVICE_MODE === "legacy") return null;
  if (env.ADMIN_SERVICE_MODE !== "external") return failure("invalid_admin_service_mode", 503);
  if (!env.ADMIN_UI) return failure("admin_ui_binding_missing", 503);
  try { return finish(await env.ADMIN_UI.fetch(request)); }
  catch { return failure("admin_ui_unavailable", 503); }
}
