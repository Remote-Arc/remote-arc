import assert from "node:assert/strict";
import { BROWSER_RUNNER_TOOLS, INTERNAL_DEVICE_TOOLS, browserRunnerEnabled, toggledDeviceTools } from "../src/features/dashboard/devices/device-tools.js";

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
assert.deepEqual(toggledDeviceTools(on, advertised, "read_file", false), [...BROWSER_RUNNER_TOOLS, "browser_runner_wait"]);
console.log("PASS: Browser Runner device switch");

// A paired browser extension older than the one on the download page shows
// that an update is needed, like an outdated computer Agent.
{
  const { LATEST_BROWSER_EXTENSION_VERSION, browserExtensionUpdate } = await import("../src/features/dashboard/devices/browser-extension-update.js");
  const manifest = (await import("../../browser-extension/manifest.json", { with: { type: "json" } })).default as { version: string };
  assert.equal(LATEST_BROWSER_EXTENSION_VERSION, manifest.version, "the latest version is the one the download page serves");
  assert.deepEqual(browserExtensionUpdate({ platform: "browser", agent_version: "browser-0.3.0" }), { current: "0.3.0", latest: manifest.version });
  assert.equal(browserExtensionUpdate({ platform: "browser", agent_version: "browser-" + manifest.version }), null);
  assert.equal(browserExtensionUpdate({ platform: "browser", agent_version: "browser-99.0.0" }), null, "a newer local build is not told to downgrade");
  assert.equal(browserExtensionUpdate({ platform: "browser", agent_version: null }), null, "an unknown version is not guessed");
  assert.equal(browserExtensionUpdate({ platform: "darwin", agent_version: "0.3.0" }), null, "computers keep their own update notice");
}

// Internal tools follow another switch and never get a switch of their own.
for (const tool of ["secret_prepare", "secret_deliver", "browser_open_tab", "browser_act"]) assert.ok(INTERNAL_DEVICE_TOOLS.has(tool), tool);
assert.equal(INTERNAL_DEVICE_TOOLS.has("start_process"), false);
