import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

const root = fileURLToPath(new URL("../", import.meta.url));
const pkg = JSON.parse(await fs.readFile(path.join(root, "packages/cli/package.json"), "utf8"));
const all = process.argv.includes("--all") || process.argv.includes("--release");
const release = process.argv.includes("--release");
const hostOS = { win32: "windows", darwin: "darwin", linux: "linux" }[process.platform];
const hostArch = { x64: "amd64", arm64: "arm64" }[process.arch];
if (!hostOS || !hostArch) throw new Error("Unsupported native Go build target.");
const targets = all
  ? ["windows", "darwin", "linux"].flatMap((os) => ["amd64", "arm64"].map((arch) => ({ os, arch })))
  : [{ os: hostOS, arch: hostArch }];
const output = path.join(root, "work", "go-device");
await fs.mkdir(output, { recursive: true });
const checksums = {};

// Windows reads an exe's icon and file details from resources linked into the
// binary. go-winres writes them as rsrc_windows_<arch>.syso beside main.go,
// which `go build` links only for that GOOS/GOARCH. They are removed after
// the build so no generated binary is left in the source tree. go-winres is a
// `tool` in apps/agent/go.mod, so go.sum pins it and CI's Go module cache holds it.
const agentMain = path.join(root, "apps/agent/cmd/remotelink");
const windowsArches = targets.filter(({ os }) => os === "windows").map(({ arch }) => arch);
const resourceFiles = windowsArches.map((arch) =>
  path.join(agentMain, `rsrc_windows_${arch}.syso`),
);
const removeResources = () =>
  Promise.all(resourceFiles.map((file) => fs.rm(file, { force: true })));
try {
  if (windowsArches.length) {
    // Windows file versions are four numbers, so a prerelease suffix is dropped.
    const fileVersion = pkg.version.split(/[-+]/)[0];
    const result = spawnSync(
      "go",
      [
        "tool",
        "go-winres",
        "simply",
        "--arch",
        windowsArches.join(","),
        "--out",
        "rsrc",
        "--icon",
        path.join(root, "apps/ui/public/remote-arc-512.png"),
        // No manifest: the exe keeps the default Windows behaviour it had before.
        "--manifest",
        "none",
        "--product-name",
        "Remote Arc",
        "--file-description",
        "Remote Arc",
        "--original-filename",
        "remotelink.exe",
        "--copyright",
        "Remote Arc",
        "--file-version",
        fileVersion,
        "--product-version",
        fileVersion,
      ],
      {
        cwd: agentMain,
        stdio: "inherit",
        windowsHide: true,
      },
    );
    if (result.error || result.status !== 0)
      throw result.error ?? new Error("Could not create the Windows icon resources.");
  }

  for (const { os, arch } of targets) {
    const name = `remotelink-v${pkg.version}-${os}-${arch}${os === "windows" ? ".exe" : ""}`;
    const target = path.join(output, name);
    const result = spawnSync(
      "go",
      [
        "build",
        "-trimpath",
        "-buildvcs=false",
        "-ldflags",
        `-s -w -X main.version=${pkg.version}`,
        "-o",
        target,
        "./cmd/remotelink",
      ],
      {
        cwd: path.join(root, "apps/agent"),
        stdio: "inherit",
        windowsHide: true,
        env: { ...process.env, CGO_ENABLED: "0", GOOS: os, GOARCH: arch },
      },
    );
    if (result.error || result.status !== 0)
      throw result.error ?? new Error(`Go build failed for ${os}/${arch}`);
    checksums[name] = createHash("sha256")
      .update(await fs.readFile(target))
      .digest("hex");
    console.log(`Built ${name}`);
  }
} finally {
  await removeResources();
}
const manifest = JSON.stringify({ version: pkg.version, checksums }, null, 2) + "\n";
await fs.writeFile(path.join(output, "go-binaries.json"), manifest);
await fs.writeFile(
  path.join(output, "SHA256SUMS"),
  Object.entries(checksums)
    .map(([name, sum]) => `${sum}  ${name}`)
    .join("\n") + "\n",
);
if (all) {
  const block = (os, arch) => {
    const name = `remotelink-v${pkg.version}-${os}-${arch}`;
    return `      url "https://github.com/Remote-Arc/remote-arc/releases/download/remotelink-v${pkg.version}/${name}", using: :nounzip\n      sha256 "${checksums[name]}"`;
  };
  for (const [className, filename, conflict] of [
    ["Remotelink", "remotelink.rb", "remotelink-go"],
    ["RemotelinkGo", "remotelink-go.rb", "remotelink"],
  ]) {
    const formula = `class ${className} < Formula\n  desc "Controlled remote computer access for AI"\n  homepage "https://remotearc.app"\n  version "${pkg.version}"\n  conflicts_with "${conflict}", because: "both install remotelink"\n\n  on_macos do\n    on_arm do\n${block("darwin", "arm64")}\n    end\n    on_intel do\n${block("darwin", "amd64")}\n    end\n  end\n  on_linux do\n    on_arm do\n${block("linux", "arm64")}\n    end\n    on_intel do\n${block("linux", "amd64")}\n    end\n  end\n\n  def install\n    bin.install Dir["remotelink-v*"].first => "remotelink"\n    chmod 0755, bin/"remotelink"\n  end\n\n  test do\n    assert_equal "${pkg.version}", shell_output("#{bin}/remotelink --version").strip\n  end\nend\n`;
    await fs.writeFile(path.join(output, filename), formula);
  }
}
await fs.mkdir(path.join(root, "packages/cli/dist"), { recursive: true });
await fs.writeFile(path.join(root, "packages/cli/dist/go-binaries.json"), manifest);
if (!release) {
  const name = `remotelink-v${pkg.version}-${hostOS}-${hostArch}${hostOS === "windows" ? ".exe" : ""}`;
  await fs.mkdir(path.join(root, "packages/cli/dist/bin"), { recursive: true });
  await fs.copyFile(path.join(output, name), path.join(root, "packages/cli/dist/bin", name));
  await fs.chmod(path.join(root, "packages/cli/dist/bin", name), 0o700);
}
