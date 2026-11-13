import assert from "node:assert/strict";
import {
  BROWSER_RUNNER_TOOLS,
  INTERNAL_DEVICE_TOOLS,
  browserRunnerEnabled,
  toggledDeviceTools,
} from "../src/features/dashboard/devices/device-tools.js";

const advertised = ["read_file", "write_file", ...BROWSER_RUNNER_TOOLS];

// A legacy device (no stored list) never gets Browser Runner implicitly:
// switching an unrelated tool must not silently enable it.
const legacy = toggledDeviceTools(null, advertised, "write_file", false);
assert.deepEqual(legacy, ["read_file"]);
assert.equal(browserRunnerEnabled(null), false, "legacy list is not an explicit opt-in");
assert.equal(browserRunnerEnabled(advertised.slice(0, 4)), false);

// One switch turns all tools on or off together.
const on = toggledDeviceTools(["read_file"], advertised, "browser_runner_act", true);
assert.deepEqual(on, ["read_file", ...BROWSER_RUNNER_TOOLS, "browser_runner_wait"]);
assert.equal(browserRunnerEnabled(on), true);
const off = toggledDeviceTools(on, advertised, "browser_runner_status", false);
assert.deepEqual(off, ["read_file"]);

// Other tools still switch one by one.
assert.deepEqual(toggledDeviceTools(on, advertised, "read_file", false), [
  ...BROWSER_RUNNER_TOOLS,
  "browser_runner_wait",
]);
console.log("PASS: Browser Runner device switch");

// A paired browser extension older than the one on the download page shows
// that an update is needed, like an outdated computer Agent.
{
  const { LATEST_BROWSER_EXTENSION_VERSION, browserExtensionUpdate } =
    await import("../src/features/dashboard/devices/browser-extension-update.js");
  const manifest = (
    await import("../../browser-extension/manifest.json", { with: { type: "json" } })
  ).default as { version: string };
  assert.equal(
    LATEST_BROWSER_EXTENSION_VERSION,
    manifest.version,
    "the latest version is the one the download page serves",
  );
  assert.deepEqual(
    browserExtensionUpdate({ platform: "browser", agent_version: "browser-0.3.0" }),
    { current: "0.3.0", latest: manifest.version },
  );
  assert.equal(
    browserExtensionUpdate({ platform: "browser", agent_version: "browser-" + manifest.version }),
    null,
  );
  assert.equal(
    browserExtensionUpdate({ platform: "browser", agent_version: "browser-99.0.0" }),
    null,
    "a newer local build is not told to downgrade",
  );
  assert.equal(
    browserExtensionUpdate({ platform: "browser", agent_version: null }),
    null,
    "an unknown version is not guessed",
  );
  assert.equal(
    browserExtensionUpdate({ platform: "darwin", agent_version: "0.3.0" }),
    null,
    "computers keep their own update notice",
  );
}

// Internal tools follow another switch and never get a switch of their own.
for (const tool of ["secret_prepare", "secret_deliver", "browser_open_tab", "browser_act"])
  assert.ok(INTERNAL_DEVICE_TOOLS.has(tool), tool);
assert.equal(INTERNAL_DEVICE_TOOLS.has("start_process"), false);
for (const tool of ["goal_workspace", "list_agent_sessions", "set_task_keep_awake"])
  assert.ok(INTERNAL_DEVICE_TOOLS.has(tool), tool + " follows another switch");
console.log("PASS: tools that follow another switch get no switch of their own");

// Every switch shows a readable name and help text in both languages, never
// an MCP tool name such as read_file.
{
  const { DEVICE_TOOL_TEXT, deviceToolText, humanizeToolName } =
    await import("../src/features/dashboard/devices/device-tool-text.js");
  const { DEVICE_TOOL_CATALOG } =
    await import("../src/features/dashboard/devices/device-presets.js");
  const coreTools = (
    await import("../../../packages/execution-core/execution/tools.json", {
      with: { type: "json" },
    })
  ).default as { name: string }[];
  const packs = {
    en: (await import("../src/locales/en/dashboard.json", { with: { type: "json" } })).default
      .messages as Record<string, string>,
    zh: (await import("../src/locales/zh/dashboard.json", { with: { type: "json" } })).default
      .messages as Record<string, string>,
  };
  const extensionTools = [
    "browser_list_tabs",
    "browser_get_current_tab",
    "browser_read_page",
    "browser_get_selected_text",
    "browser_extract_links",
    "browser_extract_table",
    "browser_click",
    "browser_fill",
  ];
  const switches = new Set(
    [
      "browser_runner",
      ...DEVICE_TOOL_CATALOG,
      ...coreTools.map((tool) => tool.name),
      ...extensionTools,
    ].filter((tool) => !INTERNAL_DEVICE_TOOLS.has(tool)),
  );
  for (const [locale, messages] of Object.entries(packs)) {
    const tr = (key: string) => {
      assert.ok(key in messages, locale + " is missing " + key);
      return messages[key];
    };
    for (const tool of switches) {
      assert.ok(DEVICE_TOOL_TEXT[tool], tool + " has display text");
      const { label, help } = deviceToolText(tool, tr);
      assert.doesNotMatch(label, /_/, locale + " " + tool + " shows a readable name: " + label);
      assert.notEqual(label, tool);
      assert.ok(help.length > 0, locale + " " + tool + " has help text");
    }
  }
  const fallback = deviceToolText("some_new_tool", (key) => packs.en[key]);
  assert.equal(fallback.label, "Some new tool", "an unknown tool still reads as words");
  assert.equal(
    fallback.help,
    packs.en["dashboard.devices.deviceAccessPanel.allowThisAiClientToUse"],
  );
  assert.equal(humanizeToolName("read_file"), "Read file");
  assert.equal(deviceToolText("read_file", (key) => packs.zh[key]).label, "读取文件");
}
console.log("PASS: device switches show readable names and help in English and Chinese");
