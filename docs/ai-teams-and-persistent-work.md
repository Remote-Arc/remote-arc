# AI employees, Team conversations and persistent goals

Status: Beta release candidate; remaining scope and validation limits are listed below. Updated 20 October 2026. [Chinese design](ai-teams-and-persistent-work.zh.md).

## Development implementation and remaining work

The branch implements account-owned versioned employee/Team profiles, a dedicated Teams page, direct chats, Team rooms and ad hoc groups. A searchable conversation/teammate sidebar, explicit @ badges, Auto first-responder routing and Everyone selection support normal discussions without a Task, deadline or budget form. In-page room switches retain unsent drafts and logical retry identity. Creating a group or profile makes no model call.

Durable room queues retain immutable speaker identities, actual recipients, messages, colleague handoffs, tool observations and paginated history. Auto initially wakes the team coordinator or one member, who can bring in colleagues. One active employee run per room and the account concurrency limit are enforced. Idle rooms make no model calls.

Background dispatch is infrastructure: the current reasoning turn proposes an owned employee/team; the server binds the authentic user goal, target version, stable assignment identity and inherited/current authority. There is no always-on scheduler employee or extra scheduler-model call. Cross-Team access must be explicitly allowed. Actual child replies and failure/unknown states are reported once to the originating chat with a record link; this does not certify the root outcome.

Arc Chat can prepare an employee draft with name, responsibility, model and avatar. The user can edit the profile and choose resource access before explicitly confirming Create employee. Confirmation creates one owned employee atomically, without inference or starting work; retries are idempotent. The card survives reloads, can be cancelled, expires after seven days and links to a direct conversation after creation.

Still incomplete: chat-created team confirmation drafts, cross-run persistent goal continuation, root-outcome acceptance, advanced activity/usage filters and export. Optional root-task caps are not yet bound to every room run; ordinary account Credits are enforced. Production migrations, live model acceptance and protected rollout remain pending. See the [AI Teams feature map](feature-map/ai-teams.md).

## Independent product concepts

An employee is a durable conversational identity with a user-defined name, avatar, configured model, responsibility, instructions, skills and permission ceiling. An employee can answer normal questions in a direct chat, participate in a Team room and work on an outcome. A Team defines members, coordinator and handoff rules. Teams can discuss and collaborate immediately; they do not require overnight work or even a Task.

A Task defines the outcome, assignments, authority and acceptance. Default usage draws from the account’s plan and shared Credits without a mandatory budget form. An additional task cap is an optional advanced control. Persistent execution allows that same Task to continue across bounded runs until its checks pass or a real blocker needs resolution. A deadline is optional. An execution segment's technical limit must checkpoint rather than invent overall completion. A recurring routine starts distinct occurrences and is not an unlimited continuation of yesterday's goal.

## Dedicated product page and chat entrance

Provide a full AI Teams page with employee configuration, Team membership, direct chats, group rooms, associated outcomes and an activity timeline. Tasks links to this surface; the entire feature must not be buried in a task-creation modal.

Arc Chat can prepare editable employee/Team/task drafts and link to the saved objects after explicit user confirmation. Models may propose a draft; only an authenticated, version-bound user confirmation can persist it. Idempotency prevents repeated clicks from creating duplicates. Creating an employee or Team does not start paid work.

## Communication and traceability

Persist each actual message with immutable sender identity, recipients/room, time, reply/handoff links and related outcome. Store direct employee chats, employee-to-employee messages, Team discussions and explicitly authorized cross-Team communication. Normal conversation need not create a Task. Relevant context is shared by room/task authority, not by making every employee's private memory globally visible.

Every actual message, delegation, configuration/member change, tool action, authorization, model reservation/settlement, check and state transition must be visible in the dedicated page. Filter by employee, Team, room, Task, time and event type. Receipts link back to original messages/events and outputs. Edits/removals leave history, event-stream reconnection restores durable records, and pagination exposes older history. Store actual communication and action evidence rather than private chain-of-thought or credentials. Define retention, access, export and deletion explicitly.

Mention, direct question, assignment and handoff events determine who should respond. Deliveries are deduplicated by message/recipient, and spontaneous inter-agent replies need bounded routing so employees cannot trigger an infinite discussion loop. Idle employees make no model calls. Preserve capacity for interactive replies while background outcomes continue.

## Shared runtime, budgets and authority

Extend the current Worker/Durable Object runtime, automation registry, scheduler leases, journal, Apps adapters, device policy and billing ledger. Reuse planned-goal-runtime.ts phase/checkpoint/verification facilities. Native arc-work.ts currently starts a single bounded chat run per occurrence; complete cross-run native goal continuation remains to be built.

One root Task ID relates assignments, child runs, tools, artifacts and acceptance. Effective authority is the intersection of task approval, employee ceiling, current account/provider scope and device local policy. Team membership is not a grant to the owner's unrelated private accounts. A changed role or model does not enlarge an existing task's frozen authority.

Every coordinator, worker, verifier, retry and continuation consumes the same account Credits. If the user opts into an extra task cap, all of them share it. Child allocations cannot add extra quota. The normal flow is to start work, show usage and remaining Credits, then pause and offer an upgrade or top-up when allowance runs out. Reserve atomically before model dispatch, settle actual usage, and retain unknown reservations. Account/plan/platform funding limits remain additional bounds. Model availability is rechecked; a fallback that changes cost must be explicitly authorized. User-uploaded avatars need constrained, re-encoded managed storage.

Wait for events or bounded deterministic status checks instead of repeatedly reasoning while nothing changes. Pause on missing authority, exhausted allowance, repeated no progress or an unresolved external effect; retain evidence and report the concrete next action. An unknown order/write cannot be repeated by switching employee. Stop on verified goal completion, not an employee's unsupported claim.

## Acceptance order

1. Ship scoped result verification and receipts with feature maps and versioned skills.
2. Implement persistent employee/Team configuration, dedicated page, direct/group conversation and complete visible event history. Arc Chat and page management use the same draft/confirmation/API contracts.
3. Add root-task budget enforcement, cross-run continuation/checkpoints and optional deadline controls to the shared task registry.
4. Enable scoped inter-agent/cross-Team routing and outcome assignments with shared budgets, handoff evidence, concurrent-reservation tests and user-interruption handling.

Acceptance must cover account isolation, real saved objects, no execution on draft/open, no idle model spend, safe model selection, full visible communication history, bounded message routing, no budget multiplication, restart recovery, unknown-effect non-replay and no false completion. Public docs must distinguish each implemented boundary from this design.
