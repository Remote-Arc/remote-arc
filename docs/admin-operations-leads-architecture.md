# Remote Arc: Web surfaces, Admin and Interest/Feedback service boundary

**Status:** implementation proposal + staged PR; **not approved for production**.

## User experience and independent hostnames

| Domain | Audience | Responsibility | Status |
|---|---|---|---|
| `remotearc.app` | Visitors | Marketing, documentation, Arc early access and feedback forms | Form UI and intake contract in this PR |
| `mcp.remotearc.app` | Customers | Connect dashboard, auth, MCP device/agent tasks | Existing production service, unchanged |
| `admin.remotearc.app` | Operators | Users, devices, operational metrics, costs, lead inbox, paid revenue when real | New host-bound, admin-auth UI (domain activation pending) |

**Do not call the customer UI “Monitoring”.** Monitoring belongs to the service and its operators. The customer Dashboard displays their own usage/activity. Legacy `/monitor` is retained as a temporary compatibility route; it must be removed after the new hostname works with real operator sessions.

## Bounded-context seams

- **Marketing web**: React forms and content, zero secrets and no D1 access.
- **Leads / Feedback**: POST `/api/public/arc-interest` (anonymous, origin checked, rate-limited, payload/field bounded, honeypot, D1 insert); GET/PATCH `/api/admin/arc-interest` (role-checked with existing session; status workflow).
- **Admin web**: role-gated presentation consuming *existing protected* `/api/admin/operations`, `/api/admin/billing`, `/api/monitor`, and new interest API. It has no direct SQL knowledge.
- **Connect runtime**: existing MCP, OAuth, device, task and security APIs, not accessible on Admin hostname via host allowlist.
- **Commerce / Finance (future)**: verified payment provider webhook, subscriptions, refunds, audit ledger and financial reporting. **GMV/revenue = unknown until validated payments exist.** Model inference spending and Cloudflare invoices are **costs**, not GMV. Never use user signups, credits or trial activations as simulated revenue.

One repository is fine: separate deployment units and contracts matter more than whether repositories are separate. This release is *logical separation within existing Workers/UI builds*, not a claim that the full microservices migration is complete.

## Migration path when traffic and team justify it

1. **Now**: add the host-bound Admin UI, isolated lead-intake handler, dedicated D1 table and API contract. Reuse existing monitored operational data rather than duplicating owner/user/device stores.
2. **Next**: extract `apps/ui` into `apps/marketing-web`, `apps/customer-web`, `apps/admin-web` build entry points. Provide a shared design-system and typed API contract package. Preserve routes and test browser cookie/auth flows.
3. **Later**: separate `api/leads`, billing and admin-analytics Workers using service bindings (private east–west traffic), with independent secrets/least-privilege D1 bindings and isolated deploy workflows. Use durable queues for onboarding emails, not inline side effects.
4. **Only when needed**: split operational databases/storage by bounded context. No shared direct cross-service SQL. Use event/outbox and idempotent consumers for analytics. Never migrate active user sessions or tenant/device permission data as part of a visual redesign.

Avoid one large “microservice rewrite”. Each seam must support independent tests, metrics, auth and rollback before extraction.

## Public form contract

- Fields: kind, email, optional name/company, a short but meaningful workflow/feedback message; locale and source page.
- Purpose: product feedback and opt-in interest **only**; no automatic marketing email subscription, no fabricated waiting-list positions, no paid model credits.
- No trusted contact information is put into logs or external URLs. HTML renders user-supplied text as escaped React strings (never `dangerouslySetInnerHTML`).
- Rate limiting uses the existing Cloudflare anonymous limiter by visitor IP; verify bot-resistant limits under real traffic. Stronger protection (e.g. Turnstile) can be added without changing the API.
- D1 backup/retention: owner-authorized admin access, deletion requests through support, limit exported PII, and define retention before public launch. No silent aggregation into AI prompts.
- New table is additive migration `0028_arc_interest_leads.sql`. **Prerequisite: Phase 0 PR #172 migration 0027** must have been applied and checked. First deployment must record D1 Time Travel bookmark and optionally secured independent export.

## Admin hostname cutover checklist (release blockers)

- [ ] Confirm PR #172 and PR #176 are merged and deployed with no regressions, before applying this stacked branch.
- [ ] Confirm `admin.remotearc.app` custom hostname / TLS Cloudflare ownership. This PR stages Wrangler route only.
- [ ] Confirm owner can authenticate on customer host, then visit Admin via shared `.remotearc.app` HttpOnly/Secure/SameSite session cookie. Reject a non-admin signed-in user and a logged-out visitor.
- [ ] Assert on the Admin host that MCP, OAuth, pairing, public form API and customer routes are all inaccessible at the edge. Authenticated Admin APIs still enforce their own role checks.
- [ ] Apply migration with fresh, verified D1 Time Travel restore point; no production mutation or real user-data export during Preview.
- [ ] Test real form submit -> D1 row -> Admin list -> status change, using dedicated test records. Delete test records via an approved maintenance action.
- [ ] Review data policy and abuse limits, confirm the support mailbox receives deletion/feedback requests.
- [ ] Remove the legacy user-Dashboard `/monitor` view **after** Admin hostname is live; do not strand existing operators in a broken link.
- [ ] Integrate verified billing events before showing financial GMV/ARR/MRR, and distinguish gross transaction volume from recognized revenue and cash receipts.
- [ ] Gate production release behind protected CI, user approval and post-deploy rollback/playbook. No automatic deployment from this PR.

## Known Preview limitation

PR Preview is UI-only with mock auth. The new form uses a real same-origin POST contract; until a staging Worker is provisioned with a disposable D1 database/migration, preview form **should report backend unavailable** instead of showing fake “submitted successfully”. Server handler is tested independently using controlled mocks. Live form submissions are not collecting until approved backend cutover.
