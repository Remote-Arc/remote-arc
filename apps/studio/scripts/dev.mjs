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
const origin = `http://127.0.0.1:${uiPort}`;
const env = {
  ...process.env,
  STUDIO_API_PORT: String(apiPort),
  STUDIO_UI_ORIGIN: origin,
  STUDIO_LOCAL_API: `http://127.0.0.1:${apiPort}`,
};
const children = [
  spawn(
    process.execPath,
    [
      path.join(root, "node_modules/tsx/dist/cli.mjs"),
      path.join(root, "scripts/local.ts"),
      "--serve",
    ],
    { cwd: root, env, stdio: "inherit", windowsHide: true },
  ),
  spawn(
    process.execPath,
    [
      path.join(root, "node_modules/vite/bin/vite.js"),
      "--host",
      "127.0.0.1",
      "--port",
      String(uiPort),
      "--strictPort",
    ],
    { cwd: root, env, stdio: "inherit", windowsHide: true },
  ),
];
let stopping = false;
const stop = (code = 0) => {
  if (stopping) return;
  stopping = true;
  for (const child of children) if (!child.killed) child.kill("SIGTERM");
  process.exitCode = code;
};
for (const child of children) {
  child.on("error", () => stop(1));
  child.on("exit", (code) => stop(code || 0));
}
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
console.log(
  `ReArc Studio: ${origin}/studio\nIndependent local mode: loopback only, real Studio persistence, no Agent runtime or paid model requests.`,
);
