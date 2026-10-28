import { useEffect, useState } from "react";
import type { StudioAsset, StudioDocument } from "@remotearc/protocol/studio";
import { inspectStudioVideo, type StudioQualityIssue } from "./quality.js";
import { prepareStudioFonts } from "./layout.js";
import { useStudioLocale } from "./locale.js";

export function StudioQualityPanel({
  document,
  assets,
  onBlocked,
  onScene,
}: {
  document: StudioDocument;
  assets: StudioAsset[];
  onBlocked: (blocked: boolean) => void;
  onScene: (id: string) => void;
}) {
  const { t } = useStudioLocale(),
    [issues, setIssues] = useState<StudioQualityIssue[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    onBlocked(true);
    void prepareStudioFonts()
      .then(() => {
        if (cancelled) return;
        const result = inspectStudioVideo(document, assets);
        setIssues(result);
        onBlocked(result.some((issue) => issue.severity === "error"));
      })
      .catch(() => {
        if (!cancelled)
          setIssues([
            {
              code: "font-load",
              severity: "error",
              message: "字体加载失败，请检查网络后重试。",
            },
          ]);
      });
    return () => {
      cancelled = true;
    };
  }, [document, assets, onBlocked]);
  const errors =
    issues?.filter((issue) => issue.severity === "error").length || 0;
  return (
    <section className="st-quality" aria-label={t("导出前检查")}>
      <strong>{t("导出前检查")}</strong>
      <p role="status">
        {t(
          issues === null
            ? "正在检查排版和素材…"
            : errors
              ? "请先修复以下问题，再导出视频。"
              : "排版和素材引用检查通过。",
        )}
      </p>
      {issues?.length ? (
        <ul>
          {issues.map((issue, i) => (
            <li key={`${issue.code}-${i}`} data-severity={issue.severity}>
              {issue.sceneId ? (
                <button
                  type="button"
                  className="st-text-button"
                  onClick={() => onScene(issue.sceneId!)}
                >
                  {t("分镜 {0}", (issue.sceneIndex ?? 0) + 1)} ↗
                </button>
              ) : null}
              <span>{t(issue.message)}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <small>
        {t("检查覆盖排版、素材引用和阅读节奏；发布前仍请预览完整成片。")}
      </small>
    </section>
  );
}
