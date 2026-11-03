import type { DeviceExecutionHealth } from './device-execution-health.js';
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
export const categoryLabels: Record<string, [
    string,
    string
]> = { quota: ['Usage & capacity', '额度与容量'], access: ['Access & permissions', '授权与权限'], validation: ['Requests & configuration', '请求与配置'], conflict: ['State conflicts', '状态冲突'], dependency: ['Services & dependencies', '服务与依赖'], execution: ['Execution', '执行异常'], client: ['Browser reports', '前端异常'], unknown: ['Unclassified', '未分类'] };
export const domainLabels: Record<string, [
    string,
    string
]> = { billing: ['Billing', '支付与套餐'], auth: ['Sign-in', '账号登录'], oauth: ['OAuth', 'OAuth 授权'], devices: ['Devices & browsers', '设备与浏览器'], apps: ['Apps', 'App 连接'], tasks: ['Arc work', 'Arc 任务'], automations: ['Automations', '自动化'], client: ['Web client', '网页端'], mcp: ['MCP tools', 'MCP 工具'], admin: ['Admin', '管理后台'], platform: ['Platform', '平台接口'], notifications: ['Email delivery', '邮件投递'] };
export function groupIncidents(items: Incident[]) { const groups = new Map<string, {
    key: string;
    count: number;
    items: Incident[];
}>(); for (const item of items) {
    const key = item.kind === 'synthetic_d1_failure' || item.message.startsWith('D1_ERROR:') ? 'database' : item.kind === 'exception' ? 'exceptions' : 'http';
    const group = groups.get(key) || { key, count: 0, items: [] };
    group.count++;
    group.items.push(item);
    groups.set(key, group);
} return [...groups.values()]; }
