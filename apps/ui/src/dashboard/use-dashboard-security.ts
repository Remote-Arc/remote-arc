import { type DashboardTab } from "../dashboard-workspaces.js";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "../i18n.js";
import { UI_PREVIEW } from "../preview.js";
import type { SecurityGrant, SecurityState } from "@remotearc/protocol";
import { parsePendingApprovals, parsePersistentApprovals, parseSecurityState, type PendingApproval, type PersistentApproval } from "../security-state.js";
import { type ApprovalChoice } from "../security-approvals.js";
import type { DashboardDialogs } from "./use-dashboard-dialogs.js";

type Translate = ReturnType<typeof useI18n>["tr"];

// Remote MCP pause, OAuth grants and device approval requests.
export function useDashboardSecurity({ active, tr, refreshAll, showNotice, askConfirm }: { active: DashboardTab; tr: Translate; refreshAll: () => Promise<void>; showNotice: DashboardDialogs["showNotice"]; askConfirm: DashboardDialogs["askConfirm"] }) {
  const [securityState, setSecurityState] = useState<SecurityState | null>(null);
  const [securityError, setSecurityError] = useState(false);
  const securityRefreshRevision = useRef(0);
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([]);
  const [persistentApprovals, setPersistentApprovals] = useState<PersistentApproval[]>([]);
  const [securityBusy, setSecurityBusy] = useState(false);

  async function refreshSecurity() {
    const revision = ++securityRefreshRevision.current;
    try {
      const [securityResponse, approvalsResponse, permissionsResponse] = await Promise.all([
        fetch("/api/security"), fetch("/api/approvals"), fetch("/api/approvals/permissions"),
      ]);
      if (!securityResponse.ok || !approvalsResponse.ok || !permissionsResponse.ok) throw new Error("Security data unavailable");
      const [security, approvals, permissions] = await Promise.all([
        securityResponse.json().then(parseSecurityState), approvalsResponse.json().then(parsePendingApprovals), permissionsResponse.json().then(parsePersistentApprovals),
      ]);
      if (!security || !approvals || !permissions) throw new Error("Invalid security response");
      if (revision !== securityRefreshRevision.current) return;
      setSecurityState(security);
      setPendingApprovals(approvals);
      setPersistentApprovals(permissions);
      setSecurityError(false);
    } catch {
      if (revision !== securityRefreshRevision.current) return;
      setSecurityState(null);
      setPendingApprovals([]);
      setPersistentApprovals([]);
      setSecurityError(true);
    }
  }

  async function decidePendingApproval(
    approval: PendingApproval,
    decision: ApprovalChoice,
  ) {
    if (UI_PREVIEW || !securityState || securityBusy) return;
    setSecurityBusy(true);
    try {
      const response = await fetch(
        "/api/approvals/" + encodeURIComponent(approval.id) + "/decision",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ decision }),
        },
      );
      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { error?: string };
        await showNotice(
          tr("Approval was not updated", "审批未更新"),
          payload.error || tr("Please refresh and try again.", "请刷新后重试。"),
        );
        return;
      }
      await refreshSecurity();
      await refreshAll();
    } catch {
      await showNotice(tr("Approval was not updated", "审批未更新"), tr("Check your connection and try again.", "请检查网络后重试。"));
    } finally {
      setSecurityBusy(false);
    }
  }

  async function revokeSavedApproval(permission: PersistentApproval) {
    if (UI_PREVIEW || !securityState || securityBusy) return;
    setSecurityBusy(true);
    try {
      const response = await fetch("/api/approvals/" + encodeURIComponent(permission.id) + "/revoke", { method: "POST" });
      if (!response.ok) throw new Error("revoke failed");
      await refreshSecurity();
    } catch {
      await showNotice(tr("Permission was not revoked", "权限未撤销"), tr("Refresh and try again.", "请刷新后重试。"));
    } finally { setSecurityBusy(false); }
  }

  // Approval prompts stay responsive, while the expensive OAuth grants summary
  // is loaded on entry / explicit action and refreshed only once per minute.
  async function refreshPendingApprovals() {
    try {
      const response = await fetch("/api/approvals");
      if (!response.ok) return;
      const pending = parsePendingApprovals(await response.json());
      if (pending) setPendingApprovals(pending);
    } catch { /* Retain the last known state until the next poll. */ }
  }

  useEffect(() => {
    if (active !== "security") return;
    void refreshSecurity();
    const approvalsTimer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refreshPendingApprovals();
    }, 5_000);
    const securityTimer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refreshSecurity();
    }, 60_000);
    return () => {
      window.clearInterval(approvalsTimer);
      window.clearInterval(securityTimer);
    };
  }, [active]);

  async function setMcpPaused(paused: boolean) {
    if (UI_PREVIEW || !securityState) return;
    setSecurityBusy(true);
    try {
      const response = await fetch("/api/security/mcp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ paused }),
      });
      if (!response.ok) {
        await showNotice(
          tr("Remote MCP access was not updated", "Remote MCP 访问状态未更新"),
          tr("The server did not accept this change. Your current access state has been left unchanged.", "服务器没有接受这次修改，当前访问状态保持不变。"),
        );
        return;
      }
      await refreshSecurity();
      await refreshAll();
    } finally {
      setSecurityBusy(false);
    }
  }

  async function revokeGrant(grant: SecurityGrant) {
    if (UI_PREVIEW || !securityState) return;
    const shortId = grant.grantId.slice(0, 12) + "…";
    const expired = grant.status === "expired";
    const confirmed = await askConfirm(
      expired
        ? tr("Remove this expired authorization?", "移除这条已过期授权？")
        : tr("Disconnect this " + grant.clientName + " authorization?", "断开这条 " + grant.clientName + " 授权？"),
      expired
        ? tr(
            "Authorization " + shortId + " can no longer access Remote Arc. Removing it clears this expired grant from your account history. Your paired computers and other AI authorizations are not affected.",
            "授权 " + shortId + " 已无法继续访问 Remote Arc。移除后只会清理这条已过期授权，不会影响已配对电脑或其他 AI 授权。",
          )
        : tr(
            "Only authorization " + shortId + " will be revoked. The ChatGPT session using this grant will need to complete OAuth again. Your paired computers and other ChatGPT authorizations stay connected.",
            "只会撤销授权 " + shortId + "。正在使用这条授权的 ChatGPT 之后需要重新完成 OAuth；已配对电脑以及其他 ChatGPT 授权不会受影响。",
          ),
      expired ? tr("Remove expired grant", "移除过期授权") : tr("Disconnect authorization", "断开此授权"),
      "danger",
    );
    if (!confirmed) return;

    setSecurityBusy(true);
    try {
      const response = await fetch("/api/security/grants/" + encodeURIComponent(grant.grantId) + "/revoke", { method: "POST" });
      if (!response.ok) {
        await showNotice(
          tr("Authorization was not revoked", "授权未撤销"),
          tr("Remote Arc could not revoke this authorization. Nothing was disconnected.", "Remote Arc 无法撤销这条授权，当前连接没有发生变化。"),
        );
        return;
      }
      await refreshSecurity();
      await refreshAll();
    } finally {
      setSecurityBusy(false);
    }
  }

  return { securityState, setSecurityState, securityError, setSecurityError, securityRefreshRevision, pendingApprovals, setPendingApprovals, persistentApprovals, setPersistentApprovals, securityBusy, setSecurityBusy, refreshSecurity, decidePendingApproval, revokeSavedApproval, refreshPendingApprovals, setMcpPaused, revokeGrant };
}

export type DashboardSecurity = ReturnType<typeof useDashboardSecurity>;
