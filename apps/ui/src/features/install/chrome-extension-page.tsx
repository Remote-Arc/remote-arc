import React from "react";
import { useI18n } from "../../hooks/use-i18n.js";
import { BrowserModes } from "../docs/browser-modes.js";
import companionManifest from "../../../../browser-extension/manifest.json" with { type: "json" };
import "../../styles/install/chrome-extension-page.css";

const downloadUrl =
  "/downloads/remote-arc-browser.zip?v=" + encodeURIComponent(companionManifest.version);

export function ChromeExtensionPage() {
  const { tr } = useI18n();

  return (
    <main className="chromeExtensionPage">
      <BrowserModes primary />
      {/* The download card is the FIRST content on this page, not a hash target. */}
      <section className="chromeDownloadHero" aria-labelledby="chrome-download-title">
        <div className="chromeDownloadCopy">
          <span className="eyebrow">{tr("install.chromeExtensionPage.chromeExtensionBeta")}</span>
          <h2 id="chrome-download-title">
            {tr("install.chromeExtensionPage.downloadChromeCompanion")}
          </h2>
          <p>{tr("install.chromeExtensionPage.letYourAiWorkInYour")}</p>
          <div className="chromeDownloadCtas">
            <a className="primaryButton chromeDownloadPrimary" href={downloadUrl} download>
              {tr("install.chromeExtensionPage.downloadChromeCompanionZip")}{" "}
              <span aria-hidden="true">↓</span>
            </a>
            <span className="chromeDownloadVersion">
              {tr("install.chromeExtensionPage.version")} {companionManifest.version} ·{" "}
              {tr("install.chromeExtensionPage.chromeChromiumUnpackedBeta")}
            </span>
          </div>
          <p className="chromeDownloadWarning">
            {tr("install.chromeExtensionPage.thisBetaIsNotInstalledFrom")}
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

      <section className="chromeGuideSteps" aria-labelledby="chrome-steps-title">
        <div className="chromeGuideIntro">
          <span className="eyebrow">{tr("install.chromeExtensionPage.installation")}</span>
          <h2 id="chrome-steps-title">{tr("install.chromeExtensionPage.setItUpInChrome")}</h2>
          <p>{tr("install.chromeExtensionPage.browserSharingIsOptionalRemoteArc")}</p>
        </div>
        <ol className="chromeStepsGrid">
          <li>
            <span>01</span>
            <h3>{tr("install.chromeExtensionPage.downloadAndUnzip")}</h3>
            <p>{tr("install.chromeExtensionPage.useTheButtonAboveExtractThe")}</p>
          </li>
          <li>
            <span>02</span>
            <h3>{tr("install.chromeExtensionPage.openChromeExtensions")}</h3>
            <p>{tr("install.chromeExtensionPage.openChromeExtensionsInChromeTurn")}</p>
            <code>chrome://extensions</code>
          </li>
          <li>
            <span>03</span>
            <h3>{tr("install.chromeExtensionPage.loadUnpacked")}</h3>
            <p>{tr("install.chromeExtensionPage.clickLoadUnpackedThenSelectThe")}</p>
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
          <p>{tr("install.chromeExtensionPage.theWebsiteZipIsRebuiltFrom")}</p>
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
