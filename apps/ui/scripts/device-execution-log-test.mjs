import assert from "node:assert/strict";
import { appSource } from "./app-source.mjs";

const source = appSource;

assert.match(source, /Device execution log/);
assert.match(source, /execution-log\?limit=100/);
assert.match(source, /executionLogsByDevice/);
assert.match(source, /Refresh log/);
assert.match(source, /This device is offline\. Its execution log remains local/);
assert.match(source, /Update remotelink on this device to view its local execution log|executionLogErrors/);

console.log("PASS: Activity & details exposes the device-local execution log");
