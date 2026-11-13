import { DeviceFleetOverview } from "../devices/device-fleet-overview.js";
import { ProductIcon } from "../../../components/product-icon.js";
import type { DashboardModel } from "../../../hooks/dashboard/use-dashboard-model.js";
import { DeviceCard } from "../devices/device-card.js";
import { ComputerPlanLimit } from "../devices/computer-plan-limit.js";

// Devices tab: the device list and the per-device management panel.
export function DevicesView({
  m,
  browserTaskCount,
}: {
  m: DashboardModel;
  browserTaskCount: number;
}) {
  const {
    arcAvailable,
    deviceFilter,
    deviceQuery,
    devices,
    filteredDevices,
    navigateTab,
    openArcChat,
    refreshAll,
    setDeviceFilter,
    setDeviceQuery,
    setShowAdd,
    tr,
  } = m;
  return (
    <>
      <section className="overviewTopbar devicesPageHeader">
        <div>
          <span className="eyebrow">{tr("dashboard.views.devicesView.devices")}</span>
          <h1>{tr("dashboard.views.devicesView.yourDeviceFleet")}</h1>
          <p>{tr("dashboard.views.devicesView.yourComputersTheirCapabilitiesAndWhere")}</p>
        </div>
        <div className="devicePageActions">
          {browserTaskCount > 0 && (
            <button type="button" className="ghostButton" onClick={() => navigateTab("security")}>
              {tr("dashboard.views.devicesView.browserTasks")}{" "}
              <span className="approvalCount">{browserTaskCount}</span>
            </button>
          )}
          <button className="addButton arcRadiantCta" onClick={() => setShowAdd(true)}>
            <ProductIcon name="add" />
            {tr("dashboard.views.devicesView.addDevice")}
          </button>
        </div>
      </section>

      <ComputerPlanLimit devices={devices} refreshAll={refreshAll} />
      <DeviceFleetOverview
        devices={devices}
        tr={tr}
        onChat={
          arcAvailable
            ? () => openArcChat(tr("dashboard.views.devicesView.chooseASuitableComputerForMy"))
            : undefined
        }
      />
      <section className="deviceToolbar">
        <div className="deviceSearch">
          <ProductIcon name="search" />
          <input
            aria-label={tr("dashboard.views.devicesView.searchDevices")}
            value={deviceQuery}
            onChange={(event) => setDeviceQuery(event.target.value)}
            placeholder={tr("dashboard.views.devicesView.searchDevicesHostnameOrId")}
          />
        </div>
        <div
          className="deviceFilters"
          role="group"
          aria-label={tr("dashboard.views.devicesView.deviceStatusFilter")}
        >
          {(["all", "online", "offline"] as const).map((filter) => (
            <button
              key={filter}
              aria-pressed={deviceFilter === filter}
              className={deviceFilter === filter ? "active" : ""}
              onClick={() => setDeviceFilter(filter)}
            >
              {filter === "all"
                ? tr("dashboard.views.devicesView.all")
                : filter === "online"
                  ? tr("dashboard.views.devicesView.online")
                  : tr("dashboard.views.devicesView.offline")}
              <span>
                {filter === "all"
                  ? devices.length
                  : devices.filter((device) => device.status === filter).length}
              </span>
            </button>
          ))}
        </div>
      </section>

      <div className="deviceGrid rich deviceManagementGrid">
        {filteredDevices.map((device) => (
          <DeviceCard key={device.id} m={m} device={device} />
        ))}

        {!devices.length && (
          <article className="emptyCard wide deviceEmptyState">
            <div className="emptyIcon">⌁</div>
            <h3>{tr("dashboard.views.devicesView.noPairedComputers")}</h3>
            <p>{tr("dashboard.views.devicesView.windowsMacosAndLinuxAreSupported")}</p>
            <button className="goldButton" onClick={() => setShowAdd(true)}>
              + {tr("dashboard.views.devicesView.addYourFirstDevice")}
            </button>
          </article>
        )}
        {!!devices.length && !filteredDevices.length && (
          <article className="emptyCard wide">
            <div className="emptyIcon">⌕</div>
            <h3>{tr("dashboard.views.devicesView.noMatchingDevices")}</h3>
            <p>{tr("dashboard.views.devicesView.tryAnotherSearchOrClearThe")}</p>
            <button
              onClick={() => {
                setDeviceQuery("");
                setDeviceFilter("all");
              }}
            >
              {tr("dashboard.views.devicesView.clearFilters")}
            </button>
          </article>
        )}
      </div>
    </>
  );
}
