import assert from "node:assert/strict";
import { BROWSER_RUNNER_TOOLS, browserRunnerEnabled, toggledDeviceTools } from "../src/features/dashboard/devices/device-tools.js";

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
