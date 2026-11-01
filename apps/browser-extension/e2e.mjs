// End-to-end test of the Chrome extension in a real Chromium: a stand-in
// Relay talks to it over WebSocket the way the real one does, and it works
// on local test sites. Run: node apps/browser-extension/e2e.mjs
// Needs Playwright's Chromium (or REMOTEARC_E2E_CHROME=/path/to/chrome).
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const here = path.dirname(fileURLToPath(import.meta.url));

// ---- test sites --------------------------------------------------------------
const orders = [];
const comments = [];
const page = (title, body) => `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head><body>${body}</body></html>`;
const site = http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  const send = (html) => {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(html);
  };
  if (req.method === "POST") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      if (url.pathname === "/api/order") orders.push(JSON.parse(body));
      if (url.pathname === "/api/comment") comments.push(JSON.parse(body));
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ n: url.pathname === "/api/order" ? orders.length : comments.length }));
    });
    return;
  }
  if (url.pathname === "/shop") {
    return send(page("Cinema", `<h1>Avengers tickets</h1>
<label>Tickets <select id="qty"><option value="1">1</option><option value="2">2</option><option value="3">3</option></select></label>
<label><input type="checkbox" id="snacks"> Add popcorn</label>
<button id="order">Place order</button><p id="done"></p>
<script>document.getElementById("order").onclick = async () => {
  const r = await fetch("/api/order", {method: "POST", body: JSON.stringify({qty: document.getElementById("qty").value, snacks: document.getElementById("snacks").checked})});
  const j = await r.json(); document.getElementById("done").textContent = "Order confirmed #" + j.n;
};</script>`));
  }
  if (url.pathname === "/comment") {
    return send(page("Video", `<h1>Trailer</h1><div id="box" contenteditable="true" aria-label="Add a comment" style="min-height:40px;border:1px solid #999"></div>
<button id="post">发布</button><ul id="list"></ul>
<script>
let draft = "";
document.getElementById("box").addEventListener("input", (e) => { draft = e.target.textContent; });
document.getElementById("post").onclick = async () => {
  await fetch("/api/comment", {method: "POST", body: JSON.stringify({text: draft})});
  const li = document.createElement("li"); li.textContent = draft; document.getElementById("list").appendChild(li);
};</script>`));
  }
  if (url.pathname === "/form") {
    return send(page("Apply", `<h1>Your details</h1><form action="/form2" method="get">
<label for="n">Full name</label><input id="n" name="name">
<label>Email <input name="email" type="email"></label>
<label>Code <input name="otp" autocomplete="one-time-code"></label>
<label>Password <input name="pw" type="password"></label>
<button type="submit">Next</button></form>
<form action="/search" method="get"><label>Search <input name="q"></label></form>`));
  }
  if (url.pathname === "/form2") return send(page("Apply 2", `<h1>Step 2</h1><p>Hello ${url.searchParams.get("name") || ""}</p>`));
  if (url.pathname === "/search") return send(page("Search", `<h1>Results for ${url.searchParams.get("q") || ""}</h1>`));
  if (url.pathname === "/token") return send(page("API token", `<h1>New API token</h1><label>Token <input type="password" id="token" autocomplete="off"></label>`));
  if (url.pathname === "/dash") {
    const links = Array.from({ length: 300 }, (_, i) => `<li><a href="/dash?n=${i}">Section ${i}</a></li>`).join("");
    return send(page("Dashboard", `<nav><ul>${links}</ul></nav><main><h1>DNS records</h1><button>Edit SPF record</button><button>Edit DKIM record</button></main>`));
  }
  if (url.pathname === "/late") return send(page("Late", `<h1>Loading</h1><script>setTimeout(() => { document.body.insertAdjacentHTML("beforeend", "<p>Ready now</p>"); }, 700)</script>`));
  send(page("Home", `<h1>Home</h1><a href="/shop">Shop</a>`));
});
await new Promise((r) => site.listen(0, "127.0.0.1", r));
const PORT = site.address().port;
const BASE = `http://127.0.0.1:${PORT}`;

// ---- a stand-in Relay (WebSocket, text frames only) ------------------------
let ws = null;
let hello = null;
const pending = new Map();
let nextId = 1;
const relay = http.createServer();
relay.on("upgrade", (req, socket) => {
  const accept = crypto.createHash("sha1").update(req.headers["sec-websocket-key"] + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").digest("base64");
  const proto = String(req.headers["sec-websocket-protocol"] || "").split(",")[0].trim();
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n${proto ? "Sec-WebSocket-Protocol: " + proto + "\r\n" : ""}\r\n`);
  ws = socket;
  let buf = Buffer.alloc(0);
  socket.on("data", (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    for (;;) {
      if (buf.length < 2) return;
      const op = buf[0] & 0x0f;
      let len = buf[1] & 0x7f;
      let off = 2;
      if (len === 126) { len = buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { len = Number(buf.readBigUInt64BE(2)); off = 10; }
      const masked = buf[1] & 0x80;
      const need = off + (masked ? 4 : 0) + len;
      if (buf.length < need) return;
      let data = buf.subarray(off + (masked ? 4 : 0), need);
      if (masked) {
        const mask = buf.subarray(off, off + 4);
        data = Buffer.from(data.map((b, i) => b ^ mask[i % 4]));
      }
      buf = buf.subarray(need);
      if (op === 1) {
        const msg = JSON.parse(data.toString("utf8"));
        if (msg.type === "hello") hello = msg;
        if (msg.type === "result" && pending.has(msg.id)) {
          pending.get(msg.id)(msg);
          pending.delete(msg.id);
        }
      }
    }
  });
});
await new Promise((r) => relay.listen(0, "127.0.0.1", r));
const sendFrame = (text) => {
  const payload = Buffer.from(text, "utf8");
  const head = payload.length < 126 ? Buffer.from([0x81, payload.length]) : Buffer.from([0x81, 126, payload.length >> 8, payload.length & 255]);
  ws.write(Buffer.concat([head, payload]));
};
let callPolicy = {};
const call = (tool, args = {}) => new Promise((resolve, reject) => {
  const id = "c" + nextId++;
  const timer = setTimeout(() => reject(new Error("timeout " + tool)), 40000);
  pending.set(id, (msg) => { clearTimeout(timer); resolve(msg); });
  sendFrame(JSON.stringify({ type: "call", id, tool, arguments: args, policy:callPolicy }));
});
const ok = async (tool, args) => {
  const r = await call(tool, args);
  if (r.error) throw new Error(tool + " " + JSON.stringify(args) + ": " + r.error);
  return r.result;
};
const fails = async (tool, args, pattern) => {
  const r = await call(tool, args);
  assert.ok(r.error && pattern.test(r.error), tool + " should fail with " + pattern + ", got " + JSON.stringify(r));
  return r.error;
};
const ref = (snap, role, name) => {
  const el = snap.interactiveElements.find((e) => (!role || e.role === role) && e.name.toLowerCase().includes(name.toLowerCase()));
  assert.ok(el, `no ${role} "${name}" in ${JSON.stringify(snap.interactiveElements.map((e) => e.role + ":" + e.name))}`);
  return el.ref;
};

// ---- the extension, as installed with one site already allowed --------------
const ext = fs.mkdtempSync(path.join(os.tmpdir(), "ra-ext-"));
for (const f of fs.readdirSync(here)) if (/\.(js|json|html|css|png)$/.test(f) && f !== "e2e.mjs" && f !== "test.mjs") fs.copyFileSync(path.join(here, f), path.join(ext, f));
const manifest = JSON.parse(fs.readFileSync(path.join(ext, "manifest.json"), "utf8"));
// Stands in for the user having clicked Allow for 127.0.0.1 in Chrome's prompt.
manifest.host_permissions.push("http://127.0.0.1/*");
fs.writeFileSync(path.join(ext, "manifest.json"), JSON.stringify(manifest));

const profile = fs.mkdtempSync(path.join(os.tmpdir(), "ra-ext-profile-"));
const executablePath = process.env.REMOTEARC_E2E_CHROME || (fs.existsSync("/opt/pw-browsers/chromium-1194/chrome-linux/chrome") ? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" : undefined);
const context = await chromium.launchPersistentContext(profile, {
  headless: false,
  ignoreDefaultArgs: ["--disable-extensions"],
  ...(executablePath ? { executablePath } : {}),
  args: ["--headless=new", `--disable-extensions-except=${ext}`, `--load-extension=${ext}`, "--no-first-run"],
});
let failed = false;
try {
  const worker = context.serviceWorkers()[0] || (await context.waitForEvent("serviceworker"));
  await worker.evaluate(async ([relayUrl]) => {
    await chrome.storage.local.set({ raSites: { "http://127.0.0.1": { grantedAt: "test" } } });
    await chrome.storage.local.set({ deviceId: "dev-test", deviceToken: "tok", deviceName: "Test Chrome", relayUrl });
  }, [`ws://127.0.0.1:${relay.address().port}`]);
  for (let i = 0; i < 100 && !hello; i++) await new Promise((r) => setTimeout(r, 100));
  assert.ok(hello, "extension did not connect to the Relay");
  assert.equal(hello.device.agentVersion, "browser-0.4.4");
  assert.ok(hello.tools.includes("browser_open_tab") && hello.tools.includes("browser_act"));
  assert.ok(hello.capabilities.includes("browser_act_v1"));

  const listed = await ok("browser_list_tabs");
  assert.deepEqual(listed.tabs, []);
  assert.deepEqual(listed.allowed_sites, ["http://127.0.0.1"]);

  // The AI opens a tab on an allowed site by itself.
  const opened = await ok("browser_open_tab", { url: BASE + "/shop" });
  const tab = opened.tabId;
  assert.match(opened.snapshot.text, /Avengers tickets/);
  let snap = opened.snapshot;
  await ok("browser_act", { tab_id: tab, action: "select", snapshot_id: snap.snapshotId, ref: ref(snap, "combobox", "tickets"), value: "2" });
  await ok("browser_act", { tab_id: tab, action: "check", snapshot_id: snap.snapshotId, ref: ref(snap, "checkbox", "popcorn") });

  // A purchase is never sent without effect=submit and a key.
  await fails("browser_act", { tab_id: tab, action: "click", snapshot_id: snap.snapshotId, ref: ref(snap, "button", "place order") }, /SUBMIT_EFFECT_REQUIRED/);
  await fails("browser_act", { tab_id: tab, action: "press", key: "Space", snapshot_id: snap.snapshotId, ref: ref(snap, "button", "place order") }, /SUBMIT_EFFECT_REQUIRED/);
  await fails("browser_click", { tab_id: tab, snapshot_id: snap.snapshotId, ref: ref(snap, "button", "place order") }, /SUBMIT_EFFECT_REQUIRED/);
  assert.equal(orders.length, 0);
  let out = await ok("browser_act", { tab_id: tab, action: "click", snapshot_id: snap.snapshotId, ref: ref(snap, "button", "place order"), effect: "submit", idempotency_key: "order-1", snapshot: true });
  assert.equal(orders.length, 1);
  assert.deepEqual(orders[0], { qty: "2", snacks: true });
  assert.equal(out.effect.status, "unverified");
  assert.match(out.snapshot.text, /Order confirmed #1/, "the snapshot shows the page after the order settled");
  snap = out.snapshot;
  // Not again: neither the same key nor the same button under a new key.
  await fails("browser_act", { tab_id: tab, action: "click", snapshot_id: snap.snapshotId, ref: ref(snap, "button", "place order"), effect: "submit", idempotency_key: "order-1" }, /SUBMIT_KEY_USED/);
  await fails("browser_act", { tab_id: tab, action: "click", snapshot_id: snap.snapshotId, ref: ref(snap, "button", "place order"), effect: "submit", idempotency_key: "order-2" }, /SUBMIT_ALREADY_RECORDED/);
  assert.equal(orders.length, 1);
  // Settled as succeeded: a second, deliberate order may follow.
  await ok("browser_act", { action: "confirm", idempotency_key: "order-1", outcome: "succeeded" });
  await ok("browser_act", { tab_id: tab, action: "click", snapshot_id: snap.snapshotId, ref: ref(snap, "button", "place order"), effect: "submit", idempotency_key: "order-2" });
  assert.equal(orders.length, 2);
  await ok("browser_act", { action: "confirm", idempotency_key: "order-2", outcome: "succeeded" });

  // The tab keeps access as it moves within allowed sites; a comment in a
  // rich text box is typed the way the editor expects, and posting is final.
  out = await ok("browser_act", { tab_id: tab, action: "navigate", url: BASE + "/comment", snapshot: true });
  assert.equal(out.navigated, true);
  snap = out.snapshot;
  await ok("browser_act", { tab_id: tab, action: "fill", snapshot_id: snap.snapshotId, ref: ref(snap, "textbox", "add a comment"), value: "太好看了！" });
  await fails("browser_act", { tab_id: tab, action: "click", snapshot_id: snap.snapshotId, ref: ref(snap, "button", "发布") }, /SUBMIT_EFFECT_REQUIRED/);
  out = await ok("browser_act", { tab_id: tab, action: "click", snapshot_id: snap.snapshotId, ref: ref(snap, "button", "发布"), effect: "submit", idempotency_key: "comment-1", snapshot: true });
  assert.deepEqual(comments, [{ text: "太好看了！" }]);
  assert.match(out.snapshot.text, /太好看了！/);

  // A form in one call; codes may be filled, passwords never; Next loads the
  // next page, and Enter in a search box submits it.
  out = await ok("browser_act", { tab_id: tab, action: "navigate", url: BASE + "/form", snapshot: true });
  snap = out.snapshot;
  const otpArgs={tab_id:tab,snapshot_id:snap.snapshotId,ref:ref(snap,"textbox","code"),value:"123456"};
  await fails("browser_fill",otpArgs,/BROWSER_AUTH_REQUIRED/);
  callPolicy={browserAuth:{otp:true,captcha:false,origins:["https://other.example"],mailbox:"sam@example.test"}};
  await fails("browser_fill",otpArgs,/BROWSER_AUTH_REQUIRED/);
  callPolicy={browserAuth:{otp:true,captcha:false,origins:[BASE],mailbox:"sam@example.test"}};
  await ok("browser_fill",otpArgs);
  callPolicy={};
  await fails("browser_fill",otpArgs,/BROWSER_AUTH_REQUIRED/);
  callPolicy={browserAuth:{otp:true,captcha:false,origins:[BASE],mailbox:"sam@example.test"}};
  const form = await ok("browser_act", { tab_id: tab, action: "fill_form", snapshot_id: snap.snapshotId, fields: [
    { ref: ref(snap, "textbox", "full name"), value: "Sam Yao" },
    { ref: ref(snap, "textbox", "email"), value: "sam@example.test" },
    { ref: ref(snap, "textbox", "code"), value: "123456" },
    { ref: ref(snap, "textbox", "password"), value: "hunter2" },
  ] });
  assert.deepEqual(form.fields.map((f) => f.ok), [true, true, true, false]);
  assert.match(form.fields[3].error, /blocks filling password/);
  out = await ok("browser_act", { tab_id: tab, action: "click", snapshot_id: snap.snapshotId, ref: ref(snap, "button", "next"), snapshot: true });
  assert.equal(out.navigated, true);
  assert.match(out.snapshot.text, /Step 2[\s\S]*Hello Sam Yao/);
  out = await ok("browser_act", { tab_id: tab, action: "back", snapshot: true });
  snap = out.snapshot;
  await ok("browser_act", { tab_id: tab, action: "fill", snapshot_id: snap.snapshotId, ref: ref(snap, "textbox", "search"), value: "imax" });
  out = await ok("browser_act", { tab_id: tab, action: "press", key: "Enter", snapshot_id: snap.snapshotId, ref: ref(snap, "textbox", "search"), snapshot: true });
  assert.match(out.snapshot.text, /Results for imax/);

  // Waiting for something a page shows later.
  await ok("browser_act", { tab_id: tab, action: "navigate", url: BASE + "/late" });
  await ok("browser_act", { tab_id: tab, action: "wait", text: "Ready now", timeout_ms: 5000 });
  await fails("browser_act", { tab_id: tab, action: "wait", text: "Never shown", timeout_ms: 500 }, /WAIT_TIMEOUT/);

  // A site the user has not allowed: the AI is stopped and the user is
  // shown one Allow button.
  const before = context.pages().length;
  await fails("browser_open_tab", { url: `http://localhost:${PORT}/shop` }, /SITE_NOT_ALLOWED/);
  await fails("browser_act", { tab_id: tab, action: "navigate", url: `http://localhost:${PORT}/` }, /SITE_NOT_ALLOWED/);
  await new Promise((r) => setTimeout(r, 300));
  const approve = context.pages().find((p) => p.url().includes("/approve.html"));
  assert.ok(approve, "the approval page opened");
  assert.ok(context.pages().length > before);
  assert.match(decodeURIComponent(approve.url()), /origin=http:\/\/localhost:/);
  assert.match(await approve.textContent("#site"), /http:\/\/localhost:/);

  const tabs = (await ok("browser_list_tabs")).tabs;
  assert.equal(tabs.length, 1);
  assert.equal(tabs[0].openedByRemoteArc, true);
  assert.equal(tabs[0].mode, "site");

  // Two tabs have independent snapshots, so concurrent calls must reserve
  // the global submit ledger atomically before either page is clicked.
  const racing=await Promise.all([ok("browser_open_tab",{url:BASE+"/shop"}),ok("browser_open_tab",{url:BASE+"/shop"})]);
  const submit=(opened,key)=>({tab_id:opened.tabId,action:"click",snapshot_id:opened.snapshot.snapshotId,ref:ref(opened.snapshot,"button","place order"),effect:"submit",idempotency_key:key});
  const beforeRace=orders.length;
  const sameKey=await Promise.all(racing.map(opened=>call("browser_act",submit(opened,"concurrent-order"))));
  assert.equal(sameKey.filter(result=>!result.error).length,1);
  assert.match(sameKey.find(result=>result.error)?.error||"",/SUBMIT_KEY_USED/);
  assert.equal(orders.length,beforeRace+1,"one stable key sends one order across concurrent tabs");
  await ok("browser_act",{action:"confirm",idempotency_key:"concurrent-order",outcome:"succeeded"});
  for(const opened of racing)opened.snapshot=await ok("browser_read_page",{tab_id:opened.tabId});
  const differentKeys=await Promise.all(racing.map((opened,index)=>call("browser_act",submit(opened,"concurrent-target-"+index))));
  assert.equal(differentKeys.filter(result=>!result.error).length,1);
  assert.match(differentKeys.find(result=>result.error)?.error||"",/SUBMIT_ALREADY_RECORDED/);
  assert.equal(orders.length,beforeRace+2,"one unverified target cannot be sent under a second concurrent key");
  for(const opened of racing)await ok("browser_act",{tab_id:opened.tabId,action:"close"});

  // The user opens tabs themselves, then shares every tab in the window from
  // the popup in one click. The site is already allowed here, so Chrome has
  // nothing to ask.
  const userTab = await context.newPage();
  await userTab.goto(BASE + "/dash");
  const extensionId = new URL(worker.url()).host;
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await popup.bringToFront();
  const shareAll = popup.locator("#share-window");
  await shareAll.waitFor();
  assert.match(await shareAll.textContent(), /Share all \d+ tabs? in this window/);
  await shareAll.click();
  await popup.locator("#status", { hasText: /Shared \d+ tab/ }).waitFor();
  const sharedDash = (await ok("browser_list_tabs")).tabs.find((t) => t.url === BASE + "/dash");
  assert.ok(sharedDash, "the user's own tab is shared");
  assert.equal(sharedDash.mode, "site");
  assert.deepEqual(sharedDash.permissions, ["read", "interact"]);
  assert.equal((await ok("browser_list_tabs")).tabs.some((t) => t.url.startsWith("chrome-extension://")), false, "extension pages are never shared");

  // A long sidebar does not push the page's own buttons out of the snapshot.
  const dash = await ok("browser_read_page", { tab_id: sharedDash.tabId });
  assert.equal(dash.interactiveElements.length, 250);
  assert.deepEqual(dash.interactiveElements.slice(0, 2).map((e) => e.name), ["Edit SPF record", "Edit DKIM record"]);
  assert.equal(dash.interactiveElements[2].region, "navigation");
  assert.equal(dash.omittedElements, 52);
  await ok("browser_act", { tab_id: sharedDash.tabId, action: "click", snapshot_id: dash.snapshotId, ref: ref(dash, "button", "Edit DKIM") });
  await popup.close();
  await userTab.close();
  for (let i = 0; i < 50 && (await ok("browser_list_tabs")).tabs.some((t) => t.tabId === sharedDash.tabId); i++) await new Promise((r) => setTimeout(r, 50));
  assert.equal((await ok("browser_list_tabs")).tabs.some((t) => t.tabId === sharedDash.tabId), false, "closing a shared tab ends its access");

  // A one-time secret: the Relay prepares a key in the browser, the user's
  // page encrypts to it, and a fill spends it once on its own site, here a
  // password-type field.
  const subtle = globalThis.crypto.subtle;
  const handle = "sec_e2eaaaaaaaaaaaaaaaaaaaaa";
  const prepared = await ok("secret_prepare", { handle, site: BASE + "/token" });
  const device = await subtle.importKey("raw", Buffer.from(prepared.public_key, "base64url"), { name: "ECDH", namedCurve: "P-256" }, false, []);
  const eph = await subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const ikm = await subtle.importKey("raw", await subtle.deriveBits({ name: "ECDH", public: device }, eph.privateKey, 256), "HKDF", false, ["deriveKey"]);
  const aes = await subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt: new Uint8Array(), info: new TextEncoder().encode("remote-arc one-time secret v1 " + handle) }, ikm, { name: "AES-GCM", length: 256 }, false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = await subtle.encrypt({ name: "AES-GCM", iv, additionalData: new TextEncoder().encode(handle) }, aes, new TextEncoder().encode("cf-e2e-token-42"));
  const b64 = (bytes) => Buffer.from(bytes).toString("base64url");
  await ok("secret_deliver", { handle, epk: b64(new Uint8Array(await subtle.exportKey("raw", eph.publicKey))), iv: b64(iv), ciphertext: b64(new Uint8Array(sealed)) });
  const tokenTab = await ok("browser_open_tab", { url: BASE + "/token" });
  const field = ref(tokenTab.snapshot, "textbox", "token");
  const filledSecret = await ok("browser_fill", { tab_id: tokenTab.tabId, snapshot_id: tokenTab.snapshot.snapshotId, ref: field, secret: handle });
  assert.equal(JSON.stringify(filledSecret).includes("cf-e2e-token"), false, "the AI never sees the value");
  const tokenPage = context.pages().find((p) => p.url() === BASE + "/token");
  assert.equal(await tokenPage.locator("#token").inputValue(), "cf-e2e-token-42", "the page field holds the value");
  await fails("browser_fill", { tab_id: tokenTab.tabId, snapshot_id: tokenTab.snapshot.snapshotId, ref: field, secret: handle }, /SECRET_NOT_FOUND/);
  await ok("browser_act", { tab_id: tokenTab.tabId, action: "close" });

  // Only tabs Remote Arc opened can be closed by the AI.
  await ok("browser_act", { tab_id: tab, action: "close" });
  assert.deepEqual((await ok("browser_list_tabs")).tabs, []);
  console.log("Remote Arc browser extension end-to-end tests passed");
} catch (error) {
  failed = true;
  console.error(error);
} finally {
  await context.close();
  site.close();
  relay.close();
  ws?.destroy();
}
process.exit(failed ? 1 : 0);
