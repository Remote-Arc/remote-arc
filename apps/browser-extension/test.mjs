import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

class HTMLElement {
  constructor(tagName, attrs = {}) {
    this.tagName = tagName.toUpperCase();
    this.attrs = { ...attrs };
    this.disabled = false;
    this.isConnected = true;
    this.isContentEditable = false;
    this.innerText = attrs.text || "";
    this.textContent = attrs.text || "";
    this.events = [];
    this.clickCount = 0;
  }
  getAttribute(name) {
    return this.attrs[name] ?? null;
  }
  getBoundingClientRect() {
    return { width: 120, height: 24 };
  }
  focus() {
    this.focused = true;
  }
  click() {
    this.clickCount += 1;
  }
  dispatchEvent(event) {
    this.events.push(event.type);
    return true;
  }
}

class HTMLInputElement extends HTMLElement {
  constructor(attrs = {}) {
    super("input", attrs);
    this.type = attrs.type || "text";
    this.autocomplete = attrs.autocomplete || "";
    this._value = "";
  }
  get value() {
    return this._value;
  }
  set value(value) {
    this._value = String(value);
  }
}

class HTMLTextAreaElement extends HTMLElement {
  constructor(attrs = {}) {
    super("textarea", attrs);
    this._value = "";
  }
  get value() {
    return this._value;
  }
  set value(value) {
    this._value = String(value);
  }
}

class HTMLSelectElement extends HTMLElement {
  constructor(attrs = {}) {
    super("select", attrs);
    this.options = [];
    this._value = "";
  }
  get value() {
    return this._value;
  }
  set value(value) {
    this._value = String(value);
  }
}

class Event {
  constructor(type, options = {}) {
    this.type = type;
    this.bubbles = Boolean(options.bubbles);
    this.composed = Boolean(options.composed);
  }
}

const textInput = new HTMLInputElement({ placeholder: "Email" });
const passwordInput = new HTMLInputElement({ type: "password", placeholder: "Password" });
const button = new HTMLElement("button", { text: "Continue" });

const document = {
  body: { innerText: "Example page" },
  querySelectorAll(selector) {
    if (selector === "h1,h2,h3") return [];
    if (selector === "a[href]") return [];
    if (selector === "table") return [];
    return [textInput, passwordInput, button];
  },
};

let listener = null;
const chrome = {
  runtime: {
    onMessage: {
      addListener(fn) {
        listener = fn;
      },
    },
  },
};

const context = vm.createContext({
  console,
  chrome,
  document,
  location: { href: "https://example.com/form", origin: "https://example.com" },
  getComputedStyle: () => ({ visibility: "visible", display: "block" }),
  getSelection: () => ({ toString: () => "selected" }),
  HTMLElement,
  HTMLInputElement,
  HTMLTextAreaElement,
  HTMLSelectElement,
  Event,
  setTimeout,
  clearTimeout,
  Date,
  Map,
  Set,
  Array,
  String,
  Number,
  Boolean,
  Object,
  Error,
});

const contentScript = fs.readFileSync(new URL("./content-script.js", import.meta.url), "utf8");
vm.runInContext(contentScript, context, { filename: "content-script.js" });
assert.equal(typeof listener, "function", "content script should register a message listener");

const call = (tool, args = {}) =>
  new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };
    listener(
      { source: "remote-arc-browser", tool, arguments: args },
      {},
      finish,
    );
    setTimeout(() => finish(undefined), 20);
  });

const snapshot = await call("browser_read_page");
assert.match(snapshot.snapshotId, /^s/);
assert.equal(snapshot.interactiveElements.length, 3);
assert.equal(
  JSON.stringify(snapshot.interactiveElements.map(({ ref, canFill, sensitive }) => ({ ref, canFill, sensitive }))),
  JSON.stringify([
    { ref: "e1", canFill: true, sensitive: false },
    { ref: "e2", canFill: false, sensitive: true },
    { ref: "e3", canFill: false, sensitive: false },
  ]),
);

const fill = await call("browser_fill", {
  snapshot_id: snapshot.snapshotId,
  ref: "e1",
  value: "sam@example.com",
});
assert.equal(fill.ok, true);
assert.equal(textInput.value, "sam@example.com");
assert.deepEqual(textInput.events, ["input", "change"]);

const sensitiveFill = await call("browser_fill", {
  snapshot_id: snapshot.snapshotId,
  ref: "e2",
  value: "secret",
});
assert.match(sensitiveFill.error, /blocks filling password/);
assert.equal(passwordInput.value, "");

const click = await call("browser_click", {
  snapshot_id: snapshot.snapshotId,
  ref: "e3",
});
assert.equal(click.ok, true);
await new Promise((resolve) => setTimeout(resolve, 5));
assert.equal(button.clickCount, 1);

const staleClick = await call("browser_click", {
  snapshot_id: snapshot.snapshotId,
  ref: "e3",
});
assert.match(staleClick.error, /Snapshot is stale/);

const workerSource = fs.readFileSync(new URL("./service-worker.js", import.meta.url), "utf8");
assert.match(workerSource, /"browser_click"/);
assert.match(workerSource, /"browser_fill"/);
assert.match(workerSource, /permissions\?\.includes\("interact"\)/);
assert.match(workerSource, /const grants = new Map\(\)/);
assert.doesNotMatch(workerSource, /MAX_SHARED_TABS|sharedTabsLimit|grantLimit/);

const manifest = JSON.parse(fs.readFileSync(new URL("./manifest.json", import.meta.url), "utf8"));
assert.equal(manifest.version, "0.4.0");
assert.deepEqual(manifest.permissions.sort(), ["activeTab", "scripting", "storage"].sort());
assert.equal(manifest.host_permissions.includes("<all_urls>"), false);
assert.deepEqual(manifest.optional_host_permissions.sort(), ["http://*/*", "https://*/*"].sort());
assert.match(workerSource, /"enable-share-all"/);
assert.match(workerSource, /"disable-share-all"/);
assert.match(workerSource, /chrome\.storage\.session/);
assert.match(workerSource, /permissions: \["read", "interact"\]/);

// Exercise the actual extension worker with mocked Chrome session/tab APIs.
const pages = new Map([
  [11, { id: 11, url: "https://github.com/organizations/Remote-Arc/settings/applications", title: "GitHub Apps", status: "complete", active: true }],
  [12, { id: 12, url: "https://example.org/docs", title: "Docs", status: "complete" }],
  [13, { id: 13, url: "https://accounts.google.com/signin", title: "Google Login", status: "complete" }],
  [14, { id: 14, url: "chrome://extensions", title: "Extensions", status: "complete" }],
  [15, { id: 15, url: "https://store.example/checkout", title: "Checkout", status: "complete" }],
  [18, { id: 18, url: "https://example.org/incognito", incognito: true, title: "Private", status: "complete" }],
]);
const listeners = {};
const injectedTabs = [];
const badgeTexts = new Map();
const sessionState = {};
let permissionAllowed = true;
const chromeWorker = {
  runtime: {
    onMessage: { addListener(fn) { listeners.message = fn; } },
    onStartup: { addListener() {} },
    onInstalled: { addListener() {} },
  },
  storage: {
    local: { async get() { return { deviceId: "unit-device", deviceToken: "unit-token" }; },
      async set() {}, async remove() {} },
    session: {
      async get() { return structuredClone(sessionState); },
      async set(state) { Object.assign(sessionState, structuredClone(state)); },
    },
  },
  permissions: { async contains() { return permissionAllowed; }, onRemoved: { addListener(fn) { listeners.permissionRemoved = fn; } } },
  tabs: {
    async get(id) { const tab = pages.get(id); if (!tab) throw new Error("Tab gone"); return tab; },
    async query(filter) {
      return [...pages.values()].filter(tab => !filter?.active || tab.active === true);
    },
    async sendMessage() { return { ok: true }; },
    onUpdated: { addListener(fn) { listeners.updated = fn; } },
    onCreated: { addListener(fn) { listeners.created = fn; } },
    onRemoved: { addListener(fn) { listeners.removed = fn; } },
  },
  scripting: { async executeScript({ target }) { injectedTabs.push(target.tabId); } },
  action: {
    async setBadgeText({ tabId, text }) { badgeTexts.set(tabId, text); },
    async setBadgeBackgroundColor() {},
  },
};
const workerContext = vm.createContext({
  chrome: chromeWorker, URL, WebSocket: class { static OPEN = 1; static CONNECTING = 0; },
  setTimeout, clearTimeout, setInterval, clearInterval, Date, Map, Set,
  Promise, console, Error, Number, Boolean, Object, Array,
});
vm.runInContext(workerSource, workerContext, { filename: "service-worker.js" });
const workerCall = (type, payload = {}) => new Promise(resolve =>
  listeners.message({ type, ...payload }, {}, resolve));
const tick = () => new Promise(resolve => setTimeout(resolve, 15));

assert.equal((await workerCall("browser-state")).shareAllMode, false);
let state = await workerCall("enable-share-all");
assert.equal(state.ok, true);
assert.equal(state.shared, 2);
assert.equal(state.skipped, 4);
assert.equal((await workerCall("browser-state")).shareAllMode, true);
let active = await workerCall("browser-state");
assert.equal(active.grants.length, 2);
assert(active.grants.every(g => g.permissions.includes("interact")));
assert(!active.grants.some(g => [13,14,15,18].includes(g.tabId)));
assert.equal(badgeTexts.get(11), "AI+");

pages.set(16, { id: 16, url: "https://example.net", title: "New tab", status: "complete" });
listeners.created(pages.get(16));
await tick();
assert((await workerCall("browser-state")).grants.some(g => g.tabId === 16));

// Navigating an existing shared tab invalidates its grant, then re-shares the new eligible URL.
const navigated = { ...pages.get(12), url: "https://example.org/new", status: "loading" };
pages.set(12, navigated);
listeners.updated(12, { status: "loading", url: navigated.url }, navigated);
await tick();
assert(!(await workerCall("browser-state")).grants.some(g => g.tabId === 12));
pages.set(12, { ...navigated, status: "complete" });
listeners.updated(12, { status: "complete" }, pages.get(12));
await tick();
assert((await workerCall("browser-state")).grants.some(g => g.tabId === 12 && g.url.endsWith("/new")));

// Excluding one tab holds across navigation while Share all remains active.
await workerCall("revoke-tab-id", { tabId: 11 });
listeners.updated(11, { status: "complete" }, pages.get(11));
await tick();
assert(!(await workerCall("browser-state")).grants.some(g => g.tabId === 11));

// Share mode lives in Chrome's browser-session storage, not the persistent token store.
assert.equal(sessionState.shareAllMode, true);
assert(sessionState.excludedTabs.includes(11));
await workerCall("disable-share-all");
assert.equal((await workerCall("browser-state")).grants.length, 0);
assert.equal(sessionState.shareAllMode, false);
pages.set(17, { id: 17, url: "https://example.com", status: "complete" });
listeners.created(pages.get(17));
await tick();
assert.equal((await workerCall("browser-state")).grants.length, 0);

// A revoked Chrome wide-site permission blocks enabling the session.
permissionAllowed = false;
const denied = await workerCall("enable-share-all");
assert.match(denied.error, /Chrome access to all websites/);
assert.equal((await workerCall("browser-state")).shareAllMode, false);

// If Chrome revokes optional host permissions outside the popup, stop sharing.
permissionAllowed = true;
await workerCall("enable-share-all");
permissionAllowed = false;
listeners.permissionRemoved({ origins: ["http://*/*", "https://*/*"] });
await tick();
assert.equal((await workerCall("browser-state")).shareAllMode, false);
assert.equal((await workerCall("browser-state")).grants.length, 0);

process.stdout.write("Remote Arc browser capability tests passed\n");
