import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import React from "react";
// @ts-expect-error Test renderer is provided by this workspace.
import { act, create } from "react-test-renderer";

class FakeSocket {
  static all: FakeSocket[] = [];
  readyState = 0;
  onopen?: () => void;
  onmessage?: (event: { data: unknown }) => void;
  onclose?: () => void;
  onerror?: () => void;
  constructor(readonly url: string) {
    FakeSocket.all.push(this);
  }
  send() {}
  close() {
    this.readyState = 3;
  }
}
const fetched: string[] = [];
const polls: number[] = [];
const realSetTimeout = globalThis.setTimeout;
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as any).WebSocket = FakeSocket;
(globalThis as any).location = new URL("https://agent.remotearc.app/overview");
(globalThis as any).document = { hidden: false, addEventListener() {}, removeEventListener() {} };
(globalThis as any).fetch = async (path: string) => {
  fetched.push(path);
  return Response.json({ attention: [] });
};
// Record the hook's next poll instead of waiting for it.
(globalThis as any).setTimeout = (callback: () => void, delay?: number) => {
  if (delay === 5000 || delay === 120_000) {
    polls.push(delay);
    return 0 as never;
  }
  return realSetTimeout(callback, delay);
};

// The production build answers this from Vite; this test runs the live build.
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.endsWith("/preview/preview-mode.js"))
      return { url: "data:text/javascript,export const UI_PREVIEW = false;", shortCircuit: true };
    return nextResolve(specifier, context);
  },
});
const { useRunnerAttention } = await import("../src/hooks/use-runner-attention.js");
hooks.deregister();
const settle = () => act(() => new Promise((resolve) => realSetTimeout(resolve, 10)));

function Probe() {
  useRunnerAttention();
  return null;
}

let tree: any;
await act(async () => {
  tree = create(<Probe />);
});
await settle();
assert.equal(fetched.length, 1, "the list loads once on open");
assert.deepEqual(polls, [5000], "without the feed it keeps the 5 second poll");
assert.equal(FakeSocket.all.length, 1);
const feed = FakeSocket.all[0]!;

await act(async () => {
  feed.readyState = 1;
  feed.onopen?.();
});
await settle();
assert.equal(fetched.length, 2, "connecting reloads once in case a change was missed");
assert.equal(polls.at(-1), 120_000, "with the feed it polls only as a slow fallback");

await act(async () => feed.onmessage?.({ data: '{"type":"changed","topic":"attention"}' }));
await settle();
assert.equal(fetched.length, 3, "an attention change reloads the list at once");
await act(async () => feed.onmessage?.({ data: '{"type":"changed","topic":"approvals"}' }));
await settle();
assert.equal(fetched.length, 3, "another topic does not reload this list");

await act(async () => {
  feed.readyState = 3;
  feed.onclose?.();
});
await settle();
assert.equal(fetched.length, 4, "a dropped feed reloads once");
assert.equal(polls.at(-1), 5000, "and the 5 second poll returns while it is down");

await act(async () => tree.unmount());
console.log(
  "PASS: browser task alerts reload on the change feed, poll every 2 minutes while it is up and every 5 seconds while it is down",
);
process.exit(0);
