/** Owner-bound signaling for one H.264 publisher per Runner task. No media,
 * provider credentials, or provider resource locators cross the viewer boundary. */
export type RunnerVideoEnv = {
  RUNNER_VIDEO_ENABLED?: string;
  RUNNER_VIDEO_APP_ID?: string;
  RUNNER_VIDEO_APP_SECRET?: string;
  DB: D1Database;
};
type Resource = { sessionId: string; mids: string[] };
type Publication = {
  id: string;
  phase: "starting" | "publishing" | "published" | "ready";
  trackName: string;
  resource?: Resource;
};
type Subscription = {
  id: string;
  phase:
    | "waiting"
    | "subscribing"
    | "offer"
    | "answering"
    | "connected"
    | "playing";
  resource?: Resource;
};
export type VideoAttachment = {
  userId: string;
  deviceId: string;
  sessionId?: string;
  viewer?: boolean;
  heartbeatAt?: number;
  video?: Subscription;
  videoEpoch?: number;
  publications?: Record<string, Publication>;
  device?: { executionPaused?: boolean };
  tools?: string[];
  capabilities?: string[];
};
const data = (socket: WebSocket) =>
  socket.deserializeAttachment() as VideoAttachment;
const put = (socket: WebSocket, patch: Partial<VideoAttachment>) =>
  socket.serializeAttachment({ ...data(socket), ...patch });
const send = (socket: WebSocket, value: unknown) =>
  socket.send(JSON.stringify(value));
const midOK = (mid: unknown): mid is string =>
  typeof mid === "string" && /^[A-Za-z0-9_-]{1,16}$/.test(mid);
const resourceOK = (id: unknown): id is string =>
  typeof id === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(id);
export function videoSDP(
  sdp: unknown,
  direction: "sendonly" | "recvonly",
): sdp is string {
  if (typeof sdp !== "string" || sdp.length > 65536 || !sdp.startsWith("v=0"))
    return false;
  const lines = sdp.split(/\r?\n/);
  return (
    lines.filter((line) => line.startsWith("m=")).length === 1 &&
    lines.some((line) => line.startsWith("m=video ")) &&
    lines.includes("a=" + direction) &&
    lines.some((line) => /H264\/90000/i.test(line))
  );
}

class SFUError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super("sfu_unavailable");
  }
}
class SFU {
  constructor(
    private env: RunnerVideoEnv,
    private fetcher: typeof fetch,
  ) {}
  async call(path: string, body?: unknown, method = "POST"): Promise<any> {
    const response = await this.fetcher(
      `https://rtc.live.cloudflare.com/v1/apps/${encodeURIComponent(this.env.RUNNER_VIDEO_APP_ID!)}/${path}`,
      {
        method,
        redirect: "error",
        headers: {
          authorization: "Bearer " + this.env.RUNNER_VIDEO_APP_SECRET!,
          "content-type": "application/json",
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(
          path.endsWith("tracks/close") ? 10000 : 5000,
        ),
      },
    );
    const result = (await response.json()) as any;
    // Never reflect provider errors, SDP or credentials into diagnostics.
    if (!response.ok || !result || result.errorCode)
      throw new SFUError(response.status, String(result?.errorCode || ""));
    return result;
  }
  async create(): Promise<Resource> {
    const result = await this.call("sessions/new");
    if (!resourceOK(result.sessionId)) throw new Error("invalid_sfu_session");
    return { sessionId: result.sessionId, mids: [] };
  }
  async close(resource?: Resource) {
    if (!resource?.mids.length) return;
    // Force-close known flows even after the endpoint or negotiation disappears.
    let result: any;
    try {
      result = await this.call(
        `sessions/${resource.sessionId}/tracks/close`,
        { force: true, tracks: resource.mids.map((mid) => ({ mid })) },
        "PUT",
      );
    } catch (error) {
      // This ID came from a successful allocation owned by this broker. A 410
      // session_error after disconnect confirms that session has expired/closed.
      if (
        error instanceof SFUError &&
        error.status === 410 &&
        error.code === "session_error"
      )
        return;
      throw error;
    }
    if (
      resource.mids.some(
        (mid) =>
          !result.tracks?.some(
            (track: any) =>
              track.mid === mid &&
              (!track.errorCode || track.errorCode === "close_track_error"),
          ),
      )
    )
      throw new Error("sfu_close_failed");
  }
}

export class RunnerVideoRelay {
  private sfu: SFU;
  constructor(
    private ctx: DurableObjectState,
    private env: RunnerVideoEnv,
    private device: (a: VideoAttachment) => WebSocket | undefined,
    private control: (a: VideoAttachment, watching: boolean) => void,
    fetcher: typeof fetch = fetch,
  ) {
    this.sfu = new SFU(env, fetcher);
  }

  private viewers(a: VideoAttachment) {
    return this.ctx
      .getWebSockets(`runner-view:${a.userId}:${a.deviceId}:${a.sessionId}`)
      .filter((socket) => {
        const target = data(socket);
        return (
          target.viewer &&
          target.userId === a.userId &&
          target.deviceId === a.deviceId &&
          target.sessionId === a.sessionId
        );
      });
  }
  private publication(a: VideoAttachment): Publication | undefined {
    const socket = this.device(a);
    return socket ? data(socket).publications?.[a.sessionId!] : undefined;
  }
  private savePublication(a: VideoAttachment, publication?: Publication) {
    const socket = this.device(a);
    if (!socket) return;
    const publications = { ...data(socket).publications };
    if (publication) publications[a.sessionId!] = publication;
    else delete publications[a.sessionId!];
    put(socket, { publications });
  }
  private fresh(socket: WebSocket) {
    return Date.now() - (data(socket).heartbeatAt || 0) < 30000;
  }
  async authorized(a: VideoAttachment) {
    const socket = this.device(a),
      device = socket && data(socket);
    if (
      this.env.RUNNER_VIDEO_ENABLED !== "1" ||
      !this.env.RUNNER_VIDEO_APP_ID ||
      !this.env.RUNNER_VIDEO_APP_SECRET ||
      !device?.capabilities?.includes("runner_video_v1")
    )
      return false;
    return this.readable(a);
  }
  private async readable(a: VideoAttachment) {
    const socket = this.device(a),
      device = socket && data(socket);
    if (
      !device ||
      device.device?.executionPaused ||
      !device.tools?.includes("browser_runner_snapshot")
    )
      return false;
    const row = await this.env.DB.prepare(
      "SELECT allowed_tools FROM devices WHERE id=?1 AND user_id=?2 AND revoked_at IS NULL",
    )
      .bind(a.deviceId, a.userId)
      .first<{ allowed_tools: string | null }>();
    try {
      return Boolean(
        row &&
          JSON.parse(row.allowed_tools || "[]").includes(
            "browser_runner_snapshot",
          ),
      );
    } catch {
      return false;
    }
  }
  async viewer(socket: WebSocket, value: any) {
    const a = data(socket);
    if (!a.viewer) return;
    if (value.type === "video_stop") {
      await this.stopViewer(socket);
      return;
    }
    const epoch = (a.videoEpoch || 0) + (value.type === "video_start" ? 1 : 0);
    if (value.type === "video_start") put(socket, { videoEpoch: epoch });
    if (!this.fresh(socket) || !(await this.authorized(a))) {
      await this.stopViewer(socket);
      return;
    }
    // Ownership may have changed during the DB read or socket teardown.
    if (!this.fresh(socket) || data(socket).videoEpoch !== epoch) return;
    if (value.type === "video_start") {
      if (data(socket).video) return;
      let pub = this.publication(a);
      if (!pub) {
        const device = this.device(a)!;
        if (Object.keys(data(device).publications || {}).length >= 4) return;
        pub = {
          id: crypto.randomUUID(),
          phase: "starting",
          trackName: "screen-" + crypto.randomUUID(),
        };
        this.savePublication(a, pub);
        put(socket, { video: { id: pub.id, phase: "waiting" } });
        this.control(a, true);
        send(device, {
          type: "runner_video",
          action: "start",
          session_id: a.sessionId,
          stream_id: pub.id,
        });
      } else {
        put(socket, { video: { id: pub.id, phase: "waiting" } });
        if (pub.phase === "ready") await this.subscribe(socket, pub);
      }
      await this.schedule();
      return;
    }
    const subscription = data(socket).video;
    if (!subscription || value.stream_id !== subscription.id) return;
    if (value.type === "video_playing" && subscription.phase === "connected") {
      put(socket, { video: { ...subscription, phase: "playing" } });
      this.control(a, true);
    } else if (
      value.type === "video_answer" &&
      subscription.phase === "offer" &&
      subscription.resource &&
      videoSDP(value.sdp, "recvonly")
    ) {
      put(socket, { video: { ...subscription, phase: "answering" } });
      try {
        await this.sfu.call(
          `sessions/${subscription.resource.sessionId}/renegotiate`,
          { sessionDescription: { type: "answer", sdp: value.sdp } },
          "PUT",
        );
        if (data(socket).video?.id !== subscription.id || !this.fresh(socket))
          return;
        put(socket, { video: { ...subscription, phase: "connected" } });
        send(socket, {
          type: "runner_video",
          action: "connected",
          stream_id: subscription.id,
        });
      } catch {
        await this.stopViewer(socket);
      }
    }
  }

  async agent(socket: WebSocket, value: any) {
    const a = { ...data(socket), sessionId: value.session_id };
    if (a.viewer || !/^[A-Za-z0-9_-]{1,100}$/.test(a.sessionId || "")) return;
    let pub = this.publication(a);
    if (!pub || pub.id !== value.stream_id || this.device(a) !== socket) return;
    if (value.action === "ended") {
      await this.stopPublication(a, pub.id);
      return;
    }
    if (!(await this.authorized(a))) {
      await this.stopPublication(a, pub.id);
      return;
    }
    pub = this.publication(a);
    if (!pub || pub.id !== value.stream_id) return;
    if (
      value.action === "offer" &&
      pub.phase === "starting" &&
      videoSDP(value.sdp, "sendonly") &&
      midOK(value.mid)
    ) {
      pub = { ...pub, phase: "publishing" };
      this.savePublication(a, pub); // claim before network awaits; duplicate offers cannot allocate
      let resource: Resource | undefined;
      try {
        resource = await this.sfu.create();
        resource.mids = [value.mid];
        if (this.publication(a)?.id !== pub.id) {
          await this.close(resource);
          return;
        }
        this.savePublication(a, { ...pub, resource });
        const result = await this.sfu.call(
          `sessions/${resource.sessionId}/tracks/new`,
          {
            sessionDescription: { type: "offer", sdp: value.sdp },
            tracks: [
              { location: "local", mid: value.mid, trackName: pub.trackName },
            ],
          },
        );
        if (this.publication(a)?.id !== pub.id) {
          await this.close(resource);
          return;
        }
        if (
          result.tracks?.length !== 1 ||
          result.tracks.some((track: any) => track.errorCode) ||
          result.sessionDescription?.type !== "answer" ||
          !videoSDP(result.sessionDescription.sdp, "recvonly")
        )
          throw new Error("invalid_sfu_answer");
        this.savePublication(a, { ...pub, phase: "published", resource });
        send(socket, {
          type: "runner_video",
          action: "answer",
          session_id: a.sessionId,
          stream_id: pub.id,
          sdp: result.sessionDescription.sdp,
        });
      } catch {
        await this.close(resource);
        await this.stopPublication(a, pub.id);
      }
    } else if (value.action === "ready" && pub.phase === "published") {
      pub = { ...pub, phase: "ready" };
      this.savePublication(a, pub);
      await Promise.all(
        this.viewers(a)
          .filter(
            (viewer) =>
              data(viewer).video?.id === pub!.id && this.fresh(viewer),
          )
          .map((viewer) => this.subscribe(viewer, pub!)),
      );
    }
  }

  private async subscribe(socket: WebSocket, pub: Publication) {
    const a = data(socket),
      subscription = a.video;
    if (
      subscription?.id !== pub.id ||
      subscription.phase !== "waiting" ||
      !pub.resource ||
      !this.fresh(socket)
    )
      return;
    put(socket, { video: { ...subscription, phase: "subscribing" } });
    let resource: Resource | undefined;
    try {
      resource = await this.sfu.create();
      if (data(socket).video?.id !== pub.id) return;
      put(socket, { video: { id: pub.id, phase: "subscribing", resource } });
      const result = await this.sfu.call(
        `sessions/${resource.sessionId}/tracks/new`,
        {
          tracks: [
            {
              location: "remote",
              sessionId: pub.resource.sessionId,
              trackName: pub.trackName,
            },
          ],
        },
      );
      resource.mids = (result.tracks || [])
        .map((track: any) => track.mid)
        .filter(midOK);
      if (
        data(socket).video?.id !== pub.id ||
        !this.fresh(socket) ||
        this.publication(a)?.id !== pub.id
      ) {
        await this.close(resource);
        return;
      }
      if (
        result.tracks?.length !== 1 ||
        resource.mids.length !== 1 ||
        result.tracks.some((track: any) => track.errorCode) ||
        result.sessionDescription?.type !== "offer" ||
        !videoSDP(result.sessionDescription.sdp, "sendonly")
      )
        throw new Error("invalid_sfu_offer");
      put(socket, { video: { id: pub.id, phase: "offer", resource } });
      send(socket, {
        type: "runner_video",
        action: "offer",
        stream_id: pub.id,
        sdp: result.sessionDescription.sdp,
      });
    } catch {
      await this.close(resource);
      await this.stopViewer(socket);
    }
  }
  private async close(resource?: Resource) {
    if (!resource?.mids.length) return;
    const key = "runner-video-cleanup:" + resource.sessionId;
    try {
      await this.sfu.close(resource);
      await this.ctx.storage.delete(key);
    } catch {
      // Persist only resource IDs for cleanup across hibernation/provider outages.
      await this.ctx.storage.put(key, resource);
      await this.ctx.storage.setAlarm(Date.now() + 5000);
    }
  }
  async stopViewer(socket: WebSocket) {
    const a = data(socket),
      subscription = a.video;
    put(socket, { video: undefined, videoEpoch: (a.videoEpoch || 0) + 1 });
    try {
      send(socket, { type: "runner_video", action: "fallback" });
    } catch {
      /* Socket closed. */
    }
    this.control(a, true);
    await this.close(subscription?.resource);
    if (
      subscription &&
      !this.viewers(a).some(
        (viewer) =>
          this.fresh(viewer) && data(viewer).video?.id === subscription.id,
      )
    )
      await this.stopPublication(a, subscription.id);
  }
  private async stopPublication(a: VideoAttachment, id: string) {
    const pub = this.publication(a);
    if (!pub || pub.id !== id) return;
    this.savePublication(a);
    const device = this.device(a);
    try {
      if (device)
        send(device, {
          type: "runner_video",
          action: "stop",
          session_id: a.sessionId,
          stream_id: id,
        });
    } catch {
      /* Device offline. */
    }
    await Promise.all(
      this.viewers(a)
        .filter((viewer) => data(viewer).video?.id === id)
        .map((viewer) => this.stopViewer(viewer)),
    );
    await this.close(pub.resource);
  }
  async heartbeat(socket: WebSocket) {
    const a = data(socket);
    if (a.video && !(await this.authorized(a))) {
      const readable = await this.readable(a);
      if (!readable) put(socket, { heartbeatAt: 0 });
      await this.stopViewer(socket);
      if (!readable) socket.close(1008, "Runner access ended");
    }
    await this.schedule();
  }
  async disconnectDevice(socket: WebSocket) {
    const a = data(socket);
    put(socket, { publications: {} });
    for (const [sessionId, pub] of Object.entries(a.publications || {})) {
      const identity = { ...a, sessionId };
      try {
        send(socket, {
          type: "runner_video",
          action: "stop",
          session_id: sessionId,
          stream_id: pub.id,
        });
      } catch {
        /* Offline. */
      }
      await Promise.all(
        this.viewers(identity)
          .filter((viewer) => data(viewer).video?.id === pub.id)
          .map((viewer) => this.stopViewer(viewer)),
      );
      await this.close(pub.resource);
    }
  }
  async sweep() {
    for (const [, resource] of await this.ctx.storage.list<Resource>({
      prefix: "runner-video-cleanup:",
      limit: 32,
    }))
      await this.close(resource);
    for (const socket of this.ctx.getWebSockets()) {
      const a = data(socket);
      if (a.viewer && a.video && !this.fresh(socket))
        await this.stopViewer(socket);
    }
    await this.schedule();
  }
  private async schedule() {
    const times = this.ctx
      .getWebSockets()
      .filter((socket) => data(socket).viewer && data(socket).video)
      .map((socket) => (data(socket).heartbeatAt || 0) + 30000);
    const cleanup = await this.ctx.storage.list({
      prefix: "runner-video-cleanup:",
      limit: 1,
    });
    if (cleanup.size) times.push(Date.now() + 5000);
    if (times.length) {
      const next = Math.max(Date.now() + 100, Math.min(...times));
      const current = await this.ctx.storage.getAlarm();
      await this.ctx.storage.setAlarm(
        current && current > Date.now() ? Math.min(current, next) : next,
      );
    }
  }
}
