import toolIndex from "../../../packages/docs/src/tool-index.generated.json" with { type: "json" };
import { TOOL_COPY } from "../../../packages/docs/src/tool-reference-meta.js";
import React, { useState } from "react";
const ToolReference = React.lazy(() =>
  import("./tool-reference.js").then((module) => ({
    default: module.ToolReference,
  })),
);
const ReferenceDoc = React.lazy(() =>
  import("./reference-doc.js").then((module) => ({
    default: module.ReferenceDoc,
  })),
);
import { DOC_TOPICS, docTopic } from "../../../packages/docs/src/catalog.js";
import { Documentation } from "./product-docs.js";
import { SystemOverview } from "./docs-system-overview.js";
import { localizedWebsiteHref } from "./marketing-paths.js";
import { useI18n } from "./i18n.js";
import "./docs-portal.css";
const groups = [
  { id: "start", en: "Get started", zh: "开始使用" },
  { id: "work", en: "Get work done", zh: "执行工作" },
  { id: "understand", en: "Understand the platform", zh: "了解平台" },
  { id: "reference", en: "Engineering reference", zh: "工程参考" },
];
export function DocsPortal({ path }: { path: string }) {
  const { tr, locale } = useI18n(),
    [query, setQuery] = useState(""),
    [navOpen, setNavOpen] = useState(false);
  const href = (value: string) => localizedWebsiteHref(value, locale),
    topic = docTopic(path);
  const toolQuery = query.trim().toLowerCase();
  const remoteMatch =
    toolQuery &&
    toolIndex.remote.some((tool) =>
      [
        tool.name,
        tool.title,
        TOOL_COPY[tool.name]?.zh,
        TOOL_COPY[tool.name]?.summary,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(toolQuery),
    );
  const appMatch =
    toolQuery &&
    toolIndex.apps.some((app) =>
      [app.name, app.provider, ...app.operations]
        .join(" ")
        .toLowerCase()
        .includes(toolQuery),
    );
  const localMatch =
    toolQuery && toolIndex.local.some((tool) => tool.name.includes(toolQuery));
  const topicHref = (slug: string) =>
    href("/docs/" + slug) +
    (slug === "tools" && toolQuery
      ? "?type=" +
        (remoteMatch
          ? "remote"
          : appMatch
            ? "apps"
            : localMatch
              ? "local"
              : "remote") +
        "&q=" +
        encodeURIComponent(query.trim())
      : "");
  const filtered = DOC_TOPICS.filter(
    (item) =>
      (
        item.title.en +
        " " +
        item.title.zh +
        " " +
        item.description.en +
        " " +
        item.description.zh
      )
        .toLowerCase()
        .includes(toolQuery) ||
      (item.slug === "tools" && (remoteMatch || appMatch || localMatch)),
  );
  if (path === "/docs")
    return (
      <main className="docsHub">
        <header>
          <span className="eyebrow">REMOTE ARC / DOCUMENTATION</span>
          <h1>
            {tr(
              "From your first connection to real work.",
              "从首次连接，到完成工作。",
            )}
          </h1>
          <p>
            {tr(
              "Start with Arc or Connect, then learn how Apps, Skills, memory and Tasks turn a request into a result.",
              "从 Arc 或 Connect 开始，了解 Apps、Skills、记忆与 Tasks 如何把需求变成结果。",
            )}
          </p>
        </header>
        <div className="docsHubStart">
          <div>
            <span>{tr("START HERE", "从这里开始")}</span>
            <h2>
              {tr(
                "Your goal. One connected workspace.",
                "一个工作空间，推进你的目标。",
              )}
            </h2>
            <p>
              {tr(
                "Use hosted Arc, or bring your own AI through Connect. Choose the guide for the way you work.",
                "使用托管 Arc，或通过 Connect 接入已有 AI，按你的工作方式开始。",
              )}
            </p>
          </div>
          <a className="primaryButton" href={href("/docs/start-here")}>
            {tr("Start with a goal", "从目标开始")} →
          </a>
        </div>
        <SystemOverview />
        <a className="docsHubToolsLink" href={href("/docs/tools")}>
          {tr(
            "Looking for a tool? Browse the complete directory",
            "想找工具？查看完整工具目录",
          )}{" "}
          →
        </a>
        <label className="docsHubSearch">
          {tr("Find a guide", "查找指南")}
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={tr("Search documentation…", "搜索文档…")}
          />
        </label>
        {groups.map((group) => {
          const items = filtered.filter((item) => item.group === group.id && item.listed !== false);
          return items.length ? (
            <section className="docsHubGroup" key={group.id}>
              <h2>{tr(group.en, group.zh)}</h2>
              <div>
                {items.map((item) => (
                  <a key={item.slug} href={topicHref(item.slug)}>
                    <span className="docsHubArrow" aria-hidden="true">
                      ↗
                    </span>
                    <h3>{tr(item.title.en, item.title.zh)}</h3>
                    <p>{tr(item.description.en, item.description.zh)}</p>
                  </a>
                ))}
              </div>
            </section>
          ) : null;
        })}
        {!filtered.length && (
          <p role="status">
            {tr("No guides match your search.", "没有匹配的指南。")}
          </p>
        )}
        <nav
          className="docsHubReference"
          aria-label={tr("More references", "更多参考")}
        >
          <a href={href("/docs/mcp")}>{tr("MCP reference", "MCP 参考")} ↗</a>
          <a href={href("/docs/tools")}>{tr("All tools", "全部工具")} ↗</a>
          <a href={href("/docs/long-running-work")}>
            {tr("Long-running work", "持续工作指南")} ↗
          </a>
          <a href={href("/connect-ai")}>
            {tr("Installation guides", "安装指南")} ↗
          </a>
        </nav>
      </main>
    );
  if (!topic)
    return (
      <main className="technicalDoc">
        <h1>{tr("Guide not found", "未找到指南")}</h1>
        <a href={href("/docs")}>{tr("All documentation", "全部文档")} →</a>
      </main>
    );
  return (
    <div className="docsPortal">
      <aside>
        <a className="docsPortalHome" href={href("/docs")}>
          ← {tr("All documentation", "全部文档")}
        </a>
        <button
          type="button"
          className="docsPortalToggle"
          aria-expanded={navOpen}
          aria-controls="docsTopicNavigation"
          onClick={() => setNavOpen((value) => !value)}
        >
          {tr("Browse topics", "浏览主题")}{" "}
          <span aria-hidden="true">{navOpen ? "−" : "+"}</span>
        </button>
        <nav
          id="docsTopicNavigation"
          className="docsPortalTopicNav"
          data-expanded={navOpen}
          aria-label={tr("Documentation topics", "文档主题")}
        >
          {groups.map((group) => (
            <div key={group.id}>
              <strong>{tr(group.en, group.zh)}</strong>
              {DOC_TOPICS.filter((item) => item.group === group.id && item.listed !== false).map(
                (item) => (
                  <a
                    key={item.slug}
                    href={href("/docs/" + item.slug)}
                    aria-current={item.slug === topic.slug ? "page" : undefined}
                  >
                    {tr(item.title.en, item.title.zh)}
                  </a>
                ),
              )}
            </div>
          ))}
        </nav>
      </aside>
      <div className="docsPortalContent">
        {topic.slug === "tools" ? (
          <React.Suspense
            fallback={
              <main className="technicalDoc">
                <p>{tr("Loading tools…", "正在加载工具…")}</p>
              </main>
            }
          >
            <ToolReference />
          </React.Suspense>
        ) : topic.reference ? (
          <React.Suspense
            fallback={
              <main className="technicalDoc">
                <p>{tr("Loading document…", "正在加载文档…")}</p>
              </main>
            }
          >
            <ReferenceDoc topic={topic} />
          </React.Suspense>
        ) : topic.sections ? (
          <main className="technicalDoc">
            <header className="articleHeader">
              <span className="eyebrow">{tr("DOCUMENTATION", "文档")}</span>
              <h1>{tr(topic.title.en, topic.title.zh)}</h1>
              <p>{tr(topic.description.en, topic.description.zh)}</p>
            </header>
            {topic.slug === "architecture" && <SystemOverview guideLink={false} />}
            <article className="technicalArticle">
              {topic.sections.map((section, index) => (
                <section key={index}>
                  <h2>{tr(section.heading.en, section.heading.zh)}</h2>
                  <p>{tr(section.text.en, section.text.zh)}</p>
                </section>
              ))}
            </article>
          </main>
        ) : (
          <Documentation
            sectionIds={topic.legacyIds}
            title={tr(topic.title.en, topic.title.zh)}
            description={tr(topic.description.en, topic.description.zh)}
          />
        )}
        {topic.links && (
          <nav
            className="docsPortalRelated"
            aria-label={tr("Related guides", "相关指南")}
          >
            {topic.links.map(([url, en, zh]) => (
              <a key={url} href={href(url!)}>
                {tr(en!, zh!)} ↗
              </a>
            ))}
          </nav>
        )}
        <footer className="docsPortalFooter">
          <a href={href("/docs")}>← {tr("Documentation", "文档")}</a>
          <a
            href={href(
              "/docs/" +
                DOC_TOPICS[(DOC_TOPICS.indexOf(topic) + 1) % DOC_TOPICS.length]!
                  .slug,
            )}
          >
            {tr("Next guide", "下一篇指南")} →
          </a>
        </footer>
      </div>
    </div>
  );
}
