import { WorkspaceLoading } from "../../components/workspace-loading.js";
import { HomeHeroCopy, LandingContent } from "./home/landing-content.js";
import { InstallCommands } from "../../components/install-commands.js";
import { HomeConnectionScene, type HomeConnectionMode } from "./home/home-connection-scene.js";
import { RequestVolume } from "./home/request-volume.js";
import { ProductFilmSection } from "./home/product-film.js";
import { PlanSummary } from "./plan-summary.js";
import { ProductFocus } from "./product-positioning.js";
import { AgentUseCases } from "./use-cases/agent-use-cases.js";
import { ProductIcon } from "../../components/product-icon.js";
import { usePlatformCatalog } from "../../hooks/use-platform-catalog.js";
import { should } from "../../lib/ui-access.js";
import { DASHBOARD_PATHS } from "../../lib/dashboard-workspaces.js";
import { ArcComingSoonPageContent } from "./arc/arc-future.js";
import { ArcRoadmapPageContent } from "./arc/arc-roadmap.js";
import type { UseCaseSlug } from "./use-cases/use-cases.js";
import React, { useEffect, useState } from "react";
import { useI18n } from "../../hooks/use-i18n.js";
import { localizedWebsiteHref } from "../../lib/marketing-paths.js";
import { TrustPage } from "./trust-pages.js";
import { type User } from "../../types/app-types.js";
import {
  CopyButton,
  PublicLayout,
  aiClients,
  topologyAiClients,
} from "../../components/public-layout.js";
import { APP_ORIGIN, MCP_ENDPOINT, dashboardHref } from "../../config/app-config.js";

const PricingContent = React.lazy(() =>
  import("./pricing.js").then((module) => ({ default: module.PricingContent })),
);
const Documentation = React.lazy(() =>
  import("../docs/product-docs.js").then((module) => ({ default: module.Documentation })),
);
const McpReference = React.lazy(() =>
  import("../docs/product-docs.js").then((module) => ({ default: module.McpReference })),
);
const UseCaseCatalog = React.lazy(() =>
  import("./use-cases/use-cases.js").then((module) => ({ default: module.UseCaseCatalog })),
);
const UseCaseDetail = React.lazy(() =>
  import("./use-cases/use-cases.js").then((module) => ({ default: module.UseCaseDetail })),
);
export function Landing({ user }: { user?: User | null }) {
  const { tr } = useI18n();
  const arcAvailable = should("arcAvailable", usePlatformCatalog());
  const [heroMode, setHeroMode] = useState<HomeConnectionMode>("connect");
  return (
    <PublicLayout user={user}>
      <section className="landingHero landingHero--constellation" data-product={heroMode}>
        <HomeHeroCopy
          mode={heroMode}
          arcAvailable={arcAvailable}
          arcHref={arcAvailable ? dashboardHref(DASHBOARD_PATHS["agent-chat"]) : "/arc"}
          connectHref={dashboardHref("/dashboard/connect/overview")}
        />
        <HomeConnectionScene
          clients={topologyAiClients}
          arcAvailable={arcAvailable}
          mode={heroMode}
          onModeChange={setHeroMode}
        />
      </section>

      <section className="trustRail" aria-label={tr("marketing.marketingPages.supportedAiClients")}>
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
        <div>
          <span className="miniMcp">M</span>
          <strong>Remote MCP</strong>
        </div>
        <small>{tr("marketing.marketingPages.oneEndpointNoClientLockIn")}</small>
      </section>

      <RequestVolume />
      <ProductFocus />
      <AgentUseCases />

      <LandingContent />
      <section className="homepageConnectSetup" id="connect-your-computer">
        <div>
          <span className="eyebrow">REMOTE ARC CONNECT</span>
          <h2>{tr("marketing.marketingPages.keepYourAiConnectYourComputer")}</h2>
          <p>{tr("marketing.marketingPages.useChatgptClaudeOrAnotherCompatible")}</p>
          <a href="/connect-ai">
            {tr("marketing.marketingPages.connectSetupGuide")}
            <ProductIcon name="arrowUpRight" size={15} />
          </a>
        </div>
        <InstallCommands />
      </section>
    </PublicLayout>
  );
}
export function ArcPage({ user }: { user?: User | null }) {
  const available = should("arcAvailable", usePlatformCatalog());
  return (
    <PublicLayout user={user}>
      <ArcComingSoonPageContent
        available={available}
        startHref={dashboardHref(DASHBOARD_PATHS["agent-chat"])}
      />
    </PublicLayout>
  );
}
export function RoadmapPage({ user }: { user?: User | null }) {
  return (
    <PublicLayout user={user}>
      <ArcRoadmapPageContent />
    </PublicLayout>
  );
}
export function DemoPage({ user }: { user?: User | null }) {
  const { tr } = useI18n();
  return (
    <PublicLayout user={user}>
      <main className="pluginDemoPage">
        <section className="pluginDemoIntro">
          <span className="eyebrow">{tr("marketing.demoPage.eyebrow")}</span>
          <h1>{tr("marketing.demoPage.title")}</h1>
          <p>{tr("marketing.demoPage.intro")}</p>
        </section>

        <ProductFilmSection />
      </main>
    </PublicLayout>
  );
}
export function ConnectPage({ user }: { user?: User | null }) {
  const { tr, locale } = useI18n();
  const scopes = [
    ["apps:read", tr("marketing.marketingPages.discoverConnectedAppsAndReadData")],
    ["apps:write", tr("marketing.marketingPages.useSupportedAppActionsWithinThe")],
    ["devices:read", tr("marketing.marketingPages.listPairedComputersAndWhetherThey")],
    ["computer:read", tr("marketing.marketingPages.readFilesFoldersAndProcessInformation")],
    ["computer:write", tr("marketing.marketingPages.askForEditingAndTerminalTools")],
    ["browser:read", tr("marketing.marketingPages.readBrowserPagesTabsYouShare")],
    ["browser:interact", tr("marketing.marketingPages.actInABrowserStartBrowser")],
    ["automation:read", tr("marketing.marketingPages.viewPersistentTasksWatchesAndTheir")],
    ["automation:write", tr("marketing.marketingPages.createAndManageWorkThatKeeps")],
    ["agent:write", tr("marketing.marketingPages.letDurableAgentGoalsCheckResults")],
  ];
  const step = (n: number, title: string) => (
    <h2>
      <span className="connectStepNo" aria-hidden="true">
        {n}
      </span>
      {title}
    </h2>
  );

  return (
    <PublicLayout user={user}>
      <main className="referenceManual connectSetupPage">
        <header className="toolPageHeader">
          <span className="eyebrow">{tr("marketing.marketingPages.connectAi")}</span>
          <h1>{tr("marketing.marketingPages.connectRemoteArcToYourAi")}</h1>
          <p>{tr("marketing.marketingPages.addRemoteArcToTheAi")}</p>
          <div className="connectStartActions">
            <a className="primaryButton" href={localizedWebsiteHref("/downloads", locale)}>
              {tr("marketing.marketingPages.downloadTheAgent")}
              <ProductIcon name="arrowUpRight" size={16} />
            </a>
            <a href="https://agent.remotearc.app/devices">
              {tr("marketing.marketingPages.openDashboard")} ↗
            </a>
          </div>
        </header>

        <section
          className="connectClientCards"
          aria-label={tr("marketing.marketingPages.chooseYourAiClient")}
        >
          {[
            {
              id: "chatgpt",
              name: "ChatGPT",
              logo: "/ai-openai.svg",
              detail: tr("marketing.marketingPages.installThePublishedRemoteArcPlugin"),
            },
            {
              id: "claude",
              name: "Claude",
              logo: "/ai-claude.svg",
              detail: tr("marketing.marketingPages.addACustomRemoteConnector"),
            },
            {
              id: "cursor",
              name: "Cursor",
              logo: "/ai-cursor.svg",
              detail: tr("marketing.marketingPages.useYourCodingWorkspace"),
            },
          ].map((client) => (
            <a href={localizedWebsiteHref("/install/" + client.id, locale)} key={client.id}>
              <img src={client.logo} alt="" />
              <strong>{client.name}</strong>
              <small>{client.detail}</small>
              <ProductIcon name="arrowUpRight" size={15} />
            </a>
          ))}
        </section>
        <div className="manualLayout">
          <aside className="manualToc">
            <strong>{tr("marketing.marketingPages.setup")}</strong>
            <a href="#connect-client">{tr("marketing.marketingPages.addToYourAi")}</a>
            <a href="#connect-computer">{tr("marketing.marketingPages.computerOrApps")}</a>
            <a href="#connect-policy">{tr("marketing.marketingPages.whatTheComputerAllows")}</a>
            <a href="#connect-try">{tr("marketing.marketingPages.tryARequest")}</a>
            <a href="#connect-scopes">{tr("marketing.marketingPages.referenceOauthScopes")}</a>
          </aside>

          <article className="manualArticle">
            <section id="connect-client">
              {step(1, tr("marketing.marketingPages.addRemoteArcToYourAi"))}
              <p>{tr("marketing.marketingPages.chooseTheGuideForTheAi")}</p>
              <details className="connectCustomMcp">
                <summary>{tr("marketing.marketingPages.customMcpAddress")}</summary>
                <div className="docsCodeLine">
                  <code>{MCP_ENDPOINT}</code>
                  <CopyButton value={MCP_ENDPOINT} />
                </div>
              </details>
              <div className="clientGuideRows compactClientRows">
                {aiClients.map((client) => (
                  <a
                    href={localizedWebsiteHref("/install/" + client.slug, locale)}
                    key={client.name}
                  >
                    <img
                      className={client.tone === "mono" ? "monoLogo" : "colorLogo"}
                      src={client.icon}
                      alt=""
                    />
                    <div>
                      <strong>{client.name}</strong>
                      <span>{tr("marketing.marketingPages.stepByStepSetup")}</span>
                    </div>
                    <b>→</b>
                  </a>
                ))}
                <a href={localizedWebsiteHref("/docs/mcp", locale)}>
                  <span className="miniMcp">M</span>
                  <div>
                    <strong>{tr("marketing.marketingPages.otherRemoteMcpClients")}</strong>
                    <span>{tr("marketing.marketingPages.useTheCustomMcpAddressWith")}</span>
                  </div>
                  <b>→</b>
                </a>
              </div>
            </section>

            <section id="connect-computer">
              {step(2, tr("marketing.marketingPages.connectYourComputerYourAppsOr"))}
              <div className="connectChoice">
                <div>
                  <h3>{tr("marketing.marketingPages.yourComputer")}</h3>
                  <p>{tr("marketing.marketingPages.downloadTheNativeAgentForThe")}</p>
                  <p>
                    <a
                      className="connectNativeDownload"
                      href={localizedWebsiteHref("/downloads", locale)}
                    >
                      {["macos", "windows", "linux"].map((platform) => (
                        <img
                          key={platform}
                          src={"/platform-brands/" + platform + ".svg"}
                          width={20}
                          height={20}
                          alt=""
                        />
                      ))}
                      <span>{tr("marketing.marketingPages.downloadForYourComputer")} →</span>
                    </a>
                  </p>
                  <p>
                    <a href="https://agent.remotearc.app/devices">
                      {tr("marketing.marketingPages.seeYourComputersInDashboard")} ↗
                    </a>
                  </p>
                  <details className="connectCommandAlternatives">
                    <summary>{tr("marketing.marketingPages.preferTheCommandLine")}</summary>
                    <InstallCommands />
                  </details>
                </div>
                <div id="connect-apps">
                  <h3>{tr("marketing.marketingPages.yourApps")}</h3>
                  <p>{tr("marketing.marketingPages.openAppsInYourConnectWorkspace")}</p>
                  <p>
                    <a href="https://agent.remotearc.app/dashboard/connect/apps">
                      {tr("marketing.marketingPages.openApps")} →
                    </a>
                  </p>
                </div>
              </div>
            </section>

            <section id="connect-policy">
              {step(3, tr("marketing.marketingPages.decideWhatTheComputerAllows"))}
              <p>{tr("marketing.marketingPages.aNewlyPairedComputerStartsIn")}</p>
              <div className="compactReferenceTable connectPolicyTable">
                <div>
                  <strong>
                    Safe<small>{tr("marketing.marketingPages.default")}</small>
                  </strong>
                  <span>{tr("marketing.marketingPages.readOnlyListFoldersReadFiles")}</span>
                </div>
                <div>
                  <strong>Developer</strong>
                  <span>{tr("marketing.marketingPages.addsCreatingAndEditingFilesWhich")}</span>
                </div>
                <div>
                  <strong>Full</strong>
                  <span>
                    {tr("marketing.marketingPages.addsTerminalCommandsAndBackgroundProcesses")}
                  </span>
                </div>
              </div>
            </section>

            <section id="connect-try">
              {step(4, tr("marketing.marketingPages.tryARequest2"))}
              <p>{tr("marketing.marketingPages.startANewChatInYour")}</p>
              <ul className="connectTryList">
                <li>{tr("marketing.marketingPages.listTheComputersIHaveConnected")}</li>
                <li>{tr("marketing.marketingPages.showTheLargestFilesInMy")}</li>
                <li>{tr("marketing.marketingPages.usingTheAppIJustConnected")}</li>
              </ul>
              <p className="manualFinePrint">
                {tr("marketing.marketingPages.ifTheAiSaysItCannot")}
              </p>
            </section>

            <section id="connect-scopes">
              <h2>{tr("marketing.marketingPages.referenceOauthScopes")}</h2>
              <p>{tr("marketing.marketingPages.scopesAreWhatAnAiClient")}</p>
              <div className="compactReferenceTable scopeReference">
                {scopes.map(([scope, body]) => (
                  <div key={scope}>
                    <code>{scope}</code>
                    <span>{body}</span>
                  </div>
                ))}
              </div>
            </section>
          </article>
        </div>
        <PlanSummary />
      </main>
    </PublicLayout>
  );
}
export function DocsPage({ user }: { user?: User | null }) {
  const { tr } = useI18n();
  return (
    <PublicLayout user={user}>
      <React.Suspense
        fallback={
          <main className="technicalDoc">
            <WorkspaceLoading label={tr("marketing.marketingPages.loading")} />
          </main>
        }
      >
        <Documentation />
      </React.Suspense>
    </PublicLayout>
  );
}
export function SecurityModelPage({ user }: { user?: User | null }) {
  const { tr } = useI18n();
  return (
    <PublicLayout user={user}>
      <main className="technicalDoc">
        <header className="articleHeader">
          <span className="eyebrow">{tr("marketing.marketingPages.security")}</span>
          <h1>{tr("marketing.marketingPages.securityAndTrustModel")}</h1>
          <p>{tr("marketing.marketingPages.remoteArcAllowsAnAiClient")}</p>
          <div className="articleMetaLinks">
            <a href="/docs#docs-policy">{tr("marketing.marketingPages.permissionModel")} →</a>
            <a href="/docs#docs-data">{tr("marketing.marketingPages.dataHandling")} →</a>
            <a href="/docs/security-policy">{tr("marketing.marketingPages.securityPolicy")} →</a>
          </div>
        </header>

        <div className="technicalDocLayout">
          <aside className="articleToc">
            <strong>{tr("marketing.marketingPages.contents")}</strong>
            <a href="#security-threat">{tr("marketing.marketingPages.threatModel")}</a>
            <a href="#security-identity">{tr("marketing.marketingPages.identity")}</a>
            <a href="#security-device">{tr("marketing.marketingPages.deviceTrust")}</a>
            <a href="#security-paths">{tr("marketing.marketingPages.pathConfinement")}</a>
            <a href="#security-tools">{tr("marketing.marketingPages.skillPolicy")}</a>
            <a href="#security-transport">{tr("marketing.marketingPages.transportRelay")}</a>
            <a href="#security-recovery">{tr("marketing.marketingPages.recovery")}</a>
            <a href="#security-automations">{tr("marketing.marketingPages.persistentTasks")}</a>
            <a href="#security-revoke">{tr("marketing.marketingPages.revocation")}</a>
            <a href="#security-nonclaims">{tr("marketing.marketingPages.whatWeDoNotClaim")}</a>
          </aside>

          <article className="technicalArticle">
            <section id="security-threat">
              <h2>{tr("marketing.marketingPages.threatModelAndAssumptions")}</h2>
              <p>{tr("marketing.marketingPages.remoteArcAssumesThePairedComputer")}</p>
              <p>{tr("marketing.marketingPages.theHostedControlPlaneIsTrusted")}</p>
            </section>

            <section id="security-identity">
              <h2>{tr("marketing.marketingPages.identityIsSplitBetweenTheUser")}</h2>
              <p>
                {tr("marketing.marketingPages.dashboardAuthenticationMcpClientAuthorizationAnd")}
              </p>
              <p>{tr("marketing.marketingPages.thisSeparationIsWhatMakesIndependent")}</p>
            </section>

            <section id="security-device">
              <h2>{tr("marketing.marketingPages.theDeviceIsTheFinalExecution")}</h2>
              <p>{tr("marketing.marketingPages.theRelayCanDenyARequest")}</p>
              <div className="articleFlow">
                <code>OAuth scope</code>
                <span>→</span>
                <code>account state</code>
                <span>→</span>
                <code>device skill policy</code>
                <span>→</span>
                <code>local path policy</code>
                <span>→</span>
                <code>OS execution</code>
              </div>
              <p>{tr("marketing.marketingPages.theCliCanAdditionallyEstablishA")}</p>
            </section>

            <section id="security-paths">
              <h2>{tr("marketing.marketingPages.filesystemConfinementHappensBelowTheSkill")}</h2>
              <p>{tr("marketing.marketingPages.readOnlyToolsMayInspectOrdinary")}</p>
              <p>{tr("marketing.marketingPages.existingPathAncestorsAreCanonicalizedOn")}</p>
            </section>

            <section id="security-tools">
              <h2>{tr("marketing.marketingPages.skillPolicyKeepsReadWriteAnd")}</h2>
              <p>{tr("marketing.marketingPages.safeDeveloperAndFullAreConvenience")}</p>
              <p>{tr("marketing.marketingPages.safetyGuardIsDefenseInDepth")}</p>
            </section>

            <section id="security-transport">
              <h2>{tr("marketing.marketingPages.transportIsEncryptedTheRelayIs")}</h2>
              <p>{tr("marketing.marketingPages.theLocalAgentMaintainsAnOutbound")}</p>
              <p>{tr("marketing.marketingPages.encryptionInTransitIsNotThe")}</p>
              <table className="articleTable">
                <thead>
                  <tr>
                    <th>{tr("marketing.marketingPages.location")}</th>
                    <th>{tr("marketing.marketingPages.examples")}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>D1</td>
                    <td>{tr("marketing.marketingPages.accountDeviceAndOauthMetadataPolicy")}</td>
                  </tr>
                  <tr>
                    <td>{tr("marketing.marketingPages.liveRelayPath")}</td>
                    <td>
                      {tr("marketing.marketingPages.activeFileContentsDirectoryListingsProcess")}
                    </td>
                  </tr>
                  <tr>
                    <td>{tr("marketing.marketingPages.deviceOnly")}</td>
                    <td>{tr("marketing.marketingPages.rawDeviceCredentialFullLocalProcess")}</td>
                  </tr>
                </tbody>
              </table>
            </section>

            <section id="security-recovery">
              <h2>{tr("marketing.marketingPages.localFileRecoveryAndDurableTask")}</h2>
              <p>{tr("marketing.marketingPages.beforeSupportedWriteFileAndEdit")}</p>
              <p>{tr("marketing.marketingPages.localUndoOnlyCoversSupportedFile")}</p>
              <p>{tr("marketing.marketingPages.durableTaskRecoveryIsSeparateThe")}</p>
            </section>

            <section id="security-automations">
              <h2>{tr("marketing.marketingPages.persistentTasksFreezeAuthorityAtCreation")}</h2>
              <p>{tr("marketing.marketingPages.aDurableAutomationMayExecuteHours")}</p>
              <p>{tr("marketing.marketingPages.everyFutureDeviceActionStillPasses")}</p>
              <p>{tr("marketing.marketingPages.conditionWatchCallbackUrlsContainA")}</p>
              <p>{tr("marketing.marketingPages.durableGoalsStoreTheirContractBounded")}</p>
            </section>

            <section id="security-revoke">
              <h2>{tr("marketing.marketingPages.accessCanBeCutAtSeveral")}</h2>
              <p>{tr("marketing.marketingPages.anAccountWideMcpPauseBlocks")}</p>
            </section>

            <section id="security-nonclaims">
              <h2>{tr("marketing.marketingPages.whatRemoteArcDoesNotClaim")}</h2>
              <ul className="articleBulletList">
                <li>{tr("marketing.marketingPages.theHostedRelayIsNotZero")}</li>
                <li>{tr("marketing.marketingPages.terminalExecutionIsNotSandboxedBy")}</li>
                <li>{tr("marketing.marketingPages.localUndoIsNotAGeneral")}</li>
                <li>{tr("marketing.marketingPages.directProcessHandlesAreLocalTo")}</li>
                <li>{tr("marketing.marketingPages.theBrowserExtensionWorksOnlyOn")}</li>
                <li>{tr("marketing.marketingPages.adaptiveAgentGoalsMayChooseDifferent")}</li>
                <li>{tr("marketing.marketingPages.loginBackgroundConnectionIsSeparateFrom")}</li>
              </ul>
              <p>{tr("marketing.marketingPages.theseAreProductBoundariesNotFootnotes")}</p>
              <div className="articleEndLinks">
                <a href="/docs">{tr("marketing.marketingPages.documentation")} →</a>
                <a href="/privacy">{tr("marketing.marketingPages.privacyPolicy")} →</a>
                <a href="/docs/security-policy">
                  {tr("marketing.marketingPages.securityPolicy")} →
                </a>
              </div>
            </section>
          </article>
        </div>
      </main>
    </PublicLayout>
  );
}
export function UseCasesPage({ user }: { user?: User | null }) {
  const { tr } = useI18n();
  return (
    <PublicLayout user={user}>
      <React.Suspense
        fallback={
          <main className="technicalDoc">
            <WorkspaceLoading label={tr("marketing.marketingPages.loading")} />
          </main>
        }
      >
        <UseCaseCatalog />
      </React.Suspense>
    </PublicLayout>
  );
}
export function UseCaseDetailPage({ slug, user }: { slug: UseCaseSlug; user?: User | null }) {
  const { tr } = useI18n();
  return (
    <PublicLayout user={user}>
      <React.Suspense
        fallback={
          <main className="technicalDoc">
            <WorkspaceLoading label={tr("marketing.marketingPages.loading")} />
          </main>
        }
      >
        <UseCaseDetail slug={slug} />
      </React.Suspense>
    </PublicLayout>
  );
}
export function ChatGptComputerAccessPage({ user }: { user?: User | null }) {
  const { tr } = useI18n();
  return (
    <PublicLayout user={user}>
      <section className="publicHero compactHero seoLandingHero">
        <span className="eyebrow">CHATGPT + REMOTE ARC</span>
        <h1>{tr("marketing.marketingPages.giveChatgptAccessToYourComputer")}</h1>
        <p>{tr("marketing.marketingPages.remoteArcConnectsChatgptToWindows")}</p>
        <div className="heroActions">
          <a className="primaryButton" href="/install/chatgpt">
            {tr("marketing.marketingPages.installRemoteArcForChatgpt")} →
          </a>
          <a className="ghostButton" href="/docs/mcp">
            {tr("marketing.marketingPages.readTheMcpDocs")}
          </a>
        </div>
      </section>
      <section className="seoSteps">
        <article>
          <span>01</span>
          <h2>{tr("marketing.marketingPages.pairYourComputer")}</h2>
          <p>{tr("marketing.marketingPages.runOneLocalCommandAndApprove")}</p>
        </article>
        <article>
          <span>02</span>
          <h2>{tr("marketing.marketingPages.connectChatgptThroughMcp")}</h2>
          <p>{tr("marketing.marketingPages.useTheRemoteArcMcpEndpoint")}</p>
        </article>
        <article>
          <span>03</span>
          <h2>{tr("marketing.marketingPages.chooseWhatThisDeviceCanDo")}</h2>
          <p>{tr("marketing.marketingPages.startReadOnlyAddFileEditing")}</p>
        </article>
      </section>
      <section className="faqSection">
        <div className="sectionIntro">
          <span className="eyebrow">FAQ</span>
          <h2>{tr("marketing.marketingPages.commonQuestionsAboutChatgptComputerAccess")}</h2>
        </div>
        <div className="faqList">
          <details>
            <summary>{tr("marketing.marketingPages.doesRemoteArcExposeAPort")}</summary>
            <p>{tr("marketing.marketingPages.noTheLocalAgentCreatesAn")}</p>
          </details>
          <details>
            <summary>{tr("marketing.marketingPages.canIKeepAComputerRead")}</summary>
            <p>{tr("marketing.marketingPages.yesToolAvailabilityIsConfiguredPer")}</p>
          </details>
          <details>
            <summary>{tr("marketing.marketingPages.doIHaveToUseOnly")}</summary>
            <p>{tr("marketing.marketingPages.noTheSameRemoteArcEndpoint")}</p>
          </details>
        </div>
      </section>
    </PublicLayout>
  );
}
export function ClaudeComputerAccessPage({ user }: { user?: User | null }) {
  const { tr } = useI18n();
  return (
    <PublicLayout user={user}>
      <section className="publicHero compactHero seoLandingHero">
        <span className="eyebrow">CLAUDE + REMOTE ARC</span>
        <h1>{tr("marketing.marketingPages.giveClaudeControlledAccessToYour")}</h1>
        <p>{tr("marketing.marketingPages.remoteArcConnectsClaudeToExplicitly")}</p>
        <div className="heroActions">
          <a className="primaryButton" href="/install/claude">
            {tr("marketing.marketingPages.installRemoteArcForClaude")} →
          </a>
          <a className="ghostButton" href="/docs/mcp">
            {tr("marketing.marketingPages.readTheMcpDocs")}
          </a>
        </div>
      </section>
      <section className="seoSteps">
        <article>
          <span>01</span>
          <h2>{tr("marketing.marketingPages.pairTheComputerOnce")}</h2>
          <p>{tr("marketing.marketingPages.runNpxRemotelinkOnTheTarget")}</p>
        </article>
        <article>
          <span>02</span>
          <h2>{tr("marketing.marketingPages.connectClaudeOverRemoteMcp")}</h2>
          <p>{tr("marketing.marketingPages.addTheRemoteArcEndpointTo")}</p>
        </article>
        <article>
          <span>03</span>
          <h2>{tr("marketing.marketingPages.keepDevicePolicyIndependent")}</h2>
          <p>{tr("marketing.marketingPages.toolAccessWorkspaceRootsSensitivePaths")}</p>
        </article>
      </section>
      <section className="faqSection">
        <div className="sectionIntro">
          <span className="eyebrow">RELATED</span>
          <h2>{tr("marketing.marketingPages.continueWithTheTechnicalDetails")}</h2>
        </div>
        <div className="sectionResourceLinks">
          <a href="/mcp-computer-access">
            {tr("marketing.marketingPages.remoteMcpComputerAccess")} →
          </a>
          <a href="/security-model">{tr("marketing.marketingPages.securityModel")} →</a>
          <a href="/chatgpt-computer-access">
            {tr("marketing.marketingPages.chatgptComputerAccess")} →
          </a>
        </div>
      </section>
    </PublicLayout>
  );
}
export function McpComputerAccessPage({ user }: { user?: User | null }) {
  const { tr } = useI18n();
  return (
    <PublicLayout user={user}>
      <section className="publicHero compactHero seoLandingHero">
        <span className="eyebrow">REMOTE MCP + COMPUTER ACCESS</span>
        <h1>{tr("marketing.marketingPages.remoteMcpComputerAccessForAi")}</h1>
        <p>{tr("marketing.marketingPages.remoteArcIsAHostedRemote")}</p>
        <div className="heroActions">
          <a className="primaryButton" href="/docs/mcp">
            {tr("marketing.marketingPages.openTheMcpReference")} →
          </a>
          <a className="ghostButton" href="/security-model">
            {tr("marketing.marketingPages.securityModel")}
          </a>
        </div>
      </section>
      <section className="seoSteps">
        <article>
          <span>01</span>
          <h2>{tr("marketing.marketingPages.oneHostedMcpEndpoint")}</h2>
          <p>{tr("marketing.marketingPages.yourAiClientConnectsToRemote")}</p>
        </article>
        <article>
          <span>02</span>
          <h2>{tr("marketing.marketingPages.outboundDeviceConnections")}</h2>
          <p>{tr("marketing.marketingPages.eachPairedComputerConnectsOutwardTo")}</p>
        </article>
        <article>
          <span>03</span>
          <h2>{tr("marketing.marketingPages.perDeviceCapabilities")}</h2>
          <p>{tr("marketing.marketingPages.readFilesEditSupportedContentInspect")}</p>
        </article>
      </section>
      <section className="faqSection">
        <div className="sectionIntro">
          <span className="eyebrow">CONNECT</span>
          <h2>{tr("marketing.marketingPages.useTheSameDeviceBoundaryWith")}</h2>
        </div>
        <div className="sectionResourceLinks">
          <a href="/install/chatgpt">ChatGPT →</a>
          <a href="/install/claude">Claude →</a>
          <a href="/install/cursor">Cursor →</a>
          <a href="/use-cases">{tr("marketing.marketingPages.useCases")} →</a>
        </div>
      </section>
    </PublicLayout>
  );
}
export function NotFoundPage({ user }: { user?: User | null }) {
  const { tr } = useI18n();
  return (
    <PublicLayout user={user}>
      <section className="publicHero compactHero">
        <span className="eyebrow">404</span>
        <h1>{tr("marketing.marketingPages.pageNotFound")}</h1>
        <p>{tr("marketing.marketingPages.theRemoteArcPageYouRequested")}</p>
        <div className="heroActions">
          <a className="primaryButton" href="/">
            {tr("marketing.marketingPages.backToRemoteArc")} →
          </a>
          <a className="ghostButton" href="/docs">
            {tr("marketing.marketingPages.documentation")}
          </a>
        </div>
      </section>
    </PublicLayout>
  );
}
export function PricingPage({ user }: { user?: User | null }) {
  const { tr } = useI18n();
  const startHref = user
    ? dashboardHref("/overview")
    : APP_ORIGIN + "/auth/login?return_to=/overview";
  const usageHref = user
    ? dashboardHref("/settings")
    : APP_ORIGIN + "/auth/login?return_to=/settings";
  return (
    <PublicLayout user={user}>
      <React.Suspense
        fallback={
          <main className="technicalDoc">
            <WorkspaceLoading label={tr("marketing.marketingPages.loading")} />
          </main>
        }
      >
        <PricingContent
          startHref={startHref}
          usageHref={usageHref}
          signedIn={Boolean(user)}
          currentPlan={user?.plan || null}
        />
      </React.Suspense>
    </PublicLayout>
  );
}
export function ResourcesRedirect() {
  const { tr } = useI18n();
  useEffect(() => {
    window.location.replace("/docs");
  }, []);
  return (
    <p role="status">
      <a href="/docs">{tr("marketing.marketingPages.openDocumentation")} →</a>
    </p>
  );
}
export function McpPage({ user }: { user?: User | null }) {
  const { tr } = useI18n();
  return (
    <PublicLayout user={user}>
      <React.Suspense
        fallback={
          <main className="technicalDoc">
            <WorkspaceLoading label={tr("marketing.marketingPages.loading")} />
          </main>
        }
      >
        <McpReference />
      </React.Suspense>
    </PublicLayout>
  );
}
export function LegalPage({
  kind,
  user,
}: {
  kind: "privacy" | "terms" | "support";
  user?: User | null;
}) {
  return (
    <PublicLayout user={user}>
      <TrustPage kind={kind} />
    </PublicLayout>
  );
}
