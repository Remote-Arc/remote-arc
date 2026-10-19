# Remote Arc / Arc — SaaS launch and monetization roadmap

**2026-10-19 update:** this is the historical planning record, not the current activation guide. The implemented [PR 218 delivery](./pr-218-delivery.md) and [platform launch instructions](./arc-platform-launch.md) supersede its proposed dollar amounts, model tiers and read-only pilot defaults. Current provisional plans are Plus $39 / 1,500 Credits and Pro $79 / 5,000 Credits; both support every configured premium model. The explicit trial is 14 days / 200 Credits. Connected Apps execute within the user's granted scopes without a separate default write-approval gate. Production Arc remains closed.

**Status:** planning specification; not deployed, not current pricing or a payment promise.
**Product:** Remote Arc is the platform; **Arc** is the optional hosted AI assistant. Existing Connect / MCP remains an independent offering, with its existing free allowance and user-owned AI model relationship.

## Launch gates: commercial readiness comes *before* public Arc access

| Stage | Work | Customer-facing release gate |
|---|---|---|
| **P0 — Security & tenancy** | Personal organizations, compatibility migration, explicit production release, verified point-in-time recovery and protected CI. | Existing Connect stable; no Arc model costs or team sharing turned on. |
| **P1a — Internal Arc** | Hosted chat, audited tool execution, an Auto router tested across providers, durable turn/run journal. Instrument raw provider tokens and actual spend from day one. | Internal allowlist only, server-side organization/run/global hard-dollar limits, read-only initial tools. **No unmetered trial.** |
| **P1b — Billing & free-trial guardrails (MUST SHIP BEFORE PUBLIC BETA)** | Hosted pricing/plan entitlements, Checkout, verified webhook, customer billing portal, invoice/subscription state, usage reservation/settlement, budget exhaustion UX, abuse protection and support process. | Test real payment → webhook → entitlement → AI usage → exhaustion → renewal/cancel/refund; no payment or model charges on legacy Connect by default. |
| **P2 — Apps / early public Beta** | Five robust native integrations, own Connector SDK and OAuth lifecycle, MCP imports, safe permissions. | Signed-in verified accounts may try a *very small* subsidized Auto experience; paid users can buy allowance. Confirm model cost per verified completed task. |
| **P3 — Paid Routines / AI workers** | Triggers, jobs, resume, approvals, failure evidence, templates, team quotas. | Paid recurring value and retention validation; no uncontrolled autonomous loops. |
| **P4 — Ecosystem / Teach Arc** | Teach-from-demo Skills, partner connectors, agency workspace, external developer tools and multi-agent teams. | Expand only after task reliability and gross margin targets hold. |

**Important:** P1a may proceed internally without public billing, but it still needs metering and strict hard ceilings. P1b cannot be deferred until after the public launch. P2/P3 work may develop in parallel but must remain unreleased until the gates pass.

## Usage accounting and inference ownership

- In **Connect** mode, ChatGPT/Claude or another client owns the reasoning subscription; Arc does not secretly call our paid model APIs. Existing remote MCP usage/plan boundaries remain independent.
- In **Arc Hosted** mode, our model-provider account pays every OpenAI / Anthropic / Workers AI inference charge (including free-trial calls). We **cannot** use customers' ChatGPT Plus or Claude consumer subscription as free API credits.
- The paying customer pays **Remote Arc**, not our API provider; we bear third-party spend unless the user explicitly configures a separate BYOK mode later.
- Free trials and abuse are acquisition costs paid by us, not zero-cost promotion. Model prices vary; routings and quotas need tests before publication.

## Pilot / trial safety policy — proposed limits, not live settings

- Initially invite **up to 20 verified organizations**, each with a **USD $0.50 hard underlying provider-cost allowance** (not "$0.50 worth of retail credits"). Require verified email; throttle registration and new-account resets.
- Pilot-wide stop switch at **USD $20/day** and **USD $100/month** of hosted AI/premium-tool spending, including retries. These are maximum ceilings, not target spend. Finance-provider budgets are alerts, not our circuit breaker.
- Trial defaults to Auto, a tiny number of bounded read-only workflows and no unattended high-frequency execution. Require real user consent and additional permissions for irreversible tools.
- Before **every** paid inference/tool action, atomically reserve estimated worst-case USD spend at both org and platform level; reconcile actual costs and release unused reserve. Reject further paid work if reservation cannot be guaranteed.
- Bound **max output tokens, tool turns, recursion depth, search calls, parallel runs, wall-clock duration** per task and tenant. Retries and fallback models must stay inside a single reserved task budget; stop on budget exhaustion with a comprehensible UI.
- Once the global limit is reached, Arc Hosted pauses / new trials stop. Existing Connect MCP must not be affected by that kill switch.
- Add strong per-account and per-device/IP abuse resistance; no passwordless mass signup loops, welcome-credit resetting, unverified email use, or direct unapproved external side effects.
- Track provider invoiced cost separately from what our preliminary token estimator predicts; alert on discrepancies. Do not promise "unlimited" at launch.

## Initial pricing hypotheses — USD / month, NOT public commitments

At 100% allowance usage, target **at least 70% gross margin**, ideally 75–80%, with honest direct costs: inference, retries, third-party paid tools, cloud execution/storage, payments and variable direct support.

| Hosted tier | Candidate monthly price | Proposed maximum included model+premium-tool COGS | Other direct-cost allowance | Illustrative fully-used gross margin |
|---|---:|---:|---:|---:|
| Solo | $39 | $7 | $3 | 74.4% |
| Pro | $99 | $18 | $7 | 74.7% |
| Team | $249 | $48 | $15 | 74.7% |

Assumptions are *budgets*, not task-count guarantees. Formula: `(price - model/tool cost - other direct cost) / price`. Some enterprise work may need separate charges. No unlimited runs or unlimited Sonnet/frontier access. Test larger prices/quotas only against real trial telemetry. Do not silently consume above the org budget even when API providers keep accepting requests.

- **Auto is default on every hosted tier** and routes to models tested to finish tasks reliably within budget. It is not permanently pinned to the cheapest model.
- **Pro+ model selection** exposes tested supported providers/models; premium selections consume more allowance or have explicit per-call additional charges. Exact model names and entitlements must be verified before publishing them.
- **Connect Free** must remain clearly differentiated from the hosted trial. Existing free MCP calls are not free model inference; marketing and pricing must explain the distinction.
- Paid users receive a customer-facing allowance/execution-balance UI, transparent throttling and usage history; retail credits map consistently to true provider cost with an auditable multiplier.

## Billing implementation acceptance checklist (P1b)

1. Provider choice: evaluate **Stripe Billing + Checkout + Customer Portal** versus a Merchant-of-Record alternative for tax handling. Verify merchant eligibility, legal entity, payout/KYC and applicable GST/VAT before making prices public.
2. Database ownership: `organization_id` for plans, provider customer/subscription IDs, entitlements, immutable credit ledger, reservation, settlement, refund and invoice events. Existing `plan_grants` / Plus entitlements are preserved; do not retro-charge existing Connect users.
3. Checkout is initiated server-side; subscription access is granted **only after verified paid state**, not after client-side success redirect.
4. Verify provider webhook signatures using the raw payload, deduplicate event IDs, handle out-of-order transitions, trial changes, invoice failure/cancellation and idempotent retries. Avoid storing card numbers.
5. Enforce accounting/authorization **on the server** independent of UI. Atomic reserve/commit/release for model usage and safety cap under concurrent tasks.
6. Support self-service billing history, cancellation, upgrade/downgrade, invoice state, usage and exhaustion; specify account deletion/retention policy.
7. Separate dev/test and production provider keys and webhook endpoints; end-to-end tests for duplicate webhook and disabled payment flow; operational metrics and audit with no PII in logs.
8. Owner/operator kill switch can disable Arc Hosted and premium tools without interrupting Connect.
9. Security review before production: API-key leak protection, OAuth tenant isolation, ledger race conditions, SSRF and cost amplification defenses, refund-abuse limits.
10. Controlled paid pilot validates cost per verified task, 30-day retention and failed payment UX before a general public release.

## Current Phase 0 verification (2026-10-16)

- GitHub production environment **Required Reviewers** is verified via GitHub API: reviewer `yaohuangguan`, with `prevent_self_review=false`. Self-approval is currently permitted, so the owner must still consciously review each production run.
- D1 `remote-link-auth` read-only info returned 33 tables and ~35MB. D1 `time-travel info --json` returned a **valid bookmark** with exit code 0. No restore, export, schema changes or data writes performed.
- **Before deployment:** record a *fresh* pre-migration Time Travel bookmark (not in git); plan a restricted-access independent SQL export after checking maintenance impact. Cloudflare warns export can temporarily interrupt D1 queries, so do NOT run an unplanned production export during normal traffic.
- For any schema change, coordinate Time Travel recovery; restoring the whole DB destroys post-bookmark legitimate writes and is never an automatic rollback. Prefer additive backwards-compatible migrations and immediate issue resolution.
- Mac free space was < 0.5GiB at last check: do not export the customer database to the Mac or run large local dependency installs. Use separate isolated/secured storage, and keep customer database contents out of PRs/CI build artifacts.

## Owners' assistance needed at the right time

- **Now:** no API keys or card information needed for this roadmap. GitHub reviewer is confirmed; Time Travel has been verified.
- **Before public paid pilot:** create/verify a payment provider merchant account; provide production/test keys through secret managers only; confirm USD pricing, refund/TOS/privacy and tax obligations.
- **Before hosted model testing:** establish dedicated OpenAI / Anthropic developer API billing projects with deliberately low spend limits; provide credentials directly to secret management, never messages/PRs.
- **Before production D1 migration:** explicitly authorize the narrow release window and safe backup process after reviewing the plan.
