import { ProductIcon } from "../../../components/product-icon.js";
import { UI_PREVIEW } from "../../../preview/preview-mode.js";
import { RunnerAttentionInbox } from "../../browser-runner/runner-view.js";
import type { useRunnerAttention } from "../../../hooks/use-runner-attention.js";
import { SecurityAuthorizations } from "../../security/security-authorizations.js";
import { ApprovalRequest, PersistentPermissions } from "../../security/security-approvals.js";
import { platformLabel } from "../devices/device-presets.js";
import { timeAgo } from "../format.js";
import type { DashboardModel } from "../../../hooks/dashboard/use-dashboard-model.js";

// Security tab: Remote MCP pause, AI authorizations and approvals.
export function SecurityView({
  m,
  browserAttention,
}: {
  m: DashboardModel;
  browserAttention: ReturnType<typeof useRunnerAttention>;
}) {
  const {
    decidePendingApproval,
    deviceNameById,
    devices,
    eventLabel,
    navigateTab,
    pendingApprovals,
    persistentApprovals,
    refreshSecurity,
    revokeGrant,
    revokeSavedApproval,
    securityBusy,
    securityError,
    securityState,
    setMcpPaused,
    setShowAdd,
    status,
    tr,
  } = m;
  return (
    <>
      <section className="securityTopbar">
        <div>
          <span className="eyebrow">{tr("dashboard.views.securityView.security")}</span>
          <h1>{tr("dashboard.views.securityView.securityCenter")}</h1>
        </div>
        <div className="securityTopActions">
          <button
            className={securityState?.mcpPaused ? "goldButton" : "dangerButton"}
            disabled={UI_PREVIEW || securityBusy || !securityState}
            onClick={() => void setMcpPaused(!securityState?.mcpPaused)}
          >
            {securityState?.mcpPaused
              ? tr("dashboard.views.securityView.resumeAiMcpAccess")
              : tr("dashboard.views.securityView.pauseAiMcpAccess")}
          </button>
        </div>
      </section>

      {securityError && (
        <section className="policyWarning" role="alert">
          <strong>{tr("dashboard.views.securityView.couldNotLoadSecurityData")}</strong>
          <p>{tr("dashboard.views.securityView.yourCurrentAccessStateCouldNot")}</p>
          <button
            className="ghostButton"
            disabled={securityBusy}
            onClick={() => void refreshSecurity()}
          >
            {tr("dashboard.views.securityView.retry")}
          </button>
        </section>
      )}

      <section className="securityPanel securityGrantsPanel">
        <div className="securityPanelHeader">
          <div>
            <span className="eyebrow">{tr("dashboard.views.securityView.pendingApprovals")}</span>
            <div className="headingWithHelp">
              <h2>
                {tr("dashboard.views.securityView.pendingApprovals2")}{" "}
                <span className="approvalCount">{pendingApprovals.length}</span>
              </h2>
            </div>
          </div>
          <button
            className="ghostButton"
            disabled={securityBusy}
            onClick={() => void refreshSecurity()}
          >
            {tr("dashboard.views.securityView.refresh")}
          </button>
        </div>
        <div className="securityGrantList">
          {pendingApprovals.map((approval) => (
            <ApprovalRequest
              key={approval.id}
              approval={approval}
              deviceNames={deviceNameById}
              disabled={UI_PREVIEW || securityBusy || !securityState}
              decide={decidePendingApproval}
            />
          ))}
          {!pendingApprovals.length && (
            <div className="securityEmptyState compact">
              <strong>
                {securityState
                  ? tr("dashboard.views.securityView.noPendingApprovals")
                  : securityError
                    ? tr("dashboard.views.securityView.approvalsUnavailable")
                    : tr("dashboard.views.securityView.loadingApprovals")}
              </strong>
              {securityState && (
                <span>{tr("dashboard.views.securityView.outOfScopeFileChangesWill")}</span>
              )}
            </div>
          )}
        </div>
        <RunnerAttentionInbox attention={browserAttention} />
      </section>

      <section className="securityPanel securityGrantsPanel">
        <div className="securityPanelHeader">
          <div>
            <span className="eyebrow">{tr("dashboard.views.securityView.connectedAiAccess")}</span>
            <div className="headingWithHelp">
              <h2>{tr("dashboard.views.securityView.aiAuthorizations")}</h2>
            </div>
          </div>
          <button
            className="ghostButton"
            disabled={securityBusy}
            onClick={() => void refreshSecurity()}
          >
            {tr("dashboard.views.securityView.refresh")}
          </button>
        </div>
        {securityState && securityState.grants.length > 0 && (
          <SecurityAuthorizations
            grants={securityState.grants}
            busy={securityBusy}
            preview={UI_PREVIEW}
            timeAgo={timeAgo}
            revoke={revokeGrant}
          />
        )}
        {securityState && !securityState.grants.length && (
          <div className="securityEmptyState compact">
            <strong>{tr("dashboard.views.securityView.noAiAuthorizations")}</strong>
            <button className="ghostButton" onClick={() => navigateTab("connect")}>
              {tr("dashboard.views.securityView.connectAi")}
            </button>
          </div>
        )}
        {!securityState && (
          <div className="securityEmptyState compact">
            <strong>
              {securityError
                ? tr("dashboard.views.securityView.authorizationsUnavailable")
                : tr("dashboard.views.securityView.loadingAccessGrants")}
            </strong>
          </div>
        )}
      </section>

      {securityState && (
        <PersistentPermissions
          permissions={persistentApprovals}
          disabled={UI_PREVIEW || securityBusy}
          deviceNames={deviceNameById}
          revoke={revokeSavedApproval}
        />
      )}

      <section className="securityDeviceSection">
        <article className="securityPanel securityExposurePanel">
          <div className="securityPanelHeader">
            <div>
              <span className="eyebrow">{tr("dashboard.views.securityView.devices")}</span>
              <h2>{tr("dashboard.views.securityView.devicePermissions")}</h2>
            </div>
            <button className="ghostButton" onClick={() => navigateTab("devices")}>
              {tr("dashboard.views.securityView.manage")}
            </button>
          </div>
          <div className="securityDeviceList">
            {devices
              .slice()
              .sort((a, b) => Number(b.status === "online") - Number(a.status === "online"))
              .map((device) => {
                const enabledCount = device.allowed_tools?.length ?? device.tools.length;
                return (
                  <button
                    className="securityDeviceRow"
                    key={device.id}
                    onClick={() => navigateTab("devices")}
                  >
                    <div className="deviceIcon">
                      <ProductIcon name="device" />
                    </div>
                    <div>
                      <strong>{device.name}</strong>
                      <span>
                        {platformLabel(device.platform)} ·{" "}
                        {device.hostname || tr("dashboard.views.securityView.noHostname")}
                      </span>
                    </div>
                    <div className="securityExposureMeta">
                      <strong>{enabledCount}</strong>
                      <span>{tr("dashboard.views.securityView.toolsEnabled")}</span>
                    </div>
                    <span className={"badge " + device.status}>
                      <i />
                      {device.status}
                    </span>
                  </button>
                );
              })}
            {!devices.length && (
              <div className="securityEmptyState">
                <strong>{tr("dashboard.views.securityView.noPairedDevices")}</strong>
                <button className="ghostButton" onClick={() => setShowAdd(true)}>
                  {tr("dashboard.views.securityView.addDevice")}
                </button>
              </div>
            )}
          </div>
        </article>
      </section>

      <section className="securityActivitySection">
        <article className="securityPanel">
          <div className="securityPanelHeader">
            <div>
              <span className="eyebrow">{tr("dashboard.views.securityView.auditActivity")}</span>
              <h2>{tr("dashboard.views.securityView.recentAccess")}</h2>
            </div>
          </div>
          <div className="securityAuditList">
            {(status?.recentActivity || []).slice(0, 6).map((event) => (
              <div className="securityAuditRow" key={event.id}>
                <i className={event.success ? "eventIcon success" : "eventIcon failed"}>
                  {event.success ? "✓" : "!"}
                </i>
                <div>
                  <strong>{eventLabel(event)}</strong>
                  <span>
                    {event.client_name ||
                      event.client_id?.slice(0, 12) ||
                      tr("dashboard.views.securityView.unknownClient")}{" "}
                    ·{" "}
                    {event.device_id
                      ? deviceNameById.get(event.device_id) || event.device_id.slice(0, 8)
                      : tr("dashboard.views.securityView.account")}{" "}
                    · {timeAgo(event.created_at)}
                    {event.request_id ? " · req " + event.request_id.slice(0, 8) : ""}
                  </span>
                </div>
                <b>
                  {event.success
                    ? tr("dashboard.views.securityView.allowed")
                    : tr("dashboard.views.securityView.failed")}
                </b>
              </div>
            ))}
            {!status?.recentActivity?.length && (
              <div className="securityEmptyState compact">
                <strong>{tr("dashboard.views.securityView.noAuditEventsYet")}</strong>
              </div>
            )}
          </div>
        </article>
      </section>
    </>
  );
}
