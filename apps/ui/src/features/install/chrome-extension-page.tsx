import React from "react";
import { useI18n } from "../../hooks/use-i18n.js";
import { BrowserModes } from "../docs/browser-modes.js";
import companionManifest from "../../../../browser-extension/manifest.json" with { type: "json" };
import { CHROME_WEB_STORE_URL } from "../../config/app-config.js";
import "../../styles/install/chrome-extension-page.css";

export function ChromeExtensionPage() {
  const { tr } = useI18n();

  return (
    <main className="chromeExtensionPage">
      {/* The install card is the FIRST content on this page, not a hash target. */}
      <section className="chromeDownloadHero" aria-labelledby="chrome-page-title">
        <div className="chromeDownloadCopy">
          <span className="eyebrow">{tr("install.chromeExtensionPage.chromeExtension")}</span>
          <h1 id="chrome-page-title">{tr("install.chromeExtensionPage.browserPageTitle")}</h1>
          <p>{tr("install.chromeExtensionPage.browserPageLede")}</p>
          <div className="chromeDownloadCtas">
            <a
              className="primaryButton chromeDownloadPrimary"
              href={CHROME_WEB_STORE_URL}
              target="_blank"
              rel="noreferrer"
            >
              {tr("install.chromeExtensionPage.installFromChromeWebStore")}{" "}
              <span aria-hidden="true">↗</span>
            </a>
            <a className="chromeDownloadSteps" href="#chrome-steps-title">
              {tr("install.chromeExtensionPage.howToInstall")} ↓
            </a>
          </div>
          <p className="chromeDownloadVersion">
            {tr("install.chromeExtensionPage.version")} {companionManifest.version} ·{" "}
            {tr("install.chromeExtensionPage.chromeWebStoreUpdatesAutomatically")}
          </p>
          <p className="chromeDownloadNote">
            {tr("install.chromeExtensionPage.installedTheZipBefore")}
          </p>
        </div>
        <div
          className="chromeDownloadGraphic"
          aria-label={tr("install.chromeExtensionPage.browserTabPermissionsOverview")}
        >
          <div className="chromeGraphicTop">
            <span className="chromeGraphicDots" aria-hidden="true">
              ● ● ●
            </span>
            <span>Chrome Companion</span>
            <strong>{tr("install.chromeExtensionPage.youDecide")}</strong>
          </div>
          <div className="chromeGraphicContent">
            <div className="chromeGraphicTab">
              <span aria-hidden="true">◉</span>
              <div>
                <strong>{tr("install.chromeExtensionPage.aSiteYouAllowed")}</strong>
                <small>{tr("install.chromeExtensionPage.yourAiOpensTabsHereIn")}</small>
              </div>
              <span className="chromeGraphicOn">{tr("install.chromeExtensionPage.shared")}</span>
            </div>
            <div className="chromeGraphicPermission">
              <span className="chromePermissionDot" />
              {tr("install.chromeExtensionPage.readClickAndFill")}
              <strong>{tr("install.chromeExtensionPage.onThisSite")}</strong>
            </div>
            <div className="chromeGraphicPermission">
              <span className="chromePermissionDot muted" />
              {tr("install.chromeExtensionPage.otherSitesAndTabs")}
              <strong>{tr("install.chromeExtensionPage.notVisible")}</strong>
            </div>
            <p>{tr("install.chromeExtensionPage.ordersPostsAndSubmissionsAreSent")}</p>
          </div>
        </div>
      </section>

      <BrowserModes compact />

      <section className="chromeGuideSteps" aria-labelledby="chrome-steps-title">
        <div className="chromeGuideIntro">
          <span className="eyebrow">{tr("install.chromeExtensionPage.installation")}</span>
          <h2 id="chrome-steps-title">{tr("install.chromeExtensionPage.setItUpInChrome")}</h2>
          <p>{tr("install.chromeExtensionPage.browserSharingIsOptionalRemoteArc")}</p>
        </div>
        <ol className="chromeStepsGrid">
          <li>
            <span>01</span>
            <h3>{tr("install.chromeExtensionPage.openChromeWebStore")}</h3>
            <p>{tr("install.chromeExtensionPage.useTheButtonAboveToOpen")}</p>
          </li>
          <li>
            <span>02</span>
            <h3>{tr("install.chromeExtensionPage.addToChrome")}</h3>
            <p>{tr("install.chromeExtensionPage.clickAddToChromeThenAdd")}</p>
          </li>
          <li>
            <span>03</span>
            <h3>{tr("install.chromeExtensionPage.pinItToTheToolbar")}</h3>
            <p>{tr("install.chromeExtensionPage.clickTheExtensionsIconAndPin")}</p>
          </li>
          <li>
            <span>04</span>
            <h3>{tr("install.chromeExtensionPage.connectThenAllowSites")}</h3>
            <p>{tr("install.chromeExtensionPage.openTheExtensionClickConnectTo")}</p>
          </li>
        </ol>
      </section>

      <section className="chromeGuideDetails">
        <div>
          <h2>{tr("install.chromeExtensionPage.youControlSitesAndTabs")}</h2>
          <p>{tr("install.chromeExtensionPage.yourAiWorksOnlyOnSites")}</p>
        </div>
        <div>
          <h2>{tr("install.chromeExtensionPage.whatHappensWhenYouUpdate")}</h2>
          <p>{tr("install.chromeExtensionPage.chromeUpdatesWebStoreExtensions")}</p>
        </div>
      </section>
      <nav
        className="chromeGuideFooter"
        aria-label={tr("install.chromeExtensionPage.relatedDocumentation")}
      >
        <a href="/docs/mcp">{tr("install.chromeExtensionPage.remoteMcpReference")} ↗</a>
        <a href="/security-model">{tr("install.chromeExtensionPage.securityAndPermissions")} ↗</a>
        <a href="/connect-ai">{tr("install.chromeExtensionPage.connectYourAiClient")} ↗</a>
      </nav>
    </main>
  );
}
