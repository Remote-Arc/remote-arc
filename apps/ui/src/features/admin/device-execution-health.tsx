import { useI18n } from "../../hooks/use-i18n.js";
import "../../styles/admin/device-execution-health.css";

import type { DeviceExecutionHealth } from "./device-execution-health-model.js";
export type { DeviceExecutionHealth } from "./device-execution-health-model.js";
export function DeviceExecutionHealthPanel({ value }: { value?: DeviceExecutionHealth }) {
  const { tr } = useI18n();
  const measured = value?.coverage === "observed",
    degraded = value?.status === "degraded";
  const date = (v: string | null) => (v ? new Date(v).toLocaleString() : "—");
  return (
    <section
      className="deviceExecutionHealth"
      aria-label={tr("admin.deviceExecutionHealth.deviceExecutionHealth")}
    >
      {value?.sample && (
        <p className="deviceExecutionBoundary">
          {tr("admin.deviceExecutionHealth.sampleDataPreviewNotAReal")}
        </p>
      )}
      <header>
        <div>
          <h3>{tr("admin.deviceExecutionHealth.deviceExecution")}</h3>
          <p>{tr("admin.deviceExecutionHealth.observedCallsAndExpiredConnectionSignals")}</p>
        </div>
        <span className={degraded ? "isDegraded" : ""}>
          {degraded
            ? tr("admin.deviceExecutionHealth.issuesObserved")
            : measured
              ? tr("admin.deviceExecutionHealth.noRecordedIssues")
              : tr("admin.deviceExecutionHealth.awaitingObservations")}
        </span>
      </header>
      <div className="deviceExecutionMetrics">
        {(
          [
            { label: "admin.deviceExecutionHealth.successfulCalls", n: value?.successfulCalls },
            { label: "admin.deviceExecutionHealth.responseTimeouts", n: value?.timeouts },
            { label: "admin.deviceExecutionHealth.expiredSignals2", n: value?.staleSignals },
            { label: "admin.deviceExecutionHealth.affectedDevices", n: value?.affectedDevices },
          ] as const
        ).map((item) => (
          <div key={item.label}>
            <span>{tr(item.label)}</span>
            <strong>
              {value && value.coverage !== "unavailable" ? item.n?.toLocaleString() : "—"}
            </strong>
          </div>
        ))}
      </div>
      {!!value?.keepAwakeFailures && (
        <p className="deviceExecutionEmpty">
          {value.keepAwakeFailures}{" "}
          {tr("admin.deviceExecutionHealth.taskKeepAwakeFailuresABackground")}
        </p>
      )}
      {value?.devices.length ? (
        <div className="deviceExecutionIssues">
          {value.devices.map((device) => (
            <article key={device.deviceId}>
              <div>
                <strong>{device.name}</strong>
                <small>
                  {device.platform} · {device.deviceId.slice(0, 8)}
                </small>
              </div>
              <p>
                {device.timeouts} {tr("admin.deviceExecutionHealth.timeouts")} ·{" "}
                {device.staleSignals} {tr("admin.deviceExecutionHealth.expiredSignals")} ·{" "}
                {device.offlineCalls} {tr("admin.deviceExecutionHealth.offlineDispatches")}
                {device.keepAwakeFailures ? (
                  <>
                    {" "}
                    · {device.keepAwakeFailures}{" "}
                    {tr("admin.deviceExecutionHealth.keepAwakeFailures")}
                  </>
                ) : null}
              </p>
              <small>
                {tr("admin.deviceExecutionHealth.latestIssue")}
                {date(device.lastFailureAt)} ·{" "}
                {tr("admin.deviceExecutionHealth.latestSuccessfulCall")}
                {date(device.lastSuccessfulCallAt)}
              </small>
            </article>
          ))}
        </div>
      ) : (
        <p className="deviceExecutionEmpty">
          {measured
            ? tr("admin.deviceExecutionHealth.noDeviceExecutionIssuesRecordedIn")
            : tr("admin.deviceExecutionHealth.noRecentSamplesLackOfErrors")}
        </p>
      )}
      <p className="deviceExecutionBoundary">
        {tr("admin.deviceExecutionHealth.onlinePresenceDoesNotProveExecution")}
        {value?.truncated ? " " + tr("admin.deviceExecutionHealth.showingDevices") : ""}
      </p>
    </section>
  );
}
