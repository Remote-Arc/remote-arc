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
assert.equal(manifest.version, "0.4.1");
assert.deepEqual(manifest.permissions.sort(), ["activeTab", "scripting", "storage", "tabGroups"].sort());
// Sites are granted one at a time through Chrome's own prompt; nothing is
// granted up front except the Remote Arc relay.
assert.deepEqual(manifest.host_permissions, ["https://mcp.remotearc.app/*"]);
assert.deepEqual(manifest.optional_host_permissions.sort(), ["http://*/*", "https://*/*"]);
assert.equal(manifest.permissions.includes("tabs") || manifest.permissions.includes("debugger") || manifest.permissions.includes("cookies"), false);
assert.match(workerSource, /SUBMIT_EFFECT_REQUIRED/);
assert.match(workerSource, /SITE_NOT_ALLOWED/);

// Exercise the worker against asynchronous Chrome-like storage. Calls may
// overlap across different tabs, and storage reads return independent copies.
const disk = {};
const event = () => ({ addListener() {} });
const workerContext = vm.createContext({
  console, URL, setTimeout, clearTimeout, setInterval, clearInterval,
  chrome: {
    runtime: { id:"fixture",getManifest:()=>({version:"0.4.0"}),getURL:part=>"chrome-extension://fixture/"+part,onMessage:event(),onStartup:event(),onInstalled:event() },
    storage: {
      local: { async get(){await Promise.resolve();return structuredClone(disk);},async set(values){await Promise.resolve();Object.assign(disk,structuredClone(values));} },
      session: {async get(){return{};},async set(){}},onChanged:event()
    },
    permissions: {onAdded:event(),onRemoved:event()},
    tabs: {onUpdated:event(),onRemoved:event()}
  }
});
vm.runInContext(workerSource, workerContext);
const tabForSubmit={url:"https://example.com/shop"},effect={kind:"final",target:"order-form",label:"Place order"};
const submitArgs=key=>({effect:"submit",idempotency_key:key});
const parallel=await Promise.allSettled([
  workerContext.guardFinal(submitArgs("one-key"),effect,tabForSubmit),
  workerContext.guardFinal(submitArgs("one-key"),effect,tabForSubmit)
]);
assert.equal(parallel.filter(result=>result.status==="fulfilled").length,1);
assert.match(parallel.find(result=>result.status==="rejected").reason.message,/SUBMIT_KEY_USED/);
await workerContext.confirmSubmit({idempotency_key:"one-key",outcome:"succeeded"});
const sameTarget=await Promise.allSettled([
  workerContext.guardFinal(submitArgs("target-a"),effect,tabForSubmit),
  workerContext.guardFinal(submitArgs("target-b"),effect,tabForSubmit)
]);
assert.equal(sameTarget.filter(result=>result.status==="fulfilled").length,1);
assert.match(sameTarget.find(result=>result.status==="rejected").reason.message,/SUBMIT_ALREADY_RECORDED/);
const unrelated=await Promise.all([
  workerContext.guardFinal(submitArgs("independent-a"),{...effect,target:"form-a"},tabForSubmit),
  workerContext.guardFinal(submitArgs("independent-b"),{...effect,target:"form-b"},tabForSubmit)
]);
assert.equal(unrelated.length,2);
assert(disk.raSubmits["independent-a"]&&disk.raSubmits["independent-b"],"independent reservations do not overwrite one another");
const old=Date.now()-8*24*3600*1000;
await workerContext.saveLedger({
  settled:{at:old,status:"succeeded",target:"old-form",url:tabForSubmit.url},
  unresolved:{at:old,status:"unverified",target:"old-pending",origin:"https://example.com"}
});
assert.deepEqual(disk.raSubmits.settled,{at:old,status:"succeeded"});
assert.equal(disk.raSubmits.unresolved.target,"old-pending");
await assert.rejects(workerContext.guardFinal(submitArgs("settled"),effect,tabForSubmit),/SUBMIT_KEY_USED/);
await assert.rejects(workerContext.guardFinal(submitArgs("new-old-target"),{...effect,target:"old-pending"},tabForSubmit),/SUBMIT_ALREADY_RECORDED/);

process.stdout.write("Remote Arc browser capability, concurrent submit and durable ledger tests passed\n");
