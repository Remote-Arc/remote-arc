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

const ctx = {
  getWebSockets(tag: string) {
    if (tag === "device:device-1") return [agent, secondAgent, closing, viewer, otherUser];
    if (tag === "device:device-2") return [otherDevice];
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

assert.equal((await signal({})).status, 400);
assert.equal((await signal({ deviceId: "device-1" }, null)).status, 401);
assert.equal(agent.sent.length, 1, "rejected signals must not reach the Agent");

console.log(
  "PASS: an approval signal reaches only the owner's Agent sockets for that device and tolerates a closing socket",
);
