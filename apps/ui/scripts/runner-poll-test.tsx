import assert from "node:assert/strict";
import React from "react";
// @ts-expect-error Test renderer is provided by this workspace.
import { act, create } from "react-test-renderer";
import { useRunnerPoll } from "../src/hooks/use-runner-poll.js";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const original = {
  setTimeout: globalThis.setTimeout,
  clearTimeout: globalThis.clearTimeout,
  document: globalThis.document,
};
const timers = new Map<number, { callback: () => void; delay: number }>();
const listeners = new Set<() => void>();
const document = {
  hidden: false,
  addEventListener: (_: string, callback: () => void) => listeners.add(callback),
  removeEventListener: (_: string, callback: () => void) => listeners.delete(callback),
};
let timerId = 1000;
(globalThis as any).document = document;
(globalThis as any).setTimeout = (callback: () => void, delay: number) => {
  if (delay >= 10_000 && delay <= 60_000) {
    timers.set(++timerId, { callback, delay });
    return timerId;
  }
  return original.setTimeout(callback, delay);
};
(globalThis as any).clearTimeout = (id: number) => {
  if (!timers.delete(id)) original.clearTimeout(id);
};
const calls: {
  signal: AbortSignal;
  resolve: (value?: void) => void;
  reject: (error: Error) => void;
}[] = [];
const load = (signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => calls.push({ signal, resolve, reject }));
function Probe({ task = "one", enabled = true }: { task?: string; enabled?: boolean }) {
  useRunnerPoll(load, task, enabled);
  return null;
}
const next = async (delay: number) => {
  assert.equal(timers.size, 1, "Only one poll may be scheduled");
  const [id, timer] = [...timers][0]!;
  assert.equal(timer.delay, delay);
  timers.delete(id);
  await act(async () => {
    timer.callback();
  });
  assert.equal(timers.size, 0, "An in-flight request cannot overlap another poll");
};
const visibility = async (hidden: boolean) => {
  document.hidden = hidden;
  await act(async () => listeners.forEach((listener) => listener()));
};
let tree: any;
try {
  await act(async () => {
    tree = create(<Probe />);
  });
  assert.equal(calls.length, 1, "Poll immediately when the task opens");
  for (const delay of [20_000, 40_000, 60_000, 60_000]) {
    await act(async () => calls.at(-1)!.reject(Error("DEVICE_UNAVAILABLE")));
    await next(delay);
  }
  await act(async () => calls.at(-1)!.resolve());
  await next(10_000);

  const interrupted = calls.at(-1)!;
  await visibility(true);
  assert(interrupted.signal.aborted, "Hiding the page aborts the current request");
  assert.equal(timers.size, 0);
  const beforeResume = calls.length;
  await visibility(false);
  assert.equal(calls.length, beforeResume + 1, "Returning to the page checks recovery immediately");
  await act(async () => interrupted.resolve());
  assert.equal(
    timers.size,
    0,
    "A late reply from the hidden page cannot end or reschedule the new poll",
  );
  await act(async () => calls.at(-1)!.resolve());
  await next(10_000);

  const replaced = calls.at(-1)!;
  await act(async () => tree.update(<Probe task="two" />));
  assert(replaced.signal.aborted, "Changing task cancels the old task request");
  await act(async () => replaced.resolve());
  assert.equal(timers.size, 0);
  await act(async () => calls.at(-1)!.resolve());
  assert.equal(timers.size, 1);
  await act(async () => tree.update(<Probe task="two" enabled={false} />));
  assert.equal(timers.size, 0, "Collapsed/preview views do not keep polling");
  const disabledCalls = calls.length;
  await visibility(true);
  await visibility(false);
  assert.equal(calls.length, disabledCalls);

  await act(async () => tree.update(<Probe task="three" />));
  const unmounted = calls.at(-1)!;
  await act(async () => tree.unmount());
  assert(unmounted.signal.aborted);
  await act(async () => unmounted.resolve());
  assert.equal(timers.size, 0);
  assert.equal(listeners.size, 0);
  console.log(
    "PASS: Runner polls back off, recover, pause when hidden, reject stale completions and cancel on unmount",
  );
} finally {
  globalThis.setTimeout = original.setTimeout;
  globalThis.clearTimeout = original.clearTimeout;
  (globalThis as any).document = original.document;
}
