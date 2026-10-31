// The Go Agent caps foreground commands at 120 s. Give its timeout/exit reply
// time to cross the WebSocket before declaring the outcome unobserved.
const PROCESS_TIMEOUT_MAX_MS = 120_000;
export const PROCESS_TIMEOUT_GUIDANCE = "start_process timeout_ms must be an integer between 1 and 120000. For longer commands use background:true and process_status/process_output. No command was dispatched.";

export function processTimeoutError(tool: string, args: Record<string, unknown>): string | null {
  const value = args.timeout_ms;
  // The Agent ignores timeout_ms for background processes.
  return tool === "start_process" && args.background !== true && value !== undefined &&
    (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > PROCESS_TIMEOUT_MAX_MS)
    ? PROCESS_TIMEOUT_GUIDANCE : null;
}

export function deviceCallTimeoutMs(tool: string, args: Record<string, unknown>): number {
  if (tool === "start_process" && args.background !== true && !processTimeoutError(tool, args)) {
    return Math.max(45_000, Number(args.timeout_ms ?? 5000) + 5000);
  }
  return 45_000;
}
