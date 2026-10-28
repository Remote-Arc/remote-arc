import {
  parseStudioDocument,
  studioDimensions,
  studioDuration,
  type StudioDocument,
  type StudioAsset,
} from "@remotearc/protocol/studio";
import { paintStudioFrame } from "./frame.js";
import { StudioMedia, mixStudioAudio } from "./media.js";
import { assertStudioPublishable } from "./quality.js";
import { studioCaptionCues } from "./captions.js";

export function downloadStudioFile(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob),
    anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
const filename = (title: string) =>
  title.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_").slice(0, 100) || "studio-video";
export async function exportStudioVideo(
  projectId: string,
  value: StudioDocument,
  assets: StudioAsset[],
  options: {
    height: 720 | 1080;
    signal: AbortSignal;
    onProgress: (progress: number) => void;
  },
): Promise<{ blob: Blob; name: string }> {
  const doc = parseStudioDocument(structuredClone(value));
  const {
    Output,
    Mp4OutputFormat,
    BufferTarget,
    CanvasSource,
    AudioBufferSource,
    Quality,
    canEncodeVideo,
    canEncodeAudio,
  } = await import("mediabunny");
  const size = studioDimensions(doc.format, options.height);
  if (!(await canEncodeVideo("avc", { ...size, frameRate: doc.fps })))
    throw Error("STUDIO_EXPORT_UNSUPPORTED");
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const media = new StudioMedia(projectId, assets),
    total = studioDuration(doc);
  let output: InstanceType<typeof Output> | undefined;
  const abort = () => {
    if (options.signal.aborted) throw Error("STUDIO_EXPORT_CANCELLED");
  };
  try {
    abort();
    await assertStudioPublishable(doc, assets);
    const [, audio] = await Promise.all([
      media.preload(doc),
      mixStudioAudio(projectId, doc),
    ]);
    abort();
    if (
      audio &&
      !(await canEncodeAudio("aac", {
        numberOfChannels: audio.numberOfChannels,
        sampleRate: audio.sampleRate,
      }))
    )
      throw Error(
        "当前浏览器不支持 AAC 音频导出，请使用最新版 Chrome 或 Edge。",
      );
    const target = new BufferTarget();
    output = new Output({
      format: new Mp4OutputFormat({ fastStart: "in-memory" }),
      target,
    });
    const video = new CanvasSource(canvas, {
      codec: "avc",
      quality: new Quality("high"),
      keyFrameInterval: 2,
    });
    output.addVideoTrack(video, { frameRate: doc.fps });
    const sound = audio
      ? new AudioBufferSource({ codec: "aac", quality: new Quality("high") })
      : null;
    if (sound) output.addAudioTrack(sound);
    await output.start();
    // Feeding tracks concurrently preserves the muxer's backpressure contract.
    const audioWork =
      sound && audio
        ? sound.add(audio).finally(() => sound.close())
        : Promise.resolve();
    let audioError: unknown;
    void audioWork.catch((error) => {
      audioError = error;
    });
    for (let frame = 0; frame < total; frame++) {
      abort();
      if (audioError) throw audioError;
      paintStudioFrame(canvas, doc, frame, await media.visualsAt(doc, frame));
      await video.add(frame / doc.fps, 1 / doc.fps);
      if (frame % 10 === 0) {
        options.onProgress((frame / total) * 0.96);
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
    }
    video.close();
    await audioWork;
    abort();
    options.onProgress(0.98);
    await output.finalize();
    abort();
    if (!target.buffer || target.buffer.byteLength < 128)
      throw Error("视频编码未产生有效文件。");
    options.onProgress(1);
    return {
      blob: new Blob([target.buffer], { type: "video/mp4" }),
      name: filename(doc.title) + ".mp4",
    };
  } catch (error) {
    if (output && output.state !== "finalized" && output.state !== "canceled")
      await output.cancel().catch(() => {});
    throw error;
  } finally {
    media.dispose();
    canvas.width = 0;
    canvas.height = 0;
  }
}
export function exportStudioCaptions(doc: StudioDocument): string {
  const timestamp = (frame: number) => {
    const ms = Math.round((frame / doc.fps) * 1000),
      h = Math.floor(ms / 3600000),
      m = Math.floor(ms / 60000) % 60,
      s = Math.floor(ms / 1000) % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms % 1000).padStart(3, "0")}`;
  };
  let cursor = 0,
    index = 1;
  const rows: string[] = [];
  for (const scene of doc.scenes) {
    for (const cue of studioCaptionCues(scene)) {
      rows.push(
        `${index++}\n${timestamp(cursor + cue.start)} --> ${timestamp(cursor + cue.end)}\n${cue.text}\n`,
      );
    }
    cursor += scene.durationFrames;
  }
  return rows.join("\n");
}
