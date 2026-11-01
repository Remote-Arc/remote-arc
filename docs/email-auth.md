# Passwordless email sign-in

Remote Arc offers Google OAuth and passwordless email sign-in on the **same D1 user/session model**. Device pairings, MCP grants and account entitlements remain attached to the existing user ID.

## Prerequisites

1. Verify `remotearc.app` in Resend (including its SPF/DKIM records) and confirm that the domain status is **Verified**, not Pending.
2. Create a Resend API key with sending permission for this application. Store it in the Cloudflare Worker as the **secret** `RESEND_API_KEY`. Do not put it in Git, screenshots or chat.
3. Generate an independent, random 32+ byte secret and store it in the same Worker as `EMAIL_AUTH_SECRET`. This key signs the OTP hashes; do not rotate it during outstanding 10-minute sign-in flows.
4. Optionally set `EMAIL_FROM` to a verified sender at `remotearc.app`. The default is `Remote Arc <login@remotearc.app>`.
5. Apply all D1 migrations, including `0024_email_login.sql` and `0073_followup_delivery_providers.sql`, to the production `remote-link-auth` database **before** the new Worker.
6. For automatic overflow, verify the login sender in SendPulse SMTP and provision the Worker secret `SENDPULSE_API_KEY`. The same key can serve follow-ups; OTP has priority in the shared pool. See [provider activation and limits](./user-followups.md#email-providers-and-budgets).

From `apps/relay`, with a Cloudflare account already authenticated:

```sh
pnpm exec wrangler d1 migrations apply remote-link-auth --remote
pnpm exec wrangler secret put RESEND_API_KEY
pnpm exec wrangler secret put EMAIL_AUTH_SECRET
pnpm exec wrangler secret list
```

Pass secret values interactively; do not append them to shell history. Confirm the deployment workflow actually applied the migration, since the current GitHub Actions deploy can continue when its Cloudflare token lacks D1 migration permissions.

## Flow and security

- `GET /auth/login`: Google and, when `EMAIL_AUTH_SECRET` and at least one mail-provider key are configured, email.
- `POST /auth/email/request`: same-origin form, IP throttling (3 requests/minute), per-address cooldown (60 seconds) and cap (5 send attempts/24-hour window).
- A six-digit code is generated cryptographically, stored only as an HMAC-SHA256 digest and expires after 10 minutes. An OTP permits no more than five wrong attempts.
- `POST /auth/email/verify`: atomically consumes the code before issuing the existing 30-day secure HttpOnly session cookie.
- New users get a reserved `email:<uuid>` placeholder in `google_sub` for compatibility with the legacy NOT NULL schema. Verified Google login to the same email replaces that placeholder and keeps the same user ID. A future schema migration can normalize this into a nullable Google identity.
- Existing Google users signing in by email receive the existing user ID, not a duplicate account. Dedicated reviewer demo accounts are excluded from email OTP.
- Invalid return URLs are rejected back to the app origin, and OTPs never appear in links, query strings or logs.
- Providers only deliver email; they never create sessions or manage device/MCP permissions.
- OTP prefers Resend, can consume unused marketing allocations beyond its reservation floor, and spills to SendPulse when Resend has no local capacity or confirms a rejection. Shared atomic account ceilings still apply. Follow-up availability shrinks as OTP usage rises, and queued follow-ups wait. This uses existing plan capacity, without automatically buying an upgrade.
- A fallback attempt uses the same code. A timeout, malformed success or 5xx response is uncertain: no alternate provider is tried, the challenge stays valid, its capacity remains reserved and the form lets the user enter the possibly delivered code. The per-address cooldown still applies. If both accounts are full or all attempts are confirmed rejected, invalidate the challenge and return 503.

Before enabling this publicly, confirm **real delivery and login** through each configured provider from a new browser. Local tests mock delivery and do not prove DNS verification or inbox placement. IP/address throttles and shared account ceilings remain enforced.

## Validation

```sh
pnpm --filter @remotearc/relay typecheck
pnpm --filter @remotearc/relay test:security
pnpm --filter @remotearc/ui typecheck
pnpm --filter @remotearc/ui build
```
