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

// A long site sidebar comes before the page's own controls in the document,
// as on the Cloudflare dashboard. The snapshot lists an open dialog first,
// then the page content, then navigation, and says what it left out.
{
  const placed = (tag, attrs, region) => Object.assign(new HTMLElement(tag, attrs), {
    closest(selector) {
      return region && selector.split(",").map((s) => s.trim()).includes(region) ? { closest: () => null } : null;
    },
  });
  const sidebar = Array.from({ length: 300 }, (_, i) => placed("a", { href: "/nav/" + i, text: "Nav " + i }, "nav"));
  const pageHeader = placed("button", { text: "Account menu" }, "header");
  const editButtons = [placed("button", { text: "Edit SPF" }), placed("button", { text: "Edit DKIM" })];
  const dialogButton = placed("button", { text: "Copy DKIM" }, "[role='dialog']");
  let listen = null;
  const pageContext = vm.createContext({
    ...Object.fromEntries(["console", "HTMLElement", "HTMLInputElement", "HTMLTextAreaElement", "HTMLSelectElement", "Event", "setTimeout", "clearTimeout", "Date", "Map", "Set", "Array", "String", "Number", "Boolean", "Object", "Error", "getComputedStyle", "getSelection", "location"].map((k) => [k, context[k]])),
    chrome: { runtime: { onMessage: { addListener(fn) { listen = fn; } } } },
    document: {
      body: { innerText: "DNS records" },
      querySelectorAll(selector) {
        if (selector === "h1,h2,h3") return [];
        return [pageHeader, ...sidebar, ...editButtons, dialogButton];
      },
    },
  });
  vm.runInContext(contentScript, pageContext);
  const page = await new Promise((resolve) => listen({ source: "remote-arc-browser", tool: "browser_read_page", arguments: {} }, {}, resolve));
  const names = page.interactiveElements.map((e) => e.name);
  assert.equal(page.interactiveElements.length, 250, "the element cap still holds");
  assert.deepEqual([...names.slice(0, 3)], ["Copy DKIM", "Edit SPF", "Edit DKIM"], "a dialog, then the page's own controls, come before the sidebar");
  assert.equal(page.interactiveElements[0].region, "dialog");
  assert.equal(page.interactiveElements[1].region, undefined);
  assert.equal(page.interactiveElements[3].region, "navigation");
  assert.deepEqual([...page.interactiveElements.slice(0, 4).map((e) => e.ref)], ["e1", "e2", "e3", "e4"]);
  assert.equal(page.omittedElements, 54, "the snapshot says how many controls it left out");
  assert.equal(names[3], "Account menu", "a site header is ranked with navigation, after the page content");
  assert.equal(names.includes("Nav 299"), false, "the end of the sidebar is what is left out");
  const clickEdit = await new Promise((resolve) => listen({ source: "remote-arc-browser", tool: "browser_click", arguments: { snapshot_id: page.snapshotId, ref: "e3" } }, {}, resolve));
  assert.equal(clickEdit.ok, true);
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(editButtons[1].clickCount, 1, "a ref clicks the control it was listed for");
}

const workerSource = fs.readFileSync(new URL("./service-worker.js", import.meta.url), "utf8");
assert.match(workerSource, /"browser_click"/);
assert.match(workerSource, /"browser_fill"/);
assert.match(workerSource, /permissions\?\.includes\("interact"\)/);
assert.match(workerSource, /const grants = new Map\(\)/);
assert.doesNotMatch(workerSource, /MAX_SHARED_TABS|sharedTabsLimit|grantLimit/);

const manifest = JSON.parse(fs.readFileSync(new URL("./manifest.json", import.meta.url), "utf8"));
assert.equal(manifest.version, "0.4.3");
// tabs lets Share all tabs see which sites a window's tabs are on, so Chrome
// can be asked for them in one prompt. The AI still sees only shared tabs.
assert.deepEqual(manifest.permissions.sort(), ["activeTab", "scripting", "storage", "tabGroups", "tabs"].sort());
// Sites are granted one at a time through Chrome's own prompt; nothing is
// granted up front except the Remote Arc relay.
assert.deepEqual(manifest.host_permissions, ["https://mcp.remotearc.app/*"]);
assert.deepEqual(manifest.optional_host_permissions.sort(), ["http://*/*", "https://*/*"]);
assert.equal(manifest.permissions.includes("debugger") || manifest.permissions.includes("cookies") || manifest.permissions.includes("history"), false);
assert.match(workerSource, /SUBMIT_EFFECT_REQUIRED/);
assert.match(workerSource, /SITE_NOT_ALLOWED/);

// Exercise the worker against asynchronous Chrome-like storage. Calls may
// overlap across different tabs, and storage reads return independent copies.
const disk = {};
const event = () => ({ listeners:[],addListener(listener){this.listeners.push(listener);} });
const fakeTabs = new Map();
const injected = new Set();
const badges = new Map();
const tabUpdated = event();
const deniedPatterns = new Set();
const workerContext = vm.createContext({
  console, URL, setTimeout, clearTimeout, setInterval, clearInterval,
  chrome: {
    runtime: { id:"fixture",getManifest:()=>({version:"0.4.0"}),getURL:part=>"chrome-extension://fixture/"+part,onMessage:event(),onStartup:event(),onInstalled:event() },
    storage: {
      local: { async get(){await Promise.resolve();return structuredClone(disk);},async set(values){await Promise.resolve();Object.assign(disk,structuredClone(values));} },
      session: {async get(){return{};},async set(){}},onChanged:event()
    },
    permissions: {onAdded:event(),onRemoved:event(),async contains({origins}){return !deniedPatterns.has(origins?.[0]);}},
    action: {async setBadgeText({tabId,text}){badges.set(tabId,text);},async setBadgeBackgroundColor(){}},
    scripting: {async executeScript({target}){injected.add(target.tabId);}},
    tabs: {
      onUpdated:tabUpdated,onRemoved:event(),
      async get(tabId){return fakeTabs.get(tabId)||null;},
      async query({windowId}){return [...fakeTabs.values()].filter(tab=>tab.windowId===windowId);},
      async sendMessage(tabId,message){
        if(!injected.has(tabId)) throw new Error("Could not establish connection.");
        return message.tool==="ra_ping"?{ok:true}:{text:"page text"};
      }
    }
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

// A shared tab follows its site, ends on another one, and tells the AI to ask
// the user rather than fall back to remote debugging.
const grants = vm.runInContext("grants", workerContext);
const flush = () => new Promise(resolve => setTimeout(resolve, 0));
const share = (tabId, url, permissions=["read"]) => {
  grants.set(tabId, {tabId,title:"Inbox",url,origin:new URL(url).origin,mode:"tab",permissions});
  fakeTabs.set(tabId, {id:tabId,url,title:"Inbox",status:"complete"});
};
// Chrome reports a tab's address only while the extension may access that page.
const moveTab = async (tabId, url, status="loading") => {
  const tab = {id:tabId,url,title:url?"Next":undefined,status};
  fakeTabs.set(tabId, tab);
  for (const listener of tabUpdated.listeners) listener(tabId, {status}, tab);
  await flush();
};

share(1, "https://mail.example.com/inbox", ["read","interact"]);
await moveTab(1, "https://mail.example.com/inbox");
assert.equal(grants.get(1).url, "https://mail.example.com/inbox", "a reload keeps the tab shared");
await moveTab(1, "https://mail.example.com/message/42");
assert.deepEqual({...grants.get(1)}, {tabId:1,title:"Next",url:"https://mail.example.com/message/42",origin:"https://mail.example.com",mode:"tab",permissions:["read","interact"]});
await moveTab(1, "https://mail.example.com/message/42", "complete");
assert.equal(badges.get(1), "AI+", "Chrome clears the badge on load, so it is shown again");

share(2, "https://mail.example.com/inbox");
fakeTabs.get(2).url = "https://mail.example.com/search?q=one";
assert.equal((await workerContext.resolveSharedTab(2)).grant.url, "https://mail.example.com/search?q=one", "a client-side route change is followed without a tab event");
assert.equal(grants.get(2).mode, "tab");
assert.deepEqual([...grants.get(2).permissions], ["read"], "following a page never adds permissions");

injected.delete(2);
assert.equal((await workerContext.executeTool("browser_read_page", {tab_id:2}, {})).text, "page text", "the page script returns after a full page load");
assert(injected.has(2));

share(3, "https://mail.example.com/inbox", ["read","interact"]);
await moveTab(3, "https://other.example.org/");
assert.equal(grants.has(3), false, "another site ends access");
assert.equal(badges.get(3), "", "the badge clears with it");
await moveTab(3, "https://mail.example.com/inbox");
assert.equal(grants.has(3), false, "coming back does not restore access");
await assert.rejects(workerContext.resolveSharedTab(3), /No matching shared tab[^]*Share this tab[^]*Do not switch to remote debugging/);

share(4, "https://mail.example.com/inbox");
await moveTab(4, undefined, "complete");
assert.equal(grants.has(4), false, "Chrome hid the address, so the tab is on a site Remote Arc cannot reach");

share(5, "https://mail.example.com/inbox");
fakeTabs.set(5, {id:5,title:undefined,url:undefined,status:"complete"});
await assert.rejects(workerContext.resolveSharedTab(5), /^Error: SITE_NOT_ALLOWED:[^]*Do not switch to remote debugging/);
assert.equal(grants.has(5), false);

disk.raSites = {"https://allowed.example.org":{}};
share(6, "https://mail.example.com/inbox");
await moveTab(6, "https://allowed.example.org/start");
assert.equal(grants.get(6).mode, "site", "an allowed site still takes over the tab");
assert.equal(grants.get(6).origin, "https://allowed.example.org");
assert.deepEqual([...grants.get(6).permissions], ["read","interact"]);

// Share all tabs in this window: Chrome is asked once for the sites of the
// window's web pages, then each of those tabs is shared with read and
// Click & fill and keeps access as it moves around its site.
for (const [id, url] of [[20, "https://dash.cloudflare.com/acct/dns"], [21, "https://login.sendpulse.com/settings"], [22, "chrome://extensions/"], [23, "https://blocked.example.net/"], [25, "https://dash.cloudflare.com/acct/email"]]) {
  fakeTabs.set(id, {id, url, title:"Tab " + id, status:"complete", windowId:7});
}
fakeTabs.set(26, {id:26, url:"https://elsewhere.example.com/", title:"Other window", status:"complete", windowId:8});
share(24, "https://login.sendpulse.com/domains");
fakeTabs.get(24).windowId = 7;
const targets = await workerContext.windowShareTargets(7);
assert.deepEqual([...targets.sites].sort(), ["https://blocked.example.net/*", "https://dash.cloudflare.com/*", "https://login.sendpulse.com/*"], "the popup asks Chrome once for every site in this window");
assert.equal(targets.tabs, 5, "only web pages in this window that are not already fully shared are counted");
deniedPatterns.add("https://blocked.example.net/*");
const sharedAll = await workerContext.shareWindowTabs(7);
assert.equal(sharedAll.shared, 4);
assert.deepEqual([...sharedAll.skipped], ["https://blocked.example.net"], "a site Chrome did not allow is left out and reported");
for (const id of [20, 21, 24, 25]) {
  assert.equal(grants.get(id).mode, "site");
  assert.deepEqual([...grants.get(id).permissions], ["read", "interact"]);
  assert.equal(badges.get(id), "AI+");
}
assert.equal(grants.has(22), false, "browser pages are never shared");
assert.equal(grants.has(23), false);
assert.equal(grants.has(26), false, "tabs in other windows are left alone");
assert.ok(disk.raSites["https://dash.cloudflare.com"] && disk.raSites["https://login.sendpulse.com"], "the sites appear under Allowed sites, where the user can remove them");
fakeTabs.get(20).url = "https://dash.cloudflare.com/acct/dns/records";
assert.equal((await workerContext.resolveSharedTab(20)).grant.url, "https://dash.cloudflare.com/acct/dns/records");
assert.equal((await workerContext.windowShareTargets(7)).tabs, 1, "once shared, only the blocked tab is left");

process.stdout.write("Remote Arc browser capability, concurrent submit, durable ledger, shared tab navigation, snapshot order and share-all tests passed\n");
