import { applicationJson } from "../platform/application-json.js";
import { recordRunnerAttention, type RunnerEnv } from "../browser/runner-attention.js";
import { RunnerVideoRelay, type VideoAttachment } from "../browser/runner-video.js";
import { deviceCallTimeoutMs, processTimeoutError } from "./call-timeout.js";
import { HEARTBEAT_INTERVAL_MS, recordDeviceConnection } from "../analytics/device-reliability.js";
import { recordProductEvent } from "../analytics/product-events.js";
import { LIVE_TOPICS, type LiveTopic } from "./live.js";
import type {
  AgentCallMessage,
  AgentToRelayMessage,
  ApprovalPendingSignal,
  DeviceMetadata,
} from "@remotearc/protocol";

/** An error the device itself returned for a call, as opposed to no reply. */
class DeviceReportedError extends Error {}

type PendingCall = {
  socket: WebSocket;
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
  timeout: ReturnType<typeof setTimeout>;
};

type SocketAttachment = VideoAttachment & {
  lastSignalAt?: number;
  staleRecorded?: boolean;
  viewer?: boolean;
  /** A Dashboard change feed; never an Agent and never a runner viewer. */
  live?: boolean;
  sessionId?: string;
  heartbeatAt?: number;
  frameTimes?: Record<string, number>;
  userId: string;
  deviceId: string;
  device?: DeviceMetadata;
  tools?: string[];
  capabilities?: string[];
  connectionRecorded?: boolean;
  metricWindow?: number;
  disconnectRecorded?: boolean;
};

/** One feed per Dashboard tab; more than this is a runaway reconnect loop. */
const MAX_LIVE_SOCKETS = 12;

export class DeviceRegistry {
  private pending = new Map<string, PendingCall>();
  private attentionChain: Promise<void> = Promise.resolve();
  private video?: RunnerVideoRelay;

  constructor(
    private readonly ctx: DurableObjectState,
    private readonly env?: RunnerEnv,
  ) {
    // Dashboard keepalives are answered without waking this object. Agents and
    // runner viewers send JSON pings, which this exact string does not match.
    if (typeof WebSocketRequestResponsePair !== "undefined")
      ctx.setWebSocketAutoResponse?.(new WebSocketRequestResponsePair("ping", "pong"));
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

  private signalAt(attachment: SocketAttachment | null) {
    const at =
      attachment?.lastSignalAt ??
      Date.parse(attachment?.device?.lastSeen || attachment?.device?.connectedAt || "");
    return Number.isFinite(at) ? at : null;
  }

  private stale(socket: WebSocket) {
    const at = this.signalAt(socket.deserializeAttachment() as SocketAttachment | null);
    // Legacy attachments without a timestamp get the next hello/ping timestamp.
    return at !== null && (Date.now() - at > 120000 || at > Date.now() + 5000);
  }

  private expireSocket(socket: WebSocket, report = true) {
    const attachment = socket.deserializeAttachment() as SocketAttachment | null;
    if (!attachment || attachment.viewer || !this.stale(socket)) return;
    if (!attachment.staleRecorded) {
      socket.serializeAttachment({ ...attachment, staleRecorded: true });
      if (this.env && report)
        this.ctx.waitUntil(
          recordProductEvent(this.env, {
            domain: "devices",
            name: "device.presence.stale",
            source: "server",
            outcome: "failed",
            userId: attachment.userId,
            entityId: attachment.deviceId,
            errorCode: "DEVICE_SIGNAL_STALE",
          }),
        );
    }
    // Closing an expired transport lets the existing Agent reconnect on wake.
    // No tool, process or browser action is retried here.
    try {
      socket.close(4002, "device signal stale");
    } catch {}
  }

  private preferredSocket(sockets: WebSocket[], includeStale = false) {
    return [...sockets]
      .filter(
        (socket) =>
          (socket.readyState === undefined || socket.readyState === 1) &&
          (includeStale || !this.stale(socket)),
      )
      .sort((a, b) => {
        const left = a.deserializeAttachment() as SocketAttachment | null;
        const right = b.deserializeAttachment() as SocketAttachment | null;
        const leftPolicy = left?.capabilities?.includes("device_policy_v1") ? 1 : 0;
        const rightPolicy = right?.capabilities?.includes("device_policy_v1") ? 1 : 0;
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
      return applicationJson(this.listDevices(request));
    }

    if (url.pathname === "/call" && request.method === "POST") {
      return this.handleCall(request);
    }

    if (url.pathname === "/disconnect" && request.method === "POST") {
      return this.handleDisconnect(request);
    }
    if (url.pathname === "/reconnect" && request.method === "POST")
      return this.handleReconnect(request);
    if (url.pathname === "/approval-pending" && request.method === "POST")
      return this.handleApprovalPending(request);
    if (url.pathname === "/live") return this.handleLive(request);
    if (url.pathname === "/live-notify" && request.method === "POST")
      return this.handleLiveNotify(request);

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
              (socket.deserializeAttachment() as SocketAttachment).video?.phase !== "playing",
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
    if (!userId || !deviceId || !sessionId || !/^[A-Za-z0-9_-]{1,100}$/.test(sessionId))
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
  private forwardRunnerFrame(socket: WebSocket, a: SocketAttachment, value: any) {
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
        const target = viewer.deserializeAttachment() as SocketAttachment | null;
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
      Object.entries(a.frameTimes || {}).filter(([, time]) => now - time < 30000),
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
      if ((viewer.deserializeAttachment() as SocketAttachment).video?.phase === "playing") continue;
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
      lastSignalAt: Date.now(),
    } satisfies SocketAttachment);

    this.ctx.acceptWebSocket(server, ["user:" + userId, "device:" + deviceId]);

    const requestedProtocols = (request.headers.get("sec-websocket-protocol") || "")
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
      const attachment = socket.deserializeAttachment() as SocketAttachment | null;
      if (
        !attachment?.deviceId ||
        attachment.userId !== userId ||
        attachment.viewer ||
        (socket.readyState !== undefined && socket.readyState !== 1)
      )
        continue;
      const sockets = byDevice.get(attachment.deviceId) || [];
      sockets.push(socket);
      byDevice.set(attachment.deviceId, sockets);
    }

    return Array.from(byDevice.entries()).map(([deviceId, sockets]) => {
      const liveSocket = this.preferredSocket(sockets);
      const socket = liveSocket || this.preferredSocket(sockets, true);
      const attachment = socket?.deserializeAttachment() as SocketAttachment | null;
      for (const candidate of sockets) this.expireSocket(candidate, !liveSocket);
      const backgroundSocket = sockets
        .map((candidate) => candidate.deserializeAttachment() as SocketAttachment | null)
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
        status: liveSocket ? "online" : "offline",
        connection_state: liveSocket ? "connected" : "stale",
        execution_paused: attachment?.device?.executionPaused === true,
        recovery_enabled: attachment?.device?.recoveryEnabled,
        background_guard_active:
          Boolean(liveSocket) && attachment?.device?.supervisorActive === true,
        background_guard_pid: attachment?.device?.supervisorPid ?? null,
        background_guard_service: attachment?.device?.supervisorService ?? null,
        recovery_bundle_version: attachment?.device?.recoveryVersion ?? null,
        execution_mode: attachment?.device?.backgroundProcess ? "background" : "foreground",
        background_active: Boolean(liveSocket && backgroundSocket),
        background_pid: backgroundSocket?.device?.pid ?? null,
        background_agent_version: backgroundSocket?.device?.agentVersion ?? null,
        background_connected_at: backgroundSocket?.device?.connectedAt ?? null,
      };
    });
  }

  private async handleReconnect(request: Request): Promise<Response> {
    const userId = request.headers.get("x-remote-link-user-id");
    if (!userId) return applicationJson({ error: "missing user identity" }, { status: 401 });
    const body = (await request.json().catch(() => null)) as { deviceId?: unknown } | null;
    if (typeof body?.deviceId !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(body.deviceId))
      return applicationJson({ error: "invalid deviceId" }, { status: 400 });
    const sockets = this.ctx.getWebSockets("device:" + body.deviceId).filter((socket) => {
      const a = socket.deserializeAttachment() as SocketAttachment | null;
      return (
        a?.userId === userId &&
        !a.viewer &&
        (socket.readyState === undefined || socket.readyState === 1)
      );
    });
    const connected = sockets.filter((socket) => !this.stale(socket)).length;
    const expired = sockets.filter((socket) => this.stale(socket));
    for (const socket of expired) this.expireSocket(socket, connected === 0);
    return applicationJson({
      state: connected
        ? "connection_present"
        : expired.length
          ? "reconnect_requested"
          : "device_unreachable",
      connected,
      retired: expired.length,
    });
  }

  private async handleDisconnect(request: Request): Promise<Response> {
    const userId = request.headers.get("x-remote-link-user-id");
    if (!userId) {
      return applicationJson({ error: "missing user identity" }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      deviceId?: string;
    };
    if (!body.deviceId) {
      return applicationJson({ error: "deviceId is required" }, { status: 400 });
    }

    let disconnected = 0;
    for (const socket of this.ctx.getWebSockets("device:" + body.deviceId)) {
      const attachment = socket.deserializeAttachment() as SocketAttachment | null;
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

    return applicationJson({ ok: true, disconnected });
  }

  /**
   * Tells the device's Agent that a write approval is waiting, so a terminal
   * can show it without polling. Agents that predate the signal ignore it.
   */
  private async handleApprovalPending(request: Request): Promise<Response> {
    const userId = request.headers.get("x-remote-link-user-id");
    if (!userId) {
      return applicationJson({ error: "missing user identity" }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as { deviceId?: string };
    if (!body.deviceId) {
      return applicationJson({ error: "deviceId is required" }, { status: 400 });
    }

    let delivered = 0;
    for (const socket of this.ctx.getWebSockets("device:" + body.deviceId)) {
      const attachment = socket.deserializeAttachment() as SocketAttachment | null;
      if (attachment?.userId !== userId || attachment.viewer) continue;
      try {
        socket.send(JSON.stringify({ type: "approval_pending" } satisfies ApprovalPendingSignal));
        delivered++;
      } catch {
        // Best effort: the Agent also checks on its own fallback schedule.
      }
    }

    this.notifyLive(userId, "approvals");
    return applicationJson({ ok: true, delivered });
  }

  private handleLive(request: Request): Response {
    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket")
      return new Response("WebSocket required", { status: 426 });
    const userId = request.headers.get("x-remote-link-user-id");
    if (!userId) return new Response("Forbidden", { status: 403 });
    if (this.ctx.getWebSockets("live:" + userId).length >= MAX_LIVE_SOCKETS)
      return new Response("Too many open Dashboard tabs", { status: 429 });
    const pair = new WebSocketPair();
    pair[1].serializeAttachment({ live: true, userId, deviceId: "" } satisfies SocketAttachment);
    this.ctx.acceptWebSocket(pair[1], ["live:" + userId]);
    return new Response(null, {
      status: 101,
      webSocket: pair[0],
      headers: { "cache-control": "no-store" },
    });
  }

  private async handleLiveNotify(request: Request): Promise<Response> {
    const userId = request.headers.get("x-remote-link-user-id");
    if (!userId) {
      return applicationJson({ error: "missing user identity" }, { status: 401 });
    }
    const body = (await request.json().catch(() => ({}))) as { topic?: string };
    const topic = LIVE_TOPICS.find((candidate) => candidate === body.topic);
    if (!topic) return applicationJson({ error: "unknown topic" }, { status: 400 });
    return applicationJson({ ok: true, delivered: this.notifyLive(userId, topic) });
  }

  /** Tells this person's open Dashboards which list to reload. */
  private notifyLive(userId: string, topic: LiveTopic) {
    let delivered = 0;
    for (const socket of this.ctx.getWebSockets("live:" + userId)) {
      const attachment = socket.deserializeAttachment() as SocketAttachment | null;
      if (!attachment?.live || attachment.userId !== userId) continue;
      try {
        socket.send(JSON.stringify({ type: "changed", topic }));
        delivered++;
      } catch {
        // A closing tab reconnects and reloads everything.
      }
    }
    return delivered;
  }

  private async handleCall(request: Request): Promise<Response> {
    const userId = request.headers.get("x-remote-link-user-id");
    if (!userId) {
      return applicationJson({ error: "missing user identity" }, { status: 401 });
    }

    const body = (await request.json()) as {
      requestId?: string;
      deviceId?: string;
      tool?: string;
      arguments?: Record<string, unknown>;
      policy?: AgentCallMessage["policy"];
    };

    if (!body.deviceId || !body.tool) {
      return applicationJson({ error: "deviceId and tool are required" }, { status: 400 });
    }

    const timeoutError = processTimeoutError(body.tool, body.arguments || {});
    if (timeoutError) return applicationJson({ error: timeoutError }, { status: 400 });

    const sockets = this.ctx.getWebSockets("device:" + body.deviceId).filter((socket) => {
      const attachment = socket.deserializeAttachment() as SocketAttachment | null;
      return attachment?.userId === userId && !attachment.viewer;
    });
    const socket = this.preferredSocket(sockets);
    for (const candidate of sockets) this.expireSocket(candidate, !socket);
    if (!socket) {
      return applicationJson({ error: "device offline" }, { status: 404 });
    }

    const attachment = socket.deserializeAttachment() as SocketAttachment | null;

    if (!attachment || attachment.userId !== userId) {
      return applicationJson({ error: "device not found" }, { status: 404 });
    }

    const tools = attachment.tools || [];
    if (
      attachment.device?.executionPaused === true &&
      !["set_device_runtime", "set_background_agent", "background_agent_status"].includes(body.tool)
    ) {
      return applicationJson(
        { error: "Device is paused. Resume it from Dashboard to use tools." },
        { status: 409 },
      );
    }
    if (!tools.includes(body.tool)) {
      return applicationJson(
        { error: `tool not available on device: ${body.tool}` },
        { status: 403 },
      );
    }

    const authFill =
      body.tool === "browser_fill" ||
      (["browser_act", "browser_runner_act"].includes(body.tool) &&
        ["fill", "fill_form"].includes(String(body.arguments?.action)));
    if (
      body.policy?.browserAuth &&
      authFill &&
      !attachment.capabilities?.includes("browser_auth_policy_v1")
    ) {
      return applicationJson(
        {
          error:
            "BROWSER_AUTH_UPDATE_REQUIRED: update the Remote Arc Agent or Chrome extension before filling fields. This version cannot enforce Dashboard authentication approvals.",
        },
        { status: 409 },
      );
    }

    const id =
      body.requestId && /^[0-9a-f-]{36}$/i.test(body.requestId)
        ? body.requestId
        : crypto.randomUUID();
    const message: AgentCallMessage = {
      expires_at: new Date(
        Date.now() + deviceCallTimeoutMs(body.tool, body.arguments || {}),
      ).toISOString(),
      type: "call",
      id,
      tool: body.tool,
      arguments: body.arguments || {},
      policy: body.policy,
    };

    const result = await new Promise<unknown>((resolve, reject) => {
      const timeout = setTimeout(
        () => {
          this.pending.delete(id);
          reject(new Error("device call timed out"));
        },
        deviceCallTimeoutMs(body.tool!, body.arguments || {}),
      );

      this.pending.set(id, { socket, resolve, reject, timeout });
      try {
        socket.send(JSON.stringify(message));
      } catch (error) {
        clearTimeout(timeout);
        this.pending.delete(id);
        reject(error);
      }
    }).catch((error) => ({
      __remoteLinkError: error instanceof Error ? error.message : String(error),
      __deviceReported: error instanceof DeviceReportedError,
    }));

    if (typeof result === "object" && result !== null && "__remoteLinkError" in result) {
      const failure = result as { __remoteLinkError: unknown; __deviceReported: boolean };
      // The device answered with an error (missing path, policy refusal…):
      // the request was handled, so it is not a gateway timeout.
      return applicationJson(
        { error: String(failure.__remoteLinkError) },
        { status: failure.__deviceReported ? 422 : 504 },
      );
    }

    return applicationJson({ result });
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
    const attachment = socket.deserializeAttachment() as SocketAttachment | null;
    if (!attachment) return;
    // A Dashboard feed only listens; it can never act as an Agent or viewer.
    if (attachment.live) return;
    if (attachment.viewer) {
      if (parsed.type === "ping") {
        const current = { ...attachment, heartbeatAt: Date.now() };
        socket.serializeAttachment(current);
        this.viewControl(current, true);
        socket.send(JSON.stringify({ type: "pong" }));
        if (current.video)
          this.ctx.waitUntil(
            this.video?.heartbeat(socket).catch(() => this.video?.stopViewer(socket)) ||
              Promise.resolve(),
          );
      } else if (
        ["video_start", "video_answer", "video_stop", "video_playing"].includes(parsed.type)
      ) {
        if (message.length > 70000) return;
        if (this.video)
          this.ctx.waitUntil(
            this.video.viewer(socket, parsed).catch(() => this.video?.stopViewer(socket)),
          );
        else socket.send(JSON.stringify({ type: "runner_video", action: "fallback" }));
      }
      return; // A viewer can never impersonate an Agent or dispatch an action.
    }
    if (
      ["hello", "ping", "result", "runner_video", "runner_frame", "runner_attention"].includes(
        parsed.type,
      )
    ) {
      const at = Date.now();
      socket.serializeAttachment({
        ...attachment,
        lastSignalAt: at,
        device: { ...attachment.device, lastSeen: new Date(at).toISOString() },
      });
    }
    if (parsed.type === "ping") {
      socket.send(JSON.stringify({ type: "pong" }));
      return;
    }
    if (parsed.type === "runner_video") {
      if (message.length <= 70000 && this.video)
        this.ctx.waitUntil(
          this.video.agent(socket, parsed).catch(() => this.video?.disconnectDevice(socket)),
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
          await recordRunnerAttention(this.env!, attachment.userId, attachment.deviceId, parsed);
          this.notifyLive(attachment.userId, "attention");
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
      const attachment = socket.deserializeAttachment() as SocketAttachment | null;
      if (!attachment) return;

      const metricWindow = Math.floor(Date.now() / HEARTBEAT_INTERVAL_MS);
      if (
        this.env &&
        (!attachment.connectionRecorded || attachment.metricWindow !== metricWindow)
      ) {
        this.ctx.waitUntil(
          recordDeviceConnection(
            this.env,
            attachment.userId,
            attachment.deviceId,
            attachment.connectionRecorded ? "heartbeat" : "connected",
            parsed.device || {},
          ),
        );
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
        lastSignalAt: Date.now(),
        staleRecorded: false,
        connectionRecorded: true,
        metricWindow,
        device: {
          ...parsed.device,
          id: attachment.deviceId,
          capacity,
          connectedAt: attachment.device?.connectedAt || new Date().toISOString(),
          lastSeen: new Date().toISOString(),
        },
        tools: parsed.tools,
        capabilities: parsed.capabilities || [],
      } satisfies SocketAttachment);
      if (parsed.device?.executionPaused)
        this.ctx.waitUntil(this.video?.disconnectDevice(socket) || Promise.resolve());
      return;
    }

    if (parsed.type === "result") {
      const pending = this.pending.get(parsed.id);
      if (!pending) return;

      clearTimeout(pending.timeout);
      this.pending.delete(parsed.id);

      if (parsed.error) {
        pending.reject(new DeviceReportedError(parsed.error));
      } else {
        pending.resolve(parsed.result);
      }
    }
  }

  webSocketClose(socket: WebSocket) {
    for (const [id, pending] of this.pending) {
      if (pending.socket !== socket) continue;
      clearTimeout(pending.timeout);
      this.pending.delete(id);
      pending.reject(
        new Error("device call timed out: connection closed; execution result unknown"),
      );
    }
    const a = socket.deserializeAttachment() as SocketAttachment | null;
    if (a && !a.viewer && a.connectionRecorded && !a.disconnectRecorded && this.env) {
      socket.serializeAttachment({ ...a, disconnectRecorded: true });
      this.ctx.waitUntil(
        recordDeviceConnection(this.env, a.userId, a.deviceId, "disconnected", a.device || {}),
      );
    }
    if (a?.viewer) {
      socket.serializeAttachment({ ...a, heartbeatAt: 0 });
      if (a.video) this.ctx.waitUntil(this.video?.stopViewer(socket) || Promise.resolve());
    } else if (a?.publications)
      this.ctx.waitUntil(this.video?.disconnectDevice(socket) || Promise.resolve());
    if (
      a?.viewer &&
      !this.ctx
        .getWebSockets(this.viewTag(a))
        .some(
          (other) =>
            other !== socket &&
            Date.now() - ((other.deserializeAttachment() as SocketAttachment)?.heartbeatAt || 0) <
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
