import React from "react";
import { useI18n } from "../../hooks/use-i18n.js";
import { LandingArchitectureDiagram, LandingInteractiveDemo } from "./home/landing-content.js";
import "../../styles/marketing/remote-mcp-guide.css";

const endpoint = "https://mcp.remotearc.app/mcp";

const platforms = [
  { name: "macOS", logo: "/platform-brands/macos.svg" },
  { name: "Windows", logo: "/platform-brands/windows.svg" },
  { name: "Linux", logo: "/platform-brands/linux.svg" },
] as const;

const steps = [
  {
    id: "pair",
    index: "01",
    title: "marketing.remoteMcpGuide.pairAComputer",
    body: "marketing.remoteMcpGuide.installTheLocalRemoteArc",
  },
  {
    id: "connect",
    index: "02",
    title: "marketing.remoteMcpGuide.addTheRemoteMcpServer",
    body: "marketing.remoteMcpGuide.inChatgptInstallThePublished",
  },
  {
    id: "verify",
    index: "03",
    title: "marketing.remoteMcpGuide.startReadOnlyAndVerify",
    body: "marketing.remoteMcpGuide.askYourAiToList",
  },
] as const;

const clients = [
  {
    name: "ChatGPT",
    logo: "/demo-brands/chatgpt.svg",
    url: "/install/chatgpt",
    hint: "marketing.remoteMcpGuide.publishedChatgptPlugin",
  },
  {
    name: "Claude",
    logo: "/demo-brands/claude.svg",
    url: "/install/claude",
    hint: "marketing.remoteMcpGuide.customConnectorOauth",
  },
  {
    name: "Cursor",
    logo: "/demo-brands/cursor.svg",
    url: "/install/cursor",
    hint: "marketing.remoteMcpGuide.remoteHttpMcpConfiguration",
  },
] as const;

export function RemoteMcpGuide() {
  const { tr } = useI18n();
  const [copied, setCopied] = React.useState(false);
  const [highlightedBrand, setHighlightedBrand] = React.useState<string | null>(null);
  const toggleBrand = (name: string) =>
    setHighlightedBrand((previous) => (previous === name ? null : name));

  const copyEndpoint = async () => {
    try {
      await navigator.clipboard.writeText(endpoint);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="remoteMcpGuide landingContent">
      <section className="rmgHero" aria-labelledby="rmg-title">
        <div className="rmgHeroCopy">
          <div className="rmgEyebrow">
            <span className="rmgDot" /> {tr("marketing.remoteMcpGuide.theRemoteMcpGuide")}
          </div>
          <h1 id="rmg-title">
            {tr("marketing.remoteMcpGuide.remoteMcpServers")}
            <span>{tr("marketing.remoteMcpGuide.explainedAndConnected")}</span>
          </h1>
          <p>{tr("marketing.remoteMcpGuide.oneEndpointForYourAiApps")}</p>
          <div className="rmgHeroActions">
            <a className="primaryButton" href="#rmg-start">
              {tr("marketing.remoteMcpGuide.connectARemoteMcpServer")}{" "}
              <span aria-hidden="true">↗</span>
            </a>
            <a className="rmgTextLink" href="#rmg-basics">
              {tr("marketing.remoteMcpGuide.startWithTheBasics")} ↓
            </a>
          </div>
          <div className="rmgMiniFacts">
            <span>{tr("marketing.remoteMcpGuide.streamableHttp")}</span>
            <span>{tr("marketing.remoteMcpGuide.oauthAuthorization")}</span>
            <span>{tr("marketing.remoteMcpGuide.noExposedDevicePort")}</span>
          </div>
        </div>
        <div
          className="rmgHeroVisual"
          aria-label={tr("marketing.remoteMcpGuide.remoteMcpConnectionOverview")}
        >
          <div className="rmgVisualTop">
            <span className="rmgWindowDots">● ● ●</span>
            <span>remote-mcp / connection</span>
            <span className="rmgActive">
              <i />
              {tr("marketing.remoteMcpGuide.ready")}
            </span>
          </div>
          <div className="rmgVisualBody">
            <div className="rmgVisualClients">
              {clients.map((client) => (
                <button
                  type="button"
                  key={client.name}
                  className={"rmgBrandChip rmgBrandChip--" + client.name.toLowerCase()}
                  aria-pressed={highlightedBrand === client.name}
                  onClick={() => toggleBrand(client.name)}
                  title={tr("marketing.remoteMcpGuide.showBrandColors", { name: client.name })}
                >
                  <img src={client.logo} alt="" />
                  <span>{client.name}</span>
                </button>
              ))}
            </div>
            <div className="rmgVisualFlow">
              <span className="rmgFlowDash" /> <small>HTTPS · MCP · OAuth</small>{" "}
              <span className="rmgFlowDash" />
            </div>
            <div className="rmgVisualCore">
              <img src="/remote-arc-app-icon.svg" alt="" />
              <div>
                <strong>Remote Arc</strong>
                <small>Remote MCP Server</small>
              </div>
              <span className="rmgVerified">✓</span>
            </div>
            <div className="rmgVisualFlow">
              <span className="rmgFlowDash" />{" "}
              <small>{tr("marketing.remoteMcpGuide.outboundConnection")}</small>{" "}
              <span className="rmgFlowDash" />
            </div>
            <div className="rmgVisualDevices">
              {platforms.map((platform) => (
                <button
                  type="button"
                  key={platform.name}
                  className="rmgPlatformChip"
                  aria-pressed={highlightedBrand === platform.name}
                  onClick={() => toggleBrand(platform.name)}
                  title={tr("marketing.remoteMcpGuide.showLogoColors", { name: platform.name })}
                >
                  <img src={platform.logo} alt="" />
                  <span>{platform.name}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="rmgVisualFooter">
            <span className="rmgStatusDot" />{" "}
            {tr("marketing.remoteMcpGuide.yourComputersKeepControlOfTheir")}
          </div>
        </div>
      </section>

      <nav className="rmgJump" aria-label={tr("marketing.remoteMcpGuide.onThisPage")}>
        <a href="#rmg-basics">{tr("marketing.remoteMcpGuide.whatIsRemoteMcp")}</a>
        <a href="#rmg-start">{tr("marketing.remoteMcpGuide.connectionGuide")}</a>
        <a href="#rmg-demo">{tr("marketing.remoteMcpGuide.interactiveDemo")}</a>
        <a href="#rmg-security">{tr("marketing.remoteMcpGuide.securityFaq")}</a>
      </nav>

      <section className="rmgSection" id="rmg-basics">
        <div className="rmgSectionHeading">
          <span className="rmgEyebrow">{tr("marketing.remoteMcpGuide.theBasics")}</span>
          <h2>{tr("marketing.remoteMcpGuide.whatIsARemoteMcpServer")}</h2>
          <p>{tr("marketing.remoteMcpGuide.mcpModelContextProtocolIsA")}</p>
        </div>
        <div
          className="rmgCompare"
          role="group"
          aria-label={tr("marketing.remoteMcpGuide.localVersusRemoteMcp")}
        >
          <article>
            <div className="rmgCompareHead">
              <span className="rmgCompareBadge">LOCAL MCP</span>
              <span className="rmgCompareSymbol">⌘</span>
            </div>
            <h3>{tr("marketing.remoteMcpGuide.aToolServerBesideYourAi")}</h3>
            <p>{tr("marketing.remoteMcpGuide.theClientLaunchesALocalProcess")}</p>
            <div className="rmgComparePath">
              <span>AI client</span>
              <b>→ stdio →</b>
              <span>Local server</span>
            </div>
          </article>
          <article className="rmgCompareFeature">
            <div className="rmgCompareHead">
              <span className="rmgCompareBadge">REMOTE MCP</span>
              <span className="rmgCompareSymbol">↗</span>
            </div>
            <h3>{tr("marketing.remoteMcpGuide.aToolServerYourAiClient")}</h3>
            <p>{tr("marketing.remoteMcpGuide.theClientConnectsToAnHttp")}</p>
            <div className="rmgComparePath">
              <span>AI client</span>
              <b>→ HTTPS →</b>
              <span>Remote server</span>
            </div>
          </article>
        </div>
        <p className="rmgNuance">
          {tr("marketing.remoteMcpGuide.remoteDescribesWhereTheMcpEndpoint")}
        </p>
      </section>

      <section className="rmgSection rmgSetupSection" id="rmg-start">
        <div className="rmgSectionHeading">
          <span className="rmgEyebrow">{tr("marketing.remoteMcpGuide.getConnected")}</span>
          <h2>{tr("marketing.remoteMcpGuide.connectYourAiToARemote")}</h2>
          <p>{tr("marketing.remoteMcpGuide.hereSARealRemoteArc")}</p>
        </div>
        <div className="rmgSteps">
          {steps.map((step) => (
            <article id={"rmg-" + step.id} key={step.id}>
              <span className="rmgStepNumber">{step.index}</span>
              <div>
                <h3>{tr(step.title)}</h3>
                <p>{tr(step.body)}</p>
                {step.id === "pair" && (
                  <div className="rmgCommand">
                    <code>npx remotelink</code>
                    <a href="/install/chatgpt">
                      {tr("marketing.remoteMcpGuide.viewPairingInstructions")} ↗
                    </a>
                  </div>
                )}
                {step.id === "connect" && (
                  <div className="rmgCommand">
                    <code>{endpoint}</code>
                    <button
                      type="button"
                      onClick={() => void copyEndpoint()}
                      aria-label={tr("marketing.remoteMcpGuide.copyMcpEndpointUrl")}
                    >
                      {copied
                        ? tr("marketing.remoteMcpGuide.copied")
                        : tr("marketing.remoteMcpGuide.copy")}
                    </button>
                  </div>
                )}
                {step.id === "verify" && (
                  <div className="rmgExamplePrompt">
                    {tr("marketing.remoteMcpGuide.listMyRemoteArcDevicesOn")}
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
        <div className="rmgClientHeader">
          <h3>{tr("marketing.remoteMcpGuide.chooseYourClientToSeeThe")}</h3>
          <p>{tr("marketing.remoteMcpGuide.addingTheMcpEndpointInsideThe")}</p>
        </div>
        <div className="rmgClientGrid">
          {clients.map((client) => (
            <a
              key={client.name}
              href={client.url}
              className={"rmgClient rmgClient--" + client.name.toLowerCase()}
            >
              <img src={client.logo} alt="" />
              <div>
                <strong>{client.name}</strong>
                <span>{tr(client.hint)}</span>
              </div>
              <b aria-hidden="true">↗</b>
            </a>
          ))}
        </div>
      </section>

      <section className="rmgSection rmgArchitecture" id="rmg-architecture">
        <div className="rmgSectionHeading">
          <span className="rmgEyebrow">{tr("marketing.remoteMcpGuide.underTheHood")}</span>
          <h2>{tr("marketing.remoteMcpGuide.oneEndpointYourComputersYourPermissions")}</h2>
          <p>{tr("marketing.remoteMcpGuide.theAiClientDoesTheReasoning")}</p>
        </div>
        <div className="rmgArchGrid">
          <div className="rmgArchFlow">
            <div>
              <small>01 · AI CLIENT</small>
              <strong>ChatGPT / Claude / Cursor</strong>
              <span>{tr("marketing.remoteMcpGuide.decidesWhichToolsToCall")}</span>
            </div>
            <span className="rmgArchArrow">
              ↓ <small>OAuth · Streamable HTTP</small>
            </span>
            <div className="rmgArchCenter">
              <small>02 · REMOTE MCP</small>
              <strong>Remote Arc</strong>
              <span>{tr("marketing.remoteMcpGuide.scopesDevicePolicyRouting")}</span>
            </div>
            <span className="rmgArchArrow">
              ↓ <small>{tr("marketing.remoteMcpGuide.outboundDeviceWebsocket")}</small>
            </span>
            <div>
              <small>03 · DEVICE</small>
              <strong>{tr("marketing.remoteMcpGuide.yourMacWindowsLinux")}</strong>
              <span>{tr("marketing.remoteMcpGuide.approvedToolsExecuteHere")}</span>
            </div>
          </div>
          <div className="rmgSharedArchitecture">
            <LandingArchitectureDiagram />
            <a href="/blogs/how-remote-arc-works">
              {tr("marketing.remoteMcpGuide.readTheCompleteArchitectureWalkthrough")} ↗
            </a>
          </div>
        </div>
      </section>

      <section className="rmgSection rmgDemoSection" id="rmg-demo">
        <div className="rmgSectionHeading">
          <span className="rmgEyebrow">{tr("marketing.remoteMcpGuide.seeTheFlow")}</span>
          <h2>{tr("marketing.remoteMcpGuide.seeARequestMoveFromChat")}</h2>
          <p>{tr("marketing.remoteMcpGuide.chooseATaskAndSwitchBetween")}</p>
        </div>
        <LandingInteractiveDemo />
      </section>

      <section className="rmgSection rmgSecurity" id="rmg-security">
        <div className="rmgSectionHeading">
          <span className="rmgEyebrow">
            {tr("marketing.remoteMcpGuide.securityTroubleshooting")}
          </span>
          <h2>{tr("marketing.remoteMcpGuide.remoteMcpIsAConnectionNot")}</h2>
          <p>{tr("marketing.remoteMcpGuide.aRemoteEndpointCanBeReachable")}</p>
        </div>
        <div className="rmgSecurityCards">
          <article>
            <span>01</span>
            <h3>{tr("marketing.remoteMcpGuide.oauthIsNotAnOsPassword")}</h3>
            <p>{tr("marketing.remoteMcpGuide.aiClientsAuthorizeWithRemoteArc")}</p>
            <a href="/security-model">{tr("marketing.remoteMcpGuide.securityModel")} ↗</a>
          </article>
          <article>
            <span>02</span>
            <h3>{tr("marketing.remoteMcpGuide.readToolsBeforeWriteTools")}</h3>
            <p>{tr("marketing.remoteMcpGuide.fileEditingAndTerminalToolsRequire")}</p>
            <a href="/docs/mcp">{tr("marketing.remoteMcpGuide.mcpToolsScopes")} ↗</a>
          </article>
          <article>
            <span>03</span>
            <h3>{tr("marketing.remoteMcpGuide.aConnectionIsnTAnAlways")}</h3>
            <p>{tr("marketing.remoteMcpGuide.theDeviceMustBePoweredOn")}</p>
            <a href="/pricing">{tr("marketing.remoteMcpGuide.freeVsPlus")} ↗</a>
          </article>
        </div>
        <div className="rmgFaq">
          <h3>{tr("marketing.remoteMcpGuide.commonConnectionQuestions")}</h3>
          {[
            [
              tr("marketing.remoteMcpGuide.theMcpServerDoesnTAppear"),
              tr("marketing.remoteMcpGuide.inChatgptOpenThePublishedRemote"),
            ],
            [
              tr("marketing.remoteMcpGuide.theConnectionWorksButMyDevice"),
              tr("marketing.remoteMcpGuide.theComputerMayBeAsleepPowered"),
            ],
            [
              tr("marketing.remoteMcpGuide.oauthSucceededButAFileOr"),
              tr("marketing.remoteMcpGuide.oauthGrantsTheAiClientS"),
            ],
            [
              tr("marketing.remoteMcpGuide.isARemoteMcpServerThe"),
              tr("marketing.remoteMcpGuide.noRemoteMcpIsAGeneral"),
            ],
          ].map(([question, answer]) => (
            <details key={question}>
              <summary>
                {question}
                <span aria-hidden="true">＋</span>
              </summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="rmgNext">
        <div>
          <span className="rmgEyebrow">{tr("marketing.remoteMcpGuide.keepLearning")}</span>
          <h2>{tr("marketing.remoteMcpGuide.fromUnderstandingRemoteMcpToUsing")}</h2>
          <p>{tr("marketing.remoteMcpGuide.readTheImplementationDetailsFollowThe")}</p>
        </div>
        <div className="rmgNextLinks">
          <a href="/docs/mcp">{tr("marketing.remoteMcpGuide.mcpReferenceTools")} ↗</a>
          <a href="/install/chatgpt">{tr("marketing.remoteMcpGuide.connectChatgpt")} ↗</a>
          <a href="/mcp-computer-access">{tr("marketing.remoteMcpGuide.mcpComputerAccess")} ↗</a>
        </div>
      </section>
    </div>
  );
}
