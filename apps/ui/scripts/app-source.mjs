import { readFileSync } from "node:fs";

// The application shell is split across these modules. Tests that assert on
// source text read them together, so moving code between them stays safe.
export const appModules = [
  "main.tsx",
  "app-types.ts",
  "app-config.ts",
  "device-presets.ts",
  "public-layout.tsx",
  "auth-pages.tsx",
  "pair-device.tsx",
  "client-install-page.tsx",
  "marketing-pages.tsx",
  "blog-pages.tsx",
  "releases-page.tsx",
  "dashboard.tsx",
  "dashboard/use-dashboard-model.ts",
  "dashboard/use-dashboard-dialogs.ts",
  "dashboard/use-dashboard-security.ts",
  "dashboard/use-device-actions.ts",
  "dashboard/use-device-settings.ts",
  "dashboard/use-device-activity.ts",
  "dashboard/format.ts",
  "dashboard/overview-view.tsx",
  "dashboard/devices-view.tsx",
  "dashboard/device-card.tsx",
  "dashboard/device-access-panel.tsx",
  "dashboard/device-tasks-panel.tsx",
  "dashboard/device-activity-panel.tsx",
  "dashboard/connect-view.tsx",
  "dashboard/security-view.tsx",
  "dashboard/monitor-view.tsx",
  "dashboard/monitor-reliability.tsx",
  "dashboard/settings-view.tsx",
  "dashboard/dashboard-overlays.tsx",
];

export const readAppModule = (name) => readFileSync(new URL("../src/" + name, import.meta.url), "utf8");
export const appSource = appModules.map(readAppModule).join("\n");
