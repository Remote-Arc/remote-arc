const connection = document.querySelector("#connection");
const tab = document.querySelector("#tab");
const sharedTabs = document.querySelector("#shared-tabs");
const siteBox = document.querySelector("#site");
const sitesBox = document.querySelector("#sites");
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
  const win = await chrome.windows.getCurrent().catch(() => null);
  const state = await send("browser-state", { windowId: win?.id });

  connection.innerHTML = state.connected
    ? `<div class="permission"><span>Remote Arc</span><span class="on">Connected</span></div>
       <div class="meta">${escapeHtml(state.deviceName || "Chrome")}</div>
       <button class="secondary" id="disconnect">Disconnect browser</button>`
    : `<div class="permission"><span>Remote Arc</span><span>Not connected</span></div>
       <button class="primary" id="connect">Connect to Remote Arc</button>`;

  document.querySelector("#disconnect")?.addEventListener("click", async () => {
    await send("disconnect-browser");
    status.textContent = "Browser disconnected.";
    await render();
  });

  document.querySelector("#connect")?.addEventListener("click", async () => {
    status.textContent = "Starting secure pairing...";
    const result = await send("start-pairing");
    status.textContent = result?.error || "Approve the pairing in the Remote Arc tab.";
  });

  // This site: lets the AI open and use tabs here on its own, signed in as
  // the user. Chrome asks for the permission itself.
  const site = state.activeSite;
  siteBox.hidden = !site;
  siteBox.innerHTML = !site
    ? ""
    : site.allowed
      ? `<div class="permission"><span>${escapeHtml(shortUrl(site.origin))}</span><span class="on">AI allowed</span></div>
         <p class="hint">Your AI can open tabs on this site and read, click and fill there. Purchases, posts and submissions are sent once.</p>
         <button class="secondary" id="remove-site">Remove this site</button>`
      : `<div class="permission"><span>${escapeHtml(shortUrl(site.origin))}</span><span>Not allowed</span></div>
         <p class="hint">Let your AI open and use this site in your browser, signed in as you are. It still cannot see your other tabs or sites.</p>
         <button class="primary" id="allow-site" ${state.connected ? "" : "disabled"}>Allow AI on this site</button>`;

  document.querySelector("#allow-site")?.addEventListener("click", () => {
    const u = new URL(site.origin);
    // Requested straight from the click, as Chrome requires.
    chrome.permissions.request({ origins: [u.protocol + "//" + u.hostname + "/*"] }).then(async (granted) => {
      if (!granted) {
        status.textContent = "Not allowed.";
        return;
      }
      await send("site-allowed", { origin: site.origin });
      status.textContent = "AI allowed on " + shortUrl(site.origin) + ".";
      await render();
    }, (error) => {
      status.textContent = error instanceof Error ? error.message : String(error);
    });
  });

  document.querySelector("#remove-site")?.addEventListener("click", async () => {
    await send("remove-site", { origin: site.origin });
    status.textContent = "Site removed.";
    await render();
  });

  const sites = state.sites || [];
  sitesBox.innerHTML = `
    <div class="permission"><span>Allowed sites</span><span>${sites.length}</span></div>
    <div class="shared-list">
      ${sites.map((origin) => `<div class="shared-item">
          <div class="shared-copy"><strong>${escapeHtml(shortUrl(origin))}</strong><small>${escapeHtml(origin)}</small></div>
          <button class="icon-button" data-remove-site="${escapeHtml(origin)}" aria-label="Remove this site">×</button>
        </div>`).join("") || '<p class="empty">No sites allowed yet. Your AI asks when it needs one.</p>'}
    </div>
    <label class="permission"><span>Let your AI fill one-time codes</span><input type="checkbox" id="allow-codes" ${state.allowCodes ? "checked" : ""}></label>
    <p class="hint">Remote Arc Browser ${escapeHtml(state.version || "")}</p>`;

  document.querySelector("#allow-codes")?.addEventListener("change", async (event) => {
    await send("set-allow-codes", { enabled: event.target.checked });
    status.textContent = event.target.checked ? "One-time codes can be filled." : "One-time codes stay with you.";
  });

  for (const button of sitesBox.querySelectorAll("[data-remove-site]")) {
    button.addEventListener("click", async () => {
      await send("remove-site", { origin: button.dataset.removeSite });
      status.textContent = "Site removed.";
      await render();
    });
  }

  const grants = state.grants || [];
  const count = grants.length;
  const shared = Boolean(state.activeGrant);
  const interact = Boolean(state.activeGrant?.permissions?.includes("interact"));

  tab.innerHTML = shared
    ? `<div class="permission"><span>Current tab</span><span class="on">Shared</span></div>
       <div class="meta">${escapeHtml(state.activeGrant.title || shortUrl(state.activeGrant.url))}</div>
       <div class="permission"><span>Read page</span><span class="on">Allowed</span></div>
       <div class="permission"><span>Click & fill</span><span class="${interact ? "on" : ""}">${interact ? "Allowed" : "Blocked"}</span></div>
       <p class="hint">Interaction is per-tab. OTP requires approval for the website in Dashboard and the code switch above. Password, payment and file fields stay blocked.</p>
       <button class="${interact ? "secondary" : "primary"}" id="toggle-interact">${interact ? "Disable click & fill on this tab" : "Enable click & fill on this tab"}</button>
       <button class="secondary top-gap" id="revoke">Stop AI access on this tab</button>`
    : `<div class="permission"><span>Current tab</span><span>No access</span></div>
       <p class="hint">Share this tab read-only first. It stays shared while this tab is on this site. You can separately enable click & fill after sharing it.</p>
       <button class="primary" id="grant" ${state.connected ? "" : "disabled"}>Share this tab</button>`;

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
    status.textContent = "Read-only access granted.";
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

  const windowShare = state.windowShare;
  sharedTabs.innerHTML = `
    <div class="permission"><span>Shared tabs</span><span>${count}</span></div>
    ${windowShare?.tabs ? `<button class="primary" id="share-window" ${state.connected ? "" : "disabled"}>Share all ${windowShare.tabs} tab${windowShare.tabs === 1 ? "" : "s"} in this window</button>
    <p class="hint">Turns on read and Click & fill for every web page in this window, and keeps it while each tab stays on its site. Chrome asks once for the sites. They then appear under Allowed sites, where your AI can also open tabs, until you remove them.</p>` : ""}
    <div class="shared-list">
      ${grants.map((grant) => {
        const grantInteract = grant.permissions?.includes("interact");
        return `<div class="shared-item">
          <div class="shared-copy">
            <strong>${escapeHtml(grant.title || shortUrl(grant.url) || "Shared tab")}</strong>
            <span>${escapeHtml(shortUrl(grant.url))}</span>
            <small>${grant.opened ? "Opened by your AI" : grantInteract ? "Read + click/fill" : "Read only"}</small>
          </div>
          <button class="icon-button" data-revoke-tab="${grant.tabId}" aria-label="Stop sharing this tab">×</button>
        </div>`;
      }).join("") || '<p class="empty">No tabs shared yet.</p>'}
    </div>
    ${count > 1 ? '<button class="secondary top-gap" id="revoke-all">Stop access on all shared tabs</button>' : ""}
  `;

  document.querySelector("#share-window")?.addEventListener("click", () => {
    const share = async () => {
      const result = await send("share-window-tabs", { windowId: win?.id });
      if (result?.error) {
        status.textContent = result.error;
        return;
      }
      status.textContent = "Shared " + result.shared + " tab" + (result.shared === 1 ? "" : "s") + " with read and Click & fill."
        + (result.skipped?.length ? " Not allowed: " + result.skipped.map(shortUrl).join(", ") + "." : "");
      await render();
    };
    const fail = (error) => {
      status.textContent = error instanceof Error ? error.message : String(error);
    };
    if (!windowShare.sites.length) {
      share().catch(fail);
      return;
    }
    // Requested straight from the click, as Chrome requires.
    chrome.permissions.request({ origins: windowShare.sites }).then((granted) => {
      if (!granted) {
        status.textContent = "Not allowed.";
        return;
      }
      return share();
    }).catch(fail);
  });

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
