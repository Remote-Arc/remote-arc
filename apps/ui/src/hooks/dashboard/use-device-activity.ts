import { canonicalErrorEnvelope } from "../../../../../packages/protocol/src/error-codes.js";
import { useState } from "react";
import { useI18n } from "../use-i18n.js";
import {
  type Device,
  type DeviceExecutionLog,
  type ManagedProcess,
  type UndoAction,
} from "../../types/app-types.js";
import type { DashboardDialogs } from "./use-dashboard-dialogs.js";

type Translate = ReturnType<typeof useI18n>["tr"];

// Device execution log, managed background processes and Local Undo.
export function useDeviceActivity({
  tr,
  refreshAll,
  showNotice,
  askConfirm,
}: {
  devices: Device[];
  tr: Translate;
  refreshAll: () => Promise<void>;
  showNotice: DashboardDialogs["showNotice"];
  askConfirm: DashboardDialogs["askConfirm"];
  askPrompt: DashboardDialogs["askPrompt"];
}) {
  const [undoByDevice, setUndoByDevice] = useState<Record<string, UndoAction[]>>({});
  const [undoLoading, setUndoLoading] = useState<string | null>(null);
  const [undoErrors, setUndoErrors] = useState<Record<string, string>>({});
  const [processesByDevice, setProcessesByDevice] = useState<Record<string, ManagedProcess[]>>({});
  const [processLoading, setProcessLoading] = useState<string | null>(null);
  const [processErrors, setProcessErrors] = useState<Record<string, string>>({});
  const [executionLogsByDevice, setExecutionLogsByDevice] = useState<
    Record<string, DeviceExecutionLog>
  >({});
  const [executionLogLoading, setExecutionLogLoading] = useState<string | null>(null);
  const [executionLogErrors, setExecutionLogErrors] = useState<Record<string, string>>({});

  async function loadDeviceExecutionLog(device: Device) {
    setExecutionLogLoading(device.id);
    setExecutionLogErrors((current) => ({ ...current, [device.id]: "" }));
    try {
      const response = await fetch(
        "/api/devices/" + encodeURIComponent(device.id) + "/execution-log?limit=100",
      );
      const payload = (await response
        .json()
        .then(canonicalErrorEnvelope)
        .catch(() => ({}))) as {
        log?: DeviceExecutionLog;
        error?: string;
      };
      if (!response.ok || !payload.log) {
        setExecutionLogErrors((current) => ({
          ...current,
          [device.id]:
            payload.error ||
            tr("hooks.dashboard.useDeviceActivity.localExecutionLogIsUnavailableOn"),
        }));
        return;
      }
      setExecutionLogsByDevice((current) => ({
        ...current,
        [device.id]: payload.log!,
      }));
    } catch {
      setExecutionLogErrors((current) => ({
        ...current,
        [device.id]: tr("hooks.dashboard.useDeviceActivity.couldNotReachThisDeviceTo"),
      }));
    } finally {
      setExecutionLogLoading((current) => (current === device.id ? null : current));
    }
  }

  async function loadManagedProcesses(device: Device) {
    setProcessLoading(device.id);
    setProcessErrors((current) => ({ ...current, [device.id]: "" }));
    try {
      const response = await fetch("/api/devices/" + encodeURIComponent(device.id) + "/processes");
      const payload = (await response
        .json()
        .then(canonicalErrorEnvelope)
        .catch(() => ({}))) as {
        processes?: ManagedProcess[];
        error?: string;
      };
      if (!response.ok) {
        setProcessErrors((current) => ({
          ...current,
          [device.id]:
            payload.error ||
            tr("hooks.dashboard.useDeviceActivity.managedProcessesAreUnavailableOnThis"),
        }));
        return;
      }
      setProcessesByDevice((current) => ({
        ...current,
        [device.id]: payload.processes || [],
      }));
    } finally {
      setProcessLoading((current) => (current === device.id ? null : current));
    }
  }

  async function showManagedProcessOutput(device: Device, item: ManagedProcess) {
    const response = await fetch(
      "/api/devices/" +
        encodeURIComponent(device.id) +
        "/processes/" +
        encodeURIComponent(item.process_id) +
        "/output",
    );
    const payload = (await response
      .json()
      .then(canonicalErrorEnvelope)
      .catch(() => ({}))) as {
      process?: ManagedProcess & { stdout?: string; stderr?: string };
      error?: string;
    };
    if (!response.ok || !payload.process) {
      await showNotice(
        tr("hooks.dashboard.useDeviceActivity.processOutputIsUnavailable"),
        payload.error || tr("hooks.dashboard.useDeviceActivity.remoteArcCouldNotReadThis"),
      );
      return;
    }
    const stdout = payload.process.stdout || "";
    const stderr = payload.process.stderr || "";
    const combined = [stdout ? "stdout\n" + stdout : "", stderr ? "stderr\n" + stderr : ""]
      .filter(Boolean)
      .join("\n\n");
    await showNotice(
      tr("hooks.dashboard.useDeviceActivity.backgroundProcessOutput"),
      combined.slice(-12000) || tr("hooks.dashboard.useDeviceActivity.noOutputCapturedYet"),
    );
  }

  async function stopBackgroundProcess(device: Device, item: ManagedProcess) {
    const confirmed = await askConfirm(
      tr("hooks.dashboard.useDeviceActivity.stopThisBackgroundProcess"),
      tr("hooks.dashboard.useDeviceActivity.remoteArcWillStopTheManaged", { name: device.name }),
      tr("hooks.dashboard.useDeviceActivity.stopProcess"),
      "danger",
    );
    if (!confirmed) return;
    const response = await fetch(
      "/api/devices/" +
        encodeURIComponent(device.id) +
        "/processes/" +
        encodeURIComponent(item.process_id) +
        "/stop",
      { method: "POST" },
    );
    const payload = (await response
      .json()
      .then(canonicalErrorEnvelope)
      .catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      await showNotice(
        tr("hooks.dashboard.useDeviceActivity.processWasNotStopped"),
        payload.error || tr("hooks.dashboard.useDeviceActivity.remoteArcCouldNotStopThis"),
      );
      return;
    }
    await loadManagedProcesses(device);
  }

  async function loadUndoHistory(device: Device) {
    setUndoLoading(device.id);
    setUndoErrors((current) => ({ ...current, [device.id]: "" }));
    try {
      const response = await fetch("/api/devices/" + encodeURIComponent(device.id) + "/undo");
      const payload = (await response
        .json()
        .then(canonicalErrorEnvelope)
        .catch(() => ({}))) as {
        actions?: UndoAction[];
        error?: string;
      };
      if (!response.ok) {
        setUndoErrors((current) => ({
          ...current,
          [device.id]:
            payload.error || tr("hooks.dashboard.useDeviceActivity.undoHistoryIsUnavailableOnThis"),
        }));
        return;
      }
      setUndoByDevice((current) => ({
        ...current,
        [device.id]: payload.actions || [],
      }));
    } finally {
      setUndoLoading((current) => (current === device.id ? null : current));
    }
  }

  async function restoreUndoAction(device: Device, action: UndoAction) {
    const confirmed = await askConfirm(
      tr("hooks.dashboard.useDeviceActivity.restoreThisLocalSnapshot"),
      tr("hooks.dashboard.useDeviceActivity.remoteArcWillRestoreToIts", { path: action.path }),
      tr("hooks.dashboard.useDeviceActivity.restoreFile"),
      "danger",
    );
    if (!confirmed) return;

    setUndoLoading(device.id);
    try {
      const response = await fetch(
        "/api/devices/" + encodeURIComponent(device.id) + "/undo/" + encodeURIComponent(action.id),
        { method: "POST" },
      );
      const payload = (await response
        .json()
        .then(canonicalErrorEnvelope)
        .catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        await showNotice(
          tr("hooks.dashboard.useDeviceActivity.localUndoWasNotApplied"),
          payload.error || tr("hooks.dashboard.useDeviceActivity.remoteArcCouldNotSafelyRestore"),
        );
        return;
      }
      await loadUndoHistory(device);
      await refreshAll();
    } finally {
      setUndoLoading((current) => (current === device.id ? null : current));
    }
  }

  return {
    undoByDevice,
    setUndoByDevice,
    undoLoading,
    setUndoLoading,
    undoErrors,
    setUndoErrors,
    processesByDevice,
    setProcessesByDevice,
    processLoading,
    setProcessLoading,
    processErrors,
    setProcessErrors,
    executionLogsByDevice,
    setExecutionLogsByDevice,
    executionLogLoading,
    setExecutionLogLoading,
    executionLogErrors,
    setExecutionLogErrors,
    loadDeviceExecutionLog,
    loadManagedProcesses,
    showManagedProcessOutput,
    stopBackgroundProcess,
    loadUndoHistory,
    restoreUndoAction,
  };
}
