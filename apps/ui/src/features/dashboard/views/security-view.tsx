import { ProductIcon } from "../../../components/product-icon.js";
import { UI_PREVIEW } from "../../../preview/preview-mode.js";
import { SecurityAuthorizations } from "../../security/security-authorizations.js";
import { ApprovalRequest, PersistentPermissions } from "../../security/security-approvals.js";
import { platformLabel } from "../devices/device-presets.js";
import { timeAgo } from "../format.js";
import type { DashboardModel } from "../hooks/use-dashboard-model.js";

// Security tab: Remote MCP pause, AI authorizations and approvals.
export function SecurityView({ m }: { m: DashboardModel }) {
  const {
    decidePendingApproval, deviceNameById, devices, eventLabel, navigateTab, pendingApprovals,
    persistentApprovals, refreshSecurity, revokeGrant, revokeSavedApproval, securityBusy,
    securityError, securityState, setMcpPaused, setShowAdd, status, tr,
  } = m;
  return (
    <>
      <section className="securityTopbar">
        <div>
          <span className="eyebrow">{tr("SECURITY", "安全")}</span>
          <h1>{tr("Security center", "安全中心")}</h1>
        </div>
        <div className="securityTopActions">
          <button className={securityState?.mcpPaused ? "goldButton" : "dangerButton"} disabled={UI_PREVIEW || securityBusy || !securityState} onClick={() => void setMcpPaused(!securityState?.mcpPaused)}>
            {securityState?.mcpPaused ? tr("Resume AI MCP access", "恢复 AI MCP 访问") : tr("Pause AI MCP access", "暂停 AI MCP 访问")}
          </button>
        </div>
      </section>

      {securityError && <section className="policyWarning" role="alert">
        <strong>{tr("Could not load security data", "无法加载安全数据")}</strong>
        <p>{tr("Your current access state could not be verified. Refresh to try again.", "当前访问状态暂无法确认，请刷新后重试。")}</p>
        <button className="ghostButton" disabled={securityBusy} onClick={() => void refreshSecurity()}>{tr("Retry", "重试")}</button>
      </section>}

      <section className="securityPanel securityGrantsPanel">
        <div className="securityPanelHeader">
          <div>
            <span className="eyebrow">{tr("PENDING APPROVALS", "待审批")}</span>
            <div className="headingWithHelp">
              <h2>{tr("Pending approvals", "待审批请求")} <span className="approvalCount">{pendingApprovals.length}</span></h2>
            </div>
          </div>
          <button className="ghostButton" disabled={securityBusy} onClick={() => void refreshSecurity()}>{tr("Refresh", "刷新")}</button>
        </div>
        <div className="securityGrantList">
          {pendingApprovals.map(approval => <ApprovalRequest key={approval.id} approval={approval}
            deviceNames={deviceNameById} disabled={UI_PREVIEW || securityBusy || !securityState} decide={decidePendingApproval}/>)}
          {!pendingApprovals.length && (
            <div className="securityEmptyState compact">
              <strong>{securityState ? tr("No pending approvals", "暂无待审批请求") : securityError ? tr("Approvals unavailable", "暂无法获取审批请求") : tr("Loading approvals…", "正在加载审批请求…")}</strong>
              {securityState && <span>{tr("Out-of-scope file changes will appear here and in an interactive remotelink terminal.", "超出可信写入范围的文件修改会显示在这里，也会显示在交互式 remotelink 终端中。")}</span>}
            </div>
          )}
        </div>
      </section>

      <section className="securityPanel securityGrantsPanel">
        <div className="securityPanelHeader">
          <div>
            <span className="eyebrow">{tr("CONNECTED AI ACCESS", "已连接 AI 访问")}</span>
            <div className="headingWithHelp">
              <h2>{tr("AI authorizations", "AI 授权")}</h2>
            </div>
          </div>
          <button className="ghostButton" disabled={securityBusy} onClick={() => void refreshSecurity()}>{tr("Refresh", "刷新")}</button>
        </div>
        {securityState && securityState.grants.length > 0 && (
          <SecurityAuthorizations grants={securityState.grants} busy={securityBusy}
            preview={UI_PREVIEW} timeAgo={timeAgo} revoke={revokeGrant} />
        )}
        {securityState && !securityState.grants.length && <div className="securityEmptyState compact"><strong>{tr("No AI authorizations", "暂无 AI 授权")}</strong><button className="ghostButton" onClick={() => navigateTab("connect")}>{tr("Connect AI", "连接 AI")}</button></div>}
        {!securityState && <div className="securityEmptyState compact"><strong>{securityError ? tr("Authorizations unavailable", "暂无法获取授权") : tr("Loading access grants…", "正在加载访问授权…")}</strong></div>}
      </section>

      {securityState && <PersistentPermissions permissions={persistentApprovals} disabled={UI_PREVIEW || securityBusy} deviceNames={deviceNameById} revoke={revokeSavedApproval}/>}

      <section className="securityDeviceSection">
        <article className="securityPanel securityExposurePanel">
          <div className="securityPanelHeader">
            <div><span className="eyebrow">{tr("DEVICES", "设备")}</span><h2>{tr("Device permissions", "设备权限")}</h2></div>
            <button className="ghostButton" onClick={() => navigateTab("devices")}>{tr("Manage", "管理")}</button>
          </div>
          <div className="securityDeviceList">
            {devices.slice().sort((a,b) => Number(b.status === "online") - Number(a.status === "online")).map((device) => {
              const enabledCount = device.allowed_tools?.length ?? device.tools.length;
              return <button className="securityDeviceRow" key={device.id} onClick={() => navigateTab("devices")}>
                <div className="deviceIcon"><ProductIcon name="device"/></div>
                <div><strong>{device.name}</strong><span>{platformLabel(device.platform)} · {device.hostname || tr("No hostname", "无 Hostname")}</span></div>
                <div className="securityExposureMeta"><strong>{enabledCount}</strong><span>{tr("tools enabled", "个工具已启用")}</span></div>
                <span className={"badge " + device.status}><i />{device.status}</span>
              </button>;
            })}
            {!devices.length && <div className="securityEmptyState"><strong>{tr("No paired devices", "暂无配对设备")}</strong><button className="ghostButton" onClick={() => setShowAdd(true)}>{tr("Add device", "添加设备")}</button></div>}
          </div>
        </article>

      </section>

      <section className="securityActivitySection">
        <article className="securityPanel">
          <div className="securityPanelHeader">
            <div><span className="eyebrow">{tr("AUDIT ACTIVITY", "审计活动")}</span><h2>{tr("Recent access", "最近访问")}</h2></div>
          </div>
          <div className="securityAuditList">
            {(status?.recentActivity || []).slice(0,6).map((event) => (
              <div className="securityAuditRow" key={event.id}>
                <i className={event.success ? "eventIcon success" : "eventIcon failed"}>{event.success ? "✓" : "!"}</i>
                <div><strong>{eventLabel(event)}</strong><span>{event.client_name || event.client_id?.slice(0,12) || tr("Unknown client", "未知客户端")} · {event.device_id ? deviceNameById.get(event.device_id) || event.device_id.slice(0,8) : tr("Account", "账户")} · {timeAgo(event.created_at)}{event.request_id ? " · req " + event.request_id.slice(0,8) : ""}</span></div>
                <b>{event.success ? tr("Allowed", "已允许") : tr("Failed", "失败")}</b>
              </div>
            ))}
            {!status?.recentActivity?.length && <div className="securityEmptyState compact"><strong>{tr("No audit events yet", "暂无审计事件")}</strong></div>}
          </div>
        </article>

      </section>

    </>
  );
}
