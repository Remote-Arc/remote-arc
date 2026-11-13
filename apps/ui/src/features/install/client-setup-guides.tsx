import React from "react";
import { ClientInstallWalkthrough } from "./client-install-walkthrough.js";
import { ChatGptPluginSetup } from "./chatgpt-plugin-setup.js";
import { useI18n } from "../../hooks/use-i18n.js";
import "../../styles/install/client-setup-guides.css";

type Client = "chatgpt" | "claude" | "gemini" | "cursor";
const claudeConnectors = "https://claude.ai/customize/connectors";
const geminiConnectors = "https://gemini.google.com/apps";
const geminiDocs = "https://support.google.com/gemini/answer/17209137";
const claudeDocs =
  "https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp";
const cursorDocs = "https://cursor.com/docs/mcp";
const cursorCustomize = "https://cursor.com/docs/customize-cursor";
const cursorInstallDocs = "https://prod.cursor.com/docs/mcp/install-links";

function OutLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children} ↗
    </a>
  );
}

export function ClientMcpGuide({
  client,
  endpoint,
  cursorInstallUrl,
  copyEndpoint,
}: {
  client: Client;
  endpoint: string;
  cursorInstallUrl: string;
  copyEndpoint: React.ReactNode;
}) {
  const { tr } = useI18n();
  if (client === "chatgpt") return <ChatGptPluginSetup endpoint={endpoint} />;
  const info =
    client === "claude"
      ? {
          destination: claudeConnectors,
          destinationLabel: tr("install.clientSetupGuides.openClaudeConnectors"),
          path: tr("install.clientSetupGuides.customizeConnectorsAddAddCustomConnector"),
          steps: [
            tr("install.clientSetupGuides.openClaudeCustomizeConnectorsAndAdd"),
            tr("install.clientSetupGuides.setTheNameToRemoteArc"),
            tr("install.clientSetupGuides.clickConnectAndFinishRemoteArc"),
          ],
          docs: claudeDocs,
          access: claudeDocs,
          important: tr("install.clientSetupGuides.teamEnterpriseOrganizationMembersMayNeed"),
        }
      : client === "gemini"
        ? {
            destination: geminiConnectors,
            destinationLabel: tr("install.clientSetupGuides.openGeminiConnectors"),
            path: tr("install.clientSetupGuides.settingsConnectedAppsCustomApps"),
            steps: [
              tr("install.clientSetupGuides.inGeminiOnTheWebOpen"),
              tr("install.clientSetupGuides.reviewGoogleSAccountLinkingConsent"),
              tr("install.clientSetupGuides.finishTheConnectionAndReviewThe"),
            ],
            docs: geminiDocs,
            access: geminiDocs,
            important: tr("install.clientSetupGuides.googleCurrentlyLimitsCustomAppsTo"),
          }
        : {
            destination: cursorInstallUrl,
            destinationLabel: tr("install.clientSetupGuides.addToCursorOneClick"),
            path: tr("install.clientSetupGuides.customizeMcpsManage"),
            steps: [
              tr("install.clientSetupGuides.theEasiestOptionIsAddTo"),
              tr("install.clientSetupGuides.forManualSetupOpenCursorCustomize"),
              tr("install.clientSetupGuides.completeTheOauthSignInWhen"),
            ],
            docs: cursorDocs,
            access: cursorInstallDocs,
            important: tr("install.clientSetupGuides.doNotPutNpxRemotelinkIn"),
          };

  return (
    <section className="installClientDetails" id="installation-client">
      <div className="installClientDetailsHeading">
        <div>
          <span className="eyebrow">{tr("install.clientSetupGuides.requiredAiClient")}</span>
          <h2>
            {tr("install.clientSetupGuides.addRemoteArcInside") +
              (client === "claude" ? "Claude" : client === "gemini" ? "Gemini" : "Cursor")}
          </h2>
          <p>{tr("install.clientSetupGuides.thisIsASeparateStepFrom")}</p>
        </div>
        <OutLink href={info.destination}>{info.destinationLabel}</OutLink>
      </div>
      <div className="installUiTrail">
        <small>{tr("install.clientSetupGuides.clickPathInTheApp")}</small>
        <strong>{info.path}</strong>
      </div>
      {client === "cursor" && (
        <ol className="installClientChecklist">
          {info.steps.map((step, i) => (
            <li key={i}>
              <span>{String(i + 1).padStart(2, "0")}</span>
              <p>{step}</p>
            </li>
          ))}
        </ol>
      )}
      <div className="installEndpointPanel">
        <div>
          <small>{tr("install.clientSetupGuides.pasteThisRemoteMcpUrl")}</small>
          <div className="docsCodeLine">
            <code>{endpoint}</code>
            {copyEndpoint}
          </div>
        </div>
        <p>
          {tr("install.clientSetupGuides.connectionName")}: <strong>Remote Arc</strong> ·{" "}
          {tr("install.clientSetupGuides.transport")}: <strong>Streamable HTTP + OAuth</strong>
        </p>
      </div>
      {client !== "cursor" && <ClientInstallWalkthrough client={client} />}
      {client === "cursor" && (
        <div className="installCursorJson">
          <strong>{tr("install.clientSetupGuides.manualAlternativeMcpJson")}</strong>
          <pre>{JSON.stringify({ mcpServers: { "remote-arc": { url: endpoint } } }, null, 2)}</pre>
        </div>
      )}
      <div className="installClientSupport">
        <p>{info.important}</p>
        <nav aria-label={tr("install.clientSetupGuides.officialSetupReferences")}>
          <OutLink href={info.docs}>
            {tr("install.clientSetupGuides.officialUiWalkthrough")}
          </OutLink>
          {info.access !== info.docs && (
            <OutLink href={info.access}>
              {tr("install.clientSetupGuides.accountAvailabilityAndPermissions")}
            </OutLink>
          )}
          {client === "cursor" && (
            <OutLink href={cursorCustomize}>
              {tr("install.clientSetupGuides.cursorCustomizeUi")}
            </OutLink>
          )}
        </nav>
      </div>
    </section>
  );
}
