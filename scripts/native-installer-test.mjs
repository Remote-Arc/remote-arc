import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, symlinkSync, rmSync, existsSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
if (process.platform === "win32") {
  console.log("Shell installer fixtures run on macOS/Linux; Windows native install has its own CI.");
  process.exit(0);
}
const installer = readFileSync(new URL("../apps/ui/public/install.sh", import.meta.url), "utf8");
const version = installer.match(/^  version='([^']+)'$/m)[1];
const root = mkdtempSync(join(tmpdir(), "remote-arc-installer-test-"));
try {
  const bin = join(root, "bin"), fixtures = join(root, "fixtures");
  mkdirSync(bin); mkdirSync(fixtures);
  // Restricted PATH deliberately has no Node, npm or npx.
  for (const tool of ["sh", "awk", "cat", "chmod", "cp", "mkdir", "mktemp", "mv", "rm", "rmdir", "shasum"]) {
    const path = spawnSync("/bin/sh", ["-c", "command -v " + tool], { encoding: "utf8" }).stdout.trim();
    assert.ok(path, tool + " is required by these tests");
    symlinkSync(path, join(bin, tool));
  }
  writeFileSync(join(bin, "uname"), '#!/bin/sh\ncase "$1" in -s) echo "$TEST_OS";; -m) echo "$TEST_ARCH";; esac\n', { mode: 0o755 });
  writeFileSync(join(bin, "curl"), `#!/bin/sh
case "$1 $2 $3 $4" in "--proto =https --tlsv1.2 -fsSL") ;; *) exit 51;; esac
url=$5
[ "$6" = -o ] || exit 52
case "$url" in
  https://github.com/Remote-Arc/remote-arc/releases/download/remotelink-v${version}/SHA256SUMS) cp "$TEST_FIXTURES/SHA256SUMS" "$7" ;;
  https://github.com/Remote-Arc/remote-arc/releases/download/remotelink-v${version}/remotelink-v${version}-*) cp "$TEST_FIXTURES/agent" "$7" ;;
  *) exit 53 ;;
esac
`, { mode: 0o755 });
  const native = "#!/bin/sh\n[ \"$1\" = --version ] || exit 42\necho " + version + "\n";
  const hash = createHash("sha256").update(native).digest("hex");
  writeFileSync(join(fixtures, "agent"), native);
  let count = 0;
  function run({ os = "Linux", arch = "x86_64", checksum, dir, script = installer, env = {} } = {}) {
    count++;
    writeFileSync(join(fixtures, "SHA256SUMS"), checksum ?? hash + "  remotelink-v" + version + "-" + (os === "Darwin" ? "darwin" : "linux") + "-" + (/^(arm64|aarch64)$/.test(arch) ? "arm64" : "amd64") + "\n");
    return spawnSync("/bin/sh", [], { input: script, encoding: "utf8",
      env: { PATH: bin, HOME: join(root, "home " + count), TMPDIR: root,
        TEST_OS: os, TEST_ARCH: arch, TEST_FIXTURES: fixtures,
        ...(dir ? { REMOTEARC_INSTALL_DIR: dir } : {}), ...env },
    });
  }
  for (const os of ["Linux", "Darwin"]) for (const arch of ["x86_64", "arm64", "aarch64"]) {
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
  assert.notEqual(run({ os: "FreeBSD" }).status, 0);
  assert.notEqual(run({ arch: "riscv64" }).status, 0);
  assert.notEqual(run({ dir: "relative/path" }).status, 0);
  assert.notEqual(run({ dir: "/" }).status, 0);
  const symlinkDir = join(root, "symlink");
  mkdirSync(symlinkDir); symlinkSync(target, join(symlinkDir, "remotelink"));
  assert.notEqual(run({ dir: symlinkDir }).status, 0);
  assert.equal(readFileSync(target, "utf8"), "previous version");
  const truncated = run({ dir: join(root, "truncated"), script: installer.slice(0, installer.lastIndexOf("remote_arc_install")) });
  assert.equal(truncated.status, 0);
  assert.ok(!existsSync(join(root, "truncated")));
  writeFileSync(join(bin, "sha256sum"), '#!/bin/sh\nexec shasum -a 256 "$@"\n', { mode: 0o755 });
  assert.equal(run({ dir: join(root, "sha256sum") }).status, 0);
  console.log("PASS: " + count + " native installer scenarios, SHA256, atomic updates, symlink protection and no Node in PATH");
} finally { rmSync(root, { recursive: true, force: true }); }
