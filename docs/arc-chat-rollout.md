# Arc Chat and trial rollout

This change prepares the real hosted agent runtime, a 14-day account trial and the public UI. PR previews are read-only fixtures; they do not call models or production apps. Provider account OAuth setup continues independently.

## Current release: Connect only

Arc is not publicly open. Keep `ARC_CHAT_ENABLED=0` in the Worker and `ARC_WORKSPACE_AVAILABLE=false` in the UI until the platform models, budgets and real execution flows are ready. The workspace picker labels Arc **Coming soon**; old Arc links resolve to Connect, and the PWA launches Connect Overview. Marketing links do not activate a trial. The runtime also blocks previously persisted model decisions from dispatching new tools while disabled; uncertain actions retain their unknown status.

For a later Arc release, verify actual platform-funded conversations, Apps execution, device selection, cancellation, task/routine scheduling, and usage settlement before changing both gates in a reviewed release. The UI fixtures and automated HTTP-provider tests do not certify live provider credentials. Connect Apps remains available independently.

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

Paid hosted use requires a stored `arc_hosted` billing plan with `hosted_inference`. Premium models additionally require `paid_models` and an unexpired provider grant. Use the existing Admin model/billing APIs to provision these; the Connect Plus tier alone is not a hosted-model entitlement. Self-service paid checkout is not introduced by this change, and the website must not claim automatic billing.

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
