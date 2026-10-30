# Phase 1 Model Gateway and Billing foundation

**Scope update, 2026-10-19:** the details below describe the original goal-planner gateway and its legacy defaults. They are not the setup instructions for the new native Arc Chat. See [current platform launch](./arc-platform-launch.md), [Credits implementation](./arc-credits-rollout.md) and [consolidated delivery](./pr-218-delivery.md). Native Arc has a platform-funded OpenAI Auto route, configured OpenAI/Claude premium models, a Stripe-backed wallet, and exact cache-read/write rating; users do not configure API keys. Current Claude profiles use structured JSON output. The Workers AI pool and manual grant examples below apply to the legacy planner path, not the native Chat subscription flow.

Status: implemented foundation; OFF by default. Arc Agent remains Coming Soon. Current code includes payment checkout and subscription handling behind closed launch flags; no production deployment, paid-provider request, real payment or user auto-enrollment is claimed.

## What is reusable

The existing hosted goal planner now calls one Model Gateway. Source-controlled goals and deterministic commands continue through their existing paths without inference. Both goal runtimes attach the authenticated task owner, private personal organization, task, run and stable planner operation ID. Organization membership grants no device access.

The gateway supports a Cloudflare Workers AI adapter, OpenAI Responses and Anthropic Messages. Each adapter returns a bounded structured decision and normalized token usage; none executes a tool. Existing decision validation, device permissions, task leases, verification and approval boundaries still govern execution. OpenAI uses structured text output; Claude is forced to return the single local submit_agent_decision data tool. Provider-specific payloads never alter Apps/Devices/Skills APIs.

Auto selects only the server-allowlisted Workers AI candidate. It never selects OpenAI or Claude, even when their secrets exist. Explicit paid model selection requires a stored unexpired grant for this user, organization and optional task, plus every applicable budget. Unknown responses, timeouts, missing usage and unavailable providers retain the reservation and stop. There is no invisible fallback or inference retry. A duplicate operation returns MODEL_ALREADY_DISPATCHED, including after a known decision; the runtime cannot spend again after a crash.

## Accounting contracts

Migration 0029 adds daily UTC budgets for global, organization, user and task scopes. Every nonzero metric (integer inference credits, USD microdollars and Workers AI neurons) must have all four budgets. D1 batch transactions atomically check all ceilings, create one reservation and increment all counters. No cap is partially consumed on denial. SQLite integration tests exercise concurrent claims and settlement.

Settlements reconcile a verified result once. Unknown outcomes keep their maximum commitment until explicit reconciliation. Observed usage exceeding the reservation fails closed and keeps the commitment for review. Cached OpenAI input is conservatively priced at the full input rate; Claude cache input/write tokens are retained separately, with a conservative write rate when unspecified. Reasoning tokens already included in output_tokens are not added twice.

Connect's existing monthly MCP calls, extra-call grants and legacy Free/Plus features are unchanged. Hosted budgets and plans use a separate lane; an organization plan is not a provider grant, payment authorization or device permission. New billing_plans and billing_plan_assignments support user and organization entitlements. No payment processor is connected. Reservation/event records contain opaque owner/task IDs, pricing and usage metadata, not prompts or credentials; their historical identifiers remain usable for reconciliation after deleting an account or task.

Server exports in billing-ledger.ts:

- reserveBilling / settleBilling: atomic accounting and owner-fenced reconciliation.
- setBillingLimit: admin-only caps; cannot lower below committed usage or reset spending.
- grantPaidModel: explicit admin-only user/organization/task provider authorization.
- configureFreeAiPool: admin-only, current-day verified pool assertion.
- defineBillingPlan / assignBillingPlan / getBillingEntitlements: separate lane entitlements.
- getBillingUsage / getAdminBillingUsage: scoped read-only monitoring.

These functions are not public MCP tools or unauthenticated HTTP handlers. An Admin API must still authenticate sessions, check origin on writes and audit administrative changes before exposing them.

## Workers AI free pool

Cloudflare includes 10,000 neurons daily, resetting at 00:00 UTC. On Workers Paid, use above the allocation is billed automatically. A provider 429 is not a free-cost guarantee. See [official pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/).

Before enabling Auto, an operator must verify either a dedicated account or that **all** account Workers AI usage passes through this accounting boundary. configureFreeAiPool requires managedPoolAssertion, current UTC day, the verified free allocation and outside usage. The global neuron ceiling must not exceed the remaining pool. It is never silently created from the full account allowance. If other Workers, dashboards or external callers spend outside this boundary, the application ledger cannot guarantee the account's real remaining free allocation. Disable the pool until reconciled. Pool verification and explicit daily budget provisioning must recur after the UTC reset.

The initial candidate is [Qwen3 30B A3B FP8](https://developers.cloudflare.com/workers-ai/models/qwen3-30b-a3b-fp8/), with function calling and structured output support. Its profile is server-owned and priced from current Cloudflare documentation; model quality and real account access still require an allowlisted pilot/evaluation before enabling users. No inference calls were made during foundation tests.

## Configuration and rollout

A server-injected MODEL_GATEWAY binding supports internal tests, or resolveModelGateway constructs adapters from server settings:

- MODEL_GATEWAY_ENABLED=1: explicit opt-in; otherwise disabled even when API keys exist.
- AI binding plus MODEL_GATEWAY_FREE_POOL_ID: Workers AI Auto, after verified pool/budgets.
- MODEL_GATEWAY_MODELS: server-controlled JSON model profiles (alias, provider, actual model ID, limits and integer pricing). The default is the Workers AI candidate only.
- MODEL_GATEWAY_MODEL_ID: explicit server alias, default auto. OpenAI/Claude aliases must be defined and selected deliberately.
- OPENAI_API_KEY or ANTHROPIC_API_KEY plus MODEL_GATEWAY_PAID_GRANT_ID: credentials and the stored matching paid grant; keys alone grant no authority.
- MODEL_GATEWAY_LOCAL_TEST_ENDPOINT: loopback HTTP 127.0.0.1 only, for isolated Wrangler mocks. Omit from all deployment configurations.

Provision global/user/org/task budgets before a hosted task is eligible. This foundation deliberately does not auto-assign Hosted credits to Connect users or auto-create budgets. Future task admission/UI should surface the required grant and budget before scheduling; the model boundary already rejects missing configuration. Existing legacy AGENT_MODEL/AGENT_MODEL_BASE_URL and key presence no longer bypass this boundary. Hosted goals without it clearly fail admission or execution; source and fixed commands remain available.

Production requires the existing protected exact-master-SHA workflow. Apply 0029 only after the required D1 backup preflight confirms a recovery point. The additive migration has no paid grants, active pools or plan assignments by default. Rollback can disable MODEL_GATEWAY_ENABLED and return compatible Worker code; D1 migrations remain forward-only.

## Verification

Run the actual SQLite/D1 adapter and mocked provider contracts:

    pnpm --filter @remotearc/relay exec tsx scripts/model-billing-test.ts

This covers all-scope atomic caps, concurrent reservations, idempotency, unknown outcomes, grant expiry/revocation, membership/task ownership, private reads, plan lane isolation, model allowlisting, no paid fallback, token normalization, structured output, refusals, truncated outputs and sanitized provider errors.

Additional regression: Relay TypeScript; test:goals for source/planned goals, leases and recovery; build:ui plus test:automations for real Wrangler scheduled handler, D1 and WebSocket device transport with local-only model mocks and explicit test grants/caps. Do not lower repository coverage thresholds.

Provider references: [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses), [Claude Messages API](https://platform.claude.com/docs/en/api/messages/create). Model aliases and prices for paid providers are configured by operators; no paid default model or unlimited tier is shipped.
