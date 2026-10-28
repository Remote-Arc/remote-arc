/** Portable, dependency-free video document contract shared by API and editor. */
export const STUDIO_SCHEMA_VERSION = 1;
export const STUDIO_FPS = 30;
export const STUDIO_MAX_FRAMES = 5400;
export const STUDIO_SCENE_KINDS = [
  "title",
  "feature",
  "list",
  "quote",
  "stats",
  "outro",
] as const;
export type StudioSceneKind = (typeof STUDIO_SCENE_KINDS)[number];
export type StudioScene = {
  id: string;
  kind: StudioSceneKind;
  durationFrames: number;
  kicker: string;
  title: string;
  body: string;
  points: string[];
  narration: string;
  mediaAssetId: string | null;
  background: "dark" | "light" | "accent";
  transition: "fade" | "slide" | "cut";
};
export type StudioDocument = {
  schemaVersion: 1;
  title: string;
  brief: string;
  fps: 30;
  format: "landscape" | "portrait" | "square";
  theme: {
    accent: string;
    background: string;
    foreground: string;
    font: "sans" | "serif" | "mono";
  };
  scenes: StudioScene[];
  voice: { assetId: string | null; volume: number };
  music: { assetId: string | null; volume: number };
  subtitles: boolean;
};
export type StudioProject = {
  id: string;
  revision: number;
  document: StudioDocument;
  createdAt: string;
  updatedAt: string;
};
export type StudioProjectSummary = {
  id: string;
  revision: number;
  title: string;
  format: StudioDocument["format"];
  durationFrames: number;
  sceneCount: number;
  accent: string;
  updatedAt: string;
};
export type StudioAsset = {
  id: string;
  name: string;
  type: string;
  size: number;
  createdAt: string;
};
export type StudioVersion = {
  revision: number;
  label: string;
  createdAt: string;
};
export type StudioJob = {
  id: string;
  status:
    | "queued"
    | "running"
    | "completed"
    | "failed"
    | "unknown"
    | "conflict"
    | "cancelled";
  baseRevision: number;
  error: string | null;
  prompt?: string;
  explanation?: string;
  createdAt: string;
  updatedAt: string;
};

const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("STUDIO_INVALID_DOCUMENT");
  return value as Record<string, unknown>;
};
const string = (value: unknown, max: number, min = 0): string => {
  if (typeof value !== "string" || value.length < min || value.length > max)
    throw Error("STUDIO_INVALID_DOCUMENT");
  return value;
};
const choice = <T extends string>(value: unknown, values: readonly T[]): T => {
  if (typeof value !== "string" || !values.includes(value as T))
    throw Error("STUDIO_INVALID_DOCUMENT");
  return value as T;
};
const number = (
  value: unknown,
  min: number,
  max: number,
  integer = false,
): number => {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < min ||
    value > max ||
    (integer && !Number.isSafeInteger(value))
  )
    throw Error("STUDIO_INVALID_DOCUMENT");
  return value;
};
export const studioId = (value: unknown): string => {
  const id = string(value, 100, 1);
  if (!/^[A-Za-z0-9_-]+$/.test(id)) throw Error("STUDIO_INVALID_DOCUMENT");
  return id;
};
const assetId = (value: unknown) => (value === null ? null : studioId(value));
const color = (value: unknown) => {
  const text = string(value, 7);
  if (!/^#[0-9a-fA-F]{6}$/.test(text)) throw Error("STUDIO_INVALID_DOCUMENT");
  return text;
};
export function parseStudioScene(value: unknown): StudioScene {
  const s = object(value);
  if (!Array.isArray(s.points) || s.points.length > 6)
    throw Error("STUDIO_INVALID_DOCUMENT");
  return {
    id: studioId(s.id),
    kind: choice(s.kind, STUDIO_SCENE_KINDS),
    durationFrames: number(s.durationFrames, 30, 900, true),
    kicker: string(s.kicker, 60),
    title: string(s.title, 120),
    body: string(s.body, 600),
    points: s.points.map((point) => string(point, 160)),
    narration: string(s.narration, 1600),
    mediaAssetId: assetId(s.mediaAssetId),
    background: choice(s.background, ["dark", "light", "accent"]),
    transition: choice(s.transition, ["fade", "slide", "cut"]),
  };
}
export function parseStudioDocument(value: unknown): StudioDocument {
  const d = object(value),
    theme = object(d.theme),
    voice = object(d.voice),
    music = object(d.music);
  if (
    d.schemaVersion !== 1 ||
    d.fps !== 30 ||
    typeof d.subtitles !== "boolean" ||
    !Array.isArray(d.scenes) ||
    d.scenes.length < 1 ||
    d.scenes.length > 12
  )
    throw Error("STUDIO_INVALID_DOCUMENT");
  const scenes = d.scenes.map(parseStudioScene);
  if (
    new Set(scenes.map((scene) => scene.id)).size !== scenes.length ||
    scenes.reduce((n, scene) => n + scene.durationFrames, 0) > STUDIO_MAX_FRAMES
  )
    throw Error("STUDIO_INVALID_DOCUMENT");
  return {
    schemaVersion: 1,
    title: string(d.title, 120, 1),
    brief: string(d.brief, 12000),
    fps: 30,
    format: choice(d.format, ["landscape", "portrait", "square"]),
    theme: {
      accent: color(theme.accent),
      background: color(theme.background),
      foreground: color(theme.foreground),
      font: choice(theme.font, ["sans", "serif", "mono"]),
    },
    scenes,
    voice: {
      assetId: assetId(voice.assetId),
      volume: number(voice.volume, 0, 1),
    },
    music: {
      assetId: assetId(music.assetId),
      volume: number(music.volume, 0, 1),
    },
    subtitles: d.subtitles,
  };
}
export const studioDuration = (document: StudioDocument) =>
  document.scenes.reduce((frames, scene) => frames + scene.durationFrames, 0);
export function studioDimensions(
  format: StudioDocument["format"],
  quality = 1080,
): { width: number; height: number } {
  const longSide = Math.round((quality * 16) / 9 / 2) * 2;
  return {
    width: format === "landscape" ? longSide : quality,
    height: format === "portrait" ? longSide : quality,
  };
}
export function studioSceneAt(document: StudioDocument, frame: number) {
  let start = 0;
  const bounded = Math.max(0, Math.min(studioDuration(document) - 1, frame));
  for (let index = 0; index < document.scenes.length; index++) {
    const scene = document.scenes[index]!;
    if (bounded < start + scene.durationFrames)
      return { scene, index, start, frame: bounded - start };
    start += scene.durationFrames;
  }
  throw Error("STUDIO_EMPTY_PROJECT");
}
export function newStudioScene(
  kind: StudioSceneKind = "feature",
  locale: "en" | "zh" = "zh",
): StudioScene {
  return {
    id: crypto.randomUUID(),
    kind,
    durationFrames: 180,
    kicker: "",
    title: locale === "en" ? "New scene" : "新的分镜",
    body:
      locale === "en"
        ? "Write the idea you want to share."
        : "在这里写下想表达的内容。",
    points: [],
    narration: "",
    mediaAssetId: null,
    background: "dark",
    transition: "fade",
  };
}
export function newStudioDocument(
  title = "未命名作品",
  brief = "",
  locale: "en" | "zh" = "zh",
): StudioDocument {
  return {
    schemaVersion: 1,
    title,
    brief,
    fps: 30,
    format: "landscape",
    theme: {
      accent: "#38bdf8",
      background: "#111114",
      foreground: "#eeeef1",
      font: "sans",
    },
    scenes: [
      {
        ...newStudioScene("title", locale),
        kicker: "YOUR NEXT STORY",
        title,
        body: brief.slice(0, 240),
      },
    ],
    voice: { assetId: null, volume: 1 },
    music: { assetId: null, volume: 0.15 },
    subtitles: true,
  };
}
export function studioReferencedAssets(document: StudioDocument): string[] {
  return [
    ...new Set(
      [
        ...document.scenes.map((scene) => scene.mediaAssetId),
        document.voice.assetId,
        document.music.assetId,
      ].filter((id): id is string => id !== null),
    ),
  ];
}
export function studioSummary(project: StudioProject): StudioProjectSummary {
  return {
    id: project.id,
    revision: project.revision,
    title: project.document.title,
    format: project.document.format,
    durationFrames: studioDuration(project.document),
    sceneCount: project.document.scenes.length,
    accent: project.document.theme.accent,
    updatedAt: project.updatedAt,
  };
}

export type StudioIdentity = { id: string; email: string; name: string | null };
export type StudioAccountLinks = {
  login: string;
  account: string | null;
  home: string | null;
};
