# Apps: developer registration and end-user authorization

Status: OAuth implementation merged; production platform clients still require operator registration and configuration. Check live `/api/apps/status` for current readiness. A code release and an OAuth configuration flag do not establish real-account acceptance.

## Two separate responsibilities

Remote Arc registers one developer application per identity platform, configures its callback URLs, and stores its client credentials on the server. This identifies **Remote Arc** on the provider's consent screen. A developer registration grants access to no user's mailbox, calendar, repositories, or workspace.

Each end user signs in to Remote Arc, chooses an App, and authorizes their **own account** on the provider's site. The resulting connection belongs to that Remote Arc user. For Remote Arc-managed OAuth integrations, users do not register developer applications, enter client credentials, or share passwords with Remote Arc. Two API-credential connectors instead use credentials from the user’s own API account/project; X now uses Remote Arc-managed OAuth and platform-project API billing. See [the expanded catalog and release gates](apps-expansion.md).

The product flow is: Apps → choose an integration → provider consent → return with the connected account and status. Implemented read/write tools are enabled within the provider's granted scopes; Remote Arc does not add a separate per-action approval. Reconnect when access is revoked or new tools need additional scopes. “Check connection” verifies identity, token refresh and grant coverage; it does not certify every tool or execute a content write.

## Product model and scaling

Remote Arc owns and operates the connector platform. Lindy and Composio are product references, not runtime dependencies, OAuth brokers, or credential custodians for this implementation.

The default model is **Remote Arc-managed developer applications**: Remote Arc registers its own platform clients once and each user authorizes their own account. Enterprise-owned OAuth clients are a separate future option, not the current end-user setup flow and not implemented by this global-client configuration.

For a larger catalog, reuse authentication, encrypted credential storage, refresh, user isolation, request journals, rate limiting, and usage accounting. Give each integration its own versioned definition and bounded actions. Discover actions on demand instead of exposing hundreds of schemas to the model at once. Keep unused integrations idle rather than running a polling service per listed app.

Publishing an integration requires real executable actions and acceptance checks. An icon or catalog entry alone does not establish support. Provider review, API changes, credential rotation, troubleshooting, and paid upstream services remain costs even when OAuth registration itself has no fee. An enterprise-owned client does not automatically move token storage out of Remote Arc or eliminate provider approval requirements.

API quotas and charging rules must be verified per provider and environment before activation. Google Workspace has announced changes to API daily thresholds and scaled usage; do not assume Gmail or Calendar API usage remains unlimited or universally free. Slack's commercially distributed integrations require the appropriate Marketplace distribution path; template/BYO apps are not a general substitute for that review.

References: [Google Workspace API scaling](https://developers.google.com/workspace/tools-safety), [Slack commercial app distribution and rate limits](https://docs.slack.dev/changelog/2025/05/29/rate-limit-changes-for-non-marketplace-apps/).

## Prepared registration configuration

Generate a configuration pack directly from the runtime provider catalog and callback function:

```sh
pnpm --filter @remotearc/relay exec tsx scripts/apps-registration.ts --origin https://mcp.remotearc.app
```

This command makes no network requests and reads no secrets. It prints registration fields, a Slack manifest, scopes, callback URLs, and server secret **names**. It does not register applications, deploy anything, or enable Apps.

Use the actual HTTPS App origin of the environment being registered. Production currently uses `https://mcp.remotearc.app`; do not use the marketing domain or a PR preview URL. Register separate development/staging applications where practical and keep credentials, token keys, user connections, and databases isolated. A staging endpoint must be deployed and its login/session flow verified before its callback URLs are offered to users.

| Platform | Connector callbacks at the current production App origin |
| --- | --- |
| GitHub | `https://mcp.remotearc.app/api/apps/oauth/github/callback` |
| Slack | `https://mcp.remotearc.app/api/apps/oauth/slack/callback` |
| Google | `https://mcp.remotearc.app/api/apps/oauth/gmail/callback`, `https://mcp.remotearc.app/api/apps/oauth/google_calendar/callback` |
| Microsoft | `https://mcp.remotearc.app/api/apps/oauth/outlook/callback`, `https://mcp.remotearc.app/api/apps/oauth/microsoft_calendar/callback` |

The original four platform registrations cover six initial connectors. The generated pack covers fifteen identity platforms for 27 OAuth connectors plus two user-owned API credential connectors. The table lists original callbacks; the pack is authoritative for all callbacks and scopes. Standard connection requests the supported read/write scope set. Each user still grants consent on the provider site.

## GitHub

Create an organization-owned OAuth App in [Remote-Arc organization application settings](https://github.com/organizations/Remote-Arc/settings/applications). Use the generated name, homepage, and exact callback. Keep expiring user access tokens enabled and device flow disabled. Store its client ID and secret as `APP_GITHUB_CLIENT_ID` and `APP_GITHUB_CLIENT_SECRET`.

The current direct adapter uses authorization-code OAuth with S256 PKCE, `read:user`, `repo`, and `offline_access`. GitHub's OAuth `repo` scope is broad and includes upstream write access; tools remain bounded by the account's provider grants and the AI client's MCP scope. A future GitHub App adapter can provide repository selection and finer provider permissions; it must have its own implementation and acceptance tests.

Organization policy or SSO can require approval from the user's organization administrator even after personal consent. Report that state to the user; do not ask them for another account's token.

Reference: [creating an OAuth App](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app), [authorizing OAuth Apps](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps).

## Slack

At [Slack's app dashboard](https://api.slack.com/apps), choose Create New App → From a manifest and import the generated `slack.manifest` object. Choose the development workspace as the app owner; it is not a shared workspace connection for all Remote Arc users.

The adapter uses a **user token**, so configure the generated User Token Scopes rather than Bot Token Scopes. The expanded tools include public/private conversations, DMs, search, profiles, files, messages, reactions, pins and bookmarks within the user's actual workspace access. The generated manifest lists the required scopes for all 35 tools. Enable token rotation, register the exact redirect URL, and configure distribution for external workspaces before public onboarding. Reinstall or reauthorize older connections after adding scopes.

Store Basic Information → App Credentials as `APP_SLACK_CLIENT_ID` and `APP_SLACK_CLIENT_SECRET`. Do not put a developer's `xoxp-` or `xoxb-` token into these fields. Workspace administrators may need to approve installation.

Reference: [manifest schema](https://docs.slack.dev/reference/app-manifest/), [OAuth installation](https://docs.slack.dev/authentication/installing-with-oauth/), [token rotation](https://docs.slack.dev/authentication/using-token-rotation/).

## Google: Gmail, Calendar, Drive, Docs and Sheets

In [Google Cloud](https://console.cloud.google.com/auth/overview), select a project for Remote Arc Apps and enable the Gmail, Google Calendar, Drive, Docs and Sheets APIs for the priority connectors. Configure the brand, authorized domain, support contact, homepage, privacy policy, and terms using the real public product details. Create a Web application OAuth client and register each enabled connector's exact callback from the pack. The pack also includes other Google catalog providers; configure their required APIs and eligibility separately.

Use a dedicated Apps client. Do not silently reuse the existing Google login client: login and mailbox/calendar grants have separate purposes and revocation behavior.

For the dedicated Apps client, select **Use this client for an AI-powered agent** when creating it. Google's official Workspace MCP servers require this setting; the current Remote Arc adapters call native REST APIs and do not depend on those preview servers. Keep the normal Google sign-in client separate. See [Google's Workspace MCP client configuration](https://developers.google.com/workspace/guides/configure-mcp-servers).

The audience must support external users for a public product. Start in Testing with explicitly listed testers. Declare the generated scopes under Data Access. Gmail `gmail.readonly` and `gmail.modify` are restricted scopes; public launch needs the applicable verification and, depending on data handling and exceptions, a security assessment. Testing-mode refresh tokens for these scopes normally expire after seven days. Calendar verification requirements also depend on the selected scopes. Do not present testing-mode access as production-ready for arbitrary users.

In Audience → Add users, commit each tester email, save, then reload the page and confirm the account appears in the persisted test-user table. An email chip in the unsaved editor is not sufficient. A `403 access_denied` saying the app is being tested can result when this list does not contain the authorizing Google account; retry with a new authorization request after saving. This is separate from `redirect_uri_mismatch`. Never publish an unreviewed restricted-scope app as a workaround.

Store the new client's credentials as `APP_GOOGLE_CLIENT_ID` and `APP_GOOGLE_CLIENT_SECRET`. Each connector has a separate per-user connection and provider grant, even though they share the developer client. Drive requests metadata/content read access and retains `drive.file` for writes. Do not promise write access to every pre-existing Drive file: write operations apply to files available to that integration. This change does not request the full-Drive `drive` scope.

Reference: [web-server OAuth](https://developers.google.com/identity/protocols/oauth2/web-server), [Gmail scopes](https://developers.google.com/workspace/gmail/api/auth/scopes), [restricted scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification), [refresh-token lifetime](https://developers.google.com/identity/protocols/oauth2).

## Microsoft: Outlook mail and Outlook Calendar

Create a registration in [Microsoft Entra](https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade). Choose accounts in any organizational directory **and personal Microsoft accounts**, matching the adapter's `common` authority. Register both callbacks as **Web** redirects. Do not enable implicit grant or public-client flows.

Configure delegated Microsoft Graph permissions, not application permissions: `User.Read`, `Mail.Read`, `Calendars.Read`, plus `Mail.ReadWrite`, `Mail.Send`, and `Calendars.ReadWrite` for supported writes. The OAuth request includes `offline_access` for refresh tokens. An enterprise tenant can require its administrator's consent under its own policies.

Create a client secret, record its expiry in the operator's secret manager, and use its **Value**, not its Secret ID, for `APP_MICROSOFT_CLIENT_SECRET`. Store the Application (client) ID as `APP_MICROSOFT_CLIENT_ID`. The shared platform client does not share one user's mailbox or calendar with other users.

Reference: [register an application](https://learn.microsoft.com/en-us/graph/auth-register-app-v2), [authorization-code flow](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow).

## Server configuration and activation

All configured platform client ID/secret pairs and the token vault key are server-side configuration. Never commit them, put them in browser variables, send them through an AI prompt, or ask end users to supply them. Enter credentials through the deployment platform's secret mechanism; the client IDs can also be stored there for consistent operations.

### Adding a client

Keep App OAuth clients only as Cloudflare Worker secrets, not GitHub secrets, so there is one place to manage them. From a machine where Wrangler is signed in to the Remote Arc Cloudflare account, run these in `apps/relay` and paste each value at the prompt so it never appears in shell history or logs:

```sh
pnpm exec wrangler secret put APP_<PLATFORM>_CLIENT_ID
pnpm exec wrangler secret put APP_<PLATFORM>_CLIENT_SECRET
```

Vercel also needs `APP_VERCEL_INTEGRATION_SLUG`. Check `/api/apps/status` afterwards; the provider reports `ready: true` once its pair is present.

`APP_META_GRAPH_VERSION` is a plain Worker variable in `wrangler.jsonc` (currently `v26.0`). With it set, WhatsApp Business is ready, because users connect it with their own Cloud API credentials. Facebook, Instagram and Meta Ads also need the Meta OAuth client.

### Remaining platforms by effort (as of 2026-10-31)

Production `/api/apps/status` reports 14 providers ready: GitHub, Slack, Notion, Runway and the ten Google providers (Gmail, Calendar, Drive, Docs, Sheets, Slides, YouTube, Search Console, Analytics and Ads, which share one client). The rest need a client registered in each provider's developer console with the exact callbacks from the generated pack.

| Effort | Platform (providers it unlocks) | What the registration involves |
| --- | --- | --- |
| Self-serve, minutes | Atlassian (Jira, Confluence) | OAuth 2.0 (3LO) app in the Atlassian developer console; enable sharing for other sites. |
| Self-serve, minutes | Linear, Asana, Airtable, Supabase | OAuth application in the provider's developer settings. |
| Self-serve, minutes | Dropbox | App Console app; development mode has a user cap until production approval. |
| Self-serve, minutes | HubSpot | Public app in a developer account; Marketplace listing is optional. |
| Self-serve, minutes | Vercel | Integration in the Vercel dashboard; also set `APP_VERCEL_INTEGRATION_SLUG`. |
| Medium | Microsoft (Outlook, Outlook Calendar, OneDrive, Excel, Teams, To Do) | Entra registration as above. One client unlocks six providers; work tenants may require admin consent or publisher verification. |
| Medium | Salesforce | Connected or external client app in a Salesforce org. |
| Review required | Meta (Facebook, Instagram, Meta Ads) | App Review and business verification for most permissions. |
| Review required | LinkedIn, Shopify | Product access approval (LinkedIn) or app distribution review (Shopify). |
| Paid API | X | Developer project with paid API access; calls are billed to Remote Arc. |

`APP_TOKEN_KEY` must be base64 encoding of 32 cryptographically random bytes. Generate it in the deployment environment and save it securely without printing it into chat or a build log. Existing encrypted connection and approval records depend on it; changing it without a migration invalidates those records. Separate environments require separate keys.

`ENABLE_APPS=1` enables the Apps runtime, which is already deployed. A provider still reports `ready: false` and cannot authorize until its required credentials and platform settings exist. Registering an OAuth client alone does not verify or activate a usable connection. Apply credentials through the protected deployment workflow without modifying or rotating `APP_TOKEN_KEY`.

## Real-account acceptance

### Owner test snapshot — 2026-10-19

This is a dated configuration/acceptance record, not a claim that all 29 integrations or 221 tools are publicly verified. Tests used the signed-in owner's production Apps connections from a local browser. No model inference, payment, outbound mail, team messages or paid media generation was triggered.

| Provider | Configuration / connection | Actual check completed |
| --- | --- | --- |
| GitHub | Organization-owned OAuth client configured; owner connected | `repositories.list` succeeded with a one-item bound. No repository changes. |
| Google Calendar | Separate Apps OAuth client; API enabled; owner added as an explicit tester | `calendars.list` succeeded with a one-item bound. No calendar changes. |
| Google Drive | API enabled; owner connected with existing `drive.readonly` / `drive.file` request | `files.list` succeeded with a one-item bound. No full-Drive write scope was requested. |
| Google Docs | API enabled; owner connected | Created a dedicated private test document, inserted test text using its current revision, then read it back and matched the text. |
| Google Sheets | API enabled; owner connected | Created a dedicated private blank spreadsheet in the owner's browser, wrote only `A1:B2` through the connector, then read back and matched all four cells. |
| Notion | Public OAuth client configured with content capabilities; owner connected | Created a dedicated private test page and explicitly added the connection to that page. `pages.get` matched its title. Created/read a test child page; replaying the same write request returned the same page. No workspace search. |
| Gmail | API enabled; owner OAuth and provider identity check succeeded | No mailbox-content or message-write acceptance. The extra `labels.list` tool is in the pending code release and was not available in the older production runtime. |
| Slack | Existing owner connection retained | No message reads/sends in this round; expanded scopes and tools need acceptance after the code release. |
| Outlook / Outlook Calendar | Not configured | Owner has no Remote Arc-controlled Entra tenant; Microsoft setup is explicitly deferred. |

Google remains **External / Testing**, with the existing basic sign-in client preserved and a separate agent-marked Apps client. The ten declared API scopes cover the five priority Google integrations. Scope declaration, API enablement and a Client ID/Secret pair do not make an unverified app available to arbitrary users; finish applicable branding/data-access verification before public onboarding. Other Google catalog providers still need their own API enablement and acceptance. Do not rotate the existing token vault key to configure these clients.

The test documents/pages are deliberately named `Remote Arc integration QA — 2026-10-19` and remain private for inspection. They are not product data. Production was running the older, smaller operation set during these checks; validate newly expanded operations only after the exact code revision is released.

1. Prioritize GitHub, Slack, Gmail, Google Calendar, Drive, Docs, Sheets, Notion, Outlook and Outlook Calendar. Connect a test user's own account, then connect a second Remote Arc user and confirm each can see only their own connections and results. Use “Check connection” to verify identity and grant coverage; this is not a substitute for checking actual tool results.
2. Test consent denial, missing permissions, provider/admin restrictions, expired/revoked tokens, refresh-token rotation, disconnect, and reconnection. Verify the UI shows the actual connection state and no token appears in the browser, logs, MCP responses, or model context.
3. Perform a read against a dedicated test repository/channel/mailbox/calendar and compare the result with the provider UI.
4. Run an explicitly requested write against a dedicated test resource and verify it at the provider. Use a specifically authorized test channel or email recipient. There is no separate Remote Arc approval step. Repeat the request ID and confirm no duplicate action.
5. Revoke or change a connection during an operation, test concurrent submissions, and confirm older generations cannot dispatch. Simulate a write timeout and confirm it is not automatically repeated. Pre-upgrade pending writes must stay cancelled.
6. Verify both themes and mobile layouts, reconnect links, API/MCP scope upgrades, and regression of existing devices, MCP tools, and Routines.

Protocol mocks and SQLite tests provide development coverage. They do not replace these real-account checks.

## How this differs from Composio

[Composio managed auth](https://docs.composio.dev/docs/authentication/custom-app-vs-managed-app) supplies developer OAuth applications for supported integrations. Its customers can skip those registrations, while every end user still grants consent for their own account. Composio stores and refreshes those connected-account credentials. Using a customer's own OAuth client is also supported for branding, scopes, and quotas.

This implementation uses Remote Arc's own direct adapters and credentials. The product follows a comparable user-authorization experience while retaining its own authentication, execution, request journals, and cost controls across Connect and Arc Agent. Neither Lindy nor Composio is part of the runtime or deployment architecture.


## Read-only production readiness preflight

Use the registry-derived operator check before and after configuring each identity platform:

```sh
pnpm --filter @remotearc/relay apps:preflight
pnpm --filter @remotearc/relay apps:preflight --json
pnpm --filter @remotearc/relay apps:preflight --require-p0
```

This tool queries only the **public metadata** endpoint. It does not access Cloudflare secrets, create provider OAuth applications, authenticate any user, modify D1, or trigger provider API costs. It shows group-level Client ID/Secret **names** and exact callback URLs; ready means configured, not tested.

Prioritize GitHub, Google, Slack, Microsoft and Notion. After registration, confirm provider API enablement, external consent/review eligibility, token rotation, and end-to-end operations with a specifically authorized test account. Mark a provider live-verified only after it successfully reads, and where permitted writes to, a dedicated test resource. Provider review may take longer than this engineering work.
