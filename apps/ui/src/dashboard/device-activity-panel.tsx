import { DeviceBrowserSessions } from "../runner-view.js";
import { CopyButton, HelpTip } from "../public-layout.js";
import { timeAgo } from "./format.js";
import type { Device } from "../app-types.js";
import type { DashboardModel } from "./use-dashboard-model.js";
import type { DeviceFacts } from "./device-card.js";

// Device panel: identity, browser sessions, processes and execution log.
export function DeviceActivityPanel({ m, device, facts }: { m: DashboardModel; device: Device; facts: DeviceFacts }) {
  const {
    devicePanel, executionLogLoading, loadDeviceExecutionLog, loadManagedProcesses, processErrors,
    processLoading, processesByDevice, rename, showManagedProcessOutput, stopBackgroundProcess, tr,
  } = m;
  const { executionLog, executionLogError, runnerAdvertised, runnerEnabled } = facts;
  return (
    <section role="tabpanel" id={"device-panel-"+device.id+"-activity"} aria-labelledby={"device-tab-"+device.id+"-activity"} aria-label={tr("Activity and details", "活动与详情")} hidden={devicePanel !== "activity"}>
{devicePanel === "activity" && device.status === "online" && runnerEnabled && runnerAdvertised && <DeviceBrowserSessions deviceId={device.id}/>}
      <div className="deviceTechnicalIdentity"><span>{tr("Device ID", "设备 ID")} <code>{device.id}</code></span><span>{tr("Architecture", "架构")} <code>{device.arch || "—"}</code></span></div>

<div className="deviceExecutionLogPanel">
  <div className="policyBlockHead">
    <div>
      <strong>{tr("Device execution log", "设备执行日志")}</strong>
      <p>{tr(
        "Read on demand from this computer's local Remote Arc operation log. File contents, full command output and raw MCP payloads are not stored here.",
        "按需读取这台电脑本地的 Remote Arc 操作日志。这里不会保存文件内容、完整命令输出或原始 MCP Payload。",
      )}</p>
    </div>
    <button
      className="ghostButton small"
      disabled={device.status !== "online" || executionLogLoading === device.id}
      onClick={() => void loadDeviceExecutionLog(device)}
    >
      {executionLogLoading === device.id ? tr("Loading…", "加载中…") : tr("Refresh log", "刷新日志")}
    </button>
  </div>

  {device.status !== "online" && (
    <p className="policyWarning">{tr(
      "This device is offline. Its execution log remains local and can be read after it reconnects.",
      "这台设备当前离线。执行日志仍保留在本机，重新上线后即可读取。",
    )}</p>
  )}

  {!!executionLogError && (
    <p className="policyWarning">{executionLogError}</p>
  )}

  {!!executionLog?.lines.length && (
    <>
      <div className="deviceExecutionLogMeta">
        <span>{tr("Source", "来源")}: {tr("Local device", "本机")}</span>
        <span>{executionLog.updated_at
          ? tr("Updated ", "更新于 ") + timeAgo(executionLog.updated_at)
          : tr("No timestamp", "无时间戳")}</span>
        {executionLog.truncated && <span>{tr("Showing recent entries", "仅显示最近记录")}</span>}
      </div>
      <div className="deviceExecutionLog" role="log" aria-label={tr("Recent Remote Arc execution log", "最近 Remote Arc 执行日志")}>
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

  {executionLog !== undefined &&
    !executionLog.lines.length &&
    !executionLogError && (
      <p className="policyEmpty">{tr(
        "No Remote Arc execution events have been recorded locally yet.",
        "本机暂时还没有 Remote Arc 执行记录。",
      )}</p>
    )}
</div>

<details className="deviceProcessDetails">
  <summary>
    {tr("Managed background processes", "后台进程管理")}
    <span>
      {processesByDevice[device.id]
        ? (processesByDevice[device.id] || []).filter((item) => item.status === "running").length + " " + tr("running", "个运行中")
        : tr("load on demand", "按需读取")}
    </span>
  </summary>
  <div className="managedProcessBody">
    <div className="policyBlockHead">
      <div className="labelWithHelp">
        <strong>{tr("Processes started by Remote Arc", "由 Remote Arc 启动的进程")}</strong>
        <HelpTip
          label={tr("About managed background processes", "了解后台进程管理")}
          text={tr(
            "Only workload processes started with Remote Arc's managed process mode appear here. The Remote Arc connection agent itself is shown separately under Background connection above.",
            "这里只显示通过 Remote Arc 后台进程模式启动的工作负载。Remote Arc 自己的连接 Agent 会单独显示在“后台与任务”页。",
          )}
        />
      </div>
      <button
        className="ghostButton small"
        disabled={device.status !== "online" || processLoading === device.id}
        onClick={() => void loadManagedProcesses(device)}
      >
        {processLoading === device.id ? tr("Loading…", "加载中…") : tr("Refresh", "刷新")}
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
                <strong>{item.status === "running" ? tr("Running", "运行中") : tr("Exited", "已退出")}</strong>
                <small>PID {item.pid || "—"} · {timeAgo(item.started_at)}</small>
              </div>
            </div>
            <div className="managedProcessCommand">
              <code title={item.command}>{item.command}</code>
              <small>{item.cwd || tr("Default working directory", "默认工作目录")}</small>
            </div>
            <div className="managedProcessActions">
              <button className="ghostButton small" onClick={() => void showManagedProcessOutput(device, item)}>
                {tr("Output", "查看输出")}
              </button>
              {item.status === "running" && (
                <button className="dangerButton small" onClick={() => void stopBackgroundProcess(device, item)}>
                  {tr("Stop", "停止")}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    )}

    {processesByDevice[device.id] !== undefined && !(processesByDevice[device.id] || []).length && !processErrors[device.id] && (
      <p className="policyEmpty">{tr(
        "No Remote Arc managed background processes are currently retained on this device.",
        "这台设备当前没有由 Remote Arc 管理并保留的后台进程。",
      )}</p>
    )}
  </div>
</details>

<div className="deviceActions managedActions">
  <button className="ghostButton" onClick={() => void rename(device)}>{tr("Rename", "重命名")}</button>
  <CopyButton value={device.id} label={tr("Copy ID", "复制 ID")}/>
</div>
    </section>
  );
}
