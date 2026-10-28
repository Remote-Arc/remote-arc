import {
  studioDuration,
  studioReferencedAssets,
  studioSceneAt,
  type StudioAsset,
  type StudioDocument,
} from "@rearc/studio/core";
import { studioApi } from "./api.js";
import type { StudioVisuals } from "./frame.js";
import type { Input, CanvasSink } from "mediabunny";

type VideoMedia = { input: Input; sink: CanvasSink; duration: number };
/** Loads only project-owned URLs; no arbitrary remote URLs or render-time fetches. */
export class StudioMedia {
  private images = new Map<string, ImageBitmap>();
  private videos = new Map<string, VideoMedia>();
  private pending = new Map<string, Promise<void>>();
  private disposed = false;
  constructor(
    private projectId: string,
    private assets: StudioAsset[],
  ) {}
  private load(id: string): Promise<void> {
    const existing = this.pending.get(id);
    if (existing) return existing;
    const task = (async () => {
      const asset = this.assets.find((item) => item.id === id);
      if (!asset) throw Error("找不到项目素材，请重新上传。");
      const response = await fetch(studioApi.assetUrl(this.projectId, id));
      if (!response.ok) throw Error("素材加载失败，请检查登录状态。");
      const blob = await response.blob();
      if (asset.type.startsWith("image/")) {
        const image = await createImageBitmap(blob);
        if (this.disposed) {
          image.close();
          return;
        }
        this.images.set(id, image);
      } else if (asset.type.startsWith("video/")) {
        const { Input, BlobSource, ALL_FORMATS, CanvasSink } = await import(
          "mediabunny"
        );
        const input = new Input({
          source: new BlobSource(blob),
          formats: ALL_FORMATS,
        });
        const track = await input.getPrimaryVideoTrack();
        if (!track || !(await track.canDecode())) {
          input.dispose();
          throw Error("此视频编码无法在当前浏览器解码，请转换成 H.264 MP4。");
        }
        const duration = await input.computeDuration();
        if (!Number.isFinite(duration) || duration <= 0) {
          input.dispose();
          throw Error("视频没有有效时长。");
        }
        if (this.disposed) {
          input.dispose();
          return;
        }
        const sourceW = await track.getDisplayWidth(),
          sourceH = await track.getDisplayHeight();
        const decodeScale = Math.min(1, 1920 / Math.max(sourceW, sourceH));
        this.videos.set(id, {
          input,
          sink: new CanvasSink(track, {
            width: Math.max(2, Math.round(sourceW * decodeScale)),
            height: Math.max(2, Math.round(sourceH * decodeScale)),
            fit: "contain",
            poolSize: 2,
          }),
          duration,
        });
      }
    })();
    this.pending.set(id, task);
    void task.catch(() => this.pending.delete(id));
    return task;
  }
  async preload(document: StudioDocument) {
    await Promise.all(
      studioReferencedAssets(document)
        .filter(
          (id) =>
            this.assets
              .find((asset) => asset.id === id)
              ?.type.startsWith("image/") ||
            this.assets
              .find((asset) => asset.id === id)
              ?.type.startsWith("video/"),
        )
        .map((id) => this.load(id)),
    );
  }
  async visualsAt(
    document: StudioDocument,
    frame: number,
  ): Promise<StudioVisuals> {
    const { scene, frame: local } = studioSceneAt(document, frame),
      result: StudioVisuals = new Map(this.images);
    if (scene.mediaAssetId) {
      await this.load(scene.mediaAssetId);
      const image = this.images.get(scene.mediaAssetId);
      if (image) result.set(scene.mediaAssetId, image);
      const video = this.videos.get(scene.mediaAssetId);
      if (video) {
        const decoded = await video.sink.getCanvas(
          Math.min(
            local / document.fps,
            Math.max(0, video.duration - 1 / document.fps),
          ),
        );
        if (decoded) result.set(scene.mediaAssetId, decoded.canvas);
      }
    }
    return result;
  }
  dispose() {
    this.disposed = true;
    for (const image of this.images.values()) image.close();
    for (const video of this.videos.values()) video.input.dispose();
    this.images.clear();
    this.videos.clear();
  }
}
export async function mixStudioAudio(
  projectId: string,
  document: StudioDocument,
): Promise<AudioBuffer | null> {
  if (!document.voice.assetId && !document.music.assetId) return null;
  const duration = studioDuration(document) / document.fps;
  const offline = new OfflineAudioContext(
    2,
    Math.ceil(duration * 48000),
    48000,
  );
  let voiceDuration = 0;
  const musicGains: GainNode[] = [];
  await Promise.all(
    (
      [
        ["voice", document.voice],
        ["music", document.music],
      ] as const
    ).map(async ([kind, track]) => {
      if (!track.assetId) return;
      const response = await fetch(
        studioApi.assetUrl(projectId, track.assetId),
      );
      if (!response.ok) throw Error("音频加载失败，请检查登录状态。");
      const buffer = await offline.decodeAudioData(
        await response.arrayBuffer(),
      );
      const source = offline.createBufferSource(),
        gain = offline.createGain();
      source.buffer = buffer;
      source.loop = kind === "music";
      gain.gain.value = track.volume;
      if (kind === "voice") voiceDuration = buffer.duration;
      if (kind === "music") {
        musicGains.push(gain);
      }
      source.connect(gain);
      gain.connect(offline.destination);
      source.start(0);
      source.stop(duration);
    }),
  );
  for (const gain of musicGains) {
    const volume = document.music.volume;
    const ducked =
      voiceDuration > 0 && document.voice.volume > 0 ? volume * 0.4 : volume;
    gain.gain.setValueAtTime(0, 0);
    gain.gain.linearRampToValueAtTime(ducked, Math.min(0.25, duration / 4));
    if (voiceDuration > 0 && voiceDuration < duration - 1) {
      gain.gain.setValueAtTime(ducked, voiceDuration);
      gain.gain.linearRampToValueAtTime(
        volume,
        Math.min(duration - 0.5, voiceDuration + 0.4),
      );
    }
    gain.gain.setValueAtTime(
      voiceDuration >= duration - 0.5 ? ducked : volume,
      Math.max(0.25, duration - 0.5),
    );
    gain.gain.linearRampToValueAtTime(0, duration);
  }
  const mixed = await offline.startRendering();
  // Preserve the mix while leaving headroom for AAC encoding when sources sum above full scale.
  let peak = 0;
  for (let channel = 0; channel < mixed.numberOfChannels; channel++) {
    const samples = mixed.getChannelData(channel);
    for (let i = 0; i < samples.length; i++)
      peak = Math.max(peak, Math.abs(samples[i]!));
  }
  if (peak > 0.98) {
    const gain = 0.98 / peak;
    for (let channel = 0; channel < mixed.numberOfChannels; channel++) {
      const samples = mixed.getChannelData(channel);
      for (let i = 0; i < samples.length; i++) samples[i] = samples[i]! * gain;
    }
  }
  return mixed;
}
