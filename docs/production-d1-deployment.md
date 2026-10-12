# Production D1 deployment credentials

The Remote Arc production account is 6b1d0dd4e6f7f30df92753cd1e2ee12d.
The production D1 database is remote-link-auth.
The deployment workflow must not publish a Worker after an unverified or
failed migration, including Cloudflare API error 7403.

## Separate least-privilege credentials

- CLOUDFLARE_API_TOKEN: existing repository secret, for deploying the Relay
  Worker and static assets. Leave it unchanged.
- CLOUDFLARE_D1_API_TOKEN: new repository Actions secret for D1 migration
  operations only. Create a custom API token in the Cloudflare account
  6b1d0dd4e6f7f30df92753cd1e2ee12d with Account > D1 > Edit
  permission, scoped to that account. Do not add broad Workers/DNS permissions.

Cloudflare: https://dash.cloudflare.com/profile/api-tokens
GitHub: https://github.com/yaohuangguan/remote-arc/settings/secrets/actions

Copy the one-time token value directly into the GitHub repository Actions
secret named CLOUDFLARE_D1_API_TOKEN. Do not paste it into a PR, terminal
command argument, build log, or chat. GitHub encrypts the repository secret.

Create the token and set the secret BEFORE merging this workflow to master,
or automatic deployments will intentionally stop at the D1 step.

## Verification

1. Set the new GitHub secret and merge this PR.
2. Observe CI and Deploy Cloudflare. D1 apply plus list must both succeed.
3. Confirm Worker deploy starts only after D1 succeeds, then check /health.
4. A D1 7403, SQL failure or missing token should fail the workflow, not deploy.

The D1-only token is exposed only to the migration step. The existing Worker
deploy token remains independent. Production D1 migrations are not dry runs.

Regression tests: pnpm test:deploy-policy.
