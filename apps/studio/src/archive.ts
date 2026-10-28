import {
  parseStudioDocument,
  studioReferencedAssets,
  type StudioAsset,
  type StudioDocument,
} from "@rearc/studio/core";
import { studioApi } from "./api.js";

type Manifest = {
  format: "remote-arc-video";
  version: 1;
  document: StudioDocument;
  assets: StudioAsset[];
};
/** A portable snapshot includes the actual media bytes, not expiring asset URLs. */
export async function createStudioArchive(
  projectId: string,
  document: StudioDocument,
  assets: StudioAsset[],
): Promise<Blob> {
  const { zipSync, strToU8 } = await import("fflate");
  const referenced = studioReferencedAssets(document),
    selected = referenced.map((id) => {
      const asset = assets.find((item) => item.id === id);
      if (!asset) throw Error("项目素材尚未加载，请稍后重试。");
      return asset;
    });
  const entries: Record<string, Uint8Array> = {
    "manifest.json": strToU8(
      JSON.stringify({
        format: "remote-arc-video",
        version: 1,
        document,
        assets: selected,
      } satisfies Manifest),
    ),
  };
  for (const asset of selected) {
    const response = await fetch(studioApi.assetUrl(projectId, asset.id));
    if (!response.ok) throw Error("素材下载失败，备份未完成。");
    entries["assets/" + asset.id] = new Uint8Array(
      await response.arrayBuffer(),
    );
  }
  const compressed = zipSync(entries, { level: 0 });
  return new Blob([new Uint8Array(compressed)], { type: "application/zip" });
}
export async function importStudioArchive(file: File) {
  if (file.size > 263192576) throw Error("项目备份超过 251 MB。");
  const data = new Uint8Array(await file.arrayBuffer());
  if (data[0] !== 80 || data[1] !== 75) {
    if (data.byteLength > 128000) throw Error("JSON 项目超过 128 KB。");
    return (
      await studioApi.create(
        parseStudioDocument(JSON.parse(new TextDecoder().decode(data))),
      )
    ).project;
  }
  const { unzipSync, strFromU8 } = await import("fflate");
  let total = 0;
  const entries = unzipSync(data, {
    filter: (entry) => {
      if (!/^(manifest\.json|assets\/[A-Za-z0-9_-]{1,100})$/.test(entry.name))
        throw Error("项目备份包含无效路径。");
      total += entry.originalSize;
      if (
        total > 263192576 ||
        entry.originalSize >
          (entry.name === "manifest.json" ? 128000 : 25 * 1024 * 1024)
      )
        throw Error("项目备份解压大小超过限制。");
      return true;
    },
  });
  if (!entries["manifest.json"]) throw Error("找不到项目清单。");
  const raw = JSON.parse(strFromU8(entries["manifest.json"])) as Manifest;
  if (
    raw.format !== "remote-arc-video" ||
    raw.version !== 1 ||
    !Array.isArray(raw.assets) ||
    raw.assets.length > 100
  )
    throw Error("项目备份格式不正确。");
  const document = parseStudioDocument(raw.document),
    refs = studioReferencedAssets(document);
  if (
    new Set(raw.assets.map((asset) => asset.id)).size !== raw.assets.length ||
    refs.some((id) => !raw.assets.some((asset) => asset.id === id))
  )
    throw Error("项目素材清单不完整。");
  for (const asset of raw.assets) {
    if (
      !/^[A-Za-z0-9_-]{1,100}$/.test(asset.id) ||
      typeof asset.name !== "string" ||
      asset.name.length > 200 ||
      typeof asset.type !== "string" ||
      !entries["assets/" + asset.id]
    )
      throw Error("项目素材清单不正确。");
  }
  const initial = {
    ...document,
    scenes: document.scenes.map((scene) => ({ ...scene, mediaAssetId: null })),
    voice: { ...document.voice, assetId: null },
    music: { ...document.music, assetId: null },
  };
  const created = (await studioApi.create(initial)).project;
  try {
    const ids = new Map<string, string>();
    for (const asset of raw.assets) {
      const uploaded = await studioApi.upload(
        created.id,
        new File([new Uint8Array(entries["assets/" + asset.id]!)], asset.name, {
          type: asset.type,
        }),
      );
      ids.set(asset.id, uploaded.asset.id);
    }
    const restored = {
      ...document,
      scenes: document.scenes.map((scene) => ({
        ...scene,
        mediaAssetId: scene.mediaAssetId ? ids.get(scene.mediaAssetId)! : null,
      })),
      voice: {
        ...document.voice,
        assetId: document.voice.assetId
          ? ids.get(document.voice.assetId)!
          : null,
      },
      music: {
        ...document.music,
        assetId: document.music.assetId
          ? ids.get(document.music.assetId)!
          : null,
      },
    };
    return (
      await studioApi.save(
        { ...created, document: restored },
        "导入完整项目备份",
      )
    ).project;
  } catch (error) {
    await studioApi.remove(created.id).catch(() => {});
    throw error;
  }
}
