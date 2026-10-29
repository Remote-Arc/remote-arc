# Apps expansion: implementation and release status

Remote Arc Connect owns the Apps connection and execution layer. It works with compatible MCP clients without an Arc Agent deployment or hosted model. Lindy and Composio are references only; neither is a dependency. This implementation calls native provider APIs through bounded adapters. It does not borrow credentials or private tools from ChatGPT plugins, and it does not claim that every App exposes an official MCP server.

The catalog contains **37 integrations in eight categories**. The homepage floating hero features GitHub, Vercel, Runway, Drive, Notion and Slack. The preserved lower live demo and the Arc page share three schema-checked App examples: GitHub + Vercel → Slack, Runway balance → generation → task output, and Drive → Notion page. These are explicitly simulated, with no real provider execution. The Arc directory comes from the same executable registry; Arc Agent remains in development and Connect Apps rolls out independently. Run `pnpm --filter @remotearc/relay exec tsx scripts/apps-directory.ts` after registry changes; CI checks it with `--check`. Logos are genuine vendor marks; new asset sources are in `apps/ui/public/app-brands/SOURCES.json`.

## Authentication and scope

There are **35 OAuth connectors across 18 identity platforms**: GitHub, Slack, Google, Microsoft, Meta, Atlassian, Notion, Shopify, LinkedIn, HubSpot, Salesforce, Vercel, Linear, Supabase, X, Dropbox, Asana and Airtable. Remote Arc registers the provider applications once, and each user subsequently authorizes their own account. This is independent of signing in to Remote Arc itself.

**Two** connectors accept the user's API credentials: Runway and WhatsApp Business. Credentials are submitted only through the authenticated Apps form, validated against the provider, then encrypted with account-bound AES-GCM. API keys are not passed to an MCP model. X uses a managed confidential OAuth application, not user-supplied API tokens; its developer-project API consumption is billed to Remote Arc.


Shopify validates a strict myshopify.com tenant and callback HMAC. Its initial support creates draft products, never automatically publishes them. Reading orders requires Shopify's applicable protected-customer-data approval. Atlassian uses Remote Arc's own 3LO application and authorized cloud IDs. Notion requires integration capabilities and user-selected shared pages. Instagram requires an eligible professional account linked to a Facebook Page. WhatsApp requires the user's Cloud API business account and owned phone number; free-form text remains subject to the provider's conversation-window rules.

Pin a supported Meta Graph API version using `APP_META_GRAPH_VERSION`. Google Ads uses v26. Its access level belongs to the Google Cloud project owning the OAuth client. Developer tokens were sunset on September 9, 2026 and are no longer mandatory; a configured legacy token is optional. Project access approval and the account OAuth grant remain required. Request only the documented scopes/capabilities for the actual supported operations. Provider reviews, business verification and distribution approval cannot be replaced by adding an icon or enabling a flag.

## Operations and authorization

Browse `list_apps` by category, query and cursor to find connection IDs and action IDs. `run_app_read_action` and `run_app_write_action` each list their operations (reads and writes respectively) as typed `{action, arguments}` variants in the input schema and use a user-owned connection and stable request ID. Expanding the catalog grows those two schemas rather than adding a tool per operation; keep new operations' schemas compact.

The catalog contains 344 unique operations. Each of the 37 Apps has at least eight operations, including at least three writes. YouTube now manages playlists and playlist items; Search Console manages sitemaps and account properties; GA4 manages custom dimensions; Google Ads can pause existing ads or create labels. Social writes include posting, editing and selected deletion/comment workflows. Runway supports balance, task status, Gen-4.5 text-to-video, Gen-4 image generation and Gen-4 Turbo image-to-video. New productivity Apps cover Google Slides, OneDrive, Excel, Teams, To Do, Dropbox, Asana and Airtable. See the generated [per-App write inventory](apps-tool-coverage.md). Supabase arbitrary SQL is always classified as a write, including SELECT, since SQL can have side effects.

Connecting enables implemented read/write tools within the account's granted provider scopes. Existing connections retain their saved scopes: newly required writes need explicit reauthorization. No token is silently upgraded. Google Slides reuses Google OAuth and the four Microsoft Apps reuse Microsoft OAuth, with additional callbacks and scopes configured. Dropbox, Asana and Airtable require their own registered provider applications. Excel Graph requires work or school OneDrive/SharePoint workbooks and delegated Files.ReadWrite even for reads; Teams requires an eligible work or school account. MCP writes additionally require `apps:write`; Remote Arc does not add a separate per-action approval. Instagram publication requires the successful source media-creation call from the same user/connection. Runway validates the model, duration, credit estimate and requested estimate ceiling before dispatch. Gen-4.5 estimates 12 API credits/second, Gen-4 Turbo five per second and the supported Gen-4 720p image request five per image, checked against the request's `maxCredits`; this is an estimate gate, **not a provider-enforced monetary spending cap**. Provider prices can change. Use provider-side budgets to control actual account charges.

The authenticated Apps UI offers **Check connection**, backed by `POST /api/apps/connections/:id/check`. It checks the provider identity, refreshes an expired token when possible, and reports tool eligibility using the same permission gate as execution. Revoked accounts require reconnecting; partial grants retain existing authorized tools and show an access update. A check uses the existing Connect allowance and provider/connection limits, performs no content write and does not establish that every operation has succeeded. Drive retains its current `drive.file` write scope: operations can create or update files available to that integration, not arbitrary existing files throughout the user's Drive.

Each execution is claimed once in SQLite. Concurrent retries cannot duplicate writes; an unknown dispatched write is never automatically retried. Provider acknowledgements are not independent semantic verification or delivery guarantees. Results are marked untrusted and returned credential fields are stripped.

## Cost ownership

Using a user's Runway API key spends that API organization's credits. Web-subscription credits are separate unless Runway enables an organization transfer. X reads and writes may both consume API credits belonging to the developer project behind the user's token. WhatsApp messages can be billed to the user's Business account. Vercel/Supabase infrastructure usage follows the user's project plan.

OAuth does not universally place API charges on the end user. Some quotas or fees belong to the developer project, and the service must account for them. There is a per-connection daily **operation** limit (API-key connections default to 25) and atomic provider-wide daily operation limit (`APP_DAILY_PROVIDER_LIMIT`, default 1000). An operation can involve more than one upstream HTTP request; these limits are not exact financial caps. Credential validation can itself use provider quota and requires explicit consent in the API-credential form.

Remote Arc still pays for its Workers/database/storage, development, maintenance, provider review and incident support. An idle listed adapter has no dedicated process, model call or automatic polling loop. Hundreds of adapters can share the runtime, but registration, policy review and maintenance do not become zero-cost.

## Release gates

Apps runtime is now enabled in production, but individual provider readiness is explicitly configuration-gated. An enabled Apps directory does **not** mean individual OAuth clients are registered, publicly approved or live-account tested. The public `/api/apps/status` endpoint reports metadata-only provider readiness, not successful OAuth or API execution. For a read-only operational checklist, run `pnpm --filter @remotearc/relay apps:preflight`; `--json` produces a machine-readable summary and `--require-p0` exits nonzero when the priority five identity platforms still have unconfigured providers. Never dump real client secrets into reports.


Apply migrations 0030 and 0031 together in an isolated staging database first. Migration 0031 rebuilds both the provider table and its dependent call table, retaining existing IDs, encrypted credentials, action records and foreign keys. The upgrade test starts with populated 0030 tables, commits the migration and checks existing data and foreign-key integrity.

Before enabling production: register the provider applications, configure server secret names from the generated pack, validate exact staging callbacks and consent, run real-account acceptance using approved test resources, exercise token expiry/reconnect/disconnect, verify paid-provider billing ownership and confirm policy/review requirements. Release configured providers in stages; unconfigured providers remain visibly unavailable.

The automated suite uses actual source and SQLite with mocked upstream protocols. It covers all 31 additional providers and every added operation, but does not claim live provider acceptance. `pnpm coverage:apps` enforces 90% per metric **per Apps core file**. Browser QA covers categories, search, OAuth, Shopify tenant entry, API credential consent, reconnect and disconnect. Local connection-check cases cover success, partial grants, transient failure/retry and revoked accounts in EN/ZH, dark/light and desktop/mobile. PR previews keep mutation buttons disabled.

## Primary references checked

- [OpenAI MCP apps](https://developers.openai.com/plugins/concepts/mcp-server), [Composio's developer layer](https://docs.composio.dev/docs/how-composio-works)
- [Runway pricing](https://docs.dev.runwayml.com/guides/pricing/), [Runway API credits](https://help.runwayml.com/hc/en-us/articles/21668552945171-Runway-API-FAQs), [Runway attribution](https://docs.dev.runwayml.com/usage/attribution/)
- [X API billing](https://docs.x.com/x-api/getting-started/pricing), [Google Workspace API scaling](https://developers.google.com/workspace/tools-safety)
- [Atlassian 3LO](https://developer.atlassian.com/cloud/confluence/oauth-2-3lo-apps/), [Shopify auth](https://shopify.dev/docs/apps/build/authentication-authorization), [Linear GraphQL](https://linear.app/developers/graphql)
- [HubSpot OAuth token/introspection protocol](https://developers.hubspot.com/docs/api-reference/legacy/authentication/manage-oauth-tokens), [HubSpot version timeline](https://developers.hubspot.com/changelog/legacy-apis-and-legacy-apps-whats-going-unsupported-and-when?hs_amp=true)

API versions are explicit in adapters and must be reviewed when the provider deprecates them. HubSpot's v3 support timeline requires a migration before its announced September 2027 enforcement.

## Managed OAuth upgrades (2026-10-17)

Vercel external Integration installation, Linear user-actor PKCE, Supabase Management API OAuth, and X confidential-client PKCE now use Remote Arc-managed clients. There are 35 OAuth connectors across 18 identity platforms and two user-credential connectors: Runway and WhatsApp Business. Vercel and Supabase configure upstream scopes on the platform app; execution follows the connected account's provider grants. Vercel team access is fenced to the token-authorized installation. X API charges belong to Remote Arc’s developer project; do not enable automatic funding. See [cost ownership](apps-cost-ownership.md).

The owner chose production code release followed by their own account trial instead of requiring 37 separate real-account acceptance runs before release. Automated checks remain required. Registration, platform review and runtime credentials remain necessary; unconfigured connectors are not shown as ready.

## Discovery, writes and Skills quality (2026-10-21)

The Apps UI exposes write counts, persistent per-tool read/write badges and filters. Search matches operation names and descriptions. Broad MCP discovery includes read/write counts without schema dumps; selected tools return exact schemas and required scopes. The per-turn action index contains compact names and permissions; descriptions are loaded on demand so catalog growth does not inflate every model reservation.

Write contracts cover optional and empty field preservation, Excel range/matrix bounds, revision fences, connected tenant ownership, provider rejections, secret-value redaction and paid-generation estimate gates. Calls retain the existing durable ledger, request identity and unknown-write stop behavior. Vercel installation permissions must include environment variables; Supabase configured scopes must cover Edge Functions and secrets; existing provider clients need updated scope configuration and account reauthorization.

The Skills library grows from eight to sixteen substantial packages. See [Skills quality and real artifact verification](skills-quality.md) for source attribution, versioning, actual office inspector checks and data helper validation.

Google Ads compatibility was checked against the official [v22 sunset notice](https://ads-developers.googleblog.com/2026/09/google-ads-api-v22-sunset-reminder.html), [active versions](https://developers.google.com/google-ads/api/docs/upgrade) and [developer-token migration](https://developers.google.com/google-ads/api/docs/api-policy/developer-token).
