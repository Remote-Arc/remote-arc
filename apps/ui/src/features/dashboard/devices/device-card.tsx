import {
  BROWSER_RUNNER_TOOLS,
  INTERNAL_DEVICE_TOOLS,
  browserRunnerEnabled,
  isBrowserRunnerTool,
} from "./device-tools.js";
import { DeviceCapacity } from "./device-fleet-overview.js";
import { ProductIcon } from "../../../components/product-icon.js";
import { isOlderRelease, goUpdateCommands } from "../../install/agent-update-guide.js";
import { DEVICE_TOOL_CATALOG, deviceAccessPreset, platformLabel } from "./device-presets.js";
import { DeviceAccessPanel } from "./device-access-panel.js";
import { DeviceTasksPanel } from "./device-tasks-panel.js";
import { DeviceActivityPanel } from "./device-activity-panel.js";
import { browserExtensionUpdate } from "./browser-extension-update.js";
import { LATEST_AGENT_VERSION, timeAgo } from "../format.js";
import type { Device } from "../../../types/app-types.js";
import type { DashboardModel } from "../../../hooks/dashboard/use-dashboard-model.js";

// Values derived once per device card and shared with its panels.
export function deviceFacts(device: Device, m: DashboardModel) {
  const { executionLogErrors, executionLogsByDevice } = m;
  const advertisedTools = device.available_tools || device.tools;
  const enabledTools = device.allowed_tools == null ? advertisedTools : device.allowed_tools;
  // Extension 0.4.0 tab opening and actions follow its click & fill switch.
  const allTools = Array.from(
    new Set([...DEVICE_TOOL_CATALOG, ...advertisedTools, ...enabledTools]),
  ).filter((tool) => !isBrowserRunnerTool(tool) && !INTERNAL_DEVICE_TOOLS.has(tool));
  const runnerAdvertised =
    device.status !== "online" ||
    BROWSER_RUNNER_TOOLS.every((tool) => advertisedTools.includes(tool));
  const runnerEnabled = browserRunnerEnabled(device.allowed_tools);
  const runnerVisible =
    device.platform !== "browser" &&
    (runnerEnabled ||
      BROWSER_RUNNER_TOOLS.some((tool) => advertisedTools.includes(tool)) ||
      device.status === "online");
  const accessPreset = deviceAccessPreset(enabledTools, advertisedTools);
  const executionLog = executionLogsByDevice[device.id];
  const executionLogError = executionLogErrors[device.id];
  const runtimeVersion = device.agent_version
    ? device.platform === "browser"
      ? device.agent_version.replace(/^browser-/, "")
      : device.agent_version
    : null;
  const recoveryVersion = device.recovery_bundle_version || null;
  const updateAvailable =
    device.platform !== "browser" &&
    Boolean(runtimeVersion) &&
    isOlderRelease(runtimeVersion, LATEST_AGENT_VERSION);
  const updateCommand =
    device.background_enabled === true
      ? goUpdateCommands(LATEST_AGENT_VERSION, true).join("\n")
      : goUpdateCommands(LATEST_AGENT_VERSION, false).join("\n");
  const extensionUpdate = browserExtensionUpdate(device);
  return {
    advertisedTools,
    enabledTools,
    allTools,
    runnerAdvertised,
    runnerEnabled,
    runnerVisible,
    accessPreset,
    executionLog,
    executionLogError,
    runtimeVersion,
    recoveryVersion,
    updateAvailable,
    updateCommand,
    extensionUpdate,
  };
}

export type DeviceFacts = ReturnType<typeof deviceFacts>;

// One device in the Devices tab: summary, management tabs and their panels.
export function DeviceCard({ m, device }: { m: DashboardModel; device: Device }) {
  const {
    devicePanel,
    executionLogLoading,
    loadDeviceExecutionLog,
    managedDeviceId,
    revoke,
    setDevicePanel,
    setManagedDeviceId,
    tr,
  } = m;
  const facts = deviceFacts(device, m);
  const {
    accessPreset,
    executionLog,
    recoveryVersion,
    runtimeVersion,
    updateAvailable,
    extensionUpdate,
  } = facts;
  const responseUnknown =
    device.execution_health === "response_unknown" && !device.execution_paused;
  const badgeClass =
    device.status === "online" && (responseUnknown || device.execution_paused)
      ? "uncertain"
      : device.status;
  const badgeLabel =
    device.connection_state === "stale"
      ? tr("dashboard.devices.deviceCard.signalExpired")
      : device.status === "offline"
        ? tr("dashboard.devices.deviceCard.offline")
        : device.execution_paused
          ? tr("dashboard.devices.deviceCard.paused")
          : responseUnknown
            ? tr("dashboard.devices.deviceCard.responseUnconfirmed")
            : tr("dashboard.devices.deviceCard.online");
  return (
    <article className={"deviceCard managed " + device.status}>
      <div className="deviceTop">
        <div className="deviceIdentity">
          <div className="deviceIcon large">
            <ProductIcon name="device" />
          </div>
          <div>
            <h3>{device.name}</h3>
            <span>
              {platformLabel(device.platform)} ·{" "}
              {device.hostname || tr("dashboard.devices.deviceCard.noHostname")}
            </span>
          </div>
        </div>
        <div className="deviceOverviewActions">
          {updateAvailable && (
            <span className="badge updateAvailable">
              <i />
              {tr("dashboard.devices.deviceCard.updateAvailable")}
            </span>
          )}
          <span className={"badge " + badgeClass}>
            <i />
            {badgeLabel}
          </span>
          {(device.status === "offline" || responseUnknown) && (
            <button
              type="button"
              className="ghostButton"
              disabled={Boolean(m.connectionRecoveryBusyId)}
              onClick={() => void m.recoverDeviceConnection(device)}
            >
              {m.connectionRecoveryBusyId === device.id
                ? tr("dashboard.devices.deviceCard.checking")
                : tr("dashboard.devices.deviceCard.checkReconnect")}
            </button>
          )}
          <button
            className="ghostButton"
            aria-expanded={managedDeviceId === device.id}
            aria-controls={"device-management-" + device.id}
            aria-label={tr("dashboard.devices.deviceCard.manage", { name: device.name })}
            onClick={() => {
              setManagedDeviceId(managedDeviceId === device.id ? null : device.id);
              setDevicePanel("access");
            }}
          >
            {managedDeviceId === device.id
              ? tr("dashboard.devices.deviceCard.close")
              : tr("dashboard.devices.deviceCard.manage2")}
          </button>
        </div>
      </div>

      <DeviceCapacity device={device} tr={tr} />
      <div className="deviceOverviewFacts">
        <span>
          <ProductIcon name="shield" size={13} />
          {accessPreset === "safe"
            ? tr("dashboard.devices.deviceCard.readOnly")
            : accessPreset === "developer"
              ? tr("dashboard.devices.deviceCard.readEdit")
              : accessPreset === "full"
                ? tr("dashboard.devices.deviceCard.terminalEnabled")
                : tr("dashboard.devices.deviceCard.customPermissions")}
        </span>
        <span className="deviceRuntimeVersion">
          <ProductIcon name="activity" size={13} />
          {device.platform === "browser"
            ? tr("dashboard.devices.deviceCard.browser")
            : tr("dashboard.devices.deviceCard.running")}{" "}
          {runtimeVersion
            ? "v" + runtimeVersion
            : tr("dashboard.devices.deviceCard.versionUnknown")}
          {device.platform !== "browser" && recoveryVersion && recoveryVersion !== runtimeVersion
            ? " · " + tr("dashboard.devices.deviceCard.recovery") + " v" + recoveryVersion
            : ""}
          {updateAvailable
            ? " · " + tr("dashboard.devices.deviceCard.latest") + " v" + LATEST_AGENT_VERSION
            : ""}
          {extensionUpdate
            ? " · " + tr("dashboard.devices.deviceCard.latest") + " v" + extensionUpdate.latest
            : ""}
        </span>
        <span>
          {(device.workspace_roots || []).length}{" "}
          {tr("dashboard.devices.deviceCard.trustedFolders")}
        </span>
        <span>
          {device.background_guard_active
            ? tr("dashboard.devices.deviceCard.recoverySupervisorRunning")
            : device.background_enabled
              ? tr("dashboard.devices.deviceCard.startupConfiguredRecoveryUnconfirmed")
              : tr("dashboard.devices.deviceCard.automaticRecoveryOff")}
        </span>
        <span>
          {tr("dashboard.devices.deviceCard.seen")}
          {timeAgo(device.last_seen)}
        </span>
      </div>
      {device.status === "offline" && (
        <p className="deviceOfflineHint">
          {device.connection_state === "stale"
            ? tr("dashboard.devices.deviceCard.noRecentDeviceSignalWakeThis")
            : tr("dashboard.devices.deviceCard.tasksWaitUntilThisComputerReconnects")}
        </p>
      )}
      {responseUnknown && device.status === "online" && (
        <p className="deviceOfflineHint">
          {tr("dashboard.devices.deviceCard.theConnectionHasASignalBut")}
        </p>
      )}
      {m.connectionRecoveryMessages?.[device.id] && (
        <p className="deviceOfflineHint" role="status">
          {m.connectionRecoveryMessages[device.id]}
        </p>
      )}
      <div
        id={"device-management-" + device.id}
        hidden={managedDeviceId !== device.id}
        className="deviceManagementPanel"
      >
        {managedDeviceId === device.id && (
          <>
            <div
              className="deviceManagementTabs"
              role="tablist"
              aria-label={tr("dashboard.devices.deviceCard.deviceSettings")}
            >
              {(
                [
                  ["access", tr("dashboard.devices.deviceCard.accessFiles")],
                  ["tasks", tr("dashboard.devices.deviceCard.backgroundTasks")],
                  ["activity", tr("dashboard.devices.deviceCard.activityDetails")],
                ] as const
              ).map(([panel, label]) => (
                <button
                  key={panel}
                  type="button"
                  role="tab"
                  id={"device-tab-" + device.id + "-" + panel}
                  aria-controls={"device-panel-" + device.id + "-" + panel}
                  aria-selected={devicePanel === panel}
                  tabIndex={devicePanel === panel ? 0 : -1}
                  className={devicePanel === panel ? "active" : ""}
                  onKeyDown={(event) => {
                    const tabs = Array.from(
                      event.currentTarget.parentElement!.querySelectorAll<HTMLButtonElement>(
                        "[role=tab]",
                      ),
                    );
                    const index = tabs.indexOf(event.currentTarget);
                    const next =
                      event.key === "ArrowRight"
                        ? (index + 1) % tabs.length
                        : event.key === "ArrowLeft"
                          ? (index + tabs.length - 1) % tabs.length
                          : event.key === "Home"
                            ? 0
                            : event.key === "End"
                              ? tabs.length - 1
                              : null;
                    if (next !== null) {
                      event.preventDefault();
                      tabs[next]?.focus();
                      tabs[next]?.click();
                    }
                  }}
                  onClick={() => {
                    setDevicePanel(panel);
                    if (
                      panel === "activity" &&
                      device.status === "online" &&
                      !executionLog &&
                      executionLogLoading !== device.id
                    ) {
                      void loadDeviceExecutionLog(device);
                    }
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <DeviceAccessPanel m={m} device={device} facts={facts} />
            <DeviceTasksPanel m={m} device={device} facts={facts} />
            <DeviceActivityPanel m={m} device={device} facts={facts} />
            <div className="deviceDangerZone">
              <div>
                <strong>{tr("dashboard.devices.deviceCard.forgetDevice")}</strong>
                <span>{tr("dashboard.devices.deviceCard.removeThisPairingFromRemoteArc")}</span>
              </div>
              <button className="dangerButton" onClick={() => void revoke(device.id)}>
                {tr("dashboard.devices.deviceCard.forgetDevice")}
              </button>
            </div>
          </>
        )}
      </div>
    </article>
  );
}
