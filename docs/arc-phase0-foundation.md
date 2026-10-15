# Arc / Remote Arc Workforce — Phase 0 Foundation

**Status:** proposal and compatibility groundwork, NOT a launched AI employee product.
**Product naming:** Remote Arc is the platform. **Arc** is the future first-party AI assistant persona; it is not a new company, domain, device identity or paid tier.

## Existing production behavior we must preserve

- GPT/Claude remain the controller for the existing Connect / MCP path. Phase 0 must not route those calls through a paid hosted model.
- `users.id` remains the authority for sessions, devices, device pairing, OAuth tokens, usage, automations, task events and security approvals. A team invite must **never** implicitly grant access to the inviter's personal devices, tasks or tokens.
- Revocation, per-device tool permissions, sensitive-path policies, undo and execution audit cannot be bypassed by any hosted agent.
- Scheduled deterministic actions are not the same as autonomous hosted LLM reasoning. Do not describe Arc as available until a real hosted agent is implemented.
- No data copy, re-parenting, or new organization-scoped queries are introduced by the Phase 0 schema migration.

## Additive migration strategy

1. Add `organizations` and `organization_members` only. Backfill one deterministic personal organization per existing account. Use an INSERT trigger for new accounts to keep both email and Google login paths compatible.
2. Keep all existing `user_id` foreign keys and current authorization flows unchanged. New organization tables are **not** a replacement for authorization checks. Personal organizations start with exactly one owner.
3. Add organization-scoped resources later as new tables or nullable, validated `organization_id` columns. Default all existing devices, credentials, and automations to **private**. A user must opt into granting access to a team resource.
4. Introduce dedicated `organization_resource_grants`, membership validation, audit and quotas before exposing resources to other members. NEVER infer permission from `organization_members` alone.
5. Test backfills against a sanitized local schema snapshot, then apply a verified D1 backup strategy before production migration.

## Release contract

- Never deploy from a feature branch or merge directly into production for this work.
- All production releases require a verified passing CI run on the exact latest master SHA, and explicit manual promotion by the repository owner. The GitHub production environment currently has **no protection rules** (verified via GitHub API); configure Required Reviewers in repository Settings before treating environment approval as enforced.
- D1 migrations are forward-only: take and verify an independent backup **before** changing production schema. Production promotion now requires entering `BACKUP_VERIFIED`, but this is an operator attestation rather than an automated backup. A Worker rollback does not roll back D1.
- Keep changes additive (expand → deploy compatibility code → migrate reads/writes behind flags → contract only after verification).
- Feature flags default **off** for hosted chat, autonomous work, external app connections, workspace sharing and hosted model billing.
- Rollback means disabling flags and deploying the previous compatible Worker release, while retaining the expanded D1 schema.
- After each release, check login, original MCP flows, browser sharing, device reconnect, task scheduling, billing grants, D1 error rate, and tool approval/undo. Stop if any regression occurs.
- Treat migrations, authentication, credentials, permission boundaries, billing and background scheduling as HIGH RISK changes requiring separate review.

## Later Arc rollout

- **Phase 1:** isolated hosted chat, audited provider proxy, per-user + platform inference budgets; no organization sharing.
- **Phase 2:** persistent approved routines, explicit failure/approval state, idempotency and verified outcomes.
- **Phase 3:** native app connectors, organization-scoped resources with separate authorization and audit.
- **Phase 4:** opt-in Teach / Watch & Learn and assistant personas. Keep the Remote Arc brand and existing Connect entry point.

## Phase 0 acceptance criteria

1. Existing user login, device ownership and authorized tool behavior are unchanged.
2. Every existing and new account has a private personal organization with owner membership.
3. The organization migration is additive, rerunnable in a local test, and does not move existing resources.
4. CI verifies the migration and production deployment contract.
5. No new hosted AI requests, GPU allocation, secrets or billable external model calls are made by Phase 0.
