# Production Release: D1 + Relay + Website

**Run workflow:** https://github.com/Remote-Arc/remote-arc/actions/workflows/deploy-cloudflare.yml

This is a **manual, owner-approved Cloudflare production release** from the latest tested `master`. Merging a PR does **not** deploy production.

## Regular release (recommended)

1. Ensure the newest `master` commit has passed CI.
2. Open the workflow URL and select **Run workflow** on `master`.
3. Keep **enable_stripe = false** unless intentionally activating live Stripe payments.
4. Keep **enable_openai = false** unless intentionally activating hosted OpenAI models/trials.
5. Review and approve the `production` environment request when GitHub prompts. Check the job steps and the run summary.

There is **no backup confirmation field**. When pending D1 migrations exist, the workflow automatically exports the production D1 database, checks an isolated restore, encrypts and re-verifies a backup, retains the encrypted recovery artifact for seven days, and only then applies migrations. Failures block deployment; do not bypass them.

## What's included

| Target | Actual action |
| --- | --- |
| `remote-link-auth` D1 | Inspect the remote migration ledger. If new migrations are pending, perform verified encrypted backup, apply SQL migrations, and verify no pending entries remain. No pending migrations means no database writes. |
| `remote-link-relay` Worker | Build and publish current `master` Relay code, MCP, Apps/OAuth, device pairing and Admin APIs. |
| Website + Dashboards | Build and publish static assets for `remotearc.app`, `agent.remotearc.app`, `admin.remotearc.app`, `mcp.remotearc.app` through the Worker. |
| Apps vault | Ensure required secret exists; do not rotate an existing vault key. |
| Production smoke | Verify deployed commit SHA and public marketing, Connect, MCP, OAuth and dashboard behavior. |

**Not included:** publishing the `remotelink` npm package or updating local Go Agents on Windows/macOS/Linux.

## Optional switches

**enable_stripe**: additional **live payment activation** only *after successful smoke*. Turning it off **does not disable previously enabled payments** and is not required for normal code deployments. This step uses existing audited activation scripts and readiness checks.

**enable_openai**: additional **hosted model and trial activation** only *after successful smoke*, with existing funding/budget checks. Turning it off **does not disable previously enabled models**. Do not enable during an ordinary Connect-only release.

## Troubleshooting

- **CI not passing**: release waits for successful push CI on the exact current `master` commit; do not deploy a stale SHA.
- **D1 backup/migration fails**: inspect the encrypted backup and migration logs. Never directly apply migrations after a failed backup. Confirm `D1_BACKUP_KEY` and `CLOUDFLARE_D1_API_TOKEN` are provisioned in GitHub Secrets.
- **Cloudflare deploy fails**: inspect the Worker deployment step and account/token validation.
- **Smoke test fails**: inspect the deployed `/health` SHA and failing URL; do not call the release successful.
- **Existing payments or OpenAI settings**: leaving either optional switch off skips activation; it is not a deactivation.

For more detail see [Phase 1 recovery](phase1-production-release.md), [D1 backup and recovery](production-d1-deployment.md) and [release notifications](release-ready-github-notifications.md).
