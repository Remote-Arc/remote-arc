# Admin instrumentation & Cloudflare billable usage

## Product event diagnosis (26 October 2026)

Admin now includes Events & journeys. It records fixed operational events for login, device pairing/dispatch, Apps and task requests, persisted task outcomes, and checkout/payment processing. Browser signals are explicitly separated from backend and Stripe evidence. Records exclude user content, full URLs, IPs and payment details; retention targets 30 days. Migration 0065 and the existing protected release are required.

See [Product events](product-events.md) for event definitions, access controls, read-only live payment checks, sampling limits and validation. This supersedes the earlier statement that no click events were recorded in D1. Existing current Agent/background versions and inferred login-method metadata remain unchanged. Marketing attribution, referrers and arbitrary campaign strings are not collected.

The historical Cloudflare billing and mail setup notes below describe their own integrations.

## Real account billable usage API (requires explicit setup)

The Mac's current Wrangler OAuth token cannot access billing endpoints (403/10000).
Use a **separate least-privilege API token**:

1. Cloudflare Dashboard > My Profile > API Tokens > Create Token > Custom token.
2. Permissions: **Account → Billing → Read**. Restrict Account Resources to the production account only. Do not grant Billing Edit, payment methods write, or global API key access.
3. Add a reasonable expiry if operationally feasible. Do not paste this token into GitHub, chat, logs, front-end or D1.
4. Using a secure terminal in the project directory, run:
   ```sh
   cd apps/relay
   npx wrangler secret put CF_BILLING_READ_TOKEN
   ```
   Paste the token into the interactive secret prompt only. No other secret is required for this account because its ID is already configured as the default in the admin billing route.
5. Admin Dashboard > Operations > Cost & billing > **Fetch Cloudflare cost**.
6. The backend requests `GET /accounts/{id}/billable-usage?from=YYYY-MM-01&to=YYYY-MM-DD` **only on button click**; it aggregates Cloudflare's `ContractedCost` rows by service family. Response is administrator-only and no-store. The input API remains **Alpha** and may be unavailable or delayed; errors appear as errors, never zero dollars.
7. The result is **account-wide usage-based cost reported by Cloudflare**, not an issued invoice, not real-time, and not the cost solely attributable to Remote Arc. For invoiced transactions use Cloudflare Billing History.

No scheduler, high-frequency polling, D1 records, billing write permission or new paid monitoring products are introduced.

## Support mail forwarding (requires Cloudflare DNS action)

As confirmed by read-only Cloudflare API on October 11: `remotearc.app`
Email Routing is `unconfigured`, destination list is empty, and the only
existing rule is disabled catch-all drop. Its authoritative root MX still
contains Namecheap `eforward*.registrar-servers.com` entries.

Cloudflare Email Routing receives/forwards email on Free and Paid plans.
It is not a paid mailbox product.

1. Cloudflare Dashboard > **remotearc.app** > Email > Email Routing.
2. Configure routing, allowing Cloudflare to replace **root incoming MX** (currently Namecheap forwarding records). Check first that no other root-domain mailboxes depend on Namecheap's MX; per current user instruction the only intended address is support.
3. Add and verify `moviegoer24@gmail.com` as a destination (Cloudflare emails a confirmation link).
4. Add exactly one rule for `support@remotearc.app` → the verified destination.
5. Verify DNS now contains Cloudflare's routing MX and that Email Routing is `ready`.
6. Send a test from an unrelated account and confirm it arrives in Gmail; inspect SPF/DMARC and reply usability. Forwarding inbound **does not** enable sending as `support@`.
7. Preserve Resend's existing **sending** DNS (SPF/DKIM and any subdomains); do not replace Resend keys or login OTP delivery settings.

The connected Mac OAuth credential allowed read-only Cloudflare Email Routing
inspection but the attempted destination mutation was blocked by an execution
safety gate. Do not bypass that gate by extracting another token. The owner
must complete the above official UI setup or connect a scoped authorized
Cloudflare DNS/Email Routing integration.

**Support page should not claim mail is operational until an end-to-end
incoming message is received.** The support/lifecycle implementation is in
PR #156 and should remain behind that deployment check.

## Guardrails for the earlier billing-read integration

- This change makes no production D1 migration and does not touch existing
  audit data, monthly quotas, MCP OAuth or device permissions.
- The billing API route is admin-only, no-store, strictly read-only, and
  sends the secret solely in an outbound request to Cloudflare.
- Empty/missing/mixed-currency billing data are not converted to falsely
  reassuring zero-dollar totals.
