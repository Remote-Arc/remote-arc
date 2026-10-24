import type { OAuthIdentity } from "./auth.js";
import { writeAudit } from "./audit.js";
import { recordMcpTelemetry } from "./relay-telemetry.js";
import {
  approvalTargetPath,
  consumeWriteApproval,
  findApprovedWriteApproval,
  requestWriteApproval,
} from "./approvals.js";
import { REVIEWER_DEMO_TOOLS, reviewerDemoResult } from "./reviewer-fixture.js";
import { isBrowserRunnerTool } from "./browser-runner-mcp.js";

// A timeout proves only that the Relay did not observe the reply, not that
// the device failed to execute the request.
export function isDeviceCallTimeoutError(error: unknown): boolean {
  return /device call timed out/i.test(error instanceof Error ? error.message : String(error));
}

export class UncertainDeviceDispatchError extends Error {
  constructor(readonly tool: string) {
    super("Device did not acknowledge " + tool + "; the operation may still be running. Inspect the device before any new dispatch.");
    this.name = "UncertainDeviceDispatchError";
  }
}

export type DeviceCallEnv = {
  DB: D1Database;
  REGISTRY: DurableObjectNamespace;
  REVIEWER_DEMO_DEVICE_ID?: string;
  MCP_ANALYTICS?: AnalyticsEngineDataset;
  MCP_METRICS_SAMPLE_RATE?: string;
};

const parseStoredStringArray = (value: string | null) => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
};

const registry = (env: DeviceCallEnv, userId: string) =>
  env.REGISTRY.getByName("user:" + userId);

export async function callDevice(
  env: DeviceCallEnv,
  identity: OAuthIdentity,
  deviceId: string,
  tool: string,
  args: Record<string, unknown>,
  taskWorkspaceRoot?: string,
  runnerRunId?: string,
) {
  const started = Date.now();
  const ownedDevice = await env.DB.prepare(
    `SELECT id, platform, allowed_tools, workspace_roots, sensitive_paths, sensitive_allow_paths,
            protect_sensitive_paths, undo_enabled, runner_attention_mode
     FROM devices
     WHERE id = ?1 AND user_id = ?2 AND revoked_at IS NULL`,
  )
    .bind(deviceId, identity.userId)
    .first<{
      id: string;
      platform: string | null;
      allowed_tools: string | null;
      workspace_roots: string | null;
      sensitive_paths: string | null;
      sensitive_allow_paths: string | null;
      protect_sensitive_paths: number;
      undo_enabled: number;
      runner_attention_mode?: string;
    }>();

  if (!ownedDevice) {
    throw new Error("device not found or revoked");
  }

  // Point an AI that picked the wrong browser family at the right one before
  // the call reaches a device that cannot serve it.
  if (isBrowserRunnerTool(tool) && ownedDevice.platform === "browser") {
    throw new Error(
      'tool "' + tool + '" is not available on a browser extension device. browser_runner runs on a linked computer; for this shared tab use shared_tab_read, shared_tab_click or shared_tab_fill.',
    );
  }
  if (/^browser_(?!runner_)/.test(tool) && ownedDevice.platform && ownedDevice.platform !== "browser") {
    throw new Error(
      'tool "' + tool + '" is not available on this computer. Shared-tab tools need the browser extension device; for a background browser task on this computer use browser_runner_start.',
    );
  }

  if (env.REVIEWER_DEMO_DEVICE_ID && deviceId === env.REVIEWER_DEMO_DEVICE_ID) {
    if (!REVIEWER_DEMO_TOOLS.includes(tool as (typeof REVIEWER_DEMO_TOOLS)[number])) {
      throw new Error('tool "' + tool + '" is disabled for the OpenAI review fixture');
    }
    return reviewerDemoResult(env, identity.userId, tool, args);
  }

  // Keep the ordinary computer-tool path compatible with devices whose D1
  // schema predates task permissions. Only the keep-awake control needs the
  // newer automation_permissions column.
  if (tool === "set_task_keep_awake" && args.seconds !== 0) {
    let automationPermissions: string | null = null;
    try {
      const row = await env.DB.prepare(
        `SELECT automation_permissions FROM devices
         WHERE id = ?1 AND user_id = ?2 AND revoked_at IS NULL`,
      )
        .bind(deviceId, identity.userId)
        .first<{ automation_permissions: string | null }>();
      automationPermissions = row?.automation_permissions ?? null;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/no such column:\s*automation_permissions/i.test(message)) throw error;
    }

    if (JSON.parse(automationPermissions || "{}").keep_awake !== true) {
      throw new Error("Task keep-awake is disabled for this device.");
    }
  }

  if (ownedDevice.allowed_tools && tool !== "set_task_keep_awake") {
    let allowedTools: string[] = [];
    try {
      const parsed = JSON.parse(ownedDevice.allowed_tools);
      if (Array.isArray(parsed)) {
        allowedTools = parsed.filter((item): item is string => typeof item === "string");
      }
    } catch {
      allowedTools = [];
    }
    // Extension 0.4.0 actions are covered by the click & fill permission an
    // already-paired browser has; each site is still allowed in the browser.
    const permissionTool = tool === "browser_runner_wait" ? "browser_runner_snapshot" : tool === "goal_workspace" ? "start_process" : tool === "browser_open_tab" || tool === "browser_act" ? "browser_click" : tool;
    if (!allowedTools.includes(permissionTool)) {
      throw new Error('tool "' + tool + '" is disabled for this device');
    }
  }

  // browser_runner acts on websites for the user. It is never implied by a
  // legacy device with no stored tool list: each tool must be enabled
  // explicitly for this computer.
  if (isBrowserRunnerTool(tool) && !parseStoredStringArray(ownedDevice.allowed_tools).includes(tool === "browser_runner_wait" ? "browser_runner_snapshot" : tool)) {
    throw new Error(
      'tool "' + tool + '" is disabled for this device. Enable browser_runner for this computer in the Remote Arc dashboard.',
    );
  }

  const workspaceRoots = parseStoredStringArray(ownedDevice.workspace_roots);
  const workspaceRequiredTools = new Set([
    "undo_last_change",
    "undo_change",
    "start_process",
  ]);
  if (
    workspaceRequiredTools.has(tool) &&
    workspaceRoots.length === 0 &&
    !taskWorkspaceRoot
  ) {
    throw new Error(
      'tool "' + tool + '" requires a Trusted Write Location on this device',
    );
  }

  const requestId = crypto.randomUUID();
  const scopeChange = tool === "browser_runner_start" && typeof args.scope_change_reason === "string" && args.scope_change_reason.trim().length > 0;
  const mutationTarget = approvalTargetPath(tool, args);
  const approvedWrite = mutationTarget
    ? await findApprovedWriteApproval(env, identity, deviceId, tool, args)
    : null;

  // An exact user-approved scope change (once or saved until revoked) is
  // needed before any new site reaches the Go Agent.
  if (scopeChange && !approvedWrite) {
    const approval = await requestWriteApproval(env, { identity, deviceId, requestId, tool, args });
    throw new Error("SCOPE_CHANGE_REQUIRED: approve the exact sites in Dashboard Security & access / Pending approvals (" + (approval?.id ?? "pending") + ") and retry the same request.");
  }

  if (
    mutationTarget &&
    workspaceRoots.length === 0 &&
    !approvedWrite &&
    !taskWorkspaceRoot
  ) {
    const approval = await requestWriteApproval(env, {
      identity,
      deviceId,
      requestId,
      tool,
      args,
    });
    throw new Error(
      approval
        ? "Remote Arc approval required (" +
            approval.id +
            ") before writing " +
            mutationTarget
        : "Remote Arc approval required before this out-of-scope write",
    );
  }

  const readOnlyPathTools = new Set([
    "read_file",
    "read_binary_file",
    "list_directory",
    "get_file_info",
    "browse_directories",
  ]);
  const effectiveWorkspaceRoots = readOnlyPathTools.has(tool)
    ? []
    : [
        ...workspaceRoots,
        ...(approvedWrite && !scopeChange ? [approvedWrite.target_path] : []),
      ];

  let effectiveArgs = tool === "browser_runner_start"
    ? { ...args, scope_change_approved: scopeChange && !!approvedWrite }
    : args;
  if (tool === "start_process") {
    const explicitCwd =
      typeof args.cwd === "string" && args.cwd.trim() ? args.cwd : undefined;
    const implicitCwd =
      !explicitCwd && taskWorkspaceRoot
        ? taskWorkspaceRoot
        : !explicitCwd && workspaceRoots.length === 1
          ? workspaceRoots[0]
          : undefined;

    if (!explicitCwd && !implicitCwd && workspaceRoots.length > 1) {
      throw new Error(
        "start_process requires cwd when multiple Trusted Write Locations are configured.",
      );
    }

    if (implicitCwd) {
      effectiveArgs = { ...args, cwd: implicitCwd };
    }
  }

  if (isBrowserRunnerTool(tool) && identity.clientId !== "dashboard") {
    const sessionId = tool === "browser_runner_start" ? args.task_id : args.session_id;
    if (typeof sessionId === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(sessionId)) {
      await env.DB.prepare("INSERT INTO runner_session_links(user_id,device_id,session_id,run_id) VALUES(?1,?2,?3,?4) ON CONFLICT(user_id,device_id,session_id) DO UPDATE SET run_id=excluded.run_id")
        .bind(identity.userId,deviceId,sessionId,runnerRunId || null).run();
    }
  }

  const registryRequest = () =>
    new Request("https://registry/call", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-remote-link-user-id": identity.userId,
      },
      body: JSON.stringify({
        requestId,
        deviceId,
        tool,
        arguments: effectiveArgs,
        policy: {
          ...(taskWorkspaceRoot ? { taskWorkspaceRoot } : {}),
          workspaceRoots: effectiveWorkspaceRoots,
          sensitivePaths: parseStoredStringArray(ownedDevice.sensitive_paths),
          sensitiveAllowPaths: parseStoredStringArray(ownedDevice.sensitive_allow_paths),
          // Read the per-device setting on every call. A missing or new D1
          // setting remains fail-closed (protected) by default.
          protectSensitivePaths: ownedDevice.protect_sensitive_paths !== 0,
          undoEnabled: ownedDevice.undo_enabled !== 0,
          runnerAttentionMode: ownedDevice.runner_attention_mode === "notify_only" ? "notify_only" : "show_and_notify",
          browserRunnerEnabled: parseStoredStringArray(ownedDevice.allowed_tools).includes("browser_runner_act"),
        },
      }),
    });

  let response = await registry(env, identity.userId).fetch(registryRequest());
  if (response.status === 404) {
    response = await env.REGISTRY.getByName("global").fetch(registryRequest());
  }

  const payload = (await response.json()) as { result?: unknown; error?: string };
  const success = response.ok && !payload.error;
  let outcome = success
    ? "allowed"
    : payload.error?.startsWith("Blocked by Remote Arc Safety Guard:")
      ? "safety_guard_block"
      : "device_error";

  if (
    !success &&
    mutationTarget &&
    !approvedWrite &&
    (
      payload.error?.startsWith("Blocked by Remote Arc Trusted Write Locations:") ||
      payload.error?.startsWith("Blocked by Remote Arc Workspace Scope:")
    )
  ) {
    const approval = await requestWriteApproval(env, {
      identity,
      deviceId,
      requestId,
      tool,
      args,
    });
    if (approval) {
      payload.error =
        "Remote Arc approval required (" +
        approval.id +
        ") before writing " +
        mutationTarget;
      outcome = "approval_required";
    }
  }

  await writeAudit(env, {
    userId: identity.userId,
    deviceId,
    eventType: "mcp.tool_call",
    toolName: tool,
    success,
    requestId,
    clientId: identity.clientId,
    grantId: identity.grantId,
    outcome,
  }).catch(() => undefined);

  recordMcpTelemetry(env, {
    kind: "device_tool",
    status: success ? 200 : 502,
    method: "TOOL",
    outcome,
    durationMs: Date.now() - started,
  });

  if (!success) {
    throw new Error(payload.error || `device call failed: ${response.status}`);
  }

  await consumeWriteApproval(env, approvedWrite).catch(() => undefined);
  return payload.result;
}
