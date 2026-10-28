import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const uiPort = Number(process.env.STUDIO_UI_PORT || 4331),
  apiPort = Number(process.env.STUDIO_API_PORT || 4332);
if (
  ![uiPort, apiPort].every(
    (port) => Number.isInteger(port) && port > 1024 && port < 65536,
  ) ||
  uiPort === apiPort
)
  throw Error("Choose two distinct ports between 1025 and 65535.");
const uiOrigin = `http://127.0.0.1:${uiPort}`,
  apiOrigin = `http://127.0.0.1:${apiPort}`;
const env = {
  ...process.env,
  STUDIO_API_PORT: String(apiPort),
  STUDIO_UI_ORIGIN: uiOrigin,
  STUDIO_LOCAL_API: apiOrigin,
};
const children = [
  spawn(
    process.execPath,
    [
      path.join(root, "apps/relay/node_modules/tsx/dist/cli.mjs"),
      path.join(root, "apps/relay/scripts/studio-local.ts"),
      "--serve",
    ],
    { cwd: root, env, stdio: "inherit", windowsHide: true },
  ),
  spawn(
    process.execPath,
    [
      path.join(root, "apps/ui/node_modules/vite/bin/vite.js"),
      "--host",
      "127.0.0.1",
      "--port",
      String(uiPort),
      "--strictPort",
    ],
    {
      cwd: path.join(root, "apps/ui"),
      env,
      stdio: "inherit",
      windowsHide: true,
    },
  ),
];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) if (!child.killed) child.kill("SIGTERM");
  process.exitCode = code;
}
for (const child of children) {
  child.on("error", (error) => {
    console.error(error.message);
    stop(1);
  });
  child.on("exit", (code) => stop(code || 0));
}
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
console.log(`ReArc Studio: ${uiOrigin}/studio`);
console.log(
  "Development only: bound to loopback, real local persistence, no paid model requests. Production uses existing Remote Arc login and model billing.",
);
