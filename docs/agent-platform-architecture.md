# Remote Arc agent platform: architecture and execution contract

Updated 20 October 2026. This is the current platform reference. The native device stable release and a hosted service deployment have independent versions; 0.6.2-rc.2 is a device candidate, not a stable-version promise. See [user documentation](https://remotearc.app/docs/start-here), [public technical guide](https://remotearc.app/docs/architecture), [release status](https://remotearc.app/releases) and [security policy](../SECURITY.md).

## Product and responsibilities

Remote Arc is infrastructure for agents to act on authorized cloud accounts and user-owned computers. **Arc** is the hosted personal-agent workspace. **Connect** lets compatible external AI clients use the same execution layer over MCP. MCP is an interoperability interface within the platform.

| Responsibility | Model API / external reasoning host | Remote Arc |
| --- | --- | --- |
| Understand and plan | Interpret the goal, select tools, assess observations, summarize | Build bounded context and expose validated tool contracts |
| Authorization | Propose an action; cannot grant itself authority | Verify account, OAuth scopes, entitlement, connection/device ownership and local policy |
| Execute | Return structured decisions | Dispatch App operations or device tools and retain acknowledgements |
| Continuity | Make fresh decisions when invoked | Persist conversations, steps, references, task schedules, leases and outcomes |
| Memory | Use relevant supplied context | Store, retrieve and delete bounded account-owned notes and work summaries |
| Cost | Report model usage | Reserve and settle funds/Credits; enforce run, account and operating limits |

OpenAI or Anthropic APIs supply reasoning. They do not independently connect a user's Gmail, operate the user's computer, persist Arc routines or manage Arc's account memory. Arc's runtime organizes those capabilities around model decisions. Model output remains fallible: a completed run is a terminal runtime state, **not a formal proof that the user goal is satisfied**. Answers must cite real observations or artifacts and distinguish partial work and blockers.

The shared tools can serve the same concrete action through either entry. Arc's product responsibility is continuity: retain the delegated goal, source accounts, instructions and available run history; invoke fresh bounded reasoning when scheduled; verify actual outputs and leave a reviewable result. Daily briefs, project check-ins, delivery verification and change follow-up illustrate that responsibility. They are configured work over existing tools and schedules, not separate autonomous engines or a guarantee of uninterrupted reasoning. The bilingual use-case catalog provides all 15 Arc and Connect paths from shared public workflow data.

## Execution topology

```mermaid
flowchart TB
  User[User and current permissions] --> Arc[Arc hosted workspace]
  User --> Client[External AI client]
  Arc --> Runtime[Arc run controller / Durable Object]
  Client --> MCP[Connect / OAuth MCP]
  MCP --> Gate[Authenticated Worker and policy gates]
  Runtime <--> Model[Configured model API]
  Runtime --> Gate
  Runtime <--> State[(D1: encrypted content, task state, ledgers)]
  Gate --> Apps[Typed App adapters]
  Apps --> Provider[User-authorized provider account]
  Gate --> Fleet[Eligible device selection and routing]
  Scheduler[Leased task scheduler] --> Runtime
  Scheduler --> Fleet
  Fleet <-->|Authenticated outbound WSS| Agent[Native Go Agent]
  Agent --> Core[Go Execution Core: local tools and policy]
  Core --> Computer[Files / processes / approved commands]
```

The Agent and Core compile into one executable, not two network services. Apps execute in the cloud and do not require a local device. Local software and device tools are needed only when the selected workflow actually depends on them. Browser sharing has its own explicit tab and interaction grants.

## A hosted run, from goal to evidence

1. Authenticate the request and resolve the account's active plan or trial. Save a request identity and input hash; a retry with changed input conflicts instead of silently creating another effect.
2. Persist the user message and any validated, account-owned skill references in encrypted chat content. Compose context from the goal, recent requests, relevant prior observations/arguments, active connections, selected memories and current device metadata.
3. Reserve cost before model dispatch. Validate the model's structured decision and tool arguments. An invalid decision and a failed usage settlement have distinct diagnostics.
4. Before an effect, check current access and the target's ownership, schema, scope and policy. An argument error caught before provider dispatch becomes a correctable observation. It is not reported as an ambiguous external write.
5. Record the dispatch boundary and result. The next decision receives executed arguments and bounded observations, including real resource IDs, status, URLs and pagination. Acknowledged identical actions within a run reuse the saved result; uncertain writes are not blindly replayed.
6. Continue to a final answer, a concrete blocker, cancellation or a bounded limit. Recent inbox summarization uses a read-only content path and a reply-only closing decision. Other workflows use individual validated operations as needed.

Discovery is not completion. Listing a connected Gmail account does not read its messages. A deployment list is not necessarily evidence of readiness; inspect the appropriate deployment state. A successful issue creation should return its acknowledged issue ID/link. When evidence is absent, the answer must say so. These are task-specific completion criteria enforced through contracts, observations, model instructions and acceptance tests; there is no universal semantic verifier for arbitrary goals.

A malformed JSON model response can receive one bounded correction per run only after its usage has settled and before any tool was dispatched for that decision. The rejection is persisted; correction consumes a normal step and a new, separately reserved model request, with failed-response tokens included in the allowance. Unknown provider usage, unconfirmed settlement, refusal, cancellation and uncertain tool effects do not enter this path. The provider gateway still makes one attempt per request; external operations are not retried by this mechanism.

A managed device process that returns a real `process_id` and `status: running` is acknowledged ongoing work. Arc retains the handle and can inspect status/output rather than treating the acknowledgement as an unknown dispatch. An identical start while that process is still running reuses its handle; a confirmed exit permits a new authorized run. A missing acknowledgement remains uncertain and is not blindly replayed. A process may outlive the bounded hosted run, so the answer must distinguish ongoing work from a verified completed artifact.

## Explicit checks and source-derived receipts

Arc Chat's **Verified task** entrance freezes an encrypted, strict account/resource/action contract for one run. Initial contracts are bounded Gmail/Outlook excerpt retrieval, exact GitHub issue creation plus independent full-field read-back, and exact Vercel deployment readiness. The server checks all required read/write operations before creation and enforces the scope again before every dispatch, including restored decisions. Skill or provider content cannot extend it.

Typed proof is extracted from the original provider result before context shortening and sealed in the execution journal. A terminal receipt derives check status, acknowledged App changes, original evidence IDs/times/URLs and recovery action from that account-owned journal. Historical receipts restore their own run if its user scope has left the recent chat window. Assistant prose is never evidence. A selected contract with missing/failed checks cannot enter runtime success; unknown effects remain pending inspection.

The receipt certifies only its declared checks. Inbox retrieval does not grade summary quality; provider READY does not verify application functionality. An uncontracted runtime success remains pending goal verification. Creation acknowledgement alone yields partial completion. An uncertain write cannot be replayed, and an issue is not automatically closed as compensation. See the [feature map](feature-map/README.md), versioned skill handbooks and their linked regressions. These contracts are currently native Arc features; Connect retains the shared authorization/dispatch layer without a fabricated promise of this native receipt contract.

## Context reuse and memory

`arc-task-state.ts` reconstructs goals, discoveries, learned schemas and completed/failed actions from persisted conversation history. `arc-chat-context.ts` fits a bounded prompt, retaining useful current observations before optional material. Large results are shortened structurally so resource identifiers survive; excerpts do not authorize inventing omitted data.

Run-context fitting counts decoded message content rather than the extra JSON escaping used to transport it. Optional catalogs, old schemas and prose are shortened before the action ledger and device handles needed to continue. Financial reservations retain their independent conservative ceiling; this does not raise a plan's run allowance or funding cap.

Discovery reuse currently covers connected Apps for 120 seconds, device discovery for 20 seconds, and App schemas / skill instructions / skill catalog for 30 minutes. Repeated identical discovery within the same run reuses its observation. Actual actions still run live authorization checks. Discovery reuse is an optimization, not a lease on access to a revoked account.

Cross-chat memory is Arc-owned, not the consumer memory of ChatGPT or Claude. Current limits in `packages/protocol/src/index.ts` are 100 short facts, 40 work summaries, 768 bytes per fact, 2,048 bytes per work summary, and 4,000 bytes of retrieved memory context. Personal memory is encrypted with account-bound associated data. Users can inspect/edit/delete facts, remove work entries and disable retrieval. Device registry status is separate from remembered facts. Do not store passwords or API keys in memory.

These limits bound memory content to about 159 KB per fully used account before encryption, indexes and metadata; chat and audit retention are separate costs. The platform does not mirror users' disks or send all past history on every request. Relevant context sent to a model provider is still subject to that provider's processing terms.

## Apps: one execution contract, provider-specific capabilities

All Apps use the shared discovery, schema, account-ownership, scope, usage and idempotency path, with provider-specific adapters behind it. Stable request IDs and durable call records distinguish acknowledged results from unknown outcomes. An App connection does not confer unrelated provider permissions or make separately billed APIs free.

The shared engine can recover from argument errors before dispatch and preserve results for subsequent decisions. It cannot make a provider support an unimplemented operation, repair revoked consent, bypass upstream rate limits or guarantee that every provider account works. Check the published operation catalog and use live account acceptance where appropriate. App content, email, files and skill instructions are untrusted data, never authority to change the user's goal or exfiltrate credentials.

## Tasks, routines and device scheduling

The Tasks surface unifies one-off delegated work and recurring Arc routines. Arc routines persist self-contained instructions plus a schedule and start a new bounded hosted run when due. Daily schedules use an explicit IANA timezone; DST gaps are skipped and repeated local times execute once. Interval routines have a minimum 15-minute period. Runs check access and budgets again and pause repeating work on failed/unknown outcomes.

Connect's deterministic automation engine persists approved commands, triggers, bounded retries and verification separately. It can continue known work without a model continuously reasoning. Source-agent continuation of an arbitrary external ChatGPT/Claude conversation is a different integration; the ordinary MCP endpoint does not promise to wake that chat.

Placement first filters account ownership, online/unpaused state, tools, platform, trusted workspace and task permissions. Ranking then considers active work, CPU/memory, connection health and fresh capacity. Stale telemetry is unknown rather than idle. Windows and WSL agents sharing a host do not count physical capacity twice. Dispatch does not move projects, install missing dependencies or repeat an uncertain write on a different computer. Local policy remains the final execution boundary.

## Skills and @ reuse

Arc’s default library exposes five result-focused workflows: a real website preview, a saved source-based report, and the three scoped App verification handbooks. Engine-only guidance such as Image Studio/ComfyUI is not advertised as ready hosted execution; Connect retains its separate cloud handbook catalog. Users may also import a bounded SKILL.md; imported content is encrypted per account. A source URL records attribution and does not download a repository, scripts or dependencies.

In Arc Chat, type `@` or use Apps & Skills to select up to three Skills and five active App connections. They appear as badges in the composer and saved messages; using a skill from its library opens a structured draft without pasting internal instructions. The client submits IDs separately from the goal. The server resolves each ID against that user's imported library or the built-in catalog, stores the canonical name with the message, and includes the references in subsequent context. The runtime reads selected instructions through the existing permission-checked skill tool and reuses observations. Same display names cannot change which skill was selected. References are not extra permissions.

The default Arc workflows use existing authorized Apps or file/process tools. Imports may require extra software, referenced files or a generation engine. Missing capabilities are a blocked outcome, not a generated image or completed task. Adding Markdown alone does not install them. Custom groups of autonomous developer/designer teammates are a future product direction, not a current execution guarantee.

Slack is currently a user-authorized App tool connection, not a DM/mention conversation entrance. The proposed Bot should map each linked initiating user and thread into the same Arc runtime, without inheriting the installer's private account permissions. See the [Slack entrance design and acceptance requirements](slack-agent-entrypoint.md).

## Persistent goals and conversational AI teams

These are separate planned product capabilities. Employees have names, avatars, models, responsibilities and permission ceilings; they can talk directly with users and communicate in Team or authorized cross-Team rooms. A dedicated AI Teams page must expose configuration, conversations, related outcomes and complete traceable message/action/usage history. Tasks provides an entrance and shared outcomes, not a mandatory overnight mode or the whole product UI.

Persistent execution concerns the outcome, aggregate Credits cap, checkpoints and acceptance across multiple bounded runs. A deadline is optional. Idle employees do not reason, and every coordinator/worker/verifier shares the root task budget and intersected authority. Current native arc-work.ts still creates one bounded run per occurrence. Reuse the existing automation registry, leases, billing ledger and planned-goal primitives when implementing continuation rather than building another execution engine. [Detailed product/runtime design](ai-teams-and-persistent-work.md).

## Billing, configuration and operating limits

Hosted model use reserves and settles Credits and rated cost. Unknown outcomes retain reservations instead of being counted as free. Account plan versions and commercial catalog configuration live in D1; secrets live in protected environment/Worker secrets. Environment variables remain bootstrap/feature switches, not the operator pricing database.

Automatic funding separates sponsored trial capacity from paid capacity based on verified live paid receipts, with a configurable per-paying-user daily ceiling. Sandbox receipts do not fund production usage. Refunds reduce funding availability without erasing incurred model cost. User Credits, per-model limits, concurrency and task limits apply as additional bounds. This is an internal operating budget, not a provider balance reader or automatic recharge system.

Stripe Checkout collects payment; verified webhook/payment state grants the subscription and allowance. A return URL alone cannot activate a plan. Portal manages billing details and subscription lifecycle. Feedback reward campaigns have versioned terms, verified account identity, explicit admin review and atomic capped Connect-call grants. Email drafts and templates do not themselves authorize sends.

## Security, observability and acceptance

| Area | Evidence and boundary |
| --- | --- |
| Tenant isolation | Authenticated account ownership on conversation, App, device, skill and memory access |
| Device control | Read-oriented initial setup; explicit local tools, trusted roots, sensitive paths and OS user authority |
| Uncertainty | Persisted dispatch state; no blind replay after an unconfirmed effect |
| User experience | One working indicator and final answer in chat; execution details fetched on demand in Activity |
| Operations | Model usage and funding pools, trials, payment records, reviewed rewards and service health in Admin |
| Tests | Shared provider contracts, argument correction, duplicate prevention, context reuse, task scheduling, memory isolation, funding and billing lifecycle |
| Protected acceptance | Real model calls against synthetic mail, GitHub creation, successful/failed deployments, a scheduled Task through completion, and a selected imported Skill that creates its specified result; the evaluation enforces its explicit operator-approved ledger cap |

Fixtures test actual adapters/controller paths with controlled provider responses; they do not certify every real customer account, provider outage or all possible task categories. A production release must pass exact-commit CI and the applicable acceptance checks. Real customer actions require their authorization. Full two-way multi-agent collaboration, arbitrary engine installation and unconditional exactly-once third-party writes are not claimed.

## Code map and validation

| Location | Purpose |
| --- | --- |
| `apps/relay/src/arc-chat*.ts`, `arc-task-state.ts` | Authenticated chat, state, bounded model/tool loop and context |
| `apps/relay/src/model-gateway.ts`, `billing-ledger.ts`, `arc-funding.ts` | Cost reservations, usage settlement and funding gates |
| `apps/relay/src/app-*.ts`, `apps.ts` | Typed provider operations, credential vault and dispatch |
| `apps/relay/src/arc-work.ts`, `automations.ts`, `fleet-*.ts` | Hosted routines, persistent scheduler and placement |
| `apps/relay/src/arc-memory.ts`, `arc-skills.ts`, `cloud-skills.ts` | Memory and reusable skill instructions/workflows |
| `apps/agent`, `packages/execution-core` | Native local execution and policy |
| `apps/ui`, `packages/docs/src` | Arc / Connect / Admin surfaces and bilingual public documentation |

```sh
pnpm install --frozen-lockfile
pnpm --filter @remotearc/relay test:arc
pnpm --filter @remotearc/relay test:apps
pnpm test:skills
pnpm test:fleet
pnpm --filter @remotearc/relay test:model-billing
pnpm --filter @remotearc/ui test:workspaces
```

The protected `verify-arc-tasks.yml` workflow runs real inference with synthetic provider fixtures; it needs operator authorization and a protected provider secret. Do not put credentials into shell history, docs, test artifacts or issues. The older [system reference](system-architecture.en.md) remains useful for native execution details; use this document for the current platform topology and hosted-runtime contract.

## Operational recovery and user follow-ups

A no-match Fleet selection returns a structured dispatched:false observation containing only the account’s own device capabilities. Arc can adapt inferred platform requirements to available Windows/macOS/Linux devices without relaxing explicit user constraints or permissions. File/process arguments are validated before dispatch. The website journey and its exact acceptance limits are documented in [the feature map](feature-map/website-delivery.md).

Admin follow-ups have editable HTML layouts, brand color, heading, intro, CTA label and up to three content cards, with a sandboxed live preview. The server validates the design, escapes content and restricts action links to the official site. Migration 0049 stores the reviewed HTML/text snapshot with each draft; dispatch uses that exact saved content. Existing consent, suppression, cooldown, unknown-delivery and idempotency checks still apply. No email is sent by editing or previewing a design.
