import { ClientMcpGuide } from "./client-setup-guides.js";
import { CHATGPT_PLUGIN_URL } from "./client-links.js";
import { useEffect, useState } from "react";
import { useI18n } from "../../hooks/use-i18n.js";
import { CopyButton, LogoMark, PublicLayout, aiClients } from "../../components/public-layout.js";
import { type User } from "../../types/app-types.js";
import {
  CLAUDE_CONNECTORS_URL,
  GEMINI_CONNECTORS_URL,
  MCP_ENDPOINT,
  cursorMcpInstallUrl,
} from "../../config/app-config.js";

export type InstallClientSlug = "chatgpt" | "claude" | "gemini" | "cursor";
type InstallDemoConfig = {
  name: string;
  icon: string;
  prompt: string;
  working: string;
  resultLines: string[];
  terminalLines: string[];
};
function InstallTypewriterDemo({ config }: { config: InstallDemoConfig }) {
  const { tr } = useI18n();
  const [typed, setTyped] = useState("");
  const [phase, setPhase] = useState<"typing" | "sent" | "working" | "done">("typing");
  const [activityCount, setActivityCount] = useState(0);
  const [cycle, setCycle] = useState(0);

  useEffect(() => {
    setTyped("");
    setPhase("typing");
    setActivityCount(0);

    let index = 0;
    const timers: number[] = [];
    const interval = window.setInterval(() => {
      index += 1;
      setTyped(config.prompt.slice(0, index));
      if (index >= config.prompt.length) {
        window.clearInterval(interval);

        const sendAt = 520;
        const workingAt = 960;
        timers.push(
          window.setTimeout(() => {
            setTyped("");
            setPhase("sent");
          }, sendAt),
        );
        timers.push(window.setTimeout(() => setPhase("working"), workingAt));

        config.terminalLines.forEach((_, lineIndex) => {
          timers.push(
            window.setTimeout(
              () => setActivityCount(lineIndex + 1),
              workingAt + 280 + lineIndex * 430,
            ),
          );
        });

        const doneAt = workingAt + 520 + config.terminalLines.length * 430;
        timers.push(window.setTimeout(() => setPhase("done"), doneAt));
        timers.push(window.setTimeout(() => setCycle((value) => value + 1), doneAt + 4600));
      }
    }, 34);

    return () => {
      window.clearInterval(interval);
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [config.prompt, config.terminalLines, cycle]);

  const messageSent = phase !== "typing";

  return (
    <div
      className="remoteSessionDemo"
      aria-label={tr("install.clientInstallPage.simulatedRemoteArcLiveSession")}
    >
      <div className="remoteSessionHeader">
        <div>
          <LogoMark />
          <span>
            <strong>Remote Arc Live Session</strong>
            <small>{tr("install.clientInstallPage.aiRequestLocalDevice")}</small>
          </span>
        </div>
        <div className="remoteSessionStatus">
          <i />
          <span>{tr("install.clientInstallPage.personalMacOnline")}</span>
        </div>
      </div>

      <div className="remoteSessionPanels">
        <section className="sessionTerminalPanel">
          <div className="sessionPanelLabel">
            <span>{tr("install.clientInstallPage.localActivity")}</span>
            <small>{tr("install.clientInstallPage.runsOnYourComputer")}</small>
          </div>

          <div className="sessionTerminalWindow">
            <div className="sessionTerminalBar">
              <span>
                <i />
                <i />
                <i />
              </span>
              <small>remote-arc@personal-mac</small>
            </div>
            <div className="sessionTerminalBody">
              <div className="sessionTerminalPrompt">
                <span>$</span>
                <code>
                  {tr("install.clientInstallPage.remoteArcSessionClient")}
                  {config.name.toLowerCase()}
                </code>
              </div>

              <div className="sessionTerminalLine muted">
                <b>✓</b>
                <span>{tr("install.clientInstallPage.secureDeviceConnectionReady")}</span>
              </div>

              {messageSent && (
                <div className="sessionTerminalLine">
                  <b>→</b>
                  <span>{tr("install.clientInstallPage.routingRequestToPersonalMac")}</span>
                </div>
              )}

              {config.terminalLines.slice(0, activityCount).map((line, index) => (
                <div className="sessionTerminalLine" key={line + index}>
                  <b>{index === config.terminalLines.length - 1 && phase === "done" ? "✓" : "›"}</b>
                  <span>{line}</span>
                </div>
              ))}

              {phase === "working" && (
                <div className="sessionTerminalCursor">
                  <span>▌</span>
                </div>
              )}

              {phase === "typing" && (
                <div className="sessionTerminalIdle">
                  <span>{tr("install.clientInstallPage.waitingForAnAiRequest")}</span>
                </div>
              )}
            </div>
          </div>
        </section>

        <div className="sessionBridge">
          <span>Remote MCP</span>
          <i>→</i>
        </div>

        <section className="sessionChatPanel">
          <div className="sessionChatHeader">
            <div>
              <img src={config.icon} alt="" />
              <strong>{config.name}</strong>
            </div>
            <span>
              <i />
              {tr("install.clientInstallPage.remoteArcConnected")}
            </span>
          </div>

          <div className="sessionChatBody">
            {messageSent ? (
              <div className="sessionUserMessage">{config.prompt}</div>
            ) : (
              <div className="sessionChatHint">
                <strong>{tr("install.clientInstallPage.askNaturally")}</strong>
                <span>{tr("install.clientInstallPage.remoteArcWillRouteTheTask")}</span>
              </div>
            )}

            {(phase === "sent" || phase === "working") && (
              <div className="sessionAssistantState">
                <span>{config.working}</span>
                <div>
                  <i />
                  <i />
                  <i />
                </div>
              </div>
            )}

            {phase === "done" && (
              <div className="sessionAssistantResult">
                <strong>{tr("install.clientInstallPage.doneOnYourComputer")}</strong>
                <ul>
                  {config.resultLines.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className={"sessionComposer " + (phase === "typing" ? "typing" : "")}>
            <span>＋</span>
            <div>
              {phase === "typing" ? typed : tr("install.clientInstallPage.askAnotherTask")}
              {phase === "typing" && <b className="typeCursor" />}
            </div>
            <button type="button" aria-hidden="true">
              ↑
            </button>
          </div>
        </section>
      </div>

      <div className="remoteSessionFooter">
        <span>{tr("install.clientInstallPage.simulatedWalkthroughNoLiveComputerIs")}</span>
        <span>{tr("install.clientInstallPage.theSameDevicePolicyStillApplies")}</span>
      </div>
    </div>
  );
}
export function ClientInstallPage({ slug, user }: { slug: InstallClientSlug; user?: User | null }) {
  const { tr } = useI18n();
  const config =
    slug === "chatgpt"
      ? {
          name: "ChatGPT",
          icon: "/ai-openai.svg",
          eyebrow: tr("install.clientInstallPage.chatgptInstallation"),
          title: tr("install.clientInstallPage.giveChatgptAccessToYourLocal"),
          intro: tr("install.clientInstallPage.installThePublishedRemoteArcPlugin"),
          availability: tr("install.clientInstallPage.availableAsAPublishedChatgptPlugin"),
          externalHref: CHATGPT_PLUGIN_URL,
          externalLabel: tr("install.clientInstallPage.openOfficialPlugin"),
          steps: [
            {
              title: tr("install.clientInstallPage.pairYourComputer"),
              body: tr("install.clientInstallPage.runThisOnceOnTheWindows"),
              code: "npx remotelink",
            },
            {
              title: tr("install.clientInstallPage.connectTheRemoteArcPlugin"),
              body: tr("install.clientInstallPage.openThePublishedRemoteArcPlugin"),
              code: MCP_ENDPOINT,
            },
            {
              title: tr("install.clientInstallPage.askChatgptToUseYourComputer"),
              body: tr("install.clientInstallPage.nameTheMachineAndTaskIn"),
            },
          ],
          demo: {
            name: "ChatGPT",
            icon: "/ai-openai.svg",
            prompt: tr("install.clientInstallPage.organizeMyDownloadsFolderOnMy"),
            working: tr("install.clientInstallPage.workingOnYourMac"),
            resultLines: [
              tr("install.clientInstallPage.groupedScreenshotsAndDocumentsIntoFolders"),
              tr("install.clientInstallPage.movedFilesNothingWasDeleted"),
              tr("install.clientInstallPage.changesStayedInsideYourAllowedWorkspace"),
            ],
            terminalLines: [
              tr("install.clientInstallPage.policyFullDownloads"),
              tr("install.clientInstallPage.startProcessInspectAndGroupFiles"),
              tr("install.clientInstallPage.processOutputFilesPlanned"),
              tr("install.clientInstallPage.processOutputMoveCompleteDeleted"),
            ],
          },
        }
      : slug === "claude"
        ? {
            name: "Claude",
            icon: "/ai-claude.svg",
            eyebrow: tr("install.clientInstallPage.claudeInstallation"),
            title: tr("install.clientInstallPage.connectClaudeToTheComputerYou"),
            intro: tr("install.clientInstallPage.claudeCustomConnectorsSupportRemoteMcp"),
            availability: tr(
              "install.clientInstallPage.availableThroughClaudeCustomConnectorsUsing",
            ),
            externalHref: CLAUDE_CONNECTORS_URL,
            externalLabel: tr("install.clientInstallPage.openClaudeConnectors"),
            steps: [
              {
                title: tr("install.clientInstallPage.pairYourComputer"),
                body: tr("install.clientInstallPage.installTheRemoteArcAgentOn"),
                code: "npx remotelink",
              },
              {
                title: tr("install.clientInstallPage.addACustomConnector"),
                body: tr("install.clientInstallPage.inClaudeOpenCustomizeConnectorsAdd"),
                code: MCP_ENDPOINT,
              },
              {
                title: tr("install.clientInstallPage.useRemoteArcInAClaude"),
                body: tr("install.clientInstallPage.askClaudeToInspectEditOr"),
              },
            ],
            demo: {
              name: "Claude",
              icon: "/ai-claude.svg",
              prompt: tr("install.clientInstallPage.findWhyTheTestsFailOn"),
              working: tr("install.clientInstallPage.inspectingYourDesktop"),
              resultLines: [
                tr("install.clientInstallPage.foundOneFailingAssertionInThe"),
                tr("install.clientInstallPage.updatedTheFileAndReranThe"),
                tr("install.clientInstallPage.allTestsPassALocalUndo"),
              ],
              terminalLines: [
                tr("install.clientInstallPage.startProcessPnpmTest"),
                tr("install.clientInstallPage.processOutputFailingAssertion"),
                tr("install.clientInstallPage.readFileSrcAuthTestTs"),
                tr("install.clientInstallPage.editBlockAssertionUpdated"),
                tr("install.clientInstallPage.startProcessPnpmTestPassed"),
              ],
            },
          }
        : slug === "gemini"
          ? {
              name: "Google Gemini",
              icon: "/ai-gemini-four-color-2025.svg",
              eyebrow: tr("install.clientInstallPage.geminiInstallation"),
              title: tr("install.clientInstallPage.connectGeminiToYourOwnComputers"),
              intro: tr("install.clientInstallPage.addRemoteArcAsAGemini"),
              availability: tr("install.clientInstallPage.availableThroughGeminiSCustomMcp"),
              externalHref: GEMINI_CONNECTORS_URL,
              externalLabel: tr("install.clientInstallPage.openGeminiConnectors"),
              steps: [
                {
                  title: tr("install.clientInstallPage.pairYourComputer2"),
                  body: tr("install.clientInstallPage.runRemoteArcOnTheComputer"),
                  code: "npx remotelink",
                },
                {
                  title: tr("install.clientInstallPage.createACustomMcpConnector"),
                  body: tr("install.clientInstallPage.openGeminiConnectorsCustomPasteThe"),
                  code: MCP_ENDPOINT,
                },
                {
                  title: tr("install.clientInstallPage.useItInGemini"),
                  body: tr("install.clientInstallPage.onTheRemoteArcConnectorChoose"),
                },
              ],
              demo: {
                name: "Gemini",
                icon: "/ai-gemini-four-color-2025.svg",
                prompt: tr("install.clientInstallPage.listMyAvailableRemoteArcDevices"),
                working: tr("install.clientInstallPage.checkingYourPairedDevices"),
                resultLines: [
                  tr("install.clientInstallPage.remoteArcConnectorIsAvailable"),
                  tr("install.clientInstallPage.pairedDevicesCanBeListedThrough"),
                  tr("install.clientInstallPage.eachDeviceEnforcesItsOwnAllowed"),
                ],
                terminalLines: [
                  "Gemini → Remote Arc MCP",
                  "list_devices → allowed",
                  tr("install.clientInstallPage.deviceToolsAvailableCapabilities"),
                  tr("install.clientInstallPage.policyCheckedOnTheDevice"),
                ],
              },
            }
          : {
              name: "Cursor",
              icon: "/ai-cursor.svg",
              eyebrow: tr("install.clientInstallPage.cursorInstallation"),
              title: tr("install.clientInstallPage.letCursorReachTheMachineBehind"),
              intro: tr("install.clientInstallPage.cursorSupportsRemoteHttpMcpServers"),
              availability: tr("install.clientInstallPage.supportedThroughCursorRemoteHttpMcp"),
              externalHref: "https://cursor.com/docs/mcp",
              externalLabel: tr("install.clientInstallPage.openCursor"),
              steps: [
                {
                  title: tr("install.clientInstallPage.pairYourComputer"),
                  body: tr("install.clientInstallPage.runRemoteArcOnTheMachine"),
                  code: "npx remotelink",
                },
                {
                  title: tr("install.clientInstallPage.addRemoteArcAsAnMcp"),
                  body: tr("install.clientInstallPage.addARemoteHttpMcpServer"),
                  code: '{ "mcpServers": { "remote-arc": { "url": "' + MCP_ENDPOINT + '" } } }',
                },
                {
                  title: tr("install.clientInstallPage.useItFromAgent"),
                  body: tr("install.clientInstallPage.cursorAgentCanCallThePermitted"),
                },
              ],
              demo: {
                name: "Cursor",
                icon: "/ai-cursor.svg",
                prompt: tr("install.clientInstallPage.runTheTestsInRemoteArc"),
                working: tr("install.clientInstallPage.runningOnYourMac"),
                resultLines: [
                  tr("install.clientInstallPage.startedTheTestCommandInThe"),
                  tr("install.clientInstallPage.capturedTheProcessOutputThroughRemote"),
                  tr("install.clientInstallPage.testSuiteCompletedSuccessfully"),
                ],
                terminalLines: [
                  tr("install.clientInstallPage.policyFullWorkRemoteArc"),
                  tr("install.clientInstallPage.startProcessPnpmTestBackground"),
                  tr("install.clientInstallPage.processStatusRunning"),
                  tr("install.clientInstallPage.processOutputTestsPassed"),
                ],
              },
            };

  return (
    <PublicLayout user={user}>
      <main className="installManual">
        <header className="toolPageHeader installManualHeader">
          <nav
            className="installClientSwitcher"
            aria-label={tr("install.clientInstallPage.aiClientInstallation")}
          >
            {aiClients.map((client) => (
              <a
                className={client.slug === slug ? "active" : ""}
                aria-current={client.slug === slug ? "page" : undefined}
                href={"/install/" + client.slug}
                key={client.slug}
              >
                <img
                  className={client.tone === "mono" ? "monoLogo" : "colorLogo"}
                  src={client.icon}
                  alt=""
                />
                <span>{client.name}</span>
              </a>
            ))}
          </nav>

          <div className="toolPageTitleRow">
            <div>
              <span className="eyebrow">{tr("install.clientInstallPage.installation")}</span>
              <h1>
                {config.name} {tr("install.clientInstallPage.installation2")}
              </h1>
              <p>{config.intro}</p>
            </div>
          </div>

          <div className="toolPageStatusLine">
            <span>
              <i className="statusDot" />
              {config.availability}
            </span>
            <a href={config.externalHref} target="_blank" rel="noreferrer">
              {config.externalLabel} ↗
            </a>
          </div>
        </header>

        {slug === "chatgpt" ? (
          <ClientMcpGuide
            client="chatgpt"
            endpoint={MCP_ENDPOINT}
            cursorInstallUrl={cursorMcpInstallUrl()}
            copyEndpoint={<CopyButton value={MCP_ENDPOINT} />}
          />
        ) : (
          <>
            <section
              id="installation-command"
              className="installQuickStart"
              aria-label={tr("install.clientInstallPage.installRemoteArcOnYourComputer")}
            >
              <div className="installQuickStartCopy">
                <span className="eyebrow">
                  {tr("install.clientInstallPage.startHereInstallation")}
                </span>
                <h2>{tr("install.clientInstallPage.installAndPairYourComputer")}</h2>
                <p>
                  {tr("install.clientInstallPage.runThisOnTheWindowsMacos", { name: config.name })}
                </p>
              </div>
              <div className="installPrimaryCommand compactCommand">
                <span>{tr("install.clientInstallPage.runOnYourComputer")}</span>
                <div className="installHeroCommand">
                  <code>npx remotelink</code>
                  <CopyButton value="npx remotelink" />
                </div>
                <small>
                  {tr("install.clientInstallPage.pairsYourComputerThroughBrowserApproval")}
                </small>
                <details className="shellInstallAlternative">
                  <summary>
                    {tr("install.clientInstallPage.macosLinuxInstallWithoutNodeJs")}
                  </summary>
                  <div className="docsCodeLine">
                    <code>curl -fsSL https://remotearc.app/install.sh | sh</code>
                    <CopyButton value="curl -fsSL https://remotearc.app/install.sh | sh" />
                  </div>
                  <small>{tr("install.clientInstallPage.startsTheAgentAfterAFirstInstall")}</small>
                </details>
              </div>
              <div className="installQuickStartMcp">
                <span>{tr("install.clientInstallPage.nextAddThisRemoteMcpAddress")}</span>
                <div className="installQuickStartEndpoint docsCodeLine">
                  <code>{MCP_ENDPOINT}</code>
                  <CopyButton value={MCP_ENDPOINT} />
                </div>
              </div>
            </section>

            <div
              className="installMustDo"
              aria-label={tr("install.clientInstallPage.bothSetupStepsAreRequired")}
            >
              <article className="installMustDoCard">
                <span>{tr("install.clientInstallPage.requiredAiClient")}</span>
                <h2>{tr("install.clientInstallPage.addTheMcpAppConnector")}</h2>
                <p>
                  {tr("install.clientInstallPage.addRemoteArcInAndFinish", { name: config.name })}
                </p>
                <a href="#installation-client">
                  {tr("install.clientInstallPage.seeUiSetupSteps")} ↗
                </a>
              </article>
              <article className="installMustDoCard">
                <span>{tr("install.clientInstallPage.requiredLocalComputer")}</span>
                <h2>{tr("install.clientInstallPage.startAndPairTheLocalAgent")}</h2>
                <p>{tr("install.clientInstallPage.runTheCliOnTheMachine")}</p>
                <a href="#installation-command">
                  {tr("install.clientInstallPage.copyTheInstallationCommand")} ↗
                </a>
                <a href="#installation">{tr("install.clientInstallPage.devicePairingSteps")} ↗</a>
              </article>
            </div>

            {slug !== "cursor" && (
              <div className="installFullWidthGuide">
                <ClientMcpGuide
                  client={slug}
                  endpoint={MCP_ENDPOINT}
                  cursorInstallUrl={cursorMcpInstallUrl()}
                  copyEndpoint={<CopyButton value={MCP_ENDPOINT} />}
                />
              </div>
            )}

            <div className="manualLayout">
              <aside className="manualToc">
                <strong>{tr("install.clientInstallPage.setup")}</strong>
                <a href="#installation-command">
                  {tr("install.clientInstallPage.installationCommand")}
                </a>
                <a href="#installation-client">
                  {tr("install.clientInstallPage.mcpAppConnectorRequired")}
                </a>
                <a href="#installation">{tr("install.clientInstallPage.computerSetupRequired")}</a>
                <a href="#installation-example">
                  {tr("install.clientInstallPage.exampleSessionAfterSetup")}
                </a>
                <a href="/connect-ai">{tr("install.clientInstallPage.connectAnotherAi")}</a>
                <a href="/docs">{tr("install.clientInstallPage.documentation")}</a>
              </aside>

              <article className="manualArticle">
                {slug === "cursor" && (
                  <ClientMcpGuide
                    client={slug}
                    endpoint={MCP_ENDPOINT}
                    cursorInstallUrl={cursorMcpInstallUrl()}
                    copyEndpoint={<CopyButton value={MCP_ENDPOINT} />}
                  />
                )}
                <section id="installation">
                  <h2>{tr("install.clientInstallPage.setup2")}</h2>
                  <p>{tr("install.clientInstallPage.theComputerAndTheAiClient")}</p>

                  <ol className="manualSteps">
                    <li>
                      <span>1</span>
                      <div>
                        <h3>{tr("install.clientInstallPage.runRemoteArcOnTheComputer2")}</h3>
                        <p>{tr("install.clientInstallPage.theCliCreatesAShortLived")}</p>
                        <div className="docsCodeLine">
                          <code>npx remotelink</code>
                          <CopyButton value="npx remotelink" />
                        </div>
                        <p className="installAgentVersionNote">
                          {tr("install.clientInstallPage.toExplicitlyFetchTheLatestPublished")}
                        </p>
                      </div>
                    </li>
                    <li>
                      <span>2</span>
                      <div>
                        <h3>{tr("install.clientInstallPage.approveTheComputerAndChooseIts")}</h3>
                        <p>{tr("install.clientInstallPage.matchTheShortCodeStartRead")}</p>
                      </div>
                    </li>
                    <li>
                      <span>3</span>
                      <div>
                        <h3>{tr("install.clientInstallPage.connect", { name: config.name })}</h3>
                        <p>{config.steps[1]?.body}</p>
                        {"code" in (config.steps[1] || {}) && config.steps[1]?.code && (
                          <div className="docsCodeLine">
                            <code>{config.steps[1].code}</code>
                            <CopyButton value={config.steps[1].code} />
                          </div>
                        )}
                      </div>
                    </li>
                  </ol>

                  <div className="manualNote">
                    <strong>{tr("install.clientInstallPage.permissionBoundary")}</strong>
                    <p>{tr("install.clientInstallPage.changingAiClientsDoesNotChange")}</p>
                  </div>
                </section>

                <section className="manualFooterLinks">
                  <a href="/connect-ai">{tr("install.clientInstallPage.connectionReference")} →</a>
                  <a href="/docs">{tr("install.clientInstallPage.readTheDocumentation")} →</a>
                  <a href="/security-model">{tr("install.clientInstallPage.securityModel")} →</a>
                </section>
              </article>
            </div>

            <section id="installation-example" className="installExampleFirst">
              <div className="installExampleIntro">
                <span className="eyebrow">
                  {tr("install.clientInstallPage.afterSetupSeeItInAction")}
                </span>
                <h2>{tr("install.clientInstallPage.exampleSession")}</h2>
                <p>{tr("install.clientInstallPage.onceSetupIsCompletePreviewHow")}</p>
              </div>
              <InstallTypewriterDemo config={config.demo} />
            </section>
          </>
        )}
      </main>
    </PublicLayout>
  );
}
