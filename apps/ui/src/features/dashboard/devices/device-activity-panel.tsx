import { DeviceBrowserSessions } from "../../browser-runner/runner-view.js";
import { CopyButton, HelpTip } from "../../../components/public-layout.js";
import { timeAgo } from "../format.js";
import type { Device } from "../../../types/app-types.js";
import type { DashboardModel } from "../../../hooks/dashboard/use-dashboard-model.js";
import type { DeviceFacts } from "./device-card.js";

// Device panel: identity, browser sessions, processes and execution log.
export function DeviceActivityPanel({
  m,
  device,
  facts,
}: {
  m: DashboardModel;
  device: Device;
  facts: DeviceFacts;
}) {
  const {
    devicePanel,
    executionLogLoading,
    loadDeviceExecutionLog,
    loadManagedProcesses,
    processErrors,
    processLoading,
    processesByDevice,
    rename,
    showManagedProcessOutput,
    stopBackgroundProcess,
    tr,
  } = m;
  const { executionLog, executionLogError, runnerAdvertised, runnerEnabled } = facts;
  return (
    <section
      role="tabpanel"
      id={"device-panel-" + device.id + "-activity"}
      aria-labelledby={"device-tab-" + device.id + "-activity"}
      aria-label={tr("dashboard.devices.deviceActivityPanel.activityAndDetails")}
      hidden={devicePanel !== "activity"}
    >
      {devicePanel === "activity" &&
        device.status === "online" &&
        runnerEnabled &&
        runnerAdvertised && <DeviceBrowserSessions deviceId={device.id} />}
      <div className="deviceTechnicalIdentity">
        <span>
          {tr("dashboard.devices.deviceActivityPanel.deviceId")} <code>{device.id}</code>
        </span>
        <span>
          {tr("dashboard.devices.deviceActivityPanel.architecture")}{" "}
          <code>{device.arch || "—"}</code>
        </span>
      </div>

      <div className="deviceExecutionLogPanel">
        <div className="policyBlockHead">
          <div>
            <strong>{tr("dashboard.devices.deviceActivityPanel.deviceExecutionLog")}</strong>
            <p>{tr("dashboard.devices.deviceActivityPanel.readOnDemandFromThisComputer")}</p>
          </div>
          <button
            className="ghostButton small"
            disabled={device.status !== "online" || executionLogLoading === device.id}
            onClick={() => void loadDeviceExecutionLog(device)}
          >
            {executionLogLoading === device.id
              ? tr("dashboard.devices.deviceActivityPanel.loading")
              : tr("dashboard.devices.deviceActivityPanel.refreshLog")}
          </button>
        </div>

        {device.status !== "online" && (
          <p className="policyWarning">
            {tr("dashboard.devices.deviceActivityPanel.thisDeviceIsOfflineItsExecution")}
          </p>
        )}

        {!!executionLogError && <p className="policyWarning">{executionLogError}</p>}

        {!!executionLog?.lines.length && (
          <>
            <div className="deviceExecutionLogMeta">
              <span>
                {tr("dashboard.devices.deviceActivityPanel.source")}:{" "}
                {tr("dashboard.devices.deviceActivityPanel.localDevice")}
              </span>
              <span>
                {executionLog.updated_at
                  ? tr("dashboard.devices.deviceActivityPanel.updated") +
                    timeAgo(executionLog.updated_at)
                  : tr("dashboard.devices.deviceActivityPanel.noTimestamp")}
              </span>
              {executionLog.truncated && (
                <span>{tr("dashboard.devices.deviceActivityPanel.showingRecentEntries")}</span>
              )}
            </div>
            <div
              className="deviceExecutionLog"
              role="log"
              aria-label={tr("dashboard.devices.deviceActivityPanel.recentRemoteArcExecutionLog")}
            >
              {executionLog.lines.map((line, index) => (
                <code
                  key={index}
                  className={
                    line.includes("  error  ") || line.includes("tool.fail")
                      ? "error"
                      : line.includes("  warn  ")
                        ? "warn"
                        : line.includes("  success  ") || line.includes("tool.done")
                          ? "success"
                          : line.includes("  event  ") || line.includes("tool.call")
                            ? "event"
                            : ""
                  }
                >
                  {line}
                </code>
              ))}
            </div>
          </>
        )}

        {executionLog !== undefined && !executionLog.lines.length && !executionLogError && (
          <p className="policyEmpty">
            {tr("dashboard.devices.deviceActivityPanel.noRemoteArcExecutionEventsHave")}
          </p>
        )}
      </div>

      <details className="deviceProcessDetails">
        <summary>
          {tr("dashboard.devices.deviceActivityPanel.managedBackgroundProcesses")}
          <span>
            {processesByDevice[device.id]
              ? (processesByDevice[device.id] || []).filter((item) => item.status === "running")
                  .length +
                " " +
                tr("dashboard.devices.deviceActivityPanel.running")
              : tr("dashboard.devices.deviceActivityPanel.loadOnDemand")}
          </span>
        </summary>
        <div className="managedProcessBody">
          <div className="policyBlockHead">
            <div className="labelWithHelp">
              <strong>
                {tr("dashboard.devices.deviceActivityPanel.processesStartedByRemoteArc")}
              </strong>
              <HelpTip
                label={tr("dashboard.devices.deviceActivityPanel.aboutManagedBackgroundProcesses")}
                text={tr(
                  "dashboard.devices.deviceActivityPanel.onlyWorkloadProcessesStartedWithRemote",
                )}
              />
            </div>
            <button
              className="ghostButton small"
              disabled={device.status !== "online" || processLoading === device.id}
              onClick={() => void loadManagedProcesses(device)}
            >
              {processLoading === device.id
                ? tr("dashboard.devices.deviceActivityPanel.loading")
                : tr("dashboard.devices.deviceActivityPanel.refresh")}
            </button>
          </div>

          {!!processErrors[device.id] && (
            <p className="policyWarning">{processErrors[device.id]}</p>
          )}

          {!!processesByDevice[device.id]?.length && (
            <div className="managedProcessList">
              {(processesByDevice[device.id] || []).map((item) => (
                <div className="managedProcessRow" key={item.process_id}>
                  <div className="managedProcessState">
                    <i className={item.status === "running" ? "running" : "exited"} />
                    <div>
                      <strong>
                        {item.status === "running"
                          ? tr("dashboard.devices.deviceActivityPanel.running2")
                          : tr("dashboard.devices.deviceActivityPanel.exited")}
                      </strong>
                      <small>
                        PID {item.pid || "—"} · {timeAgo(item.started_at)}
                      </small>
                    </div>
                  </div>
                  <div className="managedProcessCommand">
                    <code title={item.command}>{item.command}</code>
                    <small>
                      {item.cwd ||
                        tr("dashboard.devices.deviceActivityPanel.defaultWorkingDirectory")}
                    </small>
                  </div>
                  <div className="managedProcessActions">
                    <button
                      className="ghostButton small"
                      onClick={() => void showManagedProcessOutput(device, item)}
                    >
                      {tr("dashboard.devices.deviceActivityPanel.output")}
                    </button>
                    {item.status === "running" && (
                      <button
                        className="dangerButton small"
                        onClick={() => void stopBackgroundProcess(device, item)}
                      >
                        {tr("dashboard.devices.deviceActivityPanel.stop")}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {processesByDevice[device.id] !== undefined &&
            !(processesByDevice[device.id] || []).length &&
            !processErrors[device.id] && (
              <p className="policyEmpty">
                {tr("dashboard.devices.deviceActivityPanel.noRemoteArcManagedBackgroundProcesses")}
              </p>
            )}
        </div>
      </details>

      <div className="deviceActions managedActions">
        <button className="ghostButton" onClick={() => void rename(device)}>
          {tr("dashboard.devices.deviceActivityPanel.rename")}
        </button>
        <CopyButton value={device.id} label={tr("dashboard.devices.deviceActivityPanel.copyId")} />
      </div>
    </section>
  );
}
