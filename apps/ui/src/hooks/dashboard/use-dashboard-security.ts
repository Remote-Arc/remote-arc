import { canonicalErrorEnvelope } from "../../../../../packages/protocol/src/error-codes.js";
import { type DashboardTab } from "../../lib/dashboard-workspaces.js";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "../use-i18n.js";
import { useLiveTopic } from "../use-live-topic.js";
import { UI_PREVIEW } from "../../preview/preview-mode.js";
import type { SecurityGrant, SecurityState } from "@remotearc/protocol";
import {
  parsePendingApprovals,
  parsePersistentApprovals,
  parseSecurityState,
  type PendingApproval,
  type PersistentApproval,
} from "../../features/security/security-state.js";
import { type ApprovalChoice } from "../../features/security/security-approvals.js";
import type { DashboardDialogs } from "./use-dashboard-dialogs.js";

type Translate = ReturnType<typeof useI18n>["tr"];

// Remote MCP pause, OAuth grants and device approval requests.
export function useDashboardSecurity({
  active,
  tr,
  refreshAll,
  showNotice,
  askConfirm,
}: {
  active: DashboardTab;
  tr: Translate;
  refreshAll: () => Promise<void>;
  showNotice: DashboardDialogs["showNotice"];
  askConfirm: DashboardDialogs["askConfirm"];
}) {
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
        fetch("/api/security"),
        fetch("/api/approvals"),
        fetch("/api/approvals/permissions"),
      ]);
      if (!securityResponse.ok || !approvalsResponse.ok || !permissionsResponse.ok)
        throw new Error("Security data unavailable");
      const [security, approvals, permissions] = await Promise.all([
        securityResponse.json().then(canonicalErrorEnvelope).then(parseSecurityState),
        approvalsResponse.json().then(canonicalErrorEnvelope).then(parsePendingApprovals),
        permissionsResponse.json().then(canonicalErrorEnvelope).then(parsePersistentApprovals),
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

  async function decidePendingApproval(approval: PendingApproval, decision: ApprovalChoice) {
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
        const payload = (await response
          .json()
          .then(canonicalErrorEnvelope)
          .catch(() => ({}))) as { error?: string };
        await showNotice(
          tr("hooks.dashboard.useDashboardSecurity.approvalWasNotUpdated"),
          payload.error || tr("hooks.dashboard.useDashboardSecurity.pleaseRefreshAndTryAgain"),
        );
        return;
      }
      await refreshSecurity();
      await refreshAll();
    } catch {
      await showNotice(
        tr("hooks.dashboard.useDashboardSecurity.approvalWasNotUpdated"),
        tr("hooks.dashboard.useDashboardSecurity.checkYourConnectionAndTryAgain"),
      );
    } finally {
      setSecurityBusy(false);
    }
  }

  async function revokeSavedApproval(permission: PersistentApproval) {
    if (UI_PREVIEW || !securityState || securityBusy) return;
    setSecurityBusy(true);
    try {
      const response = await fetch(
        "/api/approvals/" + encodeURIComponent(permission.id) + "/revoke",
        { method: "POST" },
      );
      if (!response.ok) throw new Error("revoke failed");
      await refreshSecurity();
    } catch {
      await showNotice(
        tr("hooks.dashboard.useDashboardSecurity.permissionWasNotRevoked"),
        tr("hooks.dashboard.useDashboardSecurity.refreshAndTryAgain"),
      );
    } finally {
      setSecurityBusy(false);
    }
  }

  // Approval prompts stay responsive, while the expensive OAuth grants summary
  // is loaded on entry / explicit action and refreshed only once per minute.
  async function refreshPendingApprovals() {
    try {
      const response = await fetch("/api/approvals");
      if (!response.ok) return;
      const pending = parsePendingApprovals(await response.json().then(canonicalErrorEnvelope));
      if (pending) setPendingApprovals(pending);
    } catch {
      /* Retain the last known state until the next poll. */
    }
  }

  // With the change feed, new and decided approvals arrive at once and the
  // slow poll only catches expiry. Without it, poll as before.
  const approvalsLive = useLiveTopic(
    "approvals",
    () => void refreshPendingApprovals(),
    active === "security" && !UI_PREVIEW,
  );

  useEffect(() => {
    if (active !== "security") return;
    void refreshSecurity();
    const securityTimer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refreshSecurity();
    }, 60_000);
    return () => window.clearInterval(securityTimer);
  }, [active]);

  useEffect(() => {
    if (active !== "security") return;
    const approvalsTimer = window.setInterval(
      () => {
        if (document.visibilityState === "visible") void refreshPendingApprovals();
      },
      approvalsLive ? 120_000 : 5_000,
    );
    return () => window.clearInterval(approvalsTimer);
  }, [active, approvalsLive]);

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
          tr("hooks.dashboard.useDashboardSecurity.remoteMcpAccessWasNotUpdated"),
          tr("hooks.dashboard.useDashboardSecurity.theServerDidNotAcceptThis"),
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
        ? tr("hooks.dashboard.useDashboardSecurity.removeThisExpiredAuthorization")
        : tr("hooks.dashboard.useDashboardSecurity.disconnectThisAuthorization", {
            clientName: grant.clientName,
          }),
      expired
        ? tr("hooks.dashboard.useDashboardSecurity.authorizationCanNoLongerAccessRemote", {
            shortId,
          })
        : tr("hooks.dashboard.useDashboardSecurity.onlyAuthorizationWillBeRevokedThe", { shortId }),
      expired
        ? tr("hooks.dashboard.useDashboardSecurity.removeExpiredGrant")
        : tr("hooks.dashboard.useDashboardSecurity.disconnectAuthorization"),
      "danger",
    );
    if (!confirmed) return;

    setSecurityBusy(true);
    try {
      const response = await fetch(
        "/api/security/grants/" + encodeURIComponent(grant.grantId) + "/revoke",
        { method: "POST" },
      );
      if (!response.ok) {
        await showNotice(
          tr("hooks.dashboard.useDashboardSecurity.authorizationWasNotRevoked"),
          tr("hooks.dashboard.useDashboardSecurity.remoteArcCouldNotRevokeThis"),
        );
        return;
      }
      await refreshSecurity();
      await refreshAll();
    } finally {
      setSecurityBusy(false);
    }
  }

  return {
    securityState,
    setSecurityState,
    securityError,
    setSecurityError,
    securityRefreshRevision,
    pendingApprovals,
    setPendingApprovals,
    persistentApprovals,
    setPersistentApprovals,
    securityBusy,
    setSecurityBusy,
    refreshSecurity,
    decidePendingApproval,
    revokeSavedApproval,
    refreshPendingApprovals,
    setMcpPaused,
    revokeGrant,
  };
}

export type DashboardSecurity = ReturnType<typeof useDashboardSecurity>;
