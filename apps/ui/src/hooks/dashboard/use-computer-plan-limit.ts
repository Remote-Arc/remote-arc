import { canonicalErrorEnvelope } from "../../../../../packages/protocol/src/error-codes.js";
import { useMemo, useState } from "react";
import type { Device } from "../../types/app-types.js";

/**
 * Computers beyond the plan's computer limit are paused by the Relay. This
 * hook lets the person choose which computers stay active: the chosen ones
 * go first in the order the Relay keeps, the others follow in their order.
 */
export function useComputerPlanLimit({
  devices,
  refreshAll,
}: {
  devices: Device[];
  refreshAll: () => Promise<void>;
}) {
  const computers = useMemo(
    () =>
      devices
        .filter((device) => device.platform !== "browser" && device.plan_position != null)
        .sort((a, b) => (a.plan_position ?? 0) - (b.plan_position ?? 0)),
    [devices],
  );
  const paused = computers.filter((device) => device.plan_paused);
  const limit = computers.find((device) => device.computer_limit != null)?.computer_limit ?? null;
  const [choosing, setChoosing] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState<"changed" | "unavailable" | null>(null);

  function startChoosing() {
    setSelected(computers.filter((device) => !device.plan_paused).map((device) => device.id));
    setFailed(null);
    setChoosing(true);
  }

  function toggle(deviceId: string) {
    setSelected((current) =>
      current.includes(deviceId)
        ? current.filter((id) => id !== deviceId)
        : limit !== null && current.length >= limit
          ? current
          : [...current, deviceId],
    );
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    setFailed(null);
    const order = [
      ...computers.filter((device) => selected.includes(device.id)),
      ...computers.filter((device) => !selected.includes(device.id)),
    ].map((device) => device.id);
    try {
      const response = await fetch("/api/devices/order", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ device_ids: order }),
      });
      if (!response.ok) {
        const body = (await response
          .json()
          .then(canonicalErrorEnvelope)
          .catch(() => ({}))) as { error?: string };
        setFailed(body.error === "DEVICE_ORDER_CHANGED" ? "changed" : "unavailable");
        if (body.error === "DEVICE_ORDER_CHANGED") await refreshAll();
        return;
      }
      setChoosing(false);
      await refreshAll();
    } catch {
      setFailed("unavailable");
    } finally {
      setSaving(false);
    }
  }

  return {
    computers,
    paused,
    limit,
    choosing,
    selected,
    saving,
    failed,
    startChoosing,
    cancelChoosing: () => setChoosing(false),
    toggle,
    save,
  };
}
