import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readAppModule } from "./app-source.mjs";

const component = readAppModule("features/dashboard/devices/device-card.tsx");
const style = readFileSync(new URL("../src/features/dashboard/dashboard.css", import.meta.url), "utf8");

// The browser card shows one inline control after the version, never the old
// status badge plus a large always-visible update panel.
assert.match(component, /deviceRuntimeVersion[^\n]*extensionUpdate && <button/);
assert.match(component, /className="deviceExtensionUpdateToggle"/);
assert.match(component, /tr\("Update available", "有可用更新"\)/);
assert.doesNotMatch(component, /tr\("Update needed", "需要更新"\)/);

// The card maintains disclosure state locally and links an accessible button
// to a panel that starts hidden, without removing the update instructions.
assert.match(component, /useState\(false\)/);
assert.match(component, /aria-expanded=\{extensionUpdateOpen\}/);
assert.match(component, /aria-controls=\{extensionUpdateId\}/);
assert.match(component, /setExtensionUpdateOpen\(open => !open\)/);
assert.match(component, /id=\{extensionUpdateId\} role="note" hidden=\{!extensionUpdateOpen\}/);
assert.match(component, /Unzip it into the folder you loaded before/);
assert.match(component, /Share your tabs again: reloading ends the current sharing/);
assert.match(style, /\.deviceExtensionUpdate\[hidden\] \{ display:none; \}/);
assert.match(style, /\.deviceExtensionUpdateToggle\[aria-expanded="true"\]/);

console.log("PASS: browser extension update is inline and collapsed by default with an accessible toggle");
