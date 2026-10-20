# AI Teams feature map

Status: Beta release candidate; production rollout is tracked separately from code verification.

## Entry and user journey

Open Tasks → AI teams, or /dashboard/agent/teams. The independent page has Conversations, Teams, Employees and Activity. Owned rooms have /dashboard/agent/teams?room=<id> links. A normal account session and branch migrations are required; model availability, current resource permissions and shared account Credits are checked independently.

1. Add an employee with a name, role, configured model, avatar, instructions and scoped Apps/computers/skills. Saving creates no inference.
2. Create a permanent Team, or start an ad hoc group with at least two employees. No Task or overnight mode is required.
3. Choose an employee/group in the searchable sidebar and ask a question or give an outcome. Auto starts one coordinator/member; Everyone intentionally addresses all members. Type @ and select an employee to add a stable-ID badge without inserting instructions into the message.
4. Inspect actual employee replies, visible colleague handoffs and expandable tool inputs/observations. Failure/unknown states are not verified completion.
5. Switch rooms with a draft or failed send. Text, mentions and logical retry identity survive within this page. Reloading clears unsent in-memory drafts; server messages remain durable.
6. In ordinary Arc Chat ask to create an employee. The model prepares a durable editable profile card only. Review name, model, avatar and resource access, then explicitly Create employee; use Start conversation to open the saved direct room. Confirmation is atomic and model-free, retries return the same employee, and cancelled/expired drafts cannot create profiles. Drafts expire after seven days.
7. Load earlier history. Speaker identity is the version at send time, even after a profile rename.

## Hidden delegation

Arc and employee chats can discover teammates and delegate within authenticated authority. Cross-Team work requires the originating employee's explicit team allowance. Files, tools and skills cannot grant resources. Revoked authority narrows queued work. Child replies and failure states return once to the originating chat with a complete-record link; no additional summarization-model call or goal-completion certification is implied.

## Verification and limits

Relay test:teams exercises real SQLite/API/runtime with scripted models: ownership/CSRF, immutable profiles, Auto/explicit recipients, group creation, FIFO, peer handoffs, restart/idempotency, scope revocation, shared funded runs, hidden dispatch, return reports and 107-message pagination. Browser checks cover English/Chinese, light/dark and desktop/mobile, @ badges, group/DM switching, retry identity, draft retention and older history. No real emails, account writes, payments or paid-model calls are used.

One active employee run per room; cross-room execution respects plan concurrency. Idle rooms do not infer. Routing is not guaranteed to understand every request. Cross-run goal continuation, chat-created teams, comprehensive usage/history filters and export remain incomplete. Optional task caps are not yet wired to every room run. Production migrations and protected rollout must finish before calling this deployed. This release uses scripted models and isolated browser fixtures; new live-model acceptance has not run because additional paid tests are not authorized.
