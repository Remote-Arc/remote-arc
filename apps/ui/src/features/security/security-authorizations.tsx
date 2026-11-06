import React, { useMemo } from "react";
import type { SecurityGrant } from "@remotearc/protocol";
import { useI18n } from "../../hooks/use-i18n.js";
import { groupAuthorizations } from "./security-grant-groups.js";
import "../../styles/security/security-authorizations.css";

type Props = {
  grants: SecurityGrant[];
  busy: boolean;
  preview: boolean;
  timeAgo: (value: string) => string;
  revoke: (grant: SecurityGrant) => Promise<void>;
};

export function SecurityAuthorizations({ grants, busy, preview, timeAgo, revoke }: Props) {
  const { tr, locale } = useI18n();
  const groups = useMemo(() => groupAuthorizations(grants), [grants]);
  const countActive = grants.filter((grant) => grant.status === "active").length;
  const countRefreshable = grants.filter((grant) => grant.status === "refreshable").length;
  const statusName = (status: SecurityGrant["status"]) =>
    status === "active"
      ? tr("security.securityAuthorizations.accessValid")
      : status === "refreshable"
        ? tr("security.securityAuthorizations.canRefresh")
        : tr("security.securityAuthorizations.expired");
  const dateTime = (value: string) =>
    new Date(value).toLocaleString(locale === "zh" ? "zh-CN" : "en-NZ", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  const expiryDate = (value: string | null) =>
    value
      ? new Date(value).toLocaleDateString(locale === "zh" ? "zh-CN" : "en-NZ", {
          year: "numeric",
          month: "short",
          day: "numeric",
        })
      : tr("security.securityAuthorizations.notIssued");

  return (
    <div className="aiAuthCompact">
      <div className="aiAuthStats">
        <span>
          <strong>{groups.length}</strong> {tr("security.securityAuthorizations.aiClients")}
        </span>
        <span>
          <strong>{grants.length}</strong> {tr("security.securityAuthorizations.authorizations")}
        </span>
        <span>
          <i className="aiAuthDot active" />
          {countActive} {tr("security.securityAuthorizations.validAccessTokens")}
        </span>
        {countRefreshable > 0 && (
          <span>
            <i className="aiAuthDot refreshable" />
            {countRefreshable} {tr("security.securityAuthorizations.refreshable")}
          </span>
        )}
      </div>
      <div className="aiAuthClients">
        {groups.map((group) => {
          const overallStatus =
            group.active > 0 ? "active" : group.refreshable > 0 ? "refreshable" : "expired";
          return (
            <details className="aiAuthClient" key={group.name.toLocaleLowerCase("en")}>
              <summary className="aiAuthClientSummary">
                <span className="aiAuthIdentity">
                  <span className="securityGrantIcon" aria-hidden="true">
                    AI
                  </span>
                  <span className="aiAuthNameBlock">
                    <strong>{group.name}</strong>
                    <small>
                      {group.grants.length}{" "}
                      {group.grants.length === 1
                        ? tr("security.securityAuthorizations.authorization")
                        : tr("security.securityAuthorizations.authorizations2")}
                    </small>
                  </span>
                </span>
                <span className={"grantState " + overallStatus}>{statusName(overallStatus)}</span>
                <span className="aiAuthActivity">
                  {tr("security.securityAuthorizations.lastToken")} ·{" "}
                  {timeAgo(new Date(group.latest).toISOString())}
                </span>
                <span className="aiAuthExpand" aria-hidden="true">
                  ⌄
                </span>
              </summary>
              <div className="aiAuthClientBody">
                {group.grants.map((grant) => (
                  <details className="aiAuthGrant" key={grant.grantId}>
                    <summary className="aiAuthGrantSummary">
                      <span className="aiAuthGrantId">
                        <strong>
                          {tr("security.securityAuthorizations.authorization2")} ·{" "}
                          {grant.grantId.slice(0, 10)}…
                        </strong>
                        <small>
                          {tr("security.securityAuthorizations.issued")}{" "}
                          {timeAgo(grant.lastTokenIssuedAt)}
                        </small>
                      </span>
                      <span className={"grantState " + grant.status}>
                        {statusName(grant.status)}
                      </span>
                      <span className="aiAuthScopeCount">
                        {grant.scopes.length} {tr("security.securityAuthorizations.permissions")}
                      </span>
                      <span className="aiAuthExpand" aria-hidden="true">
                        ⌄
                      </span>
                    </summary>
                    <div className="aiAuthGrantBody">
                      <dl className="aiAuthGrantMeta">
                        <div>
                          <dt>{tr("security.securityAuthorizations.firstAuthorized")}</dt>
                          <dd>{dateTime(grant.authorizedAt)}</dd>
                        </div>
                        <div>
                          <dt>{tr("security.securityAuthorizations.lastAccessTokenIssued")}</dt>
                          <dd>{dateTime(grant.lastTokenIssuedAt)}</dd>
                        </div>
                        <div>
                          <dt>{tr("security.securityAuthorizations.accessTokenExpires")}</dt>
                          <dd>{dateTime(grant.accessExpiresAt)}</dd>
                        </div>
                        <div>
                          <dt>
                            {tr("security.securityAuthorizations.refreshAuthorizationExpires")}
                          </dt>
                          <dd>{expiryDate(grant.refreshExpiresAt)}</dd>
                        </div>
                        <div>
                          <dt>{tr("security.securityAuthorizations.oauthClientId")}</dt>
                          <dd title={grant.clientId}>{grant.clientId.slice(0, 14)}…</dd>
                        </div>
                      </dl>
                      <div className="aiAuthPermissions">
                        <strong>{tr("security.securityAuthorizations.grantedPermissions")}</strong>
                        <div className="securityGrantScopes">
                          {grant.scopes.map((scope) => (
                            <code key={scope}>{scope}</code>
                          ))}
                        </div>
                      </div>
                      <div className="aiAuthRevokeActions">
                        <button
                          className={
                            grant.status === "expired" ? "ghostButton small" : "dangerButton small"
                          }
                          disabled={preview || busy}
                          onClick={() => void revoke(grant)}
                        >
                          {grant.status === "expired"
                            ? tr("security.securityAuthorizations.removeExpiredAuthorization")
                            : tr("security.securityAuthorizations.disconnectThisAuthorization")}
                        </button>
                      </div>
                    </div>
                  </details>
                ))}
              </div>
            </details>
          );
        })}
      </div>
    </div>
  );
}
