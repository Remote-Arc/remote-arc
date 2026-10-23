# User follow-up CRM

The Admin **User follow-ups** workspace manages individual support conversations and reviewed bulk follow-ups. A reminder creates an Admin task; it does not send an email automatically.

## Contacts and status

- Visible tabs show All users, To follow up, Contacted, Waiting for reply, Resolved and Stopped, with server-calculated counts. Search and product-activity filters apply to the counts and list together. These are saved views: Contacted includes historical contact and can overlap Waiting/Resolved; overdue reminders also appear in To follow up.
- To follow up includes contacts marked new and contacts with a due reminder, excluding resolved and stopped contacts. Successful submission clears the fulfilled reminder and marks the contact contacted. Waiting and Resolved can be recorded manually, individually or in bulk. Receiving replies in the support mailbox does not automatically update CRM status.
- Filter by paired computer without active MCP authorization, no connections, no retained usage records, recorded usage or due reminders. Activity does not expose conversations, files or tool arguments. No retained usage is not proof that someone never used the product.
- The full table shows status, activity, last contact and next reminder. Selecting a user opens the existing editable draft/history/notes workspace beside a compact contact list. Switching users preserves in-progress drafts.
- Select a page or up to the first 100 matching users across pages to update their status or compose a bulk follow-up. Stopped contacts remain stopped; updating another status cannot restore their subscription.

## Individual emails

Choose an English or Chinese template, personalize it, save the draft and review the exact saved HTML before sending. Saved drafts remain editable using revision checks; stale browser tabs cannot replace or send a newer version. The send dialog displays recipient, From, Reply-To and subject, and records an existing support request or agreement in place when needed.

Templates include finishing MCP installation after device pairing, first connection, first result, feedback, after-support follow-up and workflow help. Installation links go directly to the official ChatGPT, Claude and Cursor guides in the chosen language.

## Bulk follow-ups

1. Select users, then choose **Bulk email**. Pick the email language/template, customize subject, message and appearance, and choose the recorded contact basis for this group. Personalization supports `{{name}}`, `{{setupUrl}}`, `{{feedbackUrl}}` and the template's official client installation URLs. Switching a template asks before replacing edited text.
2. **Review recipients & emails** prepares a durable draft batch without sending. The server resolves every address, creates an immutable personalized email per eligible user and reports exclusions. Preview each recipient's exact saved HTML. Existing opt-outs, missing basis, unresolved deliveries and recent contact remain visible exclusions.
3. **Confirm & send** explicitly queues the reviewed batch. A recorded group support request/agreement is applied atomically at confirmation. Repeated confirmation does not duplicate the task. Each recipient receives a separate email with a personal feedback and unsubscribe link; recipient addresses are never shared in To/CC.
4. Sending continues after the page closes. **Bulk history** shows prepared drafts, progress, individual results and saved previews. A prepared draft can be reviewed and confirmed later. **Cancel remaining** cancels emails that have not started; an in-flight submission can still finish. Reopening or refreshing the page never starts a new batch by itself.

Batch-owned emails also appear in individual contact history. Manage them through Bulk history; they cannot be edited or dispatched through individual-draft routes. To change a prepared batch, return to editing, which cancels the old snapshot and prepares a new one.

## Delivery behavior

The server rechecks recipient address, opt-out, contact basis, cooldown and operator access at dispatch. An atomic claim and per-message provider idempotency key prevent duplicate sends. The 72-hour per-user cooldown applies across individual and bulk sends.

A global D1 lease serializes background workers. The existing one-minute cron drains the durable queue; an explicit queue action also warms the worker through `waitUntil`. Work is bounded per invocation and paced at one provider call per second. Explicit rate-limit rejections receive delayed, bounded retries using the same saved content/key. Timeouts, ambiguous provider failures and interrupted in-flight sends become unknown and are never blindly resent. Revoked operator access, changed sender configuration and changed recipients are recorded as exclusions.

Provider acceptance is shown as submitted, not delivered. Bounce/complaint reconciliation and verification of unknown delivery remain operator tasks. There is no email-open tracking. Feedback form submissions retain `source=followup:<message-id>`; this is attribution, not verified identity.

Every email includes the reply mailbox and a recipient-specific unsubscribe link. GET shows a confirmation; POST stops future follow-ups. Admin cannot undo a recipient unsubscribe. Essential sign-in mail remains independent.

## Deployment and sender configuration

Deploy all normal migrations, including `0041_user_followups.sql`, `0049_followup_email_design.sql`, `0058_followup_draft_revisions.sql` and `0059_followup_batches.sql`. The new migration adds durable batches, recipient state, a dispatch lease and batch ownership on messages. Production promotion must run the existing encrypted-backup and migration preflight before deploying the Worker and UI.

Follow-ups reuse `RESEND_API_KEY` with a separate default sender, `Remote Arc <support@remotearc.app>`. Optional `FOLLOWUP_FROM` and `FOLLOWUP_REPLY_TO` override the follow-up sender and reply mailbox; blanks keep the defaults. Reply-To defaults to `support@remotearc.app`. `EMAIL_FROM` remains the login-mail setting. Missing/blank provider keys keep sending closed without claiming a draft. Verify the sender domain and configure the support mailbox through the existing provider/DNS process before live outreach.

The follow-up API is restricted to the Admin origin and real Admin sessions, with same-origin JSON checks on writes. Background dispatch verifies the confirming operator is still an Admin. Public previews use illustrative users and local simulation; no production OAuth, D1, email or customer system is connected.

SQLite/provider-mock and desktop English/light plus mobile Chinese/dark browser checks cover CRM counts, status updates, selection, editable drafts, personalized snapshots, queue replay, concurrent preparation/dispatch, cancellation, changed permissions/recipients, rate-limit backoff and crash uncertainty. No real user is emailed by development checks.
