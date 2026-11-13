export type DeviceExecutionHealth = {
  sample?: boolean;
  coverage: "observed" | "no_samples" | "unavailable";
  status: "operational" | "degraded" | "unknown";
  windowMinutes: 15;
  calls: number;
  successfulCalls: number;
  timeouts: number;
  offlineCalls: number;
  staleSignals: number;
  keepAwakeFailures?: number;
  affectedDevices: number;
  truncated: boolean;
  devices: {
    deviceId: string;
    name: string;
    platform: string;
    timeouts: number;
    offlineCalls: number;
    staleSignals: number;
    keepAwakeFailures?: number;
    lastFailureAt: string;
    lastSuccessfulCallAt: string | null;
  }[];
};
