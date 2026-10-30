# Feature status

Updated 2026-10-30. This table says what is real. Code, design documents and
flags can exist for work that is not live, so check here before describing a
capability. Update it in the same PR as any change of status.

- **Live:** available to users in production.
- **Beta:** usable, with the rollout still tracked separately.
- **Experimental:** enabled, but with no production guarantee.
- **Staged:** built and switched off.
- **Not built:** a design or a request. No user-facing capability exists.

Flags in `apps/relay/wrangler.jsonc` are defaults. Production enables Arc through
the owner-set `ARC_PLATFORM_ENABLED` secret, so `ARC_CHAT_ENABLED`,
`ARC_CREDITS_ENABLED` and `ARC_BILLING_ENABLED` staying `0` there does not mean Arc
is off.

| Capability | Status | Controlled by | Notes |
| --- | --- | --- | --- |
| Connect MCP tools | Live | OAuth scopes, device policy | All tools on every plan; plans differ by allowance |
| Connected Apps | Live | `ENABLE_APPS` | [Tool inventory](connect-tool-inventory.md) |
| Device Agent (Go) | Live | Device policy | Windows, macOS, Linux |
| Durable Tasks | Live | Per-device task permissions | Long tasks, schedules, condition watches, goal loops |
| Device Fleet | Live | Device policy | `fleet_sync_workspace` moves a pinned Git commit, not local changes |
| Chrome Companion shared tabs | Live | User-shared tabs and sites | |
| Task browser | Live | `ENABLE_BROWSER_RUNNER`, device tools | Runs on the user's computer through the Agent |
| Arc workspace, trial and Credits | Live | `ARC_PLATFORM_ENABLED` | `ARC_EMERGENCY_PAUSE` stops Arc and leaves Connect running |
| Stripe checkout and subscriptions | Live | `ARC_PLATFORM_ENABLED`, Stripe configuration | Elements checkout with one-tap wallets |
| AI Teams | Beta | Account access | [Feature map](feature-map/ai-teams.md) |
| Agent Goals (source and hosted) | Experimental | `ENABLE_EXPERIMENTAL_AGENT_GOALS` | A saved goal does not wake an external chat |
| Independent Admin service | Staged | `ADMIN_SERVICE_MODE=legacy` | Admin runs inside the main Worker today |
| Signed macOS app and DMG | Not built | | In review as PR #391 |
| OS sandbox for terminal commands | Not built | | [Execution isolation](execution-isolation.md); none of the current checks is a sandbox |
| Automatic Agent updates | Not built | | Users upgrade by rerunning the installer or `npx remotelink@latest` |
| Waking an arbitrary external chat | Not built | | Depends on the AI host, not on Remote Arc |
| Wake-on-LAN | Not built | | Deferred |
