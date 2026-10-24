import assert from "node:assert/strict";
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { sha256Hex } from "../src/auth.js";
import { seal } from "../src/app-oauth.js";
import { slackTokenContext } from "../src/slack-bot-common.js";
import {
  handleRunnerRequest,
  recordRunnerAttention,
  parseRunnerAttention,
  type RunnerEnv,
} from "../src/runner-attention.js";
import { DeviceRegistry } from "../src/registry.js";

const sql = new DatabaseSync(":memory:");
for (const name of fs
  .readdirSync(new URL("../migrations/", import.meta.url))
  .filter((n) => n.endsWith(".sql"))
  .sort())
  sql.exec(
    fs.readFileSync(new URL("../migrations/" + name, import.meta.url), "utf8"),
  );
const db = {
  prepare(query: string) {
    const stmt = sql.prepare(query);
    const bind = (args: any[]) => ({
      async first() {
        return stmt.get(...args) || null;
      },
      async all() {
        return { results: stmt.all(...args) };
      },
      async run() {
        return {
          success: true,
          meta: { changes: Number(stmt.run(...args).changes) },
        };
      },
    });
    return {
      ...bind([]),
      bind(...args: any[]) {
        assert(!args.includes(undefined), query);
        return bind(args);
      },
    };
  },
} as any;
const origin = "https://agent.remotearc.app",
  now = new Date().toISOString();
for (const id of ["owner", "other"]) {
  sql
    .prepare(
      "INSERT INTO users(id,google_sub,email,created_at) VALUES(?,?,?,?)",
    )
    .run(id, id, id + "@example.invalid", now);
  sql
    .prepare(
      "INSERT INTO sessions(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)",
    )
    .run(
      await sha256Hex("token-" + id),
      id,
      new Date(Date.now() + 86400000).toISOString(),
      now,
    );
  sql
    .prepare(
      "INSERT INTO devices(id,user_id,name,platform,credential_hash,created_at,allowed_tools) VALUES(?,?,?,?,?,?,?)",
    )
    .run(
      "device-" + id,
      id,
      "Computer",
      "linux",
      "fixture-" + id,
      now,
      JSON.stringify([
        "browser_runner_start",
        "browser_runner_snapshot",
        "browser_runner_act",
        "browser_runner_status",
      ]),
    );
}

sql
  .prepare(
    "INSERT INTO arc_chat_sessions(id,user_id,organization_id,title_ciphertext,created_at,updated_at) VALUES('chat','owner',(SELECT id FROM organizations WHERE personal_owner_user_id='owner'),'fixture',?,?)",
  )
  .run(now, now);
sql
  .prepare(
    "INSERT INTO arc_chat_runs(id,session_id,user_id,request_id,input_hash,status,max_tokens,max_steps,deadline,created_at,updated_at,model_id) VALUES('run','chat','owner','request','hash','working',1000,10,?,?,?,'auto')",
  )
  .run(now, now, now);
sql
  .prepare(
    "INSERT INTO runner_session_links(user_id,device_id,session_id,run_id) VALUES('owner','device-owner','task','run')",
  )
  .run();
let waitResult = "timeout",
  dispatches: any[] = [],
  viewerRequests = 0;
const env = {
  DB: db,
  PUBLIC_ORIGIN: origin,
  APP_ORIGIN: origin,
  DASHBOARD_ORIGIN: origin,
  APP_TOKEN_KEY: Buffer.alloc(32, 3).toString("base64"),
  REGISTRY: {
    getByName: () => ({
      fetch: async (request: Request) => {
        if (new URL(request.url).pathname === "/runner-view") {
          viewerRequests++;
          return new Response("viewer", { status: 200 });
        }
        const body = (await request.json()) as any;
        dispatches.push(body);
        return Response.json({ result: { state: waitResult } });
      },
    }),
  },
} as unknown as RunnerEnv;
const token = await seal(
  env,
  { accessToken: "fixture-token", expiresAt: null },
  slackTokenContext("TEAM"),
);
sql
  .prepare(
    "INSERT INTO slack_bot_installations(team_id,app_id,bot_user_id,team_name,installer_user_id,token_ciphertext,updated_at) VALUES('TEAM','APP','BOT','Fixture','owner',?,?)",
  )
  .run(token, now);
sql
  .prepare(
    "INSERT INTO slack_arc_links(team_id,slack_user_id,user_id,updated_at) VALUES('TEAM','USER','owner',?)",
  )
  .run(now);
sql
  .prepare(
    "INSERT INTO slack_arc_events(id,team_id,slack_user_id,channel_id,source_ts,thread_ts,event_type,body_ciphertext,user_id,run_id,next_attempt_at,created_at,updated_at) VALUES('event','TEAM','USER','DM','123.1','122.1','message','fixture','owner','run',?,?,?)",
  )
  .run(now, now, now);
const posted: any[] = [];
const mockSlack = async (url: any, init?: RequestInit) => {
  assert.equal(String(url), "https://slack.com/api/chat.postMessage");
  posted.push(JSON.parse(String(init?.body)));
  return Response.json({ ok: true, ts: "123.2" });
};
const event = {
  type: "runner_attention",
  event_id: "a".repeat(32),
  session_id: "task",
  task_id: "task",
  kind: "captcha",
  origin: "https://careers.example.invalid/private?token=secret",
  title: "DO NOT STORE",
  screenshot: "DO NOT STORE",
};
assert.equal(
  parseRunnerAttention({ ...event, origin: "javascript:alert(1)" }),
  null,
);
await recordRunnerAttention(env, "other", "device-owner", event, mockSlack);
assert.equal(
  sql.prepare("SELECT count(*) AS n FROM runner_attention").get()!.n,
  0,
);
await Promise.all([
  recordRunnerAttention(env, "owner", "device-owner", event, mockSlack),
  recordRunnerAttention(env, "owner", "device-owner", event, mockSlack),
]);
assert.equal(posted.length, 1);
assert.equal(posted[0].channel, "DM");
assert.equal(posted[0].thread_ts, "122.1");
assert.equal(
  sql.prepare("SELECT count(*) AS n FROM runner_attention").get()!.n,
  1,
);
assert(
  !JSON.stringify(sql.prepare("SELECT * FROM runner_attention").all()).includes(
    "DO NOT STORE",
  ),
);
assert.equal(
  sql.prepare("SELECT origin FROM runner_attention").get()!.origin,
  "https://careers.example.invalid",
);
await recordRunnerAttention(
  env,
  "owner",
  "device-owner",
  { ...event, kind: "reminder" },
  mockSlack,
);
await recordRunnerAttention(
  env,
  "owner",
  "device-owner",
  { ...event, kind: "reminder" },
  mockSlack,
);
assert.equal(posted.length, 2);
function request(
  path: string,
  user = "owner",
  method = "GET",
  extra: Record<string, string> = {},
  body?: string,
) {
  return new Request(origin + path, {
    method,
    headers: {
      cookie: "rl_session=token-" + user,
      ...(method === "POST"
        ? { origin, "content-type": "application/json" }
        : {}),
      ...extra,
    },
    ...(body ? { body } : {}),
  });
}
const attention = (
  (await (
    await handleRunnerRequest(
      request("/api/runner/attention?arc_session_id=chat"),
      env,
    )
  ).json()) as any
).attention;
assert.equal(attention.length, 1);
assert.equal(
  (
    (await (
      await handleRunnerRequest(
        request("/api/runner/attention?arc_session_id=another"),
        env,
      )
    ).json()) as any
  ).attention.length,
  0,
);
const resolve = "/api/runner/attention/" + attention[0].id + "/resolve";
assert.equal(
  (await handleRunnerRequest(request(resolve, "other", "POST"), env)).status,
  404,
);
assert.equal(
  (
    await handleRunnerRequest(
      request(resolve, "owner", "POST", { origin: "https://evil.invalid" }),
      env,
    )
  ).status,
  403,
);
assert.equal(
  (
    (await (
      await handleRunnerRequest(request(resolve, "owner", "POST"), env)
    ).json()) as any
  ).resolved,
  false,
);
waitResult = "met";
assert.equal(
  (
    (await (
      await handleRunnerRequest(request(resolve, "owner", "POST"), env)
    ).json()) as any
  ).resolved,
  true,
);
assert(
  dispatches.every(
    (call) =>
      call.tool === "browser_runner_wait" &&
      call.arguments.until === "user_done",
  ),
);
assert(
  dispatches.every(
    (call) => call.policy.runnerAttentionMode === "show_and_notify",
  ),
);
assert.equal(
  (
    await handleRunnerRequest(
      request(
        "/api/runner/settings/device-owner",
        "owner",
        "POST",
        {},
        JSON.stringify({ runner_attention_mode: "notify_only" }),
      ),
      env,
    )
  ).status,
  200,
);
assert.equal(
  (
    await handleRunnerRequest(
      request("/api/runner/view/device-owner/task", "other", "GET", {
        origin,
        upgrade: "websocket",
      }),
      env,
    )
  ).status,
  403,
);
assert.equal(viewerRequests, 0);
assert.equal(
  (
    await handleRunnerRequest(
      request("/api/runner/view/device-owner/task", "owner", "GET", {
        origin: "https://evil.invalid",
        upgrade: "websocket",
      }),
      env,
    )
  ).status,
  403,
);
assert.equal(
  (
    await handleRunnerRequest(
      request("/api/runner/view/device-owner/task", "owner", "GET", {
        origin,
        upgrade: "websocket",
      }),
      env,
    )
  ).status,
  200,
);
assert.equal(viewerRequests, 1);
await recordRunnerAttention(
  env,
  "owner",
  "device-owner",
  { ...event, event_id: "b".repeat(32), kind: "resolved" },
  mockSlack,
);
await recordRunnerAttention(
  env,
  "owner",
  "device-owner",
  { ...event, event_id: "b".repeat(32) },
  mockSlack,
);
assert.equal(posted.length, 2, "late initial must respect resolved tombstone");

// Exercise the DO message boundary with memory-only sockets. Frames can reach
// only fresh viewers of the same owner, device and task, at most twice/second.
class Socket {
  sent: string[] = [];
  constructor(
    public data: any,
    public tags: string[],
  ) {}
  deserializeAttachment() {
    return structuredClone(this.data);
  }
  serializeAttachment(v: any) {
    this.data = structuredClone(v);
  }
  send(v: string) {
    this.sent.push(v);
  }
  close() {}
}
const agent = new Socket({ userId: "owner", deviceId: "device-owner" }, [
  "device:device-owner",
]);
const tag = "runner-view:owner:device-owner:task";
const viewer = new Socket(
  {
    viewer: true,
    userId: "owner",
    deviceId: "device-owner",
    sessionId: "task",
    heartbeatAt: Date.now(),
  },
  [tag],
);
const other = new Socket(
  {
    viewer: true,
    userId: "other",
    deviceId: "device-owner",
    sessionId: "task",
    heartbeatAt: Date.now(),
  },
  [tag],
);
const sockets = [agent, viewer, other];
const context = {
  getWebSockets: (tag: string) =>
    sockets.filter((socket) => socket.tags.includes(tag)),
  waitUntil: () => {},
} as any;
const registry = new DeviceRegistry(context);
const before = sql.prepare("SELECT count(*) AS n FROM runner_attention").get()!
  .n;
const frame = JSON.stringify({
  type: "runner_frame",
  session_id: "task",
  data: Buffer.from([0xff, 0xd8, 0xff, 0xd9]).toString("base64"),
});
registry.webSocketMessage(agent as any, frame);
registry.webSocketMessage(agent as any, frame);
assert.equal(viewer.sent.length, 1);
assert.equal(other.sent.length, 0);
assert.equal(
  sql.prepare("SELECT count(*) AS n FROM runner_attention").get()!.n,
  before,
);
registry.webSocketMessage(
  agent as any,
  JSON.stringify({
    type: "runner_frame",
    session_id: "task",
    data: "A".repeat(280000),
  }),
);
assert.equal(viewer.sent.length, 1);
viewer.data.heartbeatAt = Date.now() - 31000;
agent.data.frameTimes = {};
registry.webSocketMessage(agent as any, frame);
assert.equal(viewer.sent.length, 1);
assert.match(agent.sent.at(-1)!, /"action":"stop"/);
registry.webSocketMessage(
  viewer as any,
  JSON.stringify({ type: "hello", tools: ["start_process"] }),
);
assert.equal(viewer.data.tools, undefined);
console.log(
  "PASS: Runner attention ownership, deduplication, Slack thread delivery, safe completion, view isolation and ephemeral frames",
);
