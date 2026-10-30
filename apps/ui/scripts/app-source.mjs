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
];

export const readAppModule = (name) => readFileSync(new URL("../src/" + name, import.meta.url), "utf8");
export const appSource = appModules.map(readAppModule).join("\n");
