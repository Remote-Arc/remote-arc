# Remote Arc Browser

Chrome companion for Remote Arc (0.4.0). It lets an AI work in the user's own
browser, on sites the user allowed, or on single tabs the user shares.

## Security model

- No `<all_urls>` host permission, no Chrome `debugger` / CDP permission, no
  `tabs`, cookies, history or password access.
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
  separate per-tab permission. A shared tab loses access when it leaves its
  page, unless it moves to an allowed site.
- Password, payment-card and file-picker fields are never filled. One-time
  codes for sign-in or registration can be filled through `shared_tab_fill` or
  `shared_tab_act` after Dashboard approval for the website and with the local
  code switch enabled. See [browser authentication](../../docs/browser-authentication.md).
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
