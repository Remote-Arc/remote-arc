import toolIndex from "../../../../../packages/docs/src/tool-index.generated.json" with { type: "json" };
import { TOOL_GROUPS } from "../../../../../packages/docs/src/tool-reference-meta.js";
import { localizedWebsiteHref } from "../../lib/marketing-paths.js";
import React from "react";
import { useI18n } from "../../hooks/use-i18n.js";
import { ArchitectureDeepDive } from "./architecture-deep-dive.js";
import { BrowserModes } from "./browser-modes.js";
import "../../styles/public-docs.css";

const endpoint = "https://mcp.remotearc.app/mcp";

export const publicToolGroups = Object.entries(TOOL_GROUPS)
  .map(([id, copy]) => ({
    ...copy,
    scope: [
      ...new Set(
        toolIndex.remote.filter((tool) => tool.group === id).flatMap((tool) => tool.scopes),
      ),
    ].join(" · "),
    tools: toolIndex.remote.filter((tool) => tool.group === id).map((tool) => tool.name),
  }))
  .filter((group) => group.tools.length);
const toolCount = toolIndex.remote.length;

export function TaskAvailability() {
  const { tr } = useI18n();
  return (
    <aside className="docsAvailability">
      <strong>{tr("docs.productDocs.aboutAvailability")}</strong>
      <p>{tr("docs.productDocs.arcTasksAndRoutinesRunBounded")}</p>
    </aside>
  );
}

function Code({ children }: { children: string }) {
  return (
    <pre className="docsExample">
      <code>{children}</code>
    </pre>
  );
}

function ToolReference() {
  const { tr, locale } = useI18n();
  return (
    <>
      <p>{tr("docs.productDocs.theGroupsBelowCoverMcpTools", { toolCount })}</p>
      <p>{tr("docs.productDocs.allConnectToolCapabilitiesAreAvailable")}</p>
      <p>
        <a href={localizedWebsiteHref("/docs/tools", locale)}>
          {tr("docs.productDocs.searchAllToolsAppOperationsAnd")} →
        </a>
      </p>
      <div className="toolReferenceList">
        {publicToolGroups.map((group) => (
          <div key={group.en}>
            <h3>{tr(group.en, group.zh)}</h3>
            <code>{group.tools.join(" · ")}</code>
            <p>
              {tr("docs.productDocs.scopesUsedInThisGroup")}
              {group.scope}
            </p>
          </div>
        ))}
      </div>
      <p>{tr("docs.productDocs.backgroundServiceControlsAndPowerLeases")}</p>
    </>
  );
}

function SelectedSections({
  children,
  sectionIds,
}: {
  children: React.ReactNode;
  sectionIds?: readonly string[];
}) {
  return (
    <>
      {React.Children.toArray(children).filter((child) => {
        if (!sectionIds) return true;
        if (!React.isValidElement<{ id?: string }>(child)) return false;
        return child.type === ArchitectureDeepDive
          ? sectionIds.includes("architecture-deep")
          : Boolean(child.props.id && sectionIds.includes(child.props.id.replace(/^docs-/, "")));
      })}
    </>
  );
}

export function Documentation({
  sectionIds,
  title,
  description,
}: { sectionIds?: readonly string[]; title?: string; description?: string } = {}) {
  const { tr, locale } = useI18n();
  const contents = [
    ["start", tr("docs.productDocs.setUpOnce")],
    ["model", tr("docs.productDocs.chatToolsAndTasks")],
    ["routing", tr("docs.productDocs.systemArchitecture")],
    ["architecture-deep", tr("docs.productDocs.architectureDeepDive")],
    ["architecture-trust", tr("docs.productDocs.trustBoundaries")],
    ["architecture-task", tr("docs.productDocs.taskLifecycle")],
    ["architecture-persistence", tr("docs.productDocs.persistenceAndRecovery")],
    ["architecture-data", tr("docs.productDocs.storageAndPrivacy")],
    ["architecture-limits", tr("docs.productDocs.experimentalBoundaries")],
    ["policy", tr("docs.productDocs.devicePermissions")],
    ["files", tr("docs.productDocs.filesAndUndo")],
    ["processes", tr("docs.productDocs.processesAndRecovery")],
    ["automations", tr("docs.productDocs.durableTaskModes")],
    ["continuation", tr("docs.productDocs.aiReasoningBoundary")],
    ["schedule", tr("docs.productDocs.schedulingAndSleep")],
    ["browser", tr("docs.productDocs.browserContext")],
    ["sandbox", tr("docs.productDocs.executionAndIsolation")],
    ["tools", tr("docs.productDocs.mcpToolReference")],
    ["data", tr("docs.productDocs.dataHandling")],
    ["troubleshoot", tr("docs.productDocs.troubleshooting")],
    ["limits", tr("docs.productDocs.availabilityAndLimits")],
  ];
  return (
    <main className="technicalDoc productDocs">
      <header className="articleHeader">
        <span className="eyebrow">{tr("docs.productDocs.documentation")}</span>
        <h1>{title || tr("docs.productDocs.yourAiYourComputerWorkThat")}</h1>
        <p>{description || tr("docs.productDocs.pairAComputerChooseItsPermissions")}</p>
        <div className="articleMetaLinks">
          <a href={localizedWebsiteHref("/docs/mcp", locale)}>
            {tr("docs.productDocs.mcpReference")} →
          </a>
          <a href={localizedWebsiteHref("/docs/long-running-work", locale)}>
            {tr("docs.productDocs.longRunningWork")} →
          </a>
          <a href={localizedWebsiteHref("/use-cases", locale)}>
            {tr("docs.productDocs.useCases")} →
          </a>
        </div>
        {(!sectionIds || sectionIds.includes("automations")) && <TaskAvailability />}
      </header>
      <div className="technicalDocLayout">
        <aside className="articleToc">
          <strong>{tr("docs.productDocs.contents")}</strong>
          {contents
            .filter(([id]) => !sectionIds || sectionIds.includes(id!))
            .map(([id, title]) => (
              <a key={id} href={"#docs-" + id}>
                {title}
              </a>
            ))}
        </aside>
        <article className="technicalArticle">
          <SelectedSections sectionIds={sectionIds}>
            <section id="docs-start">
              <h2>{tr("docs.productDocs.setUpTheComputerAndThe")}</h2>
              <p>{tr("docs.productDocs.onTheWindowsMacosOrLinux")}</p>
              <Code>npx remotelink@latest</Code>
              <p>{tr("docs.productDocs.withoutNodeJsOnMacosOr")}</p>
              <Code>{"curl -fsSL https://remotearc.app/install.sh | sh\nremotelink"}</Code>
              <p>{tr("docs.productDocs.theInstallerVerifiesSha256AndInstalls")}</p>
              <p>
                <a href={localizedWebsiteHref("/downloads", locale)}>
                  {tr("docs.productDocs.nativeDownloadsHomebrewUpgradesAndStopping")} →
                </a>
              </p>
              <p>{tr("docs.productDocs.newDevicesStartWithReadOriented")}</p>
              <Code>{endpoint}</Code>
              <p>{tr("docs.productDocs.connectTheAiClientToThis")}</p>
              <div className="articleMetaLinks">
                <a href={localizedWebsiteHref("/remote-mcp", locale)}>
                  {tr("docs.productDocs.whatIsARemoteMcpServer")} →
                </a>
                <a href={localizedWebsiteHref("/install/chatgpt", locale)}>ChatGPT →</a>
                <a href={localizedWebsiteHref("/install/claude", locale)}>Claude →</a>
                <a href={localizedWebsiteHref("/install/cursor", locale)}>Cursor →</a>
              </div>
            </section>
            <section id="docs-model">
              <h2>{tr("docs.productDocs.keepUsingYourAiChat")}</h2>
              <p>{tr("docs.productDocs.askForWorkInTheChat")}</p>
              <p>{tr("docs.productDocs.aTaskIsASavedUnit")}</p>
            </section>
            <section id="docs-routing">
              <h2>{tr("docs.productDocs.howExecutionReachesYourComputer")}</h2>
              <p>{tr("docs.productDocs.theLocalExecutionPlaneIsGo")}</p>
              <div className="articleFlow">
                <code>AI / Plugin</code>
                <span>→</span>
                <code>OAuth · MCP</code>
                <span>→</span>
                <code>Cloudflare Worker</code>
                <span>→</span>
                <code>Durable Object</code>
                <span>→</span>
                <code>outbound WSS</code>
                <span>→</span>
                <code>{tr("docs.productDocs.localAgent")}</code>
              </div>
              <p>{tr("docs.productDocs.theWorkerAuthenticatesTheAccountAnd")}</p>
              <p>{tr("docs.productDocs.noPublicInboundPortRouterForwarding")}</p>
              <div className="articleMetaLinks">
                <a href={localizedWebsiteHref("/docs/engineering-architecture", locale)}>
                  {tr("docs.productDocs.engineeringReference")} →
                </a>
              </div>
            </section>
            <ArchitectureDeepDive />
            <section id="docs-policy">
              <h2>{tr("docs.productDocs.choosePermissionsForEachComputer")}</h2>
              <div className="docsTableWrap">
                <table className="articleTable">
                  <thead>
                    <tr>
                      <th>{tr("docs.productDocs.control")}</th>
                      <th>{tr("docs.productDocs.whatItGoverns")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>OAuth scopes</td>
                      <td>{tr("docs.productDocs.theAiClientSAccountLevel")}</td>
                    </tr>
                    <tr>
                      <td>{tr("docs.productDocs.allowedTools")}</td>
                      <td>{tr("docs.productDocs.readEditTerminalAndBrowserCapabilities")}</td>
                    </tr>
                    <tr>
                      <td>Trusted Write Locations</td>
                      <td>{tr("docs.productDocs.persistentRootsWhereFileMutationCan")}</td>
                    </tr>
                    <tr>
                      <td>Sensitive Path Policy</td>
                      <td>{tr("docs.productDocs.credentialAndBrowserProfilePathsWith")}</td>
                    </tr>
                    <tr>
                      <td>Safety Guard</td>
                      <td>{tr("docs.productDocs.beforeATerminalCommandRunsResolves")}</td>
                    </tr>
                    <tr>
                      <td>{tr("docs.productDocs.taskPermissions")}</td>
                      <td>{tr("docs.productDocs.backgroundWorkSchedulingAdaptiveGoalsSource")}</td>
                    </tr>
                    <tr>
                      <td>{tr("docs.productDocs.localCeiling")}</td>
                      <td>{tr("docs.productDocs.npxRemotelinkSafeKeepsALocal")}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p>{tr("docs.productDocs.taskPermissionsDoNotGrantMissing")}</p>
            </section>
            <section id="docs-files">
              <h2>{tr("docs.productDocs.filesProtectedPathsAndLocalUndo")}</h2>
              <p>{tr("docs.productDocs.fileReadsAndWritesAreIndependent")}</p>
              <p>{tr("docs.productDocs.supportedWriteFileAndEditBlock")}</p>
            </section>
            <section id="docs-processes">
              <h2>{tr("docs.productDocs.aProcessHandleAndADurable")}</h2>
              <p>{tr("docs.productDocs.listProcessesInspectsOsProcessesWithout")}</p>
              <div className="docsTableWrap">
                <table className="articleTable">
                  <thead>
                    <tr>
                      <th>{tr("docs.productDocs.whatPersists")}</th>
                      <th>{tr("docs.productDocs.afterAnInterruption")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>{tr("docs.productDocs.directBackgroundProcess")}</td>
                      <td>{tr("docs.productDocs.itsHandleAndCapturedOutputAre")}</td>
                    </tr>
                    <tr>
                      <td>{tr("docs.productDocs.durableTask")}</td>
                      <td>{tr("docs.productDocs.theSavedContractProgressAndRun")}</td>
                    </tr>
                    <tr>
                      <td>{tr("docs.productDocs.alwaysOnOsService")}</td>
                      <td>{tr("docs.productDocs.useAServiceManagerForA")}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p>{tr("docs.productDocs.forAKnownAcknowledgedProcessWhose")}</p>
              <p>{tr("docs.productDocs.useADurableLongTaskFor")}</p>
            </section>
            <section id="docs-automations">
              <h2>{tr("docs.productDocs.durableTasksSaveExecutionNotAn")}</h2>
              <p>{tr("docs.productDocs.useADurableTaskWhenThe")}</p>
              <div className="docsTableWrap">
                <table className="articleTable">
                  <thead>
                    <tr>
                      <th>{tr("docs.productDocs.mode")}</th>
                      <th>{tr("docs.productDocs.behavior")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>{tr("docs.productDocs.longTask")}</td>
                      <td>{tr("docs.productDocs.startAndTrackOneKnownCommand")}</td>
                    </tr>
                    <tr>
                      <td>{tr("docs.productDocs.schedule")}</td>
                      <td>{tr("docs.productDocs.runApprovedDeterministicWorkLaterOr")}</td>
                    </tr>
                    <tr>
                      <td>{tr("docs.productDocs.conditionWatch")}</td>
                      <td>{tr("docs.productDocs.waitForAConfiguredEventThen")}</td>
                    </tr>
                    <tr>
                      <td>{tr("docs.productDocs.verificationLoop")}</td>
                      <td>{tr("docs.productDocs.repeatTheSameBoundedWorkAnd")}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p>{tr("docs.productDocs.aOneMinuteCloudSchedulerAdvances")}</p>
            </section>
            <section id="docs-continuation">
              <h2>{tr("docs.productDocs.freshAiJudgmentHasAHard")}</h2>
              <p>{tr("docs.productDocs.connectKeepsDeterministicCommandsAndWaits")}</p>
              <p>{tr("docs.productDocs.connectCannotPromiseToWakeThe")}</p>
              <a href={localizedWebsiteHref("/docs/long-running-work", locale)}>
                {tr("docs.productDocs.durableTaskBoundaries")} →
              </a>
            </section>
            <section id="docs-schedule">
              <h2>{tr("docs.productDocs.futureStartsRecurringWorkAndKeeping")}</h2>
              <p>{tr("docs.productDocs.durableDeterministicTasksSupportAFuture")}</p>
              <p>{tr("docs.productDocs.theCurrentNativeAgentSeparatesProcess")}</p>
              <p>{tr("docs.productDocs.taskKeepAwakeRequiresBothDevice")}</p>
            </section>
            <section id="docs-browser">
              <h2>{tr("docs.productDocs.readTheTabsYouExplicitlyShare")}</h2>
              <p>{tr("docs.productDocs.theChromeCompanionAddsScopedPage")}</p>
              <a href={localizedWebsiteHref("/docs/mcp#chrome-browser", locale)}>
                {tr("docs.productDocs.installTheBrowserCompanion")} →
              </a>
            </section>
            <section id="docs-sandbox">
              <h2>{tr("docs.productDocs.nativeExecutionAndSandboxIsolation")}</h2>
              <p>{tr("docs.productDocs.sandboxIsolationWouldPlaceCommandsIn")}</p>
              <p>{tr("docs.productDocs.anAiClientSOwnSandbox")}</p>
              <p>{tr("docs.productDocs.aSelectableIsolatedExecutionProfileIs")}</p>
              <a href={localizedWebsiteHref("/docs/execution-isolation", locale)}>
                {tr("docs.productDocs.isolationDesignDecision")} →
              </a>
            </section>
            <section id="docs-tools">
              <h2>{tr("docs.productDocs.publicMcpTools")}</h2>
              <ToolReference />
            </section>
            <section id="docs-data">
              <h2>{tr("docs.productDocs.whatPassesThroughTheRelayAnd")}</h2>
              <p>{tr("docs.productDocs.activeFileContentsToolArgumentsAnd")}</p>
              <p>{tr("docs.productDocs.durableTaskStorageIsSeparateFrom")}</p>
              <p>{tr("docs.productDocs.hostedGoalsSendBoundedContextTo")}</p>
              <p>{tr("docs.productDocs.arcAdditionallyStoresEncryptedChatMessages")}</p>
              <a href={localizedWebsiteHref("/privacy", locale)}>
                {tr("docs.productDocs.privacyDetails")} →
              </a>
            </section>
            <section id="docs-troubleshoot">
              <h2>{tr("docs.productDocs.whenWorkIsNotProgressing")}</h2>
              <ul className="articleBulletList">
                <li>{tr("docs.productDocs.deviceOfflineCheckPowerLoginLocal")}</li>
                <li>{tr("docs.productDocs.toolUnavailableInspectDeviceToolsDevice")}</li>
                <li>{tr("docs.productDocs.needsFreshAiJudgmentTheDeterministic")}</li>
                <li>{tr("docs.productDocs.policyChangedOrResultUnknownRead")}</li>
                <li>{tr("docs.productDocs.finishedWithoutIndependentVerificationProvideA")}</li>
              </ul>
            </section>
            <section id="docs-limits">
              <h2>{tr("docs.productDocs.availabilityAndPracticalLimits")}</h2>
              <p>{tr("docs.productDocs.remoteMcpExposesAuthorizedAppAnd")}</p>
              <p>{tr("docs.productDocs.remoteArcDoesNotProvideGui")}</p>
              <div className="articleEndLinks">
                <a href={localizedWebsiteHref("/docs/long-running-work", locale)}>
                  {tr("docs.productDocs.longRunningWork2")} →
                </a>
                <a href={localizedWebsiteHref("/security-model", locale)}>
                  {tr("docs.productDocs.securityModel")} →
                </a>
                <a href={localizedWebsiteHref("/use-cases", locale)}>
                  {tr("docs.productDocs.useCases")} →
                </a>
              </div>
            </section>
          </SelectedSections>
        </article>
      </div>
    </main>
  );
}

export function McpReference() {
  const { tr, locale } = useI18n();
  return (
    <main className="technicalDoc productDocs">
      <header className="articleHeader">
        <span className="eyebrow">REMOTE MCP</span>
        <h1>{tr("docs.productDocs.oneConnectionForYourAppsAnd")}</h1>
        <p>{tr("docs.productDocs.addRemoteArcToACompatible")}</p>
        <Code>{endpoint}</Code>
      </header>
      <div className="technicalDocLayout">
        <aside className="articleToc">
          <strong>{tr("docs.productDocs.contents")}</strong>
          {[
            ["mcp-connect", tr("docs.productDocs.connectYourClient")],
            ["mcp-auth", tr("docs.productDocs.authorization")],
            ["mcp-device", tr("docs.productDocs.selectADevice")],
            ["mcp-apps", tr("docs.productDocs.useConnectedApps")],
            ["mcp-tools", tr("docs.productDocs.toolsAndScopes")],
            ["browser-runner", tr("docs.productDocs.taskBrowsers")],
            ["your-chrome", tr("docs.productDocs.yourChromeAdvanced")],
            ["chrome-browser", tr("docs.productDocs.browserCompanion")],
          ].map(([id, label]) => (
            <a key={id} href={"#" + id}>
              {label}
            </a>
          ))}
        </aside>
        <article className="technicalArticle">
          <section id="mcp-connect">
            <h2>{tr("docs.productDocs.connectUsingTheClientInstallationPath")}</h2>
            <p>{tr("docs.productDocs.inChatgptInstallThePublishedRemote")}</p>
            <p>
              <a
                href="https://developers.openai.com/plugins/deploy/connect-chatgpt"
                target="_blank"
                rel="noreferrer"
              >
                {tr("docs.productDocs.officialOpenaiConnectionGuide")} ↗
              </a>
            </p>
            <p>{tr("docs.productDocs.claudeUsesACustomRemoteMcp")}</p>
            <div className="articleMetaLinks">
              <a href={localizedWebsiteHref("/install/chatgpt", locale)}>ChatGPT →</a>
              <a href={localizedWebsiteHref("/install/claude", locale)}>Claude →</a>
              <a href={localizedWebsiteHref("/install/cursor", locale)}>Cursor →</a>
            </div>
          </section>
          <section id="mcp-auth">
            <h2>{tr("docs.productDocs.oauthAndDeviceAccessAreSeparate")}</h2>
            <p>{tr("docs.productDocs.theEndpointUsesOauthAuthorizationCode")}</p>
            <p>{tr("docs.productDocs.taskPermissionIsPersistentAuthorityFor")}</p>
          </section>
          <section id="mcp-device">
            <h2>{tr("docs.productDocs.discoverBeforeActing")}</h2>
            <ol>
              <li>{tr("docs.productDocs.callListDevicesAndResolveThe")}</li>
              <li>{tr("docs.productDocs.callDeviceToolsForTheTools")}</li>
              <li>{tr("docs.productDocs.passDeviceIdWithDeviceTool")}</li>
            </ol>
            <Code>
              {
                '{ "device_id": "<id returned by list_devices>", "path": "/your/workspace/README.md" }'
              }
            </Code>
            <p>{tr("docs.productDocs.pathSyntaxIsTheTargetComputer")}</p>
          </section>
          <section id="mcp-apps">
            <h2>{tr("docs.productDocs.discoverAndUseConnectedApps")}</h2>
            <p>{tr("docs.productDocs.connectAnAvailableAppInYour")}</p>
            <Code>{'{ "provider": "github" }'}</Code>
            <p>{tr("docs.productDocs.whenTheseToolsAreAvailableIn")}</p>
            <p>{tr("docs.productDocs.reuseTheSameRequestidWhenChecking")}</p>
            <a href={localizedWebsiteHref("/docs/apps", locale)}>
              {tr("docs.productDocs.appsConnectionGuide")} →
            </a>
          </section>
          <section id="mcp-tools">
            <h2>{tr("docs.productDocs.toolsAndRequiredScopes")}</h2>
            <ToolReference />
          </section>
          <BrowserModes />
          <section id="browser-runner">
            <h2>{tr("docs.productDocs.runnerSignInOnceReuseYour")}</h2>
            <p>{tr("docs.productDocs.enableBrowserRunnerForTheComputer")}</p>
            <Code>
              {
                '{ "device_id": "<computer>", "task_id": "application", "browser": "runner", "profile": "jenny", "allowed_origins": ["https://jobs.example.com"], "start_url": "https://jobs.example.com" }'
              }
            </Code>
            <p>{tr("docs.productDocs.allowedSitesApplyToBothRunner")}</p>
          </section>
          <section id="your-chrome">
            <h2>{tr("docs.productDocs.connectTheChromeYouAlreadyUse")}</h2>
            <p>{tr("docs.productDocs.advancedAndOptionalYourAiUses")}</p>
            <ol>
              <li>{tr("docs.productDocs.openChromeOrLaterOnThe")}</li>
              <li>{tr("docs.productDocs.startTheTaskWithBrowserYour")}</li>
              <li>{tr("docs.productDocs.theTaskOpensItsOwnWindow")}</li>
            </ol>
            <Code>
              {
                '{ "device_id": "<computer>", "task_id": "chrome-application", "browser": "your_chrome", "allowed_origins": ["https://jobs.example.com"], "start_url": "https://jobs.example.com" }'
              }
            </Code>
            <p>{tr("docs.productDocs.ifChromeIsWaitingForAllow")}</p>
            <p>
              <a
                href="https://developer.chrome.com/blog/chrome-devtools-mcp-debug-your-browser-session"
                target="_blank"
                rel="noreferrer"
              >
                {tr("docs.productDocs.chromeSConnectionAndPermissionGuide")} ↗
              </a>
            </p>
          </section>
          <section id="chrome-browser">
            <h2>{tr("docs.productDocs.installTheScopedChromeCompanion")}</h2>
            <p>
              <a href={localizedWebsiteHref("/chrome-extension", locale)}>
                {tr("docs.productDocs.openTheChromeCompanionDownloadAnd")} →
              </a>
            </p>
            <p>{tr("docs.productDocs.downloadAndUnzipTheCompanionIn")}</p>
            <p>{tr("docs.productDocs.useSharedTabListToSelect")}</p>
          </section>
          <footer className="articleEndLinks">
            <a href={localizedWebsiteHref("/docs", locale)}>
              {tr("docs.productDocs.productDocumentation")} →
            </a>
            <a href={localizedWebsiteHref("/security-model", locale)}>
              {tr("docs.productDocs.securityModel")} →
            </a>
          </footer>
        </article>
      </div>
    </main>
  );
}
