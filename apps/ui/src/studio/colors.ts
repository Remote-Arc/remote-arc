import type { StudioDocument, StudioScene } from "@remotearc/protocol/studio";

export function studioLuminance(hex: string) {
  const channels = [1, 3, 5].map((i) => {
    const s = parseInt(hex.slice(i, i + 2), 16) / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
}
export function studioContrast(first: string, second: string) {
  const a = studioLuminance(first),
    b = studioLuminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
export function studioSceneColors(doc: StudioDocument, scene: StudioScene) {
  const bg =
    scene.background === "accent"
      ? doc.theme.accent
      : scene.background === "light"
        ? "#f4f5f7"
        : doc.theme.background;
  const light = studioLuminance(bg) > 0.179;
  const fg =
    scene.background === "dark"
      ? doc.theme.foreground
      : light
        ? "#10141d"
        : "#f5f7fa";
  const candidate = light ? "#3c485c" : "#a1a9b8";
  return {
    bg,
    fg,
    light,
    muted: studioContrast(bg, candidate) >= 4.5 ? candidate : fg,
    accent: scene.background === "accent" ? fg : doc.theme.accent,
  };
}
