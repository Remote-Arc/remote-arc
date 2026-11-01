# User follow-up CRM

The Admin **User follow-ups** workspace manages individual support conversations and reviewed bulk follow-ups. A reminder creates an Admin task; it does not send an email automatically.

## Contacts and status

- Visible tabs show All users, To follow up, Contacted, Waiting for reply, Resolved and Stopped, with server-calculated counts. Search and product-activity filters apply to the counts and list together. These are saved views: Contacted includes historical contact and can overlap Waiting/Resolved; overdue reminders also appear in To follow up.
- To follow up includes contacts marked new and contacts with a due reminder, excluding resolved and stopped contacts. Successful submission clears the fulfilled reminder and marks the contact contacted. Waiting and Resolved can be recorded manually, individually or in bulk. Receiving replies in the support mailbox does not automatically update CRM status.
- Filter by paired computer without active MCP authorization, no connections, no retained usage records, recorded usage or due reminders. Activity does not expose conversations, files or tool arguments. No retained usage is not proof that someone never used the product.
- The full table shows status, activity, last contact and next reminder. Selecting a user opens the existing editable draft/history/notes workspace beside a compact contact list. Switching users preserves in-progress drafts.
- Select a page or up to the first 100 matching users across pages to update their status or compose a bulk follow-up. Stopped contacts remain stopped; updating another status cannot restore their subscription.

## Funnel and next steps

The page opens with an activation funnel over all users: registered, computer paired, AI client connected and used Remote Arc. A browser extension is not a paired computer. Each step offers a "stuck before this" filter (`segment=step:pair_computer`, `step:connect_ai`, `step:first_use`), and every user carries a next step with a matching template: "Pair your computer" (install command and Windows download), "Computer paired · finish MCP setup", "Reach a first result", or the experience check-in once they have used the product. A bulk email from a next-step filter starts from that template.

## Individual emails

Choose an English or Chinese template, personalize it, save the draft and review the exact saved HTML before sending. Saved drafts remain editable using revision checks; stale browser tabs cannot replace or send a newer version. The send dialog displays recipient, From, Reply-To and subject, and optionally records an existing support request or agreement. Leaving the contact basis blank does not block sending and does not create a consent record.

Templates include finishing MCP installation after device pairing, first connection, first result, feedback, after-support follow-up and workflow help. Installation links go directly to the official ChatGPT, Claude and Cursor guides in the chosen language.

## Bulk follow-ups

1. Select users, then choose **Bulk email**. Pick the email language/template, customize subject, message and appearance, and optionally record a contact basis for this group. It can be left blank. Personalization supports `{{name}}`, `{{setupUrl}}`, `{{feedbackUrl}}` and the template's official client installation URLs. Switching a template asks before replacing edited text.
2. **Review recipients & emails** prepares a durable draft batch without sending. The server resolves every address, creates an immutable personalized email per eligible user and reports exclusions. Preview each recipient's exact saved HTML. Existing opt-outs, unresolved deliveries and recent contact remain visible exclusions. Missing contact-basis notes do not exclude a selected registered user.
3. **Confirm & send** explicitly queues the reviewed batch. An explicitly selected group support request/agreement is applied atomically at confirmation; leaving it blank preserves existing records. Repeated confirmation does not duplicate the task. Each recipient receives a separate email with a personal feedback and unsubscribe link; recipient addresses are never shared in To/CC.
4. Sending continues after the page closes. **Bulk history** shows prepared drafts, progress, individual results and saved previews. A prepared draft can be reviewed and confirmed later. **Cancel remaining** cancels emails that have not started; an in-flight submission can still finish. Reopening or refreshing the page never starts a new batch by itself.

Batch-owned emails also appear in individual contact history. Manage them through Bulk history; they cannot be edited or dispatched through individual-draft routes. To change a prepared batch, return to editing, which cancels the old snapshot and prepares a new one.

## Delivery behavior

The server rechecks recipient address, opt-out, cooldown and operator access at dispatch. An atomic claim and per-message provider idempotency key prevent duplicate sends. The 72-hour per-user cooldown applies across individual and bulk sends.

A global D1 lease serializes background workers. The existing one-minute cron drains the durable queue; an explicit queue action also warms the worker through `waitUntil`. Work is bounded per invocation and paced at one provider call per second. Explicit rate-limit rejections receive delayed, bounded retries using the same saved content/key. Timeouts, ambiguous provider failures and interrupted in-flight sends become unknown and are never blindly resent. Revoked operator access, changed sender configuration and changed recipients are recorded as exclusions.

Provider acceptance is shown as submitted, not delivered. Bounce/complaint reconciliation and verification of unknown delivery remain operator tasks. There is no email-open tracking. Feedback form submissions retain `source=followup:<message-id>`; this is attribution, not verified identity.

Every email includes the reply mailbox and a recipient-specific unsubscribe link. GET shows a confirmation; POST stops future follow-ups. Admin cannot undo a recipient unsubscribe. Essential sign-in mail remains independent.

## Email providers and budgets

Login and registration OTP prefer `RESEND_API_KEY` and use SendPulse for overflow **only when** `SENDPULSE_OTP_ENABLED=1` is explicitly configured and `SENDPULSE_API_KEY` is present. The flag defaults off: an API key alone is not proof of SMTP approval or sender verification. After activation, overflow applies when the primary account has no local capacity, rejects delivery or leaves delivery uncertain. OTP uses `EMAIL_FROM` on both providers. Set `FOLLOWUP_EMAIL_PROVIDER=sendpulse` to use SendPulse for follow-ups; follow-ups never fail over to another account. Omitted/blank follow-up provider selection keeps the existing Resend behavior. An unknown provider or a missing selected-provider key disables follow-up sending without claiming a draft.

The production Wrangler configuration explicitly selects `FOLLOWUP_EMAIL_PROVIDER=sendpulse`: reviewed user follow-ups spend SendPulse capacity first and wait at its limits instead of borrowing Resend's OTP allowance. `EMAIL_FROM`, the Resend key and the explicit OTP overflow opt-in are unchanged. Keep this selection in the deployment configuration; a dashboard-only change can be replaced by the next normal deployment. Before promotion, review pending batches prepared under Resend: the existing sender/provider guard requires preparing them again after the switch. This configuration does not queue new emails or bypass review.

| Follow-up provider | Key | Default 1-hour limit | Default 24-hour limit | Default 31-day allocation |
| --- | --- | --- | --- | --- |
| `resend` | `RESEND_API_KEY` | 60 | 60 | 1,800 |
| `sendpulse` | `SENDPULSE_API_KEY` | 50 | 400 | 12,000 |

OTP has priority in a shared account pool. Follow-ups reserve at least 40 daily and 1,200 monthly slots for OTP on either provider, plus 10 hourly slots on SendPulse. These are reservation floors, not OTP ceilings: OTP can take every unused follow-up slot up to the account ceiling. As actual OTP usage exceeds a floor, follow-up capacity shrinks automatically. For example, 80 Resend OTPs leave at most 20 daily follow-ups; when that account fills, OTP can borrow unused SendPulse follow-up capacity. Already accepted emails cannot be preempted, and provider ceilings still apply. No paid plan upgrade or credit purchase happens automatically.

The account defaults are Resend 100/day and 3,000/31 days, and SendPulse 50/hour, 400/day and 12,000/31 days. The SendPulse integration uses the [SMTP REST API](https://sendpulse.com/integrations/api/smtp), whose [free plan](https://sendpulse.com/pricing/smtp) has 12,000 emails/month and 50/hour; it does not use the separate 15,000-email marketing plan. The 400/day cap is Remote Arc's conservative default. `RESEND_DAILY_EMAIL_LIMIT`, `RESEND_MONTHLY_EMAIL_LIMIT`, `SENDPULSE_HOURLY_EMAIL_LIMIT`, `SENDPULSE_DAILY_EMAIL_LIMIT` and `SENDPULSE_MONTHLY_EMAIL_LIMIT` configure the shared ceilings for the actual accounts; zero disables that capacity.

`FOLLOWUP_HOURLY_EMAIL_LIMIT`, `FOLLOWUP_DAILY_EMAIL_LIMIT` and `FOLLOWUP_MONTHLY_EMAIL_LIMIT` override the follow-up-only caps in the table (zero pauses follow-ups, not OTP). All windows roll; the monthly allocation uses a conservative 31 days across billing-month boundaries. Usage is counted separately per provider, including in-flight and uncertain deliveries, using delivery-attempt time rather than draft age. Atomic quota reservations cover concurrent OTP, individual follow-ups and bulk sends. Follow-up history remains counted, and the migration conservatively imports retained OTP challenge request counts. The OTP capacity ledger has no addresses or codes and is purged after 32 days.

At a cap or when OTP needs the remaining capacity, a single follow-up returns `hourly_email_budget_reached`, `daily_email_budget_reached` or `monthly_email_budget_reached` and keeps its draft. Bulk recipients stay pending until capacity returns. Admin shows the selected provider, rolling follow-up and OTP usage, and current follow-up capacity. Accounting covers Remote Arc traffic and imported retained challenges, not an authoritative live balance for unrelated senders on the provider account. Set conservative ceilings if the accounts are used elsewhere; raise them only after checking the account plan.

## Deployment and sender configuration

Deploy all normal migrations, including `0073_followup_delivery_providers.sql`, before the new Worker. It adds provider/attempt-time fields, indexes and an OTP capacity ledger; old rows and reviewed batches default to Resend. Production promotion must run the existing encrypted-backup and migration preflight before deploying the Worker and UI. Keep the follow-up provider set to Resend during rollout. Provision `SENDPULSE_API_KEY` only after both login and support senders are verified. In addition, set `SENDPULSE_OTP_ENABLED=1` **only after successful live validation**; without this opt-in, the key cannot enable OTP overflow. To roll back, pause follow-ups, restore the previous Worker and Resend selection, and retain the additive schema/history. The previous Worker does not enforce the new shared pool, so follow-up sending should remain paused until the new Worker is restored. Provider changes invalidate unsent reviewed batches, which must be prepared again. Before moving follow-ups from SendPulse back to Resend, review outstanding `sending` and `unknown` messages so nothing is delivered twice through different providers. Do not revoke the Resend key. Rotate or remove `SENDPULSE_API_KEY` once no provider uses it.

Both follow-up providers use `Remote Arc <support@remotearc.app>` by default. Optional `FOLLOWUP_FROM` and `FOLLOWUP_REPLY_TO` override the follow-up sender and reply mailbox; blanks keep the defaults. Reply-To defaults to `support@remotearc.app`. `EMAIL_FROM` remains the login-mail setting.

To activate SendPulse:

1. Activate the SendPulse SMTP service, which needs an approved application. Verify the exact `EMAIL_FROM` login sender and `FOLLOWUP_FROM` support sender in SendPulse SMTP, since publishing DNS alone does not verify a sender, and confirm the account is on the Free/paid plan, not the SMTP Test plan (which has lower limits). Configure its DKIM/SPF records without replacing the existing Resend sending DNS or inbound support-mailbox routing. Combine authorized senders into a single SPF record where applicable.
2. Generate a static API key in **Settings > API > API keys**, as described in [SendPulse authorization](https://sendpulse.com/integrations/api#auth). Keep the existing `RESEND_API_KEY` and `EMAIL_AUTH_SECRET`. From `apps/relay`, on a local interactive terminal authenticated to the Cloudflare account that owns the Worker, store the key as a secret:

   ```sh
   pnpm exec wrangler whoami
   pnpm exec wrangler secret put SENDPULSE_API_KEY
   pnpm exec wrangler secret list
   ```

   Paste the key into Wrangler's prompt, never into a command argument, `echo`, history, GitHub, logs or chat. Check that `SENDPULSE_API_KEY` appears by name only.
3. After confirming a production SMTP Free/paid account, exact sender verification and operator-owned test delivery, set `SENDPULSE_OTP_ENABLED=1` explicitly to enable OTP overflow (leave it unset or `0` for an unapproved/Test account). Follow-ups are independent: explicitly select `FOLLOWUP_EMAIL_PROVIDER=sendpulse` only after their own checks. Check that Admin reports the expected provider, OTP usage and limits. Confirm operator-owned test deliveries, reply routing, unsubscribe, normal OTP and OTP overflow before customer outreach. Development checks mock both providers and do not prove delivery or DNS.

The exact reviewed HTML is UTF-8/base64 encoded for SendPulse, with the same plain-text body, reply mailbox and in-body unsubscribe link. Resend retains its custom one-click unsubscribe headers and idempotency key. SendPulse's documented JSON endpoint does not specify custom message headers or an idempotency key, so those are not claimed for that provider. The persisted once-only claim and conservative unknown state prevent blind retries after ambiguous responses on either provider.

The follow-up API is restricted to the Admin origin and real Admin sessions, with same-origin JSON checks on writes. Background dispatch verifies the confirming operator is still an Admin. Public previews use illustrative users and local simulation; no production OAuth, D1, email or customer system is connected.

SQLite/provider-mock and desktop English/light plus mobile Chinese/dark browser checks cover CRM counts, status updates, selection, editable drafts, personalized snapshots, queue replay, concurrent preparation/dispatch, cancellation, changed permissions/recipients, rate-limit backoff and crash uncertainty. No real user is emailed by development checks.
