import { canonicalErrorEnvelope } from "../../../../../packages/protocol/src/error-codes.js";
import { useRef, useState } from "react";
import { useI18n } from "../use-i18n.js";
import { type Device } from "../../types/app-types.js";
import type { DashboardDialogs } from "./use-dashboard-dialogs.js";

type Translate = ReturnType<typeof useI18n>["tr"];

// Per-device management: access, background mode, task policy, processes,
// execution logs and Local Undo.

import { useDeviceActivity } from "./use-device-activity.js";
import { useDeviceSettings } from "./use-device-settings.js";

// Per-device management: which card and panel is open, rename and forget,
// plus the settings and activity actions of each device.
export function useDeviceActions({
  devices,
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
  const settings = useDeviceSettings({
    devices,
    tr,
    refreshAll,
    showNotice,
    askConfirm,
    askPrompt,
  });
  const activity = useDeviceActivity({
    devices,
    tr,
    refreshAll,
    showNotice,
    askConfirm,
    askPrompt,
  });
  const [managedDeviceId, setManagedDeviceId] = useState<string | null>(null);
  const [devicePanel, setDevicePanel] = useState<"access" | "tasks" | "activity">("access");
  const recoveryInFlight = useRef(false);
  const [connectionRecoveryBusyId, setConnectionRecoveryBusyId] = useState<string | null>(null);
  const [connectionRecoveryMessages, setConnectionRecoveryMessages] = useState<
    Record<string, string>
  >({});

  async function recoverDeviceConnection(device: Device) {
    if (recoveryInFlight.current) return;
    recoveryInFlight.current = true;
    setConnectionRecoveryBusyId(device.id);
    setConnectionRecoveryMessages((value) => ({ ...value, [device.id]: "" }));
    try {
      const response = await fetch("/api/devices/" + encodeURIComponent(device.id) + "/reconnect", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      if (!response.ok) throw Error("connection check unavailable");
      const value = (await response.json().then(canonicalErrorEnvelope)) as { state?: string };
      const message =
        value.state === "connection_present"
          ? tr("hooks.dashboard.useDeviceActions.aConnectionSignalIsPresentCheck")
          : value.state === "reconnect_requested"
            ? tr("hooks.dashboard.useDeviceActions.expiredConnectionsClearedWakeTheComputer")
            : value.state === "device_unreachable"
              ? tr("hooks.dashboard.useDeviceActions.wakeThisComputerAndConfirmRemote")
              : null;
      if (!message) throw Error("invalid connection observation");
      setConnectionRecoveryMessages((current) => ({ ...current, [device.id]: message }));
      await refreshAll();
    } catch {
      setConnectionRecoveryMessages((value) => ({
        ...value,
        [device.id]: tr("hooks.dashboard.useDeviceActions.couldNotCheckTheConnectionWake"),
      }));
    } finally {
      recoveryInFlight.current = false;
      setConnectionRecoveryBusyId(null);
    }
  }

  async function revoke(deviceId: string) {
    const device = devices.find((item) => item.id === deviceId);
    const confirmed = await askConfirm(
      tr("hooks.dashboard.useDeviceActions.forgetThisDevice"),
      tr("hooks.dashboard.useDeviceActions.willBeRemovedFromYourRemote", {
        device: device?.name || tr("hooks.dashboard.useDeviceActions.thisDevice"),
      }),
      tr("hooks.dashboard.useDeviceActions.forgetDevice"),
      "danger",
    );
    if (!confirmed) return;

    const response = await fetch("/api/devices/" + encodeURIComponent(deviceId) + "/revoke", {
      method: "POST",
    });
    if (!response.ok) {
      const payload = (await response
        .json()
        .then(canonicalErrorEnvelope)
        .catch(() => ({}))) as { error?: string };
      await showNotice(
        tr("hooks.dashboard.useDeviceActions.deviceWasNotRemoved"),
        payload.error || tr("hooks.dashboard.useDeviceActions.remoteArcCouldNotRemoveThis"),
      );
      return;
    }

    if (managedDeviceId === deviceId) setManagedDeviceId(null);
    await refreshAll();
  }

  async function rename(device: Device) {
    const next = (
      await askPrompt(
        tr("hooks.dashboard.useDeviceActions.renameDevice"),
        tr("hooks.dashboard.useDeviceActions.chooseTheNameShownThroughoutYour"),
        device.name,
        tr("hooks.dashboard.useDeviceActions.deviceName"),
      )
    )?.trim();
    if (!next || next === device.name) return;
    await fetch("/api/devices/" + encodeURIComponent(device.id) + "/rename", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: next }),
    });
    await refreshAll();
  }

  return {
    ...settings,
    ...activity,
    managedDeviceId,
    setManagedDeviceId,
    devicePanel,
    setDevicePanel,
    revoke,
    rename,
    recoverDeviceConnection,
    connectionRecoveryBusyId,
    connectionRecoveryMessages,
  };
}

export type DeviceActions = ReturnType<typeof useDeviceActions>;
