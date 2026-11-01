# Remote Arc Browser

Chrome companion for Remote Arc (0.4.4). It lets an AI work in the user's own
browser, on sites the user allowed, or on single tabs the user shares.

## Security model

- No `<all_urls>` host permission, no Chrome `debugger` / CDP permission, no
  cookies, history or password access. The `tabs` permission lets **Share all
  tabs in this window** see which sites the window's tabs are on, so Chrome
  can ask for them in one prompt; tab addresses stay in the extension and the
  AI still sees only tabs that are shared.
- The only fixed host permission is the Remote Arc relay. Every other site is
  an optional host permission the user grants one site at a time through
  Chrome's own prompt (from the popup, or from the approval page the
  extension opens when the AI asks for a site). Removing the site in the popup
  or in Chrome's site settings removes the permission.
- On an allowed site the AI can open tabs (in the background, in a "Remote
  Arc" tab group) and read, click and fill there. A tab keeps access while it
  moves between allowed sites; on any other site it is paused until the user
  allows that site. The AI never sees tabs it did not open or the user did not
  share.
- A tab the user shares from the popup starts read-only. **Click & fill** is a
  separate per-tab permission. A shared tab keeps access, and Click & fill if
  enabled, while it stays on the same origin. It loses access when it moves to
  another site, unless that site is allowed. Chrome's `activeTab` has the same
  limit.
- **Share all tabs in this window** asks Chrome once for the sites of every
  web page in the window, then shares each of those tabs with read and Click &
  fill, as on an allowed site. The sites stay in Allowed sites until the user
  removes them. Browser pages and tabs in other windows are left out.
- A snapshot lists at most 250 controls: an open dialog first, then the page's
  own content, then site navigation, headers and footers. `omittedElements`
  says how many were left out.
- **One-time secrets**: when the AI needs an API key or token, `request_secret`
  sends the user to a Remote Arc page. The page encrypts the value to a P-256
  key this extension made for that one request (HKDF-SHA-256, AES-256-GCM), so
  the Relay forwards only ciphertext. The value waits in session storage
  (memory, out of reach of web pages and content scripts), is bound to the
  site named in the request, is filled once by `shared_tab_fill` or
  `shared_tab_act` with `secret`, and expires after 10 minutes. The AI holds
  only the handle. It is filled like any other value, so password, payment,
  CAPTCHA, code and file fields stay blocked for it too.
- Password, payment-card and file-picker fields are never filled. Public MCP
  connections require the user to complete sign-in, verification codes and
  CAPTCHAs in their browser, then resume the same task. Authentication automation
  is disabled for all Relay calls, including internal calls and legacy approvals. See
  [browser authentication](../../docs/browser-authentication.md).
  Detection uses input types and autocomplete metadata; sites that mislabel
  sensitive fields can bypass this classification.
- A click or Enter that sends something on the user's behalf (place order,
  pay, buy, post, comment, reply, send, submit, apply, delete, and their
  Chinese equivalents) is a final submit: it needs `effect=submit` and an
  `idempotency_key`, a key is sent once, and the same form and button is
  refused under a new key until the earlier one is confirmed
  (`action=confirm`, `outcome=succeeded|failed`). The record is kept for seven
  days in the extension's local storage.
- Interaction uses element refs from the latest snapshot; stale refs are
  rejected instead of being re-targeted. Snapshots never include field values.
- Clicks and keys are page events. A few sites that accept only real input
  may ignore them; Remote Arc Browser Runner (`browser_runner_*`) covers those.
- WebSocket device credentials are sent as a WebSocket subprotocol, not in
  the URL.

## Tools

Device tools (MCP names in brackets):

- Read: `browser_list_tabs` (`shared_tab_list`), `browser_read_page`,
  `browser_get_selected_text`, `browser_extract_links`,
  `browser_extract_table` (`shared_tab_read`), `browser_get_current_tab`.
- Interact: `browser_click` (`shared_tab_click`), `browser_fill`
  (`shared_tab_fill`), `browser_open_tab` (`shared_tab_open`), `browser_act`
  (`shared_tab_act`: click, fill, select, check, uncheck, press, scroll,
  fill_form, navigate, back, reload, wait, close, confirm).

The Relay allows `browser_open_tab` and `browser_act` wherever the paired
browser allows `browser_click`; the sites themselves are allowed in the
browser.

## Tests

- `pnpm test:browser`: page script and manifest checks in Node.
- `pnpm test:browser:e2e`: the extension in a real Chromium against local
  test sites and a stand-in Relay (orders sent once, a comment in a rich text
  box, a multi-page form, Enter to search, waiting, a site that is not
  allowed). Set `REMOTEARC_E2E_CHROME` to use a specific browser.

## Load locally

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Choose **Load unpacked**.
4. Select `apps/browser-extension`.
5. Open the extension and connect it to Remote Arc.
6. Allow a site from the popup, or click **Share this tab** on a normal page.
