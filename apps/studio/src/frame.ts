import {
  studioDuration,
  studioSceneAt,
  type StudioDocument,
} from "@rearc/studio/core";
import {
  layoutStudioScene,
  studioFonts,
  wrapStudioText,
  type StudioBox,
  type StudioText,
} from "./layout.js";
import { studioCaptionAt } from "./captions.js";
import { studioSceneColors } from "./colors.js";

export type StudioVisuals = Map<string, CanvasImageSource>;
const clamp = (v: number) => Math.max(0, Math.min(1, v));
const ease = (v: number) => 1 - Math.pow(1 - clamp(v), 4);
function rect(
  ctx: CanvasRenderingContext2D,
  box: StudioBox,
  radius: number,
  fill: string,
  stroke?: string,
) {
  ctx.beginPath();
  ctx.roundRect(
    box.x,
    box.y,
    box.w,
    box.h,
    Math.max(0, Math.min(radius, box.w / 2, box.h / 2)),
  );
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}
function label(
  ctx: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  size: number,
  color: string,
  font: string = studioFonts.sans,
) {
  ctx.fillStyle = color;
  ctx.textBaseline = "top";
  ctx.font = `500 ${size}px ${font}`;
  ctx.fillText(value, x, y);
}
function paintText(
  ctx: CanvasRenderingContext2D,
  block: StudioText,
  font: string,
  color: string,
  frame: number,
  motion: boolean,
) {
  const progress = motion ? ease((frame - block.delay) / 25) : 1;
  ctx.save();
  ctx.beginPath();
  ctx.rect(block.x - 2, block.y - 2, block.w + 4, block.h + 5);
  ctx.clip();
  ctx.translate(0, (1 - progress) * (block.role === "title" ? 30 : 18));
  ctx.globalAlpha *= progress;
  ctx.fillStyle = color;
  ctx.textBaseline = "top";
  ctx.font = `${block.weight} ${block.size}px ${font}`;
  block.lines.forEach((line, i) =>
    ctx.fillText(line, block.x, block.y + i * block.size * block.leading),
  );
  ctx.restore();
}
function paintMedia(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  box: StudioBox,
  accent: string,
  progress: number,
  light: boolean,
) {
  ctx.save();
  ctx.shadowColor = light ? "#00000018" : "#00000066";
  ctx.shadowBlur = 42;
  ctx.shadowOffsetY = 16;
  rect(ctx, box, 22, light ? "#ffffff" : "#181b21");
  ctx.shadowColor = "transparent";
  rect(
    ctx,
    box,
    22,
    light ? "#ffffff" : "#181b21",
    light ? "#00000018" : "#ffffff24",
  );
  ctx.beginPath();
  ctx.roundRect(box.x + 1, box.y + 1, box.w - 2, box.h - 2, 21);
  ctx.clip();
  const candidate = image as unknown as {
    width?: number;
    height?: number;
    videoWidth?: number;
    videoHeight?: number;
    naturalWidth?: number;
    naturalHeight?: number;
  };
  const iw =
    candidate.videoWidth || candidate.naturalWidth || candidate.width || box.w;
  const ih =
    candidate.videoHeight ||
    candidate.naturalHeight ||
    candidate.height ||
    box.h;
  // Contain keeps product screenshots and text inside the media card.
  const scale =
    Math.min((box.w - 24) / iw, (box.h - 24) / ih) * (0.97 + progress * 0.02);
  ctx.drawImage(
    image,
    box.x + (box.w - iw * scale) / 2,
    box.y + (box.h - ih * scale) / 2,
    iw * scale,
    ih * scale,
  );
  ctx.restore();
  rect(
    ctx,
    { x: box.x + 24, y: box.y, w: Math.min(64, box.w * 0.2), h: 2 },
    1,
    accent,
  );
}
function paintArc(
  ctx: CanvasRenderingContext2D,
  box: StudioBox,
  accent: string,
  frame: number,
  subtle = false,
) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(box.x, box.y, box.w, box.h);
  ctx.clip();
  const radius = Math.min(box.w * 0.39, box.h * 0.42),
    cx = box.x + box.w / 2,
    cy = box.y + box.h * 0.58;
  ctx.translate(cx, cy);
  const appear = ease(frame / 36);
  for (let i = 0; i < 3; i++) {
    ctx.save();
    ctx.rotate(-0.4 + i * 0.48 + frame / 1800);
    ctx.scale(1, 0.72 + i * 0.1);
    ctx.strokeStyle = accent;
    ctx.globalAlpha = (subtle ? 0.1 : 0.26) * (1 - i * 0.18);
    ctx.lineWidth = i === 0 ? 2.5 : 1;
    ctx.beginPath();
    ctx.arc(
      0,
      0,
      radius + i * 25,
      -0.95 * Math.PI,
      -0.95 * Math.PI + Math.PI * 1.75 * appear,
    );
    ctx.stroke();
    ctx.restore();
  }
  if (!subtle) {
    const gradient = ctx.createLinearGradient(-radius, 0, radius, 0);
    gradient.addColorStop(0, accent + "18");
    gradient.addColorStop(0.55, accent);
    gradient.addColorStop(1, accent + "55");
    ctx.strokeStyle = gradient;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-radius, 24);
    ctx.bezierCurveTo(
      -radius * 0.6,
      -radius * 1.25,
      radius * 0.6,
      -radius * 1.25,
      radius,
      24,
    );
    ctx.stroke();
    for (const direction of [-1, 1]) {
      ctx.fillStyle = accent;
      ctx.shadowColor = accent;
      ctx.shadowBlur = 18;
      ctx.beginPath();
      ctx.arc(direction * radius, 24, 6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowColor = "transparent";
    rect(
      ctx,
      { x: -32, y: -16, w: 64, h: 64 },
      18,
      accent + "1a",
      accent + "66",
    );
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-11, 16);
    ctx.lineTo(11, 16);
    ctx.moveTo(3, 8);
    ctx.lineTo(11, 16);
    ctx.lineTo(3, 24);
    ctx.stroke();
  }
  ctx.restore();
}

/** Preview and MP4 share this deterministic, frame-addressable composition. */
export function paintStudioFrame(
  canvas: HTMLCanvasElement,
  doc: StudioDocument,
  frame: number,
  visuals: StudioVisuals = new Map(),
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw Error("STUDIO_CANVAS_UNAVAILABLE");
  const { scene, index, frame: local } = studioSceneAt(doc, frame);
  const layout = layoutStudioScene(ctx, doc, scene),
    { w, h, pad } = layout;
  const { bg, fg, light, muted, accent } = studioSceneColors(doc, scene);
  const motion = scene.transition !== "cut",
    enter = motion ? ease(local / 26) : 1;
  ctx.resetTransform();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(canvas.width / w, 0, 0, canvas.height / h, 0, 0);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  const glow = ctx.createRadialGradient(
    w * 0.84,
    h * 0.3,
    0,
    w * 0.84,
    h * 0.3,
    w * 0.65,
  );
  glow.addColorStop(0, accent + (light ? "0b" : "12"));
  glow.addColorStop(1, accent + "00");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = light ? "#00000006" : "#ffffff05";
  for (let x = pad; x < w; x += 64) ctx.fillRect(x, 0, 1, h);
  if (!layout.visual && layout.cards.length === 0 && scene.kind !== "quote")
    paintArc(
      ctx,
      { x: w * 0.5, y: h * 0.24, w: w * 0.58, h: h * 0.7 },
      accent,
      local + 40,
      true,
    );
  ctx.globalAlpha = enter;
  rect(ctx, { x: pad, y: 55, w: 23, h: 3 }, 1.5, accent);
  label(
    ctx,
    scene.kicker ||
      `${String(index + 1).padStart(2, "0")} / ${String(doc.scenes.length).padStart(2, "0")}`,
    pad + 37,
    49,
    13,
    muted,
    studioFonts.mono,
  );
  ctx.globalAlpha = 1;
  ctx.save();
  if (scene.transition === "slide") ctx.translate((1 - enter) * 22, 0);
  layout.cards.forEach((card, i) => {
    const reveal = motion ? ease((local - 8 - i * 4) / 28) : 1;
    ctx.save();
    ctx.globalAlpha = reveal;
    ctx.translate(0, (1 - reveal) * 18);
    rect(
      ctx,
      card,
      16,
      light ? "#ffffff99" : "#ffffff07",
      light ? "#00000018" : "#ffffff18",
    );
    rect(ctx, { x: card.x + 24, y: card.y, w: 32, h: 2 }, 1, accent);
    label(
      ctx,
      String(i + 1).padStart(2, "0"),
      card.x + 24,
      card.y + 22,
      13,
      accent,
      studioFonts.mono,
    );
    ctx.restore();
  });
  if (scene.kind === "quote") {
    ctx.globalAlpha = 0.17 * enter;
    label(ctx, "“", w - pad - 116, 80, 190, accent, studioFonts.serif);
    ctx.globalAlpha = 1;
  }
  layout.texts.forEach((block) => {
    if (block.role === "point" && !layout.cards.length) {
      ctx.globalAlpha = motion ? ease((local - block.delay) / 25) : 1;
      rect(ctx, { x: block.x - 26, y: block.y + 11, w: 7, h: 7 }, 3.5, accent);
      ctx.globalAlpha = 1;
    }
    paintText(
      ctx,
      block,
      studioFonts[doc.theme.font],
      block.role === "body" ? muted : fg,
      local,
      motion,
    );
  });
  if (layout.visual) {
    ctx.save();
    ctx.globalAlpha = motion ? ease((local - 5) / 32) : 1;
    ctx.translate(0, (1 - enter) * 18);
    const image = scene.mediaAssetId
      ? visuals.get(scene.mediaAssetId)
      : undefined;
    if (image)
      paintMedia(
        ctx,
        image,
        layout.visual,
        accent,
        local / scene.durationFrames,
        light,
      );
    else paintArc(ctx, layout.visual, accent, local + 8);
    ctx.restore();
  }
  ctx.restore();
  ctx.fillStyle = light ? "#00000022" : "#ffffff22";
  ctx.fillRect(pad, h - 49, w - pad * 2, 1);
  ctx.save();
  ctx.beginPath();
  ctx.rect(pad, h - 39, w - pad * 2 - 120, 24);
  ctx.clip();
  label(ctx, doc.title, pad, h - 33, 11, muted, studioFonts.mono);
  ctx.restore();
  const meterWidth = 66,
    meterX = w - pad - meterWidth;
  rect(
    ctx,
    { x: meterX, y: h - 29, w: meterWidth, h: 2 },
    1,
    light ? "#00000020" : "#ffffff28",
  );
  rect(
    ctx,
    {
      x: meterX,
      y: h - 29,
      w: meterWidth * clamp((frame + 1) / studioDuration(doc)),
      h: 2,
    },
    1,
    accent,
  );
  if (doc.subtitles && scene.narration.trim()) {
    const caption = studioCaptionAt(scene, local),
      size = 21;
    ctx.font = `500 ${size}px ${studioFonts.sans}`;
    const rows = wrapStudioText(ctx, caption, w - pad * 2 - 40);
    const boxW = Math.min(
        w - pad * 2,
        Math.max(0, ...rows.map((line) => ctx.measureText(line).width)) + 40,
      ),
      boxH = rows.length * size * 1.4 + 24;
    const box = { x: (w - boxW) / 2, y: h - 73 - boxH, w: boxW, h: boxH };
    rect(ctx, box, 9, "#10141df0", "#ffffff12");
    rows.forEach((line, i) =>
      label(
        ctx,
        line,
        box.x + 20,
        box.y + 12 + i * size * 1.4,
        size,
        "#ffffff",
      ),
    );
  }
  ctx.resetTransform();
}
