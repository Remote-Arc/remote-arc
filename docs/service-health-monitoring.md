# Service health and business failure monitoring

Admin → Service health combines infrastructure probes with business failure observations. It loads on entry and refreshes only on explicit action. The page does not poll, probe customers’ computers, replay work, send customer messages, or make test payments.

## Capture boundaries

- Worker: all recognized `/api`, `/auth`, `/oauth` and `/mcp` business route families record HTTP failures; mutation JSON envelopes with `ok:false` or `status:failed/unknown` are failures even on HTTP 200. Successful GET polling is not recorded. Billing/auth semantic event names remain compatible with existing business analytics.
- MCP: the common registered-tool wrapper records thrown errors, structured failure results and OAuth challenges. HTTP-200 JSON-RPC protocol failures are captured separately. Scope challenges do not read device or App account data.
- Device: real dispatch outcomes retain a classified fixed error code and trusted device/tool metadata. Timeouts leave the effect unknown. This monitor never restarts a device or retries writes.
- Apps: dispatch settlement failures record provider, operation and call ID. Pre-dispatch MCP failures can resolve an owned App connection. No arguments or provider results are stored in monitoring.
- Background: Arc run failures, automation terminal failures, Slack job settlement errors, follow-up email delivery errors and auth-flow failures are observed at settlement boundaries. Unknown email delivery is explicitly not a resend instruction.
- Browser: runtime/unhandled-rejection events and handled same-origin business network failures. The shared fetch wrapper carries a UUID trace without reading bodies, omits query strings and third-party traffic, ignores aborts, and excludes its own intake. Browser reports remain unverified; they cannot claim a successful payment or choose an actor.

`product_events` remains the shared store. A stage record is an observation, not a unique incident, a completed user goal, a task failure rate, or a cost measurement. Repeated stages can share a trace and must not be summed as distinct user incidents. A physically sleeping/offline Agent cannot report what it never received. Generic historical failures cannot be retroactively recovered.

HTTP failures use the existing product-events limiter per authenticated user (or one anonymous bucket) and fixed error code. Production currently allows 30 observations per key per minute; browser intake has separate batch and per-account bounds. Limits, disconnected clients and telemetry write outages make counts lower bounds. Operational event retention uses the existing 30-day, 5,000-row cleanup every five minutes. Telemetry failures never change a business response.

## Error reference

`pnpm --filter @remotearc/relay monitor:catalog` inventories literal Relay error codes and MCP classifier codes into `error-code-index.generated.ts`. CI runs `--check`; changes to recognized literal codes require regeneration. `error-catalog.ts` provides bilingual subject/reason annotations, category actions, specific explanations for important ambiguous errors and source paths. Unknown runtime text becomes `REQUEST_FAILED`, never a guessed or raw error code. Dynamic provider strings also normalize to a fixed classification.

Categories: usage/capacity, access, validation/configuration, state conflicts, dependencies, execution, browser reports and unknown. Expected guards are separate from actionable observations. A business guard or one sleeping computer does not by itself degrade the platform status. An HTTP 5xx remains actionable even when its code describes a guard.

`BILLING_INVALID_PLAN_CHANGE` means that the current paid subscription/target/state does not permit the transition. An initial purchase must use checkout. This change adds diagnostics; it does not change subscriptions, prices or checkout routing.

## Admin access and context

`GET /api/admin/monitoring` is accepted only on the Admin origin and requires a current administrator session. It returns bounded summaries, category/module facets and at most 200 code groups. Filters support 1/24/168 hours, category, module, triage, exact account email/user ID, device ID, code and trace/journey/entity ID. Specific code/account/device/request queries return 50 records with a stable timestamp/UUID cursor. The default view does not fetch every raw event. Narrow filters when group limits are reached.

`?catalog=1` returns the fixed reference. Admin browser intake uses `POST /api/product-events` through the same origin, CSRF, content-type and current-role gates. Public users cannot read monitoring or ingest Admin telemetry.

Actors come from authenticated sessions/tokens. MCP device and App IDs are resolved only with the authenticated owner. Admin labels are joined on demand; device joins include the owner. Missing user/device/provider/version fields remain unknown or not applicable. Browser-supplied actor IDs are rejected. Historical unknown codes are normalized on read as well as write.

Never store exception text, stacks, full URLs, query strings, command arguments, file paths/content, email/chat bodies, credentials or payment details. Existing safe route families, fixed codes, UUID traces, identity keys, stage names, durations, status and deployment SHA are enough for correlation. User names/emails and owned device labels appear only in the authenticated Admin response, rather than being copied into telemetry.

## Migration and release

`0077_business_monitoring.sql` adds nullable failure category, device, provider and operation columns and failure-only time/code/device indexes. Existing rows are preserved and old writers remain valid. Tests apply all migrations from empty, then apply 0077 to a populated pre-monitoring schema and exercise an old writer. No backfill, data removal or production migration is performed by this PR.

Before a separately authorized production deployment, record the D1 recovery point, apply the additive migration, then deploy the code. Code rollback can leave the new columns/indexes in place; do not drop data to roll back. New writers require migration 0077, while failed telemetry writes remain fail-open if deployment order is wrong. Validate the Admin API, one synthetic failed business request and its trace after release. No Agent release is required for server-side collection; devices continue using their existing execution protocol.

## Validation

- `service-health-monitoring-test.ts`: real Worker/SQLite + MCP; GET failures, HTTP-200 errors, context ownership, Admin host/RBAC, source trust, filters/facets/cursor, old schema compatibility, unknown-code normalization and canary privacy. The GET reauthorization regression failed before the implementation and passes after.
- `business-fetch-test.ts`: real shared fetch wrapper, preserved error objects/headers, same-origin trace propagation, private query omission, cancellation and recursion exclusion.
- `tests/site/service-health-monitoring.spec.ts`: desktop/mobile detail/identity display, category and account filters, manual refresh, no background polling, reference search, unavailable states and responsive layout.
