# Arc platform launch and billing

Arc users never enter a model API key. All hosted model credentials and payment configuration belong to Remote Arc. Connect continues to use the user’s own AI chat.

## Owner setup

The runtime remains closed by default. Complete code review and CI before enabling it. The owner setup command saves `ARC_PLATFORM_ENABLED=1` last, after all credentials pass validation and are saved. This enables chat, the wallet and billing together; ordinary code releases retain this Cloudflare Secret. The frontend reads readiness from the authenticated server response; a new frontend build is not required just to add model Secrets.

Run from the repository with Node.js 24 and pnpm:

```sh
pnpm arc:setup
pnpm arc:setup --configure
```

The first command is a dry run. The second prompts for platform OpenAI, Anthropic and Stripe keys with terminal echo disabled, verifies model access without generating tokens, registers the Stripe webhook, and saves the credentials in the existing Cloudflare Worker. It never prints credentials or publishes application code. Cloudflare Secret updates take effect on the currently deployed Worker; if Arc code is already deployed, the final activation Secret opens it. If a matching webhook already exists, supply its signing secret from Stripe’s Dashboard when prompted. Do not paste Secrets into chat, source code, GitHub issues or command arguments.

The existing `APP_TOKEN_KEY` must be retained: it encrypts connected Apps and chat content. The setup command does not rotate it. D1 migrations and `ARC_RUNTIME` are part of the normal production deployment. The core credential Secrets are `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `STRIPE_SECRET_KEY`, and `STRIPE_WEBHOOK_SECRET`.

For manual configuration, use Cloudflare Worker Secrets or:

```sh
pnpm --filter @remotearc/relay exec wrangler secret put OPENAI_API_KEY
pnpm --filter @remotearc/relay exec wrangler secret put ANTHROPIC_API_KEY
pnpm --filter @remotearc/relay exec wrangler secret put STRIPE_SECRET_KEY
pnpm --filter @remotearc/relay exec wrangler secret put STRIPE_WEBHOOK_SECRET
```

Stripe endpoint: `https://agent.remotearc.app/api/billing/webhook`. Pin API version `2026-09-30.endive`. Subscribe to `invoice.paid`, `invoice.payment_failed`, `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.expired`, `customer.subscription.updated`, `customer.subscription.deleted`, `charge.refunded`, and `charge.dispute.created`.

Remote Arc creates its USD monthly prices and top-up price idempotently using stable lookup keys. No manual Price IDs are required. Do not edit existing price amounts in Stripe; publish a version from Admin → Payments → Plans & Credits for a new offer. D1 commercial heads are the runtime source of prices, allowances, trial terms and execution limits. Published Stripe Prices, receipts, credit grants and paid entitlements retain the same immutable version. Old paid subscriptions keep their original price and Credits; existing trials keep their activation terms. Rollback copies an old version into a new draft; it never edits history. The customer portal handles cards, invoices and cancellation at the end of the paid period. Settings also supports Plus/Pro changes at the next billing cycle, without prorating or issuing extra current-period Credits. Tax collection is opt-in through `STRIPE_AUTOMATIC_TAX=1` after the Stripe business tax registrations are configured. Prices exclude applicable tax. Only owner-scoped promotions created through Admin → Payments are accepted. Unrecognized discounts, prorated invoices, multiple invoice payment sources, manual/off-Stripe invoices and arbitrary dashboard-created prices do not issue automatic Credits; failed fulfillment remains visible for operator review and Stripe retry.

## OpenAI-first launch and operations

For live payments, the owner first completes real Stripe onboarding and securely supplies live API and endpoint-signing keys. The protected workflow's independent `enable_stripe` option verifies the NZ account is enabled for charges/payouts and the existing production webhook has the expected API version/events, then provisions only the two Worker Secrets. It makes no charges, refunds or customer mutations. Readiness checks allow bounded propagation time after secret changes; they never retry a paid inference or payment. A successful credential promotion is not evidence of a completed live customer transaction.

The protected Production Release - D1 + Relay + Website workflow has an explicit `enable_openai` option. After the exact master CI, verified encrypted D1 backup, migration and production smoke pass, it checks a bounded real GPT-6 Luna structured-output request, provisions the production environment's `OPENAI_API_KEY` as a Worker Secret, and enables Arc. Anthropic, OpenRouter and live Stripe credentials are independent; they are not required for the Auto trial. Never paste a key into a PR or chat.

Every account can explicitly activate a 14-day **Auto-only** trial. Auto is fixed to GPT-6 Luna. Manual choices require active Plus/Pro model entitlement, an available provider and Credits. Free trials cannot obtain premium grants. The initial launch publishes a D1 trial version with 50 Credits (up to $0.10 rated inference); bootstrap fixtures below retain 200. Previously started trials keep their pinned terms. Subsequent trial changes use Admin's versioned commercial configuration, and reactivation does not overwrite them.

Admin Payments includes trial counts, per-day/model/provider calls, users, rated spend and reserved costs, with an 80% operating-budget alert. A provider balance is **not** inferred from key presence, Arc Credits or Stripe receipts. Initially only OpenAI is funded; Claude/OpenRouter remain unavailable until configured and accepted. Stripe paid checkout requires live account activation and production payment credentials; the OpenAI launch does not claim to complete that setup.

Migration 0046 stores a cumulative $3 rated-cost budget and $0.50 shared daily limit in D1. The cumulative window is fixed on activation and is never reset by pause/resume or deploy. Reservation/settlement triggers update counters in the same transaction as the billing ledger; concurrent runs and scheduled work share the caps, and unknown outcomes retain their maximum. The Admin can review/publish a larger budget after checking actual supplier funds; this never purchases credits or enables supplier auto-recharge. Changes use revision checks and an audit trail. The trigger uses counters rather than rescanning the lifetime ledger for every call. Keep a buffer for provider price/measurement differences and out-of-band calls on the same API account.

## Plans and usage

| Plan | Monthly price | Arc Credits | Connect calls | Parallel runs | Run time |
| --- | ---: | ---: | ---: | ---: | ---: |
| Free | $0 | One explicit 14-day trial with 200 Credits | 10,000 | 1 | 3 minutes |
| Plus | $39 | 1,500 / billing period | Unlimited | 2 | 10 minutes |
| Pro | $79 | 5,000 / billing period | Unlimited | 5 | 30 minutes |
| Enterprise | Contract | Negotiated | Negotiated | Negotiated | Negotiated |

Plus and Pro allow every configured premium model. Pro buys more capacity, not exclusive model access. Monthly Credits expire at the paid period end. A $10 top-up adds 500 non-expiring Credits; an active paid subscription is required to use them. Credits do not provide an unlimited run: token, step, time, concurrency, routine, account and platform spending caps apply. There are no automatic overage charges. Every Free account receives 10,000 Connect calls per calendar month; account creation date does not reduce this allowance. Historical higher allowances and additional grants are preserved. Existing manually granted Plus access is preserved.

One Credit funds up to $0.002 of rated model cost. The wallet uses integer milli-Credits and microdollars, reserves a bounded maximum before inference, settles measured usage, and releases unused reservations. Unknown provider outcomes retain the reservation until verified; the system never repeats a paid attempt automatically. Reasoning output is counted once; cache reads/writes use catalog rates. A new model or price must be allowlisted and rated on the server before users can select it.

Auto uses GPT-6 Luna. Manual options include GPT-6 Luna, GPT-6.1 Sol, GPT-6 Astra, Claude Haiku 5.5, Claude Sonnet 5.5 and Claude Opus 5.5, plus the optional OpenRouter routes below. Standard request pricing only; the runtime does not opt into Fast, Ultrafast, regional surcharges or provider-hosted billable tools. Individual prompts are byte-bounded below the long-context price threshold. Current reference prices were checked on 2026-10-19: [OpenAI model catalog](https://developers.openai.com/api/docs/models), [GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna), [GPT-6.1 Sol](https://developers.openai.com/api/docs/models/gpt-6.1-sol), [GPT-6 Astra](https://developers.openai.com/api/docs/models/gpt-6-astra), [Claude pricing](https://platform.claude.com/docs/en/about-claude/pricing), [Claude structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs).

## SaaS economics tools

```sh
pnpm saas:tools                   # interactive local calculator, 127.0.0.1:4319
pnpm saas:economics --check       # fail if full-utilization margin is below target
pnpm saas:economics --json        # export complete assumptions and results
pnpm saas:economics --input costs.json --check
pnpm test:saas
pnpm saas:apps                    # actual operation coverage and fee responsibility
```

The calculator imports bootstrap plan defaults and the reviewed model cost table. Runtime commercial terms are published in D1; re-enter a proposed offer into the calculator before publishing a commercial change. It includes full monthly model/Connect allowance consumption, configurable effective Stripe/Billing fees, refund reserve, hosting costs, platform-funded Apps, direct support and the Free cohort’s direct cost. Trial acquisition cost is shown separately and also stress-tested against first-month contribution margin. Defaults are planning assumptions, not quoted vendor prices. At those defaults Plus has about 77.8% recurring gross margin and Pro about 77.7%. Including fully consumed trials at a 20% conversion rate, first-month contribution margins are about 72.7% and 75.1%. The `--check` guard requires both to meet the 70% target. A $29 Plus plan with the same allowance falls below the first-month target, so the launch catalog uses $39. Replace defaults with actual invoice data before changing the offer or enabling expensive platform-funded Apps. Do not describe the target as a guaranteed realized margin. Taxes collected for authorities are excluded from revenue.

Apps such as Runway consume the user’s own provider balance. Managed X API access consumes the platform developer project’s budget. It stays blocked without an operator-verified cost policy in `APP_PLATFORM_FUNDED_COSTS`, a JSON map such as `{ "x": { "maxCostMicrosPerDispatch": 10000, "dailyPlatformMicros": 1000000 } }`. These example numbers are configuration syntax, not X price quotes. Set the worst-case dispatch cost high enough to cover the operation’s maximum returned resources and preflight calls, then verify against the provider’s current terms. Funding reservations atomically cap all platform-funded Apps at $0.01 per Free account per UTC month and $0.50 per paid account per UTC month, plus the operator’s provider-wide daily cap. The worst-case reservation is retained conservatively; no model Credits are deducted and no extra user payment is created. Include the ceiling in the economics tool. Use the provider’s own hard spending controls as well. Hundreds of connector definitions do not imply zero operating, maintenance or provider costs.

## Acceptance and operations

`pnpm --filter @remotearc/relay test:stripe`, `test:credits`, `test:model-billing`, and `test:apps` use real SQLite plus mocked provider HTTP. They verify authority, tenant isolation, signatures, concurrency, replay, refunds and limits; they do not claim real payment/model acceptance. For isolated local/staging tests use test keys and explicitly set `ARC_BILLING_ALLOW_TEST_MODE=1`; production setup rejects test keys. The owner can complete one Stripe test checkout there, confirm invoice delivery and wallet issuance, refund it and verify remaining Credits are revoked, then use a small live payment if desired. No additional application code should be needed for this account validation.

Production retains the existing exact-master CI, encrypted D1 backup, migrations, manual protected-environment approval, and smoke tests. To close Arc immediately, set the Cloudflare Secret `ARC_EMERGENCY_PAUSE=1`. This takes precedence over every chat launch flag. Clear it deliberately when ready to reopen. Connect remains usable. Never replay a model or App call whose outcome is `unknown` just to clear a billing hold.

Use Stripe’s event delivery Dashboard to resend failed events after correcting configuration. The database `arc_payment_events.error_code` contains only safe error codes. Refunds and disputes revoke unused purchased Credits and related authorization, while spent amounts and pending holds remain auditable. The payment-intent block prevents a late invoice event from recreating refunded allowance.

Emergency Arc pause blocks new purchases and inference while preserving existing customers’ access to the Stripe portal for payment details and cancellation. It must not trap a customer in a renewing subscription. Keep billing credentials available for verified payment events and subscription management during an inference outage.

Paid Connect calls have no monthly cap. Existing per-request, concurrency, rate and provider limits remain independent. Arc model usage still consumes finite Credits. The economics calculator uses an editable expected Connect volume; unlimited calls have no finite worst-case cost.


## Optional open-model route

`OPENROUTER_API_KEY` enables MiniMax M3, DeepSeek V4.1 Flash, GLM 5.3 Flash and Kimi K3. Save it as a Worker Secret (or provide it through the owner setup environment); it is optional. The reviewed adapter requires structured outputs, denies training routes, disables provider fallbacks and imposes per-token price ceilings. Key presence means configured, not verified uptime or model entitlement. Run a bounded real inference with your funded account before launch. Kimi is not classified as an economy model. OpenAI and Anthropic remain direct integrations; Luna and Haiku provide low-cost options. Provider cost tables are reviewed code rather than an unbounded operator-editable charge rate.

## Commercial operations

See [Commercial configuration and payments](commercial-configuration.md). Ordinary Worker vars are not the commercial configuration store. Stripe/model credentials belong in Secrets. Production and sandbox must use separate D1 databases and API keys; never switch a production database to a sandbox key. The CLI bootstrap helper is sandbox-only and uses seed defaults; ongoing changes are published through Admin.

Local acceptance on 2026-10-19 used the actual NZ Stripe sandbox, hosted Checkout with an official test card, signed webhook forwarding, a versioned $29 / 1,200 Credits test offer and a 20% first-cycle promotion. Net paid: $23.20; discount: $5.80; granted: 1,200 Credits with all three provider grants. A signed refund notification revoked the remaining wallet and all three grants. No live payment or production pricing change was made. Live identity/business/payout activation, production Worker credentials, the correct Cloudflare account and production deployment remain separate owner setup requirements.
