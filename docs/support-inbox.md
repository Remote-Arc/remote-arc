# Support Inbox — Remote Arc Admin

This is a human-reviewed customer support mailbox, independent from user follow-up marketing and login OTP. **No AI auto-replies**. Operators can read incoming messages, set Open / Waiting / Resolved, and submit an individually reviewed response through the existing SendPulse account as `Remote Arc <support@remotearc.app>`.

## Technical path

`support@remotearc.app` → Cloudflare Email Routing → `remote-link-relay` Email Worker → encrypted D1 Support Inbox → verified Gmail forwarding destination.

- The Email Worker parses text/plain or text extracted from HTML via `postal-mime` (body bounded to 22,000 characters, raw message 1.5 MB). Attachments are **not** stored in Admin, but are included in the unchanged Gmail forward.
- D1 stores encrypted message content using the existing `APP_TOKEN_KEY`; only the Admin-host session+role guard can read the decrypted body. Plaintext subject/sender and delivery metadata remain in D1 for searching. Maintain the secret across deployments to preserve decryption.
- Incoming duplicates are blocked by Message-ID; messages are grouped by In-Reply-To or sender + normalized subject for 45 days. This groups the conversation **inside Admin**, not guaranteed RFC 5322 threading in recipient email clients because SendPulse's current API adapter does not set In-Reply-To/References.
- The Email Worker forwards to the verified mailbox even if Admin ingestion fails. It does not create a public ingestion HTTP endpoint.
- Human-reviewed SendPulse replies use a single atomic D1 claim and share account-level quota with OTP and follow-up mail. Ambiguous provider outcomes become `unknown` and prohibit another send in that thread until an operator investigates. The operator can record a manually verified Sent/Failed outcome with a required SendPulse log reference; the resolution is audited with operator and time. Provider-accepted status is **not delivered**.

## Rollout checklist (do these in order)

1. **Before deployment**: review migration `0075_support_inbox.sql` and confirm the encrypted backup / normal migration preflight. Apply the migration before deploying new code to the production Relay.
2. Confirm `FOLLOWUP_EMAIL_PROVIDER=sendpulse`, `FOLLOWUP_FROM=Remote Arc <support@remotearc.app>` (or default), `FOLLOWUP_REPLY_TO=support@remotearc.app`, `SENDPULSE_API_KEY`, `APP_TOKEN_KEY`. Never replace the existing secrets or modify OTP/Resend settings.
3. Configure `SUPPORT_FORWARD_TO` **as a Worker secret** on `remote-link-relay`: the exact already-verified Gmail destination of the current forwarding rule. Do not commit the personal mailbox address. Command from `apps/relay`: `pnpm exec wrangler secret put SUPPORT_FORWARD_TO` (paste value at prompt).
4. Deploy Relay/UI via existing pipeline. Verify `https://admin.remotearc.app/?section=support` loads and admin-only API access returns 403 to non-admin users, 404 on public hosts.
5. **Only after steps 1–4** update **one existing** Cloudflare Email Routing rule for `support@remotearc.app` from **Send to an email** to **Send to a Worker → remote-link-relay**. Do not create a duplicate support rule; the first matching rule wins. Do not change root MX, DKIM/SPF, or other domains.
6. From a distinct mail provider, send a harmless test to support@. Confirm (a) original with attachments still arrives at the same Gmail inbox, (b) one corresponding Admin thread appears, (c) an operator can send a reply and see a real provider receipt and (d) the external recipient sees From support@ and can reply.
7. Test another incoming reply and check that Admin groups it correctly. Compare SendPulse quota and logs. Keep the former forwarding destination verified for fallback.

**Rollback**: change that single support routing rule back to the original verified Gmail destination. Inbound mail continues without Admin ingestion. Do not remove the verified destination, change MX/DKIM, or rotate `APP_TOKEN_KEY` on rollback.

## Known limits

- Older support emails already sitting in Gmail are not automatically imported. This is for incoming messages after route cutover. Existing Gmail/SendPulse conversations remain untouched.
- Body previews are plain text; Admin doesn't render external HTML and doesn't currently expose attachments.
- Automatic out-of-office/bounce suppression is not yet fully implemented; the operator must review sender and reply subject. No automatic outgoing response is generated.
- Provider acceptance is not proof of delivery. Use SendPulse activity for delivery status and resolve unknown sends with the Admin verification controls after reviewing evidence.
- Gmail's own `Send mail as` configuration is unrelated and not required.

## Tests

```sh
pnpm --filter @remotearc/relay exec tsx scripts/support-inbox-test.ts
pnpm --filter @remotearc/relay test:followups
pnpm --filter @remotearc/relay typecheck
pnpm --filter @remotearc/ui typecheck
```
