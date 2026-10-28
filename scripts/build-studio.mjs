import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = fileURLToPath(new URL("../", import.meta.url));
const result = spawnSync(
  process.execPath,
  [
    path.join(root, "apps/studio/node_modules/vite/bin/vite.js"),
    "build",
    "--base",
    "/studio/",
    "--outDir",
    path.join(root, "apps/ui/dist/studio"),
    "--emptyOutDir",
  ],
  { cwd: path.join(root, "apps/studio"), stdio: "inherit", windowsHide: true },
);
process.exitCode = result.status ?? 1;
