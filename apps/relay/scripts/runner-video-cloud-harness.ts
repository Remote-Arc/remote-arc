import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { RunnerVideoRelay } from "../src/runner-video.js";

// Real SFU acceptance uses the production broker with synthetic socket identity
// and a synthetic page. Provider credentials remain in this Node backend.
export async function cloudHarness(origin: string) {
  const vars = await readFile(new URL("../.dev.vars", import.meta.url), "utf8");
  const env: any = Object.fromEntries(
    [...vars.matchAll(/^([A-Z_]+)="([^"\r\n]*)"/gm)].map((match) => [
      match[1],
      match[2],
    ]),
  );
  assert(
    env.RUNNER_VIDEO_APP_ID && env.RUNNER_VIDEO_APP_SECRET,
    "SFU test configuration is missing",
  );
  env.DB = {
    prepare: () => ({
      bind: () => ({
        first: async () => ({ allowed_tools: '["browser_runner_snapshot"]' }),
      }),
    }),
  };
  class Socket {
    constructor(
      public data: any,
      private receive: (value: any) => void,
    ) {}
    deserializeAttachment() {
      return structuredClone(this.data);
    }
    serializeAttachment(value: any) {
      this.data = structuredClone(value);
    }
    send(raw: string) {
      this.receive(JSON.parse(raw));
    }
  }
  let offered!: (value: any) => void, fail!: (reason: Error) => void;
  const offerPromise = new Promise<any>((resolve, reject) => {
    offered = resolve;
    fail = reject;
  });
  let failure: Error | undefined,
    streamId = "",
    started = false;
  const background: Promise<unknown>[] = [];
  const viewer = new Socket(
    {
      viewer: true,
      userId: "synthetic-owner",
      deviceId: "synthetic-device",
      sessionId: "video-benchmark",
      heartbeatAt: Date.now(),
    },
    (value) => {
      if (value.action === "offer") {
        streamId = value.stream_id;
        offered(value);
      }
      if (value.action === "fallback") {
        failure = new Error("Real SFU signaling fell back before acceptance");
        fail(failure);
      }
    },
  );
  const agent = new Socket(
    {
      userId: "synthetic-owner",
      deviceId: "synthetic-device",
      tools: ["browser_runner_snapshot"],
      capabilities: ["runner_video_v1"],
    },
    (value) => {
      const task = (async () => {
        await fetch(origin + "/control", {
          method: "POST",
          body: JSON.stringify(value),
        });
        if (value.action === "start") {
          const offer = await (await fetch(origin + "/offer")).json();
          await relay.agent(agent as any, offer);
        } else if (value.action === "answer") {
          const ready = await (await fetch(origin + "/ready")).json();
          await relay.agent(agent as any, ready);
        }
      })().catch((error) => {
        console.error(
          JSON.stringify({
            stage: "publisher_setup",
            action: value.action,
            error: error instanceof Error ? error.message : "unknown",
          }),
        );
        failure = new Error("Real SFU publisher setup failed");
        fail(failure);
      });
      background.push(task);
    },
  );
  const cleanup = new Map<string, any>();
  const context: any = {
    getWebSockets: (tag?: string) =>
      tag?.startsWith("runner-view:") ? [viewer] : [agent, viewer],
    storage: {
      setAlarm: async () => {},
      getAlarm: async () => null,
      put: async (key: string, value: any) => {
        cleanup.set(key, value);
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
  const fetcher: typeof fetch = async (url, init) => {
    let response: Response;
    try {
      response = await fetch(url, init);
    } catch (error) {
      console.error(
        JSON.stringify({
          stage: String(url).endsWith("tracks/close")
            ? "sfu_close_transport"
            : "sfu_setup_transport",
          error: error instanceof Error ? error.name : "unknown",
        }),
      );
      throw error;
    }
    if (String(url).endsWith("tracks/close")) {
      const value = (await response
        .clone()
        .json()
        .catch(() => null)) as any;
      console.error(
        JSON.stringify({
          stage: "sfu_close",
          status: response.status,
          errorCode: value?.errorCode,
          tracks: value?.tracks?.map((track: any) => ({
            mid: track.mid,
            errorCode: track.errorCode,
          })),
        }),
      );
    }
    return response;
  };
  const relay = new RunnerVideoRelay(
    context,
    env,
    () => agent as any,
    () => {},
    fetcher,
  );
  return {
    offer: async () => {
      if (!started) {
        started = true;
        await relay.viewer(viewer as any, { type: "video_start" });
      }
      return offerPromise;
    },
    answer: async (sdp: string) => {
      await relay.viewer(viewer as any, {
        type: "video_answer",
        stream_id: streamId,
        sdp,
      });
      if (failure) throw failure;
    },
    playing: async () =>
      relay.viewer(viewer as any, {
        type: "video_playing",
        stream_id: streamId,
      }),
    heartbeat: async () => {
      viewer.data.heartbeatAt = Date.now();
      await relay.heartbeat(viewer as any);
    },
    close: async () => {
      viewer.data.heartbeatAt = 0;
      await relay.stopViewer(viewer as any);
      await Promise.all(background);
      if (cleanup.size) await relay.sweep();
      assert.equal(
        cleanup.size,
        0,
        "Cloud SFU cleanup has unresolved track IDs",
      );
    },
  };
}
