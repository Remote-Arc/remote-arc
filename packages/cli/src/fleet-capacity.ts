import os from "node:os";

export type FleetCapacity = {
  observedAt: string;
  memoryTotalMB: number;
  memoryAvailableMB: number;
  cpuPercent?: number;
};

// Report only bounded system utilization, never process names, user paths or files.
// CPU percentages are sampled over consecutive publishes instead of instantaneous loadavg.
export function createFleetCapacitySampler(now: () => number = Date.now) {
  let prior: { idle: number; total: number } | null = null;
  return (): FleetCapacity | null => {
    const total = os.totalmem(), free = os.freemem();
    if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(free)) return null;
    const times = os.cpus().map((cpu) => cpu.times);
    const next = { idle: times.reduce((n, t) => n + t.idle, 0),
      total: times.reduce((n, t) => n + t.user + t.nice + t.sys + t.idle + t.irq, 0) };
    const elapsed = prior ? next.total - prior.total : 0;
    const busy = prior && elapsed > 0
      ? Math.max(0, Math.min(100, (1 - (next.idle - prior.idle) / elapsed) * 100))
      : undefined;
    prior = next;
    return {
      observedAt: new Date(now()).toISOString(),
      memoryTotalMB: Math.round(total / 1048576),
      memoryAvailableMB: Math.round(Math.max(0, Math.min(free, total)) / 1048576),
      ...(busy !== undefined ? { cpuPercent: Math.round(busy * 10) / 10 } : {}),
    };
  };
}
