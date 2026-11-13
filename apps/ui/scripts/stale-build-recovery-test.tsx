import assert from "node:assert/strict";
import React from "react";
// @ts-expect-error Test renderer is provided by this workspace.
import { act, create } from "react-test-renderer";
import { loadLocale } from "../src/locales/locale-catalog.js";
import { I18nProvider } from "../src/app/i18n.js";
import { AppErrorBoundary } from "../src/app/app-error-boundary.js";
import {
  claimStaleBuildReload,
  installStaleBuildRecovery,
  isStaleBuildError,
} from "../src/lib/stale-build-recovery.js";

class MemoryStore {
  values = new Map<string, string>();
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

// The loop guard: one reload per 30 seconds, never when storage is unavailable.
const store = new MemoryStore();
assert.equal(claimStaleBuildReload(store, 1_000_000), true, "First failure may reload");
assert.equal(claimStaleBuildReload(store, 1_010_000), false, "A failure right after reload waits");
assert.equal(claimStaleBuildReload(store, 1_031_000), true, "A later deploy may reload again");
assert.equal(claimStaleBuildReload(null), false, "No storage, no automatic reload");
assert.equal(
  claimStaleBuildReload({
    getItem: () => {
      throw Error("blocked");
    },
    setItem: () => undefined,
  }),
  false,
  "Blocked storage never reloads in a loop",
);

// Browser messages for a chunk from another build, and nothing else.
for (const message of [
  "Failed to fetch dynamically imported module: https://agent.remotearc.app/assets/stripe-embedded-OLD.js",
  "error loading dynamically imported module",
  "Importing a module script failed.",
  "Unable to preload CSS for /assets/arc-OLD.css",
  "'text/html' is not a valid JavaScript MIME type.",
])
  assert.equal(isStaleBuildError(new TypeError(message)), true, message);
assert.equal(isStaleBuildError(new TypeError("Cannot read properties of undefined")), false);
assert.equal(isStaleBuildError(undefined), false);

// Browser globals the boundary and the preload listener use.
let reloads = 0;
const listeners = new Map<string, (event: Event) => void>();
const session = new MemoryStore();
const fakeWindow = {
  location: {
    reload: () => void reloads++,
    pathname: "/settings",
    hostname: "agent.remotearc.app",
  },
  sessionStorage: session,
  addEventListener: (name: string, listener: (event: Event) => void) =>
    listeners.set(name, listener),
};
const original = {
  window: (globalThis as any).window,
  location: (globalThis as any).location,
  document: (globalThis as any).document,
};
(globalThis as any).document = { documentElement: { lang: "" } };
(globalThis as any).window = fakeWindow;
(globalThis as any).location = fakeWindow.location;
const silence = console.error;
console.error = () => undefined;

function Throws({ error }: { error: Error }): React.ReactNode {
  throw error;
}
async function render(error: Error) {
  let root: any;
  await act(async () => {
    root = create(
      <I18nProvider initialLanguage="en">
        <AppErrorBoundary>
          <Throws error={error} />
        </AppErrorBoundary>
      </I18nProvider>,
    );
  });
  return root;
}

try {
  await loadLocale("en", "dashboard");

  // A lazy chunk from the previous build: reload once, and show the prompt meanwhile.
  const stale = await render(new TypeError("Failed to fetch dynamically imported module: x"));
  assert.equal(reloads, 1, "A stale chunk reloads the page once");
  const staleText = JSON.stringify(stale.toJSON());
  assert.match(staleText, /This page needs a refresh/, "Never an empty page");
  await act(async () => stale.unmount());

  // The same failure again within the window: no reload loop, the prompt stays.
  const again = await render(new TypeError("Failed to fetch dynamically imported module: x"));
  assert.equal(reloads, 1, "No second automatic reload inside the window");
  assert.match(JSON.stringify(again.toJSON()), /Reload page/);
  await act(async () => again.root.findByType("button").props.onClick());
  assert.equal(reloads, 2, "The person can still reload by hand");
  await act(async () => again.unmount());

  // An ordinary render error: no automatic reload, the prompt explains what to do.
  session.values.clear();
  const broken = await render(new TypeError("Cannot read properties of undefined"));
  assert.equal(reloads, 2, "Only stale-build errors reload automatically");
  assert.match(JSON.stringify(broken.toJSON()), /This page needs a refresh/);
  await act(async () => broken.unmount());

  // vite:preloadError: cancel Vite's rethrow only while a reload is happening.
  installStaleBuildRecovery(fakeWindow as unknown as Window);
  const preload = listeners.get("vite:preloadError")!;
  assert(preload, "The preload listener is installed");
  session.values.clear();
  let cancelled = 0;
  preload({ preventDefault: () => void cancelled++ } as unknown as Event);
  assert.equal(reloads, 3, "A failed chunk preload reloads once");
  assert.equal(cancelled, 1, "Vite does not rethrow while the page reloads");
  preload({ preventDefault: () => void cancelled++ } as unknown as Event);
  assert.equal(reloads, 3, "A repeated preload failure does not loop");
  assert.equal(cancelled, 1, "The repeated failure reaches the error boundary");
} finally {
  console.error = silence;
  (globalThis as any).window = original.window;
  (globalThis as any).location = original.location;
  (globalThis as any).document = original.document;
}

console.log(
  "PASS: a page from an old build reloads once when a lazy chunk fails, never loops, and any render error shows a reload prompt instead of a blank page",
);
