import { translateStudio } from "./strings.js";
import type {
  StudioAsset,
  StudioDocument,
  StudioJob,
  StudioProject,
  StudioProjectSummary,
  StudioVersion,
} from "@remotearc/protocol/studio";

export type StudioConfig = {
  models: { id: string; label: string; configured: boolean }[];
  generationAvailable: boolean;
  uploadsAvailable: boolean;
  skills: { id: string; name: string; description: string }[];
  limits: {
    maxProjects: number;
    maxScenes: number;
    maxSeconds: number;
    maxAssetBytes: number;
  };
};
export class StudioApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(studioErrorMessage(code));
  }
}
const messages: Record<string, string> = {
  unauthorized: "登录后即可保存作品。",
  same_origin_required: "请求来源验证失败，请重新打开页面。",
  STUDIO_REVISION_CONFLICT:
    "作品已在其他页面更新。请先下载当前项目备份，再刷新载入最新版本。",
  STUDIO_AI_UNAVAILABLE:
    "当前环境尚未启用 Arc AI。你仍可手动编排、预览和导出。",
  ARC_NOT_CONFIGURED: "当前环境尚未启用 Arc AI。",
  ARC_TRIAL_REQUIRED: "请先在 Arc 账户中启用试用或选择套餐。",
  ARC_TRIAL_EXPIRED: "Arc 试用已结束，请在账户中选择套餐。",
  BILLING_CREDITS_EXHAUSTED: "可用 Credits 不足，请在 Arc 账户中查看用量。",
  BILLING_QUOTA_OR_AUTHORITY_UNAVAILABLE:
    "当前账户的 AI 额度或授权不足，请检查 Arc 账户。",
  STUDIO_CONCURRENT_LIMIT: "已有两个 AI 任务正在执行，请等待完成。",
  STUDIO_INPUT_TOO_LARGE: "文件或内容超过大小限制。",
  STUDIO_ASSET_TYPE:
    "请选择 PNG、JPEG、WebP、AVIF 图片，常见音频或 MP4/WebM 视频。",
  STUDIO_STORAGE_NOT_CONFIGURED: "当前环境未配置私有素材存储。",
  STUDIO_STORAGE_LIMIT: "素材存储已达上限（每项目 100 个、每账户 250 MB）。",
  STUDIO_INVALID_DOCUMENT:
    "项目格式或时长不符合要求：最多 12 个分镜、总时长 180 秒。",
  STUDIO_MODEL_INVALID: "AI 返回的分镜格式不符合要求，原项目已保留。",
  STUDIO_PROJECT_NOT_FOUND: "作品不存在或当前账户没有访问权限。",
  STUDIO_INTERRUPTED: "任务执行中断，结果待核实。系统不会自动重复调用模型。",
  MODEL_TIMEOUT: "模型响应超时，结果待核实，请稍后检查。",
  STUDIO_GENERATION_FAILED: "AI 暂时未能完成编排，原项目已保留。",
  STUDIO_UNAVAILABLE: "服务暂不可用，请稍后重试。",
  STUDIO_EXPORT_UNSUPPORTED:
    "此浏览器不支持视频编码，请使用最新版 Chrome 或 Edge。",
  STUDIO_EXPORT_CANCELLED: "已取消导出。",
  STUDIO_IMPORT_ASSETS_REQUIRED:
    "此项目引用了外部素材。请先导入不含素材引用的项目，再上传原文件。",
};
export const studioErrorMessage = (code: string, locale: "en" | "zh" = "zh") =>
  translateStudio(messages[code] || "操作未完成（{0}）。", locale, code);
async function request<T>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    credentials: "same-origin",
    ...init,
    headers: { accept: "application/json", ...init.headers },
  });
  const payload = (await response
    .json()
    .catch(() => ({ error: "STUDIO_UNAVAILABLE" }))) as T & { error?: string };
  if (!response.ok)
    throw new StudioApiError(
      payload.error || "STUDIO_UNAVAILABLE",
      response.status,
    );
  return payload;
}
const post = <T>(url: string, value: unknown) =>
  request<T>(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(value),
  });
const root = "/api/studio/projects";
export const studioApi = {
  config: () => request<StudioConfig>("/api/studio/config"),
  projects: () => request<{ projects: StudioProjectSummary[] }>(root),
  project: (id: string) =>
    request<{ project: StudioProject }>(`${root}/${encodeURIComponent(id)}`),
  create: (document: StudioDocument) =>
    post<{ project: StudioProject }>(root, { document }),
  save: (project: StudioProject, label = "手动编辑") =>
    post<{ project: StudioProject }>(`${root}/${project.id}`, {
      baseRevision: project.revision,
      document: project.document,
      label,
    }),
  remove: (id: string) =>
    request<{ deleted: boolean }>(`${root}/${id}`, { method: "DELETE" }),
  versions: (id: string) =>
    request<{ versions: StudioVersion[] }>(`${root}/${id}/versions`),
  restore: (id: string, baseRevision: number, revision: number) =>
    post<{ project: StudioProject }>(`${root}/${id}/restore`, {
      baseRevision,
      revision,
    }),
  assets: (id: string) =>
    request<{ assets: StudioAsset[] }>(`${root}/${id}/assets`),
  upload: (id: string, file: File) =>
    request<{ asset: StudioAsset }>(`${root}/${id}/assets`, {
      method: "POST",
      headers: {
        "content-type": file.type || "application/octet-stream",
        "x-file-name": encodeURIComponent(file.name),
      },
      body: file,
    }),
  generate: (
    id: string,
    input: {
      baseRevision: number;
      requestId: string;
      prompt: string;
      mode: "generate" | "edit";
      selectedSceneId: string | null;
      modelId: string;
      skillIds: string[];
    },
  ) => post<{ job: StudioJob }>(`${root}/${id}/generate`, input),
  job: (id: string, jobId: string) =>
    request<{ job: StudioJob; project?: StudioProject }>(
      `${root}/${id}/jobs/${jobId}`,
    ),
  jobs: (id: string) => request<{ jobs: StudioJob[] }>(`${root}/${id}/jobs`),
  cancel: (id: string, jobId: string) =>
    request<{ cancelled: boolean }>(`${root}/${id}/jobs/${jobId}`, {
      method: "DELETE",
    }),
  assetUrl: (id: string, asset: string) =>
    `${root}/${encodeURIComponent(id)}/assets/${encodeURIComponent(asset)}`,
};
