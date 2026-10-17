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
];
const TOOLS = [...READ_TOOLS, ...INTERACT_TOOLS];

let socket = null;
let heartbeat = null;
let pairingTimer = null;
const grants = new Map();
const excludedTabs = new Set();
let shareAllMode = false;
let saveQueue = Promise.resolve();

function eligibleTab(tab) {
  if (!Number.isInteger(tab?.id) || !tab.url || tab.incognito) return false;
  let url;
  try { url = new URL(tab.url); } catch { return false; }
  // Chrome-owned pages, extension pages and recognized login/payment/password
  // surfaces are not suitable for unattended whole-browser interaction.
  if (!["http:", "https:"].includes(url.protocol)) return false;
  const host = url.hostname.toLowerCase();
  if ([
    "accounts.google.com", "login.microsoftonline.com", "login.live.com",
    "account.live.com", "chrome.google.com", "chromewebstore.google.com",
    "my.1password.com", "start.1password.com", "vault.bitwarden.com",
    "dash.cloudflare.com", "banking.asb.co.nz", "www.bnz.co.nz",
    "www.paypal.com", "paypal.com",
  ].includes(host)) return false;
  if (/^\/((login|session|sessions|checkout|payment|billing\/payment)(\/|$))/i.test(url.pathname)) return false;
  if (host === "github.com" && /^\/(settings\/tokens|settings\/billing)(\/|$)/i.test(url.pathname)) return false;
  return true;
}

function persistShareState() {
  // Serializing writes avoids concurrent tab updates restoring stale grants.
  saveQueue = saveQueue.catch(() => undefined).then(() => chrome.storage.session.set({
    shareAllMode,
    sharedGrants: [...grants.values()],
    excludedTabs: [...excludedTabs],
  }));
  return saveQueue;
}

const shareStateReady = (async () => {
  const stored = await chrome.storage.session.get(["shareAllMode", "sharedGrants", "excludedTabs"]);
  shareAllMode = Boolean(stored.shareAllMode);
  for (const id of stored.excludedTabs || []) if (Number.isInteger(id)) excludedTabs.add(id);
  for (const grant of stored.sharedGrants || []) {
    if (Number.isInteger(grant.tabId) && typeof grant.url === "string") {
      const tab = await chrome.tabs.get(grant.tabId).catch(() => null);
      if (tab && tab.url === grant.url && eligibleTab(tab)) grants.set(grant.tabId, grant);
    }
  }
  if (shareAllMode) {
    const permitted = await chrome.permissions.contains({ origins: ["http://*/*", "https://*/*"] });
    if (permitted) await shareEligibleTabs();
    else {
      shareAllMode = false;
      grants.clear();
      excludedTabs.clear();
      await persistShareState();
    }
  }
})().catch(() => { shareAllMode = false; grants.clear(); excludedTabs.clear(); });

const storageGet = (keys) => chrome.storage.local.get(keys);
const storageSet = (values) => chrome.storage.local.set(values);

async function credentials() {
  return storageGet(["deviceId", "deviceToken", "relayUrl", "deviceName"]);
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab || null;
}

async function currentState() {
  await shareStateReady;
  const creds = await credentials();
  const tab = await activeTab();
  return {
    connected: Boolean(creds.deviceId && creds.deviceToken),
    deviceName: creds.deviceName,
    socketConnected: socket?.readyState === WebSocket.OPEN,
    shareAllMode,
    activeTab: tab?.id ? { id: tab.id, url: tab.url, title: tab.title } : null,
    activeGrant: tab?.id ? grants.get(tab.id) || null : null,
    grants: Array.from(grants.values()),
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
        agentVersion: "browser-0.4.0",
      },
      tools: TOOLS,
      capabilities: ["browser_tab_grant_v2", "browser_multi_tab_v1", "browser_interact_v1"],
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

async function resolveSharedTab(tabId) {
  await shareStateReady;
  let grant = null;

  if (tabId !== undefined && tabId !== null) {
    grant = grants.get(Number(tabId)) || null;
  } else if (grants.size === 1) {
    grant = grants.values().next().value || null;
  } else if (grants.size > 1) {
    throw new Error("Multiple tabs are shared. Call browser_list_tabs and pass tab_id.");
  }

  if (!grant) {
    throw new Error("No matching shared tab. Share the tab in Remote Arc Browser first.");
  }

  const tab = await chrome.tabs.get(grant.tabId).catch(() => null);
  if (!tab?.url) {
    await revokeGrant(grant.tabId);
    throw new Error("The shared tab is no longer available.");
  }

  const origin = new URL(tab.url).origin;
  if (origin !== grant.origin || tab.url !== grant.url) {
    await revokeGrant(grant.tabId);
    throw new Error("Tab access was revoked because the page navigated.");
  }

  return { tab, grant };
}

async function listSharedTabs() {
  await shareStateReady;
  const items = [];
  for (const grant of grants.values()) {
    const tab = await chrome.tabs.get(grant.tabId).catch(() => null);
    if (!tab?.url) {
      await revokeGrant(grant.tabId);
      continue;
    }
    if (tab.url !== grant.url || !eligibleTab(tab)) {
      await revokeGrant(grant.tabId);
      continue;
    }
    items.push({
      tabId: grant.tabId,
      title: tab.title || grant.title || "",
      url: tab.url,
      origin: grant.origin,
      permissions: grant.permissions || ["read"],
    });
  }
  return { tabs: items };
}

async function executeTool(tool, args) {
  await shareStateReady;
  if (tool === "browser_list_tabs") return listSharedTabs();

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

  const response = await chrome.tabs.sendMessage(tab.id, {
    source: "remote-arc-browser",
    tool,
    arguments: args,
  });

  if (response?.error) throw new Error(response.error);
  return response;
}

async function grantTab(tab, fromAll = false) {
  if (!eligibleTab(tab)) throw new Error("This page is protected or cannot be shared.");
  if (fromAll && excludedTabs.has(tab.id)) return null;
  // Revoke any older grant before asynchronous injection or navigation.
  const priorUrl = tab.url;
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["content-script.js"],
  });
  const current = await chrome.tabs.get(tab.id).catch(() => null);
  if (!current || current.url !== priorUrl || !eligibleTab(current)) {
    throw new Error("The tab navigated while sharing. Retry on the new page.");
  }
  // An in-flight injection must never re-grant a tab after Share all was disabled.
  if (fromAll && (!shareAllMode || excludedTabs.has(tab.id))) return null;
  const grant = {
    tabId: tab.id,
    title: tab.title || "",
    url: tab.url,
    origin: new URL(tab.url).origin,
    grantedAt: new Date().toISOString(),
    permissions: ["read", "interact"],
  };
  grants.set(tab.id, grant);
  excludedTabs.delete(tab.id);
  await persistShareState();
  await chrome.action.setBadgeText({ tabId: tab.id, text: "AI+" }).catch(() => undefined);
  await chrome.action.setBadgeBackgroundColor({ tabId: tab.id, color: "#76b900" }).catch(() => undefined);
  return grant;
}

async function shareEligibleTabs() {
  const tabs = await chrome.tabs.query({});
  await Promise.allSettled(tabs.filter(tab => eligibleTab(tab) && !excludedTabs.has(tab.id))
    .map(async tab => {
      if (grants.get(tab.id)?.url === tab.url) return;
      await grantTab(tab, true);
    }));
  return { shared: grants.size, skipped: tabs.length - grants.size };
}

async function enableShareAll() {
  await shareStateReady;
  const creds = await credentials();
  if (!creds.deviceId || !creds.deviceToken) throw new Error("Connect your browser first.");
  const allowed = await chrome.permissions.contains({ origins: ["http://*/*", "https://*/*"] });
  if (!allowed) throw new Error("Chrome access to all websites must be approved before sharing all tabs.");
  shareAllMode = true;
  excludedTabs.clear();
  await persistShareState();
  return { ok: true, ...(await shareEligibleTabs()) };
}

async function disableShareAll() {
  await shareStateReady;
  shareAllMode = false;
  excludedTabs.clear();
  await revokeAllGrants();
  await persistShareState();
  return { ok: true };
}

async function grantCurrentTab() {
  await shareStateReady;
  const creds = await credentials();
  if (!creds.deviceId || !creds.deviceToken) throw new Error("Connect your browser first.");
  const tab = await activeTab();
  if (!tab) throw new Error("No active browser tab.");
  return grantTab(tab);
}

async function setTabInteract(tabId, enabled) {
  await shareStateReady;
  const id = Number(tabId);
  const grant = grants.get(id);
  if (!grant) throw new Error("Share this tab before enabling Browser Interact.");

  const permissions = new Set(grant.permissions || ["read"]);
  if (enabled) permissions.add("interact");
  else permissions.delete("interact");
  permissions.add("read");

  const updated = { ...grant, permissions: Array.from(permissions) };
  grants.set(id, updated);
  await persistShareState();
  await chrome.action.setBadgeText({ tabId: id, text: enabled ? "AI+" : "AI" }).catch(() => undefined);
  return updated;
}

async function revokeGrant(tabId, exclude = false) {
  await shareStateReady;
  const id = Number(tabId);
  if (exclude && shareAllMode) excludedTabs.add(id);
  if (!grants.has(id)) { await persistShareState(); return; }
  await chrome.action.setBadgeText({ tabId: id, text: "" }).catch(() => undefined);
  grants.delete(id);
  await persistShareState();
}

async function revokeAllGrants() {
  await shareStateReady;
  for (const tabId of Array.from(grants.keys())) {
    await revokeGrant(tabId);
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

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    await shareStateReady;
    if (message?.type === "enable-share-all") return enableShareAll();
    if (message?.type === "disable-share-all") return disableShareAll();
    if (message?.type === "browser-state") return currentState();
    if (message?.type === "start-pairing") return startPairing();
    if (message?.type === "grant-current-tab") return grantCurrentTab();
    if (message?.type === "set-tab-interact") return setTabInteract(message.tabId, Boolean(message.enabled));
    if (message?.type === "revoke-tab-id") {
      await revokeGrant(message.tabId, true);
      return { ok: true };
    }
    if (message?.type === "revoke-tab") {
      const tab = await activeTab();
      if (tab?.id) await revokeGrant(tab.id, true);
      return { ok: true };
    }
    if (message?.type === "revoke-all-tabs") {
      return disableShareAll();
    }
    if (message?.type === "disconnect-browser") {
      await disableShareAll();
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

// Chrome may revoke site access independently of the Remote Arc popup.
chrome.permissions.onRemoved?.addListener(removed => {
  if ((removed.origins || []).some(origin => origin === "http://*/*" || origin === "https://*/*")) {
    void disableShareAll().catch(() => undefined);
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  void (async () => {
    await shareStateReady;
    if (changeInfo.status === "loading" || changeInfo.url) {
      if (grants.has(tabId)) await revokeGrant(tabId);
    }
    if (shareAllMode && changeInfo.status === "complete" && eligibleTab(tab) && !excludedTabs.has(tabId) && grants.get(tabId)?.url !== tab.url) {
      await grantTab(tab, true).catch(() => undefined);
    }
  })().catch(() => undefined);
});

chrome.tabs.onCreated.addListener(tab => {
  void (async () => {
    await shareStateReady;
    if (shareAllMode && tab.status === "complete" && eligibleTab(tab)) {
      await grantTab(tab, true).catch(() => undefined);
    }
  })().catch(() => undefined);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void (async () => {
    await shareStateReady;
    excludedTabs.delete(tabId);
    await revokeGrant(tabId);
  })().catch(() => undefined);
});

chrome.runtime.onStartup.addListener(() => shareStateReady.then(() => connectSocket()).catch(() => undefined));
chrome.runtime.onInstalled.addListener(() => shareStateReady.then(() => connectSocket()).catch(() => undefined));
shareStateReady.then(() => connectSocket()).catch(() => undefined);
