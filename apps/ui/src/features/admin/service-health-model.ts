import type { MessageKey } from "../../locales/locale-catalog.js";
import type { PaymentHealth } from "@remotearc/protocol";
import type { DeviceExecutionHealth } from "./device-execution-health-model.js";
export type Incident = {
  id: string;
  created_at: string;
  severity: string;
  kind: string;
  method?: string | null;
  path?: string | null;
  message: string;
  status_code?: number | null;
  colo?: string | null;
  ray_id?: string | null;
};
export type DeviceReliabilityHealth = {
  coverage: "observed" | "no_samples" | "unavailable";
  scope: "none" | "single_device" | "multiple_devices";
  windows: Array<{
    minutes: number;
    counts: {
      connections: number;
      disconnects: number;
      heartbeats: number;
      observedDevices: number;
      reconnects: number;
      reconnectingDevices: number;
    };
  }>;
  groups: Array<{
    platform: string;
    agentVersion: string;
    connections: number;
    reconnects: number;
    observedDevices: number;
  }>;
  groupsTruncated: boolean;
  trend: Array<{ minute: string; connections: number; disconnects: number; heartbeats: number }>;
  signal: {
    phase: "healthy" | "pending" | "firing" | "recovering";
    last_evaluated_at: string;
    last_notification_at: string | null;
  } | null;
};
export type HealthSnapshot = {
  status: string;
  checkedAt: string;
  worker: {
    status: string;
    errors15m: number;
    errors1h: number;
    errors24h: number;
  };
  dependencies: {
    d1: {
      status: string;
    };
    durableObjects: {
      status: string;
    };
  };
  alerts: {
    emailConfigured: boolean;
    destination: string | null;
    recent: unknown[];
  };
  account: {
    users: number;
    devices: number;
    activeTokens: number;
  };
  incidents: Incident[];
  deviceExecution?: DeviceExecutionHealth;
  deviceReliability?: DeviceReliabilityHealth;
  payments?: PaymentHealth;
};
export type ErrorDefinition = {
  code: string;
  category: string;
  label: string;
  meaning: string;
  meaningEn?: string;
  action: string;
  actionEn?: string;
  attention: boolean;
  sources: string[];
};
export type FailureGroup = {
  domain: string;
  code: string;
  category: string;
  total: number;
  affectedUsers: number;
  affectedDevices: number;
  firstSeen: string;
  lastSeen: string;
  definition: ErrorDefinition;
};
export type FailureEvent = {
  id: string;
  occurred_at: string;
  domain: string;
  name: string;
  source: string;
  user_id: string | null;
  userName: string | null;
  userEmail: string | null;
  device_id: string | null;
  deviceName: string | null;
  devicePlatform: string | null;
  app_provider: string | null;
  operation: string | null;
  trace_id: string;
  entity_id: string | null;
  route: string | null;
  http_status: number | null;
  duration_ms: number | null;
  deployment: string | null;
  definition: ErrorDefinition;
};
export type MonitoringSnapshot = {
  checkedAt: string;
  from: string;
  hours: number;
  retentionDays: number;
  coverage: string;
  summary: {
    total: number;
    attention: number;
    affectedUsers: number;
    affectedDevices: number;
    browserReports: number;
    lastSeen: string | null;
  };
  facets: {
    domain: string;
    category: string;
    total: number;
  }[];
  groups: FailureGroup[];
  groupsTruncated: boolean;
  events: FailureEvent[];
  nextCursor: string | null;
  showEvents: boolean;
};
export const categoryLabels: Record<string, MessageKey> = {
  quota: "admin.serviceHealthModel.usageCapacity",
  access: "admin.serviceHealthModel.accessPermissions",
  validation: "admin.serviceHealthModel.requestsConfiguration",
  conflict: "admin.serviceHealthModel.stateConflicts",
  dependency: "admin.serviceHealthModel.servicesDependencies",
  execution: "admin.serviceHealthModel.execution",
  client: "admin.serviceHealthModel.browserReports",
  unknown: "admin.serviceHealthModel.unclassified",
};
export const domainLabels: Record<string, MessageKey> = {
  billing: "admin.serviceHealthModel.billing",
  auth: "admin.serviceHealthModel.signIn",
  oauth: "admin.serviceHealthModel.oauth",
  devices: "admin.serviceHealthModel.devicesBrowsers",
  apps: "admin.serviceHealthModel.apps",
  tasks: "admin.serviceHealthModel.arcWork",
  automations: "admin.serviceHealthModel.automations",
  client: "admin.serviceHealthModel.webClient",
  mcp: "admin.serviceHealthModel.mcpTools",
  admin: "admin.serviceHealthModel.admin",
  platform: "admin.serviceHealthModel.platform",
  notifications: "admin.serviceHealthModel.emailDelivery",
};
export function groupIncidents(items: Incident[]) {
  const groups = new Map<
    string,
    {
      key: string;
      count: number;
      items: Incident[];
    }
  >();
  for (const item of items) {
    const key =
      item.kind === "synthetic_d1_failure" || item.message.startsWith("D1_ERROR:")
        ? "database"
        : item.kind === "exception"
          ? "exceptions"
          : "http";
    const group = groups.get(key) || { key, count: 0, items: [] };
    group.count++;
    group.items.push(item);
    groups.set(key, group);
  }
  return [...groups.values()];
}
