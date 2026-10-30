import { recordRunnerAttention, type RunnerEnv } from "../browser/runner-attention.js";
import { RunnerVideoRelay, type VideoAttachment } from "../browser/runner-video.js";
import { deviceCallTimeoutMs, processTimeoutError } from './call-timeout.js';
import { recordDeviceConnection } from '../analytics/device-reliability.js';
import type {
  AgentCallMessage,
  AgentToRelayMessage,
  DeviceMetadata,
} from "@remotearc/protocol";

type PendingCall = {
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
  timeout: ReturnType<typeof setTimeout>;
};

type SocketAttachment = VideoAttachment & {
  viewer?: boolean;
  sessionId?: string;
  heartbeatAt?: number;
  frameTimes?: Record<string, number>;
  userId: string;
  deviceId: string;
  device?: DeviceMetadata;
  tools?: string[];
  capabilities?: string[];
  connectionRecorded?: boolean;
  metricMinute?: number;
  disconnectRecorded?: boolean;
};

export class DeviceRegistry {
  private pending = new Map<string, PendingCall>();
  private attentionChain: Promise<void> = Promise.resolve();
  private video?: RunnerVideoRelay;

  constructor(
    private readonly ctx: DurableObjectState,
    private readonly env?: RunnerEnv,
  ) {
    if (env)
      this.video = new RunnerVideoRelay(
        ctx,
        env,
        (a) => this.runnerDevice(a.userId, a.deviceId),
        (a, watching) => this.viewControl(a as SocketAttachment, watching),
      );
  }

  async alarm() {
    await this.video?.sweep();
  }

  private preferredSocket(sockets: WebSocket[]) {
    return [...sockets].sort((a, b) => {
      const left = a.deserializeAttachment() as SocketAttachment | null;
      const right = b.deserializeAttachment() as SocketAttachment | null;
      const leftPolicy = left?.capabilities?.includes("device_policy_v1")
        ? 1
        : 0;
      const rightPolicy = right?.capabilities?.includes("device_policy_v1")
        ? 1
        : 0;
      if (leftPolicy !== rightPolicy) return rightPolicy - leftPolicy;

      const leftTime = Date.parse(left?.device?.connectedAt || "") || 0;
      const rightTime = Date.parse(right?.device?.connectedAt || "") || 0;
      return rightTime - leftTime;
    })[0];
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/runner-view") return this.handleRunnerView(request);

    if (url.pathname === "/agent") {
      return this.handleAgentConnect(request);
    }

    if (url.pathname === "/devices" && request.method === "GET") {
      return Response.json(this.listDevices(request));
    }

    if (url.pathname === "/call" && request.method === "POST") {
      return this.handleCall(request);
    }

    if (url.pathname === "/disconnect" && request.method === "POST") {
      return this.handleDisconnect(request);
    }

    return new Response("Not found", { status: 404 });
  }

  private runnerDevice(userId: string, deviceId: string) {
    return this.preferredSocket(
      this.ctx.getWebSockets("device:" + deviceId).filter((socket) => {
        const a = socket.deserializeAttachment() as SocketAttachment | null;
        return a?.userId === userId && !a.viewer;
      }),
    );
  }
  private viewTag(a: SocketAttachment) {
    return "runner-view:" + a.userId + ":" + a.deviceId + ":" + a.sessionId;
  }
  private viewControl(a: SocketAttachment, watching: boolean) {
    const device = this.runnerDevice(a.userId, a.deviceId);
    const viewers = this.ctx.getWebSockets(this.viewTag(a)).filter((socket) => {
      const target = socket.deserializeAttachment() as SocketAttachment;
      return (
        target?.viewer &&
        target.userId === a.userId &&
        target.deviceId === a.deviceId &&
        target.sessionId === a.sessionId &&
        Date.now() - (target.heartbeatAt || 0) < 30000
      );
    });
    watching = watching && viewers.length > 0;
    try {
      device?.send(
        JSON.stringify({
          type: "runner_view",
          session_id: a.sessionId,
          action: watching ? "watch" : "stop",
          jpeg: viewers.some(
            (socket) =>
              (socket.deserializeAttachment() as SocketAttachment).video
                ?.phase !== "playing",
          ),
        }),
      );
    } catch {
      /* Device disconnected. */
    }
  }
  private handleRunnerView(request: Request): Response {
    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket")
      return new Response("WebSocket required", { status: 426 });
    const userId = request.headers.get("x-remote-link-user-id"),
      deviceId = request.headers.get("x-remote-link-device-id"),
      sessionId = request.headers.get("x-runner-session-id");
    if (
      !userId ||
      !deviceId ||
      !sessionId ||
      !/^[A-Za-z0-9_-]{1,100}$/.test(sessionId)
    )
      return new Response("Forbidden", { status: 403 });
    const device = this.runnerDevice(userId, deviceId);
    if (!device) return new Response("Device offline", { status: 404 });
    const deviceInfo = device.deserializeAttachment() as SocketAttachment;
    if (
      deviceInfo.device?.executionPaused ||
      !deviceInfo.tools?.includes("browser_runner_snapshot")
    )
      return new Response("Runner unavailable", { status: 403 });
    if (!deviceInfo.capabilities?.includes("runner_view_v1"))
      return new Response("Update Agent to enable live view", { status: 409 });
    const a: SocketAttachment = {
      viewer: true,
      userId,
      deviceId,
      sessionId,
      heartbeatAt: Date.now(),
    };
    if (this.ctx.getWebSockets(this.viewTag(a)).length >= 4)
      return new Response("Too many viewers", { status: 429 });
    const pair = new WebSocketPair();
    pair[1].serializeAttachment(a);
    this.ctx.acceptWebSocket(pair[1], [this.viewTag(a)]);
    this.viewControl(a, true);
    return new Response(null, {
      status: 101,
      webSocket: pair[0],
      headers: { "cache-control": "no-store" },
    });
  }
  private forwardRunnerFrame(
    socket: WebSocket,
    a: SocketAttachment,
    value: any,
  ) {
    if (
      !/^[A-Za-z0-9_-]{1,100}$/.test(value.session_id || "") ||
      typeof value.data !== "string" ||
      value.data.length > 273064 ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(value.data)
    )
      return;
    const now = Date.now();
    if (now - (a.frameTimes?.[value.session_id] || 0) < 500) return;
    const viewers = this.ctx
      .getWebSockets(this.viewTag({ ...a, sessionId: value.session_id }))
      .filter((viewer) => {
        const target =
          viewer.deserializeAttachment() as SocketAttachment | null;
        return (
          target?.viewer &&
          target.userId === a.userId &&
          target.deviceId === a.deviceId &&
          target.sessionId === value.session_id &&
          now - (target.heartbeatAt || 0) < 30000
        );
      });
    if (!viewers.length) {
      this.viewControl({ ...a, sessionId: value.session_id }, false);
      return;
    }
    const times = Object.fromEntries(
      Object.entries(a.frameTimes || {}).filter(
        ([, time]) => now - time < 30000,
      ),
    );
    socket.serializeAttachment({
      ...a,
      frameTimes: { ...times, [value.session_id]: now },
    });
    // Memory-only forwarding. No D1, storage, analytics, logging, or model calls.
    const frame = JSON.stringify({
      type: "runner_frame",
      session_id: value.session_id,
      data: value.data,
    });
    for (const viewer of viewers) {
      if (
        (viewer.deserializeAttachment() as SocketAttachment).video?.phase ===
        "playing"
      )
        continue;
      try {
        viewer.send(frame);
      } catch {
        /* Slow/disconnected viewer drops the frame. */
      }
    }
  }

  private handleAgentConnect(request: Request): Response {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("Expected websocket", { status: 426 });
    }

    const userId = request.headers.get("x-remote-link-user-id");
    const deviceId = request.headers.get("x-remote-link-device-id");
    if (!userId || !deviceId) {
      return new Response("Missing trusted device identity", { status: 401 });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    server.serializeAttachment({
      userId,
      deviceId,
    } satisfies SocketAttachment);

    this.ctx.acceptWebSocket(server, ["user:" + userId, "device:" + deviceId]);

    const requestedProtocols = (
      request.headers.get("sec-websocket-protocol") || ""
    )
      .split(",")
      .map((value) => value.trim());

    const headers = new Headers();
    if (requestedProtocols.includes("remotearc")) {
      headers.set("sec-websocket-protocol", "remotearc");
    }

    return new Response(null, { status: 101, webSocket: client, headers });
  }

  private listDevices(request: Request) {
    const userId = request.headers.get("x-remote-link-user-id");
    if (!userId) return [];

    const byDevice = new Map<string, WebSocket[]>();
    for (const socket of this.ctx.getWebSockets("user:" + userId)) {
      const attachment =
        socket.deserializeAttachment() as SocketAttachment | null;
      if (!attachment?.deviceId) continue;
      const sockets = byDevice.get(attachment.deviceId) || [];
      sockets.push(socket);
      byDevice.set(attachment.deviceId, sockets);
    }

    return Array.from(byDevice.entries()).map(([deviceId, sockets]) => {
      const socket = this.preferredSocket(sockets);
      const attachment =
        socket?.deserializeAttachment() as SocketAttachment | null;
      const backgroundSocket = sockets
        .map(
          (candidate) =>
            candidate.deserializeAttachment() as SocketAttachment | null,
        )
        .filter((candidate) => candidate?.device?.backgroundProcess === true)
        .sort((left, right) => {
          const leftTime = Date.parse(left?.device?.connectedAt || "") || 0;
          const rightTime = Date.parse(right?.device?.connectedAt || "") || 0;
          return rightTime - leftTime;
        })[0];
      return {
        id: deviceId,
        ...(attachment?.device || {}),
        tools: attachment?.tools || [],
        capabilities: attachment?.capabilities || [],
        status: "online",
        execution_paused: attachment?.device?.executionPaused === true,
        recovery_enabled: attachment?.device?.recoveryEnabled,
        background_guard_active: attachment?.device?.supervisorActive === true,
        background_guard_pid: attachment?.device?.supervisorPid ?? null,
        background_guard_service: attachment?.device?.supervisorService ?? null,
        recovery_bundle_version: attachment?.device?.recoveryVersion ?? null,
        execution_mode: attachment?.device?.backgroundProcess
          ? "background"
          : "foreground",
        background_active: Boolean(backgroundSocket),
        background_pid: backgroundSocket?.device?.pid ?? null,
        background_agent_version:
          backgroundSocket?.device?.agentVersion ?? null,
        background_connected_at: backgroundSocket?.device?.connectedAt ?? null,
      };
    });
  }

  private async handleDisconnect(request: Request): Promise<Response> {
    const userId = request.headers.get("x-remote-link-user-id");
    if (!userId) {
      return Response.json({ error: "missing user identity" }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      deviceId?: string;
    };
    if (!body.deviceId) {
      return Response.json({ error: "deviceId is required" }, { status: 400 });
    }

    let disconnected = 0;
    for (const socket of this.ctx.getWebSockets("device:" + body.deviceId)) {
      const attachment =
        socket.deserializeAttachment() as SocketAttachment | null;
      if (attachment?.userId !== userId) continue;
      if (attachment.publications && this.video)
        this.ctx.waitUntil(this.video.disconnectDevice(socket));
      try {
        socket.close(4001, "device revoked");
        disconnected++;
      } catch {
        // Best effort: a socket may already be closing.
      }
    }

    return Response.json({ ok: true, disconnected });
  }

  private async handleCall(request: Request): Promise<Response> {
    const userId = request.headers.get("x-remote-link-user-id");
    if (!userId) {
      return Response.json({ error: "missing user identity" }, { status: 401 });
    }

    const body = (await request.json()) as {
      requestId?: string;
      deviceId?: string;
      tool?: string;
      arguments?: Record<string, unknown>;
      policy?: AgentCallMessage["policy"];
    };

    if (!body.deviceId || !body.tool) {
      return Response.json(
        { error: "deviceId and tool are required" },
        { status: 400 },
      );
    }

    const timeoutError = processTimeoutError(body.tool, body.arguments || {});
    if (timeoutError) return Response.json({ error: timeoutError }, { status: 400 });

    const socket = this.preferredSocket(
      this.ctx.getWebSockets("device:" + body.deviceId),
    );
    if (!socket) {
      return Response.json({ error: "device offline" }, { status: 404 });
    }

    const attachment =
      socket.deserializeAttachment() as SocketAttachment | null;

    if (!attachment || attachment.userId !== userId) {
      return Response.json({ error: "device not found" }, { status: 404 });
    }

    const tools = attachment.tools || [];
    if (
      attachment.device?.executionPaused === true &&
      ![
        "set_device_runtime",
        "set_background_agent",
        "background_agent_status",
      ].includes(body.tool)
    ) {
      return Response.json(
        { error: "Device is paused. Resume it from Dashboard to use tools." },
        { status: 409 },
      );
    }
    if (!tools.includes(body.tool)) {
      return Response.json(
        { error: `tool not available on device: ${body.tool}` },
        { status: 403 },
      );
    }

    const authFill = body.tool === "browser_fill" ||
      (["browser_act","browser_runner_act"].includes(body.tool) &&
       ["fill","fill_form"].includes(String(body.arguments?.action)));
    if (body.policy?.browserAuth && authFill && !attachment.capabilities?.includes("browser_auth_policy_v1")) {
      return Response.json({error:"BROWSER_AUTH_UPDATE_REQUIRED: update the Remote Arc Agent or Chrome extension before filling fields. This version cannot enforce Dashboard authentication approvals."},{status:409});
    }

    const id =
      body.requestId && /^[0-9a-f-]{36}$/i.test(body.requestId)
        ? body.requestId
        : crypto.randomUUID();
    const message: AgentCallMessage = {
      type: "call",
      id,
      tool: body.tool,
      arguments: body.arguments || {},
      policy: body.policy,
    };

    const result = await new Promise<unknown>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("device call timed out"));
      }, deviceCallTimeoutMs(body.tool!, body.arguments || {}));

      this.pending.set(id, { resolve, reject, timeout });
      try {
        socket.send(JSON.stringify(message));
      } catch (error) {
        clearTimeout(timeout);
        this.pending.delete(id);
        reject(error);
      }
    }).catch((error) => ({
      __remoteLinkError: error instanceof Error ? error.message : String(error),
    }));

    if (
      typeof result === "object" &&
      result !== null &&
      "__remoteLinkError" in result
    ) {
      return Response.json(
        {
          error: String(
            (result as { __remoteLinkError: unknown }).__remoteLinkError,
          ),
        },
        { status: 504 },
      );
    }

    return Response.json({ result });
  }

  webSocketMessage(socket: WebSocket, message: string | ArrayBuffer) {
    if (typeof message !== "string") return;

    let parsed: AgentToRelayMessage | { type: "ping" };
    try {
      parsed = JSON.parse(message) as AgentToRelayMessage | { type: "ping" };
    } catch {
      return;
    }

    if (!parsed || typeof parsed !== "object") return;
    const attachment =
      socket.deserializeAttachment() as SocketAttachment | null;
    if (!attachment) return;
    if (attachment.viewer) {
      if (parsed.type === "ping") {
        const current = { ...attachment, heartbeatAt: Date.now() };
        socket.serializeAttachment(current);
        this.viewControl(current, true);
        socket.send(JSON.stringify({ type: "pong" }));
        if (current.video)
          this.ctx.waitUntil(
            this.video
              ?.heartbeat(socket)
              .catch(() => this.video?.stopViewer(socket)) || Promise.resolve(),
          );
      } else if (
        ["video_start", "video_answer", "video_stop", "video_playing"].includes(
          parsed.type,
        )
      ) {
        if (message.length > 70000) return;
        if (this.video)
          this.ctx.waitUntil(
            this.video
              .viewer(socket, parsed)
              .catch(() => this.video?.stopViewer(socket)),
          );
        else
          socket.send(
            JSON.stringify({ type: "runner_video", action: "fallback" }),
          );
      }
      return; // A viewer can never impersonate an Agent or dispatch an action.
    }
    if (parsed.type === "runner_video") {
      if (message.length <= 70000 && this.video)
        this.ctx.waitUntil(
          this.video
            .agent(socket, parsed)
            .catch(() => this.video?.disconnectDevice(socket)),
        );
      return;
    }
    if (parsed.type === "runner_frame") {
      this.forwardRunnerFrame(socket, attachment, parsed);
      return;
    }
    if (parsed.type === "runner_attention" && this.env) {
      this.attentionChain = this.attentionChain
        .catch(() => {})
        .then(async () => {
          await recordRunnerAttention(
            this.env!,
            attachment.userId,
            attachment.deviceId,
            parsed,
          );
          const event = parsed as unknown as { event_id: string; kind: string };
          socket.send(
            JSON.stringify({
              type: "runner_attention_ack",
              event_id: event.event_id,
              kind: event.kind,
            }),
          );
        });
      this.ctx.waitUntil(this.attentionChain.catch(() => {}));
      return;
    }

    if (parsed.type === "hello") {
      const attachment =
        socket.deserializeAttachment() as SocketAttachment | null;
      if (!attachment) return;

      const metricMinute = Math.floor(Date.now()/60000);
      if (this.env && (!attachment.connectionRecorded || attachment.metricMinute !== metricMinute)) {
        this.ctx.waitUntil(recordDeviceConnection(this.env,attachment.userId,attachment.deviceId,
          attachment.connectionRecorded?'heartbeat':'connected',parsed.device || {}));
      }

      // Treat telemetry as untrusted even from an enrolled device. Server timestamps
      // prevent clock skew or spoofed timestamps from bypassing freshness checks.
      const rawCapacity = parsed.device?.capacity;
      const capacity =
        rawCapacity &&
        typeof rawCapacity.memoryTotalMB === "number" &&
        Number.isFinite(rawCapacity.memoryTotalMB) &&
        rawCapacity.memoryTotalMB > 0 &&
        rawCapacity.memoryTotalMB < 16_000_000 &&
        typeof rawCapacity.memoryAvailableMB === "number" &&
        Number.isFinite(rawCapacity.memoryAvailableMB) &&
        rawCapacity.memoryAvailableMB >= 0 &&
        rawCapacity.memoryAvailableMB <= rawCapacity.memoryTotalMB &&
        (rawCapacity.cpuPercent === undefined ||
          (typeof rawCapacity.cpuPercent === "number" &&
            Number.isFinite(rawCapacity.cpuPercent) &&
            rawCapacity.cpuPercent >= 0 &&
            rawCapacity.cpuPercent <= 100)) &&
        (rawCapacity.managedProcesses === undefined ||
          (Number.isInteger(rawCapacity.managedProcesses) &&
            rawCapacity.managedProcesses >= 0 &&
            rawCapacity.managedProcesses <= 32))
          ? {
              observedAt: new Date().toISOString(),
              memoryTotalMB: rawCapacity.memoryTotalMB,
              memoryAvailableMB: rawCapacity.memoryAvailableMB,
              ...(rawCapacity.cpuPercent !== undefined
                ? { cpuPercent: rawCapacity.cpuPercent }
                : {}),
              ...(rawCapacity.managedProcesses !== undefined
                ? { managedProcesses: rawCapacity.managedProcesses }
                : {}),
            }
          : null;
      socket.serializeAttachment({
        ...attachment,
        connectionRecorded: true,
        metricMinute,
        device: {
          ...parsed.device,
          id: attachment.deviceId,
          capacity,
          connectedAt:
            attachment.device?.connectedAt || new Date().toISOString(),
          lastSeen: new Date().toISOString(),
        },
        tools: parsed.tools,
        capabilities: parsed.capabilities || [],
      } satisfies SocketAttachment);
      if (parsed.device?.executionPaused)
        this.ctx.waitUntil(
          this.video?.disconnectDevice(socket) || Promise.resolve(),
        );
      return;
    }

    if (parsed.type === "result") {
      const pending = this.pending.get(parsed.id);
      if (!pending) return;

      clearTimeout(pending.timeout);
      this.pending.delete(parsed.id);

      if (parsed.error) {
        pending.reject(new Error(parsed.error));
      } else {
        pending.resolve(parsed.result);
      }
    }
  }

  webSocketClose(socket: WebSocket) {
    const a = socket.deserializeAttachment() as SocketAttachment | null;
    if (a && !a.viewer && a.connectionRecorded && !a.disconnectRecorded && this.env) {
      socket.serializeAttachment({...a,disconnectRecorded:true});
      this.ctx.waitUntil(recordDeviceConnection(this.env,a.userId,a.deviceId,'disconnected',a.device||{}));
    }
    if (a?.viewer) {
      socket.serializeAttachment({ ...a, heartbeatAt: 0 });
      if (a.video)
        this.ctx.waitUntil(this.video?.stopViewer(socket) || Promise.resolve());
    } else if (a?.publications)
      this.ctx.waitUntil(
        this.video?.disconnectDevice(socket) || Promise.resolve(),
      );
    if (
      a?.viewer &&
      !this.ctx
        .getWebSockets(this.viewTag(a))
        .some(
          (other) =>
            other !== socket &&
            Date.now() -
              ((other.deserializeAttachment() as SocketAttachment)
                ?.heartbeatAt || 0) <
              30000,
        )
    )
      this.viewControl(a, false);
    try {
      socket.close(1000, "closed");
    } catch {
      // ignore
    }
  }

  webSocketError(socket: WebSocket) {
    this.webSocketClose(socket);
    try {
      socket.close(1011, "error");
    } catch {
      // ignore
    }
  }
}
