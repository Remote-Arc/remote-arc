import { createTranslator, loadLocale } from "../src/locales/locale-catalog.js";
import React from "react";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { MonitorReliability } from "../src/features/admin/monitor-reliability.js";
import type { DeviceReliabilityHealth } from "../src/features/admin/service-health-model.js";
await loadLocale("en", "admin");
const en = createTranslator("en");
await loadLocale("zh", "admin");
const zh = createTranslator("zh");
const render = (state: DeviceReliabilityHealth | undefined, tr = en) =>
  renderToStaticMarkup(<MonitorReliability state={state} tr={tr} />);
assert.match(render(undefined), /does not establish healthy/);
const empty: DeviceReliabilityHealth = {
  coverage: "no_samples",
  scope: "none",
  windows: [],
  groups: [],
  groupsTruncated: false,
  trend: [],
  signal: null,
};
assert.match(render(empty), /cannot be reconstructed/);
assert.doesNotMatch(render(empty), /Below threshold/);
const observed = {
  ...empty,
  coverage: "observed" as const,
  scope: "single_device" as const,
  windows: [
    {
      minutes: 15,
      counts: {
        connections: 4,
        disconnects: 3,
        heartbeats: 1,
        observedDevices: 1,
        reconnects: 3,
        reconnectingDevices: 1,
      },
    },
  ],
  groups: [
    { platform: "win32", agentVersion: "0.6.5", connections: 4, reconnects: 3, observedDevices: 1 },
  ],
};
assert.match(render(observed), /Awaiting scheduled evaluation/);
assert.match(render(observed), /isolated to one device/);
const firing = {
  ...observed,
  scope: "multiple_devices" as const,
  signal: {
    phase: "firing" as const,
    last_evaluated_at: "2026-10-31T00:00:00.000Z",
    last_notification_at: null,
  },
};
assert.match(render(firing), /does not prove a platform outage/);
assert.match(render(firing), /Sustained reconnect anomaly/);
assert.match(render(firing, zh), /持续重连异常/);
assert.match(render(firing, zh), /仅凭该指标不能确认平台故障/);
assert.match(render({ ...observed, groupsTruncated: true }), /totals include every group/);
console.log(
  "PASS: monitor distinguishes missing observations, unevaluated state, single-device churn and multi-device anomaly in both languages",
);
