# Selected Codex session/worktree binding — #255, step 3

**Source builds only; not included in published `0.6.2-rc.3`.** This step joins
one explicitly selected local Codex metadata record with the actual Git
inspection from [step 2](local-worktree-inspection.md). It does not read retained
goals/messages into the response, reconstruct remaining work or resume a task.

```sh
remotelink takeover --workspace /absolute/project --source codex
remotelink takeover session --workspace /absolute/project \
  --session-file /absolute/selected.jsonl --session-id <discovered-id>
# Revalidate a previously returned top-level binding fingerprint:
remotelink takeover session --workspace /absolute/project \
  --session-file /absolute/selected.jsonl --session-id <discovered-id> \
  --expect-fingerprint <sha256>
```

These are low-level adapter commands. Selecting the project/task authorizes
the related reads; they add no Remote Arc approval or preview step. A future
continuation flow must select the source unambiguously and check its result.

## Source contract

The response is `remotearc.takeover-session-binding/v1`; the source adapter is
`codex-local-session-meta/v1`, with `trust=untrusted_local_record` and
`history_coverage=not_inspected`. This is the named, bounded local-record
fallback under the #253 research contract, not an authenticated Codex API
response or a promise that private JSONL schemas are stable.

The first complete JSONL line must be a `session_meta` object containing
`payload.id`, `cwd`, and `cli_version`. The ID must match the explicit selection.
Metadata versions observed in research/fixtures are qualified individually:
`0.147.0-alpha.1.2`, `0.147.0-alpha.6.5`, `0.148.0-alpha.9`,
`0.155.0-alpha.16.4`, `0.162.0-alpha.17.2`, `0.163.0-alpha.10.2`,
`0.163.0-alpha.11`. This list qualifies this header shape only. Missing/unknown
versions return `unqualified_recorded_cli_version`; they are not silently treated
as supported. The older broad metadata discovery remains unchanged.

Source reads are limited to 64 KiB each (three observations at most). Returned
fields include the file's OS identity, size, modification time, observed prefix
length/SHA256, selected ID, recorded cwd and version. Final and parent symlinks
are refused; use the actual source/export path. Files must be regular and
explicitly named with an absolute `.jsonl` path. Non-regular/missing/corrupt/
truncated headers and wrong IDs return named gaps without parser diagnostics
that might expose text. No search through messages for replacement metadata.

The prefix may contain private message bytes after the header; those bytes are
hashed in memory but never returned. The digest is **not a whole-transcript
hash**. Size/mtime/identity detect ordinary appends/replacements, while prefix
hashing catches covered edits even with restored timestamps. An in-place edit
beyond 64 KiB with restored size/mtime is outside this observation. The command
cannot detect malicious ABA edits or establish that a Codex process stopped.

## Association and stale results

The source's recorded cwd is untrusted. Independently resolve its directory and
Git administration identity, and compare them with the selected actual worktree:

- Same selected directory, a cwd inside it, or an ancestor cwd **within that same
  Git worktree** can be associated. The selected file-manifest scope stays fixed.
- Another linked worktree or nested repository is `different_worktree`, even
  when it shares a common repository/history.
- A projectless outer cwd without a verified worktree, a missing cwd, a sibling
  directory outside the selection or a foreign-platform path stays unverified.
  No automatic WSL/mount translation or inference from chat content.

Only top-level `status=bound` has a binding `fingerprint`. It requires two equal
combined source/worktree observations plus a final source check. Git inspection
has its own two-read completeness rules. The binding covers the selected source
path/ID/version/file evidence, cwd association, contract and scoped workspace
fingerprint; observation timestamps are excluded from the digest. Changes while
checking return `changed_during_capture`; a stable observation different from
`--expect-fingerprint` returns `stale_baseline` with `baseline_match=false` and
no new top-level fingerprint. Source/association/workspace failures withhold it.

`bound` proves **current metadata association within the documented coverage**.
It does not prove task ownership, original branch, complete history, current
intent, task completion, stopped processes or external-effect outcomes. All
directory/byte reads are observations rather than an atomic snapshot. The later
execution adapter must revalidate its baseline and effects before continuing.
Nested `workspace.fingerprint` alone never establishes a source binding.

Raw conversation, instruction fields, recorded Git claims and tool payloads
have no output fields. Actual Git evidence supplies the branch/HEAD. The command
creates no capture/journal files, changes no config/index/worktree, performs no
network/model calls and does not start/resume Codex. Caller-redirected JSON can
contain private IDs/paths/hashes; the caller controls its storage/deletion.

## Verification and remaining work

```sh
go -C apps/agent test ./internal/takeover ./internal/workspaceidentity ./internal/cli
go -C apps/agent test ./...
go -C apps/agent vet ./...
node scripts/go-coverage.mjs
```

Real temporary Git regressions cover source/worktree identity, wrong ID and
worktree, projectless/nested/sibling/foreign cwd, subdirectories, source append/
replacement/prefix/version/mtime drift, concurrent branch/source/directory changes,
32 MiB sources with bounded reads, malformed/truncated headers, unknown versions,
symlinks, output privacy, index/source preservation and CLI routing. File identity
tests separately cover edits, replacement and non-regular objects.

For future qualified API adapters, the official [Codex App Server documentation](https://learn.chatgpt.com/docs/app-server)
describes `thread/read` without resuming and paginated turn/history methods.
This implementation does not invoke those APIs or claim to have verified their
history completeness. Source-model access is unnecessary for this local check.

#255 stays open for visible history/goal/remaining-work evidence, process state,
WSL and complete task reconstruction. #257/#258 still own portable handoff and
real cross-agent continuation. CLI first-run automatic Codex/Claude registration
remains #254; its shipped explicit Codex setup is separate from this source check.
