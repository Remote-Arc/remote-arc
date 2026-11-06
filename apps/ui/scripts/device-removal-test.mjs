import assert from "node:assert/strict";
import { appSource, readAppModule, readLocaleMessages } from "./app-source.mjs";

const source = appSource;

const en = readLocaleMessages("en", "dashboard");
const zh = readLocaleMessages("zh", "dashboard");
assert.equal(en["hooks.dashboard.useDeviceActions.forgetThisDevice"], "Forget this device?");
assert.equal(zh["hooks.dashboard.useDeviceActions.forgetThisDevice"], "删除这台设备？");
assert.match(
  en["hooks.dashboard.useDeviceActions.willBeRemovedFromYourRemote"],
  /Local files and software are not deleted/,
);
assert.match(source, /if \(!response\.ok\) \{/);
assert.equal(en["hooks.dashboard.useDeviceActions.deviceWasNotRemoved"], "Device was not removed");
assert.equal(zh["hooks.dashboard.useDeviceActions.deviceWasNotRemoved"], "设备未删除");
assert.match(source, /className="deviceDangerZone"/);
// The settings tabs are the three panel components; the danger zone follows the
// last one in the device card, so it is not part of any tab.
assert.match(
  readAppModule("features/dashboard/devices/device-card.tsx"),
  /<DeviceActivityPanel [^>]*\/>\s*<div className="deviceDangerZone">/,
  "Forget device must stay visible outside the currently selected device settings tab.",
);
for (const panel of [
  "device-access-panel.tsx",
  "device-tasks-panel.tsx",
  "device-activity-panel.tsx",
]) {
  assert.doesNotMatch(
    readAppModule("features/dashboard/devices/" + panel),
    /deviceDangerZone/,
    `${panel} must not hold Forget device`,
  );
}
assert.equal(en["dashboard.devices.deviceCard.forgetDevice"], "Forget device");
assert.equal(zh["dashboard.devices.deviceCard.forgetDevice"], "删除设备");

console.log("PASS: device removal is explicit, reversible by re-pairing, and surfaces failures");
