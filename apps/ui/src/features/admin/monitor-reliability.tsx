import type { Translate } from "../../locales/locale-catalog.js";
import type { DeviceReliabilityHealth } from "./service-health-model.js";

export function MonitorReliability({
  state,
  tr,
}: {
  state: DeviceReliabilityHealth | undefined;
  tr: Translate;
}) {
  const phases = {
    healthy: tr("admin.monitorReliability.belowThreshold"),
    pending: tr("admin.monitorReliability.evaluatingSustainedChurn"),
    firing: tr("admin.monitorReliability.sustainedReconnectAnomaly"),
    recovering: tr("admin.monitorReliability.confirmingRecovery"),
  };
  return (
    <article className="monitorReliability">
      <div className="monitorPanelHeader">
        <div>
          <span className="eyebrow">{tr("admin.monitorReliability.connections")}</span>
          <h2>{tr("admin.monitorReliability.deviceReliability")}</h2>
        </div>
      </div>
      {!state || state.coverage === "unavailable" ? (
        <p>{tr("admin.monitorReliability.connectionTelemetryIsUnavailableThisDoes")}</p>
      ) : state.coverage === "no_samples" ? (
        <p>{tr("admin.monitorReliability.noRecentConnectionObservationsHistoricalActivity")}</p>
      ) : (
        <>
          <p>
            {state.signal
              ? phases[state.signal.phase]
              : tr("admin.monitorReliability.awaitingScheduledEvaluation")}
            {" · "}
            {state.scope === "single_device"
              ? tr("admin.monitorReliability.repeatedChurnIsIsolatedToOne")
              : state.scope === "multiple_devices"
                ? tr("admin.monitorReliability.repeatedChurnAffectsMultipleDevicesThis")
                : tr("admin.monitorReliability.noDeviceHasThreeConnectionOpens")}
          </p>
          <div className="docsTableWrap">
            <table className="articleTable">
              <thead>
                <tr>
                  <th>{tr("admin.monitorReliability.window")}</th>
                  <th>{tr("admin.monitorReliability.devicesObserved")}</th>
                  <th>{tr("admin.monitorReliability.connectionOpens")}</th>
                  <th>{tr("admin.monitorReliability.reconnects")}</th>
                </tr>
              </thead>
              <tbody>
                {state.windows.map((window) => (
                  <tr key={window.minutes}>
                    <td>
                      {window.minutes === 1440 ? "24h" : window.minutes === 60 ? "1h" : "15m"}
                    </td>
                    <td>{window.counts.observedDevices}</td>
                    <td>{window.counts.connections}</td>
                    <td>{window.counts.reconnects}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>{tr("admin.monitorReliability.observedLowerBoundsAWindowS")}</p>
          <div className="docsTableWrap">
            <table className="articleTable">
              <thead>
                <tr>
                  <th>{tr("admin.monitorReliability.platformAgent")}</th>
                  <th>{tr("admin.monitorReliability.devices")}</th>
                  <th>{tr("admin.monitorReliability.reconnectsM")}</th>
                </tr>
              </thead>
              <tbody>
                {state.groups.map((group) => (
                  <tr key={group.platform + ":" + group.agentVersion}>
                    <td>
                      {group.platform} / {group.agentVersion}
                    </td>
                    <td>{group.observedDevices}</td>
                    <td>{group.reconnects}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {state.groupsTruncated && (
            <p>{tr("admin.monitorReliability.showingTheTopGroupsTotalsInclude")}</p>
          )}
          <details>
            <summary>{tr("admin.monitorReliability.recentMinuteByMinuteObservations")}</summary>
            <div className="docsTableWrap">
              <table className="articleTable">
                <thead>
                  <tr>
                    <th>{tr("admin.monitorReliability.time")}</th>
                    <th>{tr("admin.monitorReliability.opens")}</th>
                    <th>{tr("admin.monitorReliability.closes")}</th>
                    <th>{tr("admin.monitorReliability.heartbeats")}</th>
                  </tr>
                </thead>
                <tbody>
                  {state.trend.map((row) => (
                    <tr key={row.minute}>
                      <td>{new Date(row.minute).toLocaleTimeString()}</td>
                      <td>{row.connections}</td>
                      <td>{row.disconnects}</td>
                      <td>{row.heartbeats}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </article>
  );
}
