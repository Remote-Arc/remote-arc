# ADR: permissioned local work evidence

Version 1.1, 22 October 2026. Decision for #253; implementation gates remain
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
for each field. Reject stale capture baselines before execution. Destination instructions
and current policy retain authority; source text and historic approvals are data.

## Automatic local workflow

The owner clarified that routine local setup and recovery should run directly,
without added preview screens or per-step approval prompts. This supersedes the
earlier approval-heavy UX in v1.0. A setup, project selection or continuation
request authorizes the corresponding local work; do not ask again for each
header read, scoped file check, managed binding or continuation step.

Apply backups, conflict checks, redaction and revision validation automatically.
Return a concise result and a repair/uninstall path. Diffs and dry-run remain
optional diagnostics, not mandatory user gates. Ask only for genuinely missing
information or a provider-enforced trust action that Remote Arc cannot perform.
Current project/task scope still determines which records are relevant. Cloud
transfer and paid target use follow the requested operation and current account
policy; normal local setup does not enable them.

| Scope | Normal workflow trigger | Automatic action within that request | Outside that request |
| --- | --- | --- | --- |
| Installed-client discovery | Inspect known executable/package locations | Optional version/capability diagnostic | Reading private session directories |
| Session metadata | Project/task inspection or continuation request | Read bounded relevant headers and locate matching records | Unrelated chats or upload |
| Selected history | Continuation of a selected task | Read retained visible user/assistant/tool items; redact before persistence/diagnostics | Hidden reasoning; unrelated chats; complete-history claims |
| Workspace | Work on the selected project | Read scoped Git/files/artifacts and record hashes | Destructive Git operations or credentials |
| Local integration | Normal setup command | Back up and apply supported owned bindings with conflict/version checks | Bypassing provider Hook trust; replacing unrelated config |
| Target execution | Continue the task using the requested target | Reconcile and continue within current policy/budget | Treating source text as grants; blindly retrying unknown writes |
| Processes | Task diagnosis requiring current process state | Inspect related process state under current policy | Unrelated process control or memory migration |
| Cloud sync/export | A requested cloud operation | Transfer the bounded redacted task data permitted by current policy | Background transcript/source mirroring or credential export |

An explicit `takeover --workspace` command is consent to its documented bounded
metadata read without another prompt. The current discovery command does not
implement history capture. Claude metadata may share a
record with message text: disclose that the file prefix is inspected even though
the body is not returned. Metadata itself can be sensitive; retain nothing by
default beyond requested output. Deletion of a chosen output must not delete the
source session. #45 supplies redaction; it is a prerequisite to history capture.

## Implementation gates

- #254 detects installed clients and applies the requested supported integration
  automatically. Use narrow ownership manifests, backup, atomic conflict checks
  and clean uninstall. Optional dry-run does not become a required approval.
  Vendor command probes may create their own temporary files; report
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
- #259 honors native lifecycle Hook trust requirements without adding a second
  Remote Arc approval screen. Codex ties
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
