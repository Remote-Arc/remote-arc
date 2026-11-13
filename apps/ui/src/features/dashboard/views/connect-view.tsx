import { ProductIcon } from "../../../components/product-icon.js";
import { CHATGPT_PLUGIN_URL } from "../../install/client-links.js";
import { localizedWebsiteHref } from "../../../lib/marketing-paths.js";
import {
  CLAUDE_CONNECTORS_URL,
  MARKETING_ORIGIN,
  cursorMcpInstallUrl,
} from "../../../config/app-config.js";
import { CopyButton, aiClients } from "../../../components/public-layout.js";
import type { DashboardModel } from "../../../hooks/dashboard/use-dashboard-model.js";

const clientIcons = new Map(aiClients.map((client) => [client.slug, client.icon] as const));

// AI clients tab: Remote MCP endpoint and per-client setup.
export function ConnectView({ m }: { m: DashboardModel }) {
  const { devices, locale, mcpEndpoint, navigateTab, tr } = m;
  return (
    <>
      <section className="overviewTopbar connectPageHeader">
        <div>
          <span className="eyebrow">{tr("dashboard.views.connectView.connectAi")}</span>
          <h1>{tr("dashboard.views.connectView.aiConnections")}</h1>
          <p>{tr("dashboard.views.connectView.connectSupportedAiClientsToYour")}</p>
        </div>
        <div className="connectReadyPill">
          <i />
          {tr("dashboard.views.connectView.remoteMcpReady")}
        </div>
      </section>

      <section className="connectOverview">
        <article className="connectEndpointPanel">
          <div className="connectPanelHeader">
            <div>
              <span className="eyebrow">
                {tr("dashboard.views.connectView.yourRemoteMcpEndpoint")}
              </span>
              <h2>{tr("dashboard.views.connectView.remoteMcpEndpoint")}</h2>
              <p>{tr("dashboard.views.connectView.yourAiConnectsHereRemoteArc")}</p>
            </div>
            <span className="connectSecurityBadge">OAuth 2.1 + PKCE</span>
          </div>
          <div className="connectEndpointBox">
            <code>{mcpEndpoint}</code>
            <CopyButton
              value={mcpEndpoint}
              label={tr("dashboard.views.connectView.copyEndpoint")}
            />
          </div>
        </article>

        <aside className="connectHealthPanel">
          <span className="eyebrow">{tr("dashboard.views.connectView.connectionStatus")}</span>
          <div className="connectHealthRow">
            <span>
              <i className="healthDot good" />
              Remote MCP
            </span>
            <strong>{tr("dashboard.views.connectView.ready")}</strong>
          </div>
          <div className="connectHealthRow">
            <span>
              <i className="healthDot good" />
              OAuth
            </span>
            <strong>{tr("dashboard.views.connectView.enabled")}</strong>
          </div>
          <div className="connectHealthRow">
            <span>
              <i className={"healthDot " + (devices.length ? "good" : "idle")} />
              {tr("dashboard.views.connectView.pairedDevices")}
            </span>
            <strong>{devices.length}</strong>
          </div>
          <button
            className="ghostButton connectDevicesButton"
            onClick={() => navigateTab("devices")}
          >
            {tr("dashboard.views.connectView.manageDevices")}
          </button>
        </aside>
      </section>

      <section className="connectClientSection">
        <div className="connectSectionHeading">
          <div>
            <span className="eyebrow">{tr("dashboard.views.connectView.aiClients")}</span>
            <h2>{tr("dashboard.views.connectView.clients")}</h2>
          </div>
          <p>{tr("dashboard.views.connectView.chatgptIsTheRecommendedPathOther")}</p>
        </div>

        <div className="connectClientGrid connectAgentLaunchers">
          <article className="connectClientCard primary">
            <div className="connectClientTop">
              <div className="connectClientIdentity">
                <img className="monoLogo" src={clientIcons.get("chatgpt")} alt="" />
                <div>
                  <span className="eyebrow">CHATGPT</span>
                  <h3>ChatGPT</h3>
                </div>
              </div>
              <span className="clientState recommended">
                {tr("dashboard.views.connectView.plugins")}
              </span>
            </div>
            <p>{tr("dashboard.views.connectView.installThePublishedRemoteArcPlugin")}</p>
            <div className="connectClientActions">
              <a
                className="connectAgentAction"
                href={CHATGPT_PLUGIN_URL}
                target="_blank"
                rel="noreferrer"
              >
                <span>{tr("dashboard.views.connectView.openOfficialPlugin")}</span>
                <b>↗</b>
              </a>
              <a
                className="connectClientGuide"
                href={MARKETING_ORIGIN + localizedWebsiteHref("/install/chatgpt", locale)}
                target="_blank"
                rel="noreferrer"
              >
                <ProductIcon name="book" size={14} />
                <span>{tr("dashboard.views.connectView.remoteArcSetupGuide")}</span>
                <span aria-hidden="true">↗</span>
              </a>
            </div>
          </article>

          <article className="connectClientCard">
            <div className="connectClientTop">
              <div className="connectClientIdentity">
                <img className="colorLogo" src={clientIcons.get("claude")} alt="" />
                <div>
                  <span className="eyebrow">CLAUDE</span>
                  <h3>Claude</h3>
                </div>
              </div>
              <span className="clientState">{tr("dashboard.views.connectView.connectors")}</span>
            </div>
            <p>{tr("dashboard.views.connectView.openClaudeConnectorsTheRemoteArc")}</p>
            <div className="connectClientActions">
              <a
                className="connectAgentAction"
                href={CLAUDE_CONNECTORS_URL}
                target="_blank"
                rel="noreferrer"
                onClick={() =>
                  void navigator.clipboard?.writeText(mcpEndpoint).catch(() => undefined)
                }
              >
                <span>{tr("dashboard.views.connectView.openClaudeConnectors")}</span>
                <b>↗</b>
              </a>
              <a
                className="connectClientGuide"
                href={MARKETING_ORIGIN + localizedWebsiteHref("/install/claude", locale)}
                target="_blank"
                rel="noreferrer"
              >
                <ProductIcon name="book" size={14} />
                <span>{tr("dashboard.views.connectView.remoteArcSetupGuide")}</span>
                <span aria-hidden="true">↗</span>
              </a>
            </div>
          </article>

          <article className="connectClientCard">
            <div className="connectClientTop">
              <div className="connectClientIdentity">
                <img className="colorLogo" src={clientIcons.get("cursor")} alt="" />
                <div>
                  <span className="eyebrow">CURSOR</span>
                  <h3>Cursor</h3>
                </div>
              </div>
              <span className="clientState">{tr("dashboard.views.connectView.oneClickMcp")}</span>
            </div>
            <p>{tr("dashboard.views.connectView.useCursorSMcpInstallDeeplink")}</p>
            <div className="connectClientActions">
              <a className="connectAgentAction" href={cursorMcpInstallUrl()}>
                <span>{tr("dashboard.views.connectView.addToCursor")}</span>
                <b>↗</b>
              </a>
              <a
                className="connectClientGuide"
                href={MARKETING_ORIGIN + localizedWebsiteHref("/install/cursor", locale)}
                target="_blank"
                rel="noreferrer"
              >
                <ProductIcon name="book" size={14} />
                <span>{tr("dashboard.views.connectView.remoteArcSetupGuide")}</span>
                <span aria-hidden="true">↗</span>
              </a>
            </div>
          </article>

          <article className="connectClientCard">
            <div className="connectClientTop">
              <div className="connectClientIdentity">
                <span className="protocolMark large">M</span>
                <div>
                  <span className="eyebrow">REMOTE MCP</span>
                  <h3>{tr("dashboard.views.connectView.otherMcpClient")}</h3>
                </div>
              </div>
              <span className="clientState">{tr("dashboard.views.connectView.manual")}</span>
            </div>
            <p>{tr("dashboard.views.connectView.copyTheProductionEndpointAndOpen")}</p>
            <div className="connectClientActions">
              <a
                className="connectAgentAction"
                href={MARKETING_ORIGIN + localizedWebsiteHref("/docs/mcp", locale)}
                target="_blank"
                rel="noreferrer"
                onClick={() =>
                  void navigator.clipboard?.writeText(mcpEndpoint).catch(() => undefined)
                }
              >
                <span>{tr("dashboard.views.connectView.copyEndpointOpenDocs")}</span>
                <b>↗</b>
              </a>
              <a
                className="connectClientGuide"
                href={MARKETING_ORIGIN + localizedWebsiteHref("/remote-mcp", locale)}
                target="_blank"
                rel="noreferrer"
              >
                <ProductIcon name="book" size={14} />
                <span>{tr("dashboard.views.connectView.remoteArcSetupGuide")}</span>
                <span aria-hidden="true">↗</span>
              </a>
            </div>
          </article>
        </div>
      </section>

      <section className="connectGuide">
        <div className="connectSectionHeading compact">
          <div>
            <span className="eyebrow">{tr("dashboard.views.connectView.setup")}</span>
            <h2>{tr("dashboard.views.connectView.connectionFlow")}</h2>
          </div>
        </div>
        <div className="connectTimeline">
          <article>
            <span className="timelineNumber">01</span>
            <div>
              <strong>{tr("dashboard.views.connectView.addRemoteArc")}</strong>
              <p>{tr("dashboard.views.connectView.chooseYourAiClientAboveFollow")}</p>
            </div>
          </article>
          <article>
            <span className="timelineNumber">02</span>
            <div>
              <strong>{tr("dashboard.views.connectView.authorizeYourAccount")}</strong>
              <p>{tr("dashboard.views.connectView.remoteArcOpensOauthOnceYour")}</p>
            </div>
          </article>
          <article>
            <span className="timelineNumber">03</span>
            <div>
              <strong>{tr("dashboard.views.connectView.talkToADeviceByName")}</strong>
              <p>{tr("dashboard.views.connectView.remoteArcDiscoversYourPairedDevices")}</p>
            </div>
          </article>
        </div>
      </section>

      <section className="connectTryPanel">
        <div className="connectTryCopy">
          <span className="eyebrow">{tr("dashboard.views.connectView.examples")}</span>
          <h2>{tr("dashboard.views.connectView.examplePrompts")}</h2>
          <p>{tr("dashboard.views.connectView.onceConnectedReferToTheDevice")}</p>
        </div>
        <div className="connectPromptGrid">
          {[
            tr("dashboard.views.connectView.showMeMyConnectedComputers"),
            tr("dashboard.views.connectView.whichOfMyDevicesAreOnline"),
            tr("dashboard.views.connectView.listTheProjectsOnMyMac"),
            tr("dashboard.views.connectView.readPackageJsonOnMyDesktop"),
            tr("dashboard.views.connectView.runTheTestsOnMyDesktop"),
            tr("dashboard.views.connectView.showMeTheProcessesRunningOn"),
          ].map((prompt) => (
            <code key={prompt}>{prompt}</code>
          ))}
        </div>
      </section>
    </>
  );
}
