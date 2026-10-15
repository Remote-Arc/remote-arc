# ADR: Arc Hosted Assistant on Remote Arc

**Status:** proposed; no production behavior or billing changes
**Owners:** Remote Arc
**Why now:** move from external-chat-controlled device execution to an optional, first-party AI work surface without altering the existing MCP product.

## Decision

Keep **Remote Arc** as the platform brand and **Arc** as its first-party assistant identity. Arc is a product surface (Chat + delegated work), **not** a new permission principal that can bypass tenant or device grants.

Deliver this as an **opt-in hosted execution lane** beside the existing **Connect** lane:

- **Connect:** the user's existing ChatGPT/Claude decides what to do. Existing device/MCP OAuth, local permissions, billing and task behavior must remain unchanged.
- **Arc:** the user converses inside Remote Arc; our backend pays for/model-proxies reasoning, coordinates authorized app/device tools, keeps durable work state and presents approvals and evidence.
- **No GPU at launch.** OpenAI/Anthropic APIs or metered Workers AI are model providers; do not assume a ChatGPT subscription covers API cost.
- Existing goals may already use `controller=hosted` and `planAgentTurn` (OpenAI Responses or Workers AI) for a *narrow, device-centric next-action planner*. Do not mistake this for full hosted Chat. Reuse the permission/lease/evidence concepts, not its current one-decision prompt as a general assistant API.

## Existing code surfaces inspected

| Existing surface | Use | Constraint |
|---|---|---|
| `apps/relay/src/agent-planner.ts` | structured device action planner, validates allowed tool list | 7 device-oriented tools; no unified app registry or complete per-token model invoice |
| `apps/relay/src/planned-goal-runtime.ts` | checkpointed goal progression, source vs hosted controller, quality checks | does not implement a user-facing conversation or agent-level billing |
| `apps/relay/src/automation-store.ts` | fenced leases, revisions, durable audit journal | task and lease are currently user-scoped |
| `apps/relay/src/task-scheduler.ts` | cron task execution and health checks | a cron tick is not a perpetual inference process |
| `apps/relay/src/mcp.ts` | external AI, approved tools, client scopes | must continue to work independently of Arc |
| `apps/relay/src/auth.ts` | user sessions and existing device grants | personal devices cannot be shared via org membership |
| `apps/relay/migrations/0027_organization_foundation.sql` | additive private personal workspace | auth remains legacy user_id until explicit grants are implemented |

## Phase 1 contracts (before a hosted public beta)

### 1. Model Gateway

- Stable provider adapter accepting `model_class`, `budget_usd`, `max_turns`, `deadline`, `context` and `tool_schema_ids`; no raw arbitrary provider model names from untrusted requests.
- Auto uses a server-side allowlist with tested **fast/balanced/advanced** candidates. Introduce premium models after success-rate, latency and cost benchmarks; show real names only if currently available and supported.
- Budget reservation before a new model or paid-tool call; reconcile actual input/output/cached/reasoning tokens after; set explicit per-run, daily-user, organization and platform spending caps.
- If provider is unavailable, fail gracefully; never silently escalate to an unbudgeted premium model. Reroute only inside an approved ceiling.
- Meter by provider, model, org, agent, run and tool; separately attribute retries and third-party costs. No unlimited Free tier for hosted inference.
- Keep API secrets out of browser bundles, logs and tools exposed to third-party MCP clients.

### 2. Authorization & shared Tool Gateway

- Every tool call carries **user actor**, **organization**, **assistant identity**, **resource owner**, **connection/grant**, **scope**, **risk tier**, **idempotency key**, **run ID**, and **audit ID**.
- Effective permission is the intersection of user grants, organization policy, connection scope, device-local policy and the specific approval. Organization membership alone grants **no** access to a personal device or previously issued token.
- Read-only tools can proceed after consent; external messages, publishing, destructive edits, money transfers and production changes require independent approval at the action boundary.
- A tool's successful HTTP response is not success evidence. Verify observable postconditions, avoiding duplicate side effects when outcome is uncertain.
- No cross-tenant cache keys, memory snippets or shared search indexes. Enforce ownership on the server, never by client workspace selection alone.

### 3. State and wakeup

- Persist job objectives, approved tool scopes, financial budget, steps, observables, context revision, result evidence and durable identifiers.
- Use deterministic replay for safe operations; require inspection/approval before repeating writes with an unknown outcome.
- Agents sleep after checkpoints; scheduler/webhooks resume work only while authorization and budgets remain valid.
- Conversations and chat messages are separate from the existing `automations` state to avoid overloading hot D1 rows. Store large transcripts/artifacts in bounded, retained storage; do not pollute the current MCP hot path.

### 4. Rollout and safety

- All Arc feature switches default OFF: `ARC_CHAT_ENABLED`, `ARC_HOSTED_EXECUTION_ENABLED`, `ARC_EXTERNAL_APPS_ENABLED`, `ARC_ORG_SHARING_ENABLED`.
- Start with internal single-tenant chat and read-only tools, then a tiny opted-in pilot. No default enrollment of Connect users.
- Success means an *externally verified* result, not model self-report. Track model cost per verified task, failure/duplicate-action rate, approval-to-action latency, tenant-isolation tests and user activation.
- Feature shutdown and budget kill switch must be possible without touching device MCP sessions.
- Shadow evaluate Auto routing on a fixed 20+ real-task suite before any paid tier. A low-cost model failing tasks can cost more than a capable one.
- Protect PII, credential tokens, screen recordings and retention/deletion pathways before exposing app connectors.

## Release procedure

1. New code lives on feature branches and draft PRs. Confirm **all** CI jobs, permissions review, migration review and a sanitized full-schema replay.
2. Confirm production **environment protection** is configured in GitHub (current public API reports no production protection rules as of 2026-10-16). Until then the deploy job is explicitly owner-only; its YAML environment name is NOT human approval.
3. Verify a recoverable, independent D1 backup / Time Travel recovery point before any schema migration.
4. Use explicit production workflow dispatch for a verified latest-master SHA only. If a newer master appears before promotion, stop and revalidate.
5. Post-deploy validate: existing OAuth sign-in; remote device pairing/reconnect; MCP read/write permissions and approvals; task status; usage/billing; request-error rates. Keep Arc flags OFF.
6. Roll back **compatible Worker code** and turn feature flags OFF if any check fails. D1 schema changes are forward-only; never assume Worker rollback reverts D1.

## First milestones after Phase 0

1. Internal Arc chat calls **one** low-cost provider through the model gateway with global and user ceilings; no app mutations.
2. Chat can invoke **read-only** current-device tools via the same policy checks as Connect; each step has audit evidence.
3. Save a single approved Routine, close the browser, resume later and show verified result or explicit failure.
4. Only after that, implement native GitHub/Calendar/Notion connectors, opt-in org grants, billing and premium model classes.

**Non-goals for now:** full Composio-sized connector catalog, public employee marketplace, unlimited background loops, persistent rented GCP GPU, autonomous use of payment systems.
