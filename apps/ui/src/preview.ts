import type { SecurityState } from "@remotearc/protocol";
import {ARC_PLANS,ARC_TOPUPS,ARC_HOSTED_MODELS} from '@remotearc/protocol';
import appDirectory from "./app-directory.json" with { type: "json" };
import {createArcPreview} from "./arc-preview.js";

export const UI_PREVIEW = import.meta.env.VITE_UI_PREVIEW === "1";

const previewNow = () => new Date().toISOString();
const previewAgo = (milliseconds: number) => new Date(Date.now() - milliseconds).toISOString();

export function installUiPreviewFetchMock(mcpEndpoint: string) {
  if (!UI_PREVIEW || typeof window === "undefined") return;

  const nativeFetch = window.fetch.bind(window);
  const arcPreview = createArcPreview();
  let config:Promise<{arcAvailable:boolean}>|undefined, configTime=0;
  function runtimeConfig() {
    if(!config||Date.now()-configTime>5000) {
      configTime=Date.now();
      config=nativeFetch('/api/runtime-config',{credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(3000)}).then(async response=>{
        if(!response.ok)throw Error('preview_config_unavailable');const value=await response.json();
        if(value.version!==1||value.execution!=='simulation'||typeof value.arcAvailable!=='boolean')throw Error('invalid_preview_config');
        return {arcAvailable:value.arcAvailable};
      }).catch(()=>({arcAvailable:false}));
    }
    return config;
  }
  const tools = [
    "list_directory",
    "read_file",
    "get_file_info",
    "list_processes",
    "write_file",
    "edit_block",
    "undo_last_change",
    "start_process",
    "process_status",
    "process_output",
    "stop_process",
  ];

  const devices = [
    {
      id: "preview-mac",
      name: "Personal Mac",
      platform: "darwin",
      arch: "arm64",
      hostname: "Sam-Mac",
      created_at: previewAgo(21 * 86400000),
      last_seen: previewAgo(18000),
      status: "online",
      tools,
      available_tools: tools,
      allowed_tools: tools,
      workspace_roots: ["/Users/sam/work"],
      sensitive_paths: ["~/.ssh", "~/.aws", "~/.gnupg"],
      sensitive_allow_paths: [],
      protect_sensitive_paths: true,
      undo_enabled: true,
      policy_enforcement_available: true,
      undo_history_available: true,
      background_agent_available: true,
      background_recovery_available: true,
      background_guard_active: true,
      background_guard_pid: 4821,
      execution_mode: "foreground",
      background_enabled: true,
      background_service: "launchd",
      background_active: false,
      background_pid: null,
      background_agent_version: null,
      background_connected_at: null,
      agent_version: "0.4.4",
      agent_pid: 4926,
      connected_at: previewAgo(3600000),
      background_seen_at: previewAgo(18000),
      automation_permissions: { background_tasks: true, scheduled_tasks: true, adaptive_agent: false, source_agent: false, keep_awake: true },
      keep_awake_available: true,
    },
    {
      id: "preview-win",
      name: "Desktop PC",
      platform: "win32",
      arch: "x64",
      hostname: "SamPC",
      created_at: previewAgo(35 * 86400000),
      last_seen: previewAgo(4 * 3600000),
      status: "offline",
      tools,
      available_tools: tools,
      allowed_tools: ["list_directory", "read_file", "get_file_info", "list_processes"],
      workspace_roots: ["C:\\Users\\Sam\\work"],
      sensitive_paths: [],
      sensitive_allow_paths: [],
      protect_sensitive_paths: true,
      undo_enabled: true,
      policy_enforcement_available: true,
      undo_history_available: true,
      background_agent_available: true,
      background_enabled: false,
      background_service: "registry-run",
      background_seen_at: previewAgo(4 * 3600000),
      automation_permissions: { background_tasks: true, scheduled_tasks: true, adaptive_agent: false, source_agent: false, keep_awake: false },
      keep_awake_available: false,
    },
  ];

  const baseAutomations = [
    {
      id: "preview-goal",
      user_id: "preview-user",
      name: "Stabilize overnight integration tests",
      kind: "goal_loop",
      status: "running",
      device_id: "preview-mac",
      trigger_json: JSON.stringify({ type: "immediate" }),
      action_json: JSON.stringify({ steps: [{ type: "device_command", command: "pnpm test:integration", cwd: "/Users/sam/work/remote-arc" }] }),
      goal_json: JSON.stringify({ type: "command_exit", command: "pnpm test:integration", cwd: "/Users/sam/work/remote-arc", expected_exit_code: 0 }),
      state_json: JSON.stringify({ phase: "step_running" }),
      interval_seconds: 300,
      next_run_at: new Date(Date.now() + 4 * 60000).toISOString(),
      expires_at: new Date(Date.now() + 11 * 3600000).toISOString(),
      max_runs: 0,
      run_count: 3,
      last_run_at: previewAgo(12 * 60000),
      last_error: null,
      created_at: previewAgo(2 * 3600000),
      updated_at: previewAgo(20000),
    },
    {
      id: "preview-ci",
      user_id: "preview-user",
      name: "Merge after CI passes",
      kind: "condition_watch",
      status: "waiting_for_event",
      device_id: "preview-mac",
      trigger_json: JSON.stringify({ type: "webhook", source: "github", event: "workflow_run", match: { "workflow_run.name": "CI", "workflow_run.conclusion": "success" } }),
      action_json: JSON.stringify({ steps: [{ type: "device_command", command: "gh pr merge 52 --merge", cwd: "/Users/sam/work/remote-arc" }] }),
      goal_json: null,
      state_json: JSON.stringify({ phase: "idle" }),
      interval_seconds: 300,
      next_run_at: null,
      expires_at: null,
      max_runs: 1,
      run_count: 0,
      last_run_at: null,
      last_error: null,
      created_at: previewAgo(45 * 60000),
      updated_at: previewAgo(45 * 60000),
    },
    {
      id: "preview-offline",
      user_id: "preview-user",
      name: "Nightly build",
      kind: "schedule_watch",
      status: "waiting_for_device",
      device_id: "preview-win",
      trigger_json: JSON.stringify({ type: "interval", every_seconds: 86400 }),
      action_json: JSON.stringify({ steps: [{ type: "device_command", command: "pnpm build" }] }),
      goal_json: null,
      state_json: JSON.stringify({ phase: "idle" }),
      interval_seconds: 300,
      next_run_at: null,
      expires_at: null,
      max_runs: 0,
      run_count: 5,
      last_run_at: previewAgo(22 * 3600000),
      last_error: "Device offline; the task will resume automatically after reconnect.",
      created_at: previewAgo(6 * 86400000),
      updated_at: previewAgo(20 * 60000),
    },
  ];

  const automations = [...baseAutomations];

  const json = (value: unknown, status = 200) =>
    Promise.resolve(
      new Response(JSON.stringify(value), {
        status,
        headers: { "content-type": "application/json" },
      }),
    );

  window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const raw =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    const url = new URL(raw, location.origin);

    if (
      url.origin !== location.origin ||
      (!url.pathname.startsWith("/api/") && url.pathname !== "/auth/logout")
    ) {
      return nativeFetch(input, init);
    }

    const method = (
      init?.method ||
      (typeof input !== "string" && !(input instanceof URL) ? input.method : "GET")
    ).toUpperCase();

    if((url.pathname.startsWith('/api/arc/sessions')||url.pathname.startsWith('/api/arc/skills'))) {
      if(!(await runtimeConfig()).arcAvailable)return json({error:'ARC_NOT_CONFIGURED'},503);
      const result=arcPreview.handle(url.pathname,method,init?.body??(input instanceof Request?await input.clone().text():undefined));
      if(result)return result;
    }
    if (method !== "GET") {
      return json(
        { error: "PR Preview is read-only. This action is not connected to production." },
        403,
      );
    }

    if(url.pathname==='/api/runtime-config')return nativeFetch(input,init);
    if(url.pathname==='/api/billing/catalog')return json({arcAvailable:(await runtimeConfig()).arcAvailable,billingAvailable:false,connectFreeCalls:10000});
    if (url.pathname === '/api/billing') return json({enabled:false,plan:ARC_PLANS[1],credits:{available:1280,pending:12.5,buckets:[]},usage:{used:1732,limit:null},plans:ARC_PLANS,topups:ARC_TOPUPS,models:ARC_HOSTED_MODELS.map(m=>({id:m.id,label:m.label,inputCreditsPer1000:m.inputMicrosPerMillion/2000000,outputCreditsPer1000:m.outputMicrosPerMillion/2000000})),subscriptions:[]});
    if (url.pathname === '/api/arc/status') {const enabled=(await runtimeConfig()).arcAvailable;return json({enabled,preview:true,access:{status:'active',canUse:enabled,daysRemaining:14,dailyUsedPercent:0,expiresAt:null},models:ARC_HOSTED_MODELS.map(m=>({id:m.id==='arc-auto'?'auto':m.id,label:m.label,provider:m.provider,premium:m.id!=='arc-auto',configured:true})),limits:{maxSteps:8,maxTokens:24000,maxSeconds:180}});}
    if (url.pathname === '/api/arc/work') return json({work:[{id:'sample-task',name:'Prepare the next release summary',kind:'task',status:'waiting',schedule:{type:'once'},nextRunAt:new Date(Date.now()+1800000).toISOString(),runCount:0,error:null,conversationId:'sample-conversation'},{id:'sample-routine',name:'Morning inbox & calendar brief',kind:'routine',status:'waiting',schedule:{type:'daily',time:'09:00',timezone:'Pacific/Auckland',weekdays:[1,2,3,4,5]},nextRunAt:new Date(Date.now()+3600000).toISOString(),runCount:4,error:null,conversationId:'sample-conversation'}],runs:[{id:'sample-run',session_id:'sample-conversation',title:'Review the release and share a summary',status:'succeeded',step:5,tokens_used:1320,error_code:null,created_at:new Date().toISOString(),automation_id:null},{id:'sample-routine-run',session_id:'sample-conversation',title:'Morning inbox & calendar brief',status:'succeeded',step:4,tokens_used:1045,error_code:null,created_at:new Date(Date.now()-3600000).toISOString(),automation_id:'sample-routine'}]});
    // Preview data for Settings > Workspaces. Writes remain blocked above.
    if (url.pathname === "/api/organizations") {
      return json({
        organizations: [
          { id: "preview-personal", name: "Personal", kind: "personal", role: "owner", members: 1, pending: 0 },
          { id: "preview-team", name: "Remote Arc Team", kind: "team", role: "owner", members: 2, pending: 1 },
        ],
        invitations: [],
      });
    }
    if (url.pathname === "/api/organizations/preview-personal") {
      return json({
        organization: { id: "preview-personal", name: "Personal", kind: "personal", role: "owner", members: 1, pending: 0 },
        members: [{ user_id: "preview-user", email: "preview@remotearc.app", name: "Preview User", role: "owner" }],
        invitations: [],
      });
    }
    if (url.pathname === "/api/organizations/preview-team") {
      return json({
        organization: { id: "preview-team", name: "Remote Arc Team", kind: "team", role: "owner", members: 2, pending: 1 },
        members: [
          { user_id: "preview-user", email: "preview@remotearc.app", name: "Preview User", role: "owner" },
          { user_id: "preview-teammate", email: "teammate@example.com", name: "Alex", role: "member" },
        ],
        invitations: [{ id: "preview-invite", email: "designer@example.com", role: "member", organization_id: "preview-team", expires_at: new Date(Date.now() + 604800000).toISOString() }],
      });
    }

    if (url.pathname === "/api/me") {
      return json({
        user: {
          id: "preview-user",
          arcAvailable: (await runtimeConfig()).arcAvailable,
          email: "preview@remotearc.app",
          name: "Preview User",
          avatarUrl: null,
          role: "admin",
          plan: "plus",
          isAdmin: true,
        },
      });
    }

    if (url.pathname === "/api/status") {
      return json({
        googleConfigured: true,
        mcpEndpoint,
        devices,
        totalDevices: devices.length,
        onlineDevices: 1,
        recentActivity: [
          {
            id: "preview-a1",
            device_id: "preview-mac",
            event_type: "mcp.tool_call",
            tool_name: "read_file",
            success: 1,
            created_at: previewAgo(4 * 60000),
          },
          {
            id: "preview-a2",
            device_id: "preview-mac",
            event_type: "device.policy_updated",
            tool_name: null,
            success: 1,
            created_at: previewAgo(48 * 60000),
          },
          {
            id: "preview-a3",
            device_id: "preview-win",
            event_type: "mcp.tool_call",
            tool_name: "list_processes",
            success: 1,
            created_at: previewAgo(2 * 3600000),
          },
        ],
        entitlements: { plan: "plus", features: ["binary_read", "durable_tasks", "scheduled_tasks", "planned_agent_goals", "keep_awake"] },
        usage: {
          month: "2026-09",
          used: 1732,
          limit: 10000,
          remaining: 8268,
          unlimited: false,
        },
      });
    }

    if (url.pathname === "/api/approvals") return json([]);

    // Isolated mock accounts make management/reconnect UX reviewable. No credentials or writes.
    if (url.pathname === "/api/apps") return json({
      enabled: true,
      apps: appDirectory.apps.map((app) => ({ ...app, configured: ["github", "slack", "gmail", "google_calendar", "google_drive", "google_docs", "google_sheets", "notion", "runway"].includes(app.provider), permissions: { read: [], write: [] } })),
      connections: [
        {id:"11111111-1111-4111-8111-111111111111",provider:"github",accountLabel:"Example developer",status:"active",permissions:["read","write"],scopes:[],expiresAt:null,lastError:null,updatedAt:"2026-10-19T00:00:00Z",toolAccess:{available:15,total:15,needsReconnect:false}},
        {id:"22222222-2222-4222-8222-222222222222",provider:"slack",accountLabel:"Example workspace / personal",status:"active",permissions:["read","write"],scopes:[],expiresAt:null,lastError:null,updatedAt:"2026-10-19T00:00:00Z",toolAccess:{available:35,total:35,needsReconnect:false}},
        {id:"33333333-3333-4333-8333-333333333333",provider:"slack",accountLabel:"Example workspace / project",status:"active",permissions:["read","write"],scopes:[],expiresAt:null,lastError:null,updatedAt:"2026-10-19T00:00:00Z",toolAccess:{available:5,total:35,needsReconnect:true}},
      ],
    });
    if (url.pathname === "/api/apps/approvals") return json({ approvals: [] });

    if (url.pathname === "/api/security") {
      return json({
        mcpPaused: false,
        grants: [
          {
            grantId: "preview-chatgpt-grant",
            clientId: "preview-chatgpt",
            clientName: "ChatGPT",
            scopes: ["devices:read", "computer:read", "computer:write"],
            authorizedAt: previewAgo(7 * 86400000),
            lastTokenIssuedAt: previewAgo(12 * 60000),
            accessExpiresAt: new Date(Date.now() + 48 * 60000).toISOString(),
            refreshExpiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
            tokenRows: 2,
            status: "active",
          },
          {
            grantId: "preview-claude-grant",
            clientId: "preview-claude",
            clientName: "Claude",
            scopes: ["devices:read", "computer:read"],
            authorizedAt: previewAgo(2 * 86400000),
            lastTokenIssuedAt: previewAgo(55 * 60000),
            accessExpiresAt: new Date(Date.now() + 5 * 60000).toISOString(),
            refreshExpiresAt: new Date(Date.now() + 28 * 86400000).toISOString(),
            tokenRows: 1,
            status: "active",
          },
        ],
      } satisfies SecurityState);
    }

    if(url.pathname==='/api/admin/followups')return json({items:[{id:'preview-followup-user',name:'Alex Chen',email:'alex@example.invalid',devices:0,apps:0,calls:0,arc_runs:0,status:'new',next_followup_at:null,consent_at:null,suppressed_at:null,last_contact_at:null,feedback_count:0},{id:'preview-followup-active',name:'Taylor',email:'taylor@example.invalid',devices:2,apps:3,calls:128,arc_runs:4,status:'waiting',next_followup_at:new Date().toISOString(),consent_at:null,suppressed_at:null,last_contact_at:new Date().toISOString(),feedback_count:1}],total:2,emailConfigured:false});
    if(url.pathname.startsWith('/api/admin/followups/'))return json({contact:{status:'new',note:'',next_followup_at:null,consent_at:null,consent_note:'',suppressed_at:null},messages:[]});
    if (url.pathname === "/api/admin/operations") {
      const day = new Date();
      const sampleUsers = [
        {id:"preview-user",email:"owner@example.com",name:"Operator",role:"admin",plan:"plus",used:1570,extra:0,allowance:null,device_count:2,online_devices:1,created_at:previewAgo(40*86400000),last_activity:previewAgo(600000),has_plus_grant:1},
        {id:"u2",email:"tester@example.com",name:"Early tester",role:"user",plan:"free",used:720,extra:500,allowance:10500,device_count:1,online_devices:1,created_at:previewAgo(3*86400000),last_activity:previewAgo(3600000),has_plus_grant:0},
        {id:"u3",email:"builder@example.com",name:"Developer",role:"user",plan:"plus",used:2400,extra:0,allowance:10000,device_count:2,online_devices:0,created_at:previewAgo(7*86400000),last_activity:previewAgo(29000000),has_plus_grant:1},
      ];
      return json({
        checkedAt:previewNow(),month:day.toISOString().slice(0,7),page:0,pageSize:30,creditsReady:true,
        totals:{users:7,devices:8,online:2,auditRows:33200,auditLast7d:10470,monthlyCalls:6750},
        limits:{free:10000,plus:10000},users:sampleUsers,
        devices:[
          {id:"mac-a",user_id:"preview-user",name:"MacBook Pro",platform:"darwin",arch:"arm64",online:true,statusVerified:true,last_seen:previewAgo(30000),created_at:previewAgo(8*86400000)},
          {id:"pc-a",user_id:"preview-user",name:"Windows Desktop",platform:"win32",arch:"x64",online:false,statusVerified:true,last_seen:previewAgo(3*3600000),created_at:previewAgo(9*86400000)},
          {id:"laptop-b",user_id:"u2",name:"Laptop",platform:"darwin",arch:"arm64",online:true,statusVerified:true,last_seen:previewAgo(65000),created_at:previewAgo(2*86400000)},
          {id:"linux-c",user_id:"u3",name:"Linux Server",platform:"linux",arch:"x64",online:false,statusVerified:true,last_seen:previewAgo(54000000),created_at:previewAgo(4*86400000)},
        ],
        activity:Array.from({length:168},(_,i)=>{
          const time=new Date(Date.now()-(167-i)*3600000);
          const hour=time.getUTCHours();
          return {hour:time.toISOString().slice(0,13),calls:Math.max(0,Math.round((hour>7&&hour<19?20:4)*(0.5+(i%11)/11))),users:1+(i%3)};
        }),
        billing:{actualUsd:null,source:"unavailable",billingUrl:"https://dash.cloudflare.com/",note:"Actual billing not connected",services:["Workers Paid","D1","Durable Objects","R2","KV"]},
      });
    }

    if (url.pathname === "/api/monitor") {
      return json({
        status: "operational",
        checkedAt: previewNow(),
        worker: {
          status: "operational",
          errors15m: 0,
          errors1h: 1,
          errors24h: 2,
        },
        dependencies: {
          d1: { status: "operational" },
          durableObjects: { status: "operational" },
        },
        account: {
          users: 128,
          devices: 231,
          activeTokens: 54,
        },
        alerts: {
          emailConfigured: true,
          destination: "alerts@example.com",
          cooldownMinutes: 10,
          recent: [],
        },
        incidents: [
          {
            id: "preview-incident",
            status_code: 502,
            path: "/mcp",
            message: "Example recovered upstream error",
            created_at: previewAgo(6 * 3600000),
          },
        ],
      });
    }

    if (url.pathname === "/api/devices") return json(devices);
    if (url.pathname === "/api/automations") return json({ automations: automations.map(item => ({ ...item, run_started_count: item.run_count + (item.status === "running" ? 1 : 0) })), capabilities: { hosted_planner: true, github_merge: true }, scheduler: { state: "healthy", last_success_at: new Date().toISOString(), overdue_count: 0 } });
    const taskId = url.pathname.match(/^\/api\/automations\/([^/]+)$/)?.[1];
    if (taskId) {
      const automation = automations.find((item) => item.id === taskId);
      if (!automation) return json({ error: "not_found" }, 404);
      return json({ automation, runs: automation.run_count ? [{
        id: taskId + "-run", attempt: automation.run_count,
        status: automation.status === "completed" ? "completed" : "running",
        exit_code: automation.status === "completed" ? 0 : null,
        output_summary: automation.status === "completed" ? "Typecheck: passed\nIntegration tests: passed\nRelease build: exit 0" : "Latest observation: tests reproduced; task remains in progress.",
        error: null, started_at: automation.last_run_at || automation.created_at,
      }] : [] });
    }
    return json({ ok: true });
  }) as typeof window.fetch;
}
