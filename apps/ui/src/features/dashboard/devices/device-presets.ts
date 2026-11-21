import { DESKTOP_TOOLS, isBrowserRunnerTool, isDesktopTool } from "./device-tools.js";
import { type DeviceTaskPermissions } from "../../../types/app-types.js";

export const legacyTaskPermissions: DeviceTaskPermissions = {
  background_tasks: true,
  scheduled_tasks: true,
  adaptive_agent: true,
  source_agent: false,
  keep_awake: false,
};
export const DEVICE_TOOL_CATALOG = [
  "read_file",
  "read_binary_file",
  "write_file",
  "list_directory",
  "get_file_info",
  "edit_block",
  "undo_last_change",
  "start_process",
  "process_status",
  "process_output",
  "stop_process",
  "list_processes",
] as const;
export const SAFE_DEVICE_TOOLS = [
  "list_directory",
  "read_file",
  "read_binary_file",
  "get_file_info",
  "list_processes",
] as const;
export const DEVELOPER_DEVICE_TOOLS = [
  ...SAFE_DEVICE_TOOLS,
  "write_file",
  "edit_block",
  "undo_last_change",
] as const;
export type DeviceAccessPreset = "safe" | "developer" | "full" | "custom";
const sameToolSet = (left: readonly string[], right: readonly string[]) =>
  left.length === right.length && left.every((tool) => right.includes(tool));
export const deviceAccessPreset = (
  tools: readonly string[],
  availableTools: readonly string[],
): DeviceAccessPreset => {
  const supported = (preset: readonly string[]) =>
    preset.filter((tool) => availableTools.includes(tool));
  // browser_runner and desktop control have their own switches and do not
  // change which preset a device shows.
  tools = tools.filter((tool) => !isBrowserRunnerTool(tool) && !isDesktopTool(tool));
  if (sameToolSet(tools, supported(SAFE_DEVICE_TOOLS))) return "safe";
  if (sameToolSet(tools, supported(DEVELOPER_DEVICE_TOOLS))) return "developer";
  if (sameToolSet(tools, supported(DEVICE_TOOL_CATALOG))) return "full";
  return "custom";
};
/**
 * The allowed-tool list a preset saves. The separate browser_runner switch is
 * kept as it is; Developer and Full include desktop control where the
 * computer offers it, and Safe never does.
 */
export function presetDeviceTools(
  preset: Exclude<DeviceAccessPreset, "custom">,
  allowed: readonly string[] | null | undefined,
  advertised: readonly string[],
): string[] {
  const base =
    preset === "safe"
      ? SAFE_DEVICE_TOOLS
      : preset === "developer"
        ? DEVELOPER_DEVICE_TOOLS
        : DEVICE_TOOL_CATALOG;
  const keepRunner = (allowed || []).filter(isBrowserRunnerTool);
  const offersDesktop = DESKTOP_TOOLS.every((tool) => advertised.includes(tool));
  return [...base, ...keepRunner, ...(preset !== "safe" && offersDesktop ? DESKTOP_TOOLS : [])];
}
export const platformLabel = (platform?: string | null) => {
  if (platform === "win32") return "Windows";
  if (platform === "darwin") return "macOS";
  if (platform === "linux") return "Linux";
  return platform || "Unknown";
};
export const platformGlyph = (platform?: string | null) => {
  if (platform === "darwin") return "⌘";
  if (platform === "win32") return "⊞";
  return "›_";
};
