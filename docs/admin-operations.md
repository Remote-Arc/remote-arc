# Admin Operations Monitor

The new admin-only section within `/monitor` displays:
- Account totals, monthly MCP tool calls and recent tool-audit activity.
- Paginated users with Free/Plus status, usage allowance and per-user live-device count.
- Up to 200 non-revoked devices with real-time online status obtained from their per-account registry Durable Object, **not inferred** from `last_seen`. The results identify unverified registry queries.
- A 48-hour hourly tool-call chart backed by indexed audit events; sufficiently broad seven-day history can produce tentative low-activity **Auckland-local** maintenance windows. This is a tool-usage histogram and is **not** an exact historical device-connection dataset.
- Cloudflare account billing link, D1 call counts and audit rows. **No fabricated invoice numbers**. True billed dollars require a dedicated server-side Cloudflare Billing Read integration.

## Grant additional monthly calls

Admin users may grant 1–100,000 extra calls to an existing, non-admin user for the current UTC calendar month. A reason of at least five characters and a browser confirmation are required. The API validates the authenticated session, role and exact request origin. The grant is recorded in `user_call_credit_grants` with grant ID, user ID, UTC month, amount, reason, actor ID and timestamp. No device credential, OAuth token, client content or file path is exposed through the admin endpoint.

Bonuses are **additive**, not replacements for Free/Plus policies; an account receives `base_monthly_allowance + SUM(extra_calls)` for the current month, leaving the next month unchanged. Existing Plus plan grants and admin unlimited allowances remain intact. The quota check and increment still use the existing D1 atomic user-month upsert. No new paid Cloudflare services are required.

Apply `0026_monthly_call_credit_grants.sql` to the production D1 with the usual, audited migration procedure. This is **CREATE TABLE/CREATE INDEX only** and does not modify existing records. Verify the correct production account before applying. Rollout safety: existing user quotas fall back to the old base-limit calculation if the new table has not yet been migrated, and the Operations screen disables grant actions until it becomes available.

## Cost boundaries

The Cloudflare account ID is a billing boundary. Remote Arc's live Worker is bound to D1 and a Durable Object, and may incur Workers requests/CPU, D1 rows read/written/storage, and DO requests/duration depending on the account plan and usage. The optional R2 audit-archive binding is **not activated**, and no KV binding is declared in the current Worker. If other projects use the same Cloudflare account, their usage contributes to the same quota and invoice.

The dashboard does NOT read actual Cloudflare invoices because no scoped Billing Read credential is installed in the Worker. Do not present estimates as actual costs or embed broad Cloudflare tokens in the browser. The provided Cloudflare billing link is a navigational action to the source of truth. When authorized later, add a least-privilege, server-side Billing Read integration and cache its responses to avoid increasing Worker / API calls. GraphQL Analytics usage and Cloudflare billing usage may differ and must not be equated.

## Scale and deployment

- The operations endpoint is protected by the same server-side session/role gate used elsewhere in the product.
- Page size: 30 users; device list: max 200 rows; online checks: max 60 distinct user registries per refresh; frontend polling: every 45 seconds when Monitor is mounted. Counts from a capped view must not be presented as full-fleet online numbers at large scale; add server-side pagination / aggregated online summaries as adoption grows.
- Release-window hints are based on observed tool traffic, not historical online devices; require enough days/volume and communicate uncertainty.
- Migrations are attempted by the GitHub Cloudflare production workflow. If the deploy token receives D1 error 7403, apply the migration manually from a verified account with D1 edit permission.
- Do not automatically change user quotas or activate new Cloudflare paid products. Individual manual credit grants require an explicit admin action.
- Regression tests: `pnpm --filter @remotearc/relay test:security`, `pnpm --filter @remotearc/ui typecheck`, `pnpm --filter @remotearc/ui build`.
