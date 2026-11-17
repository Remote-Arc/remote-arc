import { useRunMode } from "../../../hooks/marketing/use-run-mode.js";
import { getUseCaseSkillIds } from "../../../../../../packages/docs/src/skill-use-cases.js";
import "../../../styles/marketing/use-cases/use-case-catalog.css";
import { useEffect, useState } from "react";
import { caseTitle, cases } from "./use-case-entries.js";
import { PersonaUseCases } from "./persona-use-cases.js";
import { FEATURED_SLUGS, FeaturedUseCases } from "./featured-use-cases.js";
import "../../../styles/marketing/use-cases/use-case-page.css";
import { useI18n } from "../../../hooks/use-i18n.js";
import { localizedWebsiteHref } from "../../../lib/marketing-paths.js";
import { ARC_USE_CASES } from "../../../../../../packages/docs/src/arc-use-cases.js";
import "../../../styles/public-docs.css";

export { useCaseSlugs } from "../../../../../../packages/docs/src/arc-use-cases.js";
import type { UseCaseSlug } from "../../../../../../packages/docs/src/arc-use-cases.js";
export type { UseCaseSlug } from "../../../../../../packages/docs/src/arc-use-cases.js";

export function UseCaseCatalog() {
  const { tr, locale } = useI18n(),
    // Read only: the page no longer offers a switch, but links that ask for Arc keep it.
    [mode] = useRunMode(),
    [query, setQuery] = useState("");
  useEffect(() => {
    if (window.location.hash === "#video-gallery")
      window.location.replace(
        localizedWebsiteHref("/use-cases/video-creation#video-gallery", locale),
      );
  }, [locale]);
  const order = [
    "video-creation",
    "mathematical-animation",
    "blender-3d",
    "audio-transcription",
    "word-documents",
    "pdf-workflows",
    "presentation-deck",
    "spreadsheet-report",
    "image-studio",
    "website-building",
    "research-reports",
    "data-work",
    "data-visualization",
    "statistical-analysis",
    "machine-learning",
    "network-analysis",
    "ui-inspection",
    "webapp-testing",
    "mcp-integrations",
    "browser-workflows",
    "job-applications",
    "remote-development",
    "desktop-automation",
    "file-organization",
    "disk-space-cleanup",
    "scheduled-checks",
    "overnight-goals",
    "long-running-jobs",
    "ci-follow-up",
    "cross-device-handoff",
    "home-lab",
    "browser-research",
    "remote-support",
    "remote-rescue",
    "server-troubleshooting",
    "travel-access",
  ];
  const needle = query.trim().toLocaleLowerCase();
  const all = cases(tr).filter((item) => mode === "connect" || !item.connectOnly);
  const titleOf = (slug: string) => all.find((item) => item.slug === slug)?.title ?? slug;
  const hrefFor = (slug: string) =>
    localizedWebsiteHref(
      "/use-cases/" + slug + (mode === "arc" ? "?mode=arc" : "?mode=connect"),
      locale,
    );
  const titled = (item: (typeof all)[number]) =>
    mode === "arc"
      ? {
          ...item,
          title: caseTitle(item.slug, item.title, tr),
          intro: ARC_USE_CASES[item.slug as UseCaseSlug].intro[locale],
        }
      : item;
  const featured = FEATURED_SLUGS.flatMap((slug) => {
    const item = all.find((entry) => entry.slug === slug);
    return item ? [titled(item)] : [];
  });
  const items = all
    .filter(
      (item) =>
        !needle ||
        [item.title, item.intro, item.category, item.slug, ...getUseCaseSkillIds(item.slug)]
          .join(" ")
          .toLocaleLowerCase()
          .includes(needle),
    )
    .sort((a, b) => order.indexOf(a.slug) - order.indexOf(b.slug))
    .map(titled);
  return (
    <main className="useCasePage revisedUseCases">
      <PersonaUseCases titleOf={titleOf}>
        <header className="useCaseHero">
          <div className="useCaseHeroText">
            <span className="eyebrow">{tr("marketing.useCases.useCases.useCases")}</span>
            <h1 id="persona-title">
              {mode === "arc"
                ? tr("marketing.useCases.useCases.whatWouldYouLikeArcTo")
                : tr("marketing.useCases.useCases.whatWouldYouLikeYourAi")}
            </h1>
          </div>
          <div className="useCaseHeroAside">
            <p>{tr("marketing.useCases.personas.lead")}</p>
            <a className="useCaseHeroJump" href="#all-use-cases">
              {tr("marketing.useCases.page.browseAll", { count: all.length })} ↓
            </a>
          </div>
        </header>
      </PersonaUseCases>
      <FeaturedUseCases items={featured} hrefFor={hrefFor} />
      <section className="useCaseIndex" id="all-use-cases" aria-labelledby="all-use-cases-title">
        <header className="useCaseIndexHeader">
          <div className="useCaseSectionHeader">
            <span className="eyebrow">{tr("marketing.useCases.page.allEyebrow")}</span>
            <h2 id="all-use-cases-title">{tr("marketing.useCases.page.allTitle")}</h2>
          </div>
          <div className="useCaseBrowse">
            <label className="useCaseSearch">
              <svg aria-hidden="true" viewBox="0 0 24 24">
                <circle cx="10.5" cy="10.5" r="6.5" />
                <path d="m16 16 5 5" />
              </svg>
              <span className="srOnly">{tr("marketing.useCases.useCases.searchUseCases")}</span>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={tr("marketing.useCases.useCases.searchRecordingsVideoWordCharts")}
              />
            </label>
            <span className="useCaseResultCount" aria-live="polite">
              {items.length} {tr("marketing.useCases.useCases.useCases2")}
            </span>
          </div>
        </header>
        <div className="useCaseList" aria-label={tr("marketing.useCases.useCases.workflows")}>
          {items.map((item) => (
            <a className="useCaseRow" key={item.slug} href={hrefFor(item.slug)}>
              <img
                data-use-case-art={item.slug}
                src={"/use-case-art/" + item.slug + ".svg"}
                alt=""
                width="640"
                height="360"
                loading="lazy"
                decoding="async"
              />
              <span className="useCaseRowText">
                <span className="eyebrow">{item.category}</span>
                <strong>{item.title}</strong>
                <span className="useCaseRowIntro">{item.intro}</span>
              </span>
            </a>
          ))}
        </div>
        {items.length === 0 && (
          <div className="useCaseEmpty">
            <h3>{tr("marketing.useCases.useCases.tryAnotherTaskOrKeyword")}</h3>
            <p>{tr("marketing.useCases.useCases.searchAResultSuchAsA")}</p>
            <button type="button" onClick={() => setQuery("")}>
              {tr("marketing.useCases.useCases.showAllUseCases")}
            </button>
          </div>
        )}
      </section>
      <footer className="catalogFooter">
        <p>{tr("marketing.useCases.useCases.workRunsThroughTheToolsAnd")}</p>
        <a href={localizedWebsiteHref("/docs/skills", locale)}>
          {tr("marketing.useCases.useCases.exploreTheSkills")} →
        </a>
      </footer>
    </main>
  );
}
