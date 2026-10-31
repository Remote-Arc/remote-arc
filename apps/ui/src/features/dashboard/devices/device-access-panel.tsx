import { useState } from "react";
import { RunnerAttentionSetting } from "../../browser-runner/runner-view.js";
import { isBrowserRunnerTool } from "./device-tools.js";
import { ProductIcon } from "../../../components/product-icon.js";
import { UI_PREVIEW } from "../../../preview/preview.js";
import { HelpTip } from "../../../components/public-layout.js";
import { timeAgo } from "../format.js";
import type { Device } from "../../../types/app-types.js";
import type { DashboardModel } from "../hooks/use-dashboard-model.js";
import type { DeviceFacts } from "./device-card.js";

// Device panel: MCP access, browser tools, file boundaries and Local Undo.
export function DeviceAccessPanel({ m, device, facts }: { m: DashboardModel; device: Device; facts: DeviceFacts }) {
  const [runnerSettingsOpen, setRunnerSettingsOpen] = useState(false);
  const {
    addPolicyPath, applyDevicePreset, browseDeviceDirectories, devicePanel, loadUndoHistory,
    removePolicyPath, restoreUndoAction, saveDevicePolicy, sensitivePolicyBusyId, tr, undoByDevice,
    undoErrors, undoLoading, updateDeviceTools, updateSensitiveProtection,
  } = m;
  const {
    accessPreset, advertisedTools, allTools, enabledTools, runnerAdvertised, runnerEnabled,
    runnerVisible,
  } = facts;
  return (
    <section role="tabpanel" id={"device-panel-"+device.id+"-access"} aria-labelledby={"device-tab-"+device.id+"-access"} aria-label={tr("Access and files", "权限与文件")} hidden={devicePanel !== "access"}>
<div className="deviceAccessSummary">
  <div>
    <span className="eyebrow">{tr("MCP ACCESS", "MCP 权限")}</span>
    <strong>
      {accessPreset === "safe"
        ? tr("Safe · read-only", "Safe · 只读")
        : accessPreset === "developer"
          ? tr("Developer · files can be edited", "Developer · 可编辑文件")
          : accessPreset === "full"
            ? tr("Full access · terminal enabled", "Full Access · 已启用终端")
            : tr("Custom tool policy", "自定义工具权限")}
    </strong>
    <p>{tr("New devices start in Safe. Enable only the skills you want this AI to use.", "新设备默认使用 Safe，只开启你愿意交给 AI 的技能。")}</p>
  </div>

</div>

<div className="devicePresetRow">
  <span>{tr("Quick presets", "快捷预设")}</span>
  <div>
    <button className={accessPreset === "safe" ? "active" : ""} onClick={() => void applyDevicePreset(device, "safe")}>
      <strong>Safe</strong><small>{tr("Read only", "只读")}</small>
    </button>
    <button className={accessPreset === "developer" ? "active" : ""} onClick={() => void applyDevicePreset(device, "developer")}>
      <strong>Developer</strong><small>{tr("Read + edit", "读写文件")}</small>
    </button>
    <button className={accessPreset === "full" ? "active danger" : "danger"} onClick={() => void applyDevicePreset(device, "full")}>
      <strong>Full</strong><small>{tr("Terminal", "含终端")}</small>
    </button>
  </div>
</div>

<details className="deviceToolDetails">
  <summary><span className="deviceDisclosureTitle"><ProductIcon name="settings" size={16}/>{tr("Manage individual skills", "逐项管理技能")}</span><span>{enabledTools.filter((tool) => !isBrowserRunnerTool(tool)).length + (runnerVisible && runnerEnabled ? 1 : 0)} / {allTools.length + (runnerVisible ? 1 : 0)}<ProductIcon name="chevron" size={14}/></span></summary>
  <div className="toolToggleGrid">
    {runnerVisible && (
      <div className={"toolToggle browserRunnerTool" + (!runnerAdvertised ? " unavailable" : "")} key="browser_runner">
        <label className="browserRunnerToggle">
          <input type="checkbox" checked={runnerEnabled} disabled={!runnerAdvertised && !runnerEnabled} onChange={(event) => {
            if (!event.target.checked) setRunnerSettingsOpen(false);
            void updateDeviceTools(device, "browser_runner_act", event.target.checked);
          }} />
          <strong>browser_runner</strong>
        </label>
          <HelpTip
            label={tr("About browser_runner", "了解 browser_runner")}
            text={runnerAdvertised
              ? tr("Lets your AI open, read and act on websites, only on the sites each task names. It uses a hidden Remote Arc window (installed Chrome, Edge or Chromium) with its own sign-ins, which appears only when a page needs you and you are ready; your own Chrome is an advanced option used only when you ask for it. Complete sign-in, verification codes and CAPTCHAs in the task browser yourself, then your AI can continue. A submit is never sent twice.", "允许你的 AI 打开、读取和操作网站，只能访问每个任务指定的网站。使用隐藏的 Remote Arc 窗口（已安装的 Chrome、Edge 或 Chromium），有自己的登录状态，只有页面需要你、且你准备好时才出现；使用你自己的 Chrome 是高级选项，只有你要求时才用。登录、验证码和人机验证需要你在任务浏览器中完成，完成后 AI 可以继续。提交不会重复发送。")
              : tr("Needs Remote Arc Agent 0.6.2-rc.4 or newer and Chrome, Edge or Chromium installed on this computer.", "需要 Remote Arc Agent 0.6.2-rc.4 或更新版本，并且这台电脑装有 Chrome、Edge 或 Chromium。")}
          />
        {runnerEnabled && <button type="button" className="browserRunnerSettingsButton"
          aria-label={tr("Browser Runner settings", "Browser Runner 设置")}
          title={tr("Browser Runner settings", "Browser Runner 设置")}
          aria-expanded={runnerSettingsOpen} aria-controls={"runner-settings-" + device.id}
          onClick={() => setRunnerSettingsOpen(open => !open)}>
          <ProductIcon name="settings" size={14}/>
        </button>}
      </div>
    )}
    {runnerEnabled && runnerSettingsOpen && <div className="browserRunnerSettingsPanel" id={"runner-settings-" + device.id}
      role="region" aria-label={tr("Browser Runner settings", "Browser Runner 设置")}>
      <RunnerAttentionSetting deviceId={device.id}/>
      <p className="browserAuthenticationNotice">{tr(
        "Complete sign-in, verification codes and CAPTCHAs in the task browser yourself. Your AI can continue once you are done.",
        "登录、验证码和人机验证需要你在任务浏览器中完成，完成后 AI 可以继续。",
      )}</p>
    </div>}
    {device.platform === "browser" && <p className="runnerSetting browserAuthenticationNotice">{tr(
      "Complete sign-in, verification codes and CAPTCHAs in your browser yourself. Your AI can continue once you are done.",
      "登录、验证码和人机验证需要你在浏览器中完成，完成后 AI 可以继续。",
    )}</p>}
    {allTools.map((tool) => {
      const enabled = device.allowed_tools == null ? (device.status === "online" ? advertisedTools.includes(tool) : true) : device.allowed_tools.includes(tool);
      const advertised = device.status === "online" ? advertisedTools.includes(tool) : true;
      const description =
        tool === "read_binary_file"
          ? tr("Read bounded binary byte ranges on every plan. This device switch and account authorization are still required.", "所有套餐均可读取有界的二进制字节区间。仍需账号授权并开启这个设备开关。")
          : tool === "undo_last_change"
          ? tr("AI permission: lets the connected AI invoke the newest Local Undo snapshot. Snapshot creation is controlled separately under Recovery below.", "AI 权限：允许已连接的 AI 调用最新一条 Local Undo 快照。是否创建快照由下方 Recovery 中的 Local Undo 单独控制。")
          : tool === "start_process"
            ? tr("Run shell commands on this computer.", "在这台电脑上执行 Shell 命令。")
            : tool === "process_status" || tool === "process_output"
              ? tr("Inspect a Remote Arc managed background process.", "查看由 Remote Arc 管理的后台进程。")
              : tool === "stop_process"
                ? tr("Stop a Remote Arc managed background process.", "停止由 Remote Arc 管理的后台进程。")
                : tr("Allow this AI client to use this native Remote Arc skill.", "允许 AI 客户端使用这个 Remote Arc 原生技能。");
      return (
        <label className={"toolToggle" + (!advertised ? " unavailable" : "")} key={tool}>
          <input type="checkbox" checked={enabled} disabled={!advertised} onChange={(event) => void updateDeviceTools(device, tool, event.target.checked)} />
          <span className="skillLabel">
            <strong>{tool}</strong>
            <HelpTip
              label={tr("About " + tool, "了解 " + tool)}
              text={description}
            />
          </span>
        </label>
      );
    })}
  </div>
  {device.status === "offline" && <span className="offlineTools">{tr("Offline: changes are saved now and enforced the next time this device connects.", "设备离线：修改会立即保存，并在设备下次连接时生效。")}</span>}
</details>

<details className="deviceSafetyDetails">
  <summary>
    <span className="deviceDisclosureTitle"><ProductIcon name="shield" size={16}/>{tr("File boundaries & recovery", "文件边界与恢复")}</span>
    <span>
      {(device.protect_sensitive_paths ?? true)
        ? tr("Sensitive paths protected", "敏感路径已保护")
        : tr("Sensitive protection off", "敏感路径保护已关闭")}
      {" · "}
      {(device.workspace_roots || []).length
        ? (device.workspace_roots || []).length + " " + tr("workspaces", "个工作区")
        : tr("read-only until scoped", "未设范围时仅只读")}<ProductIcon name="chevron" size={14}/>
    </span>
  </summary>

  <div className="deviceSafetyBody">
    {!device.policy_enforcement_available && device.status === "online" && (
      <p className="policyWarning">{tr(
        "This device is still running an older remotelink client. Policy settings are saved now, but symlink-safe local enforcement activates after you restart it with the latest npm release.",
        "这台设备仍在运行旧版 remotelink。策略会立即保存，但防符号链接绕过的本机强制执行，需要用最新版 npm 客户端重启后才会生效。",
      )}</p>
    )}
    <div className="policyToggleRow">
      <div className="labelWithHelp">
        <strong>{tr("Sensitive Path Policy", "敏感路径策略")}</strong>
        <HelpTip
          label={tr("About Sensitive Path Policy", "了解敏感路径策略")}
          text={tr(
            "Enabled by default. Protects built-in credential locations such as .ssh, .aws, browser profiles and .env files, plus extra protected paths. You can turn it off per device after a warning; prefer a narrow exception whenever possible.",
            "默认开启。保护 .ssh、.aws、浏览器配置、.env 等内置敏感位置以及额外配置的保护路径。可以在确认风险后按设备关闭，但建议优先使用窄范围例外。",
          )}
        />
      </div>
      <label className="compactSwitch" title={tr("Sensitive Path Protection (enabled by default)", "敏感路径保护（默认开启）")}>
        <input
          type="checkbox"
          checked={device.protect_sensitive_paths ?? true}
          disabled={UI_PREVIEW || sensitivePolicyBusyId === device.id}
          onChange={(event) => void updateSensitiveProtection(device, event.target.checked)}
        />
        <span />
      </label>
    </div>

    {device.protect_sensitive_paths === false && (
      <p className="policyWarning" role="alert">{tr(
        "Sensitive Path Protection is OFF. Built-in and extra protected path rules are not applied to file tools. Connected AI clients can access credential paths if other tool and workspace permissions permit. Turn this back on when finished.",
        "敏感路径保护已关闭。文件工具不再应用内置和额外保护路径规则；如果其他工具及工作区权限允许，已连接的 AI 可能访问凭证文件。使用结束后请重新开启。",
      )}</p>
    )}
    <div className="policyBlock">
      <div className="policyBlockHead">
        <div className="labelWithHelp">
          <strong>{tr("Trusted Write Locations", "可信写入区域")}</strong>
          <HelpTip
            label={tr("About Trusted Write Locations", "了解可信写入区域")}
            text={tr(
              "These are trusted mutation roots. Read-only tools may inspect other non-sensitive paths, but file changes and terminal execution require a configured workspace.",
              "这些目录是长期可信的修改区域。只读工具仍可查看其他非敏感路径，但文件修改与终端执行必须先配置工作区。",
            )}
          />
        </div>
        <div className="policyHeaderActions">
          <button className="ghostButton small" disabled={device.status !== "online"} onClick={() => void browseDeviceDirectories(device)}>
            {tr("Browse folders", "浏览目录")}
          </button>
          <button className="ghostButton small" onClick={() => void addPolicyPath(device, "workspace_roots")}>
            + {tr("Enter path", "输入路径")}
          </button>
        </div>
      </div>
      <div className="policyPathList">
        {(device.workspace_roots || []).map((root) => (
          <span className="policyPathChip" key={root}>
            <code>{root}</code>
            <button
              title={tr("Remove", "移除")}
              onClick={() => void removePolicyPath(device, "workspace_roots", root)}
            >×</button>
          </span>
        ))}
        {!(device.workspace_roots || []).length && (
          <span className="policyEmpty">{tr(
            "No trusted write workspace yet. Read-only access to non-sensitive paths still works.",
            "尚未设置可信写入工作区；仍可只读访问其他非敏感路径。",
          )}</span>
        )}
      </div>
      {enabledTools.includes("start_process") && !!(device.workspace_roots || []).length && (
        <p className="policyWarning">{tr(
          "Full terminal access is not an OS sandbox. Remote Arc requires an in-scope cwd, but shell commands may still reference other paths. Use Developer mode when strict file confinement matters.",
          "Full 终端并不是操作系统级沙箱。Remote Arc 会要求 cwd 位于工作区内，但 Shell 命令仍可能引用其他路径；需要严格文件隔离时请使用 Developer 模式。",
        )}</p>
      )}
    </div>

    <div className="policyBlock">
      <div className="policyBlockHead">
        <div className="labelWithHelp">
          <strong>{tr("Extra protected paths", "额外保护路径")}</strong>
          <HelpTip
            label={tr("About extra protected paths", "了解额外保护路径")}
            text={tr(
              "Add private folders that should remain blocked in addition to Remote Arc's built-in sensitive locations.",
              "在内置敏感位置之外，再添加不希望 AI 访问的私有目录。",
            )}
          />
        </div>
        <button className="ghostButton small" onClick={() => void addPolicyPath(device, "sensitive_paths")}>
          + {tr("Protect path", "保护路径")}
        </button>
      </div>
      <div className="policyPathList">
        {(device.sensitive_paths || []).map((root) => (
          <span className="policyPathChip protected" key={root}>
            <code>{root}</code>
            <button
              title={tr("Remove", "移除")}
              onClick={() => void removePolicyPath(device, "sensitive_paths", root)}
            >×</button>
          </span>
        ))}
        {!(device.sensitive_paths || []).length && (
          <span className="policyEmpty">{tr(
            "Built-in sensitive paths only.",
            "当前仅使用内置敏感路径。",
          )}</span>
        )}
      </div>
    </div>

    <div className="policyBlock">
      <div className="policyBlockHead">
        <div className="labelWithHelp">
          <strong>{tr("Sensitive path exceptions", "敏感路径例外")}</strong>
          <HelpTip
            label={tr("About sensitive path exceptions", "了解敏感路径例外")}
            text={tr(
              "Keep protection enabled globally, but explicitly allow only the sensitive files or folders this device truly needs. A sensitive-path exception grants visibility only; it does not create write authority outside Trusted Write Locations.",
              "保持整体敏感路径保护开启，只对确实需要访问的敏感文件或目录做窄范围例外；敏感路径例外只授予可见性，不会自动获得可信写入区域之外的修改权限。",
            )}
          />
        </div>
        <button
          className="ghostButton small"
          onClick={() => void addPolicyPath(device, "sensitive_allow_paths")}
        >
          + {tr("Allow exception", "添加例外")}
        </button>
      </div>
      <div className="policyPathList">
        {(device.sensitive_allow_paths || []).map((root) => (
          <span className="policyPathChip exception" key={root}>
            <code>{root}</code>
            <button
              title={tr("Remove", "移除")}
              onClick={() => void removePolicyPath(device, "sensitive_allow_paths", root)}
            >×</button>
          </span>
        ))}
        {!(device.sensitive_allow_paths || []).length && (
          <span className="policyEmpty">{tr(
            "No sensitive-path exceptions.",
            "当前没有敏感路径例外。",
          )}</span>
        )}
      </div>

    </div>

    <div className="policyToggleRow undoPolicyToggle">
      <div className="labelWithHelp">
        <strong>{tr("Create Local Undo snapshots", "创建 Local Undo 快照")}</strong>
        <HelpTip
          label={tr("About Local Undo snapshots", "了解 Local Undo 快照")}
          text={tr(
            "Recovery setting: when enabled, supported file edits save the previous state on this computer. This is separate from the undo_last_change skill, which only controls whether AI may invoke an existing snapshot.",
            "恢复设置：开启后，支持的文件修改会先在本机保存修改前状态。它和 undo_last_change 技能是两件事；后者只控制 AI 是否能调用已有快照。",
          )}
        />
      </div>
      <label className="compactSwitch">
        <input
          type="checkbox"
          checked={device.undo_enabled ?? true}
          onChange={(event) => void saveDevicePolicy(device, {
            undo_enabled: event.target.checked,
          })}
        />
        <span />
      </label>
    </div>

    <div className="undoHistorySection">
      <div className="policyBlockHead">
        <div className="labelWithHelp">
          <strong>{tr("Undo history", "撤销历史")}</strong>
          <HelpTip
            label={tr("About Undo history", "了解撤销历史")}
            text={tr(
              "Loaded directly from the device on demand; this history is not persisted in the cloud.",
              "仅在需要时直接从设备读取，历史记录不会持久化到云端。",
            )}
          />
        </div>
        <button
          className="ghostButton small"
          disabled={
            device.status !== "online" ||
            !device.undo_history_available ||
            undoLoading === device.id
          }
          onClick={() => void loadUndoHistory(device)}
        >
          {undoLoading === device.id ? tr("Loading…", "加载中…") : tr("Refresh", "刷新")}
        </button>
      </div>

      {!device.undo_history_available && (
        <p className="policyNotice">{tr(
          "Undo history UI requires the latest remotelink client. Restart this device with the current npm release after the update is published.",
          "撤销历史 UI 需要最新版 remotelink 客户端。新版本发布后，请用最新 npm 版本重启这台设备。",
        )}</p>
      )}

      {!!undoErrors[device.id] && (
        <p className="policyWarning">{undoErrors[device.id]}</p>
      )}

      {!!undoByDevice[device.id]?.length && (
        <div className="undoActionList">
          {(undoByDevice[device.id] || []).map((action) => (
            <div className="undoActionRow" key={action.id}>
              <div>
                <strong>{action.tool}</strong>
                <code title={action.path}>{action.path}</code>
                <small>
                  {timeAgo(action.created_at)}
                  {" · "}
                  {action.existed_before
                    ? tr("restore previous content", "恢复原有内容")
                    : tr("remove created file", "删除新建文件")}
                  {" · "}
                  {action.status === "ready"
                    ? tr("ready", "可撤销")
                    : action.status === "conflict"
                      ? tr("conflict: file changed again", "冲突：文件后来又被修改")
                      : action.status === "missing"
                        ? tr("target missing", "目标文件已不存在")
                        : tr("legacy snapshot", "旧版快照")}
                </small>
              </div>
              <button
                className="ghostButton small"
                disabled={
                  undoLoading === device.id ||
                  !(device.undo_enabled ?? true) ||
                  !action.can_undo
                }
                title={
                  action.can_undo
                    ? tr("Restore this local snapshot", "恢复这个本机快照")
                    : tr("Automatic undo is unavailable because the current file no longer matches the recorded post-edit state.", "当前文件已不再匹配当时修改后的状态，自动撤销不可用。")
                }
                onClick={() => void restoreUndoAction(device, action)}
              >
                {action.can_undo ? tr("Undo", "撤销") : tr("Unavailable", "不可撤销")}
              </button>
            </div>
          ))}
        </div>
      )}

      {undoByDevice[device.id] !== undefined && !(undoByDevice[device.id] || []).length && !undoErrors[device.id] && (
        <p className="policyEmpty">{tr(
          "No reversible Remote Arc file changes are currently stored.",
          "当前没有可撤销的 Remote Arc 文件修改。",
        )}</p>
      )}
    </div>
  </div>
</details>

    </section>
  );
}
