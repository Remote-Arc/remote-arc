import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  symlinkSync,
  rmSync,
  existsSync,
  readdirSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
if (process.platform === "win32") {
  console.log(
    "Shell installer fixtures run on macOS/Linux; Windows native install has its own CI.",
  );
  process.exit(0);
}
const installer = readFileSync(new URL("../apps/ui/public/install.sh", import.meta.url), "utf8");
// Fixture versions deliberately do not depend on the deployed website build.
const version = "1.2.3";
const root = mkdtempSync(join(tmpdir(), "remote-arc-installer-test-"));
try {
  const bin = join(root, "bin"),
    fixtures = join(root, "fixtures");
  mkdirSync(bin);
  mkdirSync(fixtures);
  // Restricted PATH deliberately has no Node, npm or npx.
  for (const tool of [
    "sh",
    "awk",
    "cat",
    "chmod",
    "cp",
    "mkdir",
    "mktemp",
    "mv",
    "rm",
    "rmdir",
    "shasum",
  ]) {
    const path = spawnSync("/bin/sh", ["-c", "command -v " + tool], {
      encoding: "utf8",
    }).stdout.trim();
    assert.ok(path, tool + " is required by these tests");
    symlinkSync(path, join(bin, tool));
  }
  writeFileSync(
    join(bin, "uname"),
    '#!/bin/sh\ncase "$1" in -s) echo "$TEST_OS";; -m) echo "$TEST_ARCH";; esac\n',
    { mode: 0o755 },
  );
  writeFileSync(
    join(bin, "curl"),
    `#!/bin/sh
case "$1 $2 $3 $4" in "--proto =https --tlsv1.2 -fsSL") ;; *) exit 51;; esac
url=$5
[ "$6" = -o ] || exit 52
printf '%s\n' "$url" >> "$TEST_FIXTURES/calls"
mirror=https://remotearc.app/api/downloads/release
github=https://github.com/Remote-Arc/remote-arc/releases
case "$url" in
  $mirror/*) [ "$TEST_MIRROR_FAIL" != 1 ] || exit 22 ;;
  $github/*) [ "$TEST_GITHUB_FAIL" != 1 ] || exit 22 ;;
esac
case "$url" in
  $mirror/latest/go-binaries.json|$github/latest/download/go-binaries.json) [ "$TEST_MANIFEST_FAIL" != 1 ] || exit 56; cp "$TEST_FIXTURES/latest.json" "$7" ;;
  $mirror/remotelink-v$TEST_VERSION/SHA256SUMS|$github/download/remotelink-v$TEST_VERSION/SHA256SUMS) cp "$TEST_FIXTURES/SHA256SUMS" "$7" ;;
  $mirror/remotelink-v$TEST_VERSION/remotelink-v$TEST_VERSION-*|$github/download/remotelink-v$TEST_VERSION/remotelink-v$TEST_VERSION-*) cp "$TEST_FIXTURES/agent" "$7" ;;
  *) exit 53 ;;
esac
`,
    { mode: 0o755 },
  );
  // The fixture Agent prints its version; started without arguments, it records
  // whether its standard input is a terminal.
  const native =
    '#!/bin/sh\nif [ "$1" != --version ]; then\n  if [ -t 0 ]; then echo terminal; else echo pipe; fi >> "$TEST_FIXTURES/started"\n  exit 0\nfi\necho ' +
    version +
    "\n";
  const startedLog = join(fixtures, "started");
  const starts = () =>
    existsSync(startedLog) ? readFileSync(startedLog, "utf8").trim().split("\n") : [];
  // `script` gives the installer a terminal. util-linux and macOS take different arguments.
  const scriptTool = spawnSync("/bin/sh", ["-c", "command -v script"], {
    encoding: "utf8",
  }).stdout.trim();
  const atTerminal = (command) =>
    process.platform === "darwin"
      ? ["-q", "/dev/null", "/bin/sh", "-c", command]
      : ["-qec", command, "/dev/null"];
  const installerFile = join(root, "install.sh");
  const hash = createHash("sha256").update(native).digest("hex");
  writeFileSync(join(fixtures, "agent"), native);
  let count = 0;
  function run({
    os = "Linux",
    arch = "x86_64",
    checksum,
    dir,
    script = installer,
    env = {},
    latestVersion = version,
    manifest,
    terminal = false,
  } = {}) {
    count++;
    rmSync(join(fixtures, "calls"), { force: true });
    const selectedVersion = env.REMOTEARC_INSTALL_VERSION || latestVersion;
    writeFileSync(
      join(fixtures, "latest.json"),
      manifest ?? JSON.stringify({ version: latestVersion }, null, 2),
    );
    const selectedNative = native.replace("echo " + version, "echo " + selectedVersion);
    writeFileSync(join(fixtures, "agent"), selectedNative);
    const selectedHash = createHash("sha256").update(selectedNative).digest("hex");
    writeFileSync(
      join(fixtures, "SHA256SUMS"),
      checksum ??
        selectedHash +
          "  remotelink-v" +
          selectedVersion +
          "-" +
          (os === "Darwin" ? "darwin" : "linux") +
          "-" +
          (/^(arm64|aarch64)$/.test(arch) ? "arm64" : "amd64") +
          "\n",
    );
    const environment = {
      PATH: bin,
      HOME: join(root, "home " + count),
      TMPDIR: root,
      TEST_OS: os,
      TEST_ARCH: arch,
      TEST_FIXTURES: fixtures,
      TEST_VERSION: selectedVersion,
      ...(dir ? { REMOTEARC_INSTALL_DIR: dir } : {}),
      ...env,
    };
    if (terminal) {
      // Like `curl | sh` typed at a terminal: the script arrives on a pipe.
      writeFileSync(installerFile, script);
      // macOS `script` refuses a socket as its input, which is what Node passes by default.
      return spawnSync(scriptTool, atTerminal('cat "$TEST_INSTALLER" | /bin/sh'), {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...environment, TEST_INSTALLER: installerFile },
      });
    }
    return spawnSync("/bin/sh", [], { input: script, encoding: "utf8", env: environment });
  }
  for (const os of ["Linux", "Darwin"])
    for (const arch of ["x86_64", "arm64", "aarch64"]) {
      const dir = join(root, os + " " + arch);
      const result = run({ os, arch, dir });
      assert.equal(result.status, 0, result.stderr);
      assert.equal(readFileSync(join(dir, "remotelink"), "utf8"), native);
      assert.equal(statSync(join(dir, "remotelink")).mode & 0o777, 0o755);
      assert.match(result.stdout, /Start the Agent to pair/);
    }
  const defaultResult = run();
  assert.equal(defaultResult.status, 0, defaultResult.stderr);
  assert.ok(existsSync(join(root, "home " + count, ".local/bin/remotelink")));
  assert.match(defaultResult.stdout, /Next: /);
  assert.deepEqual(starts(), [], "Without a terminal the installer only installs");
  // A first install at a terminal starts the Agent with the terminal as its input;
  // an upgrade, or REMOTEARC_NO_START=1, only installs.
  if (scriptTool) {
    const home = join(root, "terminal first install");
    const first = run({ terminal: true, env: { HOME: home } });
    assert.equal(first.status, 0, first.stdout + first.stderr);
    assert.match(first.stdout, /Starting the Agent/);
    assert.deepEqual(starts(), ["terminal"]);
    assert.ok(!readdirSync(root).some((name) => name.startsWith("remotearc-install.")));
    assert.equal(run({ terminal: true, env: { HOME: home } }).status, 0);
    assert.deepEqual(starts(), ["terminal"], "An upgrade does not start the Agent");
    const optOut = join(root, "terminal opt-out");
    const declined = run({ terminal: true, env: { HOME: optOut, REMOTEARC_NO_START: "1" } });
    assert.equal(declined.status, 0, declined.stdout + declined.stderr);
    assert.deepEqual(starts(), ["terminal"], "REMOTEARC_NO_START only installs");
    assert.ok(existsSync(join(optOut, ".local/bin/remotelink")));
  } else assert.fail("script is required by these tests");
  const calls = () => readFileSync(join(fixtures, "calls"), "utf8").trim().split("\n");
  assert.deepEqual(
    calls().map((url) => new URL(url).hostname),
    ["remotearc.app", "remotearc.app", "remotearc.app"],
    "The Remote Arc mirror serves the channel, binary and checksums without GitHub",
  );
  // GitHub Releases is the fallback when the mirror cannot answer, and the
  // mirror keeps installs working when GitHub downloads fail.
  for (const env of [{ TEST_MIRROR_FAIL: "1" }, { TEST_GITHUB_FAIL: "1" }]) {
    const dir = join(root, "fallback " + Object.keys(env)[0]);
    const result = run({ dir, env });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(readFileSync(join(dir, "remotelink"), "utf8"), native);
    const hosts = [...new Set(calls().map((url) => new URL(url).hostname))];
    if (env.TEST_MIRROR_FAIL) assert.ok(hosts.includes("github.com"), hosts.join());
    else assert.deepEqual(hosts, ["remotearc.app"]);
  }
  const bothDown = join(root, "both-sources-down");
  assert.notEqual(
    run({ dir: bothDown, env: { TEST_MIRROR_FAIL: "1", TEST_GITHUB_FAIL: "1" } }).status,
    0,
  );
  assert.ok(!existsSync(join(bothDown, "remotelink")));
  const installed = join(root, "existing");
  mkdirSync(installed);
  const target = join(installed, "remotelink");
  writeFileSync(target, "previous version");
  for (const checksum of [
    "0".repeat(64) + "  remotelink-v" + version + "-linux-amd64\n",
    hash + "  unrelated-file\n",
    [1, 2].map(() => hash + "  remotelink-v" + version + "-linux-amd64\n").join(""),
    "g".repeat(64) + "  remotelink-v" + version + "-linux-amd64\n",
  ]) {
    const result = run({ dir: installed, checksum });
    assert.notEqual(result.status, 0);
    assert.equal(readFileSync(target, "utf8"), "previous version");
  }
  const pinnedDir = join(root, "pinned-stable");
  assert.equal(run({ dir: pinnedDir, env: { REMOTEARC_INSTALL_VERSION: "0.0.1" } }).status, 0);
  assert.match(readFileSync(join(pinnedDir, "remotelink"), "utf8"), /echo 0\.0\.1/);
  const freshDir = join(root, "new-stable-without-web-redeploy");
  assert.equal(run({ dir: freshDir, latestVersion: "1.2.4" }).status, 0);
  assert.match(readFileSync(join(freshDir, "remotelink"), "utf8"), /echo 1\.2\.4/);
  const pinnedWithoutChannel = join(root, "explicit-version-offline-channel");
  assert.equal(
    run({
      dir: pinnedWithoutChannel,
      env: { REMOTEARC_INSTALL_VERSION: "0.0.1", TEST_MANIFEST_FAIL: "1" },
    }).status,
    0,
  );
  for (const extra of [
    { env: { TEST_MANIFEST_FAIL: "1" } },
    { manifest: "{}" },
    { manifest: '{"version":"1.2.4-rc.1"}' },
    { manifest: '{"version":"../other"}' },
  ]) {
    const result = run({ dir: installed, ...extra });
    assert.notEqual(
      result.status,
      0,
      "An unavailable or invalid stable channel must not fall back to an old version",
    );
    assert.equal(readFileSync(target, "utf8"), "previous version");
  }
  for (const selected of ["0.6.2-rc.7", "latest", "1.2", "01.2.3", "1.2.3.4", "1.2.3/other"]) {
    assert.notEqual(
      run({ dir: installed, env: { REMOTEARC_INSTALL_VERSION: selected } }).status,
      0,
    );
    assert.equal(readFileSync(target, "utf8"), "previous version");
  }
  assert.notEqual(run({ os: "FreeBSD" }).status, 0);
  assert.notEqual(run({ arch: "riscv64" }).status, 0);
  assert.notEqual(run({ dir: "relative/path" }).status, 0);
  assert.notEqual(run({ dir: "/" }).status, 0);
  const symlinkDir = join(root, "symlink");
  mkdirSync(symlinkDir);
  symlinkSync(target, join(symlinkDir, "remotelink"));
  assert.notEqual(run({ dir: symlinkDir }).status, 0);
  assert.equal(readFileSync(target, "utf8"), "previous version");
  const truncated = run({
    dir: join(root, "truncated"),
    script: installer.slice(0, installer.lastIndexOf("remote_arc_install")),
  });
  assert.equal(truncated.status, 0);
  assert.ok(!existsSync(join(root, "truncated")));
  writeFileSync(join(bin, "sha256sum"), '#!/bin/sh\nexec shasum -a 256 "$@"\n', { mode: 0o755 });
  assert.equal(run({ dir: join(root, "sha256sum") }).status, 0);
  console.log(
    "PASS: " +
      count +
      " native installer scenarios, SHA256, atomic updates, symlink protection, no Node in PATH and starting the Agent only on a first install at a terminal",
  );
} finally {
  rmSync(root, { recursive: true, force: true });
}
