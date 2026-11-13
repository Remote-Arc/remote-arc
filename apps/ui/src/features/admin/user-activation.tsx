import React from "react";
import {
  ACTIVATION_STAGES,
  type ActivationEvidence,
} from "../../../../../packages/protocol/src/admin-activation.js";
import { useI18n } from "../../hooks/use-i18n.js";

export function UserActivationBadge({ evidence }: { evidence: ActivationEvidence }) {
  const { tr } = useI18n();
  const stage = ACTIVATION_STAGES.find((stage) => stage.id === evidence.activation_stage);
  return (
    <span className={"opsActivationBadge stage-" + (stage?.id || "history_unknown")}>
      {stage ? tr(stage.en, stage.zh) : tr("admin.userActivation.historyIncomplete")}
    </span>
  );
}

export function UserActivationEvidence({ evidence }: { evidence: ActivationEvidence }) {
  const { tr, locale } = useI18n();
  const when = (at: string | null) =>
    at
      ? new Date(at).toLocaleString(locale === "zh" ? "zh-CN" : "en-NZ")
      : tr("admin.userActivation.notRecorded");
  return (
    <div className="opsActivationEvidence">
      <h4>{tr("admin.userActivation.activationEvidence")}</h4>
      <UserActivationBadge evidence={evidence} />
      <dl>
        <div>
          <dt>{tr("admin.userActivation.mcpOauth")}</dt>
          <dd>
            {when(evidence.first_mcp_connected_at)} · {tr("admin.userActivation.activeClients")}{" "}
            {evidence.active_mcp_connections}
          </dd>
        </div>
        <div>
          <dt>{tr("admin.userActivation.connectionSource")}</dt>
          <dd>
            {evidence.plugin_connections > 0
              ? tr("admin.userActivation.issuedOauthTokenMatchedAnOperator")
              : evidence.mcp_connections > 0
                ? tr("admin.userActivation.mcpOauthConfirmedPluginSourceUnverified")
                : tr("admin.userActivation.noIssuedMcpOauthTokenRecorded")}
          </dd>
        </div>
        <div>
          <dt>{tr("admin.userActivation.firstComputerPairing")}</dt>
          <dd>{when(evidence.first_computer_paired_at)}</dd>
        </div>
        <div>
          <dt>{tr("admin.userActivation.firstRecordedOnline")}</dt>
          <dd>{when(evidence.first_computer_online_at)}</dd>
        </div>
        <div>
          <dt>{tr("admin.userActivation.firstSuccessfulUse")}</dt>
          <dd>{when(evidence.first_success_at)}</dd>
        </div>
        <div>
          <dt>{tr("admin.userActivation.lastSuccessfulUse")}</dt>
          <dd>{when(evidence.last_success_at)}</dd>
        </div>
        <div>
          <dt>{tr("admin.userActivation.successfulDaysUtc")}</dt>
          <dd>{evidence.successful_days}</dd>
        </div>
      </dl>
      <p>{tr("admin.userActivation.successfulUseMeansACompletedDevice")}</p>
      <p>{tr("admin.userActivation.returningActiveSuccessfulUseOnAt")}</p>
    </div>
  );
}
