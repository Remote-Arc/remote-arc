# Experimental Browser Runner video

The live viewer can receive an H.264 video track over WebRTC through Cloudflare
Realtime SFU. The Agent still captures the task viewport using CDP JPEG events,
but decodes and encodes them locally with FFmpeg. The remote transport is a real
inter-frame video codec; media does not travel through the Relay Durable Object.

This is an opt-in PoC. It is disabled in the Agent and Relay by default. Existing
Agents and viewers retain the 2 FPS JPEG path. A player that cannot negotiate,
decode, or keep receiving video returns to JPEG. No audio, DataChannel, input
control, recording, or persistent frame storage is added.

## Setup

Use a dedicated SFU application in the RA Cloudflare account. Configure these
Relay secrets with Wrangler:

- `RUNNER_VIDEO_APP_ID`
- `RUNNER_VIDEO_APP_SECRET`
- `RUNNER_VIDEO_ENABLED=1` only when enabling the experiment

The backend alone uses the App Secret. Viewer sockets are scoped to their
authenticated owner, device, and Runner session. A viewer cannot provide SFU
resource IDs or publish a track. The backend selects the publication and retains
provider IDs for cleanup, including retry after a transient close failure.

On a test device with FFmpeg already installed, start the new Agent with
`REMOTEARC_RUNNER_VIDEO=1`. Optionally set `REMOTEARC_FFMPEG_PATH` to the local
binary. Nothing is downloaded or bundled automatically. The encoder defaults to
`libx264` on Windows/Linux and `h264_videotoolbox` on macOS. An explicit
`REMOTEARC_VIDEO_ENCODER` may select `libx264`, `h264_qsv`, or
`h264_videotoolbox`. Missing or failing encoders return to JPEG. Distribution of
FFmpeg or codecs requires a separate licensing assessment; this PoC distributes
neither binary.

One task has at most one publisher and four viewers. Capture is capped at 15 FPS
and fitted inside 1280×720 while preserving aspect ratio. The encoder targets
1 Mbps with a 1.5 Mbps maximum, no B frames, and an IDR every second. A one-slot
input channel drops older frames rather than accumulating page history. This is
a fixed bounded quality profile; adaptive congestion-driven encoding and TURN
credentials are not implemented. UDP-restricted networks fall back to JPEG.

The last viewer leaving, a stop signal, browser shutdown, Agent/Relay disconnect,
or an expired 30-second viewer lease cancels encoding. A separate lease watcher
works even while a browser action holds the session mutex. The backend withdraws
the publication, closes subscriptions, and retries unresolved provider closures
using only provider resource identifiers in DO storage. Images and SDP are not
stored there.

## Validation on 2026-10-26

Windows, Intel Core i7-10700K, a synthetic animated page, hidden normal Runner
window, software H.264 encoder, and a second headless browser were tested. The
cloud test uses the actual `RunnerVideoRelay` and `RunnerVideoPlayer` modules,
with synthetic owner/device identities and real Cloudflare SFU resources.

| Measurement | Local WebRTC | Cloudflare SFU and production player |
| --- | ---: | ---: |
| Encoded video | H.264 | H.264 |
| Decoded size | 1134×720 | 1134×720 |
| Playback FPS | 15.0 | 15.0 |
| Distinct source updates per second | 13.6 | 13.6 |
| First decoded frame | 1,522 ms | 5,894 ms |
| Capture-to-playback latency, median | 236 ms | 252 ms |
| Capture-to-playback latency, p95 | 268 ms | 289 ms |

Ten-second moving-page samples; these are measured observations, not performance
guarantees. A timestamp encoded into black/white blocks on the source page is
read after browser decoding, so duplicated encoded frames do not inflate the
distinct-source measurement. Source and receiver share a clock on this test
machine. This is not an Internet WAN latency benchmark.

The sampled cloud run recorded the following process working sets and mean CPU
over their observed lifetimes. `100%` CPU means one logical CPU core. Shared
memory may be counted in more than one process's working set.

| Component | Mean CPU | Peak resident working set |
| --- | ---: | ---: |
| Agent test process | 5.6% | 84.8 MB |
| FFmpeg encoder | 8.4% | 35.3 MB |
| Source browser | 134.5% | 587.0 MB |
| Viewer browser | 25.6% | 565.3 MB |
| Node signaling test backend | 2.1% | 142.0 MB |

The synthetic source repaints a full canvas at display rate, so its cost is not
representative of a static form. There is no idle/JPEG baseline yet. No encoder
process remained after teardown. Known SFU resources closed successfully or
returned explicit `410 session_error` after the endpoint had closed. Transient
cleanup failures are covered by the retry test.

## Reproduce

Run protocol and player lifecycle tests:

```sh
pnpm --filter @remotearc/relay test:runner-video
pnpm --filter @remotearc/ui test:runner-video
go -C apps/agent test ./internal/browserrunner -run TestVideo -count=1
```

For a local real-browser H.264 test, set `REMOTEARC_VIDEO_E2E=1` and run:

```sh
go -C apps/agent test ./internal/browserrunner -run TestE2EVideoBrowserDecode -count=1 -v -timeout 120s
```

For the cloud test, also set `REMOTEARC_VIDEO_SFU=1` and put the three Relay
settings into the ignored `apps/relay/.dev.vars` file. Use quoted values, and set
the local test's `RUNNER_VIDEO_ENABLED="1"`. Cloud credentials stay in the Node
test backend, never in the page. Set `REMOTEARC_VIDEO_REPORT` to an absolute
JSON output path to save measurements. The test creates temporary media sessions
and verifies their cleanup; use the dedicated experimental app.

## Remaining promotion gates

- Intel macOS native minimized-window playback and VideoToolbox measurements.
  The available real Mac could not create the test directory because its disk was
  full. Intel macOS cross-compilation succeeded, but that is not runtime proof.
- Static-page/JPEG/idle resource comparisons and low-end-device measurements.
- Cloud first frame still exceeds the proposed two-second target. JPEG remains
  visible during setup. Network loss, restrictive-network fallback, and concurrent
  viewers need live acceptance beyond the deterministic lifecycle tests.
- Production deployment and enabling Agent/Relay feature flags are separate from
  configuring the app. Keep the experiment disabled until these results are reviewed.

Related: issue #366; viewer discovery in PR #365 remains independent.
