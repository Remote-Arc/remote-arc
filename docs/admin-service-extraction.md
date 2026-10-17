# Independent Admin service extraction — staged, not active

Baseline: master ae207e0 (PR #181 already merged). This branch does not transfer storage, change production routes, delete the current UI or activate a new Worker. `ADMIN_SERVICE_MODE=legacy` remains the committed default.

## Existing ownership and reusable implementation

- AdminConsole/AdminOperations and their CSS move to the independent Admin repository; the original main UI stays available for rollback until cutover succeeds.
- Shared login and `rl_session` remain in auth.ts; role is read from users on every operation. Session cookie Domain=.remotearc.app and safeReturnTo already cover admin.remotearc.app.
- Accounts, devices, DeviceRegistry, entitlements, monthly atomic quota consumption, audit storage and website_submissions remain platform-owned. Independent Admin orchestration does not duplicate these data writers.
- The new private named `AdminApiService` exposes the existing /api/me, /api/monitor, operations, read-only billing, credit/plan grants and submission endpoints through a strict method/path allowlist. All mutation requests now get the same exact-origin and JSON checks; this also closes the older plan-grant handler's missing origin gate.
- Service callers cannot assert identity/role. The core resolves the real session from its existing database, then existing domain handlers retain their own checks. Public consumer/marketing hosts still reject Admin APIs.
- Monitoring producers, scheduler, alert delivery, migrations and the DeviceRegistry namespace stay in the main Worker. No new DO class or namespace migration is introduced.
- Optional Cloudflare Billing Read remains in the core for this first split; no Google/Resend/billing token is copied into the Admin service.

## Deployment order and reversible switch

1. Review/merge this additive boundary and promote via the existing exact-master-SHA, green-CI, protected-production process. Reuse PR #182's conditional migration preflight before production: backup confirmation is needed only for pending D1 migrations.
2. Independently review/merge the Admin repository's feature PR. Configure its protected production environment with real required reviewers; its deploy workflow verifies protection before and again after the GitHub environment approval. Keep routes empty and workers_dev=false.
3. Deploy independent `remote-arc-admin`, bound to main's `AdminApiService`; no live hostname changes in this preparation.
4. Stage both Workers with isolated D1/sessions. Validate login return, 401/403, role revocation, wrong-origin writes, plan/credit behavior and idempotency, contact handling, billing failures, partial outage, and complete customer/MCP regression.
5. For approved cutover add this main Worker service binding:
   ```json
   { "binding": "ADMIN_UI", "service": "remote-arc-admin" }
   ```
   Then change ADMIN_SERVICE_MODE from legacy to external. The existing host enters the independent Worker through ADMIN_UI; that Worker calls only the named core entrypoint. It does not re-enter this public proxy.
6. Missing/downstream bindings return private 503 errors. Rollback is the approved configuration change back to legacy; do not restore D1 or create a replacement registry.
7. After successful cutover, a separate cleanup PR removes obsolete main Admin frontend code and its old preview fixture. Minimal core APIs for platform-owned data remain. If the custom domain moves directly later, also remove it from main's Wrangler routes before the next main deployment to avoid domain reclamation.

## API contract v1 and tests

The private API response adds `x-remote-arc-admin-contract: 1` and no-store. Both sides require the original configured Admin origin, shared session and current admin role. Requests are allowlisted, not arbitrary URL/SQL proxies.

`admin-service-test.mjs` exercises real existing handlers with isolated storage: anonymous/non-admin/forged-role rejection, all write origins, method/media restrictions, list/read/write routes, response privacy and reversible external routing. Existing full Relay security and repository coverage checks still run with unchanged thresholds. The independent Admin Worker has its own 90% business-code coverage gate and tests session forwarding, API/HTML access, body limits, previews and outage recovery.

## Related open PRs

At review time, #182 is the only open feature PR: Cloud Skills plus conditional D1 release preflight. It touches index.ts and deployment workflows; rebase/resolve additively rather than replacing its Skill routes or release safety. Dependency PRs #149/#150 affect Relay tooling/lock; #147/#146/#2 affect Actions. They contain no additional Admin implementation to recreate.

## Explicit remaining work

Production activation, custom-domain handoff, live staged acceptance and old UI cleanup are not completed by this branch. Organization/repository settings and required reviewers are administered by the owner. Existing archive/cost metrics and N/A financial definitions remain unchanged.
