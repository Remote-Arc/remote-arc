import React, { useEffect, useState } from "react";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import type { DocTopic } from "../../../packages/docs/src/catalog.js";
import { referenceLink } from "../../../packages/docs/src/reference-docs.js";
import { SystemOverview } from "./docs-system-overview.js";
import { useI18n } from "./i18n.js";
import { localizedWebsiteHref } from "./marketing-paths.js";
import { WorkspaceLoading } from "./workspace-loading.js";

// Listed explicitly so only reviewed documents reach the website bundle.
const documents = import.meta.glob([
  "../../../docs/agent-platform-architecture.md",
  "../../../docs/execution-isolation.md",
  "../../../docs/execution-isolation.en.md",
  "../../../docs/feature-map/*.md",
  "../../../SECURITY.md",
  "../../../benchmarks/README.md",
  "../../../benchmarks/RESULTS-2026-10-09-f68ab09.md",
  "../../../benchmarks/RESULTS-2026-10-09-71cde96.md",
], { query: "?raw", import: "default" }) as Record<string, () => Promise<string>>;

export function ReferenceDoc({ topic }: { topic: DocTopic }) {
  const { tr, locale } = useI18n();
  const source = (locale === "zh" && topic.reference!.zh) || topic.reference!.en;
  const [content, setContent] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let current = true;
    setContent(null);
    setFailed(false);
    documents["../../../" + source]!().then(
      (value) => { if (current) setContent(value); },
      () => { if (current) setFailed(true); },
    );
    return () => { current = false; };
  }, [source]);
  const components: Components = {
    // The page header already shows the title.
    h1: () => null,
    a: ({ href, children }) => {
      const target = href ? referenceLink(source, href) : null;
      if (!target) return <>{children}</>;
      return target.startsWith("/") ? <a href={localizedWebsiteHref(target, locale)}>{children}</a> : <a href={target} target="_blank" rel="noreferrer">{children}</a>;
    },
    table: ({ children }) => <div className="docsTableWrap"><table className="articleTable">{children}</table></div>,
    // SystemOverview presents the topology on the site.
    pre: ({ children, node }) => {
      const code = node?.children[0];
      const language = code && "properties" in code ? code.properties.className : undefined;
      return Array.isArray(language) && language.includes("language-mermaid") ? null : <pre>{children}</pre>;
    },
  };
  return (
    <main className="technicalDoc referenceDoc">
      <header className="articleHeader">
        <span className="eyebrow">{tr("ENGINEERING REFERENCE", "工程参考")}</span>
        <h1>{tr(topic.title.en, topic.title.zh)}</h1>
        <p>{tr(topic.description.en, topic.description.zh)}</p>
        {locale === "zh" && !topic.reference!.zh && <p>此文档目前只有英文版。</p>}
      </header>
      {topic.slug === "engineering-architecture" && <SystemOverview />}
      {failed && <p role="alert">{tr("This document could not be loaded. Refresh the page to try again.", "文档加载失败，请刷新页面重试。")}</p>}
      {!failed && content === null && <WorkspaceLoading label={tr("Loading document…", "正在加载文档…")} variant="rows" />}
      {content !== null && <article className="technicalArticle"><Markdown remarkPlugins={[remarkGfm]} components={components}>{content}</Markdown></article>}
    </main>
  );
}
