import assert from "node:assert/strict";
import { readAppModule } from "./app-source.mjs";

// main.tsx stays an entry point: imports, routing and mounting. New pages and
// features belong in their own modules, not back in this file.
const entry = readAppModule("main.tsx");
const lines = entry.split(/\r?\n/).length;
assert.ok(lines <= 300, `main.tsx has ${lines} lines; move new code into its own module`);
assert.ok(!/^(export )?function Dashboard\b/m.test(entry), "Dashboard lives in dashboard.tsx");
assert.match(entry, /installUiPreviewFetchMock\(MCP_ENDPOINT\);/, "The preview mock must install before the app renders");
assert.ok(
  entry.indexOf("installUiPreviewFetchMock(MCP_ENDPOINT);") < entry.indexOf("createRoot("),
  "The preview mock must install before the app renders",
);

// Stylesheet order defines the cascade. New shell modules are imported after
// every existing stylesheet and must not bring their own.
for (const name of ["app-types.ts", "app-config.ts", "device-presets.ts", "public-layout.tsx", "auth-pages.tsx", "pair-device.tsx", "client-install-page.tsx", "marketing-pages.tsx", "blog-pages.tsx", "releases-page.tsx", "dashboard.tsx"]) {
  assert.ok(!/^import ["'][^"']+\.css["'];?$/m.test(readAppModule(name)), `${name} must not import a stylesheet directly`);
}
console.log(`PASS: main.tsx is a ${lines}-line entry point and shell modules leave the stylesheet order to it`);
