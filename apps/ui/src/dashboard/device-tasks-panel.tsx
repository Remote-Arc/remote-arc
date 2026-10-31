import { UI_PREVIEW } from "../preview.js";
import { type DeviceTaskPermissions } from "../app-types.js";
import { legacyTaskPermissions } from "../device-presets.js";
import { HelpTip } from "../public-layout.js";
import { LATEST_AGENT_VERSION } from "./format.js";
import type { Device } from "../app-types.js";
import type { DashboardModel } from "./use-dashboard-model.js";
import type { DeviceFacts } from "./device-card.js";

// Device panel: background mode, runtime and task permissions.
export function DeviceTasksPanel({ m, device, facts }: { m: DashboardModel; device: Device; facts: DeviceFacts }) {
  const {
    askConfirm, backgroundPhase, backgroundTargetEnabled, backgroundUpdatingId, devicePanel,
    deviceTaskBusy, runtimeTargetPaused, runtimeUpdatingId, saveDeviceTaskPermission, showNotice,
    tr, updateDeviceBackground, updateDeviceRuntime,
  } = m;
  const { recoveryVersion, runtimeVersion, updateAvailable, updateCommand } = facts;
  return (
    <section role="tabpanel" id={"device-panel-"+device.id+"-tasks"} aria-labelledby={"device-tab-"+device.id+"-tasks"} aria-label={tr("Background and tasks", "后台与任务")} hidden={devicePanel !== "tasks"}>
{updateAvailable && (
  <div className="deviceBackgroundRow deviceUpdateRow">
    <div>
      <strong>{tr("Remote Arc update available", "Remote Arc 有可用更新")}</strong>
      <span>{tr("Running: ", "运行版本：")}v{runtimeVersion} · {tr("Latest: ", "最新版本：")}v{LATEST_AGENT_VERSION}</span>
      {recoveryVersion && <span>{tr("Installed recovery bundle: ", "已安装恢复包：")}v{recoveryVersion}</span>}
      <span>{tr("Run the upgrade command on this computer. An older idle Agent is replaced automatically; active work asks for confirmation. Pairing, permissions and your recovery setting are preserved.", "在这台电脑上执行升级命令。旧版 Agent 空闲时会自动接替；有任务运行时会先询问确认。配对、权限和恢复设置会保留。")}</span>
    </div>
    <button className="ghostButton small" onClick={async () => {
      try {
        if (navigator.clipboard) await navigator.clipboard.writeText(updateCommand);
        await showNotice(
          tr("Upgrade Remote Arc", "升级 Remote Arc"),
          updateCommand + (navigator.clipboard ? "\n\n" + tr("Copied to clipboard.", "已复制到剪贴板。") : ""),
        );
      } catch {
        await showNotice(tr("Upgrade Remote Arc", "升级 Remote Arc"), updateCommand);
      }
    }}>{tr("Copy upgrade command", "复制升级命令")}</button>
  </div>
)}
<div className="deviceBackgroundRow" aria-busy={backgroundUpdatingId === device.id}>
  <div>
    <div className="labelWithHelp">
      <strong>{tr("Automatic recovery", "自动恢复")}</strong>
      <HelpTip label={tr("About automatic recovery", "了解自动恢复")}
        text={tr("The switch enables a local supervisor and login startup. It keeps your terminal and operation log open, and takes over if the executing Agent ends. Relay reconnect handles network interruptions separately. Turning recovery off preserves current execution; Stop background Agent also ends its work. Sleep, shutdown and logout can still make the device unavailable.", "此开关启用本机守护和登录自启，保留终端及操作日志，执行 Agent 结束后由守护接手。网络中断由独立的 Relay 重连处理。关闭恢复会保留当前执行；“停止后台 Agent”还会结束它的工作。睡眠、关机或退出登录仍可能让电脑不可用。")}/>
    </div>
    <span>{backgroundUpdatingId === device.id
      ? backgroundPhase === "applying" ? tr("Sending device command…", "正在发送设备指令…") : backgroundPhase === "stopping" ? tr("Waiting for Agent to disconnect…", "正在等待 Agent 离线…") : tr("Waiting for supervisor confirmation…", "正在确认后台守护进程…")
      : device.status !== "online" ? tr("Reconnect to verify the local recovery setting", "重新连接后可确认本机恢复设置") : device.background_recovery_available
      ? device.background_enabled ? tr("Enabled · login startup and process recovery", "已启用 · 登录自启与进程恢复") : tr("Off · current execution continues", "已关闭 · 当前执行继续")
      : tr("Older client · login startup only. Update to keep the terminal attached and recover processes.", "旧版客户端仅提供登录自启。更新客户端后支持保留终端与进程恢复。")}</span>
    <span>{tr("Supervisor: ", "守护：")}{device.background_guard_active
      ? tr("Running", "运行中") + (device.background_guard_pid ? " · PID " + device.background_guard_pid : "")
      : device.status !== "online" ? tr("Unconfirmed while offline", "离线，无法确认") : tr("Not confirmed", "尚未确认")}</span>
    <span>{tr("Execution: ", "执行：")}{device.status !== "online" ? tr("Disconnected from Relay", "Relay 已断开")
      : device.execution_paused === true ? tr("Paused · wake-only control connected", "已暂停 · 仅唤醒控制通道在线")
      : device.execution_mode === "foreground" ? tr("Foreground Agent connected", "前台 Agent 已连接")
      : device.background_active ? tr("Background Agent connected", "后台 Agent 已连接") : tr("Agent connected", "Agent 已连接")}
      {device.agent_pid ? " · PID " + device.agent_pid : ""}{device.agent_version ? " · v" + device.agent_version : ""}</span>
  </div>
  <div className="managedProcessActions backgroundRecoveryControls">
    <span className="backgroundToggleProgress" data-pending={backgroundUpdatingId === device.id} id={"background-toggle-progress-" + device.id} role="status" aria-live="polite" aria-label={backgroundUpdatingId === device.id ? tr("Verifying background recovery on device", "正在设备上确认后台恢复") : undefined}>
      <span className="backgroundToggleSpinner" aria-hidden="true" />
    </span>
    {device.background_enabled === true && device.background_guard_active !== true && device.status === "online" && device.background_recovery_available && (
      <button className="ghostButton small" disabled={UI_PREVIEW || backgroundUpdatingId === device.id} onClick={() => void updateDeviceBackground(device, true, false)}>{tr("Repair recovery", "修复恢复")}</button>
    )}
    {device.status === "online" && (
      <button
        className="dangerButton small"
        disabled={UI_PREVIEW || backgroundUpdatingId === device.id || !!runtimeUpdatingId || device.stop_agent_available !== true}
        title={device.stop_agent_available ? tr("Disable auto-recovery and stop this computer's Agent.", "关闭自动恢复并停止此电脑的 Agent。") : tr("Update this computer's Agent to use remote Stop Agent.", "请先升级此电脑 Agent，才能远程停止。")}
        onClick={async () => {
          if (await askConfirm(
            tr("Disconnect this computer completely?", "完全断开这台电脑？"),
            tr("This disables BOTH the execution Agent and the wake-only connection, and turns off future automatic recovery. Remote Arc cannot remotely start a fully disconnected computer. You must restart it locally.", "这会同时停止执行 Agent 和仅唤醒连接，并关闭之后的自动恢复。完全断开后 Remote Arc 无法再远程启动这台电脑，必须从本机重新启动。"),
          )) await updateDeviceBackground(device, false, true);
        }}
      >{device.stop_agent_available ? tr("Disconnect completely", "完全断开") : tr("Disconnect · update needed", "断开 · 需升级")}</button>
    )}
    <label className="compactSwitch">
      <input type="checkbox" aria-label={tr("Automatic recovery", "自动恢复")}
        checked={backgroundUpdatingId === device.id && backgroundTargetEnabled !== null ? backgroundTargetEnabled : device.background_enabled === true}
        disabled={UI_PREVIEW || backgroundUpdatingId === device.id || !!runtimeUpdatingId || device.execution_paused === true || device.status !== "online" || !device.background_agent_available}
        aria-describedby={backgroundUpdatingId === device.id ? "background-toggle-progress-" + device.id : undefined}
        onChange={async (event) => {
          const enabled = event.target.checked;
          if (enabled && !device.background_recovery_available) {
            await showNotice(tr("Update remotelink first", "请先更新 remotelink"), tr("This Agent predates process recovery and exits the terminal when enabling background mode. Use the updated CLI before enabling recovery.", "当前 Agent 尚不支持进程恢复，启用旧版后台模式会退出终端。请先使用更新后的 CLI 再启用恢复。")); return;
          }
          await updateDeviceBackground(device, enabled, false);
        }}/><span/>
    </label>
  </div>
</div>

<div className="deviceBackgroundRow deviceRuntimePauseRow" aria-busy={runtimeUpdatingId === device.id}>
  <div>
    <strong>{tr("Execution control", "执行控制")}</strong>
    <span>{runtimeUpdatingId === device.id
      ? runtimeTargetPaused ? tr("Pausing execution and connecting the wake-only channel…", "正在停止执行并切换至仅唤醒通道…") : tr("Restoring the execution Agent…", "正在恢复执行 Agent…")
      : device.status !== "online" ? tr("Fully disconnected · restart Remote Arc locally", "已完全断开 · 请在电脑本机启动 Remote Arc")
      : device.execution_paused ? tr("Paused · computer tools are blocked; dashboard wake control stays connected", "已暂停 · 电脑操作已封锁，Dashboard 唤醒控制仍在线")
      : tr("Running · AI computer tools can execute according to device permissions", "运行中 · AI 可按设备权限执行电脑操作")}</span>
    <span>{tr("Pause keeps a minimal authenticated wake channel. Disconnect completely closes it as well.", "暂停时保留最小授权唤醒通道；完全断开则连该通道一起关闭。")}</span>
  </div>
  <div className="managedProcessActions backgroundRecoveryControls">
    <span className="backgroundToggleProgress" data-pending={runtimeUpdatingId === device.id} role="status" aria-live="polite">
      <span className="backgroundToggleSpinner" aria-hidden="true" />
    </span>
    <button className="ghostButton small"
      disabled={UI_PREVIEW || !!backgroundUpdatingId || !!runtimeUpdatingId || device.status !== "online" || device.pause_agent_available !== true || (!device.execution_paused && (!device.background_enabled || !device.background_guard_active))}
      title={device.pause_agent_available ? tr("Switch between full execution and wake-only control.", "切换完整执行和仅唤醒控制。") : tr("Upgrade remotelink for remote Pause / Resume.", "请升级 remotelink 后使用远程暂停与恢复。")}
      onClick={async () => {
        const resume = device.execution_paused === true;
        if (!resume && !await askConfirm(
          tr("Pause computer execution?", "暂停这台电脑的执行？"),
          tr("Remote file/terminal tools will stop working and running managed operations may be interrupted. Only a minimal authenticated wake connection stays online so you can resume from Dashboard.", "远程文件与终端工具将不可用，正在执行的受管操作可能中断。设备仅保留最小授权唤醒连接，之后可通过 Dashboard 恢复。"),
        )) return;
        await updateDeviceRuntime(device, !device.execution_paused);
      }}
    >{device.pause_agent_available ? device.execution_paused ? tr("Resume Agent", "恢复 Agent") : tr("Pause Agent", "暂停 Agent") : tr("Pause / Resume · update needed", "暂停 / 恢复 · 需升级")}</button>
  </div>
</div>

<details className="deviceTaskSettings" open>
  <summary>{tr("Task permissions", "任务权限")}<span>{Object.values(device.automation_permissions || legacyTaskPermissions).filter(Boolean).length} / 5 {tr("enabled", "已开启")}</span></summary>
  <p>{tr("Choose which background capabilities this computer allows. Describe tasks and routines in Arc Chat or your connected AI. Turning a permission off stops affected work.", "选择这台电脑允许使用的后台能力。在 Arc Chat 或已连接的 AI 中描述任务和例行工作即可；关闭权限会停止相关工作。")}</p>
  {([
    ["background_tasks", tr("Background tasks", "后台任务")],
    ["scheduled_tasks", tr("Scheduled tasks", "定时任务")],
    ["adaptive_agent", tr("Adaptive Agent Goals", "自主 Agent 目标任务")],
    ["source_agent", tr("Continue with the source agent", "由当前 AI 客户端持续推进")],
    ["keep_awake", tr("Allow a task to keep this computer awake", "允许任务期间保持电脑唤醒")],
  ] as Array<[keyof DeviceTaskPermissions, string]>).map(([key, label]) => (
    <div className="deviceBackgroundRow" key={key}>
      <strong>{label}</strong>
      <label className="compactSwitch">
        <input type="checkbox" aria-label={label}
          checked={(device.automation_permissions || legacyTaskPermissions)[key]}
          disabled={UI_PREVIEW || !!deviceTaskBusy || (key === "keep_awake" && !device.keep_awake_available)}
          onChange={(event) => void saveDeviceTaskPermission(device, key, event.target.checked)} />
        <span />
      </label>
    </div>
  ))}
  {!device.keep_awake_available && <p>{tr("Keeping awake requires an updated device agent. Login autostart alone does not prevent sleep.", "保持唤醒需要新版设备 Agent。仅开启登录自启不会阻止电脑睡眠。")}</p>}
  <a href="/docs/long-running-work">{tr("How long-running work operates", "了解长任务如何运行")} →</a>
</details>

    </section>
  );
}
