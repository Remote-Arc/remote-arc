import { UI_PREVIEW } from "../../../preview/preview-mode.js";
import { type DeviceTaskPermissions } from "../../../types/app-types.js";
import { legacyTaskPermissions } from "./device-presets.js";
import { HelpTip } from "../../../components/public-layout.js";
import { LATEST_AGENT_VERSION } from "../format.js";
import type { Device } from "../../../types/app-types.js";
import type { DashboardModel } from "../../../hooks/dashboard/use-dashboard-model.js";
import type { DeviceFacts } from "./device-card.js";

// Device panel: background mode, runtime and task permissions.
export function DeviceTasksPanel({
  m,
  device,
  facts,
}: {
  m: DashboardModel;
  device: Device;
  facts: DeviceFacts;
}) {
  const {
    askConfirm,
    backgroundPhase,
    backgroundTargetEnabled,
    backgroundUpdatingId,
    devicePanel,
    deviceTaskBusy,
    runtimeTargetPaused,
    runtimeUpdatingId,
    saveDeviceTaskPermission,
    showNotice,
    tr,
    updateDeviceBackground,
    updateDeviceRuntime,
  } = m;
  const { recoveryVersion, runtimeVersion, updateAvailable, updateCommand, extensionUpdate } =
    facts;
  return (
    <section
      role="tabpanel"
      id={"device-panel-" + device.id + "-tasks"}
      aria-labelledby={"device-tab-" + device.id + "-tasks"}
      aria-label={tr("dashboard.devices.deviceTasksPanel.backgroundAndTasks")}
      hidden={devicePanel !== "tasks"}
    >
      {extensionUpdate && (
        <div className="deviceBackgroundRow deviceUpdateRow">
          <div>
            <strong>
              {tr("dashboard.devices.deviceTasksPanel.remoteArcBrowserUpdateAvailable")}
            </strong>
            <span>
              {tr("dashboard.devices.deviceTasksPanel.running")}v{extensionUpdate.current} ·{" "}
              {tr("dashboard.devices.deviceTasksPanel.latest")}v{extensionUpdate.latest}
            </span>
            <span>
              {tr("dashboard.devices.deviceTasksPanel.chromeDoesNotAutomaticallyUpdateUnpacked")}
            </span>
            <ol className="deviceUpdateSteps">
              <li>{tr("dashboard.devices.deviceTasksPanel.unzipIntoTheSameFolderReplacing")}</li>
              <li>{tr("dashboard.devices.deviceTasksPanel.openChromeExtensionsAndClickReload")}</li>
              <li>{tr("dashboard.devices.deviceTasksPanel.shareYourTabsAgainReloadingEnds")}</li>
            </ol>
          </div>
          <a
            className="ghostButton small"
            href="/chrome-extension"
            target="_blank"
            rel="noreferrer"
          >
            {tr("dashboard.devices.deviceTasksPanel.downloadTheNewZip")}
          </a>
        </div>
      )}
      {updateAvailable && (
        <div className="deviceBackgroundRow deviceUpdateRow">
          <div>
            <strong>{tr("dashboard.devices.deviceTasksPanel.remoteArcUpdateAvailable")}</strong>
            <span>
              {tr("dashboard.devices.deviceTasksPanel.running")}v{runtimeVersion} ·{" "}
              {tr("dashboard.devices.deviceTasksPanel.latest")}v{LATEST_AGENT_VERSION}
            </span>
            {recoveryVersion && (
              <span>
                {tr("dashboard.devices.deviceTasksPanel.installedRecoveryBundle")}v{recoveryVersion}
              </span>
            )}
            <span>{tr("dashboard.devices.deviceTasksPanel.runTheUpgradeCommandOnThis")}</span>
          </div>
          <button
            className="ghostButton small"
            onClick={async () => {
              try {
                if (navigator.clipboard) await navigator.clipboard.writeText(updateCommand);
                await showNotice(
                  tr("dashboard.devices.deviceTasksPanel.upgradeRemoteArc"),
                  updateCommand +
                    (navigator.clipboard
                      ? "\n\n" + tr("dashboard.devices.deviceTasksPanel.copiedToClipboard")
                      : ""),
                );
              } catch {
                await showNotice(
                  tr("dashboard.devices.deviceTasksPanel.upgradeRemoteArc"),
                  updateCommand,
                );
              }
            }}
          >
            {tr("dashboard.devices.deviceTasksPanel.copyUpgradeCommand")}
          </button>
        </div>
      )}
      <div className="deviceBackgroundRow" aria-busy={backgroundUpdatingId === device.id}>
        <div>
          <div className="labelWithHelp">
            <strong>{tr("dashboard.devices.deviceTasksPanel.automaticRecovery")}</strong>
            <HelpTip
              label={tr("dashboard.devices.deviceTasksPanel.aboutAutomaticRecovery")}
              text={tr("dashboard.devices.deviceTasksPanel.theSwitchEnablesALocalSupervisor")}
            />
          </div>
          <span>
            {backgroundUpdatingId === device.id
              ? backgroundPhase === "applying"
                ? tr("dashboard.devices.deviceTasksPanel.sendingDeviceCommand")
                : backgroundPhase === "stopping"
                  ? tr("dashboard.devices.deviceTasksPanel.waitingForAgentToDisconnect")
                  : tr("dashboard.devices.deviceTasksPanel.waitingForSupervisorConfirmation")
              : device.status !== "online"
                ? tr("dashboard.devices.deviceTasksPanel.reconnectToVerifyTheLocalRecovery")
                : device.background_recovery_available
                  ? device.background_enabled
                    ? tr("dashboard.devices.deviceTasksPanel.enabledLoginStartupAndProcessRecovery")
                    : tr("dashboard.devices.deviceTasksPanel.offCurrentExecutionContinues")
                  : tr("dashboard.devices.deviceTasksPanel.olderClientLoginStartupOnlyUpdate")}
          </span>
          <span>
            {tr("dashboard.devices.deviceTasksPanel.supervisor")}
            {device.background_guard_active
              ? tr("dashboard.devices.deviceTasksPanel.running2") +
                (device.background_guard_pid ? " · PID " + device.background_guard_pid : "")
              : device.status !== "online"
                ? tr("dashboard.devices.deviceTasksPanel.unconfirmedWhileOffline")
                : tr("dashboard.devices.deviceTasksPanel.notConfirmed")}
          </span>
          <span>
            {tr("dashboard.devices.deviceTasksPanel.execution")}
            {device.status !== "online"
              ? tr("dashboard.devices.deviceTasksPanel.disconnectedFromRelay")
              : device.execution_paused === true
                ? tr("dashboard.devices.deviceTasksPanel.pausedWakeOnlyControlConnected")
                : device.execution_mode === "foreground"
                  ? tr("dashboard.devices.deviceTasksPanel.foregroundAgentConnected")
                  : device.background_active
                    ? tr("dashboard.devices.deviceTasksPanel.backgroundAgentConnected")
                    : tr("dashboard.devices.deviceTasksPanel.agentConnected")}
            {device.agent_pid ? " · PID " + device.agent_pid : ""}
            {device.agent_version ? " · v" + device.agent_version : ""}
          </span>
        </div>
        <div className="managedProcessActions backgroundRecoveryControls">
          <span
            className="backgroundToggleProgress"
            data-pending={backgroundUpdatingId === device.id}
            id={"background-toggle-progress-" + device.id}
            role="status"
            aria-live="polite"
            aria-label={
              backgroundUpdatingId === device.id
                ? tr("dashboard.devices.deviceTasksPanel.verifyingBackgroundRecoveryOnDevice")
                : undefined
            }
          >
            <span className="backgroundToggleSpinner" aria-hidden="true" />
          </span>
          {device.background_enabled === true &&
            device.background_guard_active !== true &&
            device.status === "online" &&
            device.background_recovery_available && (
              <button
                className="ghostButton small"
                disabled={UI_PREVIEW || backgroundUpdatingId === device.id}
                onClick={() => void updateDeviceBackground(device, true, false)}
              >
                {tr("dashboard.devices.deviceTasksPanel.repairRecovery")}
              </button>
            )}
          {device.status === "online" && (
            <button
              className="dangerButton small"
              disabled={
                UI_PREVIEW ||
                backgroundUpdatingId === device.id ||
                !!runtimeUpdatingId ||
                device.stop_agent_available !== true
              }
              title={
                device.stop_agent_available
                  ? tr("dashboard.devices.deviceTasksPanel.disableAutoRecoveryAndStopThis")
                  : tr("dashboard.devices.deviceTasksPanel.updateThisComputerSAgentTo")
              }
              onClick={async () => {
                if (
                  await askConfirm(
                    tr("dashboard.devices.deviceTasksPanel.disconnectThisComputerCompletely"),
                    tr("dashboard.devices.deviceTasksPanel.thisDisablesBothTheExecutionAgent"),
                  )
                )
                  await updateDeviceBackground(device, false, true);
              }}
            >
              {device.stop_agent_available
                ? tr("dashboard.devices.deviceTasksPanel.disconnectCompletely")
                : tr("dashboard.devices.deviceTasksPanel.disconnectUpdateNeeded")}
            </button>
          )}
          <label className="compactSwitch">
            <input
              type="checkbox"
              aria-label={tr("dashboard.devices.deviceTasksPanel.automaticRecovery")}
              checked={
                backgroundUpdatingId === device.id && backgroundTargetEnabled !== null
                  ? backgroundTargetEnabled
                  : device.background_enabled === true
              }
              disabled={
                UI_PREVIEW ||
                backgroundUpdatingId === device.id ||
                !!runtimeUpdatingId ||
                device.execution_paused === true ||
                device.status !== "online" ||
                !device.background_agent_available
              }
              aria-describedby={
                backgroundUpdatingId === device.id
                  ? "background-toggle-progress-" + device.id
                  : undefined
              }
              onChange={async (event) => {
                const enabled = event.target.checked;
                if (enabled && !device.background_recovery_available) {
                  await showNotice(
                    tr("dashboard.devices.deviceTasksPanel.updateRemotelinkFirst"),
                    tr("dashboard.devices.deviceTasksPanel.thisAgentPredatesProcessRecoveryAnd"),
                  );
                  return;
                }
                await updateDeviceBackground(device, enabled, false);
              }}
            />
            <span />
          </label>
        </div>
      </div>

      <div
        className="deviceBackgroundRow deviceRuntimePauseRow"
        aria-busy={runtimeUpdatingId === device.id}
      >
        <div>
          <strong>{tr("dashboard.devices.deviceTasksPanel.executionControl")}</strong>
          <span>
            {runtimeUpdatingId === device.id
              ? runtimeTargetPaused
                ? tr("dashboard.devices.deviceTasksPanel.pausingExecutionAndConnectingTheWake")
                : tr("dashboard.devices.deviceTasksPanel.restoringTheExecutionAgent")
              : device.status !== "online"
                ? tr("dashboard.devices.deviceTasksPanel.fullyDisconnectedRestartRemoteArcLocally")
                : device.execution_paused
                  ? tr("dashboard.devices.deviceTasksPanel.pausedComputerToolsAreBlockedDashboard")
                  : tr("dashboard.devices.deviceTasksPanel.runningAiComputerToolsCanExecute")}
          </span>
          <span>
            {tr("dashboard.devices.deviceTasksPanel.pauseKeepsAMinimalAuthenticatedWake")}
          </span>
        </div>
        <div className="managedProcessActions backgroundRecoveryControls">
          <span
            className="backgroundToggleProgress"
            data-pending={runtimeUpdatingId === device.id}
            role="status"
            aria-live="polite"
          >
            <span className="backgroundToggleSpinner" aria-hidden="true" />
          </span>
          <button
            className="ghostButton small"
            disabled={
              UI_PREVIEW ||
              !!backgroundUpdatingId ||
              !!runtimeUpdatingId ||
              device.status !== "online" ||
              device.pause_agent_available !== true ||
              (!device.execution_paused &&
                (!device.background_enabled || !device.background_guard_active))
            }
            title={
              device.pause_agent_available
                ? tr("dashboard.devices.deviceTasksPanel.switchBetweenFullExecutionAndWake")
                : tr("dashboard.devices.deviceTasksPanel.upgradeRemotelinkForRemotePauseResume")
            }
            onClick={async () => {
              const resume = device.execution_paused === true;
              if (
                !resume &&
                !(await askConfirm(
                  tr("dashboard.devices.deviceTasksPanel.pauseComputerExecution"),
                  tr("dashboard.devices.deviceTasksPanel.remoteFileTerminalToolsWillStop"),
                ))
              )
                return;
              await updateDeviceRuntime(device, !device.execution_paused);
            }}
          >
            {device.pause_agent_available
              ? device.execution_paused
                ? tr("dashboard.devices.deviceTasksPanel.resumeAgent")
                : tr("dashboard.devices.deviceTasksPanel.pauseAgent")
              : tr("dashboard.devices.deviceTasksPanel.pauseResumeUpdateNeeded")}
          </button>
        </div>
      </div>

      <details className="deviceTaskSettings" open>
        <summary>
          {tr("dashboard.devices.deviceTasksPanel.taskPermissions")}
          <span>
            {
              Object.values(device.automation_permissions || legacyTaskPermissions).filter(Boolean)
                .length
            }{" "}
            / 5 {tr("dashboard.devices.deviceTasksPanel.enabled")}
          </span>
        </summary>
        <p>
          {tr("dashboard.devices.deviceTasksPanel.chooseWhichBackgroundCapabilitiesThisComputer")}
        </p>
        {(
          [
            ["background_tasks", tr("dashboard.devices.deviceTasksPanel.backgroundTasks")],
            ["scheduled_tasks", tr("dashboard.devices.deviceTasksPanel.scheduledTasks")],
            ["adaptive_agent", tr("dashboard.devices.deviceTasksPanel.adaptiveAgentGoals")],
            ["source_agent", tr("dashboard.devices.deviceTasksPanel.continueWithTheSourceAgent")],
            ["keep_awake", tr("dashboard.devices.deviceTasksPanel.allowATaskToKeepThis")],
          ] as Array<[keyof DeviceTaskPermissions, string]>
        ).map(([key, label]) => (
          <div className="deviceBackgroundRow" key={key}>
            <strong>{label}</strong>
            <label className="compactSwitch">
              <input
                type="checkbox"
                aria-label={label}
                checked={(device.automation_permissions || legacyTaskPermissions)[key]}
                disabled={
                  UI_PREVIEW ||
                  !!deviceTaskBusy ||
                  (key === "keep_awake" && !device.keep_awake_available)
                }
                onChange={(event) =>
                  void saveDeviceTaskPermission(device, key, event.target.checked)
                }
              />
              <span />
            </label>
          </div>
        ))}
        {!device.keep_awake_available && (
          <p>{tr("dashboard.devices.deviceTasksPanel.keepingAwakeRequiresAnUpdatedDevice")}</p>
        )}
        <a href="/docs/long-running-work">
          {tr("dashboard.devices.deviceTasksPanel.howLongRunningWorkOperates")} →
        </a>
      </details>
    </section>
  );
}
