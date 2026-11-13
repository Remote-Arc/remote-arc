import { readFileSync } from "node:fs";

// The application shell is split across these modules. Tests that assert on
// source text read them together, so moving code between them stays safe.
export const appModules = [
  "main.tsx",
  "app/app.tsx",
  "hooks/use-app-session.ts",
  "types/app-types.ts",
  "config/app-config.ts",
  "features/dashboard/devices/device-presets.ts",
  "components/public-layout.tsx",
  "features/auth/auth-pages.tsx",
  "features/auth/pair-device.tsx",
  "features/install/client-install-page.tsx",
  "features/marketing/marketing-pages.tsx",
  "features/blog/blog-pages.tsx",
  "features/marketing/releases-page.tsx",
  "features/dashboard/dashboard.tsx",
  "hooks/dashboard/use-dashboard-model.ts",
  "hooks/dashboard/use-dashboard-dialogs.ts",
  "hooks/dashboard/use-dashboard-security.ts",
  "hooks/dashboard/use-device-actions.ts",
  "hooks/dashboard/use-device-settings.ts",
  "hooks/dashboard/use-device-activity.ts",
  "features/dashboard/format.ts",
  "features/dashboard/views/overview-view.tsx",
  "features/dashboard/views/devices-view.tsx",
  "features/dashboard/devices/device-card.tsx",
  "features/dashboard/devices/device-access-panel.tsx",
  "features/dashboard/devices/device-tasks-panel.tsx",
  "features/dashboard/devices/device-activity-panel.tsx",
  "features/dashboard/views/connect-view.tsx",
  "features/dashboard/views/security-view.tsx",
  "features/dashboard/views/settings-view.tsx",
  "features/dashboard/views/dashboard-overlays.tsx",
  "features/dashboard/views/add-device-dialog.tsx",
  "features/dashboard/views/first-run-card.tsx",
];

export const readAppModule = (name) =>
  readFileSync(new URL("../src/" + name, import.meta.url), "utf8");
export const appSource = appModules.map(readAppModule).join("\n");

export const readLocaleMessages = (locale, pack) =>
  JSON.parse(readAppModule("locales/" + locale + "/" + pack + ".json")).messages;
