import React from "react";
import { CHATGPT_PLUGIN_URL } from "./client-links.js";
import { ChatGptCustomSetup } from "./chatgpt-custom-setup.js";
import { InstallCommands } from "../../components/install-commands.js";
import { useI18n } from "../../hooks/use-i18n.js";
import { localizedWebsiteHref } from "../../lib/marketing-paths.js";
import "../../styles/install/chatgpt-plugin-setup.css";

export function ChatGptPluginSetup({ endpoint }: { endpoint: string }) {
  const { tr, locale } = useI18n();
  const firstPrompt = tr("install.chatgptPluginSetup.listMyRemoteArcComputersAnd");
  return (
    <div className="chatgptPluginSetup">
      <nav className="pluginSetupTrail" aria-label={tr("install.chatgptPluginSetup.setupSteps")}>
        <a href="#installation-client">01 · {tr("install.chatgptPluginSetup.installPlugin")}</a>
        <a href="#installation-command">02 · {tr("install.chatgptPluginSetup.pairComputer")}</a>
        <a href="#installation-verify">03 · {tr("install.chatgptPluginSetup.tryInChat")}</a>
      </nav>

      <section id="installation-client" className="pluginSetupStep pluginSetupListing">
        <div>
          <span className="eyebrow">
            01 / {tr("install.chatgptPluginSetup.publishedChatgptPlugin")}
          </span>
          <h2>{tr("install.chatgptPluginSetup.installRemoteArcFromChatgptPlugins")}</h2>
          <p>{tr("install.chatgptPluginSetup.openTheRemoteArcListingBy")}</p>
          <a
            className="primaryButton"
            href={CHATGPT_PLUGIN_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            {tr("install.chatgptPluginSetup.openRemoteArcInChatgpt")} ↗
          </a>
          <p className="pluginSetupHint">
            {tr("install.chatgptPluginSetup.useThePublishedListingYouDo")}
          </p>
        </div>
        <figure>
          <img
            src="/chatgpt-setup/01-public-plugin.png"
            alt={tr("install.chatgptPluginSetup.publishedRemoteArcListingInChatgpt")}
            loading="lazy"
          />
          <figcaption>
            {tr("install.chatgptPluginSetup.publishedListingButtonsVaryWithInstallation")}
          </figcaption>
        </figure>
      </section>

      <section id="installation-command" className="pluginSetupStep">
        <span className="eyebrow">
          02 / {tr("install.chatgptPluginSetup.onTheComputerYouWantTo")}
        </span>
        <h2>{tr("install.chatgptPluginSetup.installTheAgentAndPairYour")}</h2>
        <p>{tr("install.chatgptPluginSetup.tryInChatOpensAConversation")}</p>
        <InstallCommands />
        <p>
          <a href={localizedWebsiteHref("/downloads", locale)}>
            {tr("install.chatgptPluginSetup.noNodeJsUseANative")} →
          </a>
        </p>
        <ol className="pluginSetupChecklist">
          <li>{tr("install.chatgptPluginSetup.followTheBrowserPairingPageAnd")}</li>
          <li>{tr("install.chatgptPluginSetup.matchThePairingCodeApproveYour")}</li>
          <li>{tr("install.chatgptPluginSetup.keepTheAgentRunningAndThe")}</li>
        </ol>
        <a href="https://agent.remotearc.app/devices" target="_blank" rel="noopener noreferrer">
          {tr("install.chatgptPluginSetup.checkYourPairedComputers")} ↗
        </a>
      </section>

      <section id="installation-verify" className="pluginSetupStep">
        <span className="eyebrow">03 / {tr("install.chatgptPluginSetup.verifyTheConnection")}</span>
        <h2>{tr("install.chatgptPluginSetup.returnToChatgptAndTryA")}</h2>
        <p>{tr("install.chatgptPluginSetup.chooseTryInChatFromThe")}</p>
        <blockquote>{firstPrompt}</blockquote>
        <p>{tr("install.chatgptPluginSetup.setupIsCompleteWhenChatgptReturns")}</p>
        <div className="pluginSetupTroubleshooting">
          <details>
            <summary>{tr("install.chatgptPluginSetup.noComputersFound")}</summary>
            <p>{tr("install.chatgptPluginSetup.ifYouHaveNotPairedA")}</p>
          </details>
          <details>
            <summary>{tr("install.chatgptPluginSetup.myComputerIsListedButOffline")}</summary>
            <p>{tr("install.chatgptPluginSetup.wakeTheComputerCheckItsInternet")}</p>
          </details>
          <details>
            <summary>{tr("install.chatgptPluginSetup.connectedAppsInThePublicPlugin")}</summary>
            <p>{tr("install.chatgptPluginSetup.thePublicChatgptPluginCurrentlyProvides")}</p>
          </details>
        </div>
      </section>

      <details id="custom-mcp" className="pluginSetupAdvanced">
        <summary>{tr("install.chatgptPluginSetup.advancedConnectACustomMcpServer")}</summary>
        <p>{tr("install.chatgptPluginSetup.customMcpIsStillSupportedFor")}</p>
        <pre className="docsExample">
          <code>{endpoint}</code>
        </pre>
        <ChatGptCustomSetup />
        <p>
          <a href={localizedWebsiteHref("/remote-mcp", locale)}>
            {tr("install.chatgptPluginSetup.customMcpAndOtherAiClients")} →
          </a>
        </p>
      </details>
    </div>
  );
}
