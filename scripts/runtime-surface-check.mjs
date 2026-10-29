import fs from "node:fs";

const relaySource = ["mcp.ts", "shared-tab-mcp.ts"]
  .map((file) => fs.readFileSync(new URL("../apps/relay/src/" + file, import.meta.url), "utf8"))
  .join("\n");
const submission = JSON.parse(fs.readFileSync(new URL("../chatgpt-app-submission.json", import.meta.url), "utf8"));
const plugin = JSON.parse(fs.readFileSync(new URL("../plugin.json", import.meta.url), "utf8"));

const registered = new Set(
  [...relaySource.matchAll(/(?:server\.registerTool\(|registerMcpTool\(server,)\s*[\r\n\t ]*["']([^"']+)["']/g)].map((match) => match[1]),
);

const expected = [
  "list_devices", "device_tools",
  "shared_tab_list", "shared_tab_read", "shared_tab_click", "shared_tab_fill",
  "list_directory", "read_file", "read_binary_file", "create_file_resource",
  "revoke_file_resource", "get_file_info", "list_processes", "start_process",
  "process_status", "process_output", "stop_process", "write_file", "edit_block",
  "undo_last_change", "create_automation", "list_automations",
  "get_automation", "manage_automation",
  "list_apps", "run_app_read_action", "run_app_write_action",
];

const missingRelay = expected.filter((name) => !registered.has(name));
const submissionTools = new Set(Object.keys(submission.tools ?? {}));
const missingSubmission = expected.filter((name) => !submissionTools.has(name));
const extraSubmission = [...submissionTools].filter((name) => !expected.includes(name));

if (missingRelay.length || missingSubmission.length || extraSubmission.length) {
  console.error("Remote Arc runtime surface drift detected.");
  if (missingRelay.length) console.error("Missing from Relay:", missingRelay.join(", "));
  if (missingSubmission.length) console.error("Missing from submission:", missingSubmission.join(", "));
  if (extraSubmission.length) console.error("Unexpected submission tools:", extraSubmission.join(", "));
  process.exit(1);
}

if (expected.length !== 27) {
  console.error(`Expected runtime surface count changed: ${expected.length}`);
  process.exit(1);
}

const description = [
  plugin.description,
  plugin.extensions?.["com.openai"]?.interface?.shortDescription,
  plugin.extensions?.["com.openai"]?.interface?.longDescription,
].filter(Boolean).join(" ");

if (!/(remote|computer)/i.test(description) || !/(access|control)/i.test(description)) {
  console.error("Plugin positioning must identify Remote Arc as controlled remote computer access.");
  process.exit(1);
}

console.log(`Remote Arc runtime surface OK: ${expected.length} public MCP tools.`);
