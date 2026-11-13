import { useState } from "react";
import { useI18n } from "../../../hooks/use-i18n.js";
import { localizedWebsiteHref } from "../../../lib/marketing-paths.js";
import "../../../styles/marketing/arc/arc-roadmap.css";

const requestAccess = "/early-access?source=roadmap";

const phases = [
  {
    id: "00",
    name: "marketing.arc.arcRoadmap.phase00.name",
    status: "marketing.arc.arcRoadmap.phase00.status",
    subtitle: "marketing.arc.arcRoadmap.phase00.subtitle",
    description: "marketing.arc.arcRoadmap.phase00.description",
    bullets: [
      "marketing.arc.arcRoadmap.phase00.bullet1",
      "marketing.arc.arcRoadmap.phase00.bullet2",
      "marketing.arc.arcRoadmap.phase00.bullet3",
    ],
    state: "live",
  },
  {
    id: "01",
    name: "marketing.arc.arcRoadmap.phase01.name",
    status: "marketing.arc.arcRoadmap.phase01.status",
    subtitle: "marketing.arc.arcRoadmap.phase01.subtitle",
    description: "marketing.arc.arcRoadmap.phase01.description",
    bullets: [
      "marketing.arc.arcRoadmap.phase01.bullet1",
      "marketing.arc.arcRoadmap.phase01.bullet2",
      "marketing.arc.arcRoadmap.phase01.bullet3",
    ],
    state: "active",
  },
  {
    id: "02",
    name: "marketing.arc.arcRoadmap.phase02.name",
    status: "marketing.arc.arcRoadmap.phase02.status",
    subtitle: "marketing.arc.arcRoadmap.phase02.subtitle",
    description: "marketing.arc.arcRoadmap.phase02.description",
    bullets: [
      "marketing.arc.arcRoadmap.phase02.bullet1",
      "marketing.arc.arcRoadmap.phase02.bullet2",
      "marketing.arc.arcRoadmap.phase02.bullet3",
    ],
    state: "planned",
  },
  {
    id: "03",
    name: "marketing.arc.arcRoadmap.phase03.name",
    status: "marketing.arc.arcRoadmap.phase03.status",
    subtitle: "marketing.arc.arcRoadmap.phase03.subtitle",
    description: "marketing.arc.arcRoadmap.phase03.description",
    bullets: [
      "marketing.arc.arcRoadmap.phase03.bullet1",
      "marketing.arc.arcRoadmap.phase03.bullet2",
      "marketing.arc.arcRoadmap.phase03.bullet3",
    ],
    state: "planned",
  },
  {
    id: "04",
    name: "marketing.arc.arcRoadmap.phase04.name",
    status: "marketing.arc.arcRoadmap.phase04.status",
    subtitle: "marketing.arc.arcRoadmap.phase04.subtitle",
    description: "marketing.arc.arcRoadmap.phase04.description",
    bullets: [
      "marketing.arc.arcRoadmap.phase04.bullet1",
      "marketing.arc.arcRoadmap.phase04.bullet2",
      "marketing.arc.arcRoadmap.phase04.bullet3",
    ],
    state: "planned",
  },
] as const;

export function ArcRoadmapPageContent() {
  const { tr, locale } = useI18n();
  const [active, setActive] = useState(1);
  const selected = phases[active] ?? phases[1];
  return (
    <main className="arcTimeline">
      <header className="arcTimelineHero">
        <img className="arcTimelineLogo" src="/remote-arc.svg" alt="" width="56" height="56" />
        <div className="arcTimelineEyebrow">
          REMOTE ARC / {tr("marketing.arc.arcRoadmap.whatWeReBuilding")}
        </div>
        <h1>{tr("marketing.arc.arcRoadmap.whatSNextForRemoteArc")}</h1>
        <p>{tr("marketing.arc.arcRoadmap.fromConnectingYourToolsToA")}</p>
      </header>

      <section
        className="arcTimelineMain"
        aria-label={tr("marketing.arc.arcRoadmap.exploreOurProductDirection")}
      >
        <div className="arcTimelineTop">
          <span>{tr("marketing.arc.arcRoadmap.ourDirection")}</span>
          <span>
            {tr("marketing.arc.arcRoadmap.exploreTheVision")} <span aria-hidden="true">→</span>
          </span>
        </div>
        <div
          className="arcTimelineTabs"
          role="tablist"
          aria-label={tr("marketing.arc.arcRoadmap.remoteArcRoadmapPhases")}
        >
          {phases.map((phase, index) => (
            <button
              key={phase.id}
              id={"arc-timeline-tab-" + phase.id}
              role="tab"
              type="button"
              tabIndex={active === index ? 0 : -1}
              aria-controls="arc-timeline-panel"
              aria-selected={active === index}
              className={"arcTimelineTab" + (active === index ? " arcTimelineTab--selected" : "")}
              onClick={() => setActive(index)}
              onKeyDown={(event) => {
                if (
                  event.key === "ArrowRight" ||
                  event.key === "ArrowLeft" ||
                  event.key === "Home" ||
                  event.key === "End"
                ) {
                  event.preventDefault();
                  const next =
                    event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? phases.length - 1
                        : (active + (event.key === "ArrowRight" ? 1 : -1) + phases.length) %
                          phases.length;
                  setActive(next);
                  document.getElementById("arc-timeline-tab-" + phases[next]!.id)?.focus();
                }
              }}
            >
              <span className="arcTimelineTabHead">
                <i className={"arcTimelineDot arcTimelineDot--" + phase.state} aria-hidden="true" />
                <small>{phase.id}</small>
              </span>
              <span className="arcTimelineTabLabel">{tr(phase.name)}</span>
              <span className="arcTimelineTabStatus">{tr(phase.status)}</span>
            </button>
          ))}
        </div>

        <article
          className="arcTimelinePanel"
          id="arc-timeline-panel"
          role="tabpanel"
          aria-labelledby={"arc-timeline-tab-" + selected.id}
        >
          <div className="arcTimelinePanelGlow" aria-hidden="true" />
          <div className="arcTimelinePanelMeta">
            <span>
              {tr("marketing.arc.arcRoadmap.direction")} / {selected.id}
            </span>
            <span className={"arcTimelinePanelState arcTimelinePanelState--" + selected.state}>
              {tr(selected.status)}
            </span>
          </div>
          <h2>{tr(selected.name)}</h2>
          <p className="arcTimelinePanelSub">{tr(selected.subtitle)}</p>
          <p className="arcTimelinePanelDesc">{tr(selected.description)}</p>
          <div className="arcTimelineHighlights">
            {selected.bullets.map((item, index) => (
              <span key={item}>
                <i aria-hidden="true">{index + 1}</i>
                {tr(item)}
              </span>
            ))}
          </div>
          <div className="arcTimelinePanelBottom">
            <span>{tr("marketing.arc.arcRoadmap.longTermDirectionsAreExploratoryWithout")}</span>
            <a
              href={
                active === 0
                  ? localizedWebsiteHref("/connect-ai", locale)
                  : active === 1
                    ? "https://agent.remotearc.app/dashboard/agent/chat"
                    : localizedWebsiteHref(requestAccess, locale)
              }
            >
              {active === 0
                ? tr("marketing.arc.arcRoadmap.useConnectToday")
                : active === 1
                  ? tr("marketing.arc.arcRoadmap.openArc")
                  : tr("marketing.arc.arcRoadmap.expressInterest")}{" "}
              <span aria-hidden="true">↗</span>
            </a>
          </div>
        </article>
      </section>

      <footer className="arcTimelineFooter">
        <p>{tr("marketing.arc.arcRoadmap.followTheBuildShapeTheNext")}</p>
        <div>
          <a href={localizedWebsiteHref("/arc", locale)}>
            {tr("marketing.arc.arcRoadmap.meetArc")} ↗
          </a>
          <a href={localizedWebsiteHref("/feedback?source=roadmap", locale)}>
            {tr("marketing.arc.arcRoadmap.tellUsWhatToBuild")} ↗
          </a>
        </div>
        <small>{tr("marketing.arc.arcRoadmap.arcAndConnectAreAvailableNow")}</small>
      </footer>
    </main>
  );
}
