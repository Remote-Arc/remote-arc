// Receiving-only WebRTC. This module never requests camera, microphone, screen,
// a DataChannel, or input control. The existing authenticated socket owns it.
export class RunnerVideoPlayer {
  private pc?: RTCPeerConnection;
  private streamId = "";
  private closed = false;
  private negotiated = false;
  private hasFrame = false;
  private deadline?: ReturnType<typeof setTimeout>;
  private monitor?: ReturnType<typeof setInterval>;
  private chain: Promise<void> = Promise.resolve();
  playing = false;

  constructor(
    private socket: WebSocket,
    private element: HTMLVideoElement,
    private live: () => void,
    private fallback: () => void,
  ) {}
  start() {
    if (typeof RTCPeerConnection === "undefined") return;
    this.send({ type: "video_start" });
    this.deadline = setTimeout(() => this.fail(), 25000);
  }
  signal(value: any) {
    this.chain = this.chain
      .then(async () => {
        if (this.closed) return;
        if (value.action === "fallback") {
          this.fail();
          return;
        }
        if (value.action === "connected" && value.stream_id === this.streamId) {
          this.negotiated = true;
          this.markPlaying();
          return;
        }
        if (
          value.action !== "offer" ||
          this.pc ||
          typeof value.stream_id !== "string" ||
          !/^[A-Za-z0-9_-]{1,100}$/.test(value.stream_id) ||
          typeof value.sdp !== "string" ||
          value.sdp.length > 65536 ||
          value.sdp
            .split(/\r?\n/)
            .filter((line: string) => line.startsWith("m=")).length !== 1 ||
          !value.sdp.includes("m=video ") ||
          !value.sdp.includes("a=sendonly")
        )
          return;
        this.streamId = value.stream_id;
        const pc = new RTCPeerConnection({
          iceServers: [{ urls: "stun:stun.cloudflare.com:3478" }],
        });
        this.pc = pc;
        pc.onconnectionstatechange = () => {
          if (
            ["failed", "disconnected", "closed"].includes(pc.connectionState) &&
            !this.closed
          )
            this.fail();
        };
        pc.ontrack = (event) => {
          if (event.track.kind !== "video") {
            this.fail();
            return;
          }
          this.element.srcObject = new MediaStream([event.track]);
          event.track.onended = () => this.fail();
          this.element.onloadeddata = () => {
            if (this.closed) return;
            this.hasFrame = true;
            this.markPlaying();
          };
          void this.element.play().catch(() => this.fail());
        };
        await pc.setRemoteDescription({ type: "offer", sdp: value.sdp });
        await pc.setLocalDescription(await pc.createAnswer());
        await new Promise<void>((resolve, reject) => {
          if (pc.iceGatheringState === "complete") {
            resolve();
            return;
          }
          const timeout = setTimeout(() => {
            pc.removeEventListener("icegatheringstatechange", check);
            reject(new Error("ice_timeout"));
          }, 5000);
          const check = () => {
            if (pc.iceGatheringState === "complete") {
              clearTimeout(timeout);
              pc.removeEventListener("icegatheringstatechange", check);
              resolve();
            }
          };
          pc.addEventListener("icegatheringstatechange", check);
        });
        if (!this.closed)
          this.send({
            type: "video_answer",
            stream_id: this.streamId,
            sdp: pc.localDescription?.sdp,
          });
      })
      .catch(() => this.fail());
    return this.chain;
  }
  private markPlaying() {
    if (!this.negotiated || !this.hasFrame || this.closed || this.playing)
      return;
    clearTimeout(this.deadline);
    this.playing = true;
    this.send({ type: "video_playing", stream_id: this.streamId });
    this.live();
    let decoded = -1,
      changedAt = Date.now();
    this.monitor = setInterval(() => {
      void this.pc
        ?.getStats()
        .then((stats) => {
          if (this.closed) return;
          stats.forEach((report) => {
            if (report.type === "inbound-rtp" && report.kind === "video") {
              if (report.framesDecoded !== decoded) {
                decoded = report.framesDecoded;
                changedAt = Date.now();
              } else if (Date.now() - changedAt > 6000) this.fail();
            }
          });
        })
        .catch(() => this.fail());
    }, 2000);
  }
  private send(value: unknown) {
    if (!this.closed && this.socket.readyState === WebSocket.OPEN)
      this.socket.send(JSON.stringify(value));
  }
  private fail() {
    if (this.closed) return;
    this.close();
    this.fallback();
  }
  close() {
    if (this.closed) return;
    this.send({ type: "video_stop", stream_id: this.streamId });
    this.closed = true;
    this.playing = false;
    clearTimeout(this.deadline);
    clearInterval(this.monitor);
    this.pc?.close();
    const stream = this.element.srcObject as MediaStream | null;
    stream?.getTracks().forEach((track) => track.stop());
    this.element.onloadeddata = null;
    this.element.pause();
    this.element.srcObject = null;
  }
}
