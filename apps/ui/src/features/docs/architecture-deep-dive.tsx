import React from "react";
import { useI18n } from "../../hooks/use-i18n.js";

/**
 * Detailed engineering reference inside /docs.
 * The GitHub markdown is the longer engineering specification; this is the
 * readable bilingual, capability-scoped public explanation.
 */
export function ArchitectureDeepDive() {
  const { tr } = useI18n();
  return (
    <>
      <section id="docs-architecture-deep">
        <h2>{tr("docs.architectureDeepDive.architectureDeepDiveControlPlaneVs")}</h2>
        <p>{tr("docs.architectureDeepDive.remoteArcHasThreeSeparateResponsibilities")}</p>
        <div className="articleFlow">
          <code>AI / MCP</code>
          <span>→</span>
          <code>OAuth + Worker</code>
          <span>→</span>
          <code>D1 + Durable Object</code>
          <span>→</span>
          <code>Outbound WSS</code>
          <span>→</span>
          <code>Go Agent + Core</code>
        </div>
        <div className="docsTableWrap">
          <table className="articleTable">
            <thead>
              <tr>
                <th>{tr("docs.architectureDeepDive.layer")}</th>
                <th>{tr("docs.architectureDeepDive.responsibilities")}</th>
                <th>{tr("docs.architectureDeepDive.trustBoundary")}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{tr("docs.architectureDeepDive.reasoningHost")}</td>
                <td>{tr("docs.architectureDeepDive.selectsToolsAndAssessesResults")}</td>
                <td>{tr("docs.architectureDeepDive.doesNotInheritOsAuthority")}</td>
              </tr>
              <tr>
                <td>Worker + D1</td>
                <td>{tr("docs.architectureDeepDive.oauthGrantsPolicyTaskRecordsAnd")}</td>
                <td>{tr("docs.architectureDeepDive.accountScopePlanAndDeviceChecks")}</td>
              </tr>
              <tr>
                <td>Durable Object</td>
                <td>{tr("docs.architectureDeepDive.serializesArcRunsAndRoutesLive")}</td>
                <td>{tr("docs.architectureDeepDive.authenticatedOutboundDeviceSession")}</td>
              </tr>
              <tr>
                <td>Go Agent + Core</td>
                <td>{tr("docs.architectureDeepDive.filesProcessesTerminalAndUndo")}</td>
                <td>{tr("docs.architectureDeepDive.localToolsPathsAndOsUser")}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>{tr("docs.architectureDeepDive.theAgentAndGoExecutionCore")}</p>
      </section>
      <section id="docs-architecture-trust">
        <h2>{tr("docs.architectureDeepDive.authorizationDeviceOwnershipAndPolicyEvaluation")}</h2>
        <p>{tr("docs.architectureDeepDive.aPermittedCallMustPassThe")}</p>
        <p>{tr("docs.architectureDeepDive.theMostImportantLimitationTrustedWrite")}</p>
      </section>
      <section id="docs-architecture-task">
        <h2>{tr("docs.architectureDeepDive.taskLifecycleLeasesAndConcurrencyFences")}</h2>
        <p>{tr("docs.architectureDeepDive.aDurableTaskIsAStored")}</p>
        <div className="docsTableWrap">
          <table className="articleTable">
            <thead>
              <tr>
                <th>{tr("docs.architectureDeepDive.state")}</th>
                <th>{tr("docs.architectureDeepDive.meaning")}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>waiting</td>
                <td>{tr("docs.architectureDeepDive.scheduledOrAwaitingAnApprovedTrigger")}</td>
              </tr>
              <tr>
                <td>running</td>
                <td>{tr("docs.architectureDeepDive.workerOwnsTheValidLeaseAnd")}</td>
              </tr>
              <tr>
                <td>waiting_for_device</td>
                <td>{tr("docs.architectureDeepDive.executionPausesWhileTheDeviceIs")}</td>
              </tr>
              <tr>
                <td>paused / cancelled / expired</td>
                <td>{tr("docs.architectureDeepDive.distinctStopReasonsNotProofOf")}</td>
              </tr>
              <tr>
                <td>completed / failed</td>
                <td>
                  {tr("docs.architectureDeepDive.reportedOutcomeAndSupportingVerificationOr")}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>{tr("docs.architectureDeepDive.fileWritesTaskStateWritesAnd")}</p>
      </section>
      <section id="docs-architecture-persistence">
        <h2>{tr("docs.architectureDeepDive.persistenceUndoAndCrashRecovery")}</h2>
        <p>{tr("docs.architectureDeepDive.deviceReconnectionAgentProcessSupervisionAnd")}</p>
        <p>{tr("docs.architectureDeepDive.supportedWriteFileAndEditBlock")}</p>
      </section>
      <section id="docs-architecture-data">
        <h2>{tr("docs.architectureDeepDive.storagePrivacyAndObservability")}</h2>
        <div className="docsTableWrap">
          <table className="articleTable">
            <thead>
              <tr>
                <th>{tr("docs.architectureDeepDive.location")}</th>
                <th>{tr("docs.architectureDeepDive.storedOrManagedData")}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>D1</td>
                <td>{tr("docs.architectureDeepDive.accountsGrantsEncryptedArcMessagesAnd")}</td>
              </tr>
              <tr>
                <td>Durable Objects</td>
                <td>{tr("docs.architectureDeepDive.liveRoutingAndSessionOwnership")}</td>
              </tr>
              <tr>
                <td>{tr("docs.architectureDeepDive.localDevice")}</td>
                <td>{tr("docs.architectureDeepDive.pairingStateAgentLogProcessState")}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>{tr("docs.architectureDeepDive.activeToolInputAndOutputCan")}</p>
      </section>
      <section id="docs-architecture-limits">
        <h2>{tr("docs.architectureDeepDive.whatIsShippingAndWhatIs")}</h2>
        <p>{tr("docs.architectureDeepDive.arcSupportsBoundedHostedChatTasks")}</p>
        <div className="articleEndLinks">
          <a href="/docs/engineering-architecture">
            {tr("docs.architectureDeepDive.engineeringReference")} →
          </a>
          <a href="/docs/long-running-work">
            {tr("docs.architectureDeepDive.durableWorkAndLimitations")} →
          </a>
        </div>
      </section>
    </>
  );
}
