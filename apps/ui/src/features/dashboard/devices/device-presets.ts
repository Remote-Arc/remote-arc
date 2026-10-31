import { isBrowserRunnerTool } from "./device-tools.js";
import { type DeviceTaskPermissions } from "../../../types/app-types.js";

export const legacyTaskPermissions: DeviceTaskPermissions = { background_tasks: true, scheduled_tasks: true, adaptive_agent: true, source_agent: false, keep_awake: false };
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
  // browser_runner is switched separately and does not change the preset.
  tools = tools.filter((tool) => !isBrowserRunnerTool(tool));
  if (sameToolSet(tools, supported(SAFE_DEVICE_TOOLS))) return "safe";
  if (sameToolSet(tools, supported(DEVELOPER_DEVICE_TOOLS))) return "developer";
  if (sameToolSet(tools, supported(DEVICE_TOOL_CATALOG))) return "full";
  return "custom";
};
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
