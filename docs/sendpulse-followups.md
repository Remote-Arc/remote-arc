# SendPulse follow-up delivery (optional)

Remote Arc authentication and login emails always use Resend. The admin follow-up CRM, reviewed HTML drafts, D1 queue, per-recipient cooldown, unsubscribe flow and audit trail are unchanged. This provider only affects the separate follow-up dispatch path.

## Before enabling

1. Activate SendPulse SMTP service and confirm `remotearc.app` DKIM/SPF and the exact sender address `support@remotearc.app` in SendPulse → SMTP → Settings → Sender emails. Publishing DNS alone is not equivalent to sender verification.
2. Generate a **dedicated static SendPulse API key** under Account settings → API → API keys. Keep the key off GitHub, logs, screenshots and chat transcripts. Store it immediately because SendPulse displays it only once.
3. Authenticate Wrangler for the Cloudflare account owning `remote-link-relay`, then run the following in a **local interactive terminal**:

   ```sh
   wrangler whoami
   wrangler secret put SENDPULSE_API_KEY --name remote-link-relay
   wrangler secret list --name remote-link-relay
   ```

   Paste the key directly into Wrangler's prompt; do not insert the key into shell command arguments or an `echo`/history entry. Check that `SENDPULSE_API_KEY` appears by name only.

4. Deploy this change and ensure its typechecks and follow-up tests pass **before** setting `FOLLOWUP_PROVIDER=sendpulse` on the production Worker. During verification leave the flag absent, so Resend continues to serve existing follow-ups.
5. Use a restricted single-recipient test and inspect SendPulse's send receipt and delivery history before releasing a real batch. Only then configure `FOLLOWUP_PROVIDER=sendpulse` as a Worker environment variable or secret.

## Behaviour

- `FOLLOWUP_PROVIDER` omitted or `resend`: legacy follow-ups via `RESEND_API_KEY`.
- `FOLLOWUP_PROVIDER=sendpulse`: follow-ups use `SENDPULSE_API_KEY` and the SendPulse SMTP REST API. If the key is missing, the feature fails closed. It will **not** fall back to Resend.
- Authentication email delivery always uses `RESEND_API_KEY` regardless of follow-up provider.
- All outgoing follow-ups still use `FOLLOWUP_FROM` (default `Remote Arc <support@remotearc.app>`) and `FOLLOWUP_REPLY_TO` (default `support@remotearc.app`), which must be authorized in SendPulse.
- SendPulse requires Base64-encoded UTF-8 HTML; the plain-text version and the unsubscribe link remain part of the saved reviewed template. Provider-receipt IDs are stored in the existing message record.
- SendPulse does not document Resend's `Idempotency-Key` semantics, so ambiguous SendPulse responses and interrupted sends are marked `unknown` and **not automatically re-sent**. Resend-specific 429 retries are preserved only for Resend.
- The existing independent follow-up daily cap (default 60), per-contact cooldown, suppression and admin review flow still apply.

## Backout

Set `FOLLOWUP_PROVIDER=resend` only **after checking outstanding SendPulse `sending`/`unknown` message statuses and pausing/clearing queued campaigns** to avoid delivering duplicate messages through different providers. Do not revoke Resend's login key. Remove or rotate the SendPulse secret when the provider is no longer used.
