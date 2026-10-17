# Phase 1 production release and recovery

The owner authorized merging all open PRs and publishing Connect Apps without waiting for 29 separate real-account acceptance sessions. Automated checks, exact-master-SHA promotion and the existing production reviewer remain required. Arc Chat / Agent stays in development; it will reuse the same owner-scoped App connections later.

## Combined candidate

The integration branch includes #182–#187 and dependency updates #2, #146, #147, #149 and #150. The independent Admin repository's #1 was merged separately; its service/domain cutover is not part of the main production switch.

The new Apps experience has 29 native connectors: 27 managed OAuth and two user-credential paths (Runway and WhatsApp Business). OAuth clients still need actual platform registration, distribution eligibility and server configuration. Automated provider HTTP tests use mocks and do not certify all real accounts. A code release cannot manufacture provider client credentials.

Public /integrations and /zh/integrations handle category/provider links on the marketing origin, with real operation descriptions and a metadata-only connection readiness check. Docs is a searchable index with 15 topic pages, MCP and long-running-work references; old #docs- links still open the complete guide.

## Production sequence

1. Merge the checked combined candidate and wait for successful **push CI on the exact current master SHA**.
2. Dispatch Deploy Cloudflare on master. Keep the production environment's owner review; this workflow never deploys on merge alone.
3. After approval, read the production D1 migration ledger. Unknown names, missing access and malformed history stop the release.
4. If migrations are pending, export production D1, restore the SQL into isolated SQLite and verify integrity and the exact migration ledger. Encrypt it with AES-256-GCM, decrypt and restore it again, then retain only the encrypted artifact and manifest in GitHub Actions for seven days. The plaintext files are removed from the runner; plaintext D1 is never uploaded to this public repository.
5. Only the successfully verified and retained backup can supply the automatic BACKUP_VERIFIED attestation. An empty external backup confirmation is valid for this path; it is not an instruction to invent an attestation.
6. Apply pending migrations, then read history again and require an empty pending set.
7. Provision APP_TOKEN_KEY only if the Worker has no existing vault secret. Existing keys are never rotated automatically. Deploy the exact checked SHA with ENABLE_APPS=1.
8. Verify marketing Home/Arc, Docs subpages, integrations navigation, login, private Apps ownership, MCP/device discovery, existing Tasks and Admin. The public status must distinguish configured providers from those awaiting setup.

Baseline historical D1 evidence recorded 27 applied migrations through 0027_marketing_email_preferences.sql. The candidate adds 0027_organization_foundation.sql, 0028_engagement_submissions.sql, 0029_billing_foundation.sql, 0030_apps_ecosystem.sql and 0031_apps_registry_and_usage.sql. Confirm actual filenames from live history rather than assuming these are all still pending.

## Key custody and recovery

GitHub Actions secret D1_BACKUP_KEY encrypts database recovery artifacts. APP_TOKEN_KEY encrypts saved App credentials and reviewed requests. They are independent random 32-byte keys, not provider credentials. Provisioning keeps recovery copies on SamPC WSL under ~/.local/state/remotearc-operator/ with directory mode 0700 and file mode 0600. Key values are never printed or committed. Do not rotate either key as part of a routine release.

Download the encrypted production-d1 artifact within its seven-day retention period and keep it in controlled operator storage if longer retention is needed. Recover SQL locally with:

    node scripts/restore-d1-backup.mjs --artifact-dir /absolute/artifact-directory --key-file /home/samyao/.local/state/remotearc-operator/d1-backup-key --output /absolute/new-recovery.sql

The helper authenticates and checks the backup, creates a new 0600 file and refuses to overwrite an existing file. It does not restore any database. A production restore would discard subsequent writes and requires a separate impact-reviewed recovery decision.

Prefer compatible Worker rollback while retaining additive D1 schema. To stop new App actions use ENABLE_APPS=0. Keep MODEL_GATEWAY_ENABLED off and ADMIN_SERVICE_MODE=legacy for this release. Never restore a database merely to roll back a website design.

## Configuration and costs

See [OAuth registration](apps-oauth-registration.md), [expanded Apps](apps-expansion.md), [App cost ownership](apps-cost-ownership.md), [model and billing foundation](model-billing-foundation.md) and [Admin boundary](admin-service-extraction.md). The registration generator derives callback URLs/scopes and secret names from the actual registry. It creates no upstream application and prints no secrets.

User-generated writes require their normal exact-payload approval. Do not spend provider credits, send test email/posts, buy API funding or enable automatic recharge just to mark an integration verified. The owner chose to try their own accounts after publication.

Old Dependabot preview failures were caused by withheld CLOUDFLARE_API_TOKEN, while their UI builds and CI succeeded. The preview workflow still builds dependency updates, but skips deployment/comment/cleanup steps requiring credentials for Dependabot-authored PRs. The combined owner-authored candidate receives a real preview check.
