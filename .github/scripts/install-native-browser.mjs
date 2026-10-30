import { createWriteStream } from "node:fs";
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { spawnSync } from "node:child_process";

// Pin Windows and macOS to the already-qualified browser. Linux keeps its
// provisioned browser and OS sandbox policy. Prepare first-run setup before a
// timed MCP call on every platform.
const version = "156.0.8078.47";
const target = {
  "win32/x64": ["win64", "chrome.exe"],
  "linux/x64": ["linux64", "chrome"],
  "darwin/x64": ["mac-x64", "Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"],
  "darwin/arm64": ["mac-arm64", "Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"],
}[`${process.platform}/${process.arch}`];
if (!target) throw new Error(`Unsupported native browser CI runner: ${process.platform}/${process.arch}`);
if (!process.env.RUNNER_TEMP || !process.env.GITHUB_ENV)
  throw new Error("Native browser setup requires RUNNER_TEMP and GITHUB_ENV");

const [platform, executable] = target;
const root = path.resolve(process.env.RUNNER_TEMP, "remotearc-native-browser");
const archive = path.join(root, "chrome.zip");
let binary = path.join(root, `chrome-${platform}`, executable);
await mkdir(root, { recursive: true });
let actual;
if (process.platform === "linux") {
  binary = run("which", ["google-chrome"]).trim();
  actual = run(binary, ["--version"]);
  console.log(`Using the runner-provisioned ${actual.trim()} and its installed sandbox`);
} else {
  const url = `https://storage.googleapis.com/chrome-for-testing-public/${version}/${platform}/chrome-${platform}.zip`;
  let downloaded = false;
  console.log(`Downloading Chrome for Testing ${version} (${platform})`);
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
      if (!response.ok || !response.body) throw new Error(`Browser download returned HTTP ${response.status}`);
      await pipeline(Readable.fromWeb(response.body), createWriteStream(archive));
      downloaded = true;
      break;
    } catch (error) {
      if (attempt === 3) throw error;
      console.log(`Retrying native browser download (${attempt}/3)`);
    }
  }
  if (!downloaded) throw new Error("Native browser download did not complete");

  console.log("Extracting the pinned native browser");
  if (process.platform === "win32") {
    run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
      "Expand-Archive -LiteralPath $env:REMOTEARC_BROWSER_ARCHIVE -DestinationPath $env:REMOTEARC_BROWSER_EXTRACT -Force"],
    { env: { ...process.env, REMOTEARC_BROWSER_ARCHIVE: archive, REMOTEARC_BROWSER_EXTRACT: root } });
  } else {
    run("ditto", ["-x", "-k", archive, root]);
  }
  // Windows Chrome is a GUI executable: --version may open a window instead of
  // printing and exiting. Read executable version metadata without launching.
  actual = process.platform === "win32"
    ? run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
      "(Get-Item -LiteralPath $env:REMOTEARC_BROWSER_EXECUTABLE).VersionInfo.ProductVersion"],
    { env: { ...process.env, REMOTEARC_BROWSER_EXECUTABLE: binary } })
    : run(binary, ["--version"]);
  if (!actual.includes(version)) throw new Error(`Expected Chrome ${version}; found ${actual.trim()}`);
}

// First-executable scanning and browser initialization belong to CI setup, not
// to the 40-second MCP acceptance budget. This profile contains no user data.
// The real tests still create fresh profiles and use visible native windows.
const marker = "RemoteArcNativeBrowserReady";
console.log("Preparing an isolated first-launch profile before MCP acceptance");
const warm = run(binary, [
  "--headless=new", "--no-first-run", "--no-default-browser-check",
  "--disable-background-networking", "--disable-component-update", "--disable-sync",
  `--user-data-dir=${path.join(root, "warmup-profile")}`,
  "--dump-dom", `data:text/html,<title>Remote Arc CI browser setup</title><p>${marker}</p>`,
], { timeout: 90_000 });
if (!warm.includes(marker)) throw new Error("Native test browser did not complete its first launch");
if (/[\r\n]/.test(binary)) throw new Error("Invalid test browser path");
await appendFile(process.env.GITHUB_ENV, `REMOTEARC_BROWSER_PATH=${binary}\n`);
console.log(`${actual.trim()} prepared and cold-started for native window acceptance.`);

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8", windowsHide: true, timeout: 120_000, maxBuffer: 2 * 1024 * 1024,
    ...options,
  });
  if (result.error || result.status !== 0) {
    const stderr = result.stderr || "";
    const diagnostic = stderr.length > 4000 ? stderr.slice(0, 2000) + "\n...\n" + stderr.slice(-2000) : stderr;
    throw result.error ?? new Error(`${command} exited ${result.status} (${result.signal || "no signal"}): ${diagnostic}`);
  }
  return result.stdout;
}
