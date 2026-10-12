/**
 * Return the next future slot on an interval schedule's original time grid.
 * Tasks can finish late or run after a reconnect; missed slots are skipped,
 * never replayed in a burst, and execution time does not shift later slots.
 */
export function nextIntervalRun(
  trigger: { type: "interval"; every_seconds: number; start_at?: string },
  createdAt: string,
  after: string,
): string {
  const intervalMs = trigger.every_seconds * 1000;
  // Legacy schedules without start_at originally began one interval after creation.
  const firstSlotMs = trigger.start_at
    ? Date.parse(trigger.start_at)
    : Date.parse(createdAt) + intervalMs;
  const nowMs = Date.parse(after);
  const elapsedSlots = Math.max(0, Math.floor((nowMs - firstSlotMs) / intervalMs) + 1);
  return new Date(firstSlotMs + elapsedSlots * intervalMs).toISOString();
}
