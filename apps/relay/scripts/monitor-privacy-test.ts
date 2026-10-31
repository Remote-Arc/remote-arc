import assert from "node:assert/strict";
import { diagnosticError, diagnosticRoute, deviceReadDiagnostic } from "../src/platform/diagnostics.js";
import { recordServiceIncident, type MonitorEnv } from "../src/analytics/monitor.js";
import { recordMcpTelemetry } from "../src/analytics/relay-telemetry.js";

const secrets = [
  "sk-fixture-test-key-123456789",
  "Bearer fixture-bearer-token",
  "session=fixture-cookie-value",
  "-----BEGIN PRIVATE KEY-----\nfixture-private-key\n-----END PRIVATE KEY-----",
  "otp=739182", "pairing_code=468213",
  "password=fixture-password",
  "personal file content without a recognizable token",
];
const raw = secrets.join("\n");
for (const prefix of ['ENOENT:','EACCES:','EPERM:','ENOTDIR:','EISDIR:','FILE_CHANGED_DURING_READ:','device call timed out:','Blocked by Remote Arc Sensitive Path Policy:','', 'Error:']) {
  const error = Error(prefix + raw), before = error.message;
  const safe = deviceReadDiagnostic(error);
  assert.equal(error.message,before,'Caller error remains intact');
  for (const secret of secrets) assert(!safe.includes(secret));
}
// Exact os error text from the Go Agent, with a path that holds sensitive text.
for (const [message, code] of [
  [`stat /home/${raw}: no such file or directory`, "ENOENT"],
  [`GetFileAttributesEx C:\\${raw}: The system cannot find the file specified.`, "ENOENT"],
  [`open C:\\${raw}: The system cannot find the path specified.`, "ENOENT"],
  [`open /root/${raw}: permission denied`, "EACCES"],
  [`open C:\\Windows\\${raw}: Access is denied.`, "EACCES"],
  [`Path is not a directory: ${raw}`, "ENOTDIR"],
  [`Path is not a file: ${raw}`, "EISDIR"],
  ["File is too large for read_file (21 MB > 20 MB). Use a terminal command or a more targeted tool instead.", "FILE_TOO_LARGE"],
  ["Binary file detected. read_file currently supports text files only.", "BINARY_FILE"],
] as const) assert.equal(deviceReadDiagnostic(Error(message)), code + ": details omitted");
assert.equal(deviceReadDiagnostic(Error(`no such file or directory: ${raw}`)), "Error: details omitted", "Only a trailing os reason is a classification");
assert.equal(diagnosticError(new TypeError(raw)), "TypeError: details omitted");
assert.equal(diagnosticError(new RangeError(raw)), "RangeError: details omitted");
assert.equal(diagnosticError("D1_ERROR: " + raw), "D1_ERROR: details omitted");
for (const [message, kind] of [
  [`UNIQUE constraint failed: users.email (${raw})`, "constraint"],
  [`no such column: ${raw}`, "schema"],
  [`string or blob too big: ${raw}`, "limit"],
  [`Network connection lost. ${raw}`, "unavailable"],
] as const) assert.equal(diagnosticError("D1_ERROR: " + message), `D1_ERROR: ${kind} (details omitted)`, "Only a fixed D1 class leaves the sanitizer");
assert.equal(diagnosticError({ toString() { throw Error(raw); } }), "Error: details omitted");
assert.equal(diagnosticRoute("/api/device/" + raw), "/api/device/:redacted");
assert.equal(diagnosticRoute("/private/" + raw), "/:redacted");
assert.equal(diagnosticRoute("/api/devices"), "/api/devices");

const original = { error: console.error, warn: console.warn };
const logs: unknown[] = [];
console.error = (...args) => { logs.push(args); };
console.warn = (...args) => { logs.push(args); };
try {
  for (const failure of ["none", "db", "email", "limiter"] as const) {
    const rows: unknown[][] = [], emails: unknown[] = [];
    logs.length = 0;
    const env = {
      PUBLIC_ORIGIN: "https://mcp.example.test",
      ALERT_EMAIL: "operator@example.test",
      ALERT_FROM_EMAIL: "alerts@example.test",
      INCIDENT_RATE_LIMITER: { async limit() {
        if (failure === "limiter") throw Error(raw);
        return { success: true };
      } },
      EMAIL: { async send(message: unknown) {
        if (failure === "email") throw Error(raw);
        emails.push(message);
      } },
      DB: { prepare(sql: string) {
        let values: unknown[] = [];
        return {
          bind(...args: unknown[]) { values = args; return this; },
          async first() { return null; },
          async run() {
            if (failure === "db") throw Error(raw);
            rows.push([sql, ...values]);
            return { success: true };
          },
        };
      } },
    } as unknown as MonitorEnv;
    const input = {
      kind: "exception", severity: "critical" as const, statusCode: 500,
      method: "POST", path: "/api/device/" + raw, message: "D1_ERROR: " + raw,
      rayId: raw, colo: raw,
    };
    const before = structuredClone(input);
    await recordServiceIncident(env, input);
    assert.deepEqual(input, before, "sanitize a copy; caller/recovery data must remain intact");
    const sinks = JSON.stringify({ rows, emails, logs });
    for (const secret of secrets) assert.ok(!sinks.includes(secret), failure + ": secret reached a sink");
    assert.ok(!sinks.includes("fixture-private-key"), "private-key body reached a sink");
    if (failure === "none" || failure === "email") {
      assert.equal(rows.length, failure === "none" ? 2 : 1);
      assert.equal(rows[0]![8], "D1_ERROR: details omitted", "sanitize before DB binding");
      assert.equal(rows[0]![7], "/api/device/:redacted");
    }
    if (failure === "none") {
      assert.equal(emails.length, 1, "mock alert delivery runs");
      assert.match(JSON.stringify(emails), /D1_ERROR: details omitted/);
    }
    if (failure !== "none") assert.ok(logs.length > 0, "exercise safe failure logging");

    rows.length = emails.length = logs.length = 0;
    await recordServiceIncident(env, {
      kind: raw, method: raw, message: raw, path: raw, rayId: raw, colo: raw,
      severity: raw as "error",
    });
    assert.ok(!JSON.stringify({ rows, emails, logs }).includes("fixture"), "reject untrusted metadata");
  }
  recordMcpTelemetry({ MCP_ANALYTICS: { writeDataPoint() { throw Error(raw); } } as unknown as AnalyticsEngineDataset },
    { status: 500, durationMs: 1, method: "POST" });
  for (const secret of secrets) assert.ok(!JSON.stringify(logs).includes(secret));
} finally {
  console.error = original.error;
  console.warn = original.warn;
}
console.log("PASS: incident privacy before DB/email/log sinks, failures, metadata and caller state");
