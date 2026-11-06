import { canonicalErrorEnvelope } from "../../../../../packages/protocol/src/error-codes.js";
import {
  isBrowserRunnerTool,
  toggledDeviceTools,
} from "../../features/dashboard/devices/device-tools.js";
import { useRef, useState } from "react";
import { useI18n } from "../use-i18n.js";
import { UI_PREVIEW } from "../../preview/preview-mode.js";
import {
  waitForAgentOffline,
  waitForRecoveryState,
} from "../../features/dashboard/devices/background-recovery.js";
import {
  type Device,
  type DeviceTaskPermissions,
  type DirectoryBrowser,
} from "../../types/app-types.js";
import {
  DEVELOPER_DEVICE_TOOLS,
  DEVICE_TOOL_CATALOG,
  type DeviceAccessPreset,
  SAFE_DEVICE_TOOLS,
  legacyTaskPermissions,
} from "../../features/dashboard/devices/device-presets.js";
import type { DashboardDialogs } from "./use-dashboard-dialogs.js";

type Translate = ReturnType<typeof useI18n>["tr"];

// Device access presets, tools, file policy, directory browser, background mode and runtime.
export function useDeviceSettings({
  tr,
  refreshAll,
  showNotice,
  askConfirm,
  askPrompt,
}: {
  devices: Device[];
  tr: Translate;
  refreshAll: () => Promise<void>;
  showNotice: DashboardDialogs["showNotice"];
  askConfirm: DashboardDialogs["askConfirm"];
  askPrompt: DashboardDialogs["askPrompt"];
}) {
  const [backgroundUpdatingId, setBackgroundUpdatingId] = useState<string | null>(null);
  const [backgroundTargetEnabled, setBackgroundTargetEnabled] = useState<boolean | null>(null);
  const [backgroundPhase, setBackgroundPhase] = useState<"applying" | "verifying" | "stopping">(
    "applying",
  );
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
    const available =
      device.status === "online"
        ? device.available_tools || device.tools
        : Array.from(
            new Set([...DEVICE_TOOL_CATALOG, ...(device.available_tools || device.tools)]),
          );
    const allowedTools = Array.from(new Set(next)).filter((tool) => available.includes(tool));
    const response = await fetch("/api/devices/" + encodeURIComponent(device.id) + "/tools", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ allowed_tools: allowedTools }),
    });
    if (!response.ok) {
      await showNotice(
        tr("hooks.dashboard.useDeviceSettings.skillAccessWasNotUpdated"),
        tr("hooks.dashboard.useDeviceSettings.remoteArcCouldNotSaveThis"),
      );
      return false;
    }
    await refreshAll();
    return true;
  }

  async function updateDeviceBackground(device: Device, enabled: boolean, stopCurrent = false) {
    if (UI_PREVIEW || backgroundMutationInFlight.current || runtimeMutationInFlight.current) return;
    if (device.status !== "online") {
      await showNotice(
        tr("hooks.dashboard.useDeviceSettings.computerIsOffline"),
        tr("hooks.dashboard.useDeviceSettings.backgroundModeCanOnlyBeChanged"),
      );
      return;
    }
    if (!device.background_agent_available) {
      await showNotice(
        tr("hooks.dashboard.useDeviceSettings.updateRemotelinkFirst"),
        tr("hooks.dashboard.useDeviceSettings.thisComputerIsRunningAnOlder"),
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
      const payload = (await response
        .json()
        .then(canonicalErrorEnvelope)
        .catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        await refreshAll();
        await showNotice(
          tr("hooks.dashboard.useDeviceSettings.backgroundSettingWasNotUpdated"),
          payload.error === "device offline"
            ? tr("hooks.dashboard.useDeviceSettings.thisComputerDisconnectedBeforeTheSetting")
            : payload.error || tr("hooks.dashboard.useDeviceSettings.remoteArcCouldNotUpdateThe"),
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
            return (await statusResponse.json().then(canonicalErrorEnvelope)) as Device[];
          },
          pause: (ms) => new Promise((resolve) => window.setTimeout(resolve, ms)),
        });
        await refreshAll();
        await showNotice(
          offline
            ? tr("hooks.dashboard.useDeviceSettings.agentStopped")
            : tr("hooks.dashboard.useDeviceSettings.stopStillUnconfirmed"),
          offline
            ? tr("hooks.dashboard.useDeviceSettings.theAgentIsOfflineAndAutomatic")
            : tr("hooks.dashboard.useDeviceSettings.theStopRequestWasAcceptedBut"),
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
          return (await response.json().then(canonicalErrorEnvelope)) as Device[];
        },
        pause: (ms) => new Promise((resolve) => window.setTimeout(resolve, ms)),
      });
      await refreshAll();
      if (!confirmed) {
        await showNotice(
          tr("hooks.dashboard.useDeviceSettings.stillAwaitingDeviceConfirmation"),
          tr("hooks.dashboard.useDeviceSettings.theCommandWasAcceptedButThe"),
        );
      }
    } catch {
      await refreshAll().catch(() => undefined);
      await showNotice(
        tr("hooks.dashboard.useDeviceSettings.backgroundSettingIsUnconfirmed"),
        tr("hooks.dashboard.useDeviceSettings.theResponseWasInterruptedRefreshThe"),
      );
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
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ paused }),
      });
      const payload = (await response
        .json()
        .then(canonicalErrorEnvelope)
        .catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        await refreshAll().catch(() => undefined);
        await showNotice(
          tr("hooks.dashboard.useDeviceSettings.runtimeChangeNotAccepted"),
          payload.error ||
            tr("hooks.dashboard.useDeviceSettings.theCurrentDeviceCannotChangeRuntime"),
        );
        return;
      }
      let confirmed = false;
      for (let attempt = 0; attempt < 18; attempt++) {
        await new Promise((resolve) => window.setTimeout(resolve, 1100));
        try {
          const result = await fetch("/api/devices", {
            cache: "no-store",
            signal: AbortSignal.timeout(4000),
          });
          if (!result.ok) continue;
          const list = (await result.json().then(canonicalErrorEnvelope)) as Device[];
          const current = list.find((item) => item.id === device.id);
          if (
            current?.status === "online" &&
            current.execution_paused === paused &&
            (paused ? current.tools.length === 0 : (current.available_tools?.length ?? 0) > 0)
          ) {
            confirmed = true;
            break;
          }
        } catch {
          /* Transport failure does not prove a state transition. */
        }
      }
      await refreshAll().catch(() => undefined);
      if (!confirmed) {
        await showNotice(
          tr("hooks.dashboard.useDeviceSettings.runtimeStateUnconfirmed"),
          tr("hooks.dashboard.useDeviceSettings.theHandoffMayStillBeTaking"),
        );
      }
    } catch {
      await refreshAll().catch(() => undefined);
      await showNotice(
        tr("hooks.dashboard.useDeviceSettings.runtimeStateUnconfirmed"),
        tr("hooks.dashboard.useDeviceSettings.theResponseWasInterruptedCheckWhether"),
      );
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
        tr("hooks.dashboard.useDeviceSettings.chooseATrustedWriteLocationFirst"),
        tr("hooks.dashboard.useDeviceSettings.remoteArcRequiresATrustedWrite"),
      );
      return;
    }
    if (enabled && tool === "start_process") {
      const confirmed = await askConfirm(
        tr("hooks.dashboard.useDeviceSettings.enableTerminalExecutionOn", { name: device.name }),
        tr("hooks.dashboard.useDeviceSettings.thisLetsConnectedAiClientsRun"),
        tr("hooks.dashboard.useDeviceSettings.enableTerminal"),
        "danger",
      );
      if (!confirmed) return;
    }
    if (enabled && isBrowserRunnerTool(tool)) {
      const confirmed = await askConfirm(
        tr("hooks.dashboard.useDeviceSettings.letAiActOnWebsitesFrom", { name: device.name }),
        tr("hooks.dashboard.useDeviceSettings.connectedAiClientsWillBeAble"),
        tr("hooks.dashboard.useDeviceSettings.enableBrowserRunner"),
        "danger",
      );
      if (!confirmed) return;
    }
    const advertised = device.available_tools || device.tools;
    const baseline =
      device.status === "online"
        ? advertised
        : Array.from(new Set([...DEVICE_TOOL_CATALOG, ...advertised]));
    await saveDeviceTools(
      device,
      toggledDeviceTools(device.allowed_tools, baseline, tool, enabled),
    );
  }

  async function applyDevicePreset(device: Device, preset: Exclude<DeviceAccessPreset, "custom">) {
    if (preset !== "safe" && !(device.workspace_roots || []).length) {
      await showNotice(
        tr("hooks.dashboard.useDeviceSettings.chooseATrustedWriteLocationFirst"),
        tr("hooks.dashboard.useDeviceSettings.developerAndFullAccessAreUnavailable"),
      );
      return;
    }
    if (preset === "full") {
      const confirmed = await askConfirm(
        tr("hooks.dashboard.useDeviceSettings.switchToFullAccess", { name: device.name }),
        tr("hooks.dashboard.useDeviceSettings.fullAccessEnablesTerminalExecutionAnd"),
        tr("hooks.dashboard.useDeviceSettings.enableFullAccess"),
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

  async function saveDeviceTaskPermission(
    device: Device,
    key: keyof DeviceTaskPermissions,
    enabled: boolean,
  ) {
    setDeviceTaskBusy(device.id);
    try {
      const response = await fetch(
        "/api/devices/" + encodeURIComponent(device.id) + "/task-permissions",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            ...(device.automation_permissions || legacyTaskPermissions),
            [key]: enabled,
          }),
        },
      );
      if (!response.ok) {
        const payload = (await response
          .json()
          .then(canonicalErrorEnvelope)
          .catch(() => ({}))) as { error?: string };
        await showNotice(
          tr("hooks.dashboard.useDeviceSettings.taskSettingsWereNotSaved"),
          payload.error || tr("hooks.dashboard.useDeviceSettings.pleaseTryAgain"),
        );
      } else await refreshAll();
    } catch {
      await showNotice(
        tr("hooks.dashboard.useDeviceSettings.taskSettingsWereNotSaved"),
        tr("hooks.dashboard.useDeviceSettings.connectionFailedPleaseTryAgain"),
      );
    } finally {
      setDeviceTaskBusy(null);
    }
  }

  async function saveDevicePolicy(
    device: Device,
    patch: Partial<
      Pick<
        Device,
        | "workspace_roots"
        | "sensitive_paths"
        | "sensitive_allow_paths"
        | "protect_sensitive_paths"
        | "undo_enabled"
      >
    >,
  ) {
    const next = {
      workspace_roots: patch.workspace_roots ?? device.workspace_roots ?? [],
      sensitive_paths: patch.sensitive_paths ?? device.sensitive_paths ?? [],
      sensitive_allow_paths: patch.sensitive_allow_paths ?? device.sensitive_allow_paths ?? [],
      protect_sensitive_paths:
        patch.protect_sensitive_paths ?? device.protect_sensitive_paths ?? true,
      undo_enabled: patch.undo_enabled ?? device.undo_enabled ?? true,
    };

    const response = await fetch("/api/devices/" + encodeURIComponent(device.id) + "/policy", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...next,
        // Preserve an explicitly disabled state across other policy edits.
        acknowledge_sensitive_path_risk: next.protect_sensitive_paths === false,
      }),
    });
    if (!response.ok) {
      const payload = (await response
        .json()
        .then(canonicalErrorEnvelope)
        .catch(() => ({}))) as { error?: string };
      await showNotice(
        tr("hooks.dashboard.useDeviceSettings.safetyPolicyWasNotUpdated"),
        payload.error || tr("hooks.dashboard.useDeviceSettings.remoteArcCouldNotSaveThis2"),
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
          tr("hooks.dashboard.useDeviceSettings.disableSensitivePathProtectionOn", {
            name: device.name,
          }),
          tr("hooks.dashboard.useDeviceSettings.thisDisablesBothBuiltInAnd"),
          tr("hooks.dashboard.useDeviceSettings.disableProtection"),
          "danger",
        );
        if (!confirmed) return;
      }
      await saveDevicePolicy(device, { protect_sensitive_paths: enabled });
    } catch {
      await refreshAll().catch(() => undefined);
      await showNotice(
        tr("hooks.dashboard.useDeviceSettings.sensitiveProtectionSettingUnconfirmed"),
        tr("hooks.dashboard.useDeviceSettings.theRequestWasInterruptedRefreshAnd"),
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
        ? tr("hooks.dashboard.useDeviceSettings.addAnAllowedWorkspacePath")
        : kind === "sensitive_paths"
          ? tr("hooks.dashboard.useDeviceSettings.addAProtectedSensitivePath")
          : tr("hooks.dashboard.useDeviceSettings.allowOneSensitivePathException");
    const example = device.platform === "win32" ? "E:\\Coding" : "~/work";
    const next = (
      await askPrompt(
        label,
        tr("hooks.dashboard.useDeviceSettings.enterALocalPathOnExample", {
          name: device.name,
          example,
        }),
        "",
        example,
        tr("hooks.dashboard.useDeviceSettings.addPath"),
      )
    )?.trim();
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
      const payload = (await response
        .json()
        .then(canonicalErrorEnvelope)
        .catch(() => ({}))) as {
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
            tr("hooks.dashboard.useDeviceSettings.directoryBrowsingIsUnavailableOnThis"),
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
        error: tr("hooks.dashboard.useDeviceSettings.couldNotReachThisDevice"),
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

  return {
    backgroundUpdatingId,
    setBackgroundUpdatingId,
    backgroundTargetEnabled,
    setBackgroundTargetEnabled,
    backgroundPhase,
    setBackgroundPhase,
    backgroundMutationInFlight,
    runtimeMutationInFlight,
    runtimeUpdatingId,
    setRuntimeUpdatingId,
    runtimeTargetPaused,
    setRuntimeTargetPaused,
    deviceTaskBusy,
    setDeviceTaskBusy,
    sensitivePolicyBusyId,
    setSensitivePolicyBusyId,
    directoryPicker,
    setDirectoryPicker,
    saveDeviceTools,
    updateDeviceBackground,
    updateDeviceRuntime,
    updateDeviceTools,
    applyDevicePreset,
    saveDeviceTaskPermission,
    saveDevicePolicy,
    updateSensitiveProtection,
    addPolicyPath,
    removePolicyPath,
    browseDeviceDirectories,
    addCurrentWorkspace,
  };
}
