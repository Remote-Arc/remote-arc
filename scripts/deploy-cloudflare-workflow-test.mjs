import assert from "node:assert/strict";
import { readFileSync, writeFileSync, chmodSync, mkdtempSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";

const ciWait = readFileSync(new URL("./wait-production-ci.mjs", import.meta.url), "utf8");
const yaml = readFileSync(new URL("../.github/workflows/deploy-cloudflare.yml", import.meta.url), "utf8").replace(/\r\n/g,"\n");
assert.ok(yaml.includes("on:\n  workflow_dispatch:"), "production must require explicit promotion");
assert.ok(!yaml.includes("workflow_run:"), "CI cannot deploy by itself");
assert.ok(yaml.includes("github.ref == 'refs/heads/master'"), "reject feature branch releases");
assert.ok(yaml.includes("github.actor == 'yaohuangguan'"), "only the repository owner can manually promote production");
assert.ok(yaml.includes("backup_confirmation:"), "retain optional D1 backup confirmation");
assert.match(yaml, /backup_confirmation:[\s\S]*?required: false/, "no migration release should not need confirmation");
assert.match(yaml, /BACKUP_CONFIRMATION: \$\{\{ inputs\.backup_confirmation \}\}/, "preflight must receive confirmation");
assert.ok(yaml.includes("actions: read"), "read-only CI verification scope");
assert.ok(ciWait.includes('["ls-remote", "origin", "refs/heads/master"]'), "reject stale release candidates");
assert.ok(ciWait.includes("actions/workflows/ci.yml/runs?head_sha="), "exact-SHA CI check");
assert.ok(ciWait.includes('run.conclusion !== "success"'), "CI must pass");
assert.ok(yaml.includes("environment: production"), "production environment protection");
const concurrency = yaml.slice(yaml.indexOf("concurrency:"), yaml.indexOf("jobs:"));
assert.ok(concurrency.includes("group: remote-arc-production") && concurrency.includes("cancel-in-progress: false"), "do not cancel a running production migration");
const preflightStart=yaml.indexOf("- name: Check production D1 and conditionally require backup");
const preflightEnd=yaml.indexOf("- name: Apply and verify production D1 migrations");
assert.ok(preflightStart>0&&preflightEnd>preflightStart,"preflight must run before D1 mutation");
const preflight=yaml.slice(preflightStart,preflightEnd);
assert.match(preflight,/node scripts\/d1-promotion-preflight\.mjs/);
assert.match(preflight,/CLOUDFLARE_D1_API_TOKEN/,"preflight uses read-only D1 access via dedicated token");
const d1Name = "- name: Apply and verify production D1 migrations";
const deployName = "- name: Deploy Remote Arc to Cloudflare";
const start = yaml.indexOf(d1Name);
const end = yaml.indexOf("- name: Verify all production migrations are applied");
assert.ok(start > 0 && end > start, "D1 migration must precede worker deployment");
const d1 = yaml.slice(start, end);
assert.match(d1,/if: steps\.d1_preflight\.outputs\.needs_migration == 'true'/);
assert.match(d1, /secrets\.CLOUDFLARE_D1_API_TOKEN/, "D1 must use a dedicated secret");
assert.match(d1, /set -euo pipefail/, "fail closed independent of shell defaults");
assert.match(d1, /migrations apply remote-link-auth --remote/);
assert.match(d1, /migrations list remote-link-auth --remote/, "verify pending migrations after apply");
assert.doesNotMatch(d1, /set \+e|code:\s*7403|::warning::|\|\| true/, "migration errors must never be ignored");
const deployStart=yaml.indexOf(deployName),deployEnd=yaml.indexOf('\n      - name:',deployStart);
assert.ok(deployStart>0&&deployEnd>deployStart,'inspect the Worker deployment step independently of later operations');
const deploy=yaml.slice(deployStart,deployEnd);
assert.match(deploy, /secrets\.CLOUDFLARE_API_TOKEN/, "retain existing Worker token");
assert.doesNotMatch(deploy, /secrets\.CLOUDFLARE_D1_API_TOKEN/, "D1-only token must not deploy Worker");
const activation=yaml.indexOf('- name: Activate OpenAI after successful production smoke');
assert.ok(activation>yaml.indexOf('run: node scripts/production-smoke.mjs'),'model activation must follow production smoke');
assert.match(yaml.slice(activation),/if: inputs\.enable_openai/,'funded model activation must be explicitly requested');
const stripeActivation=yaml.indexOf('- name: Activate live Stripe after successful production smoke');
assert.ok(stripeActivation>yaml.indexOf('run: node scripts/production-smoke.mjs'),'live payments require completed production smoke');
assert.match(yaml.slice(stripeActivation),/if: inputs\.enable_stripe/,'live Stripe provisioning must be explicitly requested');
assert.doesNotMatch(yaml.slice(stripeActivation),/secrets\.CLOUDFLARE_D1_API_TOKEN/,'live Stripe provisioning does not receive a D1 token');

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

const backupStart=yaml.indexOf("- name: Prepare verified encrypted production D1 backup");
const backupUpload=yaml.indexOf("- name: Retain encrypted recovery artifact");
assert(backupStart>0&&backupUpload>backupStart&&backupUpload<preflightStart,"verified recoverable backup must be retained before preflight/mutation");
assert.match(yaml.slice(backupStart,backupUpload),/secrets\.D1_BACKUP_KEY/);
assert.match(yaml.slice(backupUpload,preflightStart),/\*\.enc/);
assert.doesNotMatch(yaml.slice(backupUpload,preflightStart),/\*\.sql|continue-on-error/);
assert.match(preflight,/if \[ "\$\{\{ steps\.d1_backup\.outputs\.backup_verified \}\}" = "true" \]/);
assert.match(preflight,/export BACKUP_CONFIRMATION=BACKUP_VERIFIED/);
assert(yaml.indexOf("Provision Apps vault")>end&&yaml.indexOf("Provision Apps vault")<yaml.indexOf(deployName));

assert.match(yaml, /run: node scripts\/wait-production-ci\.mjs/);

assert(yaml.indexOf("node scripts/production-smoke.mjs --sha") > yaml.indexOf(deployName), "verify the published exact SHA after deployment");
