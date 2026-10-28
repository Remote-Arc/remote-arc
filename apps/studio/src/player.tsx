import { useEffect, useRef, useState } from "react";
import {
  studioDimensions,
  studioDuration,
  type StudioAsset,
  type StudioDocument,
} from "@rearc/studio/core";
import { paintStudioFrame } from "./frame.js";
import { StudioMedia, mixStudioAudio } from "./media.js";
import { useStudioLocale } from "./locale.js";
import { prepareStudioFonts } from "./layout.js";

export function StudioPlayer({
  projectId,
  document,
  assets,
  seekFrame,
  seekVersion = 0,
  onError,
}: {
  projectId: string;
  document: StudioDocument;
  assets: StudioAsset[];
  seekFrame: number;
  seekVersion?: number;
  onError: (message: string) => void;
}) {
  const { t } = useStudioLocale();
  const canvas = useRef<HTMLCanvasElement>(null),
    [frame, setFrame] = useState(seekFrame),
    [playing, setPlaying] = useState(false),
    [loading, setLoading] = useState(false);
  const currentFrame = useRef(frame),
    playback = useRef<{
      raf: number;
      audio?: AudioContext;
      source?: AudioBufferSourceNode;
    } | null>(null),
    mediaRef = useRef<StudioMedia | null>(null),
    renderId = useRef(0);
  const total = studioDuration(document),
    dimensions = studioDimensions(document.format, 720),
    errorRef = useRef(onError);
  errorRef.current = onError;
  function stop() {
    const state = playback.current;
    playback.current = null;
    if (state) {
      cancelAnimationFrame(state.raf);
      try {
        state.source?.stop();
      } catch {}
      void state.audio?.close();
    }
    setPlaying(false);
  }
  useEffect(() => {
    const media = new StudioMedia(projectId, assets);
    mediaRef.current = media;
    return () => {
      const state = playback.current;
      playback.current = null;
      if (state) {
        cancelAnimationFrame(state.raf);
        try {
          state.source?.stop();
        } catch {}
        void state.audio?.close();
      }
      media.dispose();
      mediaRef.current = null;
    };
  }, [projectId, assets]);
  useEffect(() => {
    stop();
    currentFrame.current = Math.min(seekFrame, total - 1);
    setFrame(currentFrame.current);
  }, [seekFrame, seekVersion, document]);
  useEffect(() => {
    const serial = ++renderId.current,
      media = mediaRef.current,
      target = canvas.current;
    if (!media || !target) return;
    void Promise.all([media.visualsAt(document, frame), prepareStudioFonts()])
      .then(([visuals]) => {
        if (serial === renderId.current)
          paintStudioFrame(target, document, frame, visuals);
      })
      .catch((error) => {
        if (serial === renderId.current)
          errorRef.current(
            error instanceof Error ? error.message : "素材加载失败。",
          );
      });
  }, [document, frame, assets, projectId]);
  async function play() {
    if (playing) {
      stop();
      return;
    }
    if (loading) return;
    const media = mediaRef.current;
    if (!media) return;
    setLoading(true);
    try {
      const [, audioBuffer] = await Promise.all([
        media.preload(document),
        mixStudioAudio(projectId, document),
      ]);
      let start = currentFrame.current >= total - 1 ? 0 : currentFrame.current;
      currentFrame.current = start;
      const audio = audioBuffer ? new AudioContext() : undefined,
        source = audio?.createBufferSource();
      if (audio && source && audioBuffer) {
        source.buffer = audioBuffer;
        source.connect(audio.destination);
        await audio.resume();
        source.start(0, start / document.fps);
      }
      const state = { raf: 0, audio, source };
      playback.current = state;
      const began = performance.now();
      setPlaying(true);
      const tick = () => {
        if (playback.current !== state) return;
        const next =
          start +
          Math.floor(((performance.now() - began) / 1000) * document.fps);
        if (next >= total) {
          currentFrame.current = total - 1;
          setFrame(total - 1);
          stop();
          return;
        }
        currentFrame.current = next;
        setFrame(next);
        state.raf = requestAnimationFrame(tick);
      };
      state.raf = requestAnimationFrame(tick);
    } catch (error) {
      errorRef.current(error instanceof Error ? error.message : "预览失败。");
    } finally {
      setLoading(false);
    }
  }
  function seek(value: number) {
    stop();
    currentFrame.current = value;
    setFrame(value);
  }
  return (
    <div className="st-player">
      <div className="st-stage">
        <canvas
          ref={canvas}
          width={dimensions.width}
          height={dimensions.height}
          aria-label={t("视频预览")}
          style={{ aspectRatio: `${dimensions.width}/${dimensions.height}` }}
        />
      </div>
      <div className="st-player-controls">
        <button
          type="button"
          className="st-play"
          onClick={() => void play()}
          disabled={loading}
          aria-label={t(playing ? "暂停" : "播放")}
        >
          {loading ? "…" : playing ? "Ⅱ" : "▶"}
        </button>
        <span className="st-time">
          {(frame / document.fps).toFixed(1)}{" "}
          <span>/ {(total / document.fps).toFixed(1)}s</span>
        </span>
        <input
          aria-label={t("预览进度")}
          type="range"
          min={0}
          max={total - 1}
          value={Math.min(frame, total - 1)}
          onChange={(event) => seek(Number(event.target.value))}
        />
        <span className="st-fps">30 FPS</span>
      </div>
    </div>
  );
}
