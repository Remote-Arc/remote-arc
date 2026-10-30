import { parseTaskPermissions } from "./device-task-policy.js";
import {startBusinessFlow,advanceBusinessFlow,failBusinessFlow} from '../analytics/business-tracking.js';
import {
  addSecondsIso,
  getSessionUser,
  nowIso,
  randomToken,
  randomUserCode,
  sha256Hex,
} from "../auth/auth.js";
import { writeAudit } from "../analytics/audit.js";
import { REVIEWER_DEMO_TOOLS } from "../auth/reviewer-fixture.js";
import { isReviewerFixture } from "../auth/reviewer-identity.js";
import {billingEnabled,type PlatformLaunchEnv} from '../platform/platform-launch.js';
import {currentArcPlan} from '../arc/arc-plan.js';
import {activeDeviceCapacityBonus} from '../admin/device-capacity-admin.js';
import {CONNECT_FAIR_USE} from '@remotearc/protocol';

type DeviceEnv = PlatformLaunchEnv & {
  DB: D1Database;
  REGISTRY: DurableObjectNamespace;
  PUBLIC_ORIGIN: string;
  REVIEWER_DEMO_DEVICE_ID?: string;
  ANTHROPIC_REVIEWER_DEMO_DEVICE_ID?: string;
};

type DeviceStartBody = {
  device_name?: string;
  platform?: string;
  arch?: string;
  hostname?: string;
};

const DEFAULT_ALLOWED_TOOLS = [
  "list_directory",
  "read_file",
  "read_binary_file",
  "get_file_info",
  "list_processes",
] as const;

const BROWSER_DEFAULT_ALLOWED_TOOLS = [
  "browser_list_tabs",
  "browser_get_current_tab",
  "browser_read_page",
  "browser_get_selected_text",
  "browser_extract_links",
  "browser_extract_table",
  "browser_click",
  "browser_fill",
  "browser_open_tab",
  "browser_act",
] as const;

const parseJsonStringArray = (value: string | null) => {
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

const sanitizePolicyPaths = (value: unknown) => {
  if (!Array.isArray(value) || value.length > 32) return null;
  if (
    !value.every(
      (item) =>
        typeof item === "string" &&
        item.trim().length > 0 &&
        item.trim().length <= 500,
    )
  ) {
    return null;
  }

  return Array.from(new Set(value.map((item) => item.trim())));
};

export async function handleDeviceStart(request: Request, env: DeviceEnv) {
  const body = (await request.json().catch(() => ({}))) as DeviceStartBody;
  const deviceName = (body.device_name || "").trim();
  const platform = (body.platform || "").trim();

  if (!deviceName || !platform) {
    return Response.json(
      { error: "device_name and platform are required" },
      { status: 400 },
    );
  }

  const deviceCode = randomToken();
  const deviceSecret = randomToken();
  const userCode = randomUserCode();
  const pairingCodeHash=await sha256Hex(deviceCode),pairingStartedAt=nowIso(),pairingExpiresAt=addSecondsIso(600);

  await env.DB.prepare(
    `INSERT INTO device_pairings (
      device_code_hash, device_secret_hash, user_code, device_name,
      platform, arch, hostname, status, expires_at, created_at
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'pending', ?8, ?9)`,
  )
    .bind(
      pairingCodeHash,
      await sha256Hex(deviceSecret),
      userCode,
      deviceName,
      platform,
      body.arch || null,
      body.hostname || null,
      pairingExpiresAt,
      pairingStartedAt,
    )
    .run();

  await startBusinessFlow(env,{id:'device:'+pairingCodeHash,scene:'device_pairing',dimension:platform,at:pairingStartedAt,expiresAt:pairingExpiresAt});

  return Response.json({
    device_code: deviceCode,
    device_secret: deviceSecret,
    user_code: userCode,
    verification_uri: env.PUBLIC_ORIGIN + "/device",
    verification_uri_complete:
      env.PUBLIC_ORIGIN + "/device?code=" + encodeURIComponent(userCode),
    expires_in: 600,
    interval: 2,
  });
}

export async function handleDeviceToken(request: Request, env: DeviceEnv) {
  const body = (await request.json().catch(() => ({}))) as {
    device_code?: string;
    device_secret?: string;
  };

  if (!body.device_code || !body.device_secret) {
    return Response.json(
      { error: "device_code and device_secret are required" },
      { status: 400 },
    );
  }

  const codeHash = await sha256Hex(body.device_code);
  const secretHash = await sha256Hex(body.device_secret);

  const pairing = await env.DB.prepare(
    `SELECT status, approved_device_id, approved_user_id, expires_at
     FROM device_pairings
     WHERE device_code_hash = ?1 AND device_secret_hash = ?2`,
  )
    .bind(codeHash, secretHash)
    .first<{
      status: string;
      approved_device_id: string | null;
      approved_user_id: string | null;
      expires_at: string;
    }>();

  if (!pairing || pairing.expires_at <= nowIso()) {
    if(pairing)await failBusinessFlow(env,'device:'+codeHash,'expired');
    return Response.json(
      { error: "expired_token", error_description: "Pairing code expired" },
      { status: 400 },
    );
  }

  if (pairing.status === "pending") {
    return Response.json(
      {
        error: "authorization_pending",
        error_description: "Waiting for browser approval",
      },
      { status: 428 },
    );
  }

  if (pairing.status !== "approved" || !pairing.approved_device_id) {
    return Response.json(
      { error: "access_denied", error_description: "Pairing was denied" },
      { status: 403 },
    );
  }

  await env.DB.prepare(
    "UPDATE device_pairings SET status = 'consumed' WHERE device_code_hash = ?1",
  )
    .bind(codeHash)
    .run();

  await advanceBusinessFlow(env,'device:'+codeHash,'device_pairing','credential',{userId:pairing.approved_user_id,deviceId:pairing.approved_device_id});

  return Response.json({
    device_id: pairing.approved_device_id,
    device_token: body.device_secret,
    relay_url: env.PUBLIC_ORIGIN.replace(/^http/, "ws"),
  });
}

/** Records how far pairing got in the browser. Observability only: it never
 * changes the pairing, and a failure here never blocks the person pairing. */
export async function recordPairingStep(
  env: DeviceEnv,
  rawCode: string,
  step: "opened" | "signed_in",
  userId?: string,
) {
  const code = rawCode.trim().toUpperCase();
  if (!code) return;
  try {
    const pairing = await env.DB.prepare(
      "SELECT device_code_hash FROM device_pairings WHERE user_code = ?1 AND status = 'pending'",
    ).bind(code).first<{ device_code_hash: string }>();
    if (pairing) await advanceBusinessFlow(env, 'device:' + pairing.device_code_hash, 'device_pairing', step, { userId });
  } catch {
    console.warn("pairing_step_unavailable");
  }
}

export async function handlePairingLookup(request: Request, env: DeviceEnv) {
  const user = await getSessionUser(request, env);
  if (!user) return Response.json({ authenticated: false }, { status: 401 });

  const url = new URL(request.url);
  const code = (url.searchParams.get("code") || "").trim().toUpperCase();
  if (!code) {
    return Response.json({ error: "code is required" }, { status: 400 });
  }
  await recordPairingStep(env, code, "signed_in", user.id);

  const pairing = await env.DB.prepare(
    `SELECT user_code, device_name, platform, arch, hostname, status, expires_at
     FROM device_pairings
     WHERE user_code = ?1`,
  )
    .bind(code)
    .first<{
      user_code: string;
      device_name: string;
      platform: string;
      arch: string | null;
      hostname: string | null;
      status: string;
      expires_at: string;
    }>();

  if (!pairing || pairing.expires_at <= nowIso()) {
    return Response.json({ error: "Pairing code not found or expired" }, { status: 404 });
  }

  return Response.json({ ...pairing, user });
}

export async function handlePairingApprove(request: Request, env: DeviceEnv) {
  const user = await getSessionUser(request, env);
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as {
    user_code?: string;
  };
  const userCode = (body.user_code || "").trim().toUpperCase();

  const pairing = await env.DB.prepare(
    `SELECT device_code_hash, device_secret_hash, device_name, platform, arch, hostname, status, expires_at
     FROM device_pairings
     WHERE user_code = ?1`,
  )
    .bind(userCode)
    .first<{
      device_code_hash: string;
      device_secret_hash: string;
      device_name: string;
      platform: string;
      arch: string | null;
      hostname: string | null;
      status: string;
      expires_at: string;
    }>();

  if (!pairing || pairing.expires_at <= nowIso()) {
    return Response.json({ error: "Pairing code not found or expired" }, { status: 404 });
  }

  if (pairing.status !== "pending") {
    return Response.json({ error: "Pairing is no longer pending" }, { status: 409 });
  }

  const deviceId = crypto.randomUUID();
  const createdAt = nowIso();
  const plan=billingEnabled(env)?await currentArcPlan(env,user.id):null;
  // Enforce computer limits even when hosted Arc billing is off. Time-limited Plus grants count.
  // null is an explicit unlimited entitlement (administrators, Connect Unlimited).
  const deviceLimit: number | null = user.isAdmin || (plan && plan.deviceLimit === null) ? null
    : plan?.id === 'arc-pro-v1' ? Math.max(20, plan.deviceLimit ?? 20)
    : user.plan === 'plus' || plan?.id === 'arc-plus-v1' ? 10 : 2;
  // Unlimited registered computers keep a published fair-use rate, not a hidden cap.
  // Revoked registrations count, so revoke/re-pair churn cannot bypass it.
  const dailyRegistrations = deviceLimit === null && !user.isAdmin ? CONNECT_FAIR_USE.computerRegistrationsPerDay : null;
  const registrationWindow = new Date(Date.now() - 86400_000).toISOString();

  const pairingResult=await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO devices (
        id, user_id, name, platform, arch, hostname,
        credential_hash, created_at, last_seen, revoked_at, allowed_tools
      ) SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, NULL, NULL, ?9
      WHERE ((?4 = 'browser' AND (SELECT COUNT(*) FROM devices WHERE user_id=?2 AND revoked_at IS NULL AND platform='browser') < ?14)
        OR (?4 <> 'browser'
          AND (?10 IS NULL OR (SELECT COUNT(*) FROM devices WHERE user_id=?2 AND revoked_at IS NULL AND platform<>'browser') < (?10 + (SELECT COALESCE(SUM(extra_devices),0) FROM device_capacity_grants WHERE user_id=?2 AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>?8))))
          AND (?12 IS NULL OR (SELECT COUNT(*) FROM devices WHERE user_id=?2 AND platform<>'browser' AND created_at>?13) < ?12)))
      AND EXISTS(SELECT 1 FROM device_pairings WHERE user_code=?11 AND status='pending' AND expires_at>?8)`,
    ).bind(
      deviceId,
      user.id,
      pairing.device_name,
      pairing.platform,
      pairing.arch,
      pairing.hostname,
      pairing.device_secret_hash,
      createdAt,
      JSON.stringify(
        pairing.platform === "browser"
          ? BROWSER_DEFAULT_ALLOWED_TOOLS
          : DEFAULT_ALLOWED_TOOLS,
      ),
      deviceLimit,userCode,dailyRegistrations,registrationWindow,CONNECT_FAIR_USE.browserInstallations,
    ),
    env.DB.prepare(
      `UPDATE device_pairings
       SET status = 'approved', approved_user_id = ?1,
           approved_device_id = ?2, approved_at = ?3
        WHERE user_code = ?4 AND status='pending' AND EXISTS(SELECT 1 FROM devices WHERE id=?2 AND user_id=?1)`,
    ).bind(user.id, deviceId, createdAt, userCode),
  ]);
  if (!pairingResult[0]?.meta.changes) {
    const counts = await env.DB.prepare(
      "SELECT COUNT(*) AS computers FROM devices WHERE user_id=?1 AND revoked_at IS NULL AND platform<>'browser'"
    ).bind(user.id).first<{computers:number}>();
    const computers = counts?.computers ?? 0;
    const browsers = pairing.platform === 'browser' ? await env.DB.prepare(
      "SELECT COUNT(*) AS total FROM devices WHERE user_id=?1 AND revoked_at IS NULL AND platform='browser'"
    ).bind(user.id).first<{total:number}>() : null;
    if (pairing.platform !== 'browser' && dailyRegistrations !== null) {
      const recent = await env.DB.prepare(
        "SELECT COUNT(*) AS total FROM devices WHERE user_id=?1 AND platform<>'browser' AND created_at>?2"
      ).bind(user.id, registrationWindow).first<{total:number}>();
      if ((recent?.total ?? 0) >= dailyRegistrations) return Response.json({
        error: 'device_registration_rate_limited', count: recent?.total ?? 0, limit: dailyRegistrations, window: '24h', device_type: 'computer',
      }, { status: 429, headers: { 'retry-after': '3600' } });
    }
    const count = pairing.platform === 'browser' ? browsers?.total ?? 0 : computers;
    const limit = pairing.platform === 'browser' ? CONNECT_FAIR_USE.browserInstallations
      : deviceLimit === null ? null : deviceLimit + await activeDeviceCapacityBonus(env.DB,user.id);
    return limit !== null && count >= limit
      ? Response.json({ error: 'device_limit_reached', count, limit, device_type: pairing.platform === 'browser' ? 'browser' : 'computer' }, { status: 403 })
      : Response.json({ error: 'pairing_changed', message: 'Start a new pairing from your computer.' }, { status: 409 });
  }
  if (!pairingResult[1]?.meta.changes) return Response.json({ error: 'pairing_changed' }, { status: 409 });

  await advanceBusinessFlow(env,'device:'+pairing.device_code_hash,'device_pairing','approved',{userId:user.id,deviceId,at:createdAt});

  await writeAudit(env, {
    userId: user.id,
    deviceId,
    eventType: "device.paired",
  });

  return Response.json({
    ok: true,
    device: {
      id: deviceId,
      name: pairing.device_name,
      platform: pairing.platform,
      arch: pairing.arch,
    },
  });
}

export async function handleDeviceList(
  request: Request,
  env: DeviceEnv & { REGISTRY: DurableObjectNamespace },
) {
  const user = await getSessionUser(request, env);
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  return listDevicesForUser(env, user.id);
}

export async function getDevicesForUser(
  env: DeviceEnv & { REGISTRY: DurableObjectNamespace },
  userId: string,
) {
  type StoredDevice = {
    id: string;
    name: string;
    platform: string;
    arch: string | null;
    hostname: string | null;
    created_at: string;
    last_seen: string | null;
    allowed_tools: string | null;
    workspace_roots: string | null;
    sensitive_paths: string | null;
    sensitive_allow_paths: string | null;
    protect_sensitive_paths: number;
    undo_enabled: number;
    automation_permissions: string | null;
    background_enabled: number | null;
    background_service: string | null;
    background_seen_at: string | null;
  };

  let storedDevices: StoredDevice[];
  try {
    const rows = await env.DB.prepare(
      `SELECT id, name, platform, arch, hostname, created_at, last_seen, allowed_tools,
              workspace_roots, sensitive_paths, sensitive_allow_paths, protect_sensitive_paths, undo_enabled,
              background_enabled, background_service, background_seen_at, automation_permissions
       FROM devices
       WHERE user_id = ?1 AND revoked_at IS NULL
       ORDER BY created_at DESC`,
    )
      .bind(userId)
      .all<StoredDevice>();
    storedDevices = rows.results || [];
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      !/no such column:\s*(background_enabled|background_service|background_seen_at|automation_permissions)/i.test(
        message,
      )
    ) {
      throw error;
    }

    // Core remote-computer access must not disappear just because a newer
    // optional task/background migration has not been applied yet. Fall back
    // to the pre-task schema and surface conservative defaults.
    const legacyRows = await env.DB.prepare(
      `SELECT id, name, platform, arch, hostname, created_at, last_seen, allowed_tools,
              workspace_roots, sensitive_paths, sensitive_allow_paths, protect_sensitive_paths, undo_enabled
       FROM devices
       WHERE user_id = ?1 AND revoked_at IS NULL
       ORDER BY created_at DESC`,
    )
      .bind(userId)
      .all<Omit<StoredDevice, "automation_permissions" | "background_enabled" | "background_service" | "background_seen_at">>();

    storedDevices = (legacyRows.results || []).map((device) => ({
      ...device,
      automation_permissions: null,
      background_enabled: null,
      background_service: null,
      background_seen_at: null,
    }));
  }

  type OnlineDevice = {
    id: string;
    tools?: string[];
    capabilities?: string[];
    status?: string;
    agentVersion?: string;
    pid?: number;
    connectedAt?: string;
    recovery_enabled?: boolean;
    background_guard_active?: boolean;
    execution_paused?: boolean;
    background_guard_pid?: number | null;
    background_guard_service?: string | null;
    recovery_bundle_version?: string | null;
    execution_mode?: string;
    background_active?: boolean;
    background_pid?: number | null;
    background_agent_version?: string | null;
    background_connected_at?: string | null;
    capacity?: { observedAt: string; memoryTotalMB: number; memoryAvailableMB: number; cpuPercent?: number; managedProcesses?: number } | null;
  };

  const registryRequest = () =>
    new Request("https://registry/devices", {
      headers: { "x-remote-link-user-id": userId },
    });

  const onlineResponse = await env.REGISTRY
    .getByName("user:" + userId)
    .fetch(registryRequest());
  const online = onlineResponse.ok
    ? ((await onlineResponse.json()) as OnlineDevice[])
    : [];

  if (online.length < storedDevices.length) {
    // Temporary migration fallback while pre-sharding WebSockets may still
    // be attached to the legacy singleton Durable Object.
    const legacyResponse = await env.REGISTRY
      .getByName("global")
      .fetch(registryRequest());
    if (legacyResponse.ok) {
      const legacy = (await legacyResponse.json()) as OnlineDevice[];
      const seen = new Set(online.map((device) => device.id));
      for (const device of legacy) {
        if (!seen.has(device.id)) online.push(device);
      }
    }
  }

  const onlineById = new Map(online.map((device) => [device.id, device]));

  return storedDevices.map((device) => {
    const reviewerFixture: OnlineDevice | undefined =
      isReviewerFixture(env, userId, device.id)
        ? {
            id: device.id,
            status: "online",
            tools: [...REVIEWER_DEMO_TOOLS],
            capabilities: ["device_policy_v1"],
          }
        : undefined;
    const live = onlineById.get(device.id) || reviewerFixture;
    const rawAvailableTools = live?.tools || [];
    const capabilities = live?.capabilities || [];
    const internalTools = new Set([
      "list_undo_actions",
      "undo_change",
      "browse_directories",
      "list_managed_processes",
      "background_agent_status",
      "set_background_agent",
      "agent_execution_log",
      "set_device_runtime",
    ]);
    const availableTools = rawAvailableTools.filter((tool) => !internalTools.has(tool));
    let allowedTools: string[] | null = reviewerFixture
      ? [...REVIEWER_DEMO_TOOLS]
      : null;
    if (!reviewerFixture && device.allowed_tools) {
      try {
        const parsed = JSON.parse(device.allowed_tools);
        if (Array.isArray(parsed)) allowedTools = parsed.filter((tool): tool is string => typeof tool === "string");
      } catch {
        allowedTools = null;
      }
    }
    const tools = allowedTools === null
      ? availableTools
      : availableTools.filter((tool) => allowedTools!.includes(tool) || ((tool === "browser_open_tab" || tool === "browser_act") && allowedTools!.includes("browser_click")));

    return {
      id: device.id,
      name: device.name,
      platform: device.platform,
      arch: device.arch,
      hostname: device.hostname,
      created_at: device.created_at,
      last_seen: device.last_seen,
      allowed_tools: allowedTools,
      available_tools: availableTools,
      workspace_roots: parseJsonStringArray(device.workspace_roots),
      sensitive_paths: parseJsonStringArray(device.sensitive_paths),
      sensitive_allow_paths: parseJsonStringArray(device.sensitive_allow_paths),
      protect_sensitive_paths: device.protect_sensitive_paths !== 0,
      undo_enabled: device.undo_enabled !== 0,
      policy_enforcement_available:
        capabilities.includes("device_policy_v1"),
      undo_history_available:
        capabilities.includes("undo_history_v1") &&
        rawAvailableTools.includes("list_undo_actions") &&
        rawAvailableTools.includes("undo_change"),
      background_agent_available:
        capabilities.includes("background_agent_v1") ||
        device.background_seen_at !== null,
      background_enabled:
        typeof live?.recovery_enabled === "boolean" ? live.recovery_enabled : device.background_enabled === null
          ? null
          : device.background_enabled !== 0,
      background_service: live?.background_guard_service || device.background_service,
      recovery_bundle_version:
        typeof live?.recovery_bundle_version === "string"
          ? live.recovery_bundle_version
          : null,
      background_recovery_available: capabilities.includes("background_recovery_v2"),
      stop_agent_available: capabilities.includes("device_stop_v1"),
      pause_agent_available: capabilities.includes("device_pause_v1"),
      execution_paused: live?.execution_paused === true,
      background_guard_active: live?.background_guard_active === true,
      background_guard_pid: live?.background_guard_pid ?? null,
      execution_mode: live?.execution_mode ?? null,
      background_seen_at: device.background_seen_at,
      background_active: live?.background_active === true,
      background_pid:
        typeof live?.background_pid === "number" ? live.background_pid : null,
      background_agent_version:
        typeof live?.background_agent_version === "string"
          ? live.background_agent_version
          : null,
      background_connected_at:
        typeof live?.background_connected_at === "string"
          ? live.background_connected_at
          : null,
      agent_version:
        typeof live?.agentVersion === "string" ? live.agentVersion : null,
      agent_pid:
        typeof live?.pid === "number" ? live.pid : null,
      connected_at:
        typeof live?.connectedAt === "string" ? live.connectedAt : null,
      capacity: live?.capacity ?? null,
      automation_permissions: parseTaskPermissions(device.automation_permissions),
      keep_awake_available: (live?.tools || []).includes("set_task_keep_awake"),
      status: live ? "online" : "offline",
      tools,
    };
  });
}

export async function listDevicesForUser(
  env: DeviceEnv & { REGISTRY: DurableObjectNamespace },
  userId: string,
) {
  return Response.json(await getDevicesForUser(env, userId));
}

export async function disconnectRevokedDevice(
  env: Pick<DeviceEnv, "REGISTRY">,
  userId: string,
  deviceId: string,
) {
  const requestFor = () =>
    new Request("https://registry/disconnect", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-remote-link-user-id": userId,
      },
      body: JSON.stringify({ deviceId }),
    });

  await Promise.allSettled([
    env.REGISTRY.getByName("user:" + userId).fetch(requestFor()),
    env.REGISTRY.getByName("global").fetch(requestFor()),
  ]);
}

export async function handleDeviceRevoke(request: Request, env: DeviceEnv) {
  const user = await getSessionUser(request, env);
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const match = url.pathname.match(/^\/api\/devices\/([^/]+)\/revoke$/);
  const deviceId = match?.[1];
  if (!deviceId) return new Response("Not found", { status: 404 });

  const result = await env.DB.prepare(
    `UPDATE devices SET revoked_at = ?1
     WHERE id = ?2 AND user_id = ?3 AND revoked_at IS NULL`,
  )
    .bind(nowIso(), deviceId, user.id)
    .run();

  if (!result.meta.changes) {
    return Response.json({ error: "device not found" }, { status: 404 });
  }

  await writeAudit(env, {
    userId: user.id,
    deviceId,
    eventType: "device.revoked",
  });

  await disconnectRevokedDevice(env, user.id, deviceId);

  return Response.json({ ok: true });
}


export async function handleDeviceRename(request: Request, env: DeviceEnv) {
  const user = await getSessionUser(request, env);
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const match = url.pathname.match(/^\/api\/devices\/([^/]+)\/rename$/);
  const deviceId = match?.[1];
  if (!deviceId) return new Response("Not found", { status: 404 });

  const body = (await request.json().catch(() => ({}))) as { name?: string };
  const name = (body.name || "").trim().slice(0, 80);
  if (!name) {
    return Response.json({ error: "name is required" }, { status: 400 });
  }

  const result = await env.DB.prepare(
    `UPDATE devices SET name = ?1
     WHERE id = ?2 AND user_id = ?3 AND revoked_at IS NULL`,
  )
    .bind(name, deviceId, user.id)
    .run();

  if (!result.meta.changes) {
    return Response.json({ error: "device not found" }, { status: 404 });
  }

  await writeAudit(env, {
    userId: user.id,
    deviceId,
    eventType: "device.renamed",
  });

  return Response.json({ ok: true, name });
}

export async function handleDeviceToolsUpdate(request: Request, env: DeviceEnv) {
  const user = await getSessionUser(request, env);
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const match = url.pathname.match(/^\/api\/devices\/([^/]+)\/tools$/);
  const deviceId = match?.[1];
  if (!deviceId) return new Response("Not found", { status: 404 });

  const body = (await request.json().catch(() => ({}))) as { allowed_tools?: unknown };
  if (!Array.isArray(body.allowed_tools) || body.allowed_tools.length > 64) {
    return Response.json({ error: "allowed_tools must be an array" }, { status: 400 });
  }

  const allowedTools = [...new Set(body.allowed_tools)]
    .filter((tool): tool is string => typeof tool === "string" && /^[a-zA-Z0-9_.:-]{1,80}$/.test(tool));

  const privilegedTools = new Set([
    "write_file",
    "edit_block",
    "undo_last_change",
    "undo_change",
    "start_process",
  ]);
  if (allowedTools.some((tool) => privilegedTools.has(tool))) {
    const policy = await env.DB.prepare(
      `SELECT workspace_roots FROM devices
       WHERE id = ?1 AND user_id = ?2 AND revoked_at IS NULL`,
    )
      .bind(deviceId, user.id)
      .first<{ workspace_roots: string | null }>();
    if (!policy) {
      return Response.json({ error: "device not found" }, { status: 404 });
    }
    if (parseJsonStringArray(policy.workspace_roots).length === 0) {
      return Response.json(
        {
          error:
            "Trusted Write Locations are required before enabling file mutation or terminal execution.",
        },
        { status: 409 },
      );
    }
  }

  const result = await env.DB.prepare(
    `UPDATE devices SET allowed_tools = ?1
     WHERE id = ?2 AND user_id = ?3 AND revoked_at IS NULL`,
  )
    .bind(JSON.stringify(allowedTools), deviceId, user.id)
    .run();

  if (!result.meta.changes) {
    return Response.json({ error: "device not found" }, { status: 404 });
  }

  await writeAudit(env, {
    userId: user.id,
    deviceId,
    eventType: "device.tools_updated",
  });

  return Response.json({ ok: true, allowed_tools: allowedTools });
}


type DevicePolicyRow = {
  id: string;
  workspace_roots: string | null;
  sensitive_paths: string | null;
  sensitive_allow_paths: string | null;
  protect_sensitive_paths: number;
  undo_enabled: number;
};

async function loadOwnedDevicePolicy(
  env: DeviceEnv,
  userId: string,
  deviceId: string,
) {
  return env.DB.prepare(
    `SELECT id, workspace_roots, sensitive_paths, sensitive_allow_paths,
            protect_sensitive_paths, undo_enabled
     FROM devices
     WHERE id = ?1 AND user_id = ?2 AND revoked_at IS NULL`,
  )
    .bind(deviceId, userId)
    .first<DevicePolicyRow>();
}

const devicePolicyPayload = (device: DevicePolicyRow) => ({
  workspaceRoots: parseJsonStringArray(device.workspace_roots),
  sensitivePaths: parseJsonStringArray(device.sensitive_paths),
  sensitiveAllowPaths: parseJsonStringArray(device.sensitive_allow_paths),
  protectSensitivePaths: device.protect_sensitive_paths !== 0,
  undoEnabled: device.undo_enabled !== 0,
});

function unwrapDeviceToolResult(result: unknown) {
  if (
    result &&
    typeof result === "object" &&
    "content" in result &&
    Array.isArray((result as { content?: unknown }).content)
  ) {
    const first = (result as { content: Array<{ type?: string; text?: unknown }> }).content[0];
    if (first?.type === "text" && typeof first.text === "string") {
      try {
        return JSON.parse(first.text);
      } catch {
        return first.text;
      }
    }
  }
  return result;
}

async function callInternalDeviceTool(
  env: DeviceEnv & { REGISTRY: DurableObjectNamespace },
  userId: string,
  device: DevicePolicyRow,
  tool: string,
  args: Record<string, unknown>,
  policyOverride?: ReturnType<typeof devicePolicyPayload>,
) {
  const registryRequest = () =>
    new Request("https://registry/call", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-remote-link-user-id": userId,
      },
      body: JSON.stringify({
        deviceId: device.id,
        tool,
        arguments: args,
        policy: policyOverride || devicePolicyPayload(device),
      }),
    });

  let response = await env.REGISTRY
    .getByName("user:" + userId)
    .fetch(registryRequest());

  if (response.status === 404) {
    response = await env.REGISTRY.getByName("global").fetch(registryRequest());
  }

  const payload = (await response.json().catch(() => ({}))) as {
    result?: unknown;
    error?: string;
  };

  if (!response.ok || payload.error) {
    return {
      ok: false as const,
      status: response.status,
      error: payload.error || "device call failed",
    };
  }

  return { ok: true as const, result: unwrapDeviceToolResult(payload.result) };
}

export async function handleDevicePolicyUpdate(
  request: Request,
  env: DeviceEnv,
) {
  const user = await getSessionUser(request, env);
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const match = url.pathname.match(/^\/api\/devices\/([^/]+)\/policy$/);
  const deviceId = match?.[1];
  if (!deviceId) return new Response("Not found", { status: 404 });

  const body = (await request.json().catch(() => ({}))) as {
    workspace_roots?: unknown;
    sensitive_paths?: unknown;
    sensitive_allow_paths?: unknown;
    protect_sensitive_paths?: unknown;
    acknowledge_sensitive_path_risk?: unknown;
    undo_enabled?: unknown;
  };

  const workspaceRoots = sanitizePolicyPaths(body.workspace_roots ?? []);
  const sensitivePaths = sanitizePolicyPaths(body.sensitive_paths ?? []);
  const sensitiveAllowPaths = sanitizePolicyPaths(body.sensitive_allow_paths ?? []);
  if (!workspaceRoots || !sensitivePaths || !sensitiveAllowPaths) {
    return Response.json(
      { error: "workspace_roots, sensitive_paths and sensitive_allow_paths must be arrays of valid paths" },
      { status: 400 },
    );
  }

  if (
    typeof body.protect_sensitive_paths !== "boolean" ||
    typeof body.undo_enabled !== "boolean"
  ) {
    return Response.json(
      { error: "protect_sensitive_paths and undo_enabled must be booleans" },
      { status: 400 },
    );
  }
  // The default remains enabled. An authenticated owner must explicitly
  // acknowledge the risk before disabling the entire sensitive-path guard.
  if (body.protect_sensitive_paths === false && body.acknowledge_sensitive_path_risk !== true) {
    return Response.json(
      {
        error: "Disabling Sensitive Path Policy may expose credentials to allowed file tools. Explicit risk acknowledgement is required.",
      },
      { status: 409 },
    );
  }

  if (workspaceRoots.length === 0) {
    const current = await env.DB.prepare(
      `SELECT allowed_tools FROM devices
       WHERE id = ?1 AND user_id = ?2 AND revoked_at IS NULL`,
    )
      .bind(deviceId, user.id)
      .first<{ allowed_tools: string | null }>();
    if (!current) {
      return Response.json({ error: "device not found" }, { status: 404 });
    }
    const enabledTools = parseJsonStringArray(current.allowed_tools);
    const privilegedTools = new Set([
      "write_file",
      "edit_block",
      "undo_last_change",
      "undo_change",
      "start_process",
    ]);
    if (enabledTools.some((tool) => privilegedTools.has(tool))) {
      return Response.json(
        {
          error:
            "Disable file mutation and terminal tools before removing the last Trusted Write Location.",
        },
        { status: 409 },
      );
    }
  }

  const result = await env.DB.prepare(
    `UPDATE devices
     SET workspace_roots = ?1,
         sensitive_paths = ?2,
         sensitive_allow_paths = ?3,
         protect_sensitive_paths = ?4,
         undo_enabled = ?5
     WHERE id = ?6 AND user_id = ?7 AND revoked_at IS NULL`,
  )
    .bind(
      JSON.stringify(workspaceRoots),
      JSON.stringify(sensitivePaths),
      JSON.stringify(sensitiveAllowPaths),
      body.protect_sensitive_paths ? 1 : 0,
      body.undo_enabled ? 1 : 0,
      deviceId,
      user.id,
    )
    .run();

  if (!result.meta.changes) {
    return Response.json({ error: "device not found" }, { status: 404 });
  }

  await writeAudit(env, {
    userId: user.id,
    deviceId,
    eventType: "device.policy_updated",
    outcome: body.protect_sensitive_paths
      ? "sensitive_protection_on"
      : "sensitive_protection_off",
  });

  return Response.json({
    ok: true,
    workspace_roots: workspaceRoots,
    sensitive_paths: sensitivePaths,
    sensitive_allow_paths: sensitiveAllowPaths,
    protect_sensitive_paths: body.protect_sensitive_paths,
    undo_enabled: body.undo_enabled,
  });
}

export async function handleDeviceUndoList(
  request: Request,
  env: DeviceEnv & { REGISTRY: DurableObjectNamespace },
) {
  const user = await getSessionUser(request, env);
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const match = url.pathname.match(/^\/api\/devices\/([^/]+)\/undo$/);
  const deviceId = match?.[1];
  if (!deviceId) return new Response("Not found", { status: 404 });

  const device = await loadOwnedDevicePolicy(env, user.id, deviceId);
  if (!device) return Response.json({ error: "device not found" }, { status: 404 });

  const call = await callInternalDeviceTool(
    env,
    user.id,
    device,
    "list_undo_actions",
    { limit: 30 },
  );
  if (!call.ok) {
    return Response.json(
      { error: call.error, available: false },
      { status: call.status === 403 || call.status === 404 ? 409 : call.status },
    );
  }

  return Response.json({
    available: true,
    actions: call.result,
  });
}

export async function handleDeviceUndoAction(
  request: Request,
  env: DeviceEnv & { REGISTRY: DurableObjectNamespace },
) {
  const user = await getSessionUser(request, env);
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const match = url.pathname.match(
    /^\/api\/devices\/([^/]+)\/undo\/([^/]+)$/,
  );
  const deviceId = match?.[1];
  const actionId = match?.[2];
  if (!deviceId || !actionId) return new Response("Not found", { status: 404 });

  const device = await loadOwnedDevicePolicy(env, user.id, deviceId);
  if (!device) return Response.json({ error: "device not found" }, { status: 404 });
  if (device.undo_enabled === 0) {
    return Response.json({ error: "Local Undo is disabled" }, { status: 409 });
  }

  const call = await callInternalDeviceTool(
    env,
    user.id,
    device,
    "undo_change",
    { action_id: decodeURIComponent(actionId) },
  );
  if (!call.ok) {
    return Response.json({ error: call.error }, { status: call.status || 409 });
  }

  await writeAudit(env, {
    userId: user.id,
    deviceId,
    eventType: "device.undo_restored",
    toolName: "undo_change",
  });

  return Response.json({ ok: true, result: call.result });
}


/**
 * Owner-authenticated runtime state transition. The private device control
 * tool is never exposed through ordinary MCP or accepted from unauthenticated
 * requests. A paused Go worker is wake-only: the Relay routes no execution
 * tools, and the local worker also denies them.
 */
export async function handleDeviceRuntimeUpdate(
  request: Request,
  env: DeviceEnv & { REGISTRY: DurableObjectNamespace },
) {
  const user = await getSessionUser(request, env);
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const deviceId = new URL(request.url).pathname.match(/^\/api\/devices\/([^/]+)\/runtime$/)?.[1];
  if (!deviceId) return new Response("Not found", { status: 404 });
  const body = (await request.json().catch(() => ({}))) as { paused?: unknown };
  if (typeof body.paused !== "boolean") {
    return Response.json({ error: "paused must be a boolean" }, { status: 400 });
  }
  const live = (await getDevicesForUser(env, user.id)).find((item) => item.id === deviceId);
  if (!live) return Response.json({ error: "device not found" }, { status: 404 });
  if (live.status !== "online") return Response.json({ error: "device offline" }, { status: 409 });
  if (!live.pause_agent_available) return Response.json({ error: "Upgrade the native Agent before using Pause / Resume." }, { status: 409 });
  if (body.paused && (!live.background_enabled || !live.background_guard_active)) {
    return Response.json({ error: "Enable active background recovery before pausing." }, { status: 409 });
  }
  if (live.execution_paused === body.paused) {
    return Response.json({ ok: true, paused: body.paused, confirmed: true });
  }
  const device = await loadOwnedDevicePolicy(env, user.id, deviceId);
  if (!device) return Response.json({ error: "device not found" }, { status: 404 });
  const result = await callInternalDeviceTool(env, user.id, device, "set_device_runtime", { paused: body.paused });
  if (!result.ok) {
    return Response.json({ error: result.error, confirmed: false }, { status: result.status === 403 || result.status === 404 ? 409 : result.status });
  }
  await writeAudit(env, { userId: user.id, deviceId, eventType: body.paused ? "device.agent_pause_requested" : "device.agent_resume_requested" });
  // "accepted" only means durable local transition requested. Dashboard
  // must observe the newly connected wake-only or execution-only session.
  return Response.json({ ok: true, paused: body.paused, confirmed: false });
}

export async function handleDeviceBackgroundUpdate(
  request: Request,
  env: DeviceEnv & { REGISTRY: DurableObjectNamespace },
) {
  const user = await getSessionUser(request, env);
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const match = url.pathname.match(/^\/api\/devices\/([^/]+)\/background$/);
  const deviceId = match?.[1];
  if (!deviceId) return new Response("Not found", { status: 404 });

  const body = (await request.json().catch(() => ({}))) as {
    enabled?: unknown;
    stop_current?: unknown;
  };
  if (typeof body.enabled !== "boolean") {
    return Response.json({ error: "enabled must be a boolean" }, { status: 400 });
  }
  if (body.stop_current === true) {
    if (body.enabled !== false) return Response.json({ error: "Cannot stop an Agent while enabling recovery." }, { status: 400 });
    const online = (await getDevicesForUser(env, user.id)).find((row) => row.id === deviceId);
    if (!online || online.status !== "online") return Response.json({ error: "device offline" }, { status: 409 });
    if (!online.stop_agent_available) return Response.json({ error: "Agent upgrade required before remote Stop Agent is available." }, { status: 409 });
  }

  const device = await loadOwnedDevicePolicy(env, user.id, deviceId);
  if (!device) return Response.json({ error: "device not found" }, { status: 404 });

  const call = await callInternalDeviceTool(
    env,
    user.id,
    device,
    "set_background_agent",
    {
      enabled: body.enabled,
      ...(body.enabled === false && body.stop_current === true
        ? { stop_current: true }
        : {}),
    },
  );

  if (!call.ok) {
    return Response.json(
      {
        error: call.error,
        available: false,
      },
      { status: call.status === 403 || call.status === 404 ? 409 : call.status },
    );
  }

  const status =
    call.result && typeof call.result === "object"
      ? (call.result as {
          enabled?: unknown;
          active?: unknown;
          service?: unknown;
          detail?: unknown;
        })
      : {};
  const actualEnabled =
    typeof status.enabled === "boolean" ? status.enabled : body.enabled;
  const service =
    typeof status.service === "string" ? status.service : null;

  const now = nowIso();
  await env.DB.prepare(
    `UPDATE devices
     SET background_enabled = ?1,
         background_service = COALESCE(?2, background_service),
         background_seen_at = ?3
     WHERE id = ?4 AND user_id = ?5 AND revoked_at IS NULL`,
  )
    .bind(actualEnabled ? 1 : 0, service, now, deviceId, user.id)
    .run();

  const applied = actualEnabled === body.enabled;
  await writeAudit(env, {
    userId: user.id,
    deviceId,
    eventType: applied
      ? body.stop_current === true
        ? "device.agent_stop_requested"
        : actualEnabled
          ? "device.background_enabled"
          : "device.background_disabled"
      : "device.background_update_failed",
  });

  if (!applied) {
    return Response.json(
      {
        error:
          typeof status.detail === "string" && status.detail
            ? status.detail
            : body.enabled
              ? "Background service could not be enabled on this computer."
              : "Background service could not be disabled on this computer.",
        enabled: actualEnabled,
        status: call.result,
      },
      { status: 409 },
    );
  }

  return Response.json({
    ok: true,
    enabled: actualEnabled,
    status: call.result,
  });
}


export async function handleDeviceDirectoryBrowse(
  request: Request,
  env: DeviceEnv & { REGISTRY: DurableObjectNamespace },
) {
  const user = await getSessionUser(request, env);
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const match = url.pathname.match(/^\/api\/devices\/([^/]+)\/directories$/);
  const deviceId = match?.[1];
  if (!deviceId) return new Response("Not found", { status: 404 });

  const device = await loadOwnedDevicePolicy(env, user.id, deviceId);
  if (!device) return Response.json({ error: "device not found" }, { status: 404 });

  const policy = devicePolicyPayload(device);
  const call = await callInternalDeviceTool(
    env,
    user.id,
    device,
    "browse_directories",
    { path: url.searchParams.get("path") || "~" },
    {
      ...policy,
      workspaceRoots: [],
    },
  );

  if (!call.ok) {
    return Response.json(
      { error: call.error, available: false },
      { status: call.status === 403 || call.status === 404 ? 409 : call.status },
    );
  }

  return Response.json({ available: true, browser: call.result });
}

export async function handleDeviceExecutionLog(
  request: Request,
  env: DeviceEnv & { REGISTRY: DurableObjectNamespace },
) {
  const user = await getSessionUser(request, env);
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const match = url.pathname.match(/^\/api\/devices\/([^/]+)\/execution-log$/);
  const deviceId = match?.[1];
  if (!deviceId) return new Response("Not found", { status: 404 });

  const device = await loadOwnedDevicePolicy(env, user.id, deviceId);
  if (!device) return Response.json({ error: "device not found" }, { status: 404 });

  const requestedLimit = Number(url.searchParams.get("limit") || "100");
  const limit = Number.isFinite(requestedLimit)
    ? Math.max(20, Math.min(200, Math.trunc(requestedLimit)))
    : 100;

  const call = await callInternalDeviceTool(
    env,
    user.id,
    device,
    "agent_execution_log",
    { limit },
  );

  if (!call.ok) {
    const unsupported =
      call.status === 404 ||
      /unknown tool|not found|disabled|agent_execution_log/i.test(call.error);
    return Response.json(
      {
        error: unsupported
          ? "Update remotelink on this device to view its local execution log."
          : call.error,
        available: false,
        unsupported,
      },
      { status: unsupported ? 409 : call.status || 409 },
    );
  }

  return Response.json({ available: true, log: call.result });
}

export async function handleDeviceManagedProcesses(
  request: Request,
  env: DeviceEnv & { REGISTRY: DurableObjectNamespace },
) {
  const user = await getSessionUser(request, env);
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const match = url.pathname.match(/^\/api\/devices\/([^/]+)\/processes$/);
  const deviceId = match?.[1];
  if (!deviceId) return new Response("Not found", { status: 404 });

  const device = await loadOwnedDevicePolicy(env, user.id, deviceId);
  if (!device) return Response.json({ error: "device not found" }, { status: 404 });

  const call = await callInternalDeviceTool(
    env,
    user.id,
    device,
    "list_managed_processes",
    {},
  );
  if (!call.ok) {
    return Response.json(
      { error: call.error, available: false },
      { status: call.status === 403 || call.status === 404 ? 409 : call.status },
    );
  }

  return Response.json({ available: true, processes: call.result });
}

export async function handleDeviceManagedProcessOutput(
  request: Request,
  env: DeviceEnv & { REGISTRY: DurableObjectNamespace },
) {
  const user = await getSessionUser(request, env);
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const match = url.pathname.match(
    /^\/api\/devices\/([^/]+)\/processes\/([^/]+)\/output$/,
  );
  const deviceId = match?.[1];
  const processId = match?.[2] ? decodeURIComponent(match[2]) : "";
  if (!deviceId || !processId) return new Response("Not found", { status: 404 });

  const device = await loadOwnedDevicePolicy(env, user.id, deviceId);
  if (!device) return Response.json({ error: "device not found" }, { status: 404 });

  const call = await callInternalDeviceTool(
    env,
    user.id,
    device,
    "process_output",
    { process_id: processId },
  );
  if (!call.ok) {
    return Response.json({ error: call.error }, { status: call.status || 409 });
  }

  return Response.json({ ok: true, process: call.result });
}

export async function handleDeviceManagedProcessStop(
  request: Request,
  env: DeviceEnv & { REGISTRY: DurableObjectNamespace },
) {
  const user = await getSessionUser(request, env);
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const match = url.pathname.match(
    /^\/api\/devices\/([^/]+)\/processes\/([^/]+)\/stop$/,
  );
  const deviceId = match?.[1];
  const processId = match?.[2] ? decodeURIComponent(match[2]) : "";
  if (!deviceId || !processId) return new Response("Not found", { status: 404 });

  const device = await loadOwnedDevicePolicy(env, user.id, deviceId);
  if (!device) return Response.json({ error: "device not found" }, { status: 404 });

  const call = await callInternalDeviceTool(
    env,
    user.id,
    device,
    "stop_process",
    { process_id: processId },
  );
  if (!call.ok) {
    return Response.json({ error: call.error }, { status: call.status || 409 });
  }

  await writeAudit(env, {
    userId: user.id,
    deviceId,
    eventType: "device.background_process_stopped",
    toolName: "stop_process",
  }).catch(() => undefined);

  return Response.json({ ok: true, process: call.result });
}
