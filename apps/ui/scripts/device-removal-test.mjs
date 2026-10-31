import assert from "node:assert/strict";
import { appSource, readAppModule } from "./app-source.mjs";

const source = appSource;

assert.match(source, /tr\("Forget this device\?", "删除这台设备？"\)/);
assert.match(source, /Local files and software are not deleted/);
assert.match(source, /if \(!response\.ok\) \{/);
assert.match(source, /tr\("Device was not removed", "设备未删除"\)/);
assert.match(source, /className="deviceDangerZone"/);
// The settings tabs are the three panel components; the danger zone follows the
// last one in the device card, so it is not part of any tab.
assert.match(
  readAppModule("features/dashboard/devices/device-card.tsx"),
  /<DeviceActivityPanel [^>]*\/>\s*<div className="deviceDangerZone">/,
  "Forget device must stay visible outside the currently selected device settings tab.",
);
for (const panel of ["device-access-panel.tsx", "device-tasks-panel.tsx", "device-activity-panel.tsx"]) {
  assert.doesNotMatch(readAppModule("features/dashboard/devices/" + panel), /deviceDangerZone/, `${panel} must not hold Forget device`);
}
assert.match(source, /tr\("Forget device", "删除设备"\)/);

console.log("PASS: device removal is explicit, reversible by re-pairing, and surfaces failures");
