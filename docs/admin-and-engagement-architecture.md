# Remote Arc: public engagement, admin control plane and service boundaries

Status: **feature branch, not deployed**. This document defines stable module and host contracts for future service extraction.

## Product host topology

| Host | Audience | Allowed work | Module |
|---|---|---|---|
| `remotearc.app` | public | Website, Arc early-access and feedback submissions | `apps/ui/src/features/marketing/public-engagement.tsx` → `POST /api/public/engagement` |
| `mcp.remotearc.app` | signed-in customers and MCP providers | Devices, tools, tasks, grants, user billing when launched | Existing Dashboard + relay |
| **`admin.remotearc.app`** | `role=admin` only | Company health, operational metrics, users, plans/credits, submitted leads, Cloudflare costs | `apps/ui/src/admin` + admin API |
| `remote-link-relay` Worker (internal implementation today) | service backend | Routing by exact host + contract-specific API handlers | `apps/relay/src/index.ts`, `src/domains/engagement.ts` |

Today all three hosts can run on **one Worker and shared UI assets**, because that reuses working Cloudflare infrastructure and keeps Phase 0 cost low. **This is a modular monolith, not independent microservices yet.** The split is by hostname, endpoint, module and database responsibility, never by assumptions that every hostname has separate code.

The web boundary is prepared to migrate to separate `apps/marketing`, `apps/customer` and `apps/admin` bundles/Workers, without breaking public contracts. The first independent service candidate is **public engagement / CRM**, followed by subscriptions/payments (with its own ledger), followed by hosted Arc agent orchestration. Do *not* ship extra processes merely because microservices might be needed later.

## Data and API contracts

### Public contact

`POST /api/public/engagement` (public marketing hostname only)

Input: `{category:"early_access"|"feedback",email,name,message,source,website:"",consent:true}`.

- Validated server-side for allowed category, contact email and bounded text; contact consent mandatory.
- Anti-spam: honeypot, exact same-origin enforcement and a dedicated Cloudflare rate limiter (5/min/IP), fail closed if unavailable. No raw IPs persisted.
- D1 migration **`0028_engagement_submissions.sql`**: separate `website_submissions` table. No devices, file contents, ChatGPT conversation records or session secrets are captured. Repeated early-access email addresses deduplicate through a partial unique index. All data remains private; limit logs to error codes, not submitted body.
- `201 {ok:true}` is returned for a stored submission (or an already-listed early-access email); otherwise a meaningful 4xx/5xx. The preview Worker deliberately does not persist anything; never display a fake confirmation in preview.
- Admin can view, track and delete entries via admin-only API; correction/deletion requests via support email. Marketing sends are **not** implied by this narrow contact consent. Establish a published automatic retention rule before public launch.

### Admin

- `GET /api/monitor`, `GET /api/admin/operations`, `GET /api/admin/billing`, existing plan grants/credits and `GET /api/admin/submissions` are **admin hostname only** and require a valid user session with `isAdmin=true`. Management actions are server-authorized and restricted to exact admin Origin.
- `PATCH /api/admin/submissions/:id` changes status; `DELETE` permanently deletes contact records.
- The old consumer `/monitor` path redirects to `https://admin.remotearc.app/` and the customer navigation no longer includes a Monitor tab.
- Cookies currently use `Domain=.remotearc.app`; the same existing identity/session can authenticate all subdomains. `safeReturnTo` is explicitly extended to the configured admin origin, not an arbitrary user-supplied redirect.
- The public marketing site does not serve admin API responses; customer MCP API calls do not gain admin rights because of any frontend control.
- Admin UI uses existing `AdminOperations` for real user/device/audit/Cloudflare billable figures, and the existing monitoring API for production incidents/dependencies/alerts. Sensitive service logs remain in backend only.
- All HTML served on the admin subdomain is **noindex** and role-checked before delivery. Further hardening when DNS is enabled: Cloudflare Access allowlist / MFA for admins, Cloudflare WAF and server-side admin audit trail. Do not mistake a separate hostname for sufficient authorization.

### Business metrics and honest definitions

- **Registered users**: D1 users.
- **Devices**: non-revoked device records; online snapshots are verified separately.
- **MCP calls**: metered tool call counter; **not** hosted AI tokens.
- **Cloudflare costs**: actual Cloudflare billable usage when a billing-read token exists, clearly account-wide.
- **GMV**: only payment-processed merchandise/order volume (may be *not applicable* for SaaS subscriptions).
- **MRR / ARR / revenue / paying customers**: only after checkout, settled invoices, subscription ledger and refund accounting land in Phase 1B. All currently **N/A**, never $0 guessed from missing data.
- Funnel conversion, usage attribution and AI margin require explicit opt-in event taxonomy and payment source-of-truth; do not claim to know them yet.

## Deployment dependency and migration checklist

This work is on a **stacked feature PR based on marketing PR #176**. D1 schema number `0028` follows Phase 0 organization's `0027` from **PR #172**.

Release order:
1. Production backup/time-travel bookmark and safe Phase 0 release (#172) with existing-user compatibility checks.
2. Merge approved marketing pages (#176), optionally separately release.
3. Merge this engagement/Admin feature only after isolated Preview & CI, security review and explicit owner approval.
4. Before deployment: verify `admin.remotearc.app` DNS/custom-domain ownership and admin-only identity login, add Cloudflare Access guard if possible, confirm Ratelimit binding, and apply `0028` with a fresh D1 recovery point.
5. Canary one authorized submission and verify it is visible to admin, moves status, and deletes. Regression-test customer MCP, login, task, existing API clients, service health and billing controls.
6. Roll back app code via the protected release mechanism if needed. **D1 Time Travel restores overwrite post-bookmark writes**, so do not automatically restore the database.

The PR Preview is UI-only (mock worker without production D1). **The visible preview form does not save real submissions**; actual acceptance requires local handler/unit tests plus a staged Worker environment with isolated database bindings before production approval.

## Why not microservices today?

A 3-process deployment for a product with early users increases failure points, secret/identity coordination, network latency and Cloudflare operational work before it proves value. Interfaces have been intentionally separated so later deployment extraction is mechanical: bind different hosts to separate Workers, keep `/api/public/engagement` and `/api/admin/*` contracts stable, and migrate ownership of data intentionally. The migration seam is the **host/API and bounded context**, not the framework or repository count.
