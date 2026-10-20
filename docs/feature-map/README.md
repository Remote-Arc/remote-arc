# Arc feature map

Product owner: Remote Arc. Contract version: 1.0.0. Updated 20 October 2026.

This map describes the user entrance, scope, expected result, verification and recovery for supported journeys. It is maintained alongside the implementation and regressions; a test command passing does not certify arbitrary customer accounts. Use synthetic accounts/provider HTTP for automated acceptance. A live Issue creation requires the user's reviewed repository, title and body.

| Feature | User journey | Regression |
| --- | --- | --- |
| [Inbox excerpts](verified-inbox.md) | Choose an account and bounded query, read source excerpts, inspect receipt | arc-verification-test.ts |
| [GitHub issue](verified-issue.md) | Review exact fields, create one issue, independently read it back | arc-verification-test.ts |
| [Deployment readiness](verified-deployment.md) | Select an exact deployment, inspect provider state and URL | arc-verification-test.ts |
| [Website delivery](website-delivery.md) | Select an available authorized computer, save actual files, verify a live preview | arc-outcomes-test.ts |
| [Cross-cutting flows](cross-cutting-flows.md) | Consent, account isolation, retries, restart, evidence and limits | arc-chat-test.ts; arc-verification-ui-test.tsx |

Feature files teach operation and verification. Source remains the implementation reference. Handbook versions/owners/regression links are returned by the Arc Skills API; imported skills are versioned by content hash. Changes to a completion rule require the corresponding handbook and fixture to change together.

AI employees, Team conversations and cross-run persistent goals are a separate [product/runtime design](../ai-teams-and-persistent-work.md), not completed features represented by this map.

- [AI Teams: direct chats, groups and scoped handoffs](ai-teams.md) — development implementation, not production deployed.
