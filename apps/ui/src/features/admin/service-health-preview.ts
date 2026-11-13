import type { MonitoringSnapshot } from "./service-health-model.js";
export function monitoringPreview(
  details = false,
  query = new URLSearchParams(),
): MonitoringSnapshot {
  const at = new Date().toISOString(),
    first = new Date(Date.now() - 3600000).toISOString();
  const definitions = [
    {
      code: "BILLING_INVALID_PLAN_CHANGE",
      meaningEn: "The current subscription does not support this plan change.",
      actionEn:
        "Check the current subscription and target plan. First-time purchases should use checkout.",
      category: "conflict",
      label: "状态冲突",
      meaning:
        "套餐变更不适用于当前订阅：可能没有可变更的付费订阅、目标套餐相同，或订阅状态不支持变更。",
      action: "核对账号订阅与目标套餐；首次购买应使用购买流程。",
      attention: false,
      sources: ["billing/stripe-billing.ts"],
    },
    {
      code: "DEVICE_TIMEOUT",
      meaningEn:
        "The device did not reply before the deadline. The operation may have executed; its result is unknown.",
      actionEn: "Check device wake state, connection and execution history before retrying.",
      category: "execution",
      label: "执行异常",
      meaning: "设备未在等待窗口内返回。操作可能已执行，当前结果未知。",
      action: "检查设备唤醒与连接，核对执行记录后再决定是否重试。",
      attention: true,
      sources: ["devices/device-call.ts"],
    },
    {
      code: "APP_REAUTHORIZATION_REQUIRED",
      meaningEn: "The App authorization expired, was revoked or lacks a required scope.",
      actionEn: "Check the account and permissions, then ask the user to reauthorize.",
      category: "access",
      label: "授权与权限",
      meaning: "App 授权已过期、撤销或缺少所需权限，需要重新连接。",
      action: "核对连接账号及权限，请用户重新授权。",
      attention: false,
      sources: ["apps/apps.ts"],
    },
    {
      code: "MONTHLY_LIMIT_REACHED",
      meaningEn: "The monthly tool-call allowance has been used up.",
      actionEn: "Show the user upgrade options or wait for the monthly reset.",
      category: "quota",
      label: "额度与容量",
      meaning: "本月工具调用额度已用满。",
      action: "提示用户查看升级选项或等待下月重置。",
      attention: false,
      sources: ["billing/usage.ts"],
    },
  ];
  const value: MonitoringSnapshot = {
    checkedAt: at,
    from: first,
    hours: 24,
    retentionDays: 30,
    coverage: "observed",
    summary: {
      total: 27,
      attention: 4,
      affectedUsers: 6,
      affectedDevices: 2,
      browserReports: 0,
      lastSeen: at,
    },
    facets: definitions.map((d, i) => ({
      domain: ["billing", "devices", "apps", "mcp"][i]!,
      category: d.category,
      total: [3, 4, 8, 12][i]!,
    })),
    groups: definitions.map((d, i) => ({
      domain: ["billing", "devices", "apps", "mcp"][i]!,
      code: d.code,
      category: d.category,
      total: [3, 4, 8, 12][i]!,
      affectedUsers: [1, 2, 2, 1][i]!,
      affectedDevices: i === 1 ? 2 : 0,
      firstSeen: first,
      lastSeen: at,
      definition: d,
    })),
    groupsTruncated: false,
    events: details
      ? [
          {
            id: "preview-event",
            occurred_at: at,
            domain: "billing",
            name: "billing.plan.changed",
            source: "server",
            user_id: "sample-user",
            userName: "Alex Morgan",
            userEmail: "alex@example.invalid",
            device_id: null,
            deviceName: null,
            devicePlatform: null,
            app_provider: null,
            operation: "POST",
            trace_id: "11111111-1111-4111-8111-111111111111",
            entity_id: null,
            route: "/api/billing/plan/change",
            http_status: 409,
            duration_ms: 42,
            deployment: "1234567890abcdef",
            definition: definitions[0]!,
          },
        ]
      : [],
    nextCursor: null,
    showEvents: details,
  };
  const matches = value.groups.filter(
    (group) =>
      (!query.get("domain") || group.domain === query.get("domain")) &&
      (!query.get("code") || group.code === query.get("code")) &&
      (!query.get("mode") || (query.get("mode") === "attention") === group.definition.attention) &&
      (!query.get("deviceId") ||
        (group.affectedDevices > 0 && query.get("deviceId") === "sample-mac-device")) &&
      (!query.get("email") || query.get("email") === "alex@example.invalid") &&
      (!query.get("trace") || query.get("trace") === "11111111-1111-4111-8111-111111111111"),
  );
  value.facets = matches.map((group) => ({
    domain: group.domain,
    category: group.category,
    total: group.total,
  }));
  value.groups = matches.filter(
    (group) => !query.get("category") || group.category === query.get("category"),
  );
  value.summary.total = value.groups.reduce((sum, g) => sum + g.total, 0);
  value.summary.attention = value.groups
    .filter((g) => g.definition.attention)
    .reduce((sum, g) => sum + g.total, 0);
  value.summary.affectedUsers = value.groups.reduce((sum, g) => sum + g.affectedUsers, 0);
  value.summary.affectedDevices = value.groups.reduce((sum, g) => sum + g.affectedDevices, 0);
  value.hours = Number(query.get("hours") || 24);
  const group = value.groups[0];
  if (details && group && value.events[0]) {
    const event = value.events[0];
    event.domain = group.domain;
    event.definition = group.definition;
    event.name =
      group.domain === "devices"
        ? "device.tool.completed"
        : group.domain === "apps"
          ? "app.call.failed"
          : group.domain === "mcp"
            ? "mcp.tool.failed"
            : "billing.plan.changed";
    event.http_status =
      group.domain === "devices"
        ? 504
        : group.domain === "apps"
          ? 401
          : group.domain === "mcp"
            ? 429
            : 409;
    event.operation =
      group.domain === "devices"
        ? "read_file"
        : group.domain === "apps"
          ? "messages.list"
          : group.domain === "mcp"
            ? "list_devices"
            : "POST";
    event.route =
      group.domain === "billing"
        ? "/api/billing/plan/change"
        : group.domain === "devices"
          ? "/device-tools/read_file"
          : group.domain === "apps"
            ? "/api/apps/:action"
            : "/mcp";
    if (group.affectedDevices) {
      event.device_id = "sample-mac-device";
      event.deviceName = "Example Mac";
      event.devicePlatform = "darwin";
    }
    if (group.domain === "apps") event.app_provider = "gmail";
  } else value.events = [];
  return value;
}
