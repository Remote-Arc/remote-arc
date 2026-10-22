# Agent continuity roadmap alignment

Updated 22 October 2026. The authoritative roadmap is
[Epic #252](https://github.com/Remote-Arc/remote-arc/issues/252), including its
ordered child Issues #253–#263. This document does not define a second roadmap.
AI Teams acceptance is excluded from this work.

[Research #253](https://github.com/Remote-Arc/remote-arc/issues/253) completed in
[PR #265](https://github.com/Remote-Arc/remote-arc/pull/265). Its
[compatibility matrix](agent-takeover-compatibility-v1.md) and
[consent ADR](agent-takeover-consent-adr.md) establish supported interfaces,
observed versions and platform gaps. The owner subsequently requested automatic
local setup and recovery without additional previews or per-step approvals;
ADR v1.1 records that UX correction. A project/task request supplies the scope
for related local reads and setup. The current `takeover --workspace` command
only implements bounded metadata discovery, not history capture or continuation.
Install inspection remains independent of session parsing.

The [local discovery candidate](local-session-discovery.md) is a narrow
read-only validation example for #253 and partial groundwork for
[Codex #255](https://github.com/Remote-Arc/remote-arc/issues/255) and
[Claude #256](https://github.com/Remote-Arc/remote-arc/issues/256). It does not
complete either adapter Issue or the Local Takeover Beta milestone. It lists
recorded cwd metadata. The separate [worktree inspection](local-worktree-inspection.md)
source-build command now reports actual Git state and a bounded fingerprint;
session-to-worktree association and complete task reconstruction remain separate.

Current evidence: synthetic metadata fixtures for both sources, native Go tests,
and Windows/macOS real Codex metadata smoke scans (21 and 1 matched sessions
respectively). The Mac native discovery and CLI tests pass. These are bounded
metadata checks; complete history, session-to-worktree association, target
continuation, WSL mappings and real Claude acceptance remain unqualified.

Use the accepted compatibility and automatic-workflow contract before widening session access
or promising agent continuation. Onboarding,
handoff, checkpoints, Observe, Guard/Isolate, Fleet and cloud feasibility retain
their separate child Issues and release gates in #252. This candidate does not
authorize deployment, package publication or paid provider activation.

## Parallel ownership

[Roadmap #283](https://github.com/Remote-Arc/remote-arc/issues/283) coordinates
project priorities. Claude owns the [Browser Runner epic #274](https://github.com/Remote-Arc/remote-arc/issues/274)
and its Go Agent browser runtime; Codex advances #252 in separate worktrees and
PRs. This inspection slice touches the takeover module and CLI only. A later
#257 handoff contract must coordinate with #279's browser-effect ledger; this
slice neither defines that ledger nor registers browser tools.
