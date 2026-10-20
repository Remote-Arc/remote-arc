# Slack as an Arc / Archer conversation entrance

Status: design, not an available Bot feature. Updated 20 October 2026. “Archer” here is the proposed teammate name; the shipped workspace remains Arc.

## What is available now

The current Slack App uses **user OAuth**. Its published tools can list authorized conversations, read/search messages and threads, send/reply/update messages and manage the supported reactions, pins, bookmarks and scheduled messages. User scopes, channel membership and workspace policy apply. See `apps/relay/src/app-slack.ts` and `app-oauth.ts`.

There is currently no Slack event ingress that turns a DM or an `@Archer` into an Arc run. Sending a message through an App tool does not create that entrance, and connecting Slack does not subscribe Arc to every workspace conversation.

## Smallest useful Bot integration

1. Install a Bot with the narrowly required scopes and explicit workspace consent. Keep Bot installation separate from the current user's Slack tool authorization.
2. Accept direct messages and explicit channel mentions. Verify the raw request's Slack signature and timestamp before parsing or acknowledging work. Deduplicate events by installation and event ID, ignore Bot/self events and message edits, and acknowledge within Slack's delivery window before asynchronous processing.
3. Bind the **actual initiating Slack user** to an authenticated Arc account, not the installer's account or an email match. A workspace installation alone cannot spend an owner's Credits or access their Gmail, devices or memories. Unlinked users receive a sign-in/linking action with no task dispatch.
4. Map workspace + channel + thread + principal to a persistent Arc conversation. Start with private DMs and explicit mentions, maintaining per-user isolation even inside a shared thread. Channel-visible output must not disclose personal App/device data without an explicit sharing decision.
5. Feed the user's request through the existing Arc run controller, current access/budget gates and tool dispatcher. Reply in the same Slack thread with the outcome and evidence; do not build a second agent engine for Slack.
6. Persist outgoing reply identity and uncertain delivery. Retry handling must not duplicate an external write or recursively trigger the Bot. Support stop, revoked membership, uninstall/revocation and linking removal. Never use channel text as administrator authority.

## Acceptance before enablement

- Real workspace installation and event verification, including signed invalid/stale/retried events.
- Two users in one workspace cannot cross accounts, spend another user's allowance or expose another conversation's memory.
- Follow-up messages reuse the correct conversation and discovered context; a thread does not silently join unrelated principals.
- An actual App/device task returns an inspectable result; permissions/limits/missing capabilities produce a clear blocker.
- Partial/unknown writes survive restart without replay; bot messages, retries and edits cannot start loops.
- Public channel output observes its audience boundary; personal results default to a private conversation.

This gives users one teammate in Slack backed by the same persistent execution infrastructure. A group of autonomous developer/design teammates is a later feature requiring separate role, resource, budget and coordination boundaries.

Official references: [app mentions](https://docs.slack.dev/reference/events/app_mention/), [direct messages](https://docs.slack.dev/reference/events/message.im/), [request verification](https://docs.slack.dev/authentication/verifying-requests-from-slack/), [Events API](https://docs.slack.dev/apis/events-api/).
