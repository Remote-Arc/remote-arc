# Agent Takeover compatibility matrix v1.0

Research contract for [#253](https://github.com/Remote-Arc/remote-arc/issues/253),
under [#252](https://github.com/Remote-Arc/remote-arc/issues/252). Checked
22 October 2026. This qualifies interfaces and metadata observations, not Local
Takeover Beta or an end-to-end cross-agent continuation.

## Evidence vocabulary

**O — observable:** can be read from an authorized, identified source. It is not
automatically true outside that source. **I — inferred:** a proposed conclusion
from retained material, with its derivation and uncertainty. **U — unavailable:**
missing, omitted, inaccessible or unsupported. Every captured field carries its
own state; an absent value must not be replaced by model invention.

| Work fact | Codex local | Claude Code local | Codex Cloud import | Independent check |
| --- | --- | --- | --- | --- |
| Original goal | O retained user input; I active intent | O retained user input; I active intent | O authorized task/export; otherwise U | User reviews current goal |
| Visible conversation | O retained items; U missing pages | O retained chain; U missing ancestry | O supported export only; otherwise U | Record range and omissions |
| Tool observations | O recorded outputs; I current effect | O recorded outputs; I current effect | O available output; otherwise U | Read current resource state |
| Branch / HEAD / worktree | O separate local Git read | O separate local Git read | O exported commit; U hidden checkout | Inspect actual selected worktree |
| Dirty / untracked files | O scoped local files | O scoped local files | O explicit export; otherwise U | Hash covered files; retain exclusions |
| Artifact bytes | O scoped existing artifact | O scoped existing artifact | O authorized download/export | Existence, size and digest |
| Live process state | U from transcript; O separate process grant | U from transcript; O separate process grant | U unless authorized interface exposes it | Current handle and process probe |
| External write outcome | O acknowledgement; U uncertain dispatch | O acknowledgement; U uncertain dispatch | O supported receipt; U uncertain dispatch | Independent provider read-back |
| Credentials / sign-ins | U: excluded | U: excluded | U: excluded | Reauthorize destination separately |
| Hidden model state | U | U | U | No full-state transfer claim |

These are classification rules, not assertions that every source retains each
field. Transcript statements that a test passed remain source observations.
They do not become verified execution receipts. Current directory metadata does
not prove the actual repository an agent edited; projectless chats can create a
worktree below their original directory. A receiving agent must reconcile both.

## Interface hierarchy and limits

1. Prefer a qualified official API or user-selected export.
2. Use a named, bounded local-record fallback only after session-read consent.
3. If records are missing or unsupported, recover authorized workspace facts
   only, with history/intent unavailable until the user supplies them.

Codex App Server exposes stored-thread metadata/history methods separately from
generation. The generated protocol for the installed Windows build advertises
`thread/list`, `thread/read`, `thread/turns/list`, `thread/items/list` and
`thread/resume`. Pagination and capabilities must be negotiated for the actual
binary. `thread/resume` concerns Codex's own thread; it does not import another
vendor's private state. A consumer calls `turn/start` only after target execution
authorization. See [App Server](https://learn.chatgpt.com/docs/app-server).

The [Codex SDK](https://learn.chatgpt.com/docs/codex-sdk) provides local task and
thread controls; use it for a deliberate supported execution integration, not
as a dependency for a passive metadata scan. The
[CLI reference](https://learn.chatgpt.com/docs/cli/reference) documents native
resume/cloud commands. Local same-provider resume is distinct from portable
work evidence.

Claude's [session APIs](https://code.claude.com/docs/en/agent-sdk/sessions) offer
session listing, retained messages, resume and fork. A session does not preserve
the filesystem. Prefer SDK history reconstruction for ancestry; a raw append
order is not proof of the active fork. The official
[session browser example](https://platform.claude.com/cookbook/claude-agent-sdk-05-building-a-session-browser)
documents JSONL storage and Python history functions introduced in SDK 0.1.51.
That is an interface baseline, not a claim that the latest CLI or SDK is locally
installed or fully tested. Omitted history, compaction and subagents need named
coverage in #256.

The raw fallback currently recognizes Codex `session_meta.payload` and Claude
`sessionId` / `cwd` records. Metadata qualification reads at most 64 KiB per file
and never returns messages, source paths or IDs in its research report. This
does not qualify full history reconstruction or stable private-file schemas.

## Version and platform qualification

| Environment | Direct evidence | Qualification / gap |
| --- | --- | --- |
| Windows amd64 | Installed Codex 0.163.0-alpha.11; generated local protocol schema; 196 readable headers | Metadata record versions 0.162.0-alpha.17.2, 0.163.0-alpha.10.2 and 0.163.0-alpha.11 observed |
| macOS amd64 | Installed Codex 0.155.0-alpha.16.4; 4 readable local headers; 310 generated schema files; native tests and real discovery passed | Metadata record versions 0.147.0-alpha.1.2, 0.147.0-alpha.6.5 and 0.148.0-alpha.9 observed; full history/native continuation require separate qualification |
| Claude on Windows/macOS | Two synthetic record fixtures | Local CLI/SDK/session availability not established; no production qualification |
| WSL / Linux | No real source smoke in this research | Do not reinterpret `C:\\...`, `/mnt/c/...` or UNC strings automatically; require explicit distro/mount mapping and canonical containment |
| Cloud-managed workspaces | Official interface review only | No full runtime export qualified; see cloud verdict below |

Observed versions refer to a bounded sample, not a supported range. Unknown or
newer versions are not silently declared compatible. Prefer method/schema
capability checks and fail to workspace-only recovery when the requested field
cannot be read safely. Native regression CI does not replace real client E2E.

## Cloud feasibility verdict

**Partial authorized import is feasible; full consumer cloud-state cloning is
unqualified and unsupported by this implementation.** Accept only a reviewed
task export, accessible Git/PR changes or explicitly supported API output. The
[environment contract](https://learn.chatgpt.com/docs/environments/modes)
separates local/worktree execution from a cloud task's own files and services;
local files, processes and sign-ins do not automatically move to it.

This is a limit on Remote Arc's qualified adapter, not a universal claim that no
cloud API exists. #263 must verify any specific cloud endpoint and account
entitlement before use. No credential scraping, private sandbox access, hidden
reasoning import or invented uncommitted state is an acceptable fallback.

## Reproduce the read-only research checks

```sh
python3 scripts/takeover-session-probe.py --fixtures tests/fixtures/agent-sessions
python3 scripts/takeover-session-probe.py --source codex --sessions-root /selected/local/sessions --consent-metadata
```

Two synthetic fixtures per source cover bookkeeping, compaction, missing
ancestry and partial tails. They contain no private transcript or credentials.
Real Windows and macOS reports contain counts/version fields only; source
files remain unchanged and no SDK/model/network operation is invoked by this
probe. See [qualification evidence](validation/takeover-253.json) and the
[consent/adapter ADR](agent-takeover-consent-adr.md).
