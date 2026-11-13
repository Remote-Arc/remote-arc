import assert from "node:assert/strict";

class FakeSocket {
  static all: FakeSocket[] = [];
  readyState = 0;
  sent: string[] = [];
  closed: number | null = null;
  onopen?: () => void;
  onmessage?: (event: { data: unknown }) => void;
  onclose?: () => void;
  onerror?: () => void;
  constructor(readonly url: string) {
    FakeSocket.all.push(this);
  }
  send(value: string) {
    this.sent.push(value);
  }
  close(code = 1000) {
    this.closed = code;
    this.readyState = 3;
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  drop() {
    this.readyState = 3;
    this.onclose?.();
  }
  message(data: unknown) {
    this.onmessage?.({ data });
  }
}
(globalThis as any).WebSocket = FakeSocket;
(globalThis as any).location = new URL("https://agent.remotearc.app/overview");

const { subscribeLive, onLiveStatus } = await import("../src/lib/live-updates.js");
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const calls: string[] = [];
const statuses: boolean[] = [];
const stopStatus = onLiveStatus((value) => statuses.push(value));
const stopAttention = subscribeLive("attention", () => calls.push("attention"));
const stopApprovals = subscribeLive("approvals", () => calls.push("approvals"));

assert.equal(FakeSocket.all.length, 1, "every list in a tab shares one feed");
const first = FakeSocket.all[0]!;
assert.equal(first.url, "wss://agent.remotearc.app/api/live");

// Connecting reloads every list, because changes before it were not announced.
first.open();
assert.deepEqual(calls, ["attention", "approvals"]);
assert.deepEqual(statuses, [false, true]);

calls.length = 0;
first.message('{"type":"changed","topic":"approvals"}');
assert.deepEqual(calls, ["approvals"], "only the named list reloads");
for (const ignored of ["pong", "{bad", '{"type":"other","topic":"approvals"}', 42])
  first.message(ignored);
assert.deepEqual(calls, ["approvals"], "keepalive replies and unknown messages change nothing");

// A dropped feed reloads once, reports the state, and reconnects with a delay.
calls.length = 0;
first.drop();
assert.deepEqual(calls, ["attention", "approvals"]);
assert.equal(statuses.at(-1), false);
assert.equal(FakeSocket.all.length, 1, "reconnect waits instead of looping");
await wait(1100);
assert.equal(FakeSocket.all.length, 2);
const second = FakeSocket.all[1]!;
second.open();
assert.equal(statuses.at(-1), true);

// The last list leaving closes the feed and stops reconnecting.
stopAttention();
assert.equal(second.closed, null, "a list still listening keeps the feed open");
stopApprovals();
assert.equal(second.closed, 1000);
assert.equal(statuses.at(-1), false);
second.drop();
await wait(1100);
assert.equal(FakeSocket.all.length, 2, "an unused feed must not reconnect");
stopStatus();

console.log(
  "PASS: one shared feed per tab reloads only the named list, resyncs on connect and drop, backs off and closes when unused",
);
