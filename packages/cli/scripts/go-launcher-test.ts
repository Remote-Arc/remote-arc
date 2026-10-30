import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  GO_VERSION,
  goAsset,
  launchGo,
  localGoControl,
  resolveGoBinary,
} from "../src/go-launcher.js";

const repository = fileURLToPath(new URL("../../../", import.meta.url));
const binary = path.join(repository, "work/go-device", goAsset());
const temp = await fs.realpath(
  await fs.mkdtemp(path.join(os.tmpdir(), "ra-go-launcher-")),
);
const original = {
  argv: process.argv,
  binary: process.env.REMOTEARC_GO_BINARY,
  home: process.env.REMOTEARC_HOME,
};
const writeControl = (descriptor: Record<string, unknown>) =>
  fs.writeFile(
    path.join(temp, ".remotearc/agent/control.json"),
    JSON.stringify(descriptor),
  );
try {
  assert.equal(goAsset("linux", "x64"), `remotelink-v${GO_VERSION}-linux-amd64`);
  assert.equal(goAsset("darwin", "arm64"), `remotelink-v${GO_VERSION}-darwin-arm64`);
  assert.equal(goAsset("win32", "x64"), `remotelink-v${GO_VERSION}-windows-amd64.exe`);
  assert.throws(() => goAsset("sunos", "x64"), /unavailable/);
  assert.throws(() => goAsset("linux", "ia32"), /unavailable/);

  process.env.REMOTEARC_GO_BINARY = "relative/remotelink";
  await assert.rejects(resolveGoBinary, /absolute path/);
  process.env.REMOTEARC_GO_BINARY = path.join(temp, "missing");
  await assert.rejects(resolveGoBinary, /absolute path/);
  // Node exits 0 but reports its own version, so the pin must refuse it.
  process.env.REMOTEARC_GO_BINARY = process.execPath;
  await assert.rejects(resolveGoBinary, /must match/);
  process.env.REMOTEARC_GO_BINARY = binary;
  assert.equal(await resolveGoBinary(), binary);
  process.env.REMOTEARC_GO_BINARY = "";
  await assert.rejects(resolveGoBinary, /no Go binary manifest/);

  process.env.REMOTEARC_GO_BINARY = binary;
  await launchGo(["--version"]);
  assert.equal(process.exitCode, 0);
  await launchGo(["--ts"]);
  assert.equal(process.exitCode, 1, "the Go exit code reaches the npm caller");
  process.exitCode = 0;

  // The local control endpoint is loopback-only and bearer-protected.
  process.env.REMOTEARC_HOME = temp;
  await fs.mkdir(path.join(temp, ".remotearc/agent"), { recursive: true });
  const token = "a".repeat(64);
  const server = http.createServer((request, response) => {
    if (request.headers.authorization !== "Bearer " + token) {
      response.writeHead(401);
      return response.end();
    }
    response.writeHead(request.url === "/status" ? 200 : 500);
    response.end(JSON.stringify({ engine: "go" }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = "http://127.0.0.1:" + (server.address() as { port: number }).port;
  try {
    const valid = { url, token, engine: "go", pid: 42 };
    await writeControl(valid);
    assert.deepEqual(await localGoControl("GET", "/status", 42), { engine: "go" });
    await assert.rejects(() => localGoControl("POST", "/stop"), /request failed/);
    await assert.rejects(() => localGoControl("GET", "/status", 43), /Invalid local Go control/);
    for (const invalid of [
      { engine: "ts" },
      { url: "https://127.0.0.1:1" },
      { url: "http://example.test:1" },
      { url: "http://127.0.0.1" },
      { url: "http://user:secret@127.0.0.1:1" },
      { url: "http://127.0.0.1:1/path" },
      { url: "http://127.0.0.1:1/?query=1" },
      { url: "http://127.0.0.1:1/#fragment" },
      { token: "short" },
    ]) {
      await writeControl({ ...valid, ...invalid });
      await assert.rejects(
        () => localGoControl("GET", "/status"),
        /Invalid local Go control/,
        JSON.stringify(invalid),
      );
    }
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  // The npm entry refuses --ts before it resolves any binary.
  process.env.REMOTEARC_GO_BINARY = path.join(temp, "must-not-be-resolved");
  process.argv = [original.argv[0]!, original.argv[1]!, "--go", "--ts"];
  await import("../src/index.js");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(process.exitCode, 1, "--ts must fail instead of falling back");
  process.exitCode = 0;
  console.log(
    "PASS: launcher asset names, version pin, exit codes, loopback control descriptor and retired --ts",
  );
} finally {
  process.argv = original.argv;
  for (const [key, value] of [
    ["REMOTEARC_GO_BINARY", original.binary],
    ["REMOTEARC_HOME", original.home],
  ] as const) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  await fs.rm(temp, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}
