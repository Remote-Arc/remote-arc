import assert from "node:assert/strict";
import { readFileSync, writeFileSync, chmodSync, mkdtempSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";

const yaml = readFileSync(new URL("../.github/workflows/deploy-cloudflare.yml", import.meta.url), "utf8");
assert.ok(yaml.includes("on:\n  workflow_dispatch:"), "production must require explicit promotion");
assert.ok(!yaml.includes("workflow_run:"), "CI cannot deploy by itself");
assert.ok(yaml.includes("github.ref == 'refs/heads/master'"), "reject feature branch releases");
assert.ok(yaml.includes("github.actor == 'yaohuangguan'"), "only the repository owner can manually promote production");
assert.ok(yaml.includes("backup_confirmation:"), "production release must require a D1 backup confirmation input");
assert.ok(yaml.includes('BACKUP_CONFIRMATION: ${{ inputs.backup_confirmation }}'), "read the confirmation provided for this release");
assert.ok(yaml.includes('if [ "$BACKUP_CONFIRMATION" != "BACKUP_VERIFIED" ]'), "reject release without confirmation");
assert.ok(yaml.includes("actions: read"), "read-only CI verification scope");
assert.ok(yaml.includes("git ls-remote origin refs/heads/master"), "reject stale release candidates");
assert.ok(yaml.includes("actions/workflows/ci.yml/runs?head_sha=$GITHUB_SHA"), "exact-SHA CI check");
assert.ok(yaml.includes('conclusion == "success"'), "CI must pass");
assert.ok(yaml.includes("environment: production"), "production environment protection");
const backupStart = yaml.indexOf("- name: Require verified production database recovery point");
const backupEnd = yaml.indexOf("- name: Verify latest master", backupStart);
assert.ok(backupStart > 0 && backupEnd > backupStart, "recovery check precedes release verification");
const backupBlock = yaml.slice(backupStart, backupEnd);
const backupBody = backupBlock.split("        run: |\n")[1];
assert.ok(backupBody, "backup confirmation must execute a shell check");
const backupScript = backupBody.split("\n").filter(line => line.startsWith("          "))
  .map(line => line.slice(10)).join("\n");
for (const [confirmation, shouldPass] of [["", false], ["not yet", false], ["BACKUP_VERIFIED", true]]) {
  const result = spawnSync("bash", ["-e", "-c", backupScript], {
    env: { ...process.env, BACKUP_CONFIRMATION: confirmation }, encoding: "utf8",
  });
  assert.equal(result.status === 0, shouldPass, "backup gate must enforce exact confirmation");
}
const d1Name = "- name: Apply and verify production D1 migrations";
const deployName = "- name: Deploy Remote Arc to Cloudflare";
const start = yaml.indexOf(d1Name);
const end = yaml.indexOf(deployName);
assert.ok(start > 0 && end > start, "D1 migration must precede worker deployment");
const d1 = yaml.slice(start, end);
assert.match(d1, /secrets\.CLOUDFLARE_D1_API_TOKEN/, "D1 must use a dedicated secret");
assert.match(d1, /set -euo pipefail/, "fail closed independent of shell defaults");
assert.match(d1, /migrations apply remote-link-auth --remote/);
assert.match(d1, /migrations list remote-link-auth --remote/, "verify pending migrations after apply");
assert.doesNotMatch(d1, /set \+e|code:\s*7403|::warning::|\|\| true/, "migration errors must never be ignored");
assert.match(yaml.slice(end), /secrets\.CLOUDFLARE_API_TOKEN/, "retain existing Worker token");
assert.doesNotMatch(yaml.slice(end), /secrets\.CLOUDFLARE_D1_API_TOKEN/, "D1-only token must not deploy Worker");

const scriptBody = d1.split("\n        run: |\n")[1];
assert.ok(scriptBody, "expected an inline migration shell script");
const script = scriptBody.split("\n").filter(line => line.startsWith("          ")).map(line => line.slice(10)).join("\n");
const missing = spawnSync("bash", ["-e", "-c", script], {
  env: { ...process.env, CLOUDFLARE_API_TOKEN: "" }, encoding: "utf8",
});
assert.equal(missing.status, 1, "missing secret must stop deployment");
assert.match(missing.stdout, /Missing CLOUDFLARE_D1_API_TOKEN/);

const dir = mkdtempSync(join(tmpdir(), "remotearc-d1-gate-"));
const trace = join(dir, "calls");
const stub = join(dir, "pnpm");
try {
  writeFileSync(stub, [
    "#!/usr/bin/env bash",
    "printf '%s\\n' \"$*\" >> \"$TEST_TRACE\"",
    "case \"$*\" in",
    "  *'migrations apply '*) exit \"$FAKE_APPLY_EXIT\" ;;",
    "  *'migrations list '*) exit \"$FAKE_LIST_EXIT\" ;;",
    "  *) exit 69 ;;",
    "esac",
    "",
  ].join("\n"));
  chmodSync(stub, 0o700);
  const run = (applyExit, listExit) => {
    rmSync(trace, { force: true });
    const result = spawnSync("bash", ["-e", "-c", script], {
      encoding: "utf8",
      env: {
        ...process.env,
        CLOUDFLARE_API_TOKEN: "fake-test-token",
        PATH: dir + ":" + process.env.PATH,
        TEST_TRACE: trace,
        FAKE_APPLY_EXIT: String(applyExit),
        FAKE_LIST_EXIT: String(listExit),
      },
    });
    return { result, trace: readFileSync(trace, "utf8") };
  };
  const failApply = run(47, 0);
  assert.equal(failApply.result.status, 47, "D1 apply failure must fail deployment");
  assert.match(failApply.trace, /migrations apply remote-link-auth --remote/);
  assert.doesNotMatch(failApply.trace, /migrations list/, "never verify after failed apply");

  const failVerify = run(0, 61);
  assert.equal(failVerify.result.status, 61, "post-apply verification failure must fail deployment");
  assert.match(failVerify.trace, /migrations list remote-link-auth --remote/);

  const success = run(0, 0);
  assert.equal(success.result.status, 0, "D1 apply + verification success permits deployment");
} finally {
  rmSync(dir, { recursive: true, force: true });
}
console.log("PASS: D1 fail-closed gate: missing secret, failed apply, failed verify, success");
