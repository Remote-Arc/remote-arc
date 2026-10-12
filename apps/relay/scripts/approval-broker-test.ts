import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import {
  decideApproval,
  handleDeviceApprovalList,
  requestWriteApproval,
  runApprovalMaintenance,
} from "../src/approvals.js";
import { callDevice } from "../src/device-call.js";
import { retryTransientD1Read } from "../src/d1-read-retry.js";

const relayDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sqlite = new DatabaseSync(":memory:");

for (const name of fs
  .readdirSync(path.join(relayDir, "migrations"))
  .filter((name) => name.endsWith(".sql"))
  .sort()) {
  sqlite.exec(fs.readFileSync(path.join(relayDir, "migrations", name), "utf8"));
}

let d1Writes = 0;
const db = {
  prepare(sql: string) {
    const stmt = sqlite.prepare(sql);
    const bound = (args: unknown[]) => ({
      async first<T>() {
        return (stmt.get(...args) as T | undefined) || null;
      },
      async all<T>() {
        return { results: stmt.all(...args) as T[] };
      },
      async run() {
        if (/^\s*(UPDATE|DELETE|INSERT)\b/i.test(sql)) d1Writes++;
        const result = stmt.run(...args);
        return { success: true, meta: { changes: Number(result.changes) } };
      },
    });
    return {
      ...bound([]),
      bind(...args: unknown[]) {
        assert(!args.includes(undefined), sql);
        return bound(args);
      },
    };
  },
} as unknown as D1Database;

const now = new Date().toISOString();
sqlite
  .prepare(
    "INSERT INTO users(id,google_sub,email,created_at,plan) VALUES(?,?,?,?,?)",
  )
  .run("owner", "owner-sub", "owner@test.invalid", now, "plus");
sqlite
  .prepare(
    "INSERT INTO oauth_clients(client_id,client_name,redirect_uris,created_at) VALUES(?,?,?,?)",
  )
  .run(
    "client-1",
    "ChatGPT",
    JSON.stringify(["https://client.example/callback"]),
    now,
  );
sqlite
  .prepare(
    "INSERT INTO devices(id,user_id,name,platform,credential_hash,created_at,allowed_tools,workspace_roots) VALUES(?,?,?,?,?,?,?,?)",
  )
  .run(
    "device-1",
    "owner",
    "Test Mac",
    "darwin",
    "fixture-hash",
    now,
    JSON.stringify(["write_file", "edit_block"]),
    JSON.stringify(["/Users/test/work"]),
  );

const identity = {
  userId: "owner",
  clientId: "client-1",
  grantId: "grant-1",
  scope: "computer:read computer:write",
  resource: "https://mcp.remotearc.app/mcp",
};

const registryBodies: Array<Record<string, unknown>> = [];
const registry = {
  getByName() {
    return {
      async fetch(request: Request) {
        const body = (await request.json()) as {
          tool: string;
          policy?: { workspaceRoots?: string[] };
        };
        registryBodies.push(body as unknown as Record<string, unknown>);
        const roots = body.policy?.workspaceRoots || [];
        if (!roots.includes("/Users/test/Desktop/report.txt")) {
          return Response.json(
            {
              error:
                "Blocked by Remote Arc Trusted Write Locations: path is outside the allowed write roots.",
            },
            { status: 403 },
          );
        }
        return Response.json({ result: { ok: true } });
      },
    };
  },
};

const env = {
  DB: db,
  REGISTRY: registry,
  PUBLIC_ORIGIN: "https://mcp.remotearc.app",
};

const outsideArgs = {
  path: "/Users/test/Desktop/report.txt",
  content: "version one",
};

await assert.rejects(
  callDevice(
    env as never,
    identity,
    "device-1",
    "write_file",
    outsideArgs,
  ),
  /approval required/,
);

const pending = sqlite
  .prepare(
    "SELECT id,status,target_path FROM approval_requests WHERE status='pending' ORDER BY requested_at DESC LIMIT 1",
  )
  .get() as { id: string; status: string; target_path: string };
assert.equal(pending.target_path, outsideArgs.path);

const once = await decideApproval(env, {
  userId: "owner",
  approvalId: pending.id,
  decision: "allow_once",
  source: "dashboard",
});
assert.equal(once.status, 200);

await callDevice(
  env as never,
  identity,
  "device-1",
  "write_file",
  outsideArgs,
);

const consumed = sqlite
  .prepare("SELECT status,consumed_at FROM approval_requests WHERE id=?")
  .get(pending.id) as { status: string; consumed_at: string | null };
assert.equal(consumed.status, "consumed");
assert(consumed.consumed_at);
assert(
  registryBodies.some((body) =>
    ((body.policy as { workspaceRoots?: string[] })?.workspaceRoots || []).includes(
      outsideArgs.path,
    ),
  ),
  "approved exact path was not passed as a per-call write scope",
);

const tenMinuteRequest = await requestWriteApproval(env, {
  identity,
  deviceId: "device-1",
  requestId: crypto.randomUUID(),
  tool: "write_file",
  args: { ...outsideArgs, content: "version two" },
});
assert(tenMinuteRequest);

const tenMinute = await decideApproval(env, {
  userId: "owner",
  approvalId: tenMinuteRequest!.id,
  decision: "allow_10m",
  source: "terminal",
});
assert.equal(tenMinute.status, 200);

await callDevice(
  env as never,
  identity,
  "device-1",
  "write_file",
  { ...outsideArgs, content: "version three" },
);

const folderRequest = await requestWriteApproval(env, {
  identity,
  deviceId: "device-1",
  requestId: crypto.randomUUID(),
  tool: "edit_block",
  args: {
    file_path: "/Users/test/Desktop/notes/todo.md",
    old_string: "a",
    new_string: "b",
  },
});
assert(folderRequest);

const folderDecision = await decideApproval(env, {
  userId: "owner",
  approvalId: folderRequest!.id,
  decision: "always_folder",
  source: "dashboard",
});
assert.equal(folderDecision.status, 200);

const device = sqlite
  .prepare("SELECT workspace_roots FROM devices WHERE id='device-1'")
  .get() as { workspace_roots: string };
const roots = JSON.parse(device.workspace_roots) as string[];
assert(roots.includes("/Users/test/Desktop/notes"));

// A polled approval list must not write to D1 and must never show expired grants.
const pollingToken = "poll-only-credential";
const credentialHash = Array.from(new Uint8Array(await crypto.subtle.digest(
  "SHA-256", new TextEncoder().encode(pollingToken),
))).map((byte) => byte.toString(16).padStart(2, "0")).join("");
sqlite.prepare("UPDATE devices SET credential_hash=? WHERE id='device-1'").run(credentialHash);
const expiredId = crypto.randomUUID();
sqlite.prepare(
  "INSERT INTO approval_requests (id,user_id,device_id,request_id,tool_name,target_path,args_hash,status,requested_at,expires_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
).run(expiredId, "owner", "device-1", "expired-request", "write_file", "/tmp/old.txt", "old", "pending", new Date(Date.now() - 120_000).toISOString(), new Date(Date.now() - 60_000).toISOString());
const d1WritesBeforePoll = d1Writes;
const pollingResponse = await handleDeviceApprovalList(new Request(
  "https://mcp.remotearc.app/api/device/approvals/pending",
  { headers: { authorization: "Bearer " + pollingToken } },
), env);
assert.equal(pollingResponse.status, 200);
assert.deepEqual(await pollingResponse.json(), []);
assert.equal(d1Writes, d1WritesBeforePoll, "Polling must not execute D1 writes");
assert.equal((sqlite.prepare("SELECT status FROM approval_requests WHERE id=?").get(expiredId) as { status: string }).status, "pending");
await runApprovalMaintenance(env);
assert.equal((sqlite.prepare("SELECT status FROM approval_requests WHERE id=?").get(expiredId) as { status: string }).status, "expired");

let attempts = 0;
assert.equal(await retryTransientD1Read(async () => {
  attempts++;
  if (attempts === 1) throw new Error("D1_ERROR: Network connection lost.");
  return "recovered";
}), "recovered");
assert.equal(attempts, 2, "Retry a transport failure once");
attempts = 0;
await assert.rejects(retryTransientD1Read(async () => {
  attempts++;
  throw new Error("D1_ERROR: Your account has exceeded D1's free tier daily row read limit.");
}), /free tier/);
assert.equal(attempts, 1, "Never retry quota exhaustion");

console.log(
  "Approval Broker regression tests passed · grants, read-only polling, expiry and bounded D1 retry",
);
