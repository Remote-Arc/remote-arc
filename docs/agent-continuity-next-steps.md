# Agent continuity roadmap alignment

Updated 22 October 2026. The authoritative roadmap is
[Epic #252](https://github.com/Remote-Arc/remote-arc/issues/252), including its
ordered child Issues #253–#263. This document does not define a second roadmap.
AI Teams acceptance is excluded from this work.

[Research #253](https://github.com/Remote-Arc/remote-arc/issues/253) is the first
gate: establish supported interfaces, versions, platform gaps and separate
consent for installed-client discovery, session metadata, transcript/workspace
reads and cloud sync. Agent installation detection must not silently invoke the
metadata reader. Explicitly invoking `takeover --workspace <directory>` opts
into this bounded local metadata read; it is not consent to transcript import,
hooks, configuration edits, inference or cloud upload.

The [local discovery candidate](local-session-discovery.md) is a narrow
read-only validation example for #253 and partial groundwork for
[Codex #255](https://github.com/Remote-Arc/remote-arc/issues/255) and
[Claude #256](https://github.com/Remote-Arc/remote-arc/issues/256). It does not
complete any of those Issues or the Local Takeover Beta milestone. It lists
recorded cwd metadata; actual worktree reconciliation remains separate.

Current evidence: synthetic metadata fixtures for both sources, native Go tests,
and a Windows smoke scan finding 21 Codex sessions in the outer project
directory. The Windows host has no Claude session directory. Provider version
qualification and real macOS/WSL/Claude acceptance remain open under #253.

Review this bounded example and finish #253's compatibility/consent matrix
before widening session access or promising agent continuation. Onboarding,
handoff, checkpoints, Observe, Guard/Isolate, Fleet and cloud feasibility retain
their separate child Issues and release gates in #252. No automatic Issue
closure, merge, deployment, package publication or paid provider activation is
part of this candidate.
