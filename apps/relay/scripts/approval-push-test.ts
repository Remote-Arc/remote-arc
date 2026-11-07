import assert from "node:assert/strict";
import { DeviceRegistry } from "../src/devices/registry.js";

function fakeSocket(attachment: Record<string, unknown>, failSend = false) {
  const sent: string[] = [];
  return {
    sent,
    deserializeAttachment() {
      return attachment;
    },
    send(message: string) {
      if (failSend) throw new Error("socket closing");
      sent.push(message);
    },
  };
}

const agent = fakeSocket({ userId: "user-1", deviceId: "device-1" });
const secondAgent = fakeSocket({ userId: "user-1", deviceId: "device-1" });
const closing = fakeSocket({ userId: "user-1", deviceId: "device-1" }, true);
const viewer = fakeSocket({ userId: "user-1", deviceId: "device-1", viewer: true });
const otherUser = fakeSocket({ userId: "user-2", deviceId: "device-1" });
const otherDevice = fakeSocket({ userId: "user-1", deviceId: "device-2" });
const dashboard = fakeSocket({ live: true, userId: "user-1", deviceId: "" });
const secondTab = fakeSocket({ live: true, userId: "user-1", deviceId: "" });
const otherDashboard = fakeSocket({ live: true, userId: "user-2", deviceId: "" });
let crowded = false;

const ctx = {
  getWebSockets(tag: string) {
    if (tag === "device:device-1") return [agent, secondAgent, closing, viewer, otherUser];
    if (tag === "device:device-2") return [otherDevice];
    if (tag === "live:user-1") return crowded ? Array(12).fill(dashboard) : [dashboard, secondTab];
    if (tag === "live:user-2") return [otherDashboard];
    return [];
  },
} as unknown as DurableObjectState;

const registry = new DeviceRegistry(ctx);
const signal = (body: unknown, userId: string | null = "user-1") =>
  registry.fetch(
    new Request("https://registry/approval-pending", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(userId ? { "x-remote-link-user-id": userId } : {}),
      },
      body: JSON.stringify(body),
    }),
  );

const response = await signal({ deviceId: "device-1" });
assert.equal(response.status, 200);
assert.deepEqual(await response.json(), { ok: true, delivered: 2 });
assert.deepEqual(agent.sent, ['{"type":"approval_pending"}']);
assert.deepEqual(secondAgent.sent, ['{"type":"approval_pending"}']);
assert.deepEqual(viewer.sent, [], "a Dashboard viewer socket must not receive Agent signals");
assert.deepEqual(otherUser.sent, [], "another user's socket must not be signalled");
assert.deepEqual(otherDevice.sent, [], "another device must not be signalled");

const approvalsChanged = '{"type":"changed","topic":"approvals"}';
assert.deepEqual(dashboard.sent, [approvalsChanged], "open Dashboards reload approvals");
assert.deepEqual(secondTab.sent, [approvalsChanged]);
assert.deepEqual(otherDashboard.sent, [], "another person's Dashboard must not be told");

assert.equal((await signal({})).status, 400);
assert.equal((await signal({ deviceId: "device-1" }, null)).status, 401);
assert.equal(agent.sent.length, 1, "rejected signals must not reach the Agent");

// Worker-side changes reach the person's feeds by topic name only.
const notify = (body: unknown, userId: string | null = "user-1") =>
  registry.fetch(
    new Request("https://registry/live-notify", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(userId ? { "x-remote-link-user-id": userId } : {}),
      },
      body: JSON.stringify(body),
    }),
  );
const notified = await notify({ topic: "attention" });
assert.deepEqual(await notified.json(), { ok: true, delivered: 2 });
assert.deepEqual(dashboard.sent.at(-1), '{"type":"changed","topic":"attention"}');
assert.deepEqual(agent.sent.length, 1, "an Agent never receives Dashboard topics");
assert.equal((await notify({ topic: "devices; drop" })).status, 400);
assert.equal((await notify({ topic: "attention" }, null)).status, 401);
assert.equal(dashboard.sent.length, 2, "rejected notifications must not reach a tab");

// Opening a feed needs a WebSocket, a user from the Worker, and a bounded tab count.
const open = (headers: Record<string, string>) =>
  registry.fetch(new Request("https://registry/live", { headers }));
assert.equal((await open({ "x-remote-link-user-id": "user-1" })).status, 426);
assert.equal((await open({ upgrade: "websocket" })).status, 403);
crowded = true;
assert.equal(
  (await open({ upgrade: "websocket", "x-remote-link-user-id": "user-1" })).status,
  429,
  "a reconnect loop must not open unbounded feeds",
);

// A Dashboard feed only listens. Agent messages from it must do nothing; the fake
// socket has no serializeAttachment, so reaching the Agent path would throw.
registry.webSocketMessage(dashboard as never, JSON.stringify({ type: "hello", device: {} }));
registry.webSocketMessage(dashboard as never, JSON.stringify({ type: "ping" }));
assert.equal(dashboard.sent.length, 2, "a Dashboard feed must not be answered as an Agent");

console.log(
  "PASS: an approval signal reaches only the owner's Agent sockets and open Dashboards; Dashboard feeds are bounded, topic-only and cannot act as an Agent",
);
