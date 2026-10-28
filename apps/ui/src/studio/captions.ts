import type { StudioScene } from "@remotearc/protocol/studio";

/** One timing source for burnt-in subtitles, SRT and publication checks. */
export function studioCaptionCues(scene: StudioScene) {
  const sentences =
    scene.narration.trim().match(/[^。！？.!?，,；;]+[。！？.!?，,；;]?/g) ||
    [];
  const chunks: string[] = [];
  for (const sentence of sentences) {
    const tokens = sentence.match(/[A-Za-z0-9_'’.-]+\s*|[^\s]/gu) || [];
    let current = "",
      weight = 0;
    for (const token of tokens) {
      const next = /[\u3400-\u9fff]/u.test(token) ? 2 : token.length;
      if (weight + next > 58 && current.trim()) {
        chunks.push(current.trim());
        current = "";
        weight = 0;
      }
      current += token;
      weight += next;
    }
    if (current.trim()) chunks.push(current.trim());
  }
  const total = chunks.reduce((sum, text) => sum + Array.from(text).length, 0);
  let used = 0;
  return chunks.map((text) => {
    const start = Math.round((used / total) * scene.durationFrames);
    used += Array.from(text).length;
    return {
      text,
      start,
      end: Math.round((used / total) * scene.durationFrames),
    };
  });
}
export function studioCaptionAt(scene: StudioScene, frame: number) {
  const cues = studioCaptionCues(scene);
  return (
    (cues.find((cue) => frame >= cue.start && frame < cue.end) || cues.at(-1))
      ?.text || ""
  );
}
