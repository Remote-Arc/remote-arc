// Keep protocol runtime exports self-contained for native Node type stripping.
/** Launch recommendation; checkout stays disabled until configured and reviewed. */
export const ARC_CREDIT_RATE = {version:'arc-credits-v1',unitsPerCredit:1000,costMicrosPerUnit:2} as const;
export const ARC_TRIAL_CREDITS = 200;
export type ArcPlanId = 'free'|'arc-plus-v1'|'arc-pro-v1';
export const ARC_PLANS = [
  {id:'free',label:'Free',monthlyPriceCents:0,monthlyCredits:0,connectToolCalls:500,deviceLimit:2,connectionLimit:5,allHostedModels:false,concurrentRuns:1,routines:3,maxSteps:8,maxTokens:24000,maxSeconds:180},
  {id:'arc-plus-v1',label:'Plus',monthlyPriceCents:2900,monthlyCredits:1500,connectToolCalls:20000,deviceLimit:5,connectionLimit:50,allHostedModels:true,concurrentRuns:2,routines:20,maxSteps:16,maxTokens:48000,maxSeconds:600},
  {id:'arc-pro-v1',label:'Pro',monthlyPriceCents:7900,monthlyCredits:5000,connectToolCalls:100000,deviceLimit:20,connectionLimit:200,allHostedModels:true,concurrentRuns:5,routines:100,maxSteps:32,maxTokens:96000,maxSeconds:1800}
] as const;
export const arcPlan=(id:string)=>ARC_PLANS.find(plan=>plan.id===id)??ARC_PLANS[0];
export const ARC_TOPUPS=[{id:'arc-topup-500-v1',credits:500,priceCents:1000}] as const;
/** Enterprise is negotiated; no automatic entitlement or unlimited usage grant. */
export const ARC_ENTERPRISE={id:'enterprise',label:'Enterprise',pricing:'contact_sales',allHostedModels:true} as const;


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

export type RelayToAgentMessage = AgentCallMessage;
export type AgentToRelayMessage = AgentHelloMessage | AgentResultMessage;

export const DEFAULT_RELAY_URL = "wss://remotearc.app";


export type AccountPlan = "free" | "plus";

export type AccountFeature =
  | "binary_read"
  | "durable_tasks"
  | "scheduled_tasks"
  | "planned_agent_goals"
  | "keep_awake";

export const ACCOUNT_PLAN_FEATURES: Record<AccountPlan, readonly AccountFeature[]> = {
  free: [],
  plus: [
    "binary_read",
    "durable_tasks",
    "scheduled_tasks",
    "planned_agent_goals",
    "keep_awake",
  ],
};

export const ACCOUNT_PLAN_LABELS: Record<AccountPlan, string> = {
  free: "Free",
  plus: "Plus",
};

export function accountPlanHasFeature(
  plan: AccountPlan,
  feature: AccountFeature,
) {
  return ACCOUNT_PLAN_FEATURES[plan].includes(feature);
}
