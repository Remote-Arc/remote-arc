import assert from "node:assert/strict";
import { observeBusinessFetch } from "../src/lib/business-fetch.js";
const origin = "https://agent.remotearc.app",
  reports: unknown[] = [],
  calls: { input: unknown; init?: RequestInit }[] = [];
const failure = new TypeError("CANARY_PRIVATE");
let fail = false;
const native: typeof fetch = async (input, init) => {
  calls.push({ input, init });
  if (fail) throw failure;
  return Response.json({ ok: true });
};
const observed = observeBusinessFetch(
  native,
  origin,
  () => ({ "x-ra-trace-id": "trace-fixture" }),
  (value) => reports.push(value),
);
await observed("/api/apps/connections?token=CANARY_PRIVATE", { headers: { "x-other": "keep" } });
assert.equal(new Headers(calls[0]!.init!.headers).get("x-other"), "keep");
assert.equal(new Headers(calls[0]!.init!.headers).get("x-ra-trace-id"), "trace-fixture");
assert.equal(reports.length, 0);
const request = new Request(origin + "/api/apps/call", {
  method: "POST",
  headers: { "x-ra-trace-id": "preserve-trace" },
  body: "CANARY_PRIVATE",
});
await observed(request);
assert.equal(calls.at(-1)!.input, request);
assert.equal(request.bodyUsed, false);
assert.equal(new Headers(calls.at(-1)!.init!.headers).get("x-ra-trace-id"), "preserve-trace");
fail = true;
await assert.rejects(
  observed("/api/apps/connections?token=CANARY_PRIVATE"),
  (error) => error === failure,
);
assert.deepEqual(reports, [
  { route: "/api/apps", traceId: "trace-fixture", errorCode: "NETWORK_ERROR" },
]);
assert(!JSON.stringify(reports).includes("CANARY_PRIVATE"));
await assert.rejects(observed("https://provider.invalid/api/apps"));
await assert.rejects(observed("/api/product-events"));
assert.equal(reports.length, 1, "Provider and telemetry failures never recurse");
assert(!new Headers(calls.at(-1)!.init?.headers).has("x-ra-trace-id"));
const abort = observeBusinessFetch(
  async () => {
    throw new DOMException("cancelled", "AbortError");
  },
  origin,
  () => ({}),
  (value) => reports.push(value),
);
await assert.rejects(abort("/api/apps"), /cancelled/);
assert.equal(reports.length, 1, "User cancellation is not an outage");
console.log(
  "PASS: same-origin correlation, private query/body omission, preserved errors/headers, handled network failures and recursion/cancellation isolation",
);
