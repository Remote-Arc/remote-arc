import React, { useEffect, useState } from "react";
import { ProductIcon as Icon } from "../../../components/product-icon.js";
import { isOlderRelease, REMOTE_UPDATE_FIRST_RELEASE } from "../../install/agent-update-guide.js";
import { LATEST_AGENT_VERSION } from "../format.js";
import type { Device } from "../../../types/app-types.js";
import type { DashboardModel } from "../../../hooks/dashboard/use-dashboard-model.js";
import type { DeviceFacts } from "./device-card.js";
import "../../../styles/dashboard/agent-update-card.css";

/** How this computer can get the latest Agent. */
type UpdateRoute = "oneClick" | "offline" | "updateOnce" | "needsBackground";

function updateRoute(device: Device, runtimeVersion: string | null): UpdateRoute {
  if (device.agent_update_available === true)
    return device.status === "online" ? "oneClick" : "offline";
  // Releases before the first self-updating one need one last update by command.
  return isOlderRelease(runtimeVersion, REMOTE_UPDATE_FIRST_RELEASE)
    ? "updateOnce"
    : "needsBackground";
}

// The update panel of one computer: versions, the one-click update when the
// Agent supports it, and otherwise the command with why it is needed.
export function AgentUpdateCard({
  m,
  device,
  facts,
}: {
  m: DashboardModel;
  device: Device;
  facts: DeviceFacts;
}) {
  const { agentUpdate, agentUpdatingId, askConfirm, dismissAgentUpdate, tr, updateAgent } = m;
  const { runtimeVersion, recoveryVersion, updateAvailable, updateCommand } = facts;
  const state = agentUpdate?.deviceId === device.id ? agentUpdate : null;
  if (!updateAvailable && !state) return null;
  const route = updateRoute(device, runtimeVersion);
  const busy = state?.phase === "verifying" || state?.phase === "restarting";

  return (
    <section
      className={"agentUpdateCard" + (state ? " is-" + state.phase : "")}
      aria-labelledby={"agent-update-" + device.id}
      aria-busy={busy}
    >
      <header className="agentUpdateHeader">
        <span className="agentUpdateIcon" aria-hidden="true">
          <Icon name={state?.phase === "done" ? "check" : "arrowUp"} size={16} />
        </span>
        <div>
          <strong id={"agent-update-" + device.id}>
            {state?.phase === "done"
              ? tr("dashboard.devices.agentUpdateCard.updated", {
                  version: state.version || LATEST_AGENT_VERSION,
                })
              : tr("dashboard.devices.agentUpdateCard.updateAvailable")}
          </strong>
          {state?.phase !== "done" && (
            <p className="agentUpdateVersions">
              <span className="agentUpdateVersion current">v{runtimeVersion}</span>
              <span className="agentUpdateArrow" aria-hidden="true">
                →
              </span>
              <span className="agentUpdateVersion latest">v{LATEST_AGENT_VERSION}</span>
              <span className="srOnly">
                {tr("dashboard.devices.agentUpdateCard.versionsLabel", {
                  current: runtimeVersion || "",
                  latest: LATEST_AGENT_VERSION,
                })}
              </span>
            </p>
          )}
        </div>
      </header>

      {state ? (
        <UpdateProgress
          state={state}
          tr={tr}
          onDismiss={dismissAgentUpdate}
          onRetry={() => void updateAgent(device)}
        />
      ) : route === "oneClick" ? (
        <>
          <p className="agentUpdateText">
            {tr("dashboard.devices.agentUpdateCard.oneClickExplanation")}
          </p>
          <div className="agentUpdateActions">
            <button
              type="button"
              className="primaryButton small"
              disabled={agentUpdatingId !== null}
              onClick={async () => {
                if (
                  await askConfirm(
                    tr("dashboard.devices.agentUpdateCard.confirmTitle"),
                    tr("dashboard.devices.agentUpdateCard.confirmBody", {
                      version: LATEST_AGENT_VERSION,
                    }),
                    tr("dashboard.devices.agentUpdateCard.updateNow"),
                  )
                )
                  await updateAgent(device);
              }}
            >
              {tr("dashboard.devices.agentUpdateCard.updateNow")}
            </button>
          </div>
          <details className="agentUpdateManual">
            <summary>{tr("dashboard.devices.agentUpdateCard.preferTheCommand")}</summary>
            <CommandBlock command={updateCommand} tr={tr} />
          </details>
        </>
      ) : (
        <>
          <p className="agentUpdateNote" data-route={route}>
            {route === "updateOnce"
              ? tr("dashboard.devices.agentUpdateCard.updateOnceExplanation", {
                  firstRelease: REMOTE_UPDATE_FIRST_RELEASE,
                })
              : route === "offline"
                ? tr("dashboard.devices.agentUpdateCard.offlineExplanation")
                : tr("dashboard.devices.agentUpdateCard.needsBackgroundExplanation")}
          </p>
          <CommandBlock command={updateCommand} tr={tr} />
        </>
      )}
      {recoveryVersion && recoveryVersion !== runtimeVersion && !state && (
        <p className="agentUpdateMeta">
          {tr("dashboard.devices.agentUpdateCard.recoveryBundle", { version: recoveryVersion })}
        </p>
      )}
    </section>
  );
}

type Translate = DashboardModel["tr"];

function UpdateProgress({
  state,
  tr,
  onDismiss,
  onRetry,
}: {
  state: NonNullable<DashboardModel["agentUpdate"]>;
  tr: Translate;
  onDismiss: () => void;
  onRetry: () => void;
}) {
  if (state.phase === "failed" || state.phase === "unconfirmed")
    return (
      <div className="agentUpdateResult" role="status">
        <p>
          {state.phase === "failed"
            ? state.message || tr("dashboard.devices.agentUpdateCard.notAccepted")
            : tr("dashboard.devices.agentUpdateCard.notConfirmed")}
        </p>
        <div className="agentUpdateActions">
          {state.phase === "failed" && (
            <button type="button" className="ghostButton small" onClick={onRetry}>
              {tr("dashboard.devices.agentUpdateCard.tryAgain")}
            </button>
          )}
          <button type="button" className="ghostButton small" onClick={onDismiss}>
            {tr("dashboard.devices.agentUpdateCard.dismiss")}
          </button>
        </div>
      </div>
    );
  if (state.phase === "done")
    return (
      <div className="agentUpdateResult" role="status">
        <p>{tr("dashboard.devices.agentUpdateCard.reconnected")}</p>
        <div className="agentUpdateActions">
          <button type="button" className="ghostButton small" onClick={onDismiss}>
            {tr("dashboard.devices.agentUpdateCard.dismiss")}
          </button>
        </div>
      </div>
    );
  const steps = [
    { id: "verifying", label: tr("dashboard.devices.agentUpdateCard.stepVerify") },
    { id: "restarting", label: tr("dashboard.devices.agentUpdateCard.stepRestart") },
    { id: "done", label: tr("dashboard.devices.agentUpdateCard.stepReconnected") },
  ];
  const current = steps.findIndex((step) => step.id === state.phase);
  return (
    <div className="agentUpdateProgress" role="status">
      <ol>
        {steps.map((step, index) => (
          <li
            key={step.id}
            className={index < current ? "complete" : index === current ? "active" : "pending"}
            aria-current={index === current ? "step" : undefined}
          >
            <span className="agentUpdateStepDot" aria-hidden="true" />
            {step.label}
          </li>
        ))}
      </ol>
      <p className="agentUpdateMeta">
        {tr("dashboard.devices.agentUpdateCard.takesAboutHalfAMinute")}
      </p>
    </div>
  );
}

function CommandBlock({ command, tr }: { command: string; tr: Translate }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);
  return (
    <div className="agentUpdateCommand">
      <code>{command}</code>
      <button
        type="button"
        className="ghostButton small"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(command);
            setCopied(true);
          } catch {
            /* the command stays visible to copy by hand */
          }
        }}
      >
        {copied
          ? tr("dashboard.devices.agentUpdateCard.copied")
          : tr("dashboard.devices.agentUpdateCard.copy")}
      </button>
    </div>
  );
}
