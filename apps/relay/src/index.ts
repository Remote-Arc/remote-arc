import {serveDemoMedia} from './demo-media.js';
import { handleRunnerRequest } from "./runner-attention.js";
import { diagnosticError } from "./diagnostics.js";
import {handleFollowupUnsubscribe} from './user-followups.js';
import {runFollowupBatches} from './followup-batches.js';
import {handleSlackEvents} from './slack-bot-events.js';
import {handleSlackBotAccount} from './slack-bot-install.js';
import {runSlackJobs} from './slack-bot-jobs.js';
import {ensureOperatorAllowance} from './operator-allowance.js';
import {publicFeedbackReward} from './connect-rewards.js';
import { handleAdminServiceRequest, publicAdminResponse } from "./admin-service.js";
export { AdminApiService } from "./admin-entrypoint.js";
import cliPackage from "../../../packages/cli/package.json" with { type: "json" };
import { handleApps } from "./apps.js";
import {handleArcTeams} from './arc-teams.js';
import {handleArcRooms} from './arc-team-rooms.js';
import { handleArcChat, type ArcEnv } from "./arc-chat.js";
import {handleBilling,type BillingEnv} from './stripe-billing.js';
import {arcDeploymentReady} from './arc-chat-model.js';
import {billingEnabled} from './platform-launch.js';
import {stripeConfigured} from './stripe-client.js';
import {commercialCatalog} from './arc-commercial-config.js';
import {purgeDeletedArcContent} from './arc-retention.js';
export { ArcChatRuntime } from "./arc-chat-object.js";
import type { AppEnv } from "./app-catalog.js";
import { handleDeviceTaskSettings } from "./device-task-settings.js";
import { handleTaskEventRpc, type TaskEventEnv } from "./task-events.js";
import { runScheduledTasks } from "./task-scheduler.js";
import { DeviceRegistry } from "./registry.js";
import { canonicalForPath, feedXml, llmsFullTxt, llmsTxt, marketingHttpsRedirect, marketingStatusCode, renderMarketingHtml, robotsTxt, sitemapXml } from "./seo.js";
import { legacyLanguageRedirect } from "./marketing-locale.js";
import { createRemoteLinkMcp } from "./mcp.js";
import { handleCloudSkills, handleCloudSkillAction } from "./cloud-skills.js";
import { callDevice } from "./device-call.js";
import { consumeToolCall } from "./usage.js";
import {
  authenticateDevice,
  authenticateMcp,
  getSessionUser,
  handleGoogleCallback,
  handleGoogleLogin,
  handleLogout,
} from "./auth.js";
import { handleLoginPage, handleReviewerLogin } from "./reviewer.js";
import { handleEmailCodeRequest, handleEmailCodeVerify } from "./email-auth.js";
import { dashboardSignInUrl, legacyDashboardRedirect, protocolOnlyPath, publicWebsiteRedirect } from "./host-routing.js";
import {
  getDevicesForUser,
  handleDeviceList,
  handleDeviceRevoke,
  handleDeviceRename,
  handleDeviceStart,
  handleDeviceToken,
  handleDeviceToolsUpdate,
  handleDevicePolicyUpdate,
  handleDeviceUndoList,
  handleDeviceUndoAction,
  handleDeviceDirectoryBrowse,
  handleDeviceBackgroundUpdate,
  handleDeviceRuntimeUpdate,
  handleDeviceExecutionLog,
  handleDeviceManagedProcesses,
  handleDeviceManagedProcessOutput,
  handleDeviceManagedProcessStop,
  handlePairingApprove,
  handlePairingLookup,
} from "./device.js";
import { readAudit } from "./audit.js";
import { archiveOldAudit } from "./audit-archive.js";
import { recordMcpTelemetry } from "./relay-telemetry.js";
import { limitMcpIngress } from "./mcp-edge-guard.js";
import { getMonthlyUsage } from "./usage.js";
import { getAccountEntitlements } from "./entitlements.js";
import { getMonthlyPlusUsage } from "./plus-usage.js";
import { handleMarketplaceWebhook } from "./github-marketplace.js";
import { handleFileResource } from "./file-resources.js";
import { handleAdminPlanGrantRevoke, handleAdminPlanGrants } from "./plan-admin.js";
import {handleAdminDeviceCapacity,handleAdminDeviceCapacityRevoke} from './device-capacity-admin.js';
import { handleAdminOperations, handleAdminCallCredits, handleAdminBilling } from "./admin-operations.js";
import { handleOrganizations } from "./organizations.js";
import { submitWebsiteInterest, listWebsiteSubmissions, updateWebsiteSubmission } from "./domains/engagement.js";
import {
  handleAutomationCollection,
  handleAutomationItem,
  handleAutomationWebhook,
  runAutomationTick,
} from "./automations.js";
import {
  handleGrantRevoke,
  handleMcpPause,
  handleSecurityState,
  isMcpPaused,
} from "./security.js";
import {
  handleApprovalDecision,
  handleApprovalList,
  handlePersistentApprovalList,
  handlePersistentApprovalRevoke,
  handleDeviceApprovalDecision,
  handleDeviceApprovalList,
  runApprovalMaintenance,
} from "./approvals.js";
import {
  handleMonitorState,
  incidentFromRequest,
  recordServiceIncident,
  runSyntheticMonitor,
} from "./monitor.js";
import {
  authorizationServerMetadata,
  handleDynamicClientRegistration,
  handleOAuthAuthorize,
  handleOAuthDecision,
  handleOAuthToken,
  mcpUnauthorized,
  protectedResourceMetadata,
} from "./oauth.js";

export { DeviceRegistry };

type Env = TaskEventEnv & AppEnv & ArcEnv & BillingEnv & {
  DB: D1Database;
  REGISTRY: DurableObjectNamespace;
  ASSETS: Fetcher;
  PUBLIC_MEDIA?: R2Bucket;
  PUBLIC_ORIGIN: string;
  DEPLOYMENT_SHA?: string;
  APP_ORIGIN?: string;
  DASHBOARD_ORIGIN?: string;
  MARKETING_ORIGIN?: string;
  ADMIN_ORIGIN?: string;
  ADMIN_SERVICE_MODE?: string;
  ADMIN_UI?: Fetcher;
  ENGAGEMENT_RATE_LIMITER?: { limit(input: { key: string }): Promise<{success: boolean}> };
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GOOGLE_NEXT_CLIENT_ID?: string;
  GOOGLE_NEXT_CLIENT_SECRET?: string;
  ALLOWED_EMAILS?: string;
  ALLOW_SIGNUPS?: string;
  RESEND_API_KEY?: string;
  EMAIL_AUTH_SECRET?: string;
  EMAIL_FROM?: string;
  MONTHLY_TOOL_CALL_LIMIT?: string;
  FREE_MONTHLY_TOOL_CALL_LIMIT?: string;
  AUDIT_ARCHIVE?: R2Bucket;
  AUDIT_ARCHIVE_ENABLED?: string;
  AUDIT_RETENTION_DAYS?: string;
  MCP_ANALYTICS?: AnalyticsEngineDataset;
  MCP_METRICS_SAMPLE_RATE?: string;
  OPENAI_APPS_CHALLENGE?: string;
  REVIEWER_EMAIL?: string;
  REVIEWER_PASSWORD_SHA256?: string;
  REVIEWER_DEMO_DEVICE_ID?: string;
  GITHUB_MARKETPLACE_WEBHOOK_SECRET?: string;
  EMAIL?: {
    send(message: {
      to?: string;
      from: string;
      subject: string;
      text?: string;
      html?: string;
    }): Promise<unknown>;
  };
  ALERT_EMAIL?: string;
  ALERT_FROM_EMAIL?: string;
  MCP_RATE_LIMITER: { limit(input: { key: string }): Promise<{ success: boolean }> };
  MCP_EDGE_RATE_LIMITER?: { limit(input: { key: string }): Promise<{ success: boolean }> };
  MCP_ANON_RATE_LIMITER?: { limit(input: { key: string }): Promise<{ success: boolean }> };
  INCIDENT_RATE_LIMITER?: { limit(input: { key: string }): Promise<{ success: boolean }> };
  AUTH_RATE_LIMITER: { limit(input: { key: string }): Promise<{ success: boolean }> };
  EMAIL_RATE_LIMITER: { limit(input: { key: string }): Promise<{ success: boolean }> };
};

function withTrustedDeviceHeaders(
  request: Request,
  identity: {
    id: string;
    user_id: string;
  },
) {
  const headers = new Headers(request.headers);
  headers.set("x-remote-link-user-id", identity.user_id);
  headers.set("x-remote-link-device-id", identity.id);
  return new Request(request, { headers });
}

async function handleFetch(request: Request, env: Env, ctx?: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    const marketingOrigin = env.MARKETING_ORIGIN || "https://remotearc.app";
    const appOrigin = env.APP_ORIGIN || env.PUBLIC_ORIGIN;
    const dashboardOrigin = env.DASHBOARD_ORIGIN || appOrigin;
    const adminOrigin = env.ADMIN_ORIGIN || "https://admin.remotearc.app";
    const isAdminHost = url.hostname === new URL(adminOrigin).hostname;

    // Explicit host partition. It can later be extracted into a dedicated Worker
    // without changing the public API contracts or frontend route boundaries.
    if (isAdminHost) {
      const disabled = await publicAdminResponse(request, env);
      if (disabled) return disabled;
      const staticAsset = /^\/(?:assets|fonts)\//.test(url.pathname) ||
        /^\/(?:remote-arc(?:-app-icon)?[.]svg|remote-arc-(?:180|192|512)[.]png|favicon[.]ico|(?:admin|manifest)[.]webmanifest|sw[.]js|offline[.]html)$/.test(url.pathname);
      const adminApi = url.pathname === "/api/me" || url.pathname === "/api/monitor" ||
        url.pathname.startsWith("/api/admin/");
      if (adminApi) return handleAdminServiceRequest(request, env, ctx);
      const document = url.pathname === "/" || url.pathname === "/overview";
      if (!adminApi && !staticAsset && !document) {
        return request.method === "GET" || request.method === "HEAD"
          ? Response.redirect(adminOrigin + "/", 302)
          : Response.json({error:"not_found"},{status:404});
      }
      if (document && (request.method === "GET" || request.method === "HEAD")) {
        const session = await getSessionUser(request,env);
        if (!session) {
          const login = new URL("/auth/login", dashboardOrigin);
          login.searchParams.set("return_to",adminOrigin + "/");
          return Response.redirect(login.toString(),302);
        }
        if (!session.isAdmin) return new Response("Forbidden", {status:403,headers:{"cache-control":"no-store","x-robots-tag":"noindex"}});
      }
    } else if (url.pathname.startsWith("/api/admin/") || url.pathname === "/api/monitor") {
      // Admin data and mutation endpoints never run on public/consumer hosts.
      return Response.json({error:"admin_host_required"},{status:404,headers:{"cache-control":"no-store"}});
    }
    if (!isAdminHost && url.pathname === "/monitor" && (request.method === "GET" || request.method === "HEAD")) {
      return Response.redirect(adminOrigin + "/",302);
    }


    // Serve one canonical public URL; do not alter HTTPS MCP or dashboard calls.
    const httpsCanonical = marketingHttpsRedirect(url);
    if (httpsCanonical) return Response.redirect(httpsCanonical, 301);

    if(url.pathname.startsWith('/media/demo-gallery/')){
      if(url.origin!==new URL(marketingOrigin).origin)return new Response('Not found',{status:404});
      return serveDemoMedia(request,env.PUBLIC_MEDIA);
    }

    if(url.pathname==='/email/follow-up/unsubscribe'&&url.origin===new URL(marketingOrigin).origin)return handleFollowupUnsubscribe(request,env);

    if(url.pathname==='/api/slack/events'){
      if(url.origin!==new URL(env.PUBLIC_ORIGIN).origin||request.method!=='POST')return Response.json({error:'not_found'},{status:404});
      return handleSlackEvents(request,env,ctx);
    }
    if(url.pathname.startsWith('/api/slack/')||url.pathname==='/slack/link'){
      const response=await handleSlackBotAccount(request,env);
      if(request.method==='POST'&&response.ok)ctx?.waitUntil(runSlackJobs(env,{limit:1}));
      return response;
    }

    const authSensitive =
      url.pathname === "/oauth/register" ||
      url.pathname === "/oauth/authorize" ||
      url.pathname === "/oauth/decision" ||
      url.pathname === "/oauth/token" ||
      url.pathname === "/auth/reviewer" ||
      url.pathname === "/auth/email/request" ||
      url.pathname === "/auth/email/verify" ||
      url.pathname === "/api/device/start" ||
      url.pathname === "/api/device/token" ||
      url.pathname === "/api/pairing/approve";

    if (authSensitive) {
      // Use Cloudflare's trusted visitor IP for pre-auth protection.
      // Querystring client_id is attacker-controlled: never use it as the
      // primary rate-limit identity for login, OAuth or device pairing.
      const actor =
        request.headers.get("cf-connecting-ip") ||
        request.headers.get("user-agent") ||
        "anonymous";
      const { success } = await env.AUTH_RATE_LIMITER.limit({
        key: url.pathname + ":" + actor,
      });
      if (!success) {
        return Response.json(
          { error: "rate_limited", retry_after_seconds: 60 },
          { status: 429, headers: { "retry-after": "60" } },
        );
      }
    }

    if (url.hostname === "www.remotearc.app") {
      const canonical = new URL(url.pathname + url.search, marketingOrigin);
      return Response.redirect(canonical.toString(), 301);
    }

    if ((request.method === "GET" || request.method === "HEAD") &&
      (url.hostname === "remotearc.app" || url.hostname === "www.remotearc.app")) {
      const canonicalLanguage = legacyLanguageRedirect(url);
      if (canonicalLanguage) {
        return Response.redirect(new URL(canonicalLanguage, marketingOrigin).toString(), 301);
      }
    }

    if (url.hostname === "remotearc.app" && url.pathname.length > 1 && url.pathname.endsWith("/")) {
      const canonical = new URL(url.pathname.replace(/\/+$/, "") + url.search, marketingOrigin);
      return Response.redirect(canonical.toString(), 301);
    }

    if ((request.method === "GET" || request.method === "HEAD") && url.hostname === "remotearc.app" && url.pathname === "/install") {
      return Response.redirect(new URL("/install/chatgpt", marketingOrigin).toString(), 301);
    }

    if (url.hostname === "remotearc.app" && (
      url.pathname === "/dashboard" ||
      url.pathname === "/overview" ||
      url.pathname === "/devices" ||
      url.pathname === "/apps" ||
      url.pathname === "/automations" ||
      url.pathname === "/connect" ||
      url.pathname === "/security" ||
      url.pathname === "/settings" ||
      url.pathname === "/device"
    ) && (request.method === "GET" || request.method === "HEAD")) {
      const nextPath = url.pathname === "/dashboard" ? "/overview" : url.pathname;
      return Response.redirect(new URL(nextPath + url.search, dashboardOrigin).toString(), 302);
    }

    const oldDashboard = legacyDashboardRedirect(url, request.method, appOrigin, dashboardOrigin);
    if (oldDashboard) return Response.redirect(oldDashboard, 302);

    // OAuth issuer, device transport and MCP resource never move to agent.
    if (new URL(dashboardOrigin).origin !== new URL(appOrigin).origin &&
      url.origin === new URL(dashboardOrigin).origin && protocolOnlyPath(url.pathname)) {
      return Response.json({ error: "protocol_host_required" },
        { status: 404, headers: { "cache-control": "no-store" } });
    }

    // Only the main domain serves product pages. Leave OAuth, MCP and API routes untouched.
    const websiteDestination = publicWebsiteRedirect(url, request.method, marketingOrigin);
    if (websiteDestination) return Response.redirect(websiteDestination, 301);

    // Keep /overview public as a real product preview, but sign in before
    // opening private dashboard tabs. Preserve the requested destination.
    const loginDestination = dashboardSignInUrl(url, request.method, dashboardOrigin);
    if (loginDestination && !(await getSessionUser(request, env))) {
      return Response.redirect(loginDestination, 302);
    }

    if (url.hostname === "remotearc.app" && (
      url.pathname === "/mcp" ||
      url.pathname.startsWith("/oauth/") ||
      url.pathname.startsWith("/auth/") ||
      url.pathname.startsWith("/.well-known/") ||
      url.pathname === "/agent"
    )) {
      return Response.redirect(new URL(url.pathname + url.search, appOrigin).toString(), 307);
    }

    if (
      url.hostname === "remote.samyao.me" &&
      !url.pathname.startsWith("/agent") &&
      !url.pathname.startsWith("/mcp") &&
      !url.pathname.startsWith("/api/") &&
      !url.pathname.startsWith("/.well-known/") &&
      !url.pathname.startsWith("/oauth/") &&
      !url.pathname.startsWith("/auth/") &&
      url.pathname !== "/health"
    ) {
      const canonical = new URL(url.pathname + url.search, env.PUBLIC_ORIGIN);
      return Response.redirect(canonical.toString(), 301);
    }

    if ((request.method === "GET" || request.method === "HEAD") && url.pathname === "/resources") {
      return Response.redirect(new URL("/docs", url.origin).toString(), 301);
    }

    if (url.pathname === "/.well-known/openai-apps-challenge") {
      if (!env.OPENAI_APPS_CHALLENGE) {
        return new Response("Not configured", { status: 404 });
      }
      return new Response(env.OPENAI_APPS_CHALLENGE, {
        headers: {
          "content-type": "text/plain; charset=utf-8",
          "cache-control": "no-store",
        },
      });
    }

    if (url.pathname === "/health") {
      return Response.json({
        ok: true,
        service: "remotearc-relay",
        version: cliPackage.version,
        auth: "oauth2-pkce",
        ...(env.DEPLOYMENT_SHA && /^[a-f0-9]{40}$/.test(env.DEPLOYMENT_SHA) ? { deployment: env.DEPLOYMENT_SHA } : {}),
      }, { headers: { "cache-control": "no-store" } });
    }

    if (
      url.pathname === "/.well-known/oauth-protected-resource" ||
      url.pathname === "/.well-known/oauth-protected-resource/mcp"
    ) {
      return protectedResourceMetadata(env);
    }

    if (
      url.pathname === "/.well-known/oauth-authorization-server" ||
      url.pathname === "/.well-known/openid-configuration"
    ) {
      return authorizationServerMetadata(env);
    }

    if (url.pathname === "/oauth/register" && request.method === "POST") {
      return handleDynamicClientRegistration(request, env);
    }

    if (url.pathname === "/oauth/authorize" && request.method === "GET") {
      return handleOAuthAuthorize(request, env);
    }

    if (url.pathname === "/oauth/decision" && request.method === "POST") {
      return handleOAuthDecision(request, env);
    }

    if (url.pathname === "/oauth/token" && request.method === "POST") {
      return handleOAuthToken(request, env);
    }

    if (url.pathname === "/auth/login" && request.method === "GET") {
      return handleLoginPage(request, env);
    }

    if (url.pathname === "/auth/reviewer" && request.method === "POST") {
      return handleReviewerLogin(request, env);
    }

    if (url.pathname === "/auth/email/request" && request.method === "POST") {
      const ip = request.headers.get("cf-connecting-ip") || "anonymous";
      const { success } = await env.EMAIL_RATE_LIMITER.limit({ key: "email-request:" + ip });
      if (!success) return new Response("Too many requests. Try again shortly.", { status: 429, headers: { "retry-after": "60" } });
      return handleEmailCodeRequest(request, env);
    }

    if (url.pathname === "/auth/email/verify" && request.method === "POST") {
      return handleEmailCodeVerify(request, env);
    }

    if (url.pathname === "/auth/google" && request.method === "GET") {
      return handleGoogleLogin(request, env);
    }

    if (
      url.pathname === "/auth/google/callback" &&
      request.method === "GET"
    ) {
      return handleGoogleCallback(request, env);
    }

    if (url.pathname === "/auth/logout" && request.method === "POST") {
      return handleLogout(request, env);
    }

    const fileResource = url.pathname.match(/^\/file-resource\/([^/]+)$/);
    if (fileResource) {
      return handleFileResource(request, env, decodeURIComponent(fileResource[1]!));
    }

    if (url.pathname === "/webhooks/github/marketplace") {
      return handleMarketplaceWebhook(request, env);
    }

    const automationHook = url.pathname.match(/^\/hooks\/automations\/([^/]+)\/([^/]+)$/);
    if (automationHook) {
      return handleAutomationWebhook(
        request,
        env,
        decodeURIComponent(automationHook[1]!),
        decodeURIComponent(automationHook[2]!),
      );
    }

    if (url.pathname === "/api/public/feedback-reward") {
      if(!['remotearc.app','www.remotearc.app','localhost'].includes(url.hostname))return Response.json({error:'not_found'},{status:404});
      return publicFeedbackReward(request,env);
    }
    if (url.pathname === "/api/public/engagement") {
      if (url.hostname !== "remotearc.app" && url.hostname !== "www.remotearc.app" &&
          url.hostname !== "localhost") return Response.json({error:"not_found"},{status:404});
      return submitWebsiteInterest(request, env);
    }

    if (url.pathname === "/api/admin/submissions") return listWebsiteSubmissions(request, env);
    const submissionMatch = url.pathname.match(/^\/api\/admin\/submissions\/([a-zA-Z0-9-]+)$/);
    if (submissionMatch) return updateWebsiteSubmission(request,env,submissionMatch[1]!);

    // Cloud Skill Registry for Arc Connect and first-party Arc Agent.
    // Never requires a device install; only reads versioned instructions.
    if (url.pathname === "/api/skills/plan" || url.pathname === "/api/skills/run") {
      const session = await getSessionUser(request, env);
      const oauth = session ? null : await authenticateMcp(request, env);
      const validOAuth = oauth && oauth.resource === (env.APP_ORIGIN || env.PUBLIC_ORIGIN) + "/mcp" ? oauth : null;
      const principal = session ? {id:session.id,oauth:false,scopes:""}
        : validOAuth ? {id:validOAuth.userId,oauth:true,scopes:validOAuth.scope} : null;
      if(principal){
        const {success}=await env.MCP_RATE_LIMITER.limit({key:principal.id+":skill-action"});
        if(!success)return Response.json({error:"rate_limited"},{status:429});
      }
      const deviceIdentity=validOAuth|| (session ? {
        userId:session.id,clientId:"arc-cloud-skills",grantId:null,
        scope:"browser:read",resource:(env.APP_ORIGIN || env.PUBLIC_ORIGIN)+"/mcp",
      } : null);
      return handleCloudSkillAction(request,principal,{
        consume:async()=>{ if(!principal)throw Error("unauthorized");await consumeToolCall(env,principal.id); },
        paused:async()=>!principal||await isMcpPaused(env,principal.id),
        selectDevices:async()=>getDevicesForUser(env,principal!.id),
        read:async(deviceId,_tabId,tool,args)=>{
          if(!deviceIdentity)throw Error("unauthorized");
          return callDevice(env,deviceIdentity,deviceId,tool,args);
        },
      });
    }
    if (url.pathname === "/api/skills" || url.pathname.startsWith("/api/skills/")) {
      const session = await getSessionUser(request, env);
      const oauth = session ? null : await authenticateMcp(request, env);
      const identity = oauth && oauth.resource === (env.APP_ORIGIN || env.PUBLIC_ORIGIN) + "/mcp" ? oauth : null;
      return handleCloudSkills(request, session ? { id: session.id } : identity ? { id: identity.userId } : null);
    }

    if (url.pathname === "/api/organizations" || url.pathname.startsWith("/api/organizations/")) {
      if (url.origin !== new URL(dashboardOrigin).origin && url.origin !== new URL(appOrigin).origin) return Response.json({ error: "app_host_required" }, { status: 404 });
      const user = await getSessionUser(request, env);
      if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
      return handleOrganizations(request, env, user.id);
    }

    if (url.pathname === "/api/me" && request.method === "GET") {
      const user = await getSessionUser(request, env);
      return user
        ? Response.json({ authenticated: true, user:{...user,arcAvailable:arcDeploymentReady(env)} },{headers:{'cache-control':'no-store'}})
        : Response.json({ authenticated: false }, { status: 401 });
    }

    if (/^\/api\/arc\/rooms(?:\/|$)/.test(url.pathname)) return handleArcRooms(request,env);
    if (/^\/api\/arc\/(employees|teams|team-events|employee-drafts)(?:\/|$)/.test(url.pathname)) return handleArcTeams(request,env);
    if (url.pathname.startsWith("/api/arc/")) return handleArcChat(request, env);
    if(url.pathname==='/api/runtime-config'&&request.method==='GET')return Response.json({version:1,environment:'production',arcAvailable:arcDeploymentReady(env),billingAvailable:arcDeploymentReady(env)&&stripeConfigured(env),execution:arcDeploymentReady(env)?'live':'disabled'},{headers:{'cache-control':'no-store'}});
    if(url.pathname==='/api/billing/catalog'&&request.method==='GET'){
      const catalog=await commercialCatalog(env);
      return Response.json({...catalog,arcAvailable:arcDeploymentReady(env),billingAvailable:arcDeploymentReady(env)&&stripeConfigured(env),connectFreeCalls:billingEnabled(env)?catalog.plans.find(p=>p.id==='free')!.connectToolCalls:10000},{headers:{'cache-control':'no-store'}});
    }
    if (url.pathname === '/api/billing' || url.pathname.startsWith('/api/billing/')) {
      if (url.origin !== new URL(dashboardOrigin).origin && url.origin !== new URL(appOrigin).origin) return Response.json({error:'billing_host_required'},{status:404});
      return handleBilling(request,env);
    }
    if (url.pathname === "/api/apps" || url.pathname.startsWith("/api/apps/")) {
      if (url.origin !== new URL(dashboardOrigin).origin && url.origin !== new URL(appOrigin).origin) return Response.json({error:"app_host_required"},{status:404});
      return handleApps(request, env);
    }

    if (url.pathname.startsWith("/api/runner/")) return handleRunnerRequest(request, env);

    if (url.pathname === "/api/status" && request.method === "GET") {
      const user = await getSessionUser(request, env);
      if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
      const devices = await getDevicesForUser(env, user.id);
      const recent = await readAudit(env, user.id, 8);
      const usage = await getMonthlyUsage(env, user.id);
      const plusUsage = await getMonthlyPlusUsage(env, user.id);
      const accountEntitlements = await getAccountEntitlements(env, user.id);
      return Response.json({
        googleConfigured: Boolean(
          (env.GOOGLE_NEXT_CLIENT_ID && env.GOOGLE_NEXT_CLIENT_SECRET) ||
          (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
        ),
        mcpEndpoint: (env.APP_ORIGIN || env.PUBLIC_ORIGIN) + "/mcp",
        devices,
        totalDevices: devices.length,
        onlineDevices: devices.filter((device) => device.status === "online").length,
        recentActivity: recent,
        usage,
        plusUsage,
        entitlements: {
          plan: accountEntitlements.plan,
          features: [...accountEntitlements.features],
        },
      });
    }

    if (url.pathname === "/api/monitor" && request.method === "GET") {
      return handleMonitorState(request, env);
    }
    if (url.pathname === "/api/admin/operations") {
      return handleAdminOperations(request, env);
    }
    if (url.pathname === "/api/admin/billing") {
      return handleAdminBilling(request, env);
    }
    if (url.pathname === "/api/admin/call-credits") {
      return handleAdminCallCredits(request, env);
    }

    if (url.pathname === "/api/admin/device-capacity") {
      return handleAdminDeviceCapacity(request,env);
    }
    const capacityRevoke = url.pathname.match(/^\/api\/admin\/device-capacity\/([a-zA-Z0-9-]+)\/revoke$/);
    if (capacityRevoke) return handleAdminDeviceCapacityRevoke(request,env,capacityRevoke[1]!);
    if (url.pathname === "/api/admin/plan-grants") {
      return handleAdminPlanGrants(request, env);
    }

    const planGrantRevoke = url.pathname.match(/^\/api\/admin\/plan-grants\/([^/]+)\/revoke$/);
    if (planGrantRevoke) {
      return handleAdminPlanGrantRevoke(
        request,
        env,
        decodeURIComponent(planGrantRevoke[1]!),
      );
    }

    if (url.pathname === "/api/automations") {
      return handleAutomationCollection(request, env);
    }

    const automationApi = url.pathname.match(/^\/api\/automations\/([^/]+)(?:\/([^/]+))?$/);
    if (automationApi) {
      return handleAutomationItem(
        request,
        env,
        decodeURIComponent(automationApi[1]!),
        automationApi[2] ? decodeURIComponent(automationApi[2]) : undefined,
      );
    }

    if (url.pathname === "/api/activity" && request.method === "GET") {
      const user = await getSessionUser(request, env);
      if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
      const limit = Number(url.searchParams.get("limit") || "20");
      return Response.json(await readAudit(env, user.id, limit));
    }

    if (url.pathname === "/api/security" && request.method === "GET") {
      return handleSecurityState(request, env);
    }

    if (url.pathname === "/api/security/mcp" && request.method === "POST") {
      return handleMcpPause(request, env);
    }

    if (
      /^\/api\/security\/grants\/[^/]+\/revoke$/.test(url.pathname) &&
      request.method === "POST"
    ) {
      return handleGrantRevoke(request, env);
    }

    if (url.pathname === "/api/approvals" && request.method === "GET") {
      return handleApprovalList(request, env);
    }

    if (url.pathname === "/api/approvals/permissions" && request.method === "GET") {
      return handlePersistentApprovalList(request, env);
    }

    if (/^\/api\/approvals\/[^/]+\/revoke$/.test(url.pathname) && request.method === "POST") {
      return handlePersistentApprovalRevoke(request, env);
    }

    if (
      /^\/api\/approvals\/[^/]+\/decision$/.test(url.pathname) &&
      request.method === "POST"
    ) {
      return handleApprovalDecision(request, env);
    }

    if (
      url.pathname === "/api/device/approvals/pending" &&
      request.method === "GET"
    ) {
      return handleDeviceApprovalList(request, env);
    }

    if (
      /^\/api\/device\/approvals\/[^/]+\/decision$/.test(url.pathname) &&
      request.method === "POST"
    ) {
      return handleDeviceApprovalDecision(request, env);
    }

    if (url.pathname === "/api/device/heartbeat" && request.method === "POST") {
      // Heartbeat already updates last_seen below; avoid a second D1 write.
      const identity = await authenticateDevice(request, env, { touchLastSeen: false });
      if (!identity) return Response.json({ error: "unauthorized" }, { status: 401 });
      const heartbeat = (await request.json().catch(() => ({}))) as {
        background_enabled?: unknown;
        background_process?: unknown;
        background_service?: unknown;
      };
      const backgroundEnabled =
        typeof heartbeat.background_enabled === "boolean"
          ? heartbeat.background_enabled
          : null;
      const backgroundService =
        typeof heartbeat.background_service === "string" &&
        heartbeat.background_service.length <= 40
          ? heartbeat.background_service
          : null;
      const now = new Date().toISOString();
      await env.DB.prepare(
        `UPDATE devices
         SET last_seen = ?1,
             background_enabled = COALESCE(?2, background_enabled),
             background_service = COALESCE(?3, background_service),
             background_seen_at = CASE WHEN ?2 IS NULL THEN background_seen_at ELSE ?1 END
         WHERE id = ?4 AND user_id = ?5 AND revoked_at IS NULL`,
      )
        .bind(
          now,
          backgroundEnabled === null ? null : backgroundEnabled ? 1 : 0,
          backgroundService,
          identity.id,
          identity.user_id,
        )
        .run();
      return new Response(null, { status: 204 });
    }

    if (url.pathname === "/api/device/start" && request.method === "POST") {
      return handleDeviceStart(request, env);
    }

    if (url.pathname === "/api/device/token" && request.method === "POST") {
      return handleDeviceToken(request, env);
    }

    if (url.pathname === "/api/pairing" && request.method === "GET") {
      return handlePairingLookup(request, env);
    }

    if (url.pathname === "/api/pairing/approve" && request.method === "POST") {
      return handlePairingApprove(request, env);
    }

    if (url.pathname === "/api/devices" && request.method === "GET") {
      return handleDeviceList(request, env);
    }

    if (
      /^\/api\/devices\/[^/]+\/rename$/.test(url.pathname) &&
      request.method === "POST"
    ) {
      return handleDeviceRename(request, env);
    }

    if (
      /^\/api\/devices\/[^/]+\/revoke$/.test(url.pathname) &&
      request.method === "POST"
    ) {
      return handleDeviceRevoke(request, env);
    }

    if (/^\/api\/devices\/[^/]+\/task-permissions$/.test(url.pathname) && request.method === "POST") {
      return handleDeviceTaskSettings(request, env);
    }

    if (
      /^\/api\/devices\/[^/]+\/tools$/.test(url.pathname) &&
      request.method === "POST"
    ) {
      return handleDeviceToolsUpdate(request, env);
    }

    if (
      /^\/api\/devices\/[^/]+\/policy$/.test(url.pathname) &&
      request.method === "POST"
    ) {
      return handleDevicePolicyUpdate(request, env);
    }

    if (
      /^\/api\/devices\/[^/]+\/directories$/.test(url.pathname) &&
      request.method === "GET"
    ) {
      return handleDeviceDirectoryBrowse(request, env);
    }

    if (
      /^\/api\/devices\/[^/]+\/runtime$/.test(url.pathname) &&
      request.method === "POST"
    ) {
      return handleDeviceRuntimeUpdate(request, env);
    }

    if (
      /^\/api\/devices\/[^/]+\/background$/.test(url.pathname) &&
      request.method === "POST"
    ) {
      return handleDeviceBackgroundUpdate(request, env);
    }

    if (
      /^\/api\/devices\/[^/]+\/execution-log$/.test(url.pathname) &&
      request.method === "GET"
    ) {
      return handleDeviceExecutionLog(request, env);
    }

    if (
      /^\/api\/devices\/[^/]+\/processes$/.test(url.pathname) &&
      request.method === "GET"
    ) {
      return handleDeviceManagedProcesses(request, env);
    }

    if (
      /^\/api\/devices\/[^/]+\/processes\/[^/]+\/output$/.test(url.pathname) &&
      request.method === "GET"
    ) {
      return handleDeviceManagedProcessOutput(request, env);
    }

    if (
      /^\/api\/devices\/[^/]+\/processes\/[^/]+\/stop$/.test(url.pathname) &&
      request.method === "POST"
    ) {
      return handleDeviceManagedProcessStop(request, env);
    }

    if (
      /^\/api\/devices\/[^/]+\/undo$/.test(url.pathname) &&
      request.method === "GET"
    ) {
      return handleDeviceUndoList(request, env);
    }

    if (
      /^\/api\/devices\/[^/]+\/undo\/[^/]+$/.test(url.pathname) &&
      request.method === "POST"
    ) {
      return handleDeviceUndoAction(request, env);
    }

    if (url.pathname === "/agent") {
      try {
        const identity = await authenticateDevice(request, env);
        if (!identity) {
          return new Response("Unauthorized device", { status: 401 });
        }

        return await env.REGISTRY
          .getByName("user:" + identity.user_id)
          .fetch(withTrustedDeviceHeaders(request, identity));
      } catch (error) {
        console.error("agent_connect_failed", {
          error: diagnosticError(error),
        });
        return new Response("Relay temporarily unavailable", {
          status: 503,
          headers: {
            "retry-after": "2",
            "cache-control": "no-store",
          },
        });
      }
    }

    if (url.pathname === "/mcp" || url.pathname === "/mcp/") {
      const ingressLimit = await limitMcpIngress(request, env);
      if (ingressLimit) return ingressLimit;
      const identity = await authenticateMcp(request, env);
      const validIdentity =
        identity && identity.resource === (env.APP_ORIGIN || env.PUBLIC_ORIGIN) + "/mcp"
          ? identity
          : null;

      if (validIdentity) {
        const { success } = await env.MCP_RATE_LIMITER.limit({
          key: validIdentity.userId + ":" + validIdentity.clientId,
        });
        if (!success) {
          return Response.json(
            { error: "rate_limited", retry_after_seconds: 60 },
            { status: 429, headers: { "retry-after": "60" } },
          );
        }

        if (await isMcpPaused(env, validIdentity.userId)) {
          return Response.json(
            {
              error: "mcp_paused",
              message: "Remote MCP access is paused for this account.",
            },
            { status: 423 },
          );
        }
      }

      const eventResponse = await handleTaskEventRpc(request, env, validIdentity);
      if (eventResponse) return eventResponse;
      const handler = createRemoteLinkMcp(env, validIdentity, {
        kickScheduler: (automationId) => {
          if (!ctx) return;
          ctx.waitUntil(
            runAutomationTick(env, new Date(), automationId).catch((error) => {
              console.warn("source_goal_scheduler_kick_failed", {
                error: diagnosticError(error),
              });
            }),
          );
        },
      });
      const response = await handler.fetch(request);

      // Keep the standard HTTP auth challenge on unauthenticated MCP failures
      // while allowing initialize/tools/list to succeed anonymously so
      // ChatGPT can discover per-tool securitySchemes and trigger linking.
      if (!validIdentity && response.status === 401) {
        return mcpUnauthorized(env);
      }

      return response;
    }

    if (url.pathname === "/api/debug/devices" && request.method === "GET") {
      const user = await getSessionUser(request, env);
      if (!user) return new Response("Unauthorized", { status: 401 });
      return Response.json(await getDevicesForUser(env, user.id));
    }

    const isMarketingHost = url.hostname === "remotearc.app" || url.hostname === "www.remotearc.app";

    if ((request.method === "GET" || request.method === "HEAD") && url.pathname === "/robots.txt") {
      return new Response(request.method === "HEAD" ? null : (isMarketingHost ? robotsTxt() : "User-agent: *\nDisallow: /\n"), {
        headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" },
      });
    }

    if ((request.method === "GET" || request.method === "HEAD") && isMarketingHost && url.pathname === "/sitemap.xml") {
      return new Response(request.method === "HEAD" ? null : sitemapXml(), {
        headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" },
      });
    }

    if ((request.method === "GET" || request.method === "HEAD") && isMarketingHost && url.pathname === "/feed.xml") {
      return new Response(request.method === "HEAD" ? null : feedXml(), {
        headers: { "content-type": "application/rss+xml; charset=utf-8", "cache-control": "public, max-age=3600" },
      });
    }

    if (request.method === "GET" && isMarketingHost && url.pathname === "/llms.txt") {
      return new Response(llmsTxt(), {
        headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" },
      });
    }

    if (request.method === "GET" && isMarketingHost && url.pathname === "/llms-full.txt") {
      return new Response(llmsFullTxt(), {
        headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" },
      });
    }

    if (url.pathname === "/install.sh" && (request.method === "GET" || request.method === "HEAD")) {
      const response = await env.ASSETS.fetch(request);
      const headers = new Headers(response.headers);
      headers.set("content-type", "text/x-shellscript; charset=utf-8");
      headers.set("x-content-type-options", "nosniff");
      headers.set("x-robots-tag", "noindex");
      headers.set("cache-control", "public, max-age=300");
      return new Response(response.body, { status: response.status, headers });
    }

    const marketingDocumentRequest =
      isMarketingHost &&
      (request.method === "GET" || request.method === "HEAD") &&
      !url.pathname.split("/").pop()?.includes(".");

    const acceptsHtml =
      marketingDocumentRequest ||
      request.headers.get("sec-fetch-mode") === "navigate" ||
      (request.headers.get("accept") || "").includes("text/html");

    if (acceptsHtml) {
      const assetHeaders = new Headers(request.headers);
      assetHeaders.set("authorization", "Bearer remote-arc-html-shell");
      assetHeaders.set("cache-control", "no-store");

      const assetResponse = await env.ASSETS.fetch(
        new Request(request, { method: request.method === "HEAD" ? "GET" : request.method, headers: assetHeaders }),
      );
      const headers = new Headers(assetResponse.headers);
      headers.set("cache-control", "no-store");
      headers.set("cloudflare-cdn-cache-control", "no-store");
      headers.delete("etag");
      headers.delete("content-length");

      const html = await assetResponse.text();
      let rendered = isMarketingHost ? renderMarketingHtml(html, url.pathname) : html;
      if (isAdminHost) {
        // Keep a readable recovery shell if a stale browser runtime blocks React.
        // A successful React mount replaces this immediately.
        rendered = rendered.replace('<div id="root"></div>',
          '<div id="root"><main style="max-width:560px;margin:12vh auto;padding:24px;font:16px/1.6 system-ui,sans-serif">' +
          '<h1>Remote Arc Admin</h1><p>Loading the secure admin console…</p>' +
          '<p>If this page stays here, reload it once or open it in a private window.</p></main></div>');
      }

      if (!isMarketingHost) {
        headers.set("x-robots-tag", "noindex, nofollow, noarchive");
        if (isAdminHost) {
          headers.set("x-frame-options", "DENY");
          headers.set("referrer-policy", "no-referrer");
          headers.set("content-security-policy",
            "default-src 'self'; script-src 'self' 'sha256-+g2J2TalgNUFkUea+jpAd6tLsG/QRnmvNufGwRci22E='; style-src 'self' 'unsafe-inline'; " +
            "img-src 'self' data:; connect-src 'self'; font-src 'self'; worker-src 'self'; manifest-src 'self'; " +
            "object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
        }
      } else {
        const canonical = canonicalForPath(url.pathname);
        if (canonical) headers.set("link", "<" + canonical + '>; rel="canonical"');
        if (marketingStatusCode(url.pathname) === 404) {
          headers.set("x-robots-tag", "noindex, nofollow, noarchive");
        }
      }

      return new Response(request.method === "HEAD" ? null : rendered, {
        status: isMarketingHost ? marketingStatusCode(url.pathname) : assetResponse.status,
        statusText: isMarketingHost && marketingStatusCode(url.pathname) === 404 ? "Not Found" : assetResponse.statusText,
        headers,
      });
    }

    return env.ASSETS.fetch(request);
}

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const started = Date.now();
    const isMcpRequest = ["/mcp", "/mcp/"].includes(new URL(request.url).pathname);
    try {
      const response = await handleFetch(request, env, ctx);
      if (isMcpRequest) recordMcpTelemetry(env, {
        status: response.status, durationMs: Date.now() - started, method: request.method,
      });
      if (response.status >= 500) {
        ctx.waitUntil(
          recordServiceIncident(
            env,
            incidentFromRequest(request, {
              severity: response.status >= 503 ? "critical" : "error",
              kind: "http_5xx",
              statusCode: response.status,
              message: "Remote Arc returned HTTP " + response.status,
            }),
          ),
        );
      }
      return response;
    } catch (error) {
      if (isMcpRequest) recordMcpTelemetry(env, {
        status: 500, durationMs: Date.now() - started, method: request.method,
      });
      const message = diagnosticError(error);
      console.error("worker_unhandled_exception", { message });
      ctx.waitUntil(
        recordServiceIncident(
          env,
          incidentFromRequest(request, {
            severity: "critical",
            kind: "exception",
            statusCode: 500,
            message,
          }),
        ),
      );
      return Response.json(
        {
          error: "internal_error",
          message: "Remote Arc encountered an unexpected error.",
        },
        {
          status: 500,
          headers: { "cache-control": "no-store" },
        },
      );
    }
  },

  async scheduled(
    controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext,
  ) {
    if (["* * * * *", "*/5 * * * *"].includes(controller.cron)) {
      ctx.waitUntil(runScheduledTasks(env, controller.cron));
    }
    if(controller.cron==='* * * * *')ctx.waitUntil(runFollowupBatches(env));
    if(controller.cron==='* * * * *')ctx.waitUntil(runSlackJobs(env));
    if (controller.cron === "*/5 * * * *") {
      ctx.waitUntil(runSyntheticMonitor(env));
      ctx.waitUntil(runApprovalMaintenance(env));
      ctx.waitUntil(ensureOperatorAllowance(env).catch((error) => console.error("operator_allowance_failed", { message: error instanceof Error ? error.message : String(error) })));
      ctx.waitUntil(purgeDeletedArcContent(env));
      if (env.AUDIT_ARCHIVE_ENABLED === "1") {
        ctx.waitUntil(archiveOldAudit(env).then(({ archived, batches }) => {
          if (archived) console.info("audit_archive_completed", { archived, batches });
        }).catch((error) => {
          console.error("audit_archive_failed", { message: diagnosticError(error) });
        }));
      }
    }
  },
};
