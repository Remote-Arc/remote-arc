import assert from "node:assert/strict";
import { ensureStudioStorage } from "./ensure-studio-storage.mjs";
const common = { token: "test-secret", accountId: "a".repeat(32) };
let calls = [];
const privateDomainResponse = (url) =>
  url.endsWith("/domains/managed")
    ? Response.json({ success: true, result: { enabled: false } })
    : url.endsWith("/domains/custom")
      ? Response.json({ success: true, result: { domains: [] } })
      : null;
const existing = await ensureStudioStorage({
  ...common,
  fetcher: async (url, init) => {
    calls.push({ url, init });
    if (url.includes("/domains/")) return privateDomainResponse(url);
    return Response.json({
      success: true,
      result: { name: "remote-arc-studio-private" },
    });
  },
});
assert.equal(existing.created, false);
assert.equal(calls.length, 3);
assert(!JSON.stringify(existing).includes("test-secret"));
calls = [];
const created = await ensureStudioStorage({
  ...common,
  fetcher: async (url, init) => {
    calls.push({ url, init });
    if (url.includes("/domains/")) return privateDomainResponse(url);
    return calls.length === 1
      ? new Response("{}", { status: 404 })
      : Response.json({
          success: true,
          result: { name: "remote-arc-studio-private" },
        });
  },
});
assert.equal(created.created, true);
assert.deepEqual(JSON.parse(calls[1].init.body), {
  name: "remote-arc-studio-private",
});
await assert.rejects(
  () =>
    ensureStudioStorage({
      ...common,
      fetcher: async () => new Response("{}", { status: 403 }),
    }),
  /Cannot inspect/,
);
await assert.rejects(
  () =>
    ensureStudioStorage({
      ...common,
      fetcher: async () =>
        Response.json({ success: true, result: { name: "different-bucket" } }),
    }),
  /Unable to verify/,
);
for (const publicKind of ["managed", "custom"]) {
  const requests = [];
  await assert.rejects(
    () =>
      ensureStudioStorage({
        ...common,
        fetcher: async (url, init) => {
          requests.push(init?.method || "GET");
          if (url.endsWith(`/domains/${publicKind}`))
            return Response.json({
              success: true,
              result:
                publicKind === "managed"
                  ? { enabled: true }
                  : { domains: [{ enabled: true }] },
            });
          return (
            privateDomainResponse(url) ||
            Response.json({
              success: true,
              result: { name: "remote-arc-studio-private" },
            })
          );
        },
      }),
    /public access/,
  );
  assert(
    requests.every((method) => method === "GET"),
    "Public bucket configuration is rejected without changing it",
  );
}
console.log(
  "PASS Studio storage provisioning: exact private bucket, idempotent lookup, permission failures stop promotion, no public access changes or secret output.",
);
