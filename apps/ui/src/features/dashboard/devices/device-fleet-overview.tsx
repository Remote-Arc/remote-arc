import type { Translate } from "../../../locales/locale-catalog.js";
import { ProductIcon as Icon } from "../../../components/product-icon.js";
type FleetDevice = {
  status: string;
  execution_paused?: boolean;
  execution_health?: string;
  platform: string;
  workspace_roots?: string[];
  tools: string[];
  capacity?: {
    observedAt: string;
    cpuPercent?: number;
    memoryAvailableMB: number;
    memoryTotalMB: number;
    managedProcesses?: number;
  };
};
export function DeviceFleetOverview({
  devices,
  tr,
  onChat,
}: {
  devices: FleetDevice[];
  tr: Translate;
  onChat?: () => void;
}) {
  const available = devices.filter(
      (d) =>
        d.status === "online" && !d.execution_paused && d.execution_health !== "response_unknown",
    ),
    platforms = new Set(devices.filter((d) => d.platform !== "browser").map((d) => d.platform));
  return (
    <section className="fleetOverview">
      <div className="fleetOverviewIntro">
        <span className="fleetOverviewIcon">
          <Icon name="device" size={23} />
        </span>
        <div>
          <strong>{tr("dashboard.devices.deviceFleetOverview.oneFleetWorkInTheRight")}</strong>
          <p>{tr("dashboard.devices.deviceFleetOverview.yourConnectedAiCanMatchWork")}</p>
        </div>
        {onChat && (
          <button className="ghostButton" onClick={onChat}>
            {tr("dashboard.devices.deviceFleetOverview.askArcToChoose")}
            <Icon name="arrowUpRight" size={14} />
          </button>
        )}
      </div>
      <div className="fleetOverviewMetrics">
        <div>
          <span>{tr("dashboard.devices.deviceFleetOverview.connectedComputers")}</span>
          <strong>{devices.length}</strong>
        </div>
        <div>
          <span>{tr("dashboard.devices.deviceFleetOverview.onlineAvailable")}</span>
          <strong>
            {available.length}
            <i className={available.length ? "online" : ""} />
          </strong>
        </div>
        <div>
          <span>{tr("dashboard.devices.deviceFleetOverview.operatingSystems")}</span>
          <strong>{platforms.size}</strong>
        </div>
        <div>
          <span>{tr("dashboard.devices.deviceFleetOverview.readyForExecution")}</span>
          <strong>
            {
              available.filter(
                (d) => d.tools.includes("start_process") && d.workspace_roots?.length,
              ).length
            }
          </strong>
        </div>
      </div>
    </section>
  );
}
export function DeviceCapacity({ device, tr }: { device: FleetDevice; tr: Translate }) {
  const sample = device.capacity,
    fresh =
      device.status === "online" &&
      sample &&
      Number.isFinite(Date.parse(sample.observedAt)) &&
      Math.abs(Date.now() - Date.parse(sample.observedAt)) <= 120000;
  if (!fresh)
    return (
      <div className="deviceCapacityUnavailable">
        <Icon name="activity" size={14} />
        {device.status === "offline"
          ? tr("dashboard.devices.deviceFleetOverview.capacityAvailableWhenThisComputerReconnects")
          : tr("dashboard.devices.deviceFleetOverview.waitingForAFreshCapacitySignal")}
      </div>
    );
  const cpu = sample.cpuPercent,
    memory =
      sample.memoryTotalMB > 0
        ? Math.max(0, Math.min(100, (1 - sample.memoryAvailableMB / sample.memoryTotalMB) * 100))
        : null;
  return (
    <div className="deviceCapacity">
      <div>
        <span>CPU</span>
        <strong>{cpu === undefined ? "—" : Math.round(cpu) + "%"}</strong>
        <i>
          <b style={{ width: (cpu ?? 0) + "%" }} />
        </i>
      </div>
      <div>
        <span>{tr("dashboard.devices.deviceFleetOverview.memory")}</span>
        <strong>{memory === null ? "—" : Math.round(memory) + "%"}</strong>
        <i>
          <b style={{ width: (memory ?? 0) + "%" }} />
        </i>
      </div>
      <div>
        <span>{tr("dashboard.devices.deviceFleetOverview.managedProcesses")}</span>
        <strong>{sample.managedProcesses ?? "—"}</strong>
        <small>{tr("dashboard.devices.deviceFleetOverview.liveSignal")}</small>
      </div>
    </div>
  );
}
