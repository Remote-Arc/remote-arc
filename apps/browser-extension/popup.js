const connection = document.querySelector("#connection");
const tab = document.querySelector("#tab");
const allTabs = document.querySelector("#all-tabs");
const ALL_WEB_ORIGINS = { origins: ["http://*/*", "https://*/*"] };
const sharedTabs = document.querySelector("#shared-tabs");
const status = document.querySelector("#status");

const send = (type, payload = {}) => chrome.runtime.sendMessage({ type, ...payload });

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[c]);
}

function shortUrl(value) {
  try {
    const url = new URL(value);
    return url.hostname + (url.pathname === "/" ? "" : url.pathname);
  } catch {
    return value || "";
  }
}

async function render() {
  const state = await send("browser-state");

  connection.innerHTML = state.connected
    ? `<div class="permission"><span>Remote Arc</span><span class="on">Connected</span></div>
       <div class="meta">${escapeHtml(state.deviceName || "Chrome")}</div>
       <button class="secondary" id="disconnect">Disconnect browser</button>`
    : `<div class="permission"><span>Remote Arc</span><span>Not connected</span></div>
       <button class="primary" id="connect">Connect to Remote Arc</button>`;

  document.querySelector("#disconnect")?.addEventListener("click", async () => {
    await send("disconnect-browser");
    await chrome.permissions.remove(ALL_WEB_ORIGINS).catch(() => undefined);
    status.textContent = "Browser disconnected.";
    await render();
  });

  document.querySelector("#connect")?.addEventListener("click", async () => {
    status.textContent = "Starting secure pairing...";
    const result = await send("start-pairing");
    status.textContent = result?.error || "Approve the pairing in the Remote Arc tab.";
  });

  const grants = state.grants || [];
  const count = grants.length;
  const shared = Boolean(state.activeGrant);
  const interact = Boolean(state.activeGrant?.permissions?.includes("interact"));

  allTabs.innerHTML = state.shareAllMode
    ? `<div class="permission"><strong>Share all tabs</strong><span class="on">ON</span></div>
       <p class="hint">All eligible browser tabs, including new tabs, are shared with read + click/fill access. Protected login/payment pages are excluded. Pause when browsing privately.</p>
       <button class="secondary" id="disable-all">Stop sharing all tabs</button>`
    : `<div class="permission"><strong>Share all tabs</strong><span>OFF</span></div>
       <p class="hint">One switch shares eligible current and future tabs, including signed-in websites. AI can read, click and fill. Chrome will ask for website access once.</p>
       <button class="primary" id="enable-all" ${state.connected ? "" : "disabled"}>Share all tabs (read + click/fill)</button>`;

  document.querySelector("#enable-all")?.addEventListener("click", async () => {
    status.textContent = "Requesting Chrome access to websites...";
    const allowed = await chrome.permissions.request(ALL_WEB_ORIGINS).catch(() => false);
    if (!allowed) { status.textContent = "Permission not granted. No tabs shared."; return; }
    const result = await send("enable-share-all");
    status.textContent = result?.error || "Shared " + result.shared + " tabs (" + result.skipped + " skipped).";
    await render();
  });
  document.querySelector("#disable-all")?.addEventListener("click", async () => {
    const result = await send("disable-share-all");
    if (result?.error) { status.textContent = result.error; return; }
    await chrome.permissions.remove(ALL_WEB_ORIGINS).catch(() => undefined);
    status.textContent = "Whole-browser sharing stopped.";
    await render();
  });


  tab.innerHTML = shared
    ? `<div class="permission"><span>Current tab</span><span class="on">Shared</span></div>
       <div class="meta">${escapeHtml(state.activeGrant.title || shortUrl(state.activeGrant.url))}</div>
       <div class="permission"><span>Read page</span><span class="on">Allowed</span></div>
       <div class="permission"><span>Click & fill</span><span class="${interact ? "on" : ""}">${interact ? "Allowed" : "Blocked"}</span></div>
       <p class="hint">Interaction is per-tab. Recognized password, one-time-code, payment and file fields stay blocked.</p>
       <button class="${interact ? "secondary" : "primary"}" id="toggle-interact">${interact ? "Disable click & fill on this tab" : "Enable click & fill on this tab"}</button>
       <button class="secondary top-gap" id="revoke">Stop AI access on this tab</button>`
    : `<div class="permission"><span>Current tab</span><span>No access</span></div>
       <p class="hint">Sharing enables click & fill by default. You can switch back to read-only.</p>
       <button class="primary" id="grant" ${state.connected ? "" : "disabled"}>Share this tab (read + click/fill)</button>`;

  document.querySelector("#revoke")?.addEventListener("click", async () => {
    await send("revoke-tab");
    status.textContent = "Access revoked for this tab.";
    await render();
  });

  document.querySelector("#grant")?.addEventListener("click", async () => {
    const result = await send("grant-current-tab");
    if (result?.error) {
      status.textContent = result.error;
      return;
    }
    status.textContent = "Read + click/fill access granted.";
    await render();
  });

  document.querySelector("#toggle-interact")?.addEventListener("click", async () => {
    const tabId = state.activeGrant?.tabId;
    if (!tabId) return;
    const result = await send("set-tab-interact", { tabId, enabled: !interact });
    if (result?.error) {
      status.textContent = result.error;
      return;
    }
    status.textContent = interact ? "Click & fill disabled for this tab." : "Click & fill enabled for this tab.";
    await render();
  });

  sharedTabs.innerHTML = `
    <div class="permission"><span>Shared tabs</span><span>${count}</span></div>
    <p class="hint">Share all tabs includes new tabs automatically. Removing one excludes it until you restart the mode.</p>
    <div class="shared-list">
      ${grants.map((grant) => {
        const grantInteract = grant.permissions?.includes("interact");
        return `<div class="shared-item">
          <div class="shared-copy">
            <strong>${escapeHtml(grant.title || shortUrl(grant.url) || "Shared tab")}</strong>
            <span>${escapeHtml(shortUrl(grant.url))}</span>
            <small>${grantInteract ? "Read + click/fill" : "Read only"}</small>
          </div>
          <button class="icon-button" data-revoke-tab="${grant.tabId}" aria-label="Stop sharing this tab">×</button>
        </div>`;
      }).join("") || '<p class="empty">No tabs shared yet.</p>'}
    </div>
    ${count > 0 && !state.shareAllMode ? '<button class="secondary top-gap" id="revoke-all">Stop access on all shared tabs</button>' : ""}
  `;

  for (const button of sharedTabs.querySelectorAll("[data-revoke-tab]")) {
    button.addEventListener("click", async () => {
      await send("revoke-tab-id", { tabId: Number(button.dataset.revokeTab) });
      status.textContent = "Tab access revoked.";
      await render();
    });
  }

  document.querySelector("#revoke-all")?.addEventListener("click", async () => {
    await send("revoke-all-tabs");
    status.textContent = "All shared-tab access revoked.";
    await render();
  });
}

render().catch((error) => {
  status.textContent = error instanceof Error ? error.message : String(error);
});
