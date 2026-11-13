import type { BusinessHealthMetrics } from "../../packages/protocol/src/service-metrics";

export function businessHealthFixture(days = 1): BusinessHealthMetrics {
  const flow = (
    id: BusinessHealthMetrics["flows"][number]["id"],
    keys: string[],
    counts: number[],
  ) => ({
    id,
    total: counts[0]!,
    completed: counts.at(-1)!,
    rate: counts.at(-1)! / counts[0]!,
    pending: 0,
    failed: counts[0]! - counts.at(-1)!,
    incompleteEvidence: 0,
    steps: keys.map((key, i) => ({ key, count: counts[i]! })),
  });
  return {
    checkedAt: "2026-11-05T12:00:00.000Z",
    from: "2026-11-05T00:00:00.000Z",
    days,
    registrations: 17,
    payments: 13,
    flows: [
      flow("login", ["started", "verification", "verified", "completed"], [20, 16, 14, 12]),
      flow("devices", ["started", "approved", "online"], [12, 10, 8]),
      flow("tasks", ["started", "succeeded"], [10, 8]),
      flow("payment", ["entered", "ordered", "paid", "fulfilled"], [20, 15, 13, 10]),
    ],
  };
}
