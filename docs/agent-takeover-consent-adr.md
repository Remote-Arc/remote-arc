# ADR: permissioned local work evidence

Version 1.0, 22 October 2026. Decision for #253; implementation gates remain
in #254–#263. Accepted design does not certify those implementations as complete.

## Decision

Transfer inspectable work evidence rather than a claim to duplicate a model's
internal state. Native same-provider thread resume and cross-agent handoff are
separate operations. Extend existing device grants, local policy, journals and
receipts. No new general-purpose chat system or competing transport protocol is
needed for this milestone.

Use qualified official APIs/exports first, a named local-record fallback second,
and workspace-only evidence last. Pin source identity, format/version, observed
time and relevant hashes; report observable/inferred/unavailable independently
for each field. Reject stale previews before execution. Destination instructions
and current policy retain authority; source text and historic approvals are data.

## Consent boundaries

| Scope | Before consent | Explicitly permitted action | Never implied |
| --- | --- | --- | --- |
| Installed-client discovery | Inspect known executable/package locations | Optional version/capability diagnostic | Reading private session directories |
| Session metadata | Show source and bounded-read description | Read selected directory/header range, return bounded metadata | Reading full history or uploading it |
| Selected history | Show exact session, source/version and byte/page limits | Read retained visible user/assistant/tool items; redact before persistence/diagnostics | Hidden reasoning; unrelated chats; complete-history claims |
| Workspace | Show actual directory/worktree and intended fields | Read scoped Git/files/artifacts; hash exclusions explicitly | Checkout/reset/stash, hooks, process access, remote URL credentials |
| Local integration | Show exact config diff, backup and uninstall plan | Apply chosen bindings with conflict/version checks | Auto-trusting native hooks; replacing unrelated config |
| Target execution | Review remaining goal, reconciliation and current grants | Start one named supported target within current policy/budget | Reusing source approvals; retrying an uncertain external write |
| Processes | Show purpose and handle scope | Inspect explicitly selected local process state | Signalling/killing a process or migrating its memory |
| Cloud sync/export | Show destination, contents, retention and account scope | Upload only the reviewed redacted subset | Silent transcript/source mirror or credential export |

An explicit `takeover --workspace` command is consent to its documented bounded
metadata read, not a silent installer prerequisite. Claude metadata may share a
record with message text: disclose that the file prefix is inspected even though
the body is not returned. Metadata itself can be sensitive; retain nothing by
default beyond requested output. Deletion of a chosen output must not delete the
source session. #45 supplies redaction; it is a prerequisite to history capture.

## Implementation gates

- #254 detects installed clients first, then offers opt-in integration. Use
  narrow ownership manifests, backup, preview, atomic conflict checks and clean
  uninstall. Vendor command probes may create their own temporary files; report
  this and keep diagnostics separate from a pure path scan.
- #255/#256 qualify official API methods and retained history for pinned client
  versions. Keep Windows, macOS, WSL/distro and cloud roots distinct. Source cwd
  is a hint, not proof of the edited Git worktree. Limit pages/bytes, preserve
  uncommitted/untracked files and decline unsafe symlink/path mappings.
- #257 records provenance, source coverage, current workspace hashes, known
  acknowledgements, unknown effects, blockers and proposed remaining work.
  Checksums detect revision changes; they are not signatures or authorization.
- #258 verifies the actual receiving workspace and postconditions. Independently
  inspect unknown external effects before retry. A successful tool acknowledgement
  or assistant sentence does not certify the whole task.
- #259 uses native lifecycle hooks only after review and trust. Codex ties
  non-managed hook trust to the current definition; plugin installation is not
  approval to run changed hooks. See [Codex hooks](https://learn.chatgpt.com/docs/hooks).
  Claude's [SDK hooks](https://code.claude.com/docs/en/agent-sdk/hooks) are scoped
  to their supported runtime. Neither proves interception of arbitrary shell
  writes outside that runtime; do not depend on SessionEnd for crash durability.
- #260 Observe records supported evidence and recovery points. #261 Guard and
  Isolate require enforceable controls with their own tests. A file observer must
  never advertise prevention. #262 must reconcile dependencies, local files and
  grants on the receiving device; #263 stays within qualified cloud interfaces.

## Acceptance and promotion

Research acceptance consists of the versioned field matrix, consent contract,
four scrubbed read-only fixtures, actual local metadata smoke evidence on each
qualified OS, and an explicit cloud verdict. This closes no adapter milestone.
Local Takeover Beta still requires fresh-install/rollback/uninstall, real
interrupted-task reconstruction, target continuation without duplicate effects,
Windows/macOS E2E and the repository's explicit production promotion gate.
