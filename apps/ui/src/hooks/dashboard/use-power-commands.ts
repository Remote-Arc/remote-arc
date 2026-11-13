import { canonicalErrorEnvelope } from "../../../../../packages/protocol/src/error-codes.js";
import { useState } from "react";
import { UI_PREVIEW } from "../../preview/preview-mode.js";
import type { Device } from "../../types/app-types.js";
import type { useI18n } from "../use-i18n.js";
import type { DashboardDialogs } from "./use-dashboard-dialogs.js";

type Translate = ReturnType<typeof useI18n>["tr"];

// Shutdown and restart for one computer: off by default. Turning it on asks the
// owner to confirm; turning it off never does. The Relay records the choice and
// the Agent lifts only its shutdown and restart rule.
export function usePowerCommands({
  tr,
  refreshAll,
  showNotice,
  askConfirm,
}: {
  tr: Translate;
  refreshAll: () => Promise<void>;
  showNotice: DashboardDialogs["showNotice"];
  askConfirm: DashboardDialogs["askConfirm"];
}) {
  const [powerCommandsBusyId, setPowerCommandsBusyId] = useState<string | null>(null);
  // The saved choice until the device list is refreshed, and the preview's only state.
  const [powerCommandsSaved, setPowerCommandsSaved] = useState<Record<string, boolean>>({});

  const powerCommandsAllowed = (device: Device) =>
    powerCommandsSaved[device.id] ?? device.allow_power_commands === true;

  async function setPowerCommands(device: Device, enabled: boolean) {
    if (powerCommandsBusyId || powerCommandsAllowed(device) === enabled) return;
    if (enabled && device.power_commands_available !== true) return;
    if (
      enabled &&
      !(await askConfirm(
        tr("dashboard.devices.powerCommands.confirmTitle", { name: device.name }),
        tr("dashboard.devices.powerCommands.confirmBody"),
        tr("dashboard.devices.powerCommands.confirmAction"),
        "danger",
      ))
    )
      return;
    setPowerCommandsBusyId(device.id);
    try {
      if (!UI_PREVIEW) {
        const response = await fetch(
          "/api/devices/" + encodeURIComponent(device.id) + "/power-commands",
          {
            method: "POST",
            credentials: "same-origin",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ enabled, acknowledge_power_risk: enabled }),
          },
        );
        if (!response.ok) {
          const reply = (await response
            .json()
            .then(canonicalErrorEnvelope)
            .catch(() => ({}))) as { message?: string };
          await showNotice(
            tr("dashboard.devices.powerCommands.notSaved"),
            reply.message || tr("dashboard.devices.powerCommands.notSavedBody"),
          );
          return;
        }
      }
      setPowerCommandsSaved((saved) => ({ ...saved, [device.id]: enabled }));
      if (!UI_PREVIEW) await refreshAll().catch(() => undefined);
    } catch {
      await showNotice(
        tr("dashboard.devices.powerCommands.notSaved"),
        tr("dashboard.devices.powerCommands.notSavedBody"),
      );
    } finally {
      setPowerCommandsBusyId(null);
    }
  }

  return { powerCommandsBusyId, powerCommandsAllowed, setPowerCommands };
}
