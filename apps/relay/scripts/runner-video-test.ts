import assert from "node:assert/strict";
import { RunnerVideoRelay, videoSDP } from "../src/browser/runner-video.js";

const sdp = (direction: string) =>
  `v=0\r\nm=video 9 UDP/TLS/RTP/SAVPF 106\r\na=mid:0\r\na=${direction}\r\na=rtpmap:106 H264/90000\r\n`;
class Socket {
  closed = false;
  sent: any[] = [];
  constructor(public data: any) {}
  deserializeAttachment() {
    return structuredClone(this.data);
  }
  serializeAttachment(value: any) {
    this.data = structuredClone(value);
  }
  send(value: string) {
    this.sent.push(JSON.parse(value));
  }
  close() {
    this.closed = true;
  }
}
function harness() {
  const agent = new Socket({
    userId: "owner",
    deviceId: "device",
    tools: ["browser_runner_snapshot"],
    capabilities: ["runner_video_v1"],
  });
  const view = () =>
    new Socket({
      viewer: true,
      userId: "owner",
      deviceId: "device",
      sessionId: "task",
      heartbeatAt: Date.now(),
    });
  const viewer = view(),
    viewers = [viewer];
  const cleanup = new Map<string, any>();
  let alarm: number | null = null,
    sequence = 0,
    allowed = true,
    failClose = false;
  let publishBarrier: Promise<void> | undefined;
  const calls: { path: string; body: any; secret: string }[] = [];
  const env: any = {
    RUNNER_VIDEO_ENABLED: "1",
    RUNNER_VIDEO_APP_ID: "app",
    RUNNER_VIDEO_APP_SECRET: "backend-secret",
    DB: {
      prepare: () => ({
        bind: (device: string, user: string) => ({
          first: async () =>
            user === "owner" && device === "device"
              ? {
                  allowed_tools: JSON.stringify(
                    allowed ? ["browser_runner_snapshot"] : [],
                  ),
                }
              : null,
        }),
      }),
    },
  };
  const ctx: any = {
    getWebSockets: (tag?: string) =>
      tag
        ? viewers.filter(
            (socket) =>
              tag ===
              `runner-view:${socket.data.userId}:${socket.data.deviceId}:${socket.data.sessionId}`,
          )
        : [agent, ...viewers],
    storage: {
      setAlarm: async (value: number) => {
        alarm = value;
      },
      getAlarm: async () => alarm,
      put: async (key: string, value: any) => {
        cleanup.set(key, structuredClone(value));
      },
      delete: async (key: string) => cleanup.delete(key),
      list: async ({ prefix, limit }: any) =>
        new Map(
          [...cleanup]
            .filter(([key]) => key.startsWith(prefix))
            .slice(0, limit),
        ),
    },
  };
  const controls: boolean[] = [];
  const fetcher = async (url: string, init: RequestInit) => {
    const path = new URL(url).pathname,
      body = init.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ path, body, secret: (init.headers as any).authorization });
    if (path.endsWith("sessions/new"))
      return Response.json({ sessionId: "provider-" + ++sequence });
    if (path.endsWith("tracks/new")) {
      const local = body.tracks[0].location === "local";
      if (local && publishBarrier) await publishBarrier;
      return Response.json({
        tracks: [{ mid: "0" }],
        requiresImmediateRenegotiation: !local,
        sessionDescription: {
          type: local ? "answer" : "offer",
          sdp: sdp(local ? "recvonly" : "sendonly"),
        },
      });
    }
    if (path.endsWith("tracks/close") && failClose)
      return Response.json(
        { errorCode: "serviceUnavailable" },
        { status: 503 },
      );
    return Response.json({ tracks: [{ mid: "0" }] });
  };
  const relay = () =>
    new RunnerVideoRelay(
      ctx,
      env,
      (a) =>
        a.userId === "owner" && a.deviceId === "device"
          ? (agent as any)
          : undefined,
      (_a, watching) => controls.push(watching),
      fetcher as any,
    );
  return {
    agent,
    viewer,
    viewers,
    view,
    calls,
    cleanup,
    env,
    controls,
    relay,
    revoke: () => {
      allowed = false;
    },
    failClose: (value: boolean) => {
      failClose = value;
    },
    holdPublish: (promise: Promise<void>) => {
      publishBarrier = promise;
    },
  };
}
async function publish(h: ReturnType<typeof harness>, relay = h.relay()) {
  await relay.viewer(h.viewer as any, { type: "video_start" });
  const start = h.agent.sent.find((value) => value.action === "start");
  assert(start);
  const offer = {
    type: "runner_video",
    action: "offer",
    stream_id: start.stream_id,
    session_id: "task",
    sdp: sdp("sendonly"),
    mid: "0",
  };
  await Promise.all([
    relay.agent(h.agent as any, offer),
    relay.agent(h.agent as any, offer),
  ]);
  assert.equal(
    h.calls.filter((value) => value.body?.tracks?.[0]?.location === "local")
      .length,
    1,
    "duplicate publisher offers allocated twice",
  );
  await relay.agent(h.agent as any, { ...offer, action: "ready" });
  return { relay, id: start.stream_id };
}

assert(videoSDP(sdp("sendonly"), "sendonly"));
assert(!videoSDP(sdp("sendonly") + "m=audio 9 RTP/AVP 0\r\n", "sendonly"));
assert(
  !videoSDP(
    sdp("sendonly") + "m=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\n",
    "sendonly",
  ),
);
assert(!videoSDP("x".repeat(70000), "sendonly"));
{
  const h = harness();
  h.env.RUNNER_VIDEO_ENABLED = "0";
  await h.relay().viewer(h.viewer as any, { type: "video_start" });
  assert.equal(h.calls.length, 0);
  assert.equal(h.agent.sent.length, 0);
}
{
  const h = harness();
  h.viewer.data.userId = "other";
  await h.relay().viewer(h.viewer as any, { type: "video_start" });
  assert.equal(h.calls.length, 0);
  assert.equal(h.agent.sent.length, 0);
}
{
  const h = harness();
  const { id } = await publish(h);
  assert.equal(h.viewer.sent.at(-1).action, "offer");
  assert(!JSON.stringify(h.viewer.sent).includes("provider-"));
  assert(!JSON.stringify(h.viewer.sent).includes("backend-secret"));
  // Reconstructing the broker simulates DO hibernation between SDP exchanges.
  const resumed = h.relay();
  await resumed.viewer(h.viewer as any, {
    type: "video_answer",
    stream_id: "old",
    sdp: sdp("recvonly"),
  });
  assert.equal(
    h.calls.filter((value) => value.path.endsWith("renegotiate")).length,
    0,
  );
  await resumed.viewer(h.viewer as any, {
    type: "video_answer",
    stream_id: id,
    sdp: sdp("recvonly"),
    sessionId: "attacker-session",
  });
  assert(h.calls.at(-1)!.path.includes("provider-2/renegotiate"));
  await resumed.viewer(h.viewer as any, {
    type: "video_playing",
    stream_id: id,
  });
  assert.equal(h.viewer.data.video.phase, "playing");
  const second = h.view();
  h.viewers.push(second);
  await resumed.viewer(second as any, { type: "video_start" });
  assert.equal(
    h.agent.sent.filter((value) => value.action === "start").length,
    1,
    "second viewer started another encoder",
  );
  await resumed.stopViewer(second as any);
  assert(
    h.agent.data.publications.task,
    "one viewer leaving stopped the other",
  );
  h.revoke();
  await resumed.heartbeat(h.viewer as any);
  assert(h.viewer.closed, "revoked reader retained the JPEG viewer socket");
  assert.equal(h.viewer.data.video, undefined);
  assert.equal(h.agent.data.publications.task, undefined);
  assert(h.agent.sent.some((value) => value.action === "stop"));
}
{
  const h = harness(),
    { relay } = await publish(h);
  h.failClose(true);
  h.viewer.data.heartbeatAt = Date.now() - 31000;
  await relay.sweep();
  assert.equal(
    h.agent.data.publications.task,
    undefined,
    "expired lease kept a publication discoverable",
  );
  assert(h.cleanup.size > 0, "failed close lost its cleanup resource IDs");
  h.failClose(false);
  await relay.sweep();
  assert.equal(h.cleanup.size, 0);
}
{
  const h = harness(),
    relay = h.relay();
  await Promise.all([
    relay.viewer(h.viewer as any, { type: "video_start" }),
    relay.viewer(h.viewer as any, { type: "video_stop" }),
  ]);
  assert.equal(
    h.agent.sent.filter((value) => value.action === "start").length,
    0,
    "late authorization restarted a closed viewer",
  );
}
{
  const h = harness(),
    relay = h.relay();
  let release!: () => void;
  h.holdPublish(
    new Promise<void>((resolve) => {
      release = resolve;
    }),
  );
  await relay.viewer(h.viewer as any, { type: "video_start" });
  const id = h.agent.sent[0].stream_id;
  const pending = relay.agent(h.agent as any, {
    action: "offer",
    session_id: "task",
    stream_id: id,
    mid: "0",
    sdp: sdp("sendonly"),
  });
  while (!h.calls.some((value) => value.path.endsWith("tracks/new")))
    await new Promise((resolve) => setTimeout(resolve, 0));
  await relay.stopViewer(h.viewer as any);
  release();
  await pending;
  assert.equal(h.agent.data.publications.task, undefined);
  assert(
    h.calls.filter((value) => value.path.endsWith("tracks/close")).length >= 2,
    "late allocation was not closed after teardown",
  );
  assert(
    !h.agent.sent.some((value) => value.action === "answer"),
    "late SDP answer reached a stopped publisher",
  );
}
console.log(
  "PASS: video owner/session isolation, feature gate, one publisher, SDP validation, hibernation, revoke/expiry, late allocations and cleanup retry",
);
