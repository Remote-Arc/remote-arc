import {
  studioReferencedAssets,
  type StudioAsset,
  type StudioDocument,
} from "@remotearc/protocol/studio";
import {
  layoutStudioScene,
  studioFonts,
  wrapStudioText,
  prepareStudioFonts,
} from "./layout.js";
import { studioContrast, studioSceneColors } from "./colors.js";
import { studioCaptionCues } from "./captions.js";

export type StudioQualityIssue = {
  severity: "error" | "warning";
  code: string;
  sceneId?: string;
  sceneIndex?: number;
  message: string;
};
export function inspectStudioVideo(
  doc: StudioDocument,
  assets: StudioAsset[],
): StudioQualityIssue[] {
  const canvas = document.createElement("canvas"),
    ctx = canvas.getContext("2d");
  if (!ctx) throw Error("STUDIO_CANVAS_UNAVAILABLE");
  const issues: StudioQualityIssue[] = [];
  for (const id of studioReferencedAssets(doc)) {
    if (!assets.some((asset) => asset.id === id))
      issues.push({
        severity: "error",
        code: "missing-asset",
        message: "找不到引用的素材，请重新上传或移除引用。",
      });
  }
  for (const [sceneIndex, scene] of doc.scenes.entries()) {
    const add = (
      severity: StudioQualityIssue["severity"],
      code: string,
      message: string,
    ) =>
      issues.push({ severity, code, message, sceneId: scene.id, sceneIndex });
    const layout = layoutStudioScene(ctx, doc, scene);
    if (layout.overflow)
      add(
        "error",
        "text-overflow",
        "文字超出了画面安全区。请精简文案、减少要点，或拆成多个分镜。",
      );
    ctx.font = `500 13px ${studioFonts.mono}`;
    if (ctx.measureText(scene.kicker).width > layout.w - layout.pad * 2 - 37)
      add("error", "kicker-overflow", "眉题过长，请缩短文字。");
    if (!scene.title.trim() && !scene.mediaAssetId)
      add("warning", "empty-title", "这个分镜没有主标题。");
    const visual = assets.find((asset) => asset.id === scene.mediaAssetId);
    if (visual && !/^(image|video)\//.test(visual.type))
      add("error", "wrong-visual", "画面引用了音频素材，请选择图片或视频。");
    const { bg, fg } = studioSceneColors(doc, scene),
      contrast = studioContrast(bg, fg);
    if (contrast < 3)
      add("error", "contrast", "标题与背景的对比度不足，请调整主题颜色。");
    const seconds = scene.durationFrames / doc.fps;
    const copy = [scene.title, scene.body, ...scene.points].join(" ");
    const cjk = copy.match(/[\u3400-\u9fff]/gu)?.length || 0;
    const words =
      copy.replace(/[\u3400-\u9fff]/gu, " ").match(/[\p{L}\p{N}]+/gu)?.length ||
      0;
    if (seconds < 2 || cjk / 7 + words / 4 > seconds)
      add(
        "warning",
        "reading-pace",
        "画面停留时间偏短，观众可能来不及读完。请增加时长或精简文字。",
      );
    if (scene.narration.trim()) {
      const cues = studioCaptionCues(scene);
      if (cues.some((cue) => (cue.end - cue.start) / doc.fps < 0.7))
        add(
          "warning",
          "caption-pace",
          "部分字幕停留不足 0.7 秒。请增加时长或合并短句。",
        );
      if (doc.subtitles) {
        ctx.font = `500 21px ${studioFonts.sans}`;
        if (
          cues.some(
            (cue) =>
              wrapStudioText(ctx, cue.text, layout.w - layout.pad * 2 - 40)
                .length > 2,
          )
        )
          add("error", "caption-overflow", "字幕超过两行，请缩短单句旁白。");
      }
    }
  }
  for (const track of [doc.voice, doc.music]) {
    const asset = assets.find((item) => item.id === track.assetId);
    if (asset && !asset.type.startsWith("audio/"))
      issues.push({
        severity: "error",
        code: "wrong-audio",
        message: "音轨引用了非音频素材，请重新选择。",
      });
  }
  if (
    doc.scenes.some((scene) => scene.narration.trim()) &&
    (!doc.voice.assetId || doc.voice.volume === 0)
  )
    issues.push({
      severity: "warning",
      code: "no-voice",
      message: "旁白文字不会自动发声。需要配音时，请上传并选择录音。",
    });
  if (
    (!doc.voice.assetId || doc.voice.volume === 0) &&
    (!doc.music.assetId || doc.music.volume === 0)
  )
    issues.push({
      severity: "warning",
      code: "silent",
      message: "当前没有可听音轨，将导出无声视频。",
    });
  return issues;
}
export async function assertStudioPublishable(
  doc: StudioDocument,
  assets: StudioAsset[],
) {
  await prepareStudioFonts();
  if (
    inspectStudioVideo(doc, assets).some((issue) => issue.severity === "error")
  )
    throw Error("请先修复导出检查中标记的问题。");
}
