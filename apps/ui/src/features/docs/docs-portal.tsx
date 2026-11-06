import toolIndex from "../../../../../packages/docs/src/tool-index.generated.json" with { type: "json" };
import { TOOL_COPY } from "../../../../../packages/docs/src/tool-reference-meta.js";
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
import { DOC_TOPICS, docTopic } from "../../../../../packages/docs/src/catalog.js";
import { Documentation } from "./product-docs.js";
import { SystemOverview } from "./docs-system-overview.js";
import { localizedWebsiteHref } from "../../lib/marketing-paths.js";
import { useI18n } from "../../hooks/use-i18n.js";
import "../../styles/docs/docs-portal.css";
const groups = [
  { id: "start", label: "docs.docsPortal.group.start" },
  { id: "work", label: "docs.docsPortal.group.work" },
  { id: "understand", label: "docs.docsPortal.group.understand" },
  { id: "reference", label: "docs.docsPortal.group.reference" },
] as const;
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
      [tool.name, tool.title, TOOL_COPY[tool.name]?.zh, TOOL_COPY[tool.name]?.summary]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(toolQuery),
    );
  const appMatch =
    toolQuery &&
    toolIndex.apps.some((app) =>
      [app.name, app.provider, ...app.operations].join(" ").toLowerCase().includes(toolQuery),
    );
  const localMatch = toolQuery && toolIndex.local.some((tool) => tool.name.includes(toolQuery));
  const topicHref = (slug: string) =>
    href("/docs/" + slug) +
    (slug === "tools" && toolQuery
      ? "?type=" +
        (remoteMatch ? "remote" : appMatch ? "apps" : localMatch ? "local" : "remote") +
        "&q=" +
        encodeURIComponent(query.trim())
      : "");
  const filtered = DOC_TOPICS.filter(
    (item) =>
      (item.title.en + " " + item.title.zh + " " + item.description.en + " " + item.description.zh)
        .toLowerCase()
        .includes(toolQuery) ||
      (item.slug === "tools" && (remoteMatch || appMatch || localMatch)),
  );
  if (path === "/docs")
    return (
      <main className="docsHub">
        <header>
          <span className="eyebrow">REMOTE ARC / DOCUMENTATION</span>
          <h1>{tr("docs.docsPortal.fromYourFirstConnectionToReal")}</h1>
          <p>{tr("docs.docsPortal.startWithArcOrConnectThen")}</p>
        </header>
        <div className="docsHubStart">
          <div>
            <span>{tr("docs.docsPortal.startHere")}</span>
            <h2>{tr("docs.docsPortal.yourGoalOneConnectedWorkspace")}</h2>
            <p>{tr("docs.docsPortal.useHostedArcOrBringYour")}</p>
          </div>
          <a className="primaryButton" href={href("/docs/start-here")}>
            {tr("docs.docsPortal.startWithAGoal")} →
          </a>
        </div>
        <SystemOverview />
        <a className="docsHubToolsLink" href={href("/docs/tools")}>
          {tr("docs.docsPortal.lookingForAToolBrowseThe")} →
        </a>
        <label className="docsHubSearch">
          {tr("docs.docsPortal.findAGuide")}
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={tr("docs.docsPortal.searchDocumentation")}
          />
        </label>
        {groups.map((group) => {
          const items = filtered.filter((item) => item.group === group.id && item.listed !== false);
          return items.length ? (
            <section className="docsHubGroup" key={group.id}>
              <h2>{tr(group.label)}</h2>
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
        {!filtered.length && <p role="status">{tr("docs.docsPortal.noGuidesMatchYourSearch")}</p>}
        <nav className="docsHubReference" aria-label={tr("docs.docsPortal.moreReferences")}>
          <a href={href("/docs/mcp")}>{tr("docs.docsPortal.mcpReference")} ↗</a>
          <a href={href("/docs/tools")}>{tr("docs.docsPortal.allTools")} ↗</a>
          <a href={href("/docs/long-running-work")}>{tr("docs.docsPortal.longRunningWork")} ↗</a>
          <a href={href("/connect-ai")}>{tr("docs.docsPortal.installationGuides")} ↗</a>
        </nav>
      </main>
    );
  if (!topic)
    return (
      <main className="technicalDoc">
        <h1>{tr("docs.docsPortal.guideNotFound")}</h1>
        <a href={href("/docs")}>{tr("docs.docsPortal.allDocumentation")} →</a>
      </main>
    );
  return (
    <div className="docsPortal">
      <aside>
        <a className="docsPortalHome" href={href("/docs")}>
          ← {tr("docs.docsPortal.allDocumentation")}
        </a>
        <button
          type="button"
          className="docsPortalToggle"
          aria-expanded={navOpen}
          aria-controls="docsTopicNavigation"
          onClick={() => setNavOpen((value) => !value)}
        >
          {tr("docs.docsPortal.browseTopics")} <span aria-hidden="true">{navOpen ? "−" : "+"}</span>
        </button>
        <nav
          id="docsTopicNavigation"
          className="docsPortalTopicNav"
          data-expanded={navOpen}
          aria-label={tr("docs.docsPortal.documentationTopics")}
        >
          {groups.map((group) => (
            <div key={group.id}>
              <strong>{tr(group.label)}</strong>
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
                <p>{tr("docs.docsPortal.loadingTools")}</p>
              </main>
            }
          >
            <ToolReference />
          </React.Suspense>
        ) : topic.reference ? (
          <React.Suspense
            fallback={
              <main className="technicalDoc">
                <p>{tr("docs.docsPortal.loadingDocument")}</p>
              </main>
            }
          >
            <ReferenceDoc topic={topic} />
          </React.Suspense>
        ) : topic.sections ? (
          <main className="technicalDoc">
            <header className="articleHeader">
              <span className="eyebrow">{tr("docs.docsPortal.documentation")}</span>
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
          <nav className="docsPortalRelated" aria-label={tr("docs.docsPortal.relatedGuides")}>
            {topic.links.map(([url, en, zh]) => (
              <a key={url} href={href(url!)}>
                {tr(en!, zh!)} ↗
              </a>
            ))}
          </nav>
        )}
        <footer className="docsPortalFooter">
          <a href={href("/docs")}>← {tr("docs.docsPortal.documentation2")}</a>
          <a
            href={href(
              "/docs/" + DOC_TOPICS[(DOC_TOPICS.indexOf(topic) + 1) % DOC_TOPICS.length]!.slug,
            )}
          >
            {tr("docs.docsPortal.nextGuide")} →
          </a>
        </footer>
      </div>
    </div>
  );
}
