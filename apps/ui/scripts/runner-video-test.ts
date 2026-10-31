import assert from "node:assert/strict";
import { RunnerVideoPlayer } from "../src/features/browser-runner/runner-video.js";
const offer =
  "v=0\r\nm=video 9 UDP/TLS/RTP/SAVPF 106\r\na=sendonly\r\na=rtpmap:106 H264/90000\r\n";
class Peer extends EventTarget {
  static peers: Peer[] = [];
  iceGatheringState = "complete";
  connectionState = "new";
  ontrack?: (event: any) => void;
  onconnectionstatechange?: () => void;
  localDescription?: any;
  remoteDescription?: any;
  closed = false;
  constructor() {
    super();
    Peer.peers.push(this);
  }
  async setRemoteDescription(value: any) {
    this.remoteDescription = value;
  }
  async createAnswer() {
    return { type: "answer", sdp: offer.replace("sendonly", "recvonly") };
  }
  async setLocalDescription(value: any) {
    this.localDescription = value;
  }
  async getStats() {
    return new Map();
  }
  close() {
    this.closed = true;
  }
}
(globalThis as any).RTCPeerConnection = Peer;
(globalThis as any).WebSocket = { OPEN: 1 };
(globalThis as any).MediaStream = class {
  constructor(private tracks: any[]) {}
  getTracks() {
    return this.tracks;
  }
};
function harness() {
  let live = 0,
    fallback = 0,
    stopped = 0;
  const sent: any[] = [];
  const socket: any = {
    readyState: 1,
    send: (value: string) => sent.push(JSON.parse(value)),
  };
  const element: any = {
    srcObject: null,
    onloadeddata: null,
    play: async () => {},
    pause: () => {},
  };
  const player = new RunnerVideoPlayer(
    socket,
    element,
    () => live++,
    () => fallback++,
  );
  const frame = () => {
    Peer.peers.at(-1)!.ontrack!({
      track: { kind: "video", stop: () => stopped++ },
    });
    element.onloadeddata();
  };
  return {
    player,
    sent,
    element,
    frame,
    state: () => ({ live, fallback, stopped }),
  };
}
{
  const h = harness();
  h.player.start();
  assert.equal(h.sent[0].type, "video_start");
  await h.player.signal({ action: "offer", stream_id: "stream", sdp: offer });
  assert.equal(h.sent.at(-1).type, "video_answer");
  h.frame();
  assert.equal(
    h.state().live,
    0,
    "playback was announced before backend negotiation completed",
  );
  await h.player.signal({ action: "connected", stream_id: "old" });
  assert.equal(h.state().live, 0);
  await h.player.signal({ action: "connected", stream_id: "stream" });
  assert(h.player.playing);
  assert.equal(h.state().live, 1);
  assert.equal(h.sent.at(-1).type, "video_playing");
  await h.player.signal({ action: "fallback" });
  assert.equal(h.state().fallback, 1);
  assert.equal(h.state().stopped, 1);
  assert.equal(h.element.srcObject, null);
  assert(Peer.peers.at(-1)!.closed);
  await h.player.signal({ action: "connected", stream_id: "stream" });
  assert.equal(h.state().live, 1, "late signaling resurrected a closed player");
}
{
  const h = harness(),
    before = Peer.peers.length;
  await h.player.signal({
    action: "offer",
    stream_id: "stream",
    sdp: offer + "m=audio 9 RTP/AVP 0\r\n",
  });
  assert.equal(
    Peer.peers.length,
    before,
    "audio or data could enter the player",
  );
  h.player.close();
}
{
  const h = harness();
  await h.player.signal({ action: "offer", stream_id: "stream", sdp: offer });
  const pc = Peer.peers.at(-1)!;
  pc.connectionState = "failed";
  pc.onconnectionstatechange!();
  assert.equal(h.state().fallback, 1);
  assert.equal(h.sent.at(-1).type, "video_stop");
}
console.log(
  "PASS: video receive-only playback, first-frame/negotiation ordering, stale signals, failure fallback and track cleanup",
);
