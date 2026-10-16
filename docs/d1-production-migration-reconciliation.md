# D1 production migration history reconciliation (2026-10-16)

This is a **repository-history repair**, not an instruction to execute a database write.

## Read-only evidence (Cloudflare production account)

Production database `remote-link-auth` has applied 27 migrations. Latest applied:
`0027_marketing_email_preferences.sql`. The table `marketing_email_preferences` exists.
Production does **not** yet have `organizations`, `organization_members` or `website_submissions`.

The original SQL for the already-applied marketing migration was committed at
`df899b9` on `feat/support-lifecycle-billing`, but the current `master` lacked
that file, so a fresh D1 would have a different schema from production.

Restore that **exact historical filename and SQL** without re-numbering it. Wrangler
tracks migration filenames; production already recorded it as applied. There are
two distinct migrations beginning with `0027_` (marketing and organizations).
Their full filenames are different and are ordered lexicographically.

## Next controlled production release

1. CI for this reconciliation and merged Phase 0 / #177 must pass.
2. Verify D1 Time Travel bookmark and **separately approved recoverable backup**
   immediately before deployment. The workflow's `BACKUP_VERIFIED` input is a
   human attestation, **not** a backup operation.
3. From the exact current `master`, compare `wrangler d1 migrations list
   remote-link-auth --remote` against expected **two** pending migrations:
   `0027_organization_foundation.sql` and `0028_engagement_submissions.sql`.
   The marketing migration must **not** be pending.
4. Deploy only with GitHub Actions' protected manual production workflow, not
   an untracked Mac `wrangler deploy` or an old checkout. Confirm the
   production environment reviewer approves. Do not bypass the check.
5. Verify production login, existing user/device permissions, MCP, Admin auth,
   and the new form/engagement endpoints. Validate a test submission and delete
   its test record through approved admin controls.
6. Database time-travel recovery rolls back **all post-bookmark writes**, not
   just the migration. Prefer app rollback without database restoration unless
   an explicit, impact-reviewed recovery is needed.

Production database was inspected read-only (Time Travel info; SELECT migration
ledger; SELECT table names). No migration, restore, export or deployment was run
as part of finding this discrepancy.
