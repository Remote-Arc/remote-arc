import assert from "node:assert/strict";
import React, { act } from "react";
import { create } from "react-test-renderer";
import { renderToString } from "react-dom/server";
import { useMarketingPlayback } from "../src/features/marketing/home/use-marketing-playback.ts";

// Render the actual hook. Browser events and time are deterministic, so the
// lifecycle checks do not depend on elapsed wall time or implementation text.
const originalGlobals = new Map(["window", "document", "IntersectionObserver", "IS_REACT_ACT_ENVIRONMENT"].map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let current;
function Harness({ intervalMs } = {}) {
  current = useMarketingPlayback(4, intervalMs);
  return React.createElement("div", { ref: current.ref });
}

function browserEnvironment({ reduced = false, hidden = false, observer = true } = {}) {
  let time = 0;
  let nextId = 0;
  const timers = new Map();
  const mediaListeners = new Set();
  const visibilityListeners = new Set();
  const observers = [];
  const node = { name: "marketing-demo" };
  const media = {
    matches: reduced,
    addEventListener(type, listener) { assert.equal(type, "change"); mediaListeners.add(listener); },
    removeEventListener(type, listener) { assert.equal(type, "change"); mediaListeners.delete(listener); },
  };
  const document = {
    visibilityState: hidden ? "hidden" : "visible",
    addEventListener(type, listener) { assert.equal(type, "visibilitychange"); visibilityListeners.add(listener); },
    removeEventListener(type, listener) { assert.equal(type, "visibilitychange"); visibilityListeners.delete(listener); },
  };
  globalThis.window = {
    matchMedia(query) { assert.equal(query, "(prefers-reduced-motion: reduce)"); return media; },
    setTimeout(callback, delay) { const id = ++nextId; timers.set(id, { callback, at: time + delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
  };
  globalThis.document = document;
  if (observer) {
    globalThis.IntersectionObserver = class {
      constructor(callback) { this.callback = callback; this.disconnected = false; observers.push(this); }
      observe(element) { this.element = element; }
      disconnect() { this.disconnected = true; }
    };
  } else {
    delete globalThis.IntersectionObserver;
  }
  return {
    node, timers, observers, mediaListeners, visibilityListeners,
    nextDelay() { return Math.min(...[...timers.values()].map(timer => timer.at - time)); },
    tick(milliseconds) {
      const target = time + milliseconds;
      const due = [...timers.entries()].filter(([, timer]) => timer.at <= target).sort((left, right) => left[1].at - right[1].at);
      for (const [id, timer] of due) { if (timers.delete(id)) { time = timer.at; timer.callback(); } }
      time = target;
    },
    intersect(visible) { for (const instance of observers) if (!instance.disconnected) instance.callback([{ isIntersecting: visible }]); },
    setHidden(value) { document.visibilityState = value ? "hidden" : "visible"; for (const listener of visibilityListeners) listener(); },
    setReduced(value) { media.matches = value; for (const listener of mediaListeners) listener(); },
  };
}

async function mount(environment, intervalMs) {
  let renderer;
  await act(() => { renderer = create(React.createElement(Harness, { intervalMs }), { createNodeMock: () => environment.node }); });
  return renderer;
}
async function change(callback) { await act(callback); }
function assertStopped(environment) {
  assert.equal(current.running, false);
  assert.equal(environment.timers.size, 0, "A stopped demo must not retain a scheduled frame");
}

let renderer;
try {
  const browser = browserEnvironment();
  renderer = await mount(browser, 1000);
  assert.equal(current.step, 0);
  assert.equal(current.playing, true);
  assert.equal(current.ref.current, browser.node);
  assert.equal(browser.observers[0].element, browser.node);
  assertStopped(browser);

  await change(() => browser.intersect(true));
  assert.equal(current.running, true);
  assert.equal(browser.nextDelay(), 1000);
  for (const expected of [1, 2, 3]) {
    await change(() => browser.tick(1000));
    assert.equal(current.step, expected, "Playback should advance one story beat");
  }
  assert.equal(browser.nextDelay(), 1700, "Leave the result visible longer than intermediate steps");
  await change(() => browser.tick(1699));
  assert.equal(current.step, 3);
  await change(() => browser.tick(1));
  assert.equal(current.step, 0, "Replay returns to the beginning");

  await change(() => current.setPlaying(false));
  assertStopped(browser);
  await change(() => browser.tick(5000));
  assert.equal(current.step, 0, "User pause must keep the chosen step");
  await change(() => { current.setStep(2); current.setPlaying(true); });
  assert.equal(current.step, 2);
  assert.equal(current.running, true);

  await change(() => browser.intersect(false));
  assertStopped(browser);
  await change(() => browser.tick(5000));
  assert.equal(current.step, 2, "An offscreen demo must not advance");
  await change(() => browser.intersect(true));
  assert.equal(current.running, true);
  await change(() => browser.setHidden(true));
  assertStopped(browser);
  await change(() => browser.tick(5000));
  assert.equal(current.step, 2, "A hidden tab must not advance");
  await change(() => browser.setHidden(false));
  assert.equal(current.running, true);
  assert.equal(browser.timers.size, 1, "Resuming creates a single clock");

  await change(() => browser.setReduced(true));
  assert.equal(current.reducedMotion, true);
  assert.equal(current.step, 3, "Reduced motion presents the final readable result");
  assert.equal(current.playing, false);
  assertStopped(browser);
  await change(() => current.setStep(1));
  assert.equal(current.step, 1, "Manual step selection remains available without motion");
  assertStopped(browser);
  await change(() => browser.setReduced(false));
  assert.equal(current.reducedMotion, false);
  assertStopped(browser);
  await change(() => current.setPlaying(true));
  assert.equal(current.running, true);

  await act(() => renderer.unmount());
  renderer = null;
  assert.equal(browser.timers.size, 0, "Unmount clears the pending clock");
  assert.equal(browser.mediaListeners.size, 0, "Unmount removes the motion preference listener");
  assert.equal(browser.visibilityListeners.size, 0, "Unmount removes the page visibility listener");
  assert.equal(browser.observers[0].disconnected, true, "Unmount disconnects the viewport observer");

  const reduced = browserEnvironment({ reduced: true });
  renderer = await mount(reduced);
  assert.equal(current.step, 3);
  assert.equal(current.playing, false);
  assertStopped(reduced);
  await change(() => reduced.intersect(true));
  assertStopped(reduced);
  await act(() => renderer.unmount());
  renderer = null;

  const fallback = browserEnvironment({ observer: false, hidden: true });
  renderer = await mount(fallback);
  assertStopped(fallback);
  await change(() => fallback.setHidden(false));
  assert.equal(current.running, true, "Browsers without IntersectionObserver can still play");
  assert.equal(fallback.nextDelay(), 2400, "The default playback interval stays consistent");
  await change(() => fallback.tick(2400));
  assert.equal(current.step, 1);
  await act(() => renderer.unmount());
  renderer = null;
  assert.equal(fallback.timers.size, 0);
  assert.equal(fallback.mediaListeners.size, 0);
  assert.equal(fallback.visibilityListeners.size, 0);

  delete globalThis.window;
  delete globalThis.document;
  delete globalThis.IntersectionObserver;
  assert.equal(renderToString(React.createElement(Harness)), "<div></div>");
  assert.equal(current.step, 0, "Server rendering has a stable initial state");
  assert.equal(current.reducedMotion, false);
  console.log("PASS: real React marketing playback lifecycle, result timing, pause, visibility, reduced motion, observer fallback and cleanup");
} finally {
  if (renderer) await act(() => renderer.unmount());
  for (const [name, descriptor] of originalGlobals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete globalThis[name];
  }
}
