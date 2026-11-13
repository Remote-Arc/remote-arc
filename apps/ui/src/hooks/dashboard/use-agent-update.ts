import { canonicalErrorEnvelope } from "../../../../../packages/protocol/src/error-codes.js";
import { useRef, useState } from "react";
import { UI_PREVIEW } from "../../preview/preview-mode.js";
import { type Device } from "../../types/app-types.js";

type UpdateReply = {
  ok?: boolean;
  up_to_date?: boolean;
  version?: string;
  error?: string;
  message?: string;
};

/**
 * Where one device's remote update is. The Relay replies only after the Agent
 * has downloaded and verified the release, so "verifying" covers the request
 * and "restarting" the wait for the Agent to reconnect on the new version.
 */
export type AgentUpdateState = {
  deviceId: string;
  phase: "verifying" | "restarting" | "done" | "failed" | "unconfirmed";
  version?: string;
  /** The Agent's or Relay's own explanation when it refused. */
  message?: string;
};

/** How long the Dashboard waits for the Agent to reconnect as the new release. */
const CONFIRM_ATTEMPTS = 30;
const CONFIRM_INTERVAL_MS = 2000;

// Remote Agent update: ask one computer to install the latest release, then
// watch for it to reconnect on that version. Progress is shown in the device
// card, not in dialogs.
export function useAgentUpdate({ refreshAll }: { refreshAll: () => Promise<void> }) {
  const inFlight = useRef(false);
  const [agentUpdate, setAgentUpdate] = useState<AgentUpdateState | null>(null);

  async function waitForVersion(deviceId: string, version: string) {
    for (let attempt = 0; attempt < CONFIRM_ATTEMPTS; attempt++) {
      await new Promise((resolve) => window.setTimeout(resolve, CONFIRM_INTERVAL_MS));
      try {
        const response = await fetch("/api/devices", {
          cache: "no-store",
          signal: AbortSignal.timeout(4000),
        });
        if (!response.ok) continue;
        const list = (await response.json().then(canonicalErrorEnvelope)) as Device[];
        const current = list.find((item) => item.id === deviceId);
        if (current?.status === "online" && current.agent_version === version) return true;
      } catch {
        /* keep waiting: the Agent is restarting */
      }
    }
    return false;
  }

  async function updateAgent(device: Device) {
    if (inFlight.current) return;
    if (device.status !== "online" || device.agent_update_available !== true) return;
    inFlight.current = true;
    setAgentUpdate({ deviceId: device.id, phase: "verifying" });
    if (UI_PREVIEW) {
      // The preview has no Agent: play the stages so the card can be reviewed.
      const pause = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));
      await pause(1200);
      setAgentUpdate({ deviceId: device.id, phase: "restarting" });
      await pause(1200);
      setAgentUpdate({ deviceId: device.id, phase: "done" });
      inFlight.current = false;
      return;
    }
    try {
      const response = await fetch(
        "/api/devices/" + encodeURIComponent(device.id) + "/agent-update",
        {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: "{}",
        },
      );
      const reply = (await response
        .json()
        .then(canonicalErrorEnvelope)
        .catch(() => ({}))) as UpdateReply;
      if (!response.ok) {
        setAgentUpdate({ deviceId: device.id, phase: "failed", message: reply.message });
        return;
      }
      const version = reply.version || device.agent_version || "";
      if (reply.up_to_date) {
        setAgentUpdate({ deviceId: device.id, phase: "done", version });
        await refreshAll().catch(() => undefined);
        return;
      }
      setAgentUpdate({ deviceId: device.id, phase: "restarting", version });
      const confirmed = await waitForVersion(device.id, version);
      setAgentUpdate({ deviceId: device.id, phase: confirmed ? "done" : "unconfirmed", version });
      await refreshAll().catch(() => undefined);
    } catch {
      setAgentUpdate({ deviceId: device.id, phase: "unconfirmed" });
    } finally {
      inFlight.current = false;
    }
  }

  const agentUpdatingId =
    agentUpdate && (agentUpdate.phase === "verifying" || agentUpdate.phase === "restarting")
      ? agentUpdate.deviceId
      : null;

  return {
    agentUpdate,
    agentUpdatingId,
    updateAgent,
    dismissAgentUpdate: () => setAgentUpdate(null),
  };
}
