import { aiClients } from "../../../components/public-layout.js";
import { InstallCommands } from "../../../components/install-commands.js";
import { ProductIcon } from "../../../components/product-icon.js";
import { CHROME_WEB_STORE_URL, dashboardHref } from "../../../config/app-config.js";
import { usePointerSpotlight } from "../../../hooks/marketing/use-pointer-spotlight.js";
import { useScrollReveal } from "../../../hooks/marketing/use-scroll-reveal.js";
import { useI18n } from "../../../hooks/use-i18n.js";
import { ProductFocus } from "../product-positioning.js";
import { AppLogoMarquee } from "./app-logo-marquee.js";
import { HomeDocs } from "./home-docs.js";
import { HomeHero } from "./home-hero.js";
import { LandingContent } from "./landing-content.js";
import { HomePricing } from "./home-pricing.js";
import { RequestVolume } from "./request-volume.js";
import { SectionTitle } from "./section-title.js";
import "../../../styles/marketing/home/home-layout.css";
import "../../../styles/marketing/home/home-motion.css";
import "../../../styles/marketing/home/home-design.css";

const CONNECT_HREF = "/dashboard/connect/overview";

// Section intros fade up on their own, grids and the trust row reveal their
// children one after another, and product stages follow the scroll.
const REVEAL = {
  items: [
    ".modernSectionIntro",
    ".homePlatformHeader",
    ".agentConnectedToolbar",
    ".faqContent",
    ".homeClosing > *",
  ].join(", "),
  groups: [".homeProof .trustRail", ".platformPillars", ".homePricingPlans", ".homeDocsGrid"].join(
    ", ",
  ),
  stages: [".homeUseCasesStage", ".agentConnectedPanel", ".arcProductTeaser"].join(", "),
};
// Cards that carry a pointer-following light.
const SPOTLIGHT = [
  ".platformPillar",
  ".homePricingPlan",
  ".homeDocsCard",
  ".homeProof .trustRail > a",
].join(", ");

/** The public home page: hero, proof, product sections and one closing call to action. */
export function HomePage() {
  const { tr } = useI18n();
  const revealRef = useScrollReveal<HTMLDivElement>(REVEAL);
  usePointerSpotlight(revealRef, SPOTLIGHT);
  return (
    <div className="homePage" ref={revealRef}>
      <HomeHero connectHref={dashboardHref(CONNECT_HREF)} />

      <div className="homeProof">
        <section
          className="trustRail"
          aria-label={tr("marketing.marketingPages.supportedAiClients")}
        >
          <span>{tr("marketing.marketingPages.worksWithTheAiYouUse")}</span>
          {aiClients.map((client) => (
            <a href={"/install/" + client.slug} key={client.name}>
              <img
                className={client.tone === "mono" ? "monoLogo" : "colorLogo"}
                src={client.icon}
                alt=""
              />
              <strong>{client.name}</strong>
            </a>
          ))}
          <a href={CHROME_WEB_STORE_URL} target="_blank" rel="noopener noreferrer">
            <img className="colorLogo" src="/platform-brands/browser.svg" alt="" />
            <strong>Chrome</strong>
          </a>
          <small>{tr("marketing.marketingPages.oneEndpointNoClientLockIn")}</small>
        </section>
        <AppLogoMarquee />
        <RequestVolume />
      </div>

      <HomePricing />
      <ProductFocus />
      <LandingContent />
      <HomeDocs />

      <section
        className="homeClosing"
        id="connect-your-computer"
        aria-labelledby="home-closing-heading"
      >
        <span className="eyebrow">REMOTE ARC CONNECT</span>
        <SectionTitle
          id="home-closing-heading"
          text={tr("marketing.marketingPages.keepYourAiConnectYourComputer")}
        />
        <p>{tr("marketing.marketingPages.useChatgptClaudeOrAnotherCompatible")}</p>
        <div className="homeClosingActions">
          <a className="primaryButton marketingPrimary" href={dashboardHref(CONNECT_HREF)}>
            {tr("marketing.home.landingContent.connectYourAi")}
            <ProductIcon name="arrowUpRight" size={16} />
          </a>
          <a className="marketingSecondary" href="/connect-ai">
            {tr("marketing.marketingPages.connectSetupGuide")}
            <ProductIcon name="arrowUpRight" size={15} />
          </a>
        </div>
        <InstallCommands />
      </section>
    </div>
  );
}
