// browser_runner is one capability made of six tools. The Relay requires each
// to be listed explicitly (a device with no stored list never has it), so the
// Dashboard switches them together and never infers them from a legacy list.
export const BROWSER_RUNNER_TOOLS = [
  "browser_runner_start",
  "browser_runner_snapshot",
  "browser_runner_act",
  "browser_runner_status",
  "browser_runner_confirm",
  "browser_runner_close",
] as const;

export const isBrowserRunnerTool = (tool: string) =>
  tool === "browser_runner_wait" || (BROWSER_RUNNER_TOOLS as readonly string[]).includes(tool);

/** The allowed-tool list after switching one tool (or all of browser_runner). */
export function toggledDeviceTools(
  allowed: readonly string[] | null | undefined,
  baseline: readonly string[],
  tool: string,
  enabled: boolean,
): string[] {
  const current =
    allowed == null ? baseline.filter((item) => !isBrowserRunnerTool(item)) : [...allowed];
  const group: string[] = isBrowserRunnerTool(tool)
    ? [...BROWSER_RUNNER_TOOLS, "browser_runner_wait"]
    : [tool];
  return enabled
    ? Array.from(new Set([...current, ...group]))
    : current.filter((item) => !group.includes(item));
}

/** browser_runner is on only when every tool is listed explicitly, as the Relay requires. */
export const browserRunnerEnabled = (allowed: readonly string[] | null | undefined) =>
  BROWSER_RUNNER_TOOLS.every((tool) => (allowed || []).includes(tool));

// Tools that follow another switch, so they get none of their own (the Relay
// checks the switch they follow, see devices/device-call.ts): tab opening and
// actions follow Click & fill, one-time secrets follow start_process or Click
// & fill, goal checkpoints follow start_process, coding-agent sessions follow
// read_file, and task keep-awake is a Tasks setting.
export const INTERNAL_DEVICE_TOOLS: ReadonlySet<string> = new Set([
  "browser_open_tab",
  "browser_act",
  "secret_prepare",
  "secret_deliver",
  "goal_workspace",
  "list_agent_sessions",
  "set_task_keep_awake",
]);
