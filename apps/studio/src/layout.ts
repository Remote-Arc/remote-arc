import {
  studioDimensions,
  type StudioDocument,
  type StudioScene,
} from "@rearc/studio/core";

export const studioFonts = {
  sans: '"Inter", "PingFang SC", "Microsoft YaHei", sans-serif',
  serif: 'Georgia, "Noto Serif SC", "Songti SC", serif',
  mono: '"Cascadia Code", "SFMono-Regular", Consolas, "Microsoft YaHei", monospace',
};
export type StudioBox = { x: number; y: number; w: number; h: number };
export type StudioText = StudioBox & {
  role: "title" | "body" | "point";
  lines: string[];
  size: number;
  weight: number;
  leading: number;
  overflow: boolean;
  delay: number;
};
export type StudioLayout = {
  w: number;
  h: number;
  pad: number;
  bottom: number;
  texts: StudioText[];
  cards: StudioBox[];
  visual: StudioBox | null;
  overflow: boolean;
};

/** English wraps at word boundaries; CJK can wrap between graphemes. */
export function wrapStudioText(
  ctx: CanvasRenderingContext2D,
  value: string,
  width: number,
): string[] {
  const result: string[] = [];
  for (const paragraph of value.split("\n")) {
    const tokens = paragraph.match(/[\p{L}\p{N}_'’.-]+|\s+|[^\s]/gu) || [""];
    let line = "";
    for (let token of tokens) {
      // Split CJK runs and exceptionally long URLs without breaking surrogate pairs.
      const pieces =
        /[\u3400-\u9fff\u3040-\u30ff]/u.test(token) ||
        ctx.measureText(token).width > width
          ? Array.from(token)
          : [token];
      for (token of pieces) {
        if (!line && /^\s+$/u.test(token)) continue;
        if (line && ctx.measureText(line + token).width > width) {
          result.push(line.trimEnd());
          line = token.trimStart();
        } else line += token;
      }
    }
    result.push(line.trimEnd());
  }
  return result;
}

function block(
  ctx: CanvasRenderingContext2D,
  value: string,
  box: StudioBox,
  size: number,
  min: number,
  role: StudioText["role"],
  font: string,
  delay: number,
): StudioText {
  const weight = role === "title" ? 650 : role === "point" ? 550 : 400;
  const leading = role === "title" ? 1.17 : 1.45;
  let rows: string[];
  do {
    ctx.font = `${weight} ${size}px ${font}`;
    rows = wrapStudioText(ctx, value, box.w);
    if (rows.length * size * leading <= box.h || size <= min) break;
    size--;
  } while (true);
  if (role === "title" && rows.length > 1 && !value.includes("\n")) {
    let best =
      Math.min(...rows.map((row) => ctx.measureText(row).width)) /
      Math.max(...rows.map((row) => ctx.measureText(row).width));
    for (let ratio = 0.95; ratio >= 0.55; ratio -= 0.05) {
      const balanced = wrapStudioText(ctx, value, box.w * ratio);
      if (balanced.length !== rows.length) continue;
      const score =
        Math.min(...balanced.map((row) => ctx.measureText(row).width)) /
        Math.max(...balanced.map((row) => ctx.measureText(row).width));
      if (score > best) {
        rows = balanced;
        best = score;
      }
    }
  }
  const overflow = rows.length * size * leading > box.h + 0.01;
  return {
    ...box,
    h: Math.min(box.h, rows.length * size * leading),
    role,
    size,
    weight,
    leading,
    lines: rows,
    overflow,
    delay,
  };
}

/** Layout uses logical 720px units in every aspect ratio and both export sizes. */
export function layoutStudioScene(
  ctx: CanvasRenderingContext2D,
  doc: StudioDocument,
  scene: StudioScene,
): StudioLayout {
  const { width: w, height: h } = studioDimensions(doc.format, 720);
  const pad = w > h ? 76 : 52,
    top = 116;
  const bottom = h - (doc.subtitles && scene.narration.trim() ? 142 : 78);
  const wide = w > h * 1.3,
    font = studioFonts[doc.theme.font];
  const cards: StudioBox[] = [],
    texts: StudioText[] = [];
  let visual: StudioBox | null = null;
  const add = (
    value: string,
    box: StudioBox,
    size: number,
    min: number,
    role: StudioText["role"],
    delay: number,
  ) => {
    if (!value.trim()) return null;
    const result = block(ctx, value, box, size, min, role, font, delay);
    texts.push(result);
    return result;
  };
  const points = scene.points.filter((point) => point.trim());
  const cardScene =
    !scene.mediaAssetId &&
    (scene.kind === "list" || scene.kind === "stats") &&
    points.length > 0;
  if (
    scene.mediaAssetId &&
    !scene.title.trim() &&
    !scene.body.trim() &&
    points.length === 0
  ) {
    visual = { x: pad, y: top, w: w - pad * 2, h: bottom - top };
  } else if (cardScene) {
    const title = add(
      scene.title,
      { x: pad, y: top, w: w - pad * 2, h: 138 },
      wide ? 60 : 48,
      34,
      "title",
      0,
    );
    let y = top + (title?.h || 0) + 16;
    const body = add(
      scene.body,
      { x: pad, y, w: w - pad * 2, h: Math.min(108, (bottom - y) * 0.28) },
      23,
      18,
      "body",
      4,
    );
    y += (body?.h || 0) + 32;
    const columns = wide ? (points.length <= 3 ? points.length : 2) : 1;
    const rows = Math.ceil(points.length / columns),
      gap = 16;
    const cw = (w - pad * 2 - gap * (columns - 1)) / columns;
    const availableH = bottom - y - gap * (rows - 1);
    const ch = Math.min(240, availableH / rows);
    y += Math.max(0, (availableH - ch * rows) * 0.35);
    points.forEach((value, i) => {
      const box = {
        x: pad + (i % columns) * (cw + gap),
        y: y + Math.floor(i / columns) * (ch + gap),
        w: cw,
        h: Math.max(0, ch),
      };
      cards.push(box);
      add(
        value,
        {
          x: box.x + 24,
          y: box.y + Math.min(58, ch * 0.3),
          w: cw - 48,
          h: Math.max(0, ch - Math.min(58, ch * 0.3) - 22),
        },
        wide ? 27 : 25,
        18,
        "point",
        10 + i * 4,
      );
    });
  } else {
    const split =
      wide &&
      (scene.mediaAssetId ||
        scene.kind === "feature" ||
        scene.kind === "stats");
    const width = split ? w * 0.415 : Math.min(w - pad * 2, wide ? 1000 : w);
    const hasBottomMedia = !wide && Boolean(scene.mediaAssetId);
    const available = (bottom - top) * (hasBottomMedia ? 0.47 : 1);
    const hero = scene.kind === "title" || scene.kind === "outro";
    const titleH =
      available * (scene.body ? (points.length ? 0.36 : 0.58) : 0.82);
    const title = add(
      scene.title,
      { x: pad, y: top, w: width, h: titleH },
      hero ? (wide ? 88 : 60) : scene.kind === "quote" ? 66 : wide ? 58 : 48,
      34,
      "title",
      0,
    );
    let y = top + (title?.h || 0) + 22;
    const body = add(
      scene.body,
      {
        x: pad,
        y,
        w: width,
        h: Math.max(
          0,
          available - (y - top) - points.length * 51 - (points.length ? 18 : 0),
        ),
      },
      wide ? 25 : 24,
      18,
      "body",
      5,
    );
    y += (body?.h || 0) + (body ? 24 : 0);
    const pointH = points.length
      ? Math.min(80, (top + available - y) / points.length)
      : 0;
    points.forEach((value, i) =>
      add(
        value,
        {
          x: pad + 26,
          y: y + i * pointH,
          w: width - 26,
          h: Math.max(0, pointH - 10),
        },
        23,
        18,
        "point",
        10 + i * 4,
      ),
    );
    const used =
      texts.reduce((max, item) => Math.max(max, item.y + item.h), top) - top;
    const offset = Math.max(0, (available - used) / (hero ? 2.6 : 2));
    texts.forEach((item) => {
      item.y += offset;
    });
    if (split)
      visual = {
        x: w * 0.535,
        y: top + 6,
        w: w - pad - w * 0.535,
        h: bottom - top - 12,
      };
    else if (hasBottomMedia)
      visual = {
        x: pad,
        y: top + available + 24,
        w: w - pad * 2,
        h: Math.max(0, bottom - top - available - 24),
      };
  }
  return {
    w,
    h,
    pad,
    bottom,
    texts,
    cards,
    visual,
    overflow:
      texts.some((item) => item.overflow || item.y + item.h > bottom + 0.1) ||
      cards.some((item) => item.h < 70),
  };
}

export async function prepareStudioFonts() {
  await Promise.all([
    document.fonts.load("650 48px Inter"),
    document.fonts.load("400 24px Inter"),
    document.fonts.ready,
  ]);
}
