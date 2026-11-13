import { useI18n } from "../../hooks/use-i18n.js";
import { localizedWebsiteHref } from "../../lib/marketing-paths.js";
import { ProductIcon as Icon } from "../../components/product-icon.js";
export function ProductFocus() {
  const { tr, locale } = useI18n();
  const items = [
    {
      number: "01",
      icon: "apps" as const,
      label: tr("marketing.productPositioning.yourApps"),
      title: tr("marketing.productPositioning.bringYourToolsTogether"),
      text: tr("marketing.productPositioning.workAcrossGithubSlackGmailNotion"),
      href: "/integrations",
      action: tr("marketing.productPositioning.exploreApps"),
    },
    {
      number: "02",
      icon: "device" as const,
      label: tr("marketing.productPositioning.intelligentFleet"),
      title: tr("marketing.productPositioning.theRightComputerForTheJob"),
      text: tr("marketing.productPositioning.matchToolsOperatingSystemsTrustedWorkspaces"),
      href: "/docs/device-fleet",
      action: tr("marketing.productPositioning.exploreYourFleet"),
    },
    {
      number: "03",
      icon: "routine" as const,
      label: tr("marketing.productPositioning.tasksRoutines"),
      title: tr("marketing.productPositioning.oneRequestWorkThatFollowsThrough"),
      text: tr("marketing.productPositioning.delegateATaskOrSetUp"),
      href: "/arc",
      action: tr("marketing.productPositioning.meetArc"),
    },
  ];
  return (
    <section className="homePlatformIntro" aria-labelledby="home-platform-heading">
      <header className="homePlatformHeader">
        <div>
          <span className="eyebrow">{tr("marketing.productPositioning.theRemoteArcPlatform")}</span>
          <h2 id="home-platform-heading">
            {tr("marketing.productPositioning.agentInfrastructureForRealWorkAcross")}
          </h2>
        </div>
        <div className="homePlatformSummary">
          <p>
            <strong>Arc</strong>
            {tr("marketing.productPositioning.isYourHostedAiAgentWritten")}
          </p>
          <p>
            <strong>Connect</strong>
            {tr("marketing.productPositioning.bringsTheSameAuthorizedAppsAnd")}
          </p>
          <p>{tr("marketing.productPositioning.remoteArcManagesContextPermissionsSaved")}</p>
          <p>{tr("marketing.productPositioning.remoteArcIsInfrastructureThatTurns")}</p>
          <a href={localizedWebsiteHref("/docs/architecture", locale)}>
            {tr("marketing.productPositioning.howThePlatformWorks")}
            <Icon name="arrowUpRight" size={15} />
          </a>
        </div>
      </header>
      <div className="productFocus">
        {items.map((item) => (
          <article key={item.number}>
            <div className="productFocusTop">
              <span>
                {item.number} / {item.label}
              </span>
              <Icon name={item.icon} size={19} />
            </div>
            <h3>{item.title}</h3>
            <p>{item.text}</p>
            <a href={item.href}>
              {item.action}
              <Icon name="arrowUpRight" size={15} />
            </a>
          </article>
        ))}
      </div>
    </section>
  );
}
