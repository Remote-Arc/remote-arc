import React, { useState } from "react";
import { useI18n } from "../../hooks/use-i18n.js";
import { ProductIcon } from "../../components/product-icon.js";
import type { PendingApproval, PersistentApproval } from "./security-state.js";

export type ApprovalChoice = "allow_once" | "allow_10m" | "allow_always" | "deny";
type SharedProps = { disabled: boolean; deviceNames: Map<string, string> };

export function ApprovalRequest({
  approval,
  disabled,
  deviceNames,
  decide,
}: SharedProps & {
  approval: PendingApproval;
  decide: (approval: PendingApproval, decision: ApprovalChoice) => Promise<void>;
}) {
  const { tr, locale } = useI18n();
  const [choice, setChoice] = useState<Exclude<ApprovalChoice, "deny">>("allow_once");
  const browser = approval.tool_name === "browser_runner_start";
  const scope =
    choice === "allow_always"
      ? browser
        ? tr("security.securityApprovals.untilRevokedForThisExactBrowser")
        : tr("security.securityApprovals.untilRevokedForThisToolAnd")
      : choice === "allow_10m"
        ? tr("security.securityApprovals.thisToolMayChangeThisFile")
        : tr("security.securityApprovals.appliesToThisExactRequestOnce");
  return (
    <article className="approvalRequest" aria-label={approval.tool_name}>
      <header className="approvalRequestHeader">
        <span className="approvalRequestIcon">
          <ProductIcon name={browser ? "link" : "book"} size={20} />
        </span>
        <div>
          <h3>
            {browser
              ? tr("security.securityApprovals.allowAccessToTheseSites")
              : tr("security.securityApprovals.allowThisFileChange")}
          </h3>
          <p>
            {approval.client_name ||
              approval.client_id ||
              tr("security.securityApprovals.aiClient")}{" "}
            · {deviceNames.get(approval.device_id) || approval.device_id}
          </p>
        </div>
        <span className="approvalWaiting">{tr("security.securityApprovals.needsApproval")}</span>
      </header>
      <div className="approvalTarget">
        <span>
          {browser
            ? tr("security.securityApprovals.taskSites")
            : tr("security.securityApprovals.file")}
        </span>
        <code>{approval.target_path}</code>
      </div>
      <div className="approvalRequestMeta">
        <code>{approval.tool_name}</code>
        <span>
          {tr("security.securityApprovals.expires")}{" "}
          {new Date(approval.expires_at).toLocaleString(locale === "zh" ? "zh-CN" : "en-NZ", {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            timeZoneName: "short",
          })}
        </span>
      </div>
      <div className="approvalDecision">
        <label>
          <span>{tr("security.securityApprovals.permissionDuration")}</span>
          <select
            aria-label={tr("security.securityApprovals.permissionDuration")}
            value={choice}
            onChange={(event) => setChoice(event.target.value as typeof choice)}
          >
            <option value="allow_once">{tr("security.securityApprovals.allowOnce")}</option>
            {!browser && (
              <option value="allow_10m">{tr("security.securityApprovals.allowForMinutes")}</option>
            )}
            <option value="allow_always">
              {browser
                ? tr("security.securityApprovals.alwaysAllowThisRequest")
                : tr("security.securityApprovals.alwaysAllowThisFile")}
            </option>
          </select>
        </label>
        <div className="approvalDecisionActions">
          <button
            className="ghostButton"
            disabled={disabled}
            onClick={() => void decide(approval, "deny")}
          >
            {tr("security.securityApprovals.deny")}
          </button>
          <button
            className="primaryButton"
            disabled={disabled}
            onClick={() => void decide(approval, choice)}
          >
            {choice === "allow_always"
              ? tr("security.securityApprovals.alwaysAllow")
              : choice === "allow_10m"
                ? tr("security.securityApprovals.allowMin")
                : tr("security.securityApprovals.allowOnce")}
          </button>
        </div>
        <p className="approvalScopeNote" aria-live="polite">
          {scope} {tr("security.securityApprovals.limitedToThisAiAuthorizationAnd")}
        </p>
      </div>
    </article>
  );
}

export function PersistentPermissions({
  permissions,
  disabled,
  deviceNames,
  revoke,
}: SharedProps & {
  permissions: PersistentApproval[];
  revoke: (permission: PersistentApproval) => Promise<void>;
}) {
  const { tr } = useI18n();
  return (
    <section
      className="securityPanel securityGrantsPanel"
      aria-label={tr("security.securityApprovals.alwaysAllowed")}
    >
      <div className="securityPanelHeader">
        <div>
          <span className="eyebrow">{tr("security.securityApprovals.savedPermissions")}</span>
          <h2>
            {tr("security.securityApprovals.alwaysAllowed")}{" "}
            <span className="approvalCount">{permissions.length}</span>
          </h2>
        </div>
      </div>
      <div className="persistentPermissionList">
        {permissions.map((permission) => (
          <article className="persistentPermission" key={permission.id}>
            <div>
              <strong>{permission.tool_name}</strong>
              <p>
                {permission.client_name ||
                  permission.client_id ||
                  tr("security.securityApprovals.aiClient")}{" "}
                · {deviceNames.get(permission.device_id) || permission.device_id}
              </p>
              <code>{permission.target_path}</code>
              <small>
                {permission.tool_name === "browser_runner_start"
                  ? tr("security.securityApprovals.exactBrowserRequestUntilRevoked")
                  : tr("security.securityApprovals.thisFileOnlyUntilRevoked")}
              </small>
            </div>
            <button
              className="ghostButton"
              disabled={disabled}
              onClick={() => void revoke(permission)}
            >
              {tr("security.securityApprovals.revoke")}
            </button>
          </article>
        ))}
      </div>
      {!permissions.length && (
        <div className="securityEmptyState compact">
          <strong>{tr("security.securityApprovals.noSavedPermissions")}</strong>
        </div>
      )}
    </section>
  );
}
