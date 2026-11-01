import { BROWSER_RUNNER_TOOLS, INTERNAL_DEVICE_TOOLS, browserRunnerEnabled, isBrowserRunnerTool } from "./device-tools.js";
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
import type { DashboardModel } from "../hooks/use-dashboard-model.js";

// Values derived once per device card and shared with its panels.
export function deviceFacts(device: Device, m: DashboardModel) {
  const { executionLogErrors, executionLogsByDevice } = m;
  const advertisedTools = device.available_tools || device.tools;
  const enabledTools = device.allowed_tools == null ? advertisedTools : device.allowed_tools;
  // Extension 0.4.0 tab opening and actions follow its click & fill switch.
  const allTools = Array.from(new Set([...DEVICE_TOOL_CATALOG, ...advertisedTools, ...enabledTools])).filter((tool) => !isBrowserRunnerTool(tool) && !INTERNAL_DEVICE_TOOLS.has(tool));
  const runnerAdvertised = device.status !== "online" || BROWSER_RUNNER_TOOLS.every((tool) => advertisedTools.includes(tool));
  const runnerEnabled = browserRunnerEnabled(device.allowed_tools);
  const runnerVisible = device.platform !== "browser" && (runnerEnabled || BROWSER_RUNNER_TOOLS.some((tool) => advertisedTools.includes(tool)) || device.status === "online");
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
  return { advertisedTools, enabledTools, allTools, runnerAdvertised, runnerEnabled, runnerVisible, accessPreset, executionLog, executionLogError, runtimeVersion, recoveryVersion, updateAvailable, updateCommand, extensionUpdate };
}

export type DeviceFacts = ReturnType<typeof deviceFacts>;

// One device in the Devices tab: summary, management tabs and their panels.
export function DeviceCard({ m, device }: { m: DashboardModel; device: Device }) {
  const {
    devicePanel, executionLogLoading, loadDeviceExecutionLog, managedDeviceId, revoke,
    setDevicePanel, setManagedDeviceId, tr,
  } = m;
  const facts = deviceFacts(device, m);
  const { accessPreset, executionLog, recoveryVersion, runtimeVersion, updateAvailable, extensionUpdate } = facts;
  return (
    <article className={"deviceCard managed " + device.status}>
      <div className="deviceTop">
        <div className="deviceIdentity">
          <div className="deviceIcon large"><ProductIcon name="device"/></div>
          <div><h3>{device.name}</h3><span>{platformLabel(device.platform)} · {device.hostname || tr("No hostname", "未提供主机名")}</span></div>
        </div>
        <div className="deviceOverviewActions">
          {updateAvailable && <span className="badge updateAvailable"><i/>{tr("Update available", "可更新")}</span>}
          {extensionUpdate && <span className="badge updateAvailable"><i/>{tr("Update needed", "需要更新")}</span>}
          <span className={"badge " + device.status}><i/>{device.status === "online" ? tr("Online", "在线") : tr("Offline", "离线")}</span>
          <button className="ghostButton" aria-expanded={managedDeviceId === device.id} aria-controls={"device-management-" + device.id} aria-label={tr("Manage " + device.name, "管理 " + device.name)} onClick={() => { setManagedDeviceId(managedDeviceId === device.id ? null : device.id); setDevicePanel("access"); }}>{managedDeviceId === device.id ? tr("Close", "收起") : tr("Manage", "管理")}</button>
        </div>
      </div>

      <DeviceCapacity device={device} tr={tr}/>
      <div className="deviceOverviewFacts">
        <span><ProductIcon name="shield" size={13}/>{accessPreset === "safe" ? tr("Read only", "只读访问") : accessPreset === "developer" ? tr("Read & edit", "读取与编辑") : accessPreset === "full" ? tr("Terminal enabled", "已启用终端") : tr("Custom permissions", "自定义权限")}</span>
        <span className="deviceRuntimeVersion"><ProductIcon name="activity" size={13}/>{device.platform === "browser" ? tr("Browser", "浏览器") : tr("Running", "运行中")} {runtimeVersion ? "v" + runtimeVersion : tr("version unknown", "版本未知")}{device.platform !== "browser" && recoveryVersion && recoveryVersion !== runtimeVersion ? " · " + tr("Recovery", "恢复包") + " v" + recoveryVersion : ""}{updateAvailable ? " · " + tr("Latest", "最新") + " v" + LATEST_AGENT_VERSION : ""}{extensionUpdate ? " · " + tr("Latest", "最新") + " v" + extensionUpdate.latest : ""}</span>
        <span>{(device.workspace_roots || []).length} {tr("trusted folders", "个可信目录")}</span>
        <span>{device.background_guard_active ? tr("Recovery supervisor running", "恢复守护运行中") : device.background_enabled ? tr("Startup configured · recovery unconfirmed", "自启已配置，恢复待确认") : tr("Automatic recovery off", "自动恢复关闭")}</span>
        <span>{tr("Seen ", "最后在线：")}{timeAgo(device.last_seen)}</span>
      </div>
      {extensionUpdate && <div className="deviceExtensionUpdate" role="note">
        <strong>{tr("Update Remote Arc Browser to v" + extensionUpdate.latest, "请把 Remote Arc Browser 更新到 v" + extensionUpdate.latest)}</strong>
        <span>{tr("This browser runs v" + extensionUpdate.current + ". The extension is loaded unpacked, so Chrome does not update it, and older versions miss fixes such as tabs staying shared while you use a site.", "这个浏览器在运行 v" + extensionUpdate.current + "。插件是解压加载的，Chrome 不会自动更新它，旧版本缺少一些修复，比如在同一网站内跳转时标签页保持共享。")}</span>
        <ol>
          <li><a href="/chrome-extension" target="_blank" rel="noreferrer">{tr("Download the new ZIP", "下载新版 ZIP")}</a>{tr(".", "。")}</li>
          <li>{tr("Unzip it into the folder you loaded before, replacing the old files. Keeping the same folder keeps this pairing.", "解压到之前加载的同一个文件夹，覆盖旧文件。用同一个文件夹，配对就不会丢。")}</li>
          <li>{tr("Open chrome://extensions and click Reload on Remote Arc Browser.", "打开 chrome://extensions，在 Remote Arc Browser 上点「重新加载」。")}</li>
          <li>{tr("Share your tabs again: reloading ends the current sharing.", "重新共享标签页：重新加载会结束当前的共享。")}</li>
        </ol>
      </div>}
      {device.status === "offline" && <p className="deviceOfflineHint">{tr("Tasks wait until this computer reconnects. Remote Arc cannot power it on.", "任务会等待这台电脑重新连接，Remote Arc 无法远程开机。")}</p>}
      <div id={"device-management-" + device.id} hidden={managedDeviceId !== device.id} className="deviceManagementPanel">
        {managedDeviceId === device.id && <>
          <div className="deviceManagementTabs" role="tablist" aria-label={tr("Device settings", "设备设置")}>
            {([ ["access", tr("Access & files", "权限与文件")], ["tasks", tr("Background & tasks", "后台与任务")], ["activity", tr("Activity & details", "活动与详情")] ] as const).map(([panel, label]) => <button key={panel} type="button" role="tab" id={"device-tab-"+device.id+"-"+panel} aria-controls={"device-panel-"+device.id+"-"+panel} aria-selected={devicePanel === panel} tabIndex={devicePanel===panel?0:-1} className={devicePanel === panel ? "active" : ""} onKeyDown={event=>{const tabs=Array.from(event.currentTarget.parentElement!.querySelectorAll<HTMLButtonElement>('[role=tab]'));const index=tabs.indexOf(event.currentTarget);const next=event.key==='ArrowRight'?(index+1)%tabs.length:event.key==='ArrowLeft'?(index+tabs.length-1)%tabs.length:event.key==='Home'?0:event.key==='End'?tabs.length-1:null;if(next!==null){event.preventDefault();tabs[next]?.focus();tabs[next]?.click();}}} onClick={() => {
              setDevicePanel(panel);
              if (
                panel === "activity" &&
                device.status === "online" &&
                !executionLog &&
                executionLogLoading !== device.id
              ) {
                void loadDeviceExecutionLog(device);
              }
            }}>{label}</button>)}
          </div>
          <DeviceAccessPanel m={m} device={device} facts={facts} />
          <DeviceTasksPanel m={m} device={device} facts={facts} />
          <DeviceActivityPanel m={m} device={device} facts={facts} />
      <div className="deviceDangerZone">
        <div>
          <strong>{tr("Forget device", "删除设备")}</strong>
          <span>{tr(
            "Remove this pairing from Remote Arc. Local files stay untouched, and this runtime can be paired again later.",
            "从 Remote Arc 删除这条设备配对。本机文件不会被删除，之后仍可以重新配对这个运行环境。",
          )}</span>
        </div>
        <button className="dangerButton" onClick={() => void revoke(device.id)}>{tr("Forget device", "删除设备")}</button>
      </div>
        </>}
      </div>
    </article>
  );
}
