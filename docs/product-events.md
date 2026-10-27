# Product events and production payment diagnosis

Admin → User experience (`https://admin.remotearc.app/?section=events`) presents business-level follow-up signals, payment/access checks and eight-row user activity pages. Raw event names and trace/order IDs are available in an on-demand detail drawer. See the [operator guide](./operator-experience.md) for workflows and metric boundaries.

Current pairing polls explicitly returning `authorization_pending` are recorded as waiting, not failure. Historical opaque `REQUEST_FAILED` rows are preserved. Admin reads can search an exact email and return a separate directory for at most 100 accounts referenced by the displayed event batch or payment checks; emails are resolved from the existing account table and are never added to event storage.

## Recorded events

| Area | Authoritative backend events | Browser observations |
| --- | --- | --- |
| Login / OAuth | session creation, email request/verification-attempt and invalid-code failure, Google callback, OAuth consent/token HTTP outcomes | None on the sign-in form |
| Devices | pairing start/token/approval, device mutations, completed device dispatch outcomes | Approved workspace page views |
| Apps | persisted connection readiness and mutation-request HTTP outcomes (accepted, not proof of provider completion) | Apps workspace views |
| Tasks | accepted HTTP requests and persisted Arc run terminal states | Task workspace views |
| Automations | mutation-request HTTP outcomes (accepted, not proof of a finished run) | Workspace navigation |
| Payments | order creation/abandonment, plan/renewal/payment-method changes, webhook processing/failure, canonical invoice payment failure, verified Credit/plan fulfillment | offer selection, checkout entry/continue, SDK mount/load failure, completion callback, confirmation timeout/display |
| Client failures | None | failure occurrence without message, stack or URL |

Browser signals are marked `source=browser` and cannot create Stripe or server events. An SDK mount means the SDK mounted; it does not assert that every field finished loading or that a payment succeeded. Accepted requests are separate from terminal execution outcomes.

A per-tab random journey ID survives refresh. Each billing request also carries a separate random trace ID. Orders save those IDs, and canonical payment completion looks up the original order so the journey can continue through Stripe. This data is diagnostic only and never grants access or changes financial state.

The six purchase steps independently count distinct journeys in the selected window. They are not an ordered cohort conversion rate. Repeated purchases within one tab can share a journey. Historical clicks cannot be reconstructed.

## Production payment inspection

The administrator explicitly runs a read-only check. It verifies current feature switches, key mode/format, Stripe charge capability, the enabled live callback URL and required event subscriptions. It shows the last 30 days of verified membership receipts with matching plan and Credit records, paid receipts missing access, failed/stalled webhook processing, and orders unfinished after ten minutes.

Up to ten recent unfinished orders with a provider session ID are retrieved from Stripe to identify paid sessions missing a local receipt. The UI reports the sample size and unavailable reads. An unfinished order can also mean the user chose to leave.

All provider calls are GETs. The probe creates no customer, checkout, payment, refund or message and does not replay webhook processing. Prerequisite checks cannot validate correspondence of the signing secret or establish a new real-card purchase. Provider access failures are unknown, not proof of a broken purchase flow. A passed configuration probe remains `ready_unverified`; it never asserts a completed new transaction.

## Storage and boundaries

Migration `0065_product_events.sql` adds the metadata table, indexes, canonical-event deduplication and optional checkout correlation columns. The existing five-minute maintenance schedule deletes up to 5,000 expired events per tick, with a 30-day retention target. Financial ledger retention is unchanged.

Only fixed event names and approved route names enter browser intake. It requires the real session, matching Dashboard host/origin, JSON, bounded streamed bodies, at most 20 events per batch, per-account event budgets and a dedicated rate limiter. Identity is resolved server-side. Raw URLs/queries, IPs, emails, form content, commands, conversations, file contents, access keys, card details, client secrets and exception text are excluded. Intake rejects additional metadata fields.

Admin reads retain the existing host, session, current-role, service allowlist and no-store checks. Event pages use 100-row cursor pagination and fixed time windows (1 hour / 24 hours / 7 days / 30 days). Readiness issue lists are bounded to 50 rows. No background browser polling or third-party analytics service is added.

Request observation runs via `waitUntil`, cloning relevant JSON responses synchronously before they can be consumed. Telemetry write failures are contained and cannot substitute a payment or task result. Server-side settlement events occur after existing canonical ledger operations and are deduplicated by event name and entity.

## Validation and release

- `pnpm --filter @remotearc/relay test:events`: actual SQLite migrations, intake/RBAC/CSRF/privacy, browser-forged payment rejection, duplicate IDs, concurrently consumed responses, correlation, canonical completion, cursor pagination, retention, missing keys, read-only readiness and paid-but-unprocessed reconciliation.
- `pnpm --filter @remotearc/relay test:security`: existing login/device/App/task/credit/Stripe regression suite.
- `pnpm exec playwright test tests/site/admin-events.spec.ts`: desktop English/light and mobile Chinese/dark, actual AdminEvents component with isolated HTTP fixtures, user/trace filters, payment anomalies, loading errors and overflow checks. The fixture is a test script, not a production entrypoint.
- `pnpm typecheck` and the UI production build.

Merge/release uses the existing protected production workflow. Migration inspection, automatic encrypted/restore-tested D1 backup, migration application and smoke checks remain mandatory. Do not apply this migration directly as a workaround for unavailable D1 credentials. No billing key, payment toggle or production data was changed during implementation. Event recording starts only after deployment.
