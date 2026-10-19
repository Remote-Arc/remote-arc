# Arc Chat and trial rollout

This change prepares the hosted agent runtime, a 14-day account trial and the public UI. Independent PR previews provide interactive, per-tab simulated chats; they never call models, production Apps, devices or payments. Other preview account mutations remain disabled. Provider OAuth setup continues independently.

## Current release: Connect only

Arc is not publicly open. Keep `ARC_PLATFORM_ENABLED=0` and `ARC_CHAT_ENABLED=0` in the production Worker until models, budgets and real execution flows are ready. The UI uses the authenticated server response, not a hardcoded availability constant. In production the picker labels Arc **Coming soon**, old Arc links resolve to Connect, and the PWA launches Connect Overview. Marketing links do not activate a trial. The runtime also blocks previously persisted model decisions from dispatching new tools while disabled; uncertain actions retain their unknown status.

For a later Arc release, verify platform-funded conversations, Apps execution, device selection, cancellation, task/routine scheduling and usage settlement before enabling the server flags. UI fixtures and automated HTTP-provider tests do not certify live credentials. Connect remains independently available.

## Remote availability configuration

`GET /api/runtime-config` returns a versioned, uncached availability response with `execution: simulation | live | disabled`. It never includes credentials. Production availability requires the existing server feature flags and deployment readiness; Billing additionally requires its configured enablement. Missing or invalid configuration fails closed. Signed-in UI availability refreshes while visible and after returning to the tab; server execution checks apply immediately on every request.

Local UI development (`VITE_UI_PREVIEW=1`) and the isolated Cloudflare PR preview default to Arc enabled **in simulation only**. Open `/dashboard/agent/chat` or use the workspace picker. Preview chat history lives only in the current tab's memory and resets on reload; messages, tool results and usage are explicitly examples.

To close a deployed PR preview without changing source or rebuilding assets:

```sh
pnpm --filter @remotearc/relay exec wrangler preview secret put ARC_PREVIEW_ENABLED --config ../../apps/ui/wrangler.preview.jsonc --name pr-218
# Enter 0 at the secret prompt to close, or 1 to reopen this PR's simulation.
```

This publishes a Cloudflare preview configuration deployment. It does not enable production Arc or configure a model. Use the authorized Cloudflare account and confirm the preview name before running it. Local development reads `ARC_PREVIEW_ENABLED=0|1` from its environment / `.env.local`; refresh the page after a local environment change. No query-string or browser-storage value can enable production execution.

## Platform configuration

Users do not supply model API keys. An operator supplies the platform credentials interactively:

```sh
pnpm --filter @remotearc/relay exec wrangler secret put OPENAI_API_KEY
# Optional: enable the allowlisted Claude model.
pnpm --filter @remotearc/relay exec wrangler secret put ANTHROPIC_API_KEY
```

Reuse the existing `APP_TOKEN_KEY` used for encrypted App credentials. Do not replace it: conversations and task instructions also use that vault. No key belongs in source, browser storage or a chat message.

The protected production release must apply D1 migrations 0035–0037 and deploy the `ArcChatRuntime` Durable Object migration together with the Worker. The normal release workflow owns migrations and approval; do not separately deploy a stale UI or bypass its CI check.

`ARC_CHAT_ENABLED=1` is the feature flag. `GET /api/arc/status` is authenticated and reports whether a configured model, valid vault and Durable Object binding are present. Trial activation refuses to start its clock when platform setup is incomplete. A signed-in user explicitly activates with `POST /api/arc/trial` and `{"confirm":true}`. Repeated activation never changes the expiry.

## Limits and paid access

Defaults are platform USD 5/day, trial USD 0.10/day, Auto USD 0.05/day and premium USD 0.25 per provider for the complete trial. These are internal cost ceilings, not advertised currency credits. They are configurable through the `ARC_*_MICROS` variables. Trial limits are frozen at activation; existing administrator budget caps are never silently raised. Unknown model requests retain their reservation.

Each run is limited to 8 decisions, 24,000 model tokens and 180 seconds. Provider calls have bounded timeouts. A run survives closing the tab; cancellation prevents new tool dispatch. In-flight actions may finish. A durable dispatch marker prevents automatically repeating an uncertain effect after a restart.

Paid hosted use requires an active hosted billing entitlement and sufficient Credits. Premium selection additionally checks the account's model access. The prepared Stripe checkout and billing portal remain closed until configured and tested; a return URL never grants paid access on its own. See [platform launch](arc-platform-launch.md) and [Credits rollout](arc-credits-rollout.md) for the current self-service billing foundation.

## Tasks, routines and tools

One-off tasks and daily/weekday or interval routines are created and managed through chat. They reuse the existing leased task scheduler and keep their results in a persistent conversation. Native routines pause on failed or unknown outcomes or expired access. Daylight-saving gaps are skipped and repeated local times run once.

Arc uses the actual App dispatcher and device execution path. Connected Apps enable read and write operations within upstream OAuth scopes; no extra write switch or per-action approval is required. Existing pending approvals are cancelled on migration. Idempotency, tenant isolation, connection revocation, preconditions and upstream usage caps remain enforced.

Fleet selection checks online state, current tools, platform, trusted workspace and fresh capacity. It does not move projects implicitly or replay an uncertain write on another computer. Older agents without capacity telemetry are shown as unknown, not idle.

## Validation

```sh
pnpm --filter @remotearc/relay test:arc
pnpm --filter @remotearc/relay test:model-billing
pnpm coverage:apps
pnpm --filter @remotearc/ui test:workspaces
pnpm --filter @remotearc/ui test:arc-experience
pnpm typecheck
pnpm build:ui
```

The Arc integration suite uses actual SQLite migrations and HTTP handlers, encrypted state, budget reservations, the existing scheduler and the real App dispatcher. Model/provider HTTP is mocked. Production credentials are still required for real-model acceptance testing.
# Agent and Admin PWA

Both hosts use an installable standalone app with distinct manifests and launch destinations. The versioned service worker caches only static assets and a generic offline page. It never persists API responses, chat content, OAuth or authenticated HTML. Admin recovery removes old registrations and caches, and preserves the new `arc-shell-v2` worker. CSP includes its worker/manifest permissions and the exact bootstrap-script hash.

Verify with `pnpm --filter @remotearc/ui test:pwa`. Install entries are in Profile settings and the Admin sidebar. Preview deployments leave service-worker registration disabled; real installation is enabled on `agent.remotearc.app` and `admin.remotearc.app` after release.
