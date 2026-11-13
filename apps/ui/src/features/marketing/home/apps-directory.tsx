import type { MessageKey } from "../../../locales/locale-catalog.js";
import { CreativeDirectoryPreviews } from "./local-creative-demo.js";
import { useState } from "react";
import { useI18n } from "../../../hooks/use-i18n.js";
import { localizedWebsiteHref } from "../../../lib/marketing-paths.js";
import directory from "../../../data/app-directory.json" with { type: "json" };
import "../../../styles/marketing/home/apps-directory.css";
import "../../../styles/marketing/home/apps-directory-compact.css";

type SkillLink = { name: MessageKey; keywords: MessageKey; href: string };
type Showcase = {
  id: string;
  name: MessageKey;
  description: MessageKey;
  categories: string[];
  prompt: MessageKey;
  href: string;
  keywords: MessageKey;
  skills: SkillLink[];
};
const showcase: Showcase[] = [
  {
    id: "email_calendar",
    name: "marketing.home.appsDirectory.email_calendar.name",
    description: "marketing.home.appsDirectory.email_calendar.description",
    categories: ["email_calendar"],
    prompt: "marketing.home.appsDirectory.email_calendar.prompt",
    href: "/integrations?category=email_calendar",
    keywords: "marketing.home.appsDirectory.email_calendar.search",
    skills: [],
  },
  {
    id: "docs_files",
    name: "marketing.home.appsDirectory.docs_files.name",
    description: "marketing.home.appsDirectory.docs_files.description",
    categories: ["docs_files"],
    prompt: "marketing.home.appsDirectory.docs_files.prompt",
    href: "/use-cases/spreadsheet-report",
    keywords: "marketing.home.appsDirectory.docs_files.search",
    skills: [
      {
        name: "marketing.home.appsDirectory.skill.word",
        keywords: "marketing.home.appsDirectory.skillSearch.word",
        href: "/use-cases/word-documents",
      },
      {
        name: "marketing.home.appsDirectory.skill.excel",
        keywords: "marketing.home.appsDirectory.skillSearch.excel",
        href: "/use-cases/spreadsheet-report",
      },
      {
        name: "marketing.home.appsDirectory.skill.powerpoint",
        keywords: "marketing.home.appsDirectory.skillSearch.powerpoint",
        href: "/use-cases/presentation-deck",
      },
      {
        name: "marketing.home.appsDirectory.skill.pdf",
        keywords: "marketing.home.appsDirectory.skillSearch.pdf",
        href: "/use-cases/pdf-workflows",
      },
    ],
  },
  {
    id: "development",
    name: "marketing.home.appsDirectory.development.name",
    description: "marketing.home.appsDirectory.development.description",
    categories: ["development"],
    prompt: "marketing.home.appsDirectory.development.prompt",
    href: "/integrations?category=development",
    keywords: "marketing.home.appsDirectory.development.search",
    skills: [
      {
        name: "marketing.home.appsDirectory.skill.web-testing",
        keywords: "marketing.home.appsDirectory.skillSearch.web-testing",
        href: "/use-cases/webapp-testing",
      },
    ],
  },
  {
    id: "communication",
    name: "marketing.home.appsDirectory.communication.name",
    description: "marketing.home.appsDirectory.communication.description",
    categories: ["communication", "social", "marketing", "sales_commerce"],
    prompt: "marketing.home.appsDirectory.communication.prompt",
    href: "/integrations",
    keywords: "marketing.home.appsDirectory.communication.search",
    skills: [],
  },
  {
    id: "creative",
    name: "marketing.home.appsDirectory.creative.name",
    description: "marketing.home.appsDirectory.creative.description",
    categories: [],
    prompt: "marketing.home.appsDirectory.creative.prompt",
    href: "/use-cases/video-creation#video-gallery",
    keywords: "marketing.home.appsDirectory.creative.search",
    skills: [
      {
        name: "marketing.home.appsDirectory.skill.vibe-knowledge-film",
        keywords: "marketing.home.appsDirectory.skillSearch.vibe-knowledge-film",
        href: "/use-cases/video-creation",
      },
      {
        name: "marketing.home.appsDirectory.skill.subtitles",
        keywords: "marketing.home.appsDirectory.skillSearch.subtitles",
        href: "/use-cases/audio-transcription",
      },
    ],
  },
  {
    id: "research",
    name: "marketing.home.appsDirectory.research.name",
    description: "marketing.home.appsDirectory.research.description",
    categories: [],
    prompt: "marketing.home.appsDirectory.research.prompt",
    href: "/use-cases/research-reports",
    keywords: "marketing.home.appsDirectory.research.search",
    skills: [
      {
        name: "marketing.home.appsDirectory.skill.research-reports",
        keywords: "marketing.home.appsDirectory.skillSearch.research-reports",
        href: "/use-cases/research-reports",
      },
      {
        name: "marketing.home.appsDirectory.skill.nuwa",
        keywords: "marketing.home.appsDirectory.skillSearch.nuwa",
        href: "/use-cases/research-reports",
      },
    ],
  },
];

export function AppsDirectory({ id = "apps" }: { id?: string } = {}) {
  const { tr, locale } = useI18n(),
    [query, setQuery] = useState("");
  const nativeApps = directory.apps.filter((app) => app.category !== "creative");
  const search = query.trim().toLowerCase();
  const groups = showcase
    .map((group) => ({
      ...group,
      apps: nativeApps.filter((app) => group.categories.includes(app.category)),
    }))
    .filter(
      (group) =>
        !search ||
        [
          tr(group.keywords),
          ...group.skills.map((skill) => tr(skill.keywords)),
          ...group.apps.flatMap((app) => [app.name, app.provider]),
        ]
          .join(" ")
          .toLowerCase()
          .includes(search),
    );
  return (
    <section className="appsDirectory sectionBlock" id={id} aria-labelledby={id + "DirectoryTitle"}>
      <header className="modernSectionIntro">
        <span className="eyebrow">{tr("marketing.home.appsDirectory.appsBuiltInSkills")}</span>
        <h2 id={id + "DirectoryTitle"}>
          {tr("marketing.home.appsDirectory.yourAppsMoreWaysToGet")}
        </h2>
        <p>{tr("marketing.home.appsDirectory.bringConnectedAccountsLocalFilesAnd")}</p>
      </header>
      <div className="appsDirectoryToolbar">
        <span>
          <strong>{nativeApps.length}</strong>{" "}
          {tr("marketing.home.appsDirectory.appIntegrationsBuiltInSkills")}
        </span>
        <div className="appsDirectoryActions">
          <a href={localizedWebsiteHref("/integrations", locale)}>
            {tr("marketing.home.appsDirectory.allApps")} ↗
          </a>
          <label>
            <span className="srOnly">{tr("marketing.home.appsDirectory.searchAppsAndSkills")}</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={tr("marketing.home.appsDirectory.findAnAppOrSkill")}
            />
          </label>
        </div>
      </div>
      <div className="appsDirectoryGrid">
        {groups.map((group) => (
          <article className="appsDirectoryCard" key={group.id} data-category={group.id}>
            <header>
              <span className="appsDirectoryIndex">
                {String(showcase.findIndex((item) => item.id === group.id) + 1).padStart(2, "0")}
              </span>
              <h3>{tr(group.name)}</h3>
            </header>
            <p>{tr(group.description)}</p>
            <ul className="appsDirectoryExamples">
              <li>{tr(group.prompt)}</li>
            </ul>
            {!!group.apps.length && (
              <div className="appsDirectoryBrands">
                {group.apps.slice(0, 6).map((app) => (
                  <a
                    key={app.provider}
                    aria-label={app.name}
                    href={localizedWebsiteHref(
                      "/integrations?provider=" + encodeURIComponent(app.provider),
                      locale,
                    )}
                    title={app.name}
                  >
                    <span data-brand={app.brand}>
                      <img
                        src={"/app-brands/" + app.brand + ".svg"}
                        alt=""
                        loading="lazy"
                        width="20"
                        height="20"
                      />
                    </span>
                    <span className="appsDirectoryBrandName">{app.name}</span>
                  </a>
                ))}
                {group.apps.length > 6 && (
                  <a
                    className="appsDirectoryMore"
                    href={localizedWebsiteHref("/integrations", locale)}
                    aria-label={tr("marketing.home.appsDirectory.browseAllApplications")}
                  >
                    +{group.apps.length - 6}
                  </a>
                )}
              </div>
            )}
            {!!group.skills.length && (
              <div
                className="appsDirectorySkills"
                aria-label={tr("marketing.home.appsDirectory.builtInSkills")}
              >
                {group.skills.map((skill) => (
                  <a key={skill.name} href={localizedWebsiteHref(skill.href, locale)}>
                    {tr(skill.name)}
                  </a>
                ))}
              </div>
            )}
            {group.id === "creative" && <CreativeDirectoryPreviews />}
            <a className="appsDirectoryExplore" href={localizedWebsiteHref(group.href, locale)}>
              {group.skills.length
                ? tr("marketing.home.appsDirectory.exploreThisWorkflow")
                : tr("marketing.home.appsDirectory.exploreConnections")}
              <span aria-hidden="true">↗</span>
            </a>
          </article>
        ))}
      </div>
      {!groups.length && (
        <p role="status">{tr("marketing.home.appsDirectory.noAppsOrSkillsMatchYour")}</p>
      )}
      <p className="appsDirectoryFootnote">
        {tr("marketing.home.appsDirectory.appsUseTheAccountsAndPermissions")}
      </p>
    </section>
  );
}
