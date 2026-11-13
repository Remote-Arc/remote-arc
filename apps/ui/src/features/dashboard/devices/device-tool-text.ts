import type { MessageKey } from "../../../locales/locale-catalog.js";

type ToolText = { label: MessageKey; help: MessageKey };

const panel = "dashboard.devices.deviceAccessPanel." as const;
const names = "dashboard.devices.deviceToolNames." as const;

// What people see for each device switch. MCP tool names stay out of the
// interface; a tool missing here still gets a readable fallback.
export const DEVICE_TOOL_TEXT: Readonly<Record<string, ToolText>> = {
  browser_runner: { label: `${names}browserRunner`, help: `${panel}letsYourAiOpenReadAnd` },
  list_directory: { label: `${names}listDirectory`, help: `${names}listDirectoryHelp` },
  browse_directories: {
    label: `${names}browseDirectories`,
    help: `${names}browseDirectoriesHelp`,
  },
  read_file: { label: `${names}readFile`, help: `${names}readFileHelp` },
  read_binary_file: {
    label: `${names}readBinaryFile`,
    help: `${panel}readBoundedBinaryByteRangesOn`,
  },
  get_file_info: { label: `${names}getFileInfo`, help: `${names}getFileInfoHelp` },
  list_processes: { label: `${names}listProcesses`, help: `${names}listProcessesHelp` },
  write_file: { label: `${names}writeFile`, help: `${names}writeFileHelp` },
  edit_block: { label: `${names}editBlock`, help: `${names}editBlockHelp` },
  list_undo_actions: { label: `${names}listUndoActions`, help: `${names}listUndoActionsHelp` },
  undo_change: { label: `${names}undoChange`, help: `${names}undoChangeHelp` },
  undo_last_change: {
    label: `${names}undoLastChange`,
    help: `${panel}aiPermissionLetsTheConnectedAi`,
  },
  start_process: { label: `${names}startProcess`, help: `${names}startProcessHelp` },
  process_status: {
    label: `${names}processStatus`,
    help: `${panel}inspectARemoteArcManagedBackground`,
  },
  process_output: {
    label: `${names}processOutput`,
    help: `${panel}inspectARemoteArcManagedBackground`,
  },
  list_managed_processes: {
    label: `${names}listManagedProcesses`,
    help: `${names}listManagedProcessesHelp`,
  },
  stop_process: { label: `${names}stopProcess`, help: `${panel}stopARemoteArcManagedBackground` },
  browser_list_tabs: { label: `${names}browserListTabs`, help: `${names}browserListTabsHelp` },
  browser_get_current_tab: {
    label: `${names}browserGetCurrentTab`,
    help: `${names}browserGetCurrentTabHelp`,
  },
  browser_read_page: { label: `${names}browserReadPage`, help: `${names}browserReadPageHelp` },
  browser_get_selected_text: {
    label: `${names}browserGetSelectedText`,
    help: `${names}browserGetSelectedTextHelp`,
  },
  browser_extract_links: {
    label: `${names}browserExtractLinks`,
    help: `${names}browserExtractLinksHelp`,
  },
  browser_extract_table: {
    label: `${names}browserExtractTable`,
    help: `${names}browserExtractTableHelp`,
  },
  browser_click: { label: `${names}browserClick`, help: `${names}browserClickHelp` },
  browser_fill: { label: `${names}browserFill`, help: `${names}browserFillHelp` },
};

type Tr = (key: MessageKey, values?: Readonly<Record<string, unknown>>) => string;

/** "some_new_tool" -> "Some new tool", for a tool this release has no text for. */
export function humanizeToolName(tool: string): string {
  const words = tool
    .split(/[_\s]+/)
    .filter(Boolean)
    .join(" ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** The display name and help text for one device switch. */
export function deviceToolText(tool: string, tr: Tr): { label: string; help: string } {
  const text = DEVICE_TOOL_TEXT[tool];
  if (!text) {
    return { label: humanizeToolName(tool), help: tr(`${panel}allowThisAiClientToUse`) };
  }
  return { label: tr(text.label), help: tr(text.help) };
}
