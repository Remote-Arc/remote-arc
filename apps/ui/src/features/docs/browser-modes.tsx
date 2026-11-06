import React from "react";
import { useI18n } from "../../hooks/use-i18n.js";
import { localizedWebsiteHref } from "../../lib/marketing-paths.js";
import "../../styles/docs/browser-modes.css";

type Mode = {
  id: string;
  name: string;
  badge: string;
  fit: string;
  steps: string[];
  can: string[];
  limits: string[];
  href: string;
  cta: string;
};

export function BrowserModes({ primary = false }: { primary?: boolean }) {
  const { tr, locale } = useI18n();
  const Heading = primary ? "h1" : "h2";
  const modes: Mode[] = [
    {
      id: "runner",
      name: tr("docs.browserModes.runner"),
      badge: tr("docs.browserModes.default"),
      fit: tr("docs.browserModes.completeFormsAndLongerTasksIn"),
      steps: [
        tr("docs.browserModes.enableBrowserRunnerForTheComputer"),
        tr("docs.browserModes.whenAPageNeedsYouA"),
      ],
      can: [
        tr("docs.browserModes.multiStepWorkClickTypeChoose"),
        tr("docs.browserModes.keepsItsOwnSignInsPer"),
        tr("docs.browserModes.fillsPasswordsYouSavedOnThe"),
        tr("docs.browserModes.sendsOrdersPostsAndOtherSubmits"),
        tr("docs.browserModes.upToTasksAtOnceOn"),
      ],
      limits: [
        tr("docs.browserModes.needsTheComputerAgentInTerminal"),
        tr("docs.browserModes.usesItsOwnSignInsNot"),
        tr("docs.browserModes.itIsAFreshAutomatedBrowser"),
        tr("docs.browserModes.youCompleteSignInVerificationCodes"),
        tr("docs.browserModes.eachTaskStaysOnTheSites"),
      ],
      href: "/docs/mcp#browser-runner",
      cta: tr("docs.browserModes.runnerSetup"),
    },
    {
      id: "companion",
      name: tr("docs.browserModes.chromeCompanion"),
      badge: tr("docs.browserModes.sitesYouAllow"),
      fit: tr("docs.browserModes.letYourAiOpenTabsAnd"),
      steps: [
        tr("docs.browserModes.downloadTheExtensionZipAndLoad"),
        tr("docs.browserModes.pairItThenAllowASite"),
      ],
      can: [
        tr("docs.browserModes.worksSignedInAsYouIn"),
        tr("docs.browserModes.opensTabsOnAllowedSitesIn"),
        tr("docs.browserModes.readsPagesClicksFillsSelectsPresses"),
        tr("docs.browserModes.fillsAnApiKeyOrToken"),
        tr("docs.browserModes.sendsOrdersAndPostsOnce"),
      ],
      limits: [
        tr("docs.browserModes.mustBeInstalledItIsAn"),
        tr("docs.browserModes.neverFillsPasswordCardNumberCaptcha"),
        tr("docs.browserModes.clicksAndKeysArePageEvents"),
        tr("docs.browserModes.aPageSnapshotListsUpTo"),
        tr("docs.browserModes.aSharedTabStopsBeingShared"),
      ],
      href: "/chrome-extension#chrome-steps-title",
      cta: tr("docs.browserModes.extensionInstallation"),
    },
    {
      id: "your-chrome",
      name: tr("docs.browserModes.connectYourChrome"),
      badge: tr("docs.browserModes.advancedOnlyIfYouAsk"),
      fit: tr("docs.browserModes.yourAiUsesRunnerUnlessYou"),
      steps: [
        tr("docs.browserModes.useChromeOrLaterInChrome"),
        tr("docs.browserModes.askYourAiToConnectYour"),
      ],
      can: [
        tr("docs.browserModes.usesTheSignInsAlreadyIn"),
        tr("docs.browserModes.everythingRunnerCanDoIncludingReal"),
        tr("docs.browserModes.eachTaskWorksInItsOwn"),
      ],
      limits: [
        tr("docs.browserModes.needsTheComputerAgentChromeOr"),
        tr("docs.browserModes.chromeAsksYouToClickAllow"),
        tr("docs.browserModes.yourAiNeverChoosesItBy"),
      ],
      href: "/docs/mcp#your-chrome",
      cta: tr("docs.browserModes.chromeConnectionSteps"),
    },
  ];
  return (
    <section className="browserModes" aria-labelledby="browser-modes-title">
      <Heading id="browser-modes-title">{tr("docs.browserModes.threeWaysToWorkWithYour")}</Heading>
      <p className="browserModesIntro">{tr("docs.browserModes.runnerIsTheDefaultAHidden")}</p>
      <div className="browserModesGrid">
        {modes.map((mode) => (
          <article key={mode.id}>
            <span className="browserModeBadge">{mode.badge}</span>
            <h3>{mode.name}</h3>
            <p>{mode.fit}</p>
            <ol>
              {mode.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            <h4 className="browserModeListTitle">{tr("docs.browserModes.whatItCanDo")}</h4>
            <ul className="browserModeCan">
              {mode.can.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <h4 className="browserModeListTitle">{tr("docs.browserModes.limits")}</h4>
            <ul className="browserModeLimits">
              {mode.limits.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <a href={localizedWebsiteHref(mode.href, locale)}>{mode.cta} →</a>
          </article>
        ))}
      </div>
    </section>
  );
}
