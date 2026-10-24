# Public documentation review — 2026-10-24

Reviewed against master `dbb3ac8e2b5d01da5255a3d14538516f7db93f3c`, the published native Agent 0.6.3, current tool registrations and website navigation. This review changes documentation and its discovery UI; it does not enable a feature or deploy an Agent.

## Findings addressed

- Replaced the incomplete hand-maintained MCP table with generated definitions. Added `/docs/tools` and `/zh/docs/tools`, linked from the public navigation, docs landing page, sidebar and MCP reference. Docs search also finds tool and App operation names.
- The directory includes 39 public Remote MCP tools, 37 Apps with 344 operations called through `call_app`, and 17 local stdio MCP tools. Retired shared-tab aliases are excluded. Experimental goals and per-device Browser Runner activation are labelled; the connected client's real tool list remains authoritative.
- Added purpose/name/parameter search, category/App/read-write filters, OAuth scopes, exact generated input schemas, copy buttons and per-tool links. Local modes and workspace-only restrictions are explained separately from Remote MCP.
- Removed the obsolete 0.4.4 candidate recovery wording in both languages. Corrected AI teams from future-only to Beta, and corrected its navigation location.
- Distinguished bounded hosted Arc Chat/Tasks/Routines from Connect's deterministic saved execution and experimental continuation contracts. Corrected the detailed architecture and full reference, including hosted message/memory storage and the current repository links.
- Added Codex desktop/CLI/IDE connection guidance and Slack bot installation, personal linking, App connection, private result delivery and per-thread conversation guidance.
- Updated ChatGPT custom-MCP instructions and removed an unsupported marketplace-listing assertion. Updated Claude's Customize/Connectors path and per-chat enablement. Updated Gemini's Connected Apps path and current account/region/language requirements. Cursor's remote URL and configuration locations were checked.
- Updated Browser Runner docs to cover profiles, device permission, current manual human handoff, uploads, effect receipts and shared-tab differences. Video upload, automatic post-submit handoff, `browser_runner_wait` and live view remain explicitly pending release/acceptance; they are not promised for an installed 0.6.3 Agent.
- Clarified that Slack, hosted tasks and AI teams share Arc Credits and run limits, whereas Connect has a separate allowance. Replaced the obsolete Billing navigation label with Plan & usage.

## Page coverage

Both languages use the same reviewed topic and tool sources. Unchanged instructions were checked rather than rewritten without a reason.

| Public guide | Review basis / result |
| --- | --- |
| `/docs/start-here` | Arc vs Connect, Apps without a computer, Skills, saved Tasks; retained |
| `/docs/install-app` | PWA manifests, browser install paths and separate native Agent lifecycle; retained |
| `/docs/connect` | Native install, required OAuth, separate pairing; linked complete directory |
| `/docs/tools` | New generated, searchable contract directory |
| `/docs/codex` | New official desktop/CLI/IDE setup guidance |
| `/docs/devices` | Device switches, local safe ceiling, trusted paths; retained |
| `/docs/device-fleet` | Eligibility, capacity freshness, WSL host grouping; retained |
| `/docs/apps` | Provider authentication, enabled operations, stable request IDs and revocation; retained |
| `/docs/slack` | New bot/App distinction, identity linking, thread mapping and allowance guidance |
| `/docs/files` | Sensitive paths, file-only Undo and conflict checks; retained |
| `/docs/processes` | Process handles vs durable Tasks; retained |
| `/docs/browser` | Runner and shared tabs, published vs pending capabilities; replaced old Chrome-only guide |
| `/docs/tasks` | Hosted Tasks/Routines, IANA timezone/DST, failure pause and bounded runs; retained |
| `/docs/skills` | Imported instructions vs executable tools and selected references; retained |
| `/docs/arc` | Hosted workspace, trial, plan details; updated billing location and AI teams/Slack |
| `/docs/usage-and-costs` | External provider billing plus Arc Credits/Connect allowance distinction |
| `/docs/security` | Local execution boundary and hosted data; updated shared detailed reference |
| `/docs/architecture` | Runtime, scheduling, persistence and AI teams; corrected contradictions |
| `/docs/trust` | Evidence receipts, unknown effects, no duplicate writes and checkout; retained |
| `/docs/memory` | Encrypted bounded notes, retrieval and independent deletion controls; retained |
| `/docs/troubleshooting` | Device/tool policy, reasoning limits and unknown effects; updated shared availability text |
| `/docs/reference` | Shared full product guide; aligned recovery, hosted work and tool inventory |
| `/docs/mcp` | OAuth/scopes, App dispatch, browser setup and generated tools |
| `/docs/long-running-work` | Hosted vs deterministic work and experimental continuation; corrected |
| `/install/chatgpt`, `/install/claude`, `/install/gemini`, `/install/cursor` | Current primary-source setup paths checked; stale instructions corrected |

## Evidence and maintenance

- Public tools and schemas: `apps/relay/src/mcp.ts` through `tools/list`, with capability flags enabled to enumerate the full documented surface. Generation must not read account data or execute tools.
- App operations: `APP_CATALOG` and `APP_OPERATIONS` in `apps/relay/src/app-catalog.ts`; schemas are exported from the registered Zod definitions.
- Local tools/modes: `RemoteArcExecutionCore.listTools()` and the local `remote_arc_status` contract in `apps/agent/internal/localmcp/server.go`; native/TypeScript parity is covered by the device checks.
- Runtime and billing: `apps/relay/src/arc-*`, `slack-bot-*`, `billing-ledger.ts`, protocol trial constants, `dashboard-workspaces.ts` and the Plan & usage UI.
- Browser release boundary: Agent 0.6.3, `apps/agent/internal/browserrunner`; video work #340 and handoff/live view #342/#345 remain pending.
- [OpenAI custom MCP guide](https://developers.openai.com/api/docs/guides/custom-mcp-server), [Codex MCP guide](https://learn.chatgpt.com/docs/extend/mcp), [Codex settings](https://learn.chatgpt.com/docs/developer-settings).
- [Claude remote connectors](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp), [Cursor MCP](https://cursor.com/docs/mcp), [Google custom apps](https://support.google.com/gemini/answer/17209137).

Run `pnpm docs:tools` after changing tool contracts. `pnpm docs:tools:check` detects stale generated files and missing bilingual tool summaries. `pnpm test:seo` includes this freshness check, topic/link checks and crawlable server-document validation. Browser regression checks cover docs discovery, filters, schemas, deep links, both languages and mobile overflow.
