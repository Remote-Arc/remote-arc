# Manual user follow-ups

The Admin **User follow-ups** section helps an operator offer relevant onboarding help, request product feedback and follow up on a support issue. It starts with individual, reviewed emails; a due date creates an Admin reminder.

## Workflow

1. Filter users by no active connections, no retained usage records, recorded usage, a due reminder, or suppression. Counts include connected computers, active App connections, retained Connect calls and Arc run counts. These signals do not expose conversations, files, email contents or tool arguments. “No recorded usage” is deliberately distinct from a claim that the person has never used the product.
2. Choose a user, review contact history, and record the request or permission that makes the outreach relevant. A contact request from the existing Feedback/Support form applies to that request; it is not blanket marketing consent.
3. Choose an English or Chinese template, personalize its subject and plain-text body, then save the immutable draft for review. Templates cover first connection, first result, experience feedback, after-support follow-up and finding a useful workflow.
4. Send the reviewed draft manually. The server resolves and snapshots the recipient; the browser cannot supply a sender or recipient email. A changed recipient requires a fresh draft. The send uses the existing Resend channel, a per-draft idempotency key, an atomic dispatch claim and a 72-hour per-user cooldown.
5. Record replies in notes and choose the next follow-up date/status. Feedback forms opened from the template retain `source=followup:<draft-id>`; matching submissions appear in the existing Leads & feedback inbox and are counted beside the user. This is form attribution, not verified identity or email-open tracking.

Every email includes the configured reply mailbox and a recipient-specific unsubscribe link. Link GET shows a confirmation; POST suppresses future follow-ups. Admin cannot undo a recipient unsubscribe. Essential sign-in mail is independent. A provider acceptance is shown as sent, not delivered. A timeout or ambiguous provider failure stays unknown and blocks blind resending; inspect the provider delivery log before taking further action. Provider bounce/complaint reconciliation remains an operator task in this manual version.

## Deployment

Apply migrations `0040_arc_skills.sql` and `0041_user_followups.sql` with the normal release. The follow-up API is restricted to the Admin origin and real Admin sessions, including same-origin JSON checks on changes. The named Admin service includes the same routes.

The sender reuses `RESEND_API_KEY` and `EMAIL_FROM`. Optionally set `FOLLOWUP_REPLY_TO`; its default is `support@remotearc.app`. Without a configured sender, drafts remain available and sending is closed. Configure and verify the sender domain through the existing email-provider process before live outreach. PR previews show illustrative users and block all follow-up writes and sends.

No real user was emailed during development. The SQLite/provider-mock tests cover RBAC, host/CSRF checks, segments, permission, immutable drafts, concurrent sends, cooldown, uncertainty, suppression and feedback attribution. Browser checks cover template personalization, notes, language, draft/history and the preview send lock.
