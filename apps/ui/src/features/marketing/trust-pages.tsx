import { useI18n } from "../../hooks/use-i18n.js";
import { CONNECT_FAIR_USE } from "@remotearc/protocol";
import { localizedWebsiteHref } from "../../lib/marketing-paths.js";
import { ProductIcon, type ProductIconName } from "../../components/product-icon.js";
import { EngagementForm } from "./public-engagement.js";
import "../../styles/marketing/trust-pages.css";

type TrustKind = "privacy" | "terms" | "support";
type Section = {
  id: string;
  title: string;
  body: string;
  links?: { href: string; label: string }[];
};

function TrustNavigation({ kind }: { kind: TrustKind }) {
  const { tr, locale } = useI18n();
  return (
    <nav className="trustNavigation" aria-label={tr("marketing.trustPages.policiesAndSupport")}>
      {(["privacy", "terms", "support"] as const).map((page) => (
        <a
          key={page}
          href={localizedWebsiteHref("/" + page, locale)}
          aria-current={page === kind ? "page" : undefined}
        >
          {page === "privacy"
            ? tr("marketing.trustPages.privacy")
            : page === "terms"
              ? tr("marketing.trustPages.terms")
              : tr("marketing.trustPages.support")}
        </a>
      ))}
    </nav>
  );
}

export function TrustPage({ kind }: { kind: TrustKind }) {
  const { tr, locale } = useI18n();
  const href = (path: string) => localizedWebsiteHref(path, locale);
  if (kind === "support") return <SupportPage />;
  const privacy = kind === "privacy";
  const sections: Section[] = privacy
    ? [
        {
          id: "backups",
          title: tr("marketing.trustPages.recoveryBackups"),
          body: tr("marketing.trustPages.afterContentIsDeletedFromActive"),
        },
        {
          id: "google",
          title: tr("marketing.trustPages.googleDataAndLimitedUse"),
          body: tr("marketing.trustPages.weUseGoogleAccountDataOnly"),
          links: [
            {
              href: "https://developers.google.com/terms/api-services-user-data-policy",
              label: "Google API Services User Data Policy",
            },
            {
              href: "https://developers.google.com/workspace/workspace-api-user-data-developer-policy",
              label: tr("marketing.trustPages.googleWorkspaceLimitedUseRequirements"),
            },
          ],
        },
        {
          id: "support-data",
          title: tr("marketing.trustPages.supportAndBetaApplications"),
          body: tr("marketing.trustPages.googleAppsBetaApplicationsIncludeYour"),
        },
        {
          id: "account",
          title: tr("marketing.trustPages.yourAccountAndConnections"),
          body: tr("marketing.trustPages.weUseYourSignInIdentity"),
        },
        {
          id: "apps",
          title: tr("marketing.trustPages.appsAndAccountAuthorization"),
          body: tr("marketing.trustPages.connectingAnAppAuthorizesRemoteArc"),
        },
        {
          id: "execution",
          title: tr("marketing.trustPages.filesCommandsAndToolResults"),
          body: tr("marketing.trustPages.connectRelaysAuthorizedToolRequestsTo"),
        },
        {
          id: "arc",
          title: tr("marketing.trustPages.arcConversationsTasksAndRoutines"),
          body: tr("marketing.trustPages.whereArcIsEnabledForYour"),
        },
        {
          id: "memory",
          title: tr("marketing.trustPages.personalMemory"),
          body: tr("marketing.trustPages.arcCanKeepEncryptedBoundedPersonal"),
        },
        {
          id: "diagnostics",
          title: tr("marketing.trustPages.serviceDiagnostics"),
          body: tr("marketing.trustPages.weRecordALimitedSetOf"),
        },
        {
          id: "payments",
          title: tr("marketing.trustPages.paymentsAndUsage"),
          body: tr("marketing.trustPages.wherePaidPlansAreAvailableStripe"),
        },
        {
          id: "support",
          title: tr("marketing.trustPages.supportAndFeedback"),
          body: tr("marketing.trustPages.supportFeedbackAndEarlyAccessForms"),
        },
        {
          id: "providers",
          title: tr("marketing.trustPages.serviceProvidersAndDataTransfers"),
          body: tr("marketing.trustPages.weUseCloudflareToHostThe"),
        },
        {
          id: "controls",
          title: tr("marketing.trustPages.yourControlsAndDeletionRequests"),
          body: tr("marketing.trustPages.youCanDisconnectAppsRevokeAi"),
        },
        {
          id: "browser",
          title: tr("marketing.trustPages.browserStorageAndPolicyChanges"),
          body: tr("marketing.trustPages.weUseCookiesAndBrowserStorage"),
        },
      ]
    : [
        {
          id: "service",
          title: tr("marketing.trustPages.usingRemoteArc"),
          body: tr("marketing.trustPages.remoteArcProvidesConnectForLinking"),
        },
        {
          id: "permissions",
          title: tr("marketing.trustPages.connectionsAndActions"),
          body: tr("marketing.trustPages.connectingAnAppEnablesItsAvailable"),
        },
        {
          id: "agent",
          title: tr("marketing.trustPages.aiWorkAndRecurringTasks"),
          body: tr("marketing.trustPages.aiOutputAndToolExecutionCan"),
        },
        {
          id: "billing",
          title: tr("marketing.trustPages.subscriptionsAndRenewal"),
          body: tr("marketing.trustPages.ifYouPurchaseAPlanThe"),
        },
        {
          id: "connect-unlimited",
          title: tr("marketing.trustPages.connectUnlimited"),
          body: tr("marketing.trustPages.connectUnlimitedIsAConnectOnly", {
            computerRegistrationsPerDay: CONNECT_FAIR_USE.computerRegistrationsPerDay,
            browserInstallations: CONNECT_FAIR_USE.browserInstallations,
          }),
        },
        {
          id: "credits",
          title: tr("marketing.trustPages.trialsCreditsAndUsageLimits"),
          body: tr("marketing.trustPages.aTrialWhenOfferedStartsOnly"),
        },
        {
          id: "third-parties",
          title: tr("marketing.trustPages.thirdPartyAccountsAndCharges"),
          body: tr("marketing.trustPages.aiClientsConnectedAppsModelProviders"),
        },
        {
          id: "acceptable-use",
          title: tr("marketing.trustPages.acceptableUseAndAvailability"),
          body: tr("marketing.trustPages.doNotUseRemoteArcTo"),
        },
        {
          id: "contact",
          title: tr("marketing.trustPages.questionsBillingIssuesAndRefunds"),
          body: tr("marketing.trustPages.useSupportOrEmailSupportRemotearc"),
        },
      ];
  return (
    <div className="trustPage">
      <TrustNavigation kind={kind} />
      <header className="trustHeader">
        <span className="trustEyebrow">
          {tr("marketing.trustPages.remoteArcTrustTransparency")}
        </span>
        <h1>
          {privacy
            ? tr("marketing.trustPages.yourWorkYourInformation")
            : tr("marketing.trustPages.clearTermsForRealWork")}
        </h1>
        <p>
          {privacy
            ? tr("marketing.trustPages.howInformationMovesThroughRemoteArc")
            : tr("marketing.trustPages.whatToExpectWhenYouConnect")}
        </p>
        <div className="trustRevision">
          <span>
            {privacy
              ? tr("marketing.trustPages.privacyPolicy")
              : tr("marketing.trustPages.termsOfService")}
          </span>
          <span>
            {privacy
              ? tr("marketing.trustPages.updatedNovember")
              : tr("marketing.trustPages.updatedOctober")}
          </span>
        </div>
      </header>
      <div className="trustReadingLayout">
        <aside className="trustContents">
          <nav aria-label={tr("marketing.trustPages.onThisPage")}>
            <span>{tr("marketing.trustPages.onThisPage2")}</span>
            {sections.map((section) => (
              <a key={section.id} href={"#" + section.id}>
                {section.title}
              </a>
            ))}
          </nav>
          <a className="trustContact" href={href("/support")}>
            <ProductIcon name="chat" size={17} />
            {tr("marketing.trustPages.questionsTalkToUs")}
            <ProductIcon name="arrowUpRight" size={14} />
          </a>
        </aside>
        <article className="trustArticle">
          {sections.map((section, index) => (
            <section id={section.id} key={section.id}>
              <span className="trustSectionNumber" aria-hidden="true">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div>
                <h2>{section.title}</h2>
                <p>{section.body}</p>
                {section.links && (
                  <p>
                    {section.links.map((link) => (
                      <a key={link.href} href={link.href} target="_blank" rel="noreferrer">
                        {link.label} ·{" "}
                      </a>
                    ))}
                  </p>
                )}
              </div>
            </section>
          ))}
          <div className="trustArticleFoot">
            <ProductIcon name="inbox" size={19} />
            <div>
              <strong>{tr("marketing.trustPages.aDirectLineToRemoteArc")}</strong>
              <p>
                <a href="mailto:support@remotearc.app">support@remotearc.app</a>
              </p>
            </div>
            <a href={href("/support")}>
              {tr("marketing.trustPages.contactSupport")}
              <ProductIcon name="arrowUpRight" size={15} />
            </a>
          </div>
        </article>
      </div>
    </div>
  );
}

function SupportPage() {
  const { tr, locale } = useI18n();
  const enterprise = new URLSearchParams(location.search).get("topic") === "enterprise";
  const resources: { icon: ProductIconName; title: string; description: string; path: string }[] = [
    {
      icon: "book",
      title: tr("marketing.trustPages.getConnected"),
      description: tr("marketing.trustPages.installationPairingAndYourAiClient"),
      path: "/docs",
    },
    {
      icon: "apps",
      title: tr("marketing.trustPages.appsAccounts"),
      description: tr("marketing.trustPages.authorizationToolsAndProviderRequirements"),
      path: "/docs/apps",
    },
    {
      icon: "shield",
      title: tr("marketing.trustPages.accessSecurity"),
      description: tr("marketing.trustPages.deviceAccessPermissionsAndRevocation"),
      path: "/security-model",
    },
  ];
  return (
    <div className="trustPage supportPage">
      <TrustNavigation kind="support" />
      <header className="trustHeader">
        <span className="trustEyebrow">{tr("marketing.trustPages.remoteArcSupport")}</span>
        <h1>
          {enterprise
            ? tr("marketing.trustPages.arcForYourTeam")
            : tr("marketing.trustPages.letSGetYouMoving")}
        </h1>
        <p>{tr("marketing.trustPages.aSetupQuestionSomethingUnexpectedOr")}</p>
      </header>
      <div className="supportResources">
        {resources.map((resource) => (
          <a href={localizedWebsiteHref(resource.path, locale)} key={resource.path}>
            <span className="supportResourceIcon">
              <ProductIcon name={resource.icon} size={21} />
            </span>
            <div>
              <h2>{resource.title}</h2>
              <p>{resource.description}</p>
            </div>
            <ProductIcon name="arrowUpRight" size={17} />
          </a>
        ))}
      </div>
      <div className="supportContactLayout">
        <div className="supportContactCopy">
          <span className="trustEyebrow">{tr("marketing.trustPages.aDirectLine")}</span>
          <h2>
            {enterprise
              ? tr("marketing.trustPages.tellUsWhatYourTeamNeeds")
              : tr("marketing.trustPages.tellUsWhatSHappening")}
          </h2>
          <p>{tr("marketing.trustPages.yourMessageGoesToTheSame")}</p>
          <div className="supportEmail">
            <ProductIcon name="inbox" size={18} />
            <a href="mailto:support@remotearc.app">support@remotearc.app</a>
          </div>
          <details className="supportPrivateReport">
            <summary>{tr("marketing.trustPages.securityPrivacyOrBilling")}</summary>
            <p>{tr("marketing.trustPages.youCanUseThisFormOr")}</p>
          </details>
          <a className="supportFeedbackLink" href={localizedWebsiteHref("/feedback", locale)}>
            {tr("marketing.trustPages.justSharingAnIdeaSendFeedback")}
            <ProductIcon name="arrowUpRight" size={15} />
          </a>
        </div>
        <EngagementForm context={enterprise ? "enterprise" : "support"} />
      </div>
    </div>
  );
}
