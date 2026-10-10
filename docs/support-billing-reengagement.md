# Support email, actual billing and consent-safe lifecycle emails

## Deployment status / safety gates

The changes in this branch require database migration
`0027_marketing_email_preferences.sql`. The migration only **creates a new
table and an index**. It does not alter `users`, `email_login_challenges`,
device permissions, existing credentials, or delete old records.

**Do not deploy the public Support email address before inbound delivery is
tested.** The public contact can then be offered as
`support@remotearc.app`.

The promotional email campaign is **off by default**:
`MARKETING_REENGAGEMENT_ENABLED=0`. Existing users have no marketing consent.
Only opt-in from the dashboard sets `opted_in=1`. Never auto-opt-in existing
users just because they registered or received an OTP.

## Support forwarding: current DNS and free service

On 2026-10-11, the domain's existing MX pointed to Namecheap
`eforward*.registrar-servers.com`, but the authoritative DNS is Cloudflare.
Namecheap states that its *free forwarding* requires Namecheap DNS; a stray
`eforward` MX is **not proof that mail forwards**. Do not assume the support
mailbox exists.

Prefer **Cloudflare Email Routing** for inbound mail (available without
additional email hosting cost on Free or Paid Workers plans):
1. Review existing mailboxes/forwarders relying on the root MX before changing.
2. In Cloudflare Dashboard > `remotearc.app` > Email > Email Routing, enable
   routing for the domain, and let Cloudflare replace conflicting root MX.
   **Do not change any Resend sending subdomain, SPF or DKIM records**.
3. Add `moviegoer24@gmail.com` as a destination address and complete the
   verification email sent by Cloudflare.
4. Add a custom routing rule:
   `support@remotearc.app` → verified `moviegoer24@gmail.com`.
5. Send a real test email from **another mailbox**, not the forwarding
   destination itself. Verify delivery, visible original sender and ability
   to reply. Only then merge the Support-page public CTA.
6. If existing root MX serves other mailboxes, first migrate their rules too;
   MX cannot simultaneously point to unrelated incoming providers.

Cloudflare Email Routing only receives/forwards email. Sending replies
**as** `support@remotearc.app` is a separate SMTP/sending setup. You can
reply from Gmail as yourself unless you configure a verified Send Mail As
identity via a sender provider. Do not promise two-way support@ replies
until tested.

## Billing: do not mistake usage for actual invoice

Cloudflare's Billable Usage API:
`GET /client/v4/accounts/{account_id}/billable-usage`.
A read-only request using the current Mac Wrangler OAuth token returned
403 / 10000 (not authorized). No billing amount was retrieved. Do not create
or enable any new paid service just to measure this.

Use Cloudflare Dashboard > Billing > Billable Usage and Billing > Invoices to
read actual USD charges for **Workers, D1, R2 and Durable Objects**.
One Cloudflare account also hosts unrelated projects, so these totals
are account-wide, **not** all attributable to Remote Arc. Attributing costs
requires account-level usage and a before/after baseline. To allow automated
read-only queries, create an appropriately scoped Billing Read credential
or share an authenticated dashboard tab through a read-only connector.
Do not paste the credential into chat or commit it.

## Email preference and campaign

- `GET /api/marketing/preferences`: authenticated user preference.
- `POST /api/marketing/preferences`: same-origin JSON POST, explicit
  `{ "opted_in": true|false }`. Defaults to false. Consent timestamp
  and explicit source stored in D1.
- `GET /unsubscribe?u=...&s=...`: confirmation page; **GET does not
  unsubscribe** because link scanners open email URLs automatically.
- `POST /unsubscribe?u=...&s=...`: validates HMAC signature, sets opt-out
  immediately, no login needed. Works with the RFC 8058 one-click POST.
- Both HTML and plain-text email include the unsubscribe URL and contact
  address; Resend payload also carries `List-Unsubscribe` and
  `List-Unsubscribe-Post` headers.
- `runReengagementCampaign` eligibility: explicit consent; registered
  at least seven days; not admin/reviewer; no recorded tool calls;
  never previously sent the campaign.
- When deliberately enabled, up to 3 candidates per cron invocation, no
  more than 5 claims per UTC day. The D1 row claim guards concurrent sends
  and ambiguous timeouts stay claimed rather than risking duplicates.
- Email sending is **disabled** unless `MARKETING_REENGAGEMENT_ENABLED=1`.
  Before enabling, test the sender domain in Resend, send a preview to the
  operator's mailbox, inspect template in Gmail, verify unsubscribe and the
  allowed daily/monthly Resend plan budget.
- `MARKETING_FROM_EMAIL` defaults to
  `Remote Arc <updates@remotearc.app>`. The address must be verified by
  the Resend domain configuration; sending from it is not enabled by
  simply adding the value to Wrangler.

NZ Unsolicited Electronic Messages Act requires consent, sender
identification and usable unsubscribes. Old users are not eligible for
marketing solely because they registered.

## Regression checklist

Run `pnpm --filter @remotearc/relay typecheck`,
`pnpm --filter @remotearc/relay test:security` and
`pnpm --filter @remotearc/ui build`. Test opt-in/out in the dashboard with a
test account and the signed unsubscribe link locally before production.
No real promotional emails should be sent from CI or staging.
