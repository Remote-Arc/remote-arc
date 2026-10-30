// Keep protocol runtime exports self-contained for native Node type stripping.
/** Bootstrap defaults for migrations, previews and planning. Runtime commercial terms come from versioned D1 configuration. */
export const ARC_CREDIT_RATE = {version:'arc-credits-v1',unitsPerCredit:1000,costMicrosPerUnit:2} as const;
export const ARC_TRIAL_CREDITS = 200;
export const ARC_MEMORY_LIMITS={facts:100,work:40,factBytes:768,workBytes:2048,contextBytes:4000} as const;
export const ARC_PLATFORM_APP_BUDGETS_MICROS={free:10000,paid:500000} as const;
export type ArcPlanId = 'free'|'connect-unlimited-v1'|'arc-plus-v1'|'arc-pro-v1';
/** Connect-only paid plan. Users bring their own AI client; Remote Arc provides
 * secure remote execution. No included hosted inference or monthly Credits;
 * like every account it may use the one-time Arc trial. */
export const CONNECT_UNLIMITED_PLAN_ID = 'connect-unlimited-v1';
/** Published fair-use guards for plans whose calls/devices are unlimited.
 * These are rate limits, never hidden monthly quotas. */
export const CONNECT_FAIR_USE = {computerRegistrationsPerDay:20,browserInstallations:20} as const;
/** Ordered by precedence: a later entry wins when several assignments are active.
 * `null` limits are explicit unlimited entitlements, never magic large numbers. */
export const ARC_PLANS = [
  {id:'free',label:'Free',monthlyPriceCents:0,monthlyCredits:0,connectToolCalls:10000,deviceLimit:2,connectionLimit:5,allHostedModels:false,concurrentRuns:1,routines:3,maxSteps:8,maxTokens:24000,maxSeconds:180},
  {id:'connect-unlimited-v1',label:'Connect Unlimited',monthlyPriceCents:1900,monthlyCredits:0,connectToolCalls:null,deviceLimit:null,connectionLimit:50,allHostedModels:false,concurrentRuns:1,routines:3,maxSteps:8,maxTokens:24000,maxSeconds:180},
  {id:'arc-plus-v1',label:'Plus',monthlyPriceCents:3900,monthlyCredits:1500,connectToolCalls:null,deviceLimit:10,connectionLimit:50,allHostedModels:true,concurrentRuns:2,routines:20,maxSteps:16,maxTokens:48000,maxSeconds:600},
  {id:'arc-pro-v1',label:'Pro',monthlyPriceCents:7900,monthlyCredits:5000,connectToolCalls:null,deviceLimit:20,connectionLimit:200,allHostedModels:true,concurrentRuns:5,routines:100,maxSteps:32,maxTokens:96000,maxSeconds:1800}
] as const;
export const arcPlan=(id:string)=>ARC_PLANS.find(plan=>plan.id===id)??ARC_PLANS[0];
export const ARC_TOPUPS=[{id:'arc-topup-500-v1',credits:500,priceCents:1000}] as const;
/** Enterprise is negotiated; no automatic entitlement or unlimited usage grant. */
export const ARC_ENTERPRISE={id:'enterprise',label:'Enterprise',pricing:'contact_sales',allHostedModels:true} as const;

/** Standard tier, USD microdollars per million tokens. Reviewed 2026-10-19.
 * This is shared by the gateway, billing UI and SaaS economics tools. */
export const ARC_PREMIUM_MODELS = [
  {id:'gpt-6-luna',label:'GPT-6 Luna',provider:'openai',model:'gpt-6-luna',maxOutputTokens:4096,inputMicrosPerMillion:100000,outputMicrosPerMillion:500000,cachedInputMicrosPerMillion:10000,cacheWriteMicrosPerMillion:125000},
  // Terra Standard rates reviewed 2026-10-27: https://developers.openai.com/api/docs/models/gpt-6.1-terra
  {id:'gpt-6.1-terra',label:'GPT-6.1 Terra',provider:'openai',model:'gpt-6.1-terra',maxOutputTokens:4096,inputMicrosPerMillion:1000000,outputMicrosPerMillion:5000000,cachedInputMicrosPerMillion:50000,cacheWriteMicrosPerMillion:1250000,longContext:{thresholdTokens:272000,inputMicrosPerMillion:2000000,outputMicrosPerMillion:7500000,cachedInputMicrosPerMillion:100000,cacheWriteMicrosPerMillion:2500000}},
  {id:'gpt-6.1-sol',label:'GPT-6.1 Sol',provider:'openai',model:'gpt-6.1-sol',maxOutputTokens:4096,inputMicrosPerMillion:2000000,outputMicrosPerMillion:10000000,cachedInputMicrosPerMillion:100000,cacheWriteMicrosPerMillion:2500000},
  {id:'gpt-6-astra',label:'GPT-6 Astra',provider:'openai',model:'gpt-6-astra',maxOutputTokens:4096,inputMicrosPerMillion:10000000,outputMicrosPerMillion:50000000,cachedInputMicrosPerMillion:1000000,cacheWriteMicrosPerMillion:12500000},
  {id:'claude-sonnet-5-5',label:'Claude Sonnet 5.5',provider:'anthropic',model:'claude-sonnet-5-5',maxOutputTokens:4096,inputMicrosPerMillion:2000000,outputMicrosPerMillion:10000000,cachedInputMicrosPerMillion:100000,cacheWriteMicrosPerMillion:4000000,cacheWrite5mMicrosPerMillion:2500000,structuredOutput:true},
  {id:'claude-haiku-5-5',label:'Claude Haiku 5.5',provider:'anthropic',model:'claude-haiku-5-5',maxOutputTokens:4096,inputMicrosPerMillion:100000,outputMicrosPerMillion:500000,cachedInputMicrosPerMillion:10000,cacheWriteMicrosPerMillion:200000,cacheWrite5mMicrosPerMillion:125000,structuredOutput:true},
  {id:'claude-opus-5-5',label:'Claude Opus 5.5',provider:'anthropic',model:'claude-opus-5-5',maxOutputTokens:4096,inputMicrosPerMillion:4000000,outputMicrosPerMillion:20000000,cachedInputMicrosPerMillion:200000,cacheWriteMicrosPerMillion:8000000,cacheWrite5mMicrosPerMillion:5000000,structuredOutput:true},
  // OpenRouter rates are explicit routing ceilings, not a promise of the cheapest endpoint.
  // Uncached rates also apply to cache hits, conservatively covering every eligible route.
  {id:'minimax-m3',label:'MiniMax M3',provider:'openrouter',model:'minimax/minimax-m3',maxOutputTokens:4096,inputMicrosPerMillion:300000,outputMicrosPerMillion:1200000},
  {id:'deepseek-v4.1-flash',label:'DeepSeek V4.1 Flash',provider:'openrouter',model:'deepseek/deepseek-v4.1-flash-1017',maxOutputTokens:4096,inputMicrosPerMillion:300000,outputMicrosPerMillion:1200000},
  {id:'glm-5.3-flash',label:'GLM 5.3 Flash',provider:'openrouter',model:'z-ai/glm-5.3-flash',maxOutputTokens:4096,inputMicrosPerMillion:150000,outputMicrosPerMillion:500000},
  {id:'kimi-k3',label:'Kimi K3',provider:'openrouter',model:'moonshotai/kimi-k3',maxOutputTokens:4096,inputMicrosPerMillion:3000000,outputMicrosPerMillion:15000000},
] as const;

/** Internal gateway defaults. Customer UI imports the named-model list above. */
export const ARC_HOSTED_MODELS = [
  {id:'arc-auto',label:'Auto',provider:'openai',model:'gpt-6-luna',maxOutputTokens:4096,inputMicrosPerMillion:100000,outputMicrosPerMillion:500000,cachedInputMicrosPerMillion:10000,cacheWriteMicrosPerMillion:125000},
  ...ARC_PREMIUM_MODELS,
] as const;


export type SecurityGrant = {
  grantId: string;
  clientId: string;
  clientName: string;
  scopes: string[];
  authorizedAt: string;
  lastTokenIssuedAt: string;
  accessExpiresAt: string;
  refreshExpiresAt: string | null;
  tokenRows: number;
  status: "active" | "refreshable" | "expired";
};

export type SecurityState = {
  mcpPaused: boolean;
  grants: SecurityGrant[];
};

export type DeviceMetadata = {
  id: string;
  name: string;
  platform: string;
  arch?: string;
  hostname?: string;
  agentVersion: string;
  pid?: number;
  backgroundProcess?: boolean;
  executionPaused?: boolean;
  recoveryEnabled?: boolean;
  supervisorActive?: boolean;
  supervisorPid?: number | null;
  supervisorService?: string;
  recoveryVersion?: string | null;
  connectedAt?: string;
  lastSeen?: string;
  capacity?: { observedAt: string; memoryTotalMB: number; memoryAvailableMB: number; cpuPercent?: number; managedProcesses?: number } | null;
};

export type AgentHelloMessage = {
  type: "hello";
  device: DeviceMetadata;
  tools: string[];
  capabilities?: string[];
};

export type DeviceExecutionPolicy = {
  runnerAttentionMode?: "show_and_notify" | "notify_only";
  browserRunnerEnabled?: boolean;
  browserAuth?: {otp:boolean;captcha:boolean;origins:string[];mailbox:string};
  workspaceRoots?: string[];
  taskWorkspaceRoot?: string;
  protectSensitivePaths?: boolean;
  sensitivePaths?: string[];
  sensitiveAllowPaths?: string[];
  undoEnabled?: boolean;
};

export type AgentCallMessage = {
  type: "call";
  id: string;
  tool: string;
  arguments: Record<string, unknown>;
  policy?: DeviceExecutionPolicy;
};

export type AgentResultMessage = {
  type: "result";
  id: string;
  result?: unknown;
  error?: string;
};

/** Internal Dashboard control; not part of the AI tool surface. */
export type RunnerViewControl = { type: "runner_view"; session_id: string; action: "watch" | "stop"; jpeg?: boolean };
export type RunnerVideoSignal = { type: "runner_video"; session_id: string; stream_id: string; action: "start" | "stop" | "offer" | "answer" | "ready" | "ended"; sdp?: string; mid?: string };
export type RunnerAttentionMessage = {
  type: "runner_attention"; event_id: string; session_id: string; task_id: string;
  kind: "captcha" | "sign_in" | "otp" | "scope" | "reminder" | "resolved";
  origin: string; title?: string;
};
export type RunnerAttentionAck = { type: "runner_attention_ack"; event_id: string; kind: RunnerAttentionMessage["kind"] };
export type RunnerFrameMessage = { type: "runner_frame"; session_id: string; data: string };
export type RelayToAgentMessage = AgentCallMessage | RunnerViewControl | RunnerAttentionAck | RunnerVideoSignal;
export type AgentToRelayMessage = AgentHelloMessage | AgentResultMessage | RunnerAttentionMessage | RunnerFrameMessage | RunnerVideoSignal;

export const DEFAULT_RELAY_URL = "wss://remotearc.app";


/** Connect tool capabilities are shared by every account. Plans retain their
 * existing call/device limits and separate Remote Arc-hosted model access. */
export type AccountPlan = "free" | "connect" | "plus";

export type AccountFeature =
  | "binary_read"
  | "durable_tasks"
  | "scheduled_tasks"
  | "planned_agent_goals"
  | "keep_awake"
  | "hosted_planner";

const CONNECT_ACCOUNT_FEATURES = [
  "binary_read",
  "durable_tasks",
  "scheduled_tasks",
  "planned_agent_goals",
  "keep_awake",
] as const satisfies readonly AccountFeature[];

export const ACCOUNT_PLAN_FEATURES: Record<AccountPlan, readonly AccountFeature[]> = {
  free: CONNECT_ACCOUNT_FEATURES,
  connect: CONNECT_ACCOUNT_FEATURES,
  plus: [...CONNECT_ACCOUNT_FEATURES, "hosted_planner"],
};

export const ACCOUNT_PLAN_LABELS: Record<AccountPlan, string> = {
  free: "Free",
  connect: "Connect Unlimited",
  plus: "Plus",
};

export function accountPlanHasFeature(
  plan: AccountPlan,
  feature: AccountFeature,
) {
  return ACCOUNT_PLAN_FEATURES[plan].includes(feature);
}
export type {ArcVerification,ArcReceipt} from './arc-verification.js';

export type {ArcEmployeeDraft,ArcEmployeeAvatar,ArcEmployeeScope,ArcEmployeeProfile,ArcEmployee,ArcTeamProfile,ArcTeam,ArcTeamRoom,ArcTeamEvent} from './arc-teams.js';
export type {ArcDelegationProgress} from './arc-teams.js';
export type {ArcAttachment,ArcLocation} from './arc-inputs.js';
export const ARC_INPUT_LIMITS={filesPerMessage:3,fileBytes:2*1024*1024,userBytes:32*1024*1024,imageEdge:2048,textChars:16000} as const;
export type ArcAppConnectionRequest={id:string;sourceRunId:string;provider:string;name:string;brand:string;auth:'oauth'|'api_key';configured:boolean;status:'pending'|'resumed'|'cancelled'|'expired';expiresAt:string};
