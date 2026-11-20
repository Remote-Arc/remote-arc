import "../../styles/marketing/home/platform-intro.css";
import { useI18n } from "../../hooks/use-i18n.js";
import { localizedWebsiteHref } from "../../lib/marketing-paths.js";
import { ProductIcon as Icon } from "../../components/product-icon.js";
import { SectionTitle } from "./home/section-title.js";

const P = "marketing.productPositioning.";
const APP_ICONS = ["github", "slack", "gmail", "whatsapp", "googledrive", "linear", "jira"];
const FLEET = [
  { os: "macos", name: "macOS" },
  { os: "linux", name: "Linux", picked: true },
  { os: "windows", name: "Windows" },
];

/** Connected Apps, shown as the brand tiles the hero uses. */
function AppsVisual({ more }: { more: string }) {
  return (
    <div className="pillarApps">
      {APP_ICONS.map((id) => (
        <span key={id}>
          <img src={"/app-brands/" + id + ".svg"} alt="" width="22" height="22" loading="lazy" />
        </span>
      ))}
      <span className="pillarAppsMore">{more}</span>
    </div>
  );
}

/** Three computers; the one that fits the task is picked. */
function FleetVisual({ bestFit }: { bestFit: string }) {
  return (
    <ul className="pillarFleet">
      {FLEET.map((device) => (
        <li key={device.os} data-picked={device.picked || undefined}>
          <img
            src={"/platform-brands/" + device.os + ".svg"}
            alt=""
            width="16"
            height="16"
            loading="lazy"
          />
          <span>{device.name}</span>
          <i aria-hidden="true" />
          {device.picked && <em>{bestFit}</em>}
        </li>
      ))}
    </ul>
  );
}

/** A routine's recent runs and its next one. */
function RoutineVisual({ schedule, next }: { schedule: string; next: string }) {
  return (
    <div className="pillarRoutine">
      <span className="pillarRoutineSchedule">
        <Icon name="routine" size={14} />
        {schedule}
      </span>
      <ol>
        {[0, 1, 2, 3].map((run) => (
          <li key={run} data-done="">
            <Icon name="check" size={12} />
          </li>
        ))}
        <li data-next="" />
      </ol>
      <span className="pillarRoutineNext">{next}</span>
    </div>
  );
}

/** The home page's platform section: one line on what Remote Arc is, then its three
 * parts, each with a small picture of it working. */
export function ProductFocus() {
  const { tr, locale } = useI18n();
  const pillars = [
    {
      label: tr(`${P}yourApps`),
      title: tr(`${P}bringYourToolsTogether`),
      text: tr(`${P}workAcrossGithubSlackGmailWhatsapp`),
      href: "/integrations",
      action: tr(`${P}exploreApps`),
      visual: <AppsVisual more={tr(`${P}appsMore`)} />,
    },
    {
      label: tr(`${P}intelligentFleet`),
      title: tr(`${P}theRightComputerForTheJob`),
      text: tr(`${P}matchToolsOperatingSystemsTrustedWorkspaces`),
      href: "/docs/device-fleet",
      action: tr(`${P}exploreYourFleet`),
      visual: <FleetVisual bestFit={tr(`${P}bestFit`)} />,
    },
    {
      label: tr(`${P}tasksRoutines`),
      title: tr(`${P}oneRequestWorkThatFollowsThrough`),
      text: tr(`${P}delegateATaskOrSetUp`),
      href: "/arc",
      action: tr(`${P}meetArc`),
      visual: <RoutineVisual schedule={tr(`${P}routineSchedule`)} next={tr(`${P}routineNext`)} />,
    },
  ];
  return (
    <section className="homePlatformIntro" aria-labelledby="home-platform-heading">
      <header className="homePlatformHeader">
        <div>
          <span className="eyebrow">{tr(`${P}theRemoteArcPlatform`)}</span>
          <SectionTitle
            id="home-platform-heading"
            text={tr(`${P}agentInfrastructureForRealWorkAcross`)}
          />
        </div>
        <div className="homePlatformAside">
          <p>{tr(`${P}lead`)}</p>
          <a href={localizedWebsiteHref("/docs/architecture", locale)}>
            {tr(`${P}howThePlatformWorks`)}
            <Icon name="arrowUpRight" size={15} />
          </a>
        </div>
      </header>
      <div className="platformPillars">
        {pillars.map((pillar) => (
          <a
            key={pillar.href}
            className="platformPillar"
            href={localizedWebsiteHref(pillar.href, locale)}
          >
            <div className="platformPillarVisual" aria-hidden="true">
              {pillar.visual}
            </div>
            <span className="platformPillarLabel">{pillar.label}</span>
            <h3>{pillar.title}</h3>
            <p>{pillar.text}</p>
            <span className="platformPillarAction">
              {pillar.action}
              <Icon name="arrowUpRight" size={15} />
            </span>
          </a>
        ))}
      </div>
    </section>
  );
}
