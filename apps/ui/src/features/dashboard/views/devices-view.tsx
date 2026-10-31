import { DeviceFleetOverview } from "../devices/device-fleet-overview.js";
import { ProductIcon } from "../../../components/product-icon.js";
import type { DashboardModel } from "../hooks/use-dashboard-model.js";
import { DeviceCard } from "../devices/device-card.js";

// Devices tab: the device list and the per-device management panel.
export function DevicesView({ m }: { m: DashboardModel }) {
  const {
    arcAvailable, deviceFilter, deviceQuery, devices, filteredDevices, openArcChat,
    setDeviceFilter, setDeviceQuery, setShowAdd, tr,
  } = m;
  return (
    <>
      <section className="overviewTopbar devicesPageHeader">
        <div>
          <span className="eyebrow">{tr("DEVICES", "设备")}</span>
          <h1>{tr("Your device fleet", "你的设备集群")}</h1>
          <p>{tr("Your computers, their capabilities, and where the next task should run.", "查看电脑、可用能力，以及下一项任务适合在哪里执行。")}</p>
        </div>
        <button className="addButton arcRadiantCta" onClick={() => setShowAdd(true)}><ProductIcon name="add"/>{tr("Add device", "添加设备")}</button>
      </section>

      <DeviceFleetOverview devices={devices} tr={tr} onChat={arcAvailable ? ()=>openArcChat(tr("Choose a suitable computer for my next task. Check my fleet capabilities and load, and ask what I need done.","为我的下一项任务选择合适电脑，先检查设备能力和负载，再确认我要做什么。")) : undefined}/>
      <section className="deviceToolbar">
        <div className="deviceSearch">
          <ProductIcon name="search"/>
          <input aria-label={tr("Search devices", "搜索设备")} value={deviceQuery} onChange={(event) => setDeviceQuery(event.target.value)} placeholder={tr("Search devices, hostname or ID", "搜索设备、Hostname 或 ID")} />
        </div>
        <div className="deviceFilters" role="group" aria-label={tr("Device status filter", "设备状态筛选")}>
          {(["all", "online", "offline"] as const).map((filter) => (
            <button key={filter} aria-pressed={deviceFilter === filter} className={deviceFilter === filter ? "active" : ""} onClick={() => setDeviceFilter(filter)}>
              {filter === "all" ? tr("All", "全部") : filter === "online" ? tr("Online", "在线") : tr("Offline", "离线")}
              <span>{filter === "all" ? devices.length : devices.filter((device) => device.status === filter).length}</span>
            </button>
          ))}
        </div>
      </section>

      <div className="deviceGrid rich deviceManagementGrid">
        {filteredDevices.map((device) => <DeviceCard key={device.id} m={m} device={device} />)}

        {!devices.length && <article className="emptyCard wide deviceEmptyState"><div className="emptyIcon">⌁</div><h3>{tr("No paired computers", "暂无已配对电脑")}</h3><p>{tr("Windows, macOS and Linux are supported. No public IP or port forwarding required.", "支持 Windows、macOS 与 Linux，无需公网 IP 或端口映射。")}</p><button className="goldButton" onClick={() => setShowAdd(true)}>+ {tr("Add your first device", "添加第一台设备")}</button></article>}
        {!!devices.length && !filteredDevices.length && <article className="emptyCard wide"><div className="emptyIcon">⌕</div><h3>{tr("No matching devices", "没有匹配设备")}</h3><p>{tr("Try another search or clear the status filter.", "尝试其他搜索词，或清除状态筛选。")}</p><button onClick={() => { setDeviceQuery(""); setDeviceFilter("all"); }}>{tr("Clear filters", "清除筛选")}</button></article>}
      </div>
    </>
  );
}
