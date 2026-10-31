import { isBrowserRunnerTool, toggledDeviceTools } from "../devices/device-tools.js";
import { useRef, useState } from "react";
import { useI18n } from "../../../app/i18n.js";
import { UI_PREVIEW } from "../../../preview/preview.js";
import { waitForAgentOffline, waitForRecoveryState } from "../devices/background-recovery.js";
import { type Device, type DeviceTaskPermissions, type DirectoryBrowser } from "../../../types/app-types.js";
import { DEVELOPER_DEVICE_TOOLS, DEVICE_TOOL_CATALOG, type DeviceAccessPreset, SAFE_DEVICE_TOOLS, legacyTaskPermissions } from "../devices/device-presets.js";
import type { DashboardDialogs } from "./use-dashboard-dialogs.js";

type Translate = ReturnType<typeof useI18n>["tr"];


// Device access presets, tools, file policy, directory browser, background mode and runtime.
export function useDeviceSettings({ devices, tr, refreshAll, showNotice, askConfirm, askPrompt }: { devices: Device[]; tr: Translate; refreshAll: () => Promise<void>; showNotice: DashboardDialogs["showNotice"]; askConfirm: DashboardDialogs["askConfirm"]; askPrompt: DashboardDialogs["askPrompt"] }) {
  const [backgroundUpdatingId, setBackgroundUpdatingId] = useState<string | null>(null);
  const [backgroundTargetEnabled, setBackgroundTargetEnabled] = useState<boolean | null>(null);
  const [backgroundPhase, setBackgroundPhase] = useState<"applying" | "verifying" | "stopping">("applying");
  const backgroundMutationInFlight = useRef(false);
  const runtimeMutationInFlight = useRef(false);
  const [runtimeUpdatingId, setRuntimeUpdatingId] = useState<string | null>(null);
  const [runtimeTargetPaused, setRuntimeTargetPaused] = useState<boolean | null>(null);
  const [deviceTaskBusy, setDeviceTaskBusy] = useState<string | null>(null);
  const [sensitivePolicyBusyId, setSensitivePolicyBusyId] = useState<string | null>(null);

  const [directoryPicker, setDirectoryPicker] = useState<{
    device: Device;
    browser: DirectoryBrowser | null;
    loading: boolean;
    error: string;
  } | null>(null);

  async function saveDeviceTools(device: Device, next: readonly string[]) {
    const available = device.status === "online"
      ? (device.available_tools || device.tools)
      : Array.from(new Set([...DEVICE_TOOL_CATALOG, ...(device.available_tools || device.tools)]));
    const allowedTools = Array.from(new Set(next)).filter((tool) => available.includes(tool));
    const response = await fetch("/api/devices/" + encodeURIComponent(device.id) + "/tools", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ allowed_tools: allowedTools }),
    });
    if (!response.ok) {
      await showNotice(
        tr("Skill access was not updated", "技能权限未更新"),
        tr("Remote Arc could not save this device skill policy. The previous permissions are still in effect.", "Remote Arc 无法保存这台设备的技能策略，之前的权限仍然生效。"),
      );
      return false;
    }
    await refreshAll();
    return true;
  }

  async function updateDeviceBackground(
    device: Device,
    enabled: boolean,
    stopCurrent = false,
  ) {
    if (UI_PREVIEW || backgroundMutationInFlight.current || runtimeMutationInFlight.current) return;
    if (device.status !== "online") {
      await showNotice(
        tr("Computer is offline", "电脑当前离线"),
        tr(
          "Background mode can only be changed while the local Remote Arc agent is online. If it was disabled previously, run npx remotelink once on that computer to reconnect it.",
          "只有本机 Remote Arc Agent 在线时才能修改后台运行设置。如果之前已经关闭，请在那台电脑上运行一次 npx remotelink 重新连接。",
        ),
      );
      return;
    }
    if (!device.background_agent_available) {
      await showNotice(
        tr("Update remotelink first", "请先更新 remotelink"),
        tr(
          "This computer is running an older Remote Arc client that does not support background-agent controls yet.",
          "这台电脑正在运行旧版 Remote Arc 客户端，暂不支持后台 Agent 控制。",
        ),
      );
      return;
    }

    // Disable duplicate clicks synchronously, not after the next React render.
    backgroundMutationInFlight.current = true;
    setBackgroundUpdatingId(device.id);
    setBackgroundTargetEnabled(enabled);
    setBackgroundPhase("applying");
    try {
      const response = await fetch(
        "/api/devices/" + encodeURIComponent(device.id) + "/background",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            enabled,
            ...(enabled === false && stopCurrent ? { stop_current: true } : {}),
          }),
        },
      );
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) {
        await refreshAll();
        await showNotice(
          tr("Background setting was not updated", "后台设置未更新"),
          payload.error === "device offline" ? tr("This computer disconnected before the setting could be applied. The setting is not confirmed. Reconnect with npx remotelink on this computer, then try again.", "应用设置前这台电脑已断开连接，设置尚未确认。请在本机运行 npx remotelink 重新连接后再试。") : payload.error ||
            tr(
              "Remote Arc could not update the background connection on this computer.",
              "Remote Arc 无法更新这台电脑的后台连接设置。",
            ),
        );
        return;
      }
      if (stopCurrent) {
        // Stop is different from disabling recovery: confirm the *executor*
        // leaves the Relay, not merely that a boolean was saved in D1.
        setBackgroundPhase("stopping");
        const offline = await waitForAgentOffline(device.id, {
          read: async () => {
            const statusResponse = await fetch("/api/devices", {
              cache: "no-store",
              signal: AbortSignal.timeout(4_000),
            });
            if (!statusResponse.ok) throw new Error("Device status unavailable");
            return await statusResponse.json() as Device[];
          },
          pause: (ms) => new Promise((resolve) => window.setTimeout(resolve, ms)),
        });
        await refreshAll();
        await showNotice(
          offline ? tr("Agent stopped", "Agent 已停止") : tr("Stop still unconfirmed", "停止操作尚未确认"),
          offline
            ? tr("The Agent is offline and automatic recovery has been disabled. Restart it locally when you need access.", "Agent 已离线，自动恢复已关闭。需要重新使用时请在该电脑上启动。")
            : tr("The stop request was accepted, but the Agent has not gone offline yet. Check the device status before retrying.", "停止请求已被接受，但设备尚未确认离线。请先检查设备状态，再决定是否重试。"),
        );
        return;
      }
      // The POST acknowledges the command, but the operating-system supervisor
      // can take several seconds to start (or may still fail). Confirm a live
      // guard from a fresh device snapshot before dismissing the spinner.
      setBackgroundPhase("verifying");
      const confirmed = await waitForRecoveryState(device.id, enabled, {
        read: async () => {
          const response = await fetch("/api/devices", {
            cache: "no-store",
            signal: AbortSignal.timeout(4_000),
          });
          if (!response.ok) throw new Error("Device status unavailable");
          return await response.json() as Device[];
        },
        pause: (ms) => new Promise((resolve) => window.setTimeout(resolve, ms)),
      });
      await refreshAll();
      if (!confirmed) {
        await showNotice(
          tr("Still awaiting device confirmation", "仍在等待设备确认"),
          tr("The command was accepted, but the device has not confirmed the requested supervisor state. Check its displayed status or refresh before retrying.", "操作请求已接受，但设备尚未确认守护进程的目标状态。请先检查当前状态或刷新设备列表，再决定是否重试。"),
        );
      }
    } catch {
      await refreshAll().catch(() => undefined);
      await showNotice(tr("Background setting is unconfirmed", "后台设置尚未确认"), tr("The response was interrupted. Refresh the device state before trying again; the local setting may already have changed.", "响应已中断，请先刷新设备状态再尝试；本机设置可能已经发生变化。"));
    } finally {
      backgroundMutationInFlight.current = false;
      setBackgroundUpdatingId(null);
      setBackgroundTargetEnabled(null);
    }

  }

  async function updateDeviceRuntime(device: Device, paused: boolean) {
    if (UI_PREVIEW || runtimeMutationInFlight.current || backgroundMutationInFlight.current) return;
    if (device.status !== "online" || device.pause_agent_available !== true) return;
    runtimeMutationInFlight.current = true;
    setRuntimeUpdatingId(device.id);
    setRuntimeTargetPaused(paused);
    try {
      const response = await fetch("/api/devices/" + encodeURIComponent(device.id) + "/runtime", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ paused }),
      });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) {
        await refreshAll().catch(() => undefined);
        await showNotice(tr("Runtime change not accepted", "切换执行状态失败"),
          payload.error || tr("The current device cannot change runtime state.", "当前设备无法切换运行状态。"));
        return;
      }
      let confirmed = false;
      for (let attempt = 0; attempt < 18; attempt++) {
        await new Promise((resolve) => window.setTimeout(resolve, 1100));
        try {
          const result = await fetch("/api/devices", { cache: "no-store", signal: AbortSignal.timeout(4000) });
          if (!result.ok) continue;
          const list = await result.json() as Device[];
          const current = list.find((item) => item.id === device.id);
          if (current?.status === "online" && current.execution_paused === paused &&
            (paused ? current.tools.length === 0 : (current.available_tools?.length ?? 0) > 0)) {
            confirmed = true;
            break;
          }
        } catch { /* Transport failure does not prove a state transition. */ }
      }
      await refreshAll().catch(() => undefined);
      if (!confirmed) {
        await showNotice(tr("Runtime state unconfirmed", "执行状态尚未确认"),
          tr("The handoff may still be taking place. Refresh the device state before retrying; no second request was sent.", "执行实例可能仍在交接，请刷新设备状态确认后再重试；系统没有重复发送指令。"));
      }
    } catch {
      await refreshAll().catch(() => undefined);
      await showNotice(tr("Runtime state unconfirmed", "执行状态尚未确认"),
        tr("The response was interrupted. Check whether the device is paused before retrying.", "请求中断，请检查设备是否已经暂停，再决定是否重试。"));
    } finally {
      runtimeMutationInFlight.current = false;
      setRuntimeUpdatingId(null);
      setRuntimeTargetPaused(null);
    }
  }

  async function updateDeviceTools(device: Device, tool: string, enabled: boolean) {
    const workspaceRequired = new Set([
      "write_file",
      "edit_block",
      "undo_last_change",
      "start_process",
    ]);
    if (enabled && workspaceRequired.has(tool) && !(device.workspace_roots || []).length) {
      await showNotice(
        tr("Choose a Trusted Write Location first", "请先选择可信写入区域"),
        tr(
          "Remote Arc requires a Trusted Write Location before enabling this capability. Add one under File boundaries & recovery, then enable the tool again.",
          "Remote Arc 在开启此能力前必须先设置可信写入区域。请先在“文件边界与恢复”中添加目录，再重新开启。",
        ),
      );
      return;
    }
    if (enabled && tool === "start_process") {
      const confirmed = await askConfirm(
        tr("Enable terminal execution on " + device.name + "?", "在 " + device.name + " 上开启终端执行？"),
        tr(
          "This lets connected AI clients run shell commands that can modify files, software and external services. Safety Guard checks where deletes would land and stops ones that would reach drive roots, home, personal or system folders, plus a few other catastrophic commands, but terminal access is not an OS sandbox.",
          "这会允许已连接的 AI 运行可能修改文件、软件和外部服务的 Shell 命令。Safety Guard 会检查删除的实际落点，拦下会删到盘符根目录、主目录、个人或系统目录的命令以及少量其他灾难级命令，但终端权限并不是操作系统级沙箱。",
        ),
        tr("Enable terminal", "开启终端"),
        "danger",
      );
      if (!confirmed) return;
    }
    if (enabled && isBrowserRunnerTool(tool)) {
      const confirmed = await askConfirm(
        tr("Let AI act on websites from " + device.name + "?", "允许 AI 在 " + device.name + " 上操作网站？"),
        tr(
          "Connected AI clients will be able to click, fill, upload files from Trusted Locations and submit forms, only on the sites each task names: in a hidden Remote Arc browser window that only appears when you need to act (your own Chrome only if you ask for it). The AI never types passwords or card numbers; sign-ins saved on this computer are filled by Remote Arc itself, and a submit is never sent twice.",
          "已连接的 AI 将可以点击、填写、从可信目录上传文件并提交表单，且只能访问每个任务指定的网站：在隐藏的 Remote Arc 浏览器窗口里，只有需要你操作时才会出现（只有你要求时才用你自己的 Chrome）。AI 从不输入密码和卡号；保存在这台电脑上的登录信息由 Remote Arc 自己填写，提交也不会重复发送。",
        ),
        tr("Enable browser_runner", "开启 browser_runner"),
        "danger",
      );
      if (!confirmed) return;
    }
    const advertised = device.available_tools || device.tools;
    const baseline = device.status === "online"
      ? advertised
      : Array.from(new Set([...DEVICE_TOOL_CATALOG, ...advertised]));
    await saveDeviceTools(device, toggledDeviceTools(device.allowed_tools, baseline, tool, enabled));
  }

  async function applyDevicePreset(device: Device, preset: Exclude<DeviceAccessPreset, "custom">) {
    if (preset !== "safe" && !(device.workspace_roots || []).length) {
      await showNotice(
        tr("Choose a Trusted Write Location first", "请先选择可信写入区域"),
        tr(
          "Developer and Full Access are unavailable until this device has a Trusted Write Location.",
          "为设备指定可信写入区域后，才能开启 Developer 或 Full Access。",
        ),
      );
      return;
    }
    if (preset === "full") {
      const confirmed = await askConfirm(
        tr("Switch " + device.name + " to Full Access?", "将 " + device.name + " 切换为 Full Access？"),
        tr(
          "Full Access enables terminal execution and managed background processes. Commands may affect local files or external services and can include actions Local Undo cannot reverse.",
          "Full Access 会开启终端执行和后台进程管理。命令可能影响本地文件或外部服务，其中部分操作无法通过 Local Undo 撤销。",
        ),
        tr("Enable Full Access", "开启 Full Access"),
        "danger",
      );
      if (!confirmed) return;
    }
    const presetTools =
      preset === "safe"
        ? SAFE_DEVICE_TOOLS
        : preset === "developer"
          ? DEVELOPER_DEVICE_TOOLS
          : DEVICE_TOOL_CATALOG;
    // Changing the file/terminal preset keeps the separate browser_runner switch.
    const keepRunner = (device.allowed_tools || []).filter(isBrowserRunnerTool);
    await saveDeviceTools(device, [...presetTools, ...keepRunner]);
  }

  async function saveDeviceTaskPermission(device: Device, key: keyof DeviceTaskPermissions, enabled: boolean) {
    setDeviceTaskBusy(device.id);
    try {
      const response = await fetch("/api/devices/" + encodeURIComponent(device.id) + "/task-permissions", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...(device.automation_permissions || legacyTaskPermissions), [key]: enabled }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { error?: string };
        await showNotice(tr("Task settings were not saved", "任务设置未保存"), payload.error || tr("Please try again.", "请重试。"));
      } else await refreshAll();
    } catch {
      await showNotice(tr("Task settings were not saved", "任务设置未保存"), tr("Connection failed. Please try again.", "连接失败，请重试。"));
    } finally { setDeviceTaskBusy(null); }
  }

  async function saveDevicePolicy(
    device: Device,
    patch: Partial<Pick<Device, "workspace_roots" | "sensitive_paths" | "sensitive_allow_paths" | "protect_sensitive_paths" | "undo_enabled">>,
  ) {
    const next = {
      workspace_roots: patch.workspace_roots ?? device.workspace_roots ?? [],
      sensitive_paths: patch.sensitive_paths ?? device.sensitive_paths ?? [],
      sensitive_allow_paths: patch.sensitive_allow_paths ?? device.sensitive_allow_paths ?? [],
      protect_sensitive_paths:
        patch.protect_sensitive_paths ?? device.protect_sensitive_paths ?? true,
      undo_enabled: patch.undo_enabled ?? device.undo_enabled ?? true,
    };

    const response = await fetch(
      "/api/devices/" + encodeURIComponent(device.id) + "/policy",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...next,
          // Preserve an explicitly disabled state across other policy edits.
          acknowledge_sensitive_path_risk: next.protect_sensitive_paths === false,
        }),
      },
    );
    if (!response.ok) {
      const payload = await response.json().catch(() => ({})) as { error?: string };
      await showNotice(
        tr("Safety policy was not updated", "安全策略未更新"),
        payload.error || tr("Remote Arc could not save this device safety policy.", "Remote Arc 无法保存这台设备的安全策略。"),
      );
      return false;
    }
    await refreshAll();
    return true;
  }

  async function updateSensitiveProtection(device: Device, enabled: boolean) {
    if ((device.protect_sensitive_paths ?? true) === enabled || sensitivePolicyBusyId) return;
    setSensitivePolicyBusyId(device.id);
    try {
      if (!enabled) {
        const confirmed = await askConfirm(
          tr("Disable Sensitive Path Protection on " + device.name + "?", "关闭 " + device.name + " 的敏感路径保护？"),
          tr(
            "This disables BOTH built-in and extra protected paths for file tools. If allowed, connected AI clients may read or change credentials, .env files, SSH keys and browser profiles. Trusted Write Locations and tool permissions still apply. Prefer a narrow exception whenever possible.",
            "这会同时关闭文件工具的内置及额外敏感路径保护。只要其他权限允许，已连接的 AI 就可能读取或修改凭证、.env 文件、SSH 密钥和浏览器配置。可信写入区域及工具权限仍生效。能用单个路径例外时，建议优先使用例外。",
          ),
          tr("Disable protection", "确认关闭保护"),
          "danger",
        );
        if (!confirmed) return;
      }
      await saveDevicePolicy(device, { protect_sensitive_paths: enabled });
    } catch {
      await refreshAll().catch(() => undefined);
      await showNotice(
        tr("Sensitive protection setting unconfirmed", "敏感路径保护状态尚未确认"),
        tr(
          "The request was interrupted. Refresh and verify the device policy before trying again.",
          "请求中断。请刷新并核实设备策略，再决定是否重试。",
        ),
      );
    } finally {
      setSensitivePolicyBusyId(null);
    }
  }

  async function addPolicyPath(
    device: Device,
    kind: "workspace_roots" | "sensitive_paths" | "sensitive_allow_paths",
  ) {
    const label =
      kind === "workspace_roots"
        ? tr("Add an allowed workspace path", "添加允许访问的工作区路径")
        : kind === "sensitive_paths"
          ? tr("Add a protected sensitive path", "添加额外受保护路径")
          : tr("Allow one sensitive path exception", "添加敏感路径例外");
    const example =
      device.platform === "win32"
        ? "E:\\Coding"
        : "~/work";
    const next = (await askPrompt(
      label,
      tr(
        "Enter a local path on " + device.name + ". Example: " + example,
        "输入 " + device.name + " 上的本地路径。示例：" + example,
      ),
      "",
      example,
      tr("Add path", "添加路径"),
    ))?.trim();
    if (!next) return;
    const current = device[kind] || [];
    await saveDevicePolicy(device, {
      [kind]: Array.from(new Set([...current, next])),
    });
  }

  async function removePolicyPath(
    device: Device,
    kind: "workspace_roots" | "sensitive_paths" | "sensitive_allow_paths",
    value: string,
  ) {
    await saveDevicePolicy(device, {
      [kind]: (device[kind] || []).filter((item) => item !== value),
    });
  }

  async function browseDeviceDirectories(device: Device, path = "~") {
    setDirectoryPicker((current) => ({
      device,
      browser: current?.device.id === device.id ? current.browser : null,
      loading: true,
      error: "",
    }));
    try {
      const response = await fetch(
        "/api/devices/" +
          encodeURIComponent(device.id) +
          "/directories?path=" +
          encodeURIComponent(path),
      );
      const payload = await response.json().catch(() => ({})) as {
        browser?: DirectoryBrowser;
        error?: string;
      };
      if (!response.ok || !payload.browser) {
        setDirectoryPicker({
          device,
          browser: null,
          loading: false,
          error:
            payload.error ||
            tr("Directory browsing is unavailable on this device.", "这台设备暂时无法浏览目录。"),
        });
        return;
      }
      setDirectoryPicker({
        device,
        browser: payload.browser,
        loading: false,
        error: "",
      });
    } catch {
      setDirectoryPicker({
        device,
        browser: null,
        loading: false,
        error: tr("Could not reach this device.", "无法连接到这台设备。"),
      });
    }
  }

  async function addCurrentWorkspace() {
    if (!directoryPicker?.browser) return;
    const { device, browser } = directoryPicker;
    const current = device.workspace_roots || [];
    const saved = await saveDevicePolicy(device, {
      workspace_roots: Array.from(new Set([...current, browser.path])),
    });
    if (saved) setDirectoryPicker(null);
  }

  return { backgroundUpdatingId, setBackgroundUpdatingId, backgroundTargetEnabled, setBackgroundTargetEnabled, backgroundPhase, setBackgroundPhase, backgroundMutationInFlight, runtimeMutationInFlight, runtimeUpdatingId, setRuntimeUpdatingId, runtimeTargetPaused, setRuntimeTargetPaused, deviceTaskBusy, setDeviceTaskBusy, sensitivePolicyBusyId, setSensitivePolicyBusyId, directoryPicker, setDirectoryPicker, saveDeviceTools, updateDeviceBackground, updateDeviceRuntime, updateDeviceTools, applyDevicePreset, saveDeviceTaskPermission, saveDevicePolicy, updateSensitiveProtection, addPolicyPath, removePolicyPath, browseDeviceDirectories, addCurrentWorkspace };
}
