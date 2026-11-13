import { useI18n } from "../../../hooks/use-i18n.js";
import { localizedWebsiteHref } from "../../../lib/marketing-paths.js";
import "../../../styles/marketing/arc/arc-future.css";
import { ArcCapabilities } from "./arc-capabilities.js";
import { ArcExecutionScene } from "./arc-workspace-scene.js";
import { ArcWhy } from "./arc-why.js";
import "../../../styles/marketing/arc/arc-why.css";
import { SlackAgentPreview } from "./arc-connected-previews.js";
import { ProductIcon as Icon } from "../../../components/product-icon.js";

// Marketing demonstrations use example data; CTAs open the real workspace.
const connectWorkspaceHref = "https://agent.remotearc.app/dashboard/connect/overview";

function ArcMark({ subtle = false }: { subtle?: boolean }) {
  return (
    <span className={"arcV3Mark" + (subtle ? " arcV3Mark--small" : "")} aria-hidden="true">
      <img className="arcV3BrandImage" src="/remote-arc.svg" alt="" width="106" height="106" />
    </span>
  );
}

function ArcStatus({ children }: { children: React.ReactNode }) {
  return (
    <span className="arcV3Status">
      <i aria-hidden="true" />
      {children}
    </span>
  );
}

export function ArcTeaser() {
  const { tr, locale } = useI18n();
  const slackBotHref =
    (import.meta.env?.VITE_UI_PREVIEW === "1" ? "" : "https://agent.remotearc.app") +
    "/dashboard/connect/apps?provider=slack&lang=" +
    locale;
  return (
    <section className="arcProductTeaser" aria-labelledby="arcV3TeaserHeading">
      <div className="arcProductTeaserCopy">
        <span className="marketingLabel">
          {tr("marketing.arc.arcFuture.theNextChapterArc")}
          <i>{tr("marketing.arc.arcFuture.availableNow")}</i>
        </span>
        <h2 id="arcV3TeaserHeading">{tr("marketing.arc.arcFuture.yourNextPersonalAgent")}</h2>
        <p>{tr("marketing.arc.arcFuture.aFamiliarConversationAWholeFleet")}</p>
        <ul>
          <li>
            <Icon name="chat" />
            {tr("marketing.arc.arcFuture.talkNaturallyGetWorkDone")}
          </li>
          <li>
            <Icon name="device" />
            {tr("marketing.arc.arcFuture.coordinateAppsAndYourOwnFleet")}
          </li>
          <li>
            <Icon name="routine" />
            {tr("marketing.arc.arcFuture.oneOffTasksEverydayRoutines")}
          </li>
        </ul>
        <div className="arcProductTeaserActions">
          <a className="marketingSecondary" href={localizedWebsiteHref("/arc", locale)}>
            {tr("marketing.arc.arcFuture.meetArc")}
            <Icon name="arrowUpRight" size={16} />
          </a>
          <a className="marketingSecondary" href={slackBotHref}>
            <img src="/app-brands/slack.svg" alt="" width="16" height="16" />
            {tr("marketing.arc.arcFuture.useInSlack")}
            <Icon name="arrowUpRight" size={16} />
          </a>
        </div>
        <small>{tr("marketing.arc.arcFuture.arcAndConnectShareYourConnections")}</small>
      </div>
      <SlackAgentPreview />
    </section>
  );
}

export function ArcComingSoonPageContent({
  available = false,
  startHref = connectWorkspaceHref,
}: {
  available?: boolean;
  startHref?: string;
}) {
  const { tr, locale } = useI18n();
  return (
    <main className="arcV3">
      <section className="arcV3Hero" aria-labelledby="arcV3HeroTitle">
        <div className="arcV3HeroGlow" aria-hidden="true" />
        <div className="arcV3HeroEyebrow">
          <ArcStatus>
            {available
              ? tr("marketing.arc.arcFuture.arcPersonalAgent")
              : tr("marketing.arc.arcFuture.arcCheckAvailability")}
          </ArcStatus>
        </div>
        <h1 id="arcV3HeroTitle">
          {tr("marketing.arc.arcFuture.yourAppsYourComputersOnePersonal")}
        </h1>
        <p>{tr("marketing.arc.arcFuture.weBuiltArcWithRemoteArc")}</p>
        <div className="arcV3HeroActions">
          <a className="arcV3Primary" href={available ? startHref : connectWorkspaceHref}>
            {available
              ? tr("marketing.arc.arcFuture.openArc")
              : tr("marketing.arc.arcFuture.useConnectNow")}{" "}
            <span>↗</span>
          </a>
          <a className="arcV3Secondary" href="#why-arc">
            {tr("marketing.arc.arcFuture.whyUseArc")} <span>↓</span>
          </a>
          <a className="arcV3Secondary" href={localizedWebsiteHref("/roadmap", locale)}>
            {tr("marketing.arc.arcFuture.seeWhatSNext")} <span>→</span>
          </a>
        </div>
        <div className="arcV3HeroCue">
          <span />
          {tr("marketing.arc.arcFuture.oneWorkspaceForYourWork")}
        </div>
        <ArcExecutionScene />
        <p className="arcV3Disclaimer">
          {available
            ? tr("marketing.arc.arcFuture.illustrativeProductDemoOpenArcTo")
            : tr("marketing.arc.arcFuture.illustrativeDemoCheckYourWorkspaceFor")}
        </p>
      </section>

      <ArcWhy
        tr={tr}
        connectHref={localizedWebsiteHref("/connect-ai", locale)}
        arcHref={available ? startHref : connectWorkspaceHref}
      />

      <ArcCapabilities />
      <section className="arcV3Final">
        <ArcMark subtle />
        <span className="arcV3Eyebrow">{tr("marketing.arc.arcFuture.thisIsJustTheBeginning")}</span>
        <h2>{tr("marketing.arc.arcFuture.yourWorkALittleMoreHandled")}</h2>
        <p>{tr("marketing.arc.arcFuture.tellUsWhatYouDDelegate")}</p>
        <div className="arcV3HeroActions">
          <a href={available ? startHref : connectWorkspaceHref} className="arcV3Primary">
            {available
              ? tr("marketing.arc.arcFuture.openArc")
              : tr("marketing.arc.arcFuture.useConnectNow")}{" "}
            ↗
          </a>
          <a href={localizedWebsiteHref("/roadmap", locale)} className="arcV3Secondary">
            {tr("marketing.arc.arcFuture.exploreTheRoadmap")} →
          </a>
        </div>
      </section>
    </main>
  );
}
