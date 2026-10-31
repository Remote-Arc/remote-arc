import { createRequire } from "node:module";
import { writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { pathToFileURL, fileURLToPath } from "node:url";
const require = createRequire(
  new URL("../../../package.json", import.meta.url),
);
const { chromium } = require("@playwright/test");
const [origin, executablePath, reportPath] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath, headless: true });
let cloud;
try {
  const page = await browser.newPage();
  await page.goto(origin + "/motion");
  if (process.env.REMOTEARC_VIDEO_SFU === "1") {
    const relayRequire = createRequire(
      new URL("../../relay/package.json", import.meta.url),
    );
    const { tsImport } = await import(
      pathToFileURL(relayRequire.resolve("tsx/esm/api")).href
    );
    const { cloudHarness } = await tsImport(
      "../../relay/scripts/runner-video-cloud-harness.ts",
      import.meta.url,
    );
    cloud = await cloudHarness(origin);
    const esbuild = createRequire(relayRequire.resolve("tsx/package.json"))(
      "esbuild",
    );
    const bundle = await esbuild.build({
      entryPoints: [
        fileURLToPath(new URL("../../ui/src/features/browser-runner/runner-video.ts", import.meta.url)),
      ],
      bundle: true,
      write: false,
      format: "iife",
      globalName: "RunnerVideoClient",
      platform: "browser",
    });
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    await page.exposeFunction("videoOffer", cloud.offer);
    await page.exposeFunction("videoAnswer", cloud.answer);
    await page.exposeFunction("videoPlaying", cloud.playing);
    await page.exposeFunction("videoHeartbeat", cloud.heartbeat);
  }
  const result = await page.evaluate(async () => {
    document.body.innerHTML =
      '<video muted autoplay playsinline style="width:100%"></video>';
    const video = document.querySelector("video");
    let pc, player;
    const heartbeat = setInterval(() => {
      void fetch("/heartbeat", { method: "POST" });
      void window.videoHeartbeat?.();
    }, 2000);
    const start = performance.now();
    try {
      if (window.videoOffer) {
        await new Promise((resolve, reject) => {
          let streamId;
          const socket = {
            readyState: WebSocket.OPEN,
            send: (raw) => {
              const value = JSON.parse(raw);
              if (value.type === "video_start")
                void window
                  .videoOffer()
                  .then((offer) => {
                    streamId = offer.stream_id;
                    return player.signal(offer);
                  })
                  .catch(reject);
              if (value.type === "video_answer")
                void window
                  .videoAnswer(value.sdp)
                  .then(() =>
                    player.signal({ action: "connected", stream_id: streamId }),
                  )
                  .catch(reject);
              if (value.type === "video_playing")
                void window.videoPlaying().catch(reject);
            },
          };
          player = new RunnerVideoClient.RunnerVideoPlayer(
            socket,
            video,
            resolve,
            () => reject(new Error("Production player fell back to JPEG")),
          );
          player.start();
        });
        pc = player.pc;
      } else {
        pc = new RTCPeerConnection();
        pc.ontrack = (event) => {
          video.srcObject = new MediaStream([event.track]);
          void video.play();
        };
        const offer = await (await fetch("/offer")).json();
        await pc.setRemoteDescription({ type: "offer", sdp: offer.sdp });
        await pc.setLocalDescription(await pc.createAnswer());
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(
            () => reject(new Error("ICE gathering timeout")),
            5000,
          );
          const check = () => {
            if (pc.iceGatheringState === "complete") {
              clearTimeout(timeout);
              resolve();
            }
          };
          pc.onicegatheringstatechange = check;
          check();
        });
        await fetch("/answer", {
          method: "POST",
          body: JSON.stringify({ sdp: pc.localDescription.sdp }),
        });
      }
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error("No decoded video frame")),
          20000,
        );
        const check = () => {
          if (video.videoWidth && video.readyState >= 2) {
            clearTimeout(timeout);
            resolve();
          } else setTimeout(check, 50);
        };
        check();
      });
      const firstFrameMs = performance.now() - start;
      await window.videoPlaying?.();
      // The source encodes its wall clock into large black/white blocks. Read
      // those after real browser decoding: duplicated/stale pictures cannot
      // masquerade as a high frame rate, and latency includes capture + encode.
      const viewport = await (await fetch("/viewport")).json();
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      const sourceFrames = new Set(),
        latencies = [];
      let frameCallback;
      const inspect = () => {
        context.drawImage(video, 0, 0);
        let stamp = 0;
        for (let i = 0; i < 16; i++) {
          const x = Math.round(((44 + i * 32) * canvas.width) / viewport.width);
          const y = Math.round(
            ((viewport.height - 52) * canvas.height) / viewport.height,
          );
          if (context.getImageData(x, y, 1, 1).data[0] > 128) stamp |= 1 << i;
        }
        sourceFrames.add(stamp);
        const latency = ((Date.now() & 65535) - stamp + 65536) % 65536;
        if (latency < 10000) latencies.push(latency);
        frameCallback = video.requestVideoFrameCallback(inspect);
      };
      frameCallback = video.requestVideoFrameCallback(inspect);
      const before = video.getVideoPlaybackQuality().totalVideoFrames;
      const sampleStart = performance.now();
      await new Promise((resolve) => setTimeout(resolve, 10000));
      const duration = (performance.now() - sampleStart) / 1000;
      const frames = video.getVideoPlaybackQuality().totalVideoFrames - before;
      video.cancelVideoFrameCallback(frameCallback);
      latencies.sort((a, b) => a - b);
      const percentile = (p) =>
        latencies[
          Math.min(latencies.length - 1, Math.floor(latencies.length * p))
        ];
      let inbound, codec;
      const stats = await pc.getStats();
      stats.forEach((report) => {
        if (report.type === "inbound-rtp" && report.kind === "video") {
          inbound = report;
          codec = stats.get(report.codecId);
        }
      });
      return {
        codec: codec?.mimeType,
        width: video.videoWidth,
        height: video.videoHeight,
        firstFrameMs: Math.round(firstFrameMs),
        decodedFrames: frames,
        fps: +(frames / duration).toFixed(2),
        uniqueSourceFPS: +(sourceFrames.size / duration).toFixed(2),
        latencyP50Ms: percentile(0.5),
        latencyP95Ms: percentile(0.95),
        bytesReceived: inbound?.bytesReceived,
        jitterMs: Math.round((inbound?.jitter || 0) * 1000),
        sampleSeconds: +duration.toFixed(2),
        transport: "local WebRTC (SFU excluded)",
      };
    } finally {
      clearInterval(heartbeat);
      if (player) player.close();
      else pc?.close();
    }
  });
  result.windowState = process.env.REMOTEARC_VIDEO_WINDOW_STATE;
  if (cloud)
    result.transport =
      "WebRTC via Cloudflare Realtime SFU (production signaling broker)";
  assert.equal(result.codec, "video/H264");
  assert(result.width > 0 && result.width <= 1280 && result.height <= 720);
  assert(
    result.fps >= 10,
    `Decoded frame rate below target: ${JSON.stringify(result)}`,
  );
  assert(
    result.uniqueSourceFPS >= 10,
    `Source capture froze or repeated too many frames: ${JSON.stringify(result)}`,
  );
  assert(result.bytesReceived > 0);
  if (reportPath)
    await writeFile(reportPath, JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify(result));
} finally {
  try {
    await cloud?.close();
  } finally {
    await browser.close();
  }
}
