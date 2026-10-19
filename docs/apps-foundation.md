# Native Apps foundation

Remote Arc runs its own connector infrastructure and calls provider APIs directly. There is no Lindy or Composio runtime dependency. The default product model is Remote Arc-owned OAuth clients with per-user consent; end users do not register developer applications. User-owned API credentials are supported for Runway and WhatsApp Business; the remaining 27 connectors use platform-managed OAuth. Enterprise-owned OAuth clients and remote official MCP adapters remain future extensions.

## Implemented surface

The registry now contains 29 native API integrations in eight categories: 27 OAuth connectors and two user-owned API credential connectors. See [Apps expansion and release gates](apps-expansion.md) for exact scope and costs. Each operation has a bounded schema and fixed provider URL. There is no arbitrary HTTP execution tool.

The authenticated App host exposes:
- `GET /api/apps`: provider configuration state, available operations and the current user's connections.
- `POST /api/apps/authorize`: creates an expiring, single-use OAuth request for the selected provider and permissions.
- `GET /api/apps/oauth/:provider/callback`: consumes that user's state, exchanges the code, identifies the account and encrypts its credentials.
- `POST /api/apps/connections`: validates a user-owned API credential, settings, usage consent and daily operation limit.
- `PATCH /api/apps/connections/:id`: changes local connection permissions when the upstream grant supports them.
- `DELETE /api/apps/connections/:id`: immediately removes local capability, cancels pending approvals, and attempts upstream revocation.
- `POST /api/apps/connections/:id/check`: verifies the account at its provider, refreshes an expired token when possible, and reports tool-grant coverage under normal call/provider limits. It does not write provider content or certify every operation.
- `POST /api/apps/call`: validates a connection, operation, arguments and stable request ID, then executes within the provider grant. Writes also require the AI client's `apps:write` scope; Remote Arc adds no separate per-action approval.
- `GET /api/apps/approvals`: compatibility read of historical records. Manual approval submissions return HTTP 410 and cannot execute a legacy pending write.

Writes require the App origin; POST/PATCH requests also require JSON. Every route authenticates the real session. OAuth state, tokens, action arguments and results are owner-bound. Token storage uses AES-256-GCM with authenticated owner/provider/record context. Refresh leases and connection generations prevent refresh/disconnect races from reactivating a disconnected connection.

The optional MCP tools are `list_apps` and `call_app`. They require incremental `apps:read` and `apps:write` scopes; the existing core tool set and default OAuth scopes are unchanged. The runtime can also be reused by the future Agent, with the same user identity and policy checks.

## Workspace experience

The Apps directory separates discovery from account management. Compact cards show an App's purpose, native tool count and connection state. All, Available and Connected filters distinguish the catalog from providers currently configured for account connection; a configured provider is not proof that every tool has passed a real-account test. Connections needing reauthorization stay in the Connected view.

OAuth Apps connect directly from their card. Manage opens a side panel for account checks, reconnection, disconnection and adding another account. Tools in the same panel can be searched and expanded; copying an instruction does not execute it. API credentials and Shopify store details are entered inside the panel, with billing notes and Runway attribution retained. Closing the panel clears unsubmitted credentials. Preview mutations are disabled, including form submissions.

## Writes and uncertainty

Connecting enables all implemented tools covered by the provider grant. The normalized request is encrypted and recorded with its owner, connection generation and stable request ID. There is no second local write switch or per-action approval queue. Reconnecting or disconnecting fences older requests. A pre-upgrade pending write is cancelled rather than silently dispatched.

Slack and calendar targets are read immediately before dispatch where supported. Calendar updates/deletes use the current entity tag. This checks the resource without waiting for another approval. Provider authorization, file access and workspace policy remain authoritative.

A single database compare-and-swap owns execution. Reusing the same request ID returns its previous state/result. A changed payload under that ID is rejected. An uncertain dispatched write is not automatically retried. The same ID must be used when inspecting an existing operation.

Success currently means **provider acknowledgement**. It is not a claim of independent semantic verification, email delivery, or the correctness of provider content. Provider content remains untrusted data, never permission to act. Real-account acceptance and provider-specific result verification remain release work.

## Deployment and acceptance

The original migrations are `0030_apps_ecosystem.sql` and `0031_apps_registry_and_usage.sql`; the second preserves existing connections and dependent records. Runtime availability requires `ENABLE_APPS=1`, an existing token vault and provider configuration. Check `/api/apps/status` and the operator preflight for current configuration metadata. Never rotate an existing vault key merely to configure another provider.

See [registration and real-account acceptance](apps-oauth-registration.md) for the fifteen platform registrations, 27 OAuth callback URLs and two user-owned API credential connections, least permissions, credential names, provider review requirements, and isolated account tests. Real external writes must use approved test destinations.

Run `pnpm coverage:apps` to enforce 90% coverage per metric for each Apps core module, using actual source, the real SQLite schema and mocked provider protocols. The same runtime cases run in the normal security suite. Full TypeScript coverage keeps existing floors. Connection checks cover identity, refresh, grant coverage, revocation, ownership and races. Browser acceptance covers tools, reconnection, checks, disconnection, disabled configuration and session expiry in both locales/themes and desktop/mobile sizes.

## Scaling direction

Provider adapters reuse shared auth, vault, ownership, request journals, quotas and usage controls. Add versioned actions and contract tests instead of copying a backend per app. Discovery paginates/searches the catalog and loads schemas on demand. The 29-app registry has not been load-tested as a hundreds-app catalog.

Separate supported catalog size, actual enabled connections, operation depth, active-user counts and API call volume. Idle connectors should not require a dedicated process or polling loop. Provider review and maintenance remain per-integration work; upstream costs and limits must be tracked separately from hosted-model inference.

Production rollout is explicitly enabled by the combined release configuration, after protected migration/backup and vault provisioning. Missing provider clients remain unconfigured. Per-provider real-account trials follow publication at the owner’s request.
