import assert from "node:assert/strict";
import { appSource, readLocaleMessages } from "./app-source.mjs";

const source = appSource;

const messages = readLocaleMessages("en", "dashboard");
assert.equal(
  messages["dashboard.devices.deviceActivityPanel.deviceExecutionLog"],
  "Device execution log",
);
assert.match(source, /execution-log\?limit=100/);
assert.match(source, /executionLogsByDevice/);
assert.equal(messages["dashboard.devices.deviceActivityPanel.refreshLog"], "Refresh log");
assert.match(
  messages["dashboard.devices.deviceActivityPanel.thisDeviceIsOfflineItsExecution"],
  /This device is offline\. Its execution log remains local/,
);
assert.match(
  source,
  /Update remotelink on this device to view its local execution log|executionLogErrors/,
);

console.log("PASS: Activity & details exposes the device-local execution log");
