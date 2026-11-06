import { usePlatformCatalog } from "../../../hooks/use-platform-catalog.js";
import { useI18n } from "../../../hooks/use-i18n.js";
import { HomeConnectionScene } from "../home/home-connection-scene.js";
import "../../../styles/marketing/pricing.css";
export function ArcReadyPage({
  startHref = "https://agent.remotearc.app/dashboard/agent/chat",
}: {
  startHref?: string;
}) {
  const { tr } = useI18n(),
    catalog = usePlatformCatalog();
  return (
    <main className="pricingContent">
      <header className="pricingIntro">
        <span className="eyebrow">ARC / YOUR PERSONAL AGENT</span>
        <h1>{tr("marketing.arc.arcReadyPage.oneConversationYourAppsYourComputers")}</h1>
        <p>{tr("marketing.arc.arcReadyPage.tellArcWhatYouNeedIt")}</p>
        <a className="primaryButton" href={startHref}>
          {tr("marketing.arc.arcReadyPage.startYourFreeTrial")} ↗
        </a>
        <p>
          {catalog
            ? `${catalog.trial.days} ${tr("marketing.arc.arcReadyPage.days")} · ${catalog.trial.credits} Credits. `
            : ""}
          {tr("marketing.arc.arcReadyPage.noCardOrModelApiKey")}
        </p>
      </header>
      <HomeConnectionScene clients={[]} arcAvailable initialMode="arc" />
      <section className="pricingMetering">
        <h2>{tr("marketing.arc.arcReadyPage.giveArcAGoal")}</h2>
        <div className="meteringGrid">
          {(
            [
              [
                "marketing.arc.arcReadyPage.prepareMyMorningBrief",
                "marketing.arc.arcReadyPage.summarizeGmailGoogleCalendarAnd",
              ],
              [
                "marketing.arc.arcReadyPage.shipARelease",
                "marketing.arc.arcReadyPage.reviewGithubChangesCheckThe",
              ],
              [
                "marketing.arc.arcReadyPage.makeItARoutine",
                "marketing.arc.arcReadyPage.describeTheOutcomeAndSchedule",
              ],
            ] as const
          ).map(([title, body]) => (
            <article key={title}>
              <h3>{tr(title)}</h3>
              <p>{tr(body)}</p>
            </article>
          ))}
        </div>
        <p>{tr("marketing.arc.arcReadyPage.deviceWorkNeedsTheSelectedComputer")}</p>
        <a className="pricingUsageLink" href="/pricing">
          {tr("marketing.arc.arcReadyPage.comparePlans")} →
        </a>
      </section>
    </main>
  );
}
