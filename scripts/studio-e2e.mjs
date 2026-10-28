import { spawn, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url)),
  uiPort = Number(process.env.STUDIO_UI_PORT || 4431),
  apiPort = Number(process.env.STUDIO_API_PORT || 4432),
  origin = `http://127.0.0.1:${uiPort}`;
const env = {
  ...process.env,
  STUDIO_UI_PORT: String(uiPort),
  STUDIO_API_PORT: String(apiPort),
  STUDIO_TEST_URL: origin,
  STUDIO_DATA_DIR:
    process.env.STUDIO_DATA_DIR || path.join(root, "work/studio-e2e-data"),
  STUDIO_ARTIFACT_DIR:
    process.env.STUDIO_ARTIFACT_DIR || path.join(root, "work/studio-browser"),
};
const server = spawn(
  process.execPath,
  [path.join(root, "scripts/studio-dev.mjs")],
  { cwd: root, env, stdio: "inherit", windowsHide: true },
);
let ready = false;
try {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null)
      throw Error("Studio development server exited.");
    try {
      const response = await fetch(origin + "/api/me", {
        signal: AbortSignal.timeout(1000),
      });
      if (response.ok && (await response.json()).authenticated) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  if (!ready) throw Error("Studio server did not become ready.");
  const child = spawn(
    process.execPath,
    [path.join(root, "apps/ui/scripts/studio-browser-test.mjs")],
    { cwd: root, env, stdio: "inherit", windowsHide: true },
  );
  process.exitCode = await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", (code) => resolve(code || 0));
  });
} finally {
  if (server.exitCode === null) {
    if (process.platform === "win32") {
      try {
        execFileSync("taskkill", ["/PID", String(server.pid), "/T", "/F"], {
          stdio: "ignore",
          windowsHide: true,
        });
      } catch {
        server.kill();
      }
    } else {
      server.kill("SIGTERM");
    }
  }
}
