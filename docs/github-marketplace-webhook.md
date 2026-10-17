# GitHub Marketplace webhook

The listing-specific webhook URL is `https://mcp.remotearc.app/webhooks/github/marketplace`.
Use `POST application/json`. Store `GITHUB_MARKETPLACE_WEBHOOK_SECRET` as an encrypted Cloudflare Worker secret. Do not commit its value.

## Implemented

- Validate HMAC-SHA256 over the raw request bytes using `X-Hub-Signature-256`; reject invalid signatures (401), missing server secret (503), and large payloads.
- Return 200 for authenticated `ping` and 202 for accepted Marketplace events.
- Persist `marketplace_purchase` delivery IDs, applied purchase/change/cancellation status, and pending changes in independent D1 tables.
- Use atomic D1 batches to deduplicate deliveries. Older effective dates cannot overwrite newer applied purchases.
- Only store minimal account/plan metadata; do not persist the raw webhook, emails, OAuth tokens or payment details.
- Do not modify existing Remote Arc entitlement grants or deactivate existing accounts. GitHub account IDs must first be linked by verified OAuth and organization consent.

## Verify

`pnpm --dir apps/relay exec tsx scripts/github-marketplace-test.ts` (also included in `test:security`).
`pnpm --dir apps/relay exec tsc --noEmit`.
After deployment use GitHub's ping delivery to verify an authenticated 200 response.

## Follow-up before paid Marketplace launch

Complete GitHub account/organization OAuth linking, Marketplace API reconciliation, mapped plan grants, revocation and data lifecycle processes. GitHub does not automatically retry failed Marketplace deliveries. Never map a GitHub login string to an unrelated Remote Arc user.
