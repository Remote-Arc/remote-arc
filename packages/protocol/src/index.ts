// Keep protocol runtime exports self-contained for native Node type stripping.
export type {
  ServiceMetrics,
  ServiceMetricsPoint,
  BusinessHealthMetrics,
} from "./service-metrics.js";
export type {
  PaymentHealth,
  PaymentSignal,
  PaymentSignalKey,
  PaymentWindow,
} from "./payment-health.js";
/** Bootstrap defaults for migrations, previews and planning. Runtime commercial terms come from versioned D1 configuration. */
export const ARC_CREDIT_RATE = {
  version: "arc-credits-v1",
  unitsPerCredit: 1000,
  costMicrosPerUnit: 2,
} as const;
export const ARC_TRIAL_CREDITS = 200;
/** Credits one typical hosted Arc task spends. Used only to show a plan's Credits as
 * an approximate task count. Rounded up from the production average per run,
 * reviewed 2026-11-14; named models and long tasks spend more. */
export const ARC_TYPICAL_TASK_CREDITS = 3;
export const ARC_MEMORY_LIMITS = {
  facts: 100,
  work: 40,
  factBytes: 768,
  workBytes: 2048,
  contextBytes: 4000,
} as const;
export const ARC_PLATFORM_APP_BUDGETS_MICROS = { free: 10000, paid: 500000 } as const;
export type ArcPlanId = "free" | "connect-unlimited-v1" | "arc-plus-v1" | "arc-pro-v1";
/** The paid plan, sold as Pro. Its internal id predates the name and stays, since
 * Stripe prices, receipts and commercial versions refer to it. The seed version is
 * Connect-only; a published version may also include monthly Arc Credits. */
export const CONNECT_UNLIMITED_PLAN_ID = "connect-unlimited-v1";
/** The checkout link slug customers see for the paid plan: /checkout?product=pro. */
export const PRO_CHECKOUT_SLUG = "pro";
/** Published fair-use guards for plans whose calls/devices are unlimited.
 * These are rate limits, never hidden monthly quotas. */
export const CONNECT_FAIR_USE = {
  computerRegistrationsPerDay: 20,
  browserInstallations: 20,
} as const;
/** What Free gets after its monthly Connect calls run out: a one-off reverse
 * trial of unlimited calls, then a published slow-lane rate until the monthly
 * reset. Calls are never cut off outright for an eligible Free account. */
export const CONNECT_FREE_OVERFLOW = {
  trialDays: 7,
  slowLaneCallsPerMinute: 2,
} as const;
/** Published monthly binary transfer allowance for Free accounts, shared by
 * read_binary_file and temporary file links. Paid plans have no transfer cap. */
export const FREE_BINARY_BYTES_PER_MONTH = 2 * 1024 ** 3;
/** Background commands a Free account may run at once when its published version
 * predates the term. Paid versions published before it keep no limit (null in
 * ARC_PLANS); a newly published version sets its own number. */
export const FREE_BACKGROUND_TASKS = 1;
/** Ordered by precedence: a later entry wins when several assignments are active.
 * `null` limits are explicit unlimited entitlements, never magic large numbers. */
export const ARC_PLANS = [
  {
    id: "free",
    label: "Free",
    monthlyPriceCents: 0,
    monthlyCredits: 0,
    connectToolCalls: 10000,
    deviceLimit: 2,
    connectionLimit: 5,
    allHostedModels: false,
    concurrentRuns: 1,
    backgroundTasks: 1,
    computerUse: false,
    agentOrchestration: false,
    routines: 3,
    maxSteps: 8,
    maxTokens: 24000,
    maxSeconds: 180,
  },
  {
    id: "connect-unlimited-v1",
    label: "Connect Unlimited",
    monthlyPriceCents: 1900,
    monthlyCredits: 0,
    connectToolCalls: null,
    deviceLimit: null,
    connectionLimit: 50,
    allHostedModels: false,
    concurrentRuns: 1,
    backgroundTasks: null,
    computerUse: true,
    agentOrchestration: true,
    routines: 3,
    maxSteps: 8,
    maxTokens: 24000,
    maxSeconds: 180,
  },
  {
    id: "arc-plus-v1",
    label: "Plus",
    monthlyPriceCents: 3900,
    monthlyCredits: 1500,
    connectToolCalls: null,
    deviceLimit: 10,
    connectionLimit: 50,
    allHostedModels: true,
    concurrentRuns: 2,
    backgroundTasks: null,
    computerUse: true,
    agentOrchestration: true,
    routines: 20,
    maxSteps: 16,
    maxTokens: 48000,
    maxSeconds: 600,
  },
  {
    id: "arc-pro-v1",
    label: "Pro",
    monthlyPriceCents: 7900,
    monthlyCredits: 5000,
    connectToolCalls: null,
    deviceLimit: 20,
    connectionLimit: 200,
    allHostedModels: true,
    concurrentRuns: 5,
    backgroundTasks: null,
    computerUse: true,
    agentOrchestration: true,
    routines: 100,
    maxSteps: 32,
    maxTokens: 96000,
    maxSeconds: 1800,
  },
] as const;
export const arcPlan = (id: string) => ARC_PLANS.find((plan) => plan.id === id) ?? ARC_PLANS[0];
export const ARC_TOPUPS = [{ id: "arc-topup-500-v1", credits: 500, priceCents: 1000 }] as const;
/** Enterprise is negotiated; no automatic entitlement or unlimited usage grant. */
export const ARC_ENTERPRISE = {
  id: "enterprise",
  label: "Enterprise",
  pricing: "contact_sales",
  allHostedModels: true,
} as const;

/** Standard tier, USD microdollars per million tokens. Reviewed 2026-11-26.
 * This is shared by the gateway, billing UI and SaaS economics tools.
 * maxOutputTokens leaves room for a whole file in one write decision plus the
 * model's reasoning, which every provider counts as output. */
export const ARC_PREMIUM_MODELS = [
  {
    id: "gpt-6-luna",
    label: "GPT-6 Luna",
    provider: "openai",
    model: "gpt-6-luna",
    maxOutputTokens: 16384,
    inputMicrosPerMillion: 100000,
    outputMicrosPerMillion: 500000,
    cachedInputMicrosPerMillion: 10000,
    cacheWriteMicrosPerMillion: 125000,
  },
  // Terra Standard rates reviewed 2026-10-27: https://developers.openai.com/api/docs/models/gpt-6.1-terra
  {
    id: "gpt-6.1-terra",
    label: "GPT-6.1 Terra",
    provider: "openai",
    model: "gpt-6.1-terra",
    maxOutputTokens: 16384,
    inputMicrosPerMillion: 1000000,
    outputMicrosPerMillion: 5000000,
    cachedInputMicrosPerMillion: 50000,
    cacheWriteMicrosPerMillion: 1250000,
    longContext: {
      thresholdTokens: 272000,
      inputMicrosPerMillion: 2000000,
      outputMicrosPerMillion: 7500000,
      cachedInputMicrosPerMillion: 100000,
      cacheWriteMicrosPerMillion: 2500000,
    },
  },
  // GPT-6.2 Standard rates reviewed 2026-11-26: https://developers.openai.com/api/docs/models/gpt-6.2-sol
  // and .../gpt-6.2-astra. Over 272K input tokens, input and cache rates double and
  // output is 1.5x for the whole request.
  {
    id: "gpt-6.2-sol",
    label: "GPT-6.2 Sol",
    provider: "openai",
    model: "gpt-6.2-sol",
    maxOutputTokens: 16384,
    inputMicrosPerMillion: 2000000,
    outputMicrosPerMillion: 10000000,
    cachedInputMicrosPerMillion: 100000,
    cacheWriteMicrosPerMillion: 2500000,
    longContext: {
      thresholdTokens: 272000,
      inputMicrosPerMillion: 4000000,
      outputMicrosPerMillion: 15000000,
      cachedInputMicrosPerMillion: 200000,
      cacheWriteMicrosPerMillion: 5000000,
    },
  },
  {
    id: "gpt-6.2-astra",
    label: "GPT-6.2 Astra",
    provider: "openai",
    model: "gpt-6.2-astra",
    maxOutputTokens: 16384,
    inputMicrosPerMillion: 8000000,
    outputMicrosPerMillion: 40000000,
    cachedInputMicrosPerMillion: 400000,
    cacheWriteMicrosPerMillion: 10000000,
    longContext: {
      thresholdTokens: 272000,
      inputMicrosPerMillion: 16000000,
      outputMicrosPerMillion: 60000000,
      cachedInputMicrosPerMillion: 800000,
      cacheWriteMicrosPerMillion: 20000000,
    },
  },
  {
    id: "claude-sonnet-5-5",
    label: "Claude Sonnet 5.5",
    provider: "anthropic",
    model: "claude-sonnet-5-5",
    maxOutputTokens: 16384,
    inputMicrosPerMillion: 2000000,
    outputMicrosPerMillion: 10000000,
    cachedInputMicrosPerMillion: 100000,
    cacheWriteMicrosPerMillion: 4000000,
    cacheWrite5mMicrosPerMillion: 2500000,
    structuredOutput: true,
  },
  {
    id: "claude-haiku-5-5",
    label: "Claude Haiku 5.5",
    provider: "anthropic",
    model: "claude-haiku-5-5",
    maxOutputTokens: 16384,
    inputMicrosPerMillion: 100000,
    outputMicrosPerMillion: 500000,
    cachedInputMicrosPerMillion: 10000,
    cacheWriteMicrosPerMillion: 200000,
    cacheWrite5mMicrosPerMillion: 125000,
    structuredOutput: true,
  },
  {
    id: "claude-opus-5-5",
    label: "Claude Opus 5.5",
    provider: "anthropic",
    model: "claude-opus-5-5",
    maxOutputTokens: 16384,
    inputMicrosPerMillion: 4000000,
    outputMicrosPerMillion: 20000000,
    cachedInputMicrosPerMillion: 200000,
    cacheWriteMicrosPerMillion: 8000000,
    cacheWrite5mMicrosPerMillion: 5000000,
    structuredOutput: true,
  },
  // OpenRouter rates are explicit routing ceilings, not a promise of the cheapest endpoint.
  // Output stays at 4096 until each route's output limit is checked: a request
  // above a route's limit would find no eligible endpoint.
  // Uncached rates also apply to cache hits, conservatively covering every eligible route.
  // Gemini runs through OpenRouter on Google's own endpoints. Standard rates reviewed
  // 2026-11-26 (ai.google.dev/gemini-api/docs/pricing): one rate for the whole 1M
  // context, so the ceiling never undercharges a long request.
  {
    id: "gemini-4-neon",
    label: "Gemini 4 Neon",
    provider: "openrouter",
    model: "google/gemini-4-neon",
    maxOutputTokens: 4096,
    inputMicrosPerMillion: 3000000,
    outputMicrosPerMillion: 15000000,
  },
  {
    id: "gemini-4-hydrogen",
    label: "Gemini 4 Hydrogen",
    provider: "openrouter",
    model: "google/gemini-4-hydrogen",
    maxOutputTokens: 4096,
    inputMicrosPerMillion: 1500000,
    outputMicrosPerMillion: 7500000,
  },
  {
    id: "minimax-m3",
    label: "MiniMax M3",
    provider: "openrouter",
    model: "minimax/minimax-m3",
    maxOutputTokens: 4096,
    inputMicrosPerMillion: 300000,
    outputMicrosPerMillion: 1200000,
  },
  {
    id: "deepseek-v4.1-flash",
    label: "DeepSeek V4.1 Flash",
    provider: "openrouter",
    model: "deepseek/deepseek-v4.1-flash-1017",
    maxOutputTokens: 4096,
    inputMicrosPerMillion: 300000,
    outputMicrosPerMillion: 1200000,
  },
  {
    id: "glm-5.3-flash",
    label: "GLM 5.3 Flash",
    provider: "openrouter",
    model: "z-ai/glm-5.3-flash",
    maxOutputTokens: 4096,
    inputMicrosPerMillion: 150000,
    outputMicrosPerMillion: 500000,
  },
  {
    id: "kimi-k3.1-pro",
    label: "Kimi K3.1 Pro",
    provider: "openrouter",
    model: "moonshotai/kimi-k3.1-pro",
    maxOutputTokens: 4096,
    inputMicrosPerMillion: 2000000,
    outputMicrosPerMillion: 10000000,
  },
] as const;

/** Named models Arc no longer offers, each with the model that replaced it. A chat,
 * Slack setting or team member saved with a retired ID runs on its successor. */
const ARC_MODEL_SUCCESSORS: Readonly<Record<string, string>> = {
  "gpt-6.1-sol": "gpt-6.2-sol",
  "gpt-6-astra": "gpt-6.2-astra",
  "kimi-k3": "kimi-k3.1-pro",
};
/** The ID to run for a saved model choice: its successor when Arc retired it. */
export function currentArcModelId(id: string): string {
  return Object.hasOwn(ARC_MODEL_SUCCESSORS, id) ? ARC_MODEL_SUCCESSORS[id]! : id;
}

/** Internal gateway defaults. Customer UI imports the named-model list above. */
export const ARC_HOSTED_MODELS = [
  {
    id: "arc-auto",
    label: "Auto",
    provider: "openai",
    model: "gpt-6-luna",
    maxOutputTokens: 16384,
    inputMicrosPerMillion: 100000,
    outputMicrosPerMillion: 500000,
    cachedInputMicrosPerMillion: 10000,
    cacheWriteMicrosPerMillion: 125000,
  },
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
  /** One-way hash of the computer's OS identifier; absent from older Agents. */
  machineHash?: string;
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
  capacity?: {
    observedAt: string;
    memoryTotalMB: number;
    memoryAvailableMB: number;
    cpuPercent?: number;
    managedProcesses?: number;
    /** Background tasks only (start_process background=true), from Agents that report it. */
    backgroundProcesses?: number;
  } | null;
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
  browserAuth?: { otp: boolean; captcha: boolean; origins: string[]; mailbox: string };
  workspaceRoots?: string[];
  taskWorkspaceRoot?: string;
  protectSensitivePaths?: boolean;
  sensitivePaths?: string[];
  sensitiveAllowPaths?: string[];
  undoEnabled?: boolean;
  /** The owner allowed start_process to shut down or restart this computer. */
  allowPowerCommands?: boolean;
};

export type AgentCallMessage = {
  /** Relay reply deadline; a waking Agent refuses buffered calls past it. */
  expires_at?: string;
  type: "call";
  id: string;
  tool: string;
  arguments: Record<string, unknown>;
  policy?: DeviceExecutionPolicy;
};

/** Sent in reply to each Agent hello: the Relay's time, in Unix milliseconds. The
 * Agent reads call deadlines against it instead of its own clock. */
export type RelayClockMessage = { type: "clock"; now: number };

export type AgentResultMessage = {
  type: "result";
  id: string;
  result?: unknown;
  error?: string;
};

/** Relay to Agent: a write approval for this device is waiting for a decision. */
export type ApprovalPendingSignal = {
  type: "approval_pending";
};

/** Internal Dashboard control; not part of the AI tool surface. */
export type RunnerViewControl = {
  type: "runner_view";
  session_id: string;
  action: "watch" | "stop";
  jpeg?: boolean;
};
export type RunnerVideoSignal = {
  type: "runner_video";
  session_id: string;
  stream_id: string;
  action: "start" | "stop" | "offer" | "answer" | "ready" | "ended";
  sdp?: string;
  mid?: string;
};
export type RunnerAttentionMessage = {
  type: "runner_attention";
  event_id: string;
  session_id: string;
  task_id: string;
  kind: "captcha" | "sign_in" | "otp" | "scope" | "reminder" | "resolved";
  origin: string;
  title?: string;
};
export type RunnerAttentionAck = {
  type: "runner_attention_ack";
  event_id: string;
  kind: RunnerAttentionMessage["kind"];
};
export type RunnerFrameMessage = { type: "runner_frame"; session_id: string; data: string };
export type RelayToAgentMessage =
  AgentCallMessage | RunnerViewControl | RunnerAttentionAck | RunnerVideoSignal;
/** Output of a Claude Code session the Agent holds open for Agent Orchestration. */
export type AgentSessionEventsMessage = {
  type: "agent_session_events";
  session: string;
  /** The Agent Orchestration run the session belongs to. */
  tag: string;
  /** The sequence number of the first line. */
  from: number;
  lines: string[];
  exited?: boolean;
  exit_code?: number;
  stderr?: string;
};

export type AgentToRelayMessage =
  | AgentHelloMessage
  | AgentResultMessage
  | AgentSessionEventsMessage
  | RunnerAttentionMessage
  | RunnerFrameMessage
  | RunnerVideoSignal;

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

export function accountPlanHasFeature(plan: AccountPlan, feature: AccountFeature) {
  return ACCOUNT_PLAN_FEATURES[plan].includes(feature);
}
export type { ArcVerification, ArcReceipt } from "./arc-verification.js";

export type {
  ArcEmployeeDraft,
  ArcEmployeeAvatar,
  ArcEmployeeScope,
  ArcEmployeeProfile,
  ArcEmployee,
  ArcTeamProfile,
  ArcTeam,
  ArcTeamRoom,
  ArcTeamEvent,
} from "./arc-teams.js";
export type { ArcDelegationProgress } from "./arc-teams.js";
export type { ArcAttachment, ArcLocation } from "./arc-inputs.js";
export const ARC_INPUT_LIMITS = {
  filesPerMessage: 3,
  fileBytes: 2 * 1024 * 1024,
  userBytes: 32 * 1024 * 1024,
  imageEdge: 2048,
  textChars: 16000,
} as const;
export type ArcAppConnectionRequest = {
  id: string;
  sourceRunId: string;
  provider: string;
  name: string;
  brand: string;
  auth: "oauth" | "api_key";
  configured: boolean;
  status: "pending" | "resumed" | "cancelled" | "expired";
  expiresAt: string;
  requiresBetaApproval?: boolean;
  dataPolicy?: { version: string; retentionDays: number };
  permissions?: ("read" | "write")[];
};

/**
 * What a coding agent's model menu may say about a model beyond its name: a
 * preview model only some accounts can use, or one some plans bill to usage
 * credits.
 */
export type AgentModelNote = "preview" | "credits";

// <agent-models>
// Written by `pnpm models:sync` (scripts/agent-models-sync.mjs): do not edit by hand.
/**
 * Each Claude Code alias's model on the Anthropic API, newest first, with the first
 * Claude Code version that runs it (Claude Code's model docs, Version history).
 */
export const CLAUDE_CODE_ALIAS_MODELS: readonly {
  id: string;
  versions: readonly { since: string; name: string }[];
}[] = [
  {
    id: "fable",
    versions: [
      { since: "2.1.321", name: "Fable 5.2" },
      { since: "2.1.257", name: "Fable 5.1" },
    ],
  },
  {
    id: "opus",
    versions: [
      { since: "2.1.280", name: "Opus 5.5" },
      { since: "2.1.219", name: "Opus 5" },
      { since: "2.1.154", name: "Opus 4.8" },
    ],
  },
  {
    id: "sonnet",
    versions: [
      { since: "2.1.284", name: "Sonnet 5.5" },
      { since: "2.1.197", name: "Sonnet 5" },
    ],
  },
  {
    id: "haiku",
    versions: [{ since: "2.1.293", name: "Haiku 5.5" }],
  },
];
/**
 * Gemini CLI's model menu, in its order: Auto, then its models, preview ones first
 * (its published core package, config/models.js).
 */
export const GEMINI_CLI_MODELS: readonly {
  id: string;
  name: string;
  notes?: readonly AgentModelNote[];
}[] = [
  { id: "auto", name: "Auto" },
  { id: "gemini-3.1-pro-preview", name: "Gemini 3.1 Pro Preview", notes: ["preview"] },
  { id: "gemini-3-flash-preview", name: "Gemini 3 Flash Preview", notes: ["preview"] },
  { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro" },
  { id: "gemini-3.1-flash-lite", name: "Gemini 3.1 Flash Lite" },
  { id: "gemini-3.5-flash", name: "Gemini 3.5 Flash" },
];
// </agent-models>

/** What Claude Code's own menu says beside an alias. */
const CLAUDE_CODE_NOTES: Partial<Record<string, readonly AgentModelNote[]>> = {
  fable: ["credits"],
};

/**
 * Claude Code's aliases with the model each runs, newest first, for an account
 * signed in to Anthropic directly. A Claude Code older than every entry, or one
 * signed in through another cloud, may run another model, so the menu then shows
 * the alias alone. The alias is what runs, so Claude Code still applies the
 * account's own plan and any model its organization allows.
 */
export const CLAUDE_CODE_MODELS: readonly {
  id: string;
  versions: readonly { since: string; name: string }[];
  notes?: readonly AgentModelNote[];
}[] = CLAUDE_CODE_ALIAS_MODELS.map((model) => ({
  ...model,
  ...(CLAUDE_CODE_NOTES[model.id] ? { notes: CLAUDE_CODE_NOTES[model.id] } : {}),
}));
