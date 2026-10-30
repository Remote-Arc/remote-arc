# Admin user activation

`GET /api/admin/operations` keeps the existing admin session requirement and metadata-only response. New query parameters: `activation`, `sort` (`usage`, `recent`, `activation_asc`, `activation_desc`) and literal name/email `query`. Selection happens in D1 before pagination. `filteredTotal` drives pagination; `activationCounts` covers the search-matched population across all pages.

Stages describe observed progress. Current connection status remains a separately verified registry snapshot.

| Stage | Evidence |
| --- | --- |
| Registered only | No observed MCP token issuance, computer pairing or successful use. This is not a plugin classification. |
| Plugin connected, no computer | Issued MCP OAuth token with a client ID in the operator-verified plugin allowlist; no computer-pairing history. |
| MCP connected, no computer | Issued MCP OAuth token; official plugin provenance unverified; no computer-pairing history. |
| Paired, no online record | Computer pairing has complete observed flow coverage since collection began; no successful WebSocket-upgrade step recorded. Never inferred from `last_seen`. |
| Reached online, no successful use | Authenticated computer WebSocket upgrade recorded; no successful operation/run evidence found. Does not mean currently online. |
| Activated | A successful device operation, App operation or Arc run is recorded. This is not proof an entire end-user goal completed. |
| Returning active user | Successful use on two or more distinct UTC dates, latest within the past seven days. Multiple operations in one day do not count as a return. |
| History incomplete | Prior computer pairing predates collection or lacks observed flow coverage, or charged calls exist without completion evidence. No claim of “never online/used.” |

Success uses server-side product events, successful device audit operations, `app_calls` and `arc_chat_runs` ledgers. Browser events, login/page views, discovery calls, failed/unknown runs and charged-call totals are not success evidence. Historical retention can remove old records: missing evidence does not establish that a user never performed an action. Browser companions are not computers.

## Plugin provenance

Optional Relay setting `PUBLIC_PLUGIN_OAUTH_CLIENT_IDS` is a JSON array of the actual client IDs verified by the operator against the public plugin's Platform configuration. Example value: `["the-verified-client-id"]`. Do not derive this from a dynamic client's display name, a self-registered callback URL, account email or device count. A token for another resource does not establish this MCP connection. OAuth issuance history and currently valid connections are reported separately, including revoked/expired grants.

Default is an empty allowlist. Until official IDs are verified and configured, real OAuth users appear as “MCP connected” with “plugin source unverified.” This avoids falsely calling custom ChatGPT/Claude/Codex connections official-plugin installs. No production client IDs are assumed or set by this change. Only counts, dates and a reported client display name are returned; token hashes, grants, callback URLs and credentials are not exposed.

No database migration, OAuth-flow mutation, user email or external message is required. This PR does not change the already-published plugin package.
