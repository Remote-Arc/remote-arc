# Remote Arc Browser

Chrome companion for Remote Arc. Version 0.4.

## Sharing modes

- **Share this tab:** One click grants read and click/fill access on the active eligible web page. The user can reduce that tab to read-only or revoke it.
- **Share all tabs:** One deliberate switch asks Chrome for optional http/https site access, shares all eligible open tabs, and automatically shares newly opened tabs and navigated pages. The user can exclude any individual tab.
- **Stop sharing all tabs:** Immediately clears browser grants and removes the optional broad Chrome site permission. Manual per-tab sharing can still be used.
- Sharing state is saved only for the current browser session, so a browser restart requires enabling the global mode again. Background service-worker sleep does not erase the grants.
- Special Chrome/extension pages, recognized sign-in/payment/secret-manager surfaces and unavailable tabs cannot be auto-shared. The extension shows a skipped count.
- Recognized password, one-time-code, payment card and file upload fields are not fillable. This is a best-effort field classification, not a guarantee for sites with incorrect markup.
- All interactions use fresh page snapshots and element references; a stale ref is rejected. AI clicks may still submit forms or have external effects. Do not turn on global sharing during private browsing or while handling sensitive accounts.
- Tools do not return raw HTML, form field values, cookies, browser history or credentials.
- The browser device must be paired; turning on Share all tabs is an explicit local Chrome user action. The AI cannot grant itself whole-browser host permissions over MCP.

## Read tools

- browser_list_tabs
- browser_get_current_tab
- browser_read_page
- browser_get_selected_text
- browser_extract_links
- browser_extract_table

## Interactive tools

- browser_click
- browser_fill

## Setup

1. Open `chrome://extensions`, enable Developer mode and load the packaged unpacked extension.
2. Pair the browser with Remote Arc using the extension popup.
3. Choose **Share this tab** or **Share all tabs**. The latter needs a Chrome site-permission prompt if that permission was not previously granted.
4. The AI lists shared tabs, reads a tab snapshot, then clicks or fills using its returned snapshot ID and ref.
5. Turn off Share all tabs before handling confidential pages. Chrome removes the optional site access automatically when global mode is disabled.

Existing independently paired computer tools and normal MCP permissions are unchanged.
