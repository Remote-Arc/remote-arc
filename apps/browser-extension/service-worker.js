const API_ORIGIN = "https://mcp.remotearc.app";
const READ_TOOLS = [
  "browser_list_tabs",
  "browser_get_current_tab",
  "browser_read_page",
  "browser_get_selected_text",
  "browser_extract_links",
  "browser_extract_table",
];
const INTERACT_TOOLS = [
  "browser_click",
  "browser_fill",
  "browser_open_tab",
  "browser_act",
];
const TOOLS = [...READ_TOOLS, ...INTERACT_TOOLS];
const VERSION = chrome.runtime.getManifest().version;

let socket = null;
let heartbeat = null;
let pairingTimer = null;
// Tabs the AI may use, by tab id. mode "tab": shared by the user from the
// popup; access ends when the tab leaves its page, unless the user allowed
// the site. mode "site": on a site the user allowed (opened by Remote Arc, or
// shared there); access follows the tab across pages of allowed sites.
const grants = new Map();

const storageGet = (keys) => chrome.storage.local.get(keys);
const storageSet = (values) => chrome.storage.local.set(values);

// Grants survive the service worker being suspended (Chrome stops idle
// workers), but not a browser restart.
const restored = (async () => {
  try {
    const { raGrants } = await chrome.storage.session.get("raGrants");
    for (const grant of raGrants || []) grants.set(grant.tabId, grant);
  } catch {
    // session storage unavailable: grants start empty
  }
})();

async function persistGrants() {
  try {
    await chrome.storage.session.set({ raGrants: Array.from(grants.values()) });
  } catch {
    // best effort
  }
}

async function credentials() {
  return storageGet(["deviceId", "deviceToken", "relayUrl", "deviceName"]);
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab || null;
}

const originOf = (url) => {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:" ? u.origin : "";
  } catch {
    return "";
  }
};

// ---- Sites the user allowed ---------------------------------------------

// Chrome's host permissions name a scheme and host (any port), so sites are
// kept the same way.
const siteKey = (origin) => {
  try {
    const u = new URL(origin);
    return u.protocol === "http:" || u.protocol === "https:" ? u.protocol + "//" + u.hostname : "";
  } catch {
    return "";
  }
};
const patternOf = (origin) => siteKey(origin) + "/*";

async function siteList() {
  const { raSites } = await storageGet("raSites");
  return raSites || {};
}

// A site is allowed when the user granted Chrome's host permission for it
// through Remote Arc (popup or approval page) and has not removed it.
async function siteAllowed(origin) {
  const key = siteKey(origin);
  if (!key) return false;
  const sites = await siteList();
  if (!sites[key]) return false;
  try {
    return await chrome.permissions.contains({ origins: [patternOf(origin)] });
  } catch {
    return false;
  }
}

async function rememberSite(origin) {
  const key = siteKey(origin);
  if (!key) return;
  const sites = await siteList();
  if (!sites[key]) {
    sites[key] = { grantedAt: new Date().toISOString() };
    await storageSet({ raSites: sites });
  }
}

async function forgetSite(origin) {
  const key = siteKey(origin);
  const sites = await siteList();
  delete sites[key];
  await storageSet({ raSites: sites });
  try {
    await chrome.permissions.remove({ origins: [patternOf(origin)] });
  } catch {
    // a permission the manifest requires cannot be removed
  }
}

// Chrome's own prompt grants the host permission; Remote Arc only records
// which sites came from it.
chrome.permissions.onAdded.addListener(async ({ origins }) => {
  for (const pattern of origins || []) await rememberSite(pattern.replace(/\/\*$/, "/"));
});
chrome.permissions.onRemoved.addListener(async ({ origins }) => {
  const sites = await siteList();
  for (const pattern of origins || []) delete sites[siteKey(pattern.replace(/\/\*$/, "/"))];
  await storageSet({ raSites: sites });
});

const prompted = new Map();

// Shows the user a page with one Allow button for the site (Chrome then asks
// for the permission itself). The call that needed it fails with
// SITE_NOT_ALLOWED so the AI asks the user and tries again.
async function askForSite(origin) {
  const last = prompted.get(origin) || 0;
  if (Date.now() - last > 60000) {
    prompted.set(origin, Date.now());
    await chrome.tabs.create({ url: chrome.runtime.getURL("approve.html?origin=" + encodeURIComponent(origin)), active: true });
  }
  throw new Error("SITE_NOT_ALLOWED: " + origin + " is not allowed for AI in this browser yet. Remote Arc opened a page in the user's browser with an Allow button; ask the user to click Allow there (once per site), then call this again.");
}

// ---- Connection ----------------------------------------------------------

async function currentState() {
  await restored;
  const creds = await credentials();
  const tab = await activeTab();
  const origin = originOf(tab?.url || "");
  return {
    connected: Boolean(creds.deviceId && creds.deviceToken),
    deviceName: creds.deviceName,
    socketConnected: socket?.readyState === WebSocket.OPEN,
    activeTab: tab?.id ? { id: tab.id, url: tab.url, title: tab.title } : null,
    activeGrant: tab?.id ? grants.get(tab.id) || null : null,
    activeSite: origin ? { origin, allowed: await siteAllowed(origin) } : null,
    sites: Object.keys(await siteList()).sort(),
    grants: Array.from(grants.values()),
    version: VERSION,
    allowCodes: await allowCodes(),
  };
}

async function connectSocket() {
  const creds = await credentials();
  if (!creds.deviceId || !creds.deviceToken || !creds.relayUrl) return;
  if (socket && [WebSocket.OPEN, WebSocket.CONNECTING].includes(socket.readyState)) return;

  const url = new URL("/agent", creds.relayUrl);
  socket = new WebSocket(url.toString(), ["remotearc", "token." + creds.deviceToken]);

  socket.addEventListener("open", () => {
    socket.send(JSON.stringify({
      type: "hello",
      device: {
        id: creds.deviceId,
        name: creds.deviceName || "Remote Arc Browser",
        platform: "browser",
        arch: "chrome",
        hostname: "chrome-extension",
        agentVersion: "browser-" + VERSION,
      },
      tools: TOOLS,
      capabilities: ["browser_tab_grant_v2", "browser_multi_tab_v1", "browser_interact_v1", "browser_site_grants_v1", "browser_act_v1"],
    }));

    clearInterval(heartbeat);
    heartbeat = setInterval(() => {
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "ping", at: Date.now() }));
      }
    }, 20000);
  });

  socket.addEventListener("message", async (event) => {
    let message;
    try {
      message = JSON.parse(event.data);
    } catch {
      return;
    }
    if (message?.type !== "call" || !message.id) return;

    try {
      const result = await executeTool(message.tool, message.arguments || {});
      socket.send(JSON.stringify({ type: "result", id: message.id, result }));
    } catch (error) {
      socket.send(JSON.stringify({
        type: "result",
        id: message.id,
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  });

  socket.addEventListener("close", () => {
    clearInterval(heartbeat);
    heartbeat = null;
    socket = null;
    setTimeout(() => connectSocket().catch(() => undefined), 3000);
  });
}

// ---- Tabs ----------------------------------------------------------------

async function resolveSharedTab(tabId) {
  await restored;
  let grant = null;

  if (tabId !== undefined && tabId !== null) {
    grant = grants.get(Number(tabId)) || null;
  } else if (grants.size === 1) {
    grant = grants.values().next().value || null;
  } else if (grants.size > 1) {
    throw new Error("Multiple tabs are shared. Call browser_list_tabs and pass tab_id.");
  }

  if (!grant) {
    throw new Error("No matching shared tab. Share the tab in Remote Arc Browser first, or open one with shared_tab_open.");
  }

  const tab = await chrome.tabs.get(grant.tabId).catch(() => null);
  if (!tab) {
    await revokeGrant(grant.tabId);
    throw new Error("The shared tab is no longer available.");
  }

  const origin = originOf(tab.url || "");
  if (grant.mode === "site") {
    // Without permission for the page the tab moved to, Chrome does not
    // even tell Remote Arc its address.
    if (!origin) {
      throw new Error("SITE_NOT_ALLOWED: this tab moved to a site that is not allowed for AI. Ask the user to open the Remote Arc Browser popup on that tab and choose Allow AI on this site, then call this again.");
    }
    if (!(await siteAllowed(origin))) await askForSite(origin);
    if (grant.url !== tab.url || grant.origin !== origin) {
      grants.set(tab.id, { ...grant, url: tab.url, origin, title: tab.title || "" });
      await persistGrants();
    }
    return { tab, grant: grants.get(tab.id) };
  }

  if (!tab.url || origin !== grant.origin || tab.url !== grant.url) {
    if (origin && (await siteAllowed(origin))) {
      const updated = { ...grant, mode: "site", url: tab.url, origin, permissions: ["read", "interact"] };
      grants.set(tab.id, updated);
      await persistGrants();
      return { tab, grant: updated };
    }
    await revokeGrant(grant.tabId);
    throw new Error("Tab access was revoked because the page navigated.");
  }

  return { tab, grant };
}

async function listSharedTabs() {
  await restored;
  const items = [];
  for (const grant of grants.values()) {
    const tab = await chrome.tabs.get(grant.tabId).catch(() => null);
    if (!tab) {
      await revokeGrant(grant.tabId);
      continue;
    }
    items.push({
      tabId: grant.tabId,
      title: tab.title || grant.title || "",
      url: tab.url || grant.url,
      origin: grant.origin,
      permissions: grant.permissions || ["read"],
      mode: grant.mode || "tab",
      openedByRemoteArc: Boolean(grant.opened),
    });
  }
  return { tabs: items, allowed_sites: Object.keys(await siteList()).sort(), version: VERSION };
}

const send = (tabId, tool, args = {}) => chrome.tabs.sendMessage(tabId, { source: "remote-arc-browser", tool, arguments: args });

// The page script is injected again after each page load.
async function ensureInjected(tabId) {
  try {
    const r = await send(tabId, "ra_ping");
    if (r?.ok) return;
  } catch {
    // not injected on this page yet
  }
  await chrome.scripting.executeScript({ target: { tabId }, files: ["content-script.js"] });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitComplete(tabId, limitMs = 15000) {
  const until = Date.now() + limitMs;
  while (Date.now() < until) {
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    if (!tab) return false;
    if (tab.status === "complete") return true;
    await sleep(60);
  }
  return false;
}

// Watches for a page load that an action starts.
function watchLoad(tabId) {
  let started = false;
  const listener = (id, info) => {
    if (id === tabId && (info.status === "loading" || info.url)) started = true;
  };
  chrome.tabs.onUpdated.addListener(listener);
  return {
    async started(windowMs) {
      const until = Date.now() + windowMs;
      while (!started && Date.now() < until) await sleep(30);
      return started;
    },
    stop() {
      chrome.tabs.onUpdated.removeListener(listener);
    },
  };
}

async function quietIn(tabId, quietMs, limitMs) {
  try {
    return await send(tabId, "ra_quiet", { quiet_ms: quietMs, limit_ms: limitMs });
  } catch {
    return null;
  }
}

// After an action, waits for what it started: a page load to finish, or the
// page to stop changing. No fixed delays.
async function settle(tabId, watch, navWindowMs, quietMs, quietLimitMs) {
  if (navWindowMs > 0 && (await watch.started(navWindowMs))) {
    await waitComplete(tabId);
    await ensureInjected(tabId).catch(() => undefined);
    await quietIn(tabId, 150, 1500);
    return true;
  }
  if (quietLimitMs > 0) await quietIn(tabId, quietMs, quietLimitMs);
  return false;
}

async function groupTab(tabId) {
  try {
    const { raGroup } = await chrome.storage.session.get("raGroup");
    let groupId = raGroup;
    if (groupId !== undefined) {
      try {
        await chrome.tabGroups.get(groupId);
      } catch {
        groupId = undefined;
      }
    }
    groupId = await chrome.tabs.group(groupId !== undefined ? { tabIds: [tabId], groupId } : { tabIds: [tabId] });
    await chrome.tabGroups.update(groupId, { title: "Remote Arc", color: "green" });
    await chrome.storage.session.set({ raGroup: groupId });
  } catch {
    // tab groups are a convenience
  }
}

async function snapshotOf(tabId) {
  await ensureInjected(tabId);
  return send(tabId, "browser_read_page");
}

async function openTab(args) {
  let url;
  try {
    url = new URL(String(args.url || ""));
  } catch {
    throw new Error("url must be a full http(s) address.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("url must be a full http(s) address.");
  if (!(await siteAllowed(url.origin))) await askForSite(url.origin);
  const tab = await chrome.tabs.create({ url: url.href, active: Boolean(args.active) });
  await groupTab(tab.id);
  await waitComplete(tab.id);
  const now = await chrome.tabs.get(tab.id);
  const origin = originOf(now.url || "");
  if (!origin || !(await siteAllowed(origin))) {
    throw new Error("SITE_NOT_ALLOWED: the page redirected to " + (origin || "a site that is not allowed") + ". Ask the user to allow that site, then open it again.");
  }
  await ensureInjected(tab.id);
  const grant = {
    tabId: tab.id,
    title: now.title || "",
    url: now.url,
    origin,
    mode: "site",
    opened: true,
    grantedAt: new Date().toISOString(),
    permissions: ["read", "interact"],
  };
  grants.set(tab.id, grant);
  await persistGrants();
  await chrome.action.setBadgeText({ tabId: tab.id, text: "AI+" }).catch(() => undefined);
  await chrome.action.setBadgeBackgroundColor({ tabId: tab.id, color: "#76b900" }).catch(() => undefined);
  const result = { ok: true, tabId: tab.id, url: now.url, title: now.title || "" };
  if (args.snapshot !== false) result.snapshot = await send(tab.id, "browser_read_page");
  return result;
}

// ---- Submits ---------------------------------------------------------------

async function ledger() {
  const { raSubmits } = await storageGet("raSubmits");
  return raSubmits || {};
}

async function saveLedger(entries) {
  const weekAgo = Date.now() - 7 * 24 * 3600 * 1000;
  for (const [key, entry] of Object.entries(entries)) {
    // Expire settled page metadata, never the used-key tombstone or an
    // unresolved action. Resuming an old task must not send it a second time.
    if (entry.at < weekAgo && ["succeeded", "failed"].includes(entry.status)) {
      entries[key] = { at: entry.at, status: entry.status };
    }
  }
  await storageSet({ raSubmits: entries });
}

const KEY_PATTERN = /^[A-Za-z0-9_.:-]{1,120}$/;

// WebSocket calls can arrive together, including calls for different tabs.
// Reserve and settle the shared ledger serially so storage read/modify/write
// cannot admit the same key or target twice or overwrite another reservation.
let ledgerUpdates = Promise.resolve();
function withLedgerLock(operation) {
  const next = ledgerUpdates.then(operation);
  ledgerUpdates = next.catch(() => undefined);
  return next;
}

// A final submit (order, pay, post, send, apply...) is sent once: it needs
// effect=submit and a key, a key is never sent twice, and the same form and
// button is not sent again until the earlier one is confirmed.
async function guardFinal(args, effect, tab) {
  if (effect.kind !== "final") return null;
  return withLedgerLock(async () => {
    const key = String(args.idempotency_key || "");
    if (args.effect !== "submit" || !KEY_PATTERN.test(key)) {
      throw new Error("SUBMIT_EFFECT_REQUIRED: \"" + effect.label + "\" sends something on the user's behalf (submit, order, pay, post, send). Confirm with the user first, then use shared_tab_act with effect=\"submit\" and a stable idempotency_key for this one action.");
    }
    const entries = await ledger();
    if (entries[key]) {
      throw new Error("SUBMIT_KEY_USED: idempotency_key " + key + " was already sent (" + entries[key].status + "). Read the page to see the result; use a new key only for a new action.");
    }
    const origin = originOf(tab.url || "");
    for (const [other, entry] of Object.entries(entries)) {
      if (entry.target === effect.target && entry.origin === origin && entry.status === "unverified") {
        throw new Error("SUBMIT_ALREADY_RECORDED: the same form and button was already sent under idempotency_key " + other + " and is not settled. Read the page, then call shared_tab_act with action=confirm, idempotency_key=" + other + " and outcome=succeeded or failed. Retry the previous action only after failure; a new action needs fresh user approval and a new key.");
      }
    }
    entries[key] = { target: effect.target, origin, label: effect.label, url: tab.url, at: Date.now(), status: "unverified" };
    await saveLedger(entries);
    return { idempotency_key: key, status: "unverified", next_action: "Check the page for the result, then call shared_tab_act with action=confirm, idempotency_key=" + key + " and outcome=succeeded or failed." };
  });
}

async function confirmSubmit(args) {
  return withLedgerLock(async () => {
    const key = String(args.idempotency_key || "");
    const entries = await ledger();
    if (!entries[key]) throw new Error("No submit was sent with idempotency_key " + key + ".");
    if (args.outcome !== "succeeded" && args.outcome !== "failed") throw new Error("outcome must be succeeded or failed.");
    entries[key] = { ...entries[key], status: args.outcome, confirmedAt: Date.now() };
    await saveLedger(entries);
    return { ok: true, action: "confirm", idempotency_key: key, status: args.outcome };
  });
}

// ---- shared_tab_act --------------------------------------------------------

async function allowCodes() {
  const { raAllowCodes } = await storageGet("raAllowCodes");
  return raAllowCodes !== false;
}

async function act(args) {
  const action = String(args.action || "");
  if (action === "confirm") return confirmSubmit(args);

  const { tab, grant } = await resolveSharedTab(args.tab_id);
  if (!grant.permissions?.includes("interact")) {
    throw new Error("Click & fill is not enabled for this tab. Ask the user to enable it in the Remote Arc Browser popup, or to allow the site.");
  }
  const tabId = tab.id;

  if (action === "close") {
    if (!grant.opened) throw new Error("Only tabs Remote Arc opened can be closed. Ask the user to close this tab.");
    await revokeGrant(tabId);
    await chrome.tabs.remove(tabId);
    return { ok: true, action, tabId };
  }

  const watch = watchLoad(tabId);
  try {
    let result;
    let effect = null;
    let navigated = false;
    if (action === "navigate") {
      const target = originOf(String(args.url || ""));
      if (!target) throw new Error("url must be a full http(s) address.");
      if (!(await siteAllowed(target))) await askForSite(target);
      await chrome.tabs.update(tabId, { url: String(args.url) });
      navigated = await settle(tabId, watch, 3000, 0, 0);
      result = { ok: true, action };
    } else if (action === "back" || action === "reload") {
      if (action === "back") {
        // Chrome's Back skips pages reached without a real user gesture,
        // which every scripted click is; the page's own history still has them.
        try {
          await chrome.tabs.goBack(tabId);
        } catch {
          await ensureInjected(tabId);
          const r = await send(tabId, "ra_back");
          if (r?.error) throw new Error(r.error);
        }
      } else await chrome.tabs.reload(tabId);
      navigated = await settle(tabId, watch, 2000, 150, 1500);
      result = { ok: true, action };
    } else if (action === "wait") {
      const limit = Math.min(Math.max(Number(args.timeout_ms) || 10000, 250), 30000);
      const until = Date.now() + limit;
      let met = false;
      let state = null;
      while (Date.now() < until && !met) {
        try {
          await ensureInjected(tabId);
          state = await send(tabId, "ra_state", { text: args.text || "" });
          met = (!args.text || state?.has_text) && (!args.url_contains || String(state?.url || "").includes(String(args.url_contains)));
        } catch {
          state = null;
        }
        if (!met) await sleep(200);
      }
      if (!met) throw new Error("WAIT_TIMEOUT: the page did not show " + (args.text ? "\"" + args.text + "\"" : "") + (args.url_contains ? " a URL containing \"" + args.url_contains + "\"" : "") + " within " + limit + " ms.");
      result = { ok: true, action, url: state?.url };
    } else {
      await ensureInjected(tabId);
      const contentArgs = { ...args, allow_codes: await allowCodes() };
      if (action === "click" || (action === "press" && ["Enter", "Space"].includes(args.key))) {
        const kind = await send(tabId, "ra_effect", { snapshot_id: args.snapshot_id, ref: args.ref, key: args.key });
        if (kind?.error) throw new Error(kind.error);
        effect = await guardFinal(args, kind, tab);
        const response = await send(tabId, "ra_act", contentArgs);
        if (response?.error) throw new Error(response.error);
        navigated = await settle(tabId, watch, kind.may_navigate ? 1500 : 300, 150, 2000);
        result = response;
      } else {
        const response = await send(tabId, "ra_act", contentArgs);
        if (response?.error) throw new Error(response.error);
        const quietLimit = action === "scroll" ? 600 : action === "press" ? 1200 : 400;
        navigated = await settle(tabId, watch, action === "press" ? 300 : 0, 60, quietLimit);
        result = response;
      }
    }
    const now = await chrome.tabs.get(tabId).catch(() => null);
    const out = { ...result, tabId, url: now?.url || result?.url, title: now?.title || "", navigated };
    if (effect) out.effect = effect;
    if (args.snapshot) out.snapshot = await snapshotOf(tabId);
    return out;
  } finally {
    watch.stop();
  }
}

async function executeTool(tool, args) {
  if (tool === "browser_list_tabs") return listSharedTabs();
  if (tool === "browser_open_tab") return openTab(args);
  if (tool === "browser_act") return act(args);
  if (tool === "browser_click") return act({ ...args, action: "click" });

  const { tab, grant } = await resolveSharedTab(args.tab_id);

  if (tool === "browser_get_current_tab") {
    return {
      tabId: tab.id,
      url: tab.url,
      title: tab.title,
      permissions: grant.permissions || ["read"],
    };
  }

  if (!TOOLS.includes(tool)) throw new Error("Unsupported browser tool: " + tool);
  if (INTERACT_TOOLS.includes(tool) && !grant.permissions?.includes("interact")) {
    throw new Error("Click/fill is not enabled for this tab. Enable Browser Interact in the Remote Arc Browser popup.");
  }

  if (grant.mode === "site") await ensureInjected(tab.id);
  const response = await send(tab.id, tool, args);

  if (response?.error) throw new Error(response.error);
  return response;
}

// ---- Popup ------------------------------------------------------------------

async function grantCurrentTab() {
  const tab = await activeTab();
  if (!tab?.id || !tab.url) throw new Error("No active browser tab.");

  const url = new URL(tab.url);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Remote Arc only supports normal web pages.");
  }

  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["content-script.js"],
  });

  const allowed = await siteAllowed(url.origin);
  const grant = {
    tabId: tab.id,
    title: tab.title || "",
    url: tab.url,
    origin: url.origin,
    mode: allowed ? "site" : "tab",
    grantedAt: new Date().toISOString(),
    permissions: allowed ? ["read", "interact"] : ["read"],
  };

  grants.set(tab.id, grant);
  await persistGrants();
  await chrome.action.setBadgeText({ tabId: tab.id, text: allowed ? "AI+" : "AI" });
  await chrome.action.setBadgeBackgroundColor({ tabId: tab.id, color: "#76b900" });
  return grant;
}

async function setTabInteract(tabId, enabled) {
  const id = Number(tabId);
  const grant = grants.get(id);
  if (!grant) throw new Error("Share this tab before enabling Browser Interact.");

  const permissions = new Set(grant.permissions || ["read"]);
  if (enabled) permissions.add("interact");
  else permissions.delete("interact");
  permissions.add("read");

  const updated = { ...grant, permissions: Array.from(permissions) };
  grants.set(id, updated);
  await persistGrants();
  await chrome.action.setBadgeText({ tabId: id, text: enabled ? "AI+" : "AI" }).catch(() => undefined);
  return updated;
}

async function revokeGrant(tabId) {
  const id = Number(tabId);
  if (!grants.has(id)) return;
  await chrome.action.setBadgeText({ tabId: id, text: "" }).catch(() => undefined);
  grants.delete(id);
  await persistGrants();
}

async function revokeAllGrants() {
  for (const tabId of Array.from(grants.keys())) {
    await revokeGrant(tabId);
  }
}

async function removeSite(origin) {
  await forgetSite(origin);
  for (const grant of Array.from(grants.values())) {
    if (siteKey(grant.origin) === siteKey(origin) && grant.mode === "site") await revokeGrant(grant.tabId);
  }
}

async function startPairing() {
  const deviceName = "Chrome Browser";
  const response = await fetch(API_ORIGIN + "/api/device/start", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      device_name: deviceName,
      platform: "browser",
      arch: "chrome",
      hostname: "chrome-extension",
    }),
  });

  if (!response.ok) throw new Error("Could not start Remote Arc pairing.");

  const pair = await response.json();
  await chrome.tabs.create({ url: pair.verification_uri_complete });

  clearInterval(pairingTimer);
  pairingTimer = setInterval(async () => {
    const tokenResponse = await fetch(API_ORIGIN + "/api/device/token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        device_code: pair.device_code,
        device_secret: pair.device_secret,
      }),
    }).catch(() => null);

    if (!tokenResponse || tokenResponse.status === 428) return;

    if (!tokenResponse.ok) {
      clearInterval(pairingTimer);
      pairingTimer = null;
      return;
    }

    const token = await tokenResponse.json();
    clearInterval(pairingTimer);
    pairingTimer = null;

    await storageSet({
      deviceId: token.device_id,
      deviceToken: token.device_token,
      relayUrl: token.relay_url,
      deviceName,
    });
    await connectSocket();
  }, Math.max(2000, Number(pair.interval || 2) * 1000));

  return { ok: true };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Only the extension's own pages (popup, approval page) send these; a
  // message from a script running inside a website is ignored.
  const fromExtensionPage = !sender?.tab || String(sender?.url || "").startsWith(chrome.runtime.getURL(""));
  if (sender?.id !== chrome.runtime.id || !fromExtensionPage) return false;
  (async () => {
    if (message?.type === "browser-state") return currentState();
    if (message?.type === "start-pairing") return startPairing();
    if (message?.type === "grant-current-tab") return grantCurrentTab();
    if (message?.type === "set-tab-interact") return setTabInteract(message.tabId, Boolean(message.enabled));
    if (message?.type === "site-allowed") {
      const origin = originOf(String(message.origin || ""));
      if (origin && (await chrome.permissions.contains({ origins: [patternOf(origin)] }))) await rememberSite(origin);
      return { ok: true, allowed: await siteAllowed(origin) };
    }
    if (message?.type === "remove-site") {
      await removeSite(String(message.origin || ""));
      return { ok: true };
    }
    if (message?.type === "set-allow-codes") {
      await storageSet({ raAllowCodes: Boolean(message.enabled) });
      return { ok: true };
    }
    if (message?.type === "revoke-tab-id") {
      await revokeGrant(message.tabId);
      return { ok: true };
    }
    if (message?.type === "revoke-tab") {
      const tab = await activeTab();
      if (tab?.id) await revokeGrant(tab.id);
      return { ok: true };
    }
    if (message?.type === "revoke-all-tabs") {
      await revokeAllGrants();
      return { ok: true };
    }
    if (message?.type === "disconnect-browser") {
      await revokeAllGrants();
      socket?.close();
      socket = null;
      await chrome.storage.local.remove(["deviceId", "deviceToken", "relayUrl", "deviceName"]);
      return { ok: true };
    }
    return { error: "unknown message" };
  })()
    .then(sendResponse)
    .catch((error) => sendResponse({
      error: error instanceof Error ? error.message : String(error),
    }));

  return true;
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  const grant = grants.get(tabId);
  if (!grant || grant.mode === "site") return;
  if (changeInfo.status === "loading" || changeInfo.url) {
    // A shared tab keeps access only if it stays on its page, or moves to a
    // site the user allowed.
    const origin = originOf(changeInfo.url || tab?.url || "");
    siteAllowed(origin).then(async (allowed) => {
      if (grants.get(tabId) !== grant) return;
      if (allowed) {
        grants.set(tabId, { ...grant, mode: "site", origin, url: tab?.url || grant.url, permissions: ["read", "interact"] });
        await persistGrants();
      } else {
        await revokeGrant(tabId);
      }
    });
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (grants.has(tabId)) revokeGrant(tabId);
});

// Pairing stores the credentials; connect as soon as they change.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.deviceToken?.newValue) connectSocket().catch(() => undefined);
});

chrome.runtime.onStartup.addListener(() => connectSocket().catch(() => undefined));
chrome.runtime.onInstalled.addListener(() => connectSocket().catch(() => undefined));
connectSocket().catch(() => undefined);
