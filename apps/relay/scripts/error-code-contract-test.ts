import assert from "node:assert/strict";
import {
  canonicalErrorCode,
  canonicalErrorEnvelope,
} from "../../../packages/protocol/src/error-codes.js";
import { billingRecovery } from "../../../packages/protocol/src/billing-recovery.js";
import { createWorkerFixture, AGENT, MCP } from "./worker-fixture.js";
import { registerMcpTool } from "../src/mcp/mcp-errors.js";
import { errorCatalog, safeFailureCode } from "../src/analytics/error-catalog.js";

for (const [input, expected] of [
  ["app_connection_limit", "APP_CONNECTION_LIMIT"],
  ["AppConnectionLimit", "APP_CONNECTION_LIMIT"],
  ["MONTHLY_LIMIT_REACHED", "MONTHLY_LIMIT_REACHED"],
])
  assert.equal(canonicalErrorCode(input), expected);
for (const input of [
  -32602,
  null,
  "",
  "CANARY private message",
  "https://private.invalid",
  "a__b",
  "a_",
])
  assert.equal(canonicalErrorCode(input), undefined);
const data = {
  ok: true,
  code: "provider_identity",
  data: { error: "provider_error", code: "vendor_code" },
  message: "CANARY private message",
};
assert.equal(
  canonicalErrorEnvelope(data),
  data,
  "Successful provider data must not be traversed or rewritten",
);
assert.deepEqual(
  canonicalErrorEnvelope({
    ok: false,
    error: { code: "app_connection_limit", message: "Please reconnect" },
    reference: "req_reference",
  }),
  {
    ok: false,
    error: { code: "APP_CONNECTION_LIMIT", message: "Please reconnect" },
    reference: "req_reference",
  },
);
assert.deepEqual(
  canonicalErrorEnvelope({ error: { code: -32602, message: "Invalid params" } }),
  { error: { code: -32602, message: "Invalid params" } },
  "JSON-RPC numeric codes keep their protocol meaning",
);

const f = createWorkerFixture();
const response = await f.call(AGENT + "/api/apps/connections");
assert.equal(response.status, 401);
assert.equal(
  ((await response.json()) as any).error,
  "UNAUTHORIZED",
  "The real Worker must emit a canonical business error",
);
assert(response.headers.get("x-ra-trace-id"));

let handler: (...args: any[]) => Promise<any> = async () => null;
const server = {
  registerTool: (_name: string, _definition: unknown, run: typeof handler) => {
    handler = run;
  },
};
registerMcpTool(server as never, "fixture", {}, async () => ({
  isError: true,
  content: [
    { type: "text", text: JSON.stringify({ status: "failed", error: "app_connection_limit" }) },
  ],
}));
const result = await handler({});
assert.equal(JSON.parse(result.content[0].text).error, "APP_CONNECTION_LIMIT");
assert.equal(safeFailureCode("app_connection_limit"), "APP_CONNECTION_LIMIT");
assert(
  errorCatalog().every((item) => /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$/.test(item.code)),
  "Every monitored application code must use UPPER_SNAKE_CASE",
);
assert.deepEqual(
  billingRecovery("APP_CONNECTION_LIMIT"),
  billingRecovery("app_connection_limit"),
  "Old and new casing must retain identical payment guidance",
);
assert(billingRecovery("APP_CONNECTION_LIMIT"));

// OAuth machine-readable error values are defined by the external protocol.
const oauth = await f.call(MCP + "/oauth/token", {
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: "grant_type=unsupported",
});
assert.equal(oauth.status, 400);
assert.equal(
  ((await oauth.json()) as any).error,
  "invalid_request",
  "Missing OAuth client parameters retain the standard protocol error",
);
console.log(
  "PASS: canonical REST/MCP/catalog codes, legacy payment guidance, preserved provider content and standard OAuth/JSON-RPC errors",
);
