/** When a routine last failed in a way Arc could have repaired, had the account
 * an Arc plan or trial; null when not. Malformed state counts as none. */
export function taskRepairNeedsArc(task: { state_json: string | null }): string | null {
  if (!task.state_json) return null;
  try {
    const value = (JSON.parse(task.state_json) as { repair_needs_arc?: unknown }).repair_needs_arc;
    return typeof value === "string" ? value : null;
  } catch {
    return null;
  }
}
