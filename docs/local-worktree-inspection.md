# Actual Git/worktree inspection — #255, step 2

**Source builds only; not included in published `0.6.2-rc.3`.** This read-only
step verifies the selected local project's Git state independently of a coding
agent's recorded `cwd`. It does not reconstruct task history or resume an agent.

```sh
go -C apps/agent run ./cmd/remotelink takeover workspace --workspace /absolute/project
# Or use a native binary built from this commit:
remotelink takeover workspace --workspace /absolute/project
remotelink takeover workspace --help
```

The existing npm launcher forwards arguments to its matching native binary;
the currently published RC predates this subcommand. Git 2.36+ is required.
The original `takeover --workspace ...` session-metadata command is unchanged.
Neither command starts a source model, needs a model token, pairs the device,
uploads transcripts or creates persistent capture files.

## Result and interpretation

JSON schema identifier: `remotearc.takeover-workspace/v1`.

| Field | Meaning |
| --- | --- |
| `workspace` | Canonical selected directory; file hashes never widen a subdirectory selection |
| `snapshot.repository_root`, `git_directory`, `common_git_directory` | Actual Git paths; linked worktree administration is distinguished from the common repository |
| `workspace_identity`, `git_directory_identity`, `common_git_directory_identity` | OS directory identities, included in the fingerprint to detect replacement |
| `head`, `branch`, `detached`, `unborn` | Current local Git state, including initial repositories and detached HEAD |
| `upstream`, `ahead`, `behind` | Local tracking-ref information when Git provides it; no fetch or claim of current remote state |
| `changes` | Repository-relative paths in the selected directory, separate staged/unstaged status, bounded raw-byte SHA256 or explicit content gap |
| `linked_worktrees` | Shared-repository metadata: path, HEAD, branch, bare/detached/locked/prunable flags; no lock reasons or scans of the other worktrees |
| `git_status_sha256` | Hash of Git's bounded porcelain-v2 status, including staged object IDs and conflict stages |
| `fingerprint` | Only emitted for `status=ok`, covering the version, selection, directory identities and the matching snapshot |

Two complete observations must match to return `status=ok` with
`consistency=two_matching_reads`. A content edit with the same Git status letters
still changes its file hash. An edit, branch switch, index update or directory
replacement between reads withholds the fingerprint. This is **not an atomic
snapshot, an execution permission or a future-validity guarantee**. Reinspect
immediately before later continuation; the later execution adapter must enforce
its own stale-baseline and effect checks.

Statuses are `ok`, `changed_during_capture`, `incomplete`, `not_git`,
`missing_workspace`, and `unavailable`. Inspect `reason`, `snapshot.complete`,
`snapshot.limit_reached` and each `content_status`. A broken `.git` pointer or
unreadable repository is unavailable, not an empty clean project. Invalid CLI
arguments return a command error. A structured non-OK result is a successful
inspection response, **not permission to proceed**.

Renames are deliberately represented as deletion/addition, avoiding heuristic
rename inference. Conflicts keep unmerged status and conflict-index evidence.
Raw file bytes and conversation bodies have no response fields. Path names and
hashes themselves are local metadata: do not publish the full output from a
private project without the owner's intent. Remote Arc persists nothing here;
any shell-redirection output is owned/deleted by its caller.

## Bounds and exclusions

- At most 1,000 changed paths and 100 linked-worktree records; each Git stdout
  is capped at 2 MiB, each Git process at 10 seconds, the overall context at
  30 seconds. Blocking OS file I/O can exceed the context deadline.
- Hash at most 1 MiB per changed regular file and 8 MiB per observation.
  Files too large or exceeding the total budget are explicitly incomplete.
- Remote Arc does not hash sensitive-policy paths, private Codex/Claude/state
  directories, symlinks, nested repositories, non-regular files or submodules.
  Missing files are verified deletions only when Git reports a deletion.
- Ignored files, clean-file bytes, ignored/assume-unchanged/skip-worktree state
  and submodule internals are outside this fingerprint. Git's own status/stat
  optimizations still apply. `ok` means complete **within this declared scope**,
  not that every byte in the project was inventoried or the task is complete.
- Git may inspect repository-wide metadata/files to compute status even when
  the returned manifest and Remote Arc content hashes are scoped to a subdirectory.
  Two equal reads cannot defeat a malicious local writer or an ABA mutation.
  This is not an OS sandbox.
- Non-UTF-8 Git paths and unsupported porcelain output are unavailable, never
  silently rewritten into a valid fingerprint. WSL path translation is deferred.

## Read-only execution

Git runs without a shell, without inherited `GIT_*` repository/config overrides,
with optional locks disabled, fsmonitor/hooks disabled and configured external
clean/process drivers neutralized. An empty protocol allowlist and disabled
lazy fetch prevent missing objects from triggering a network fetch. Required
missing objects therefore fail inspection. The executable is the installed Git
resolved from PATH; ownership checks are not bypassed.

Before status, a bounded attribute inspection checks selected paths. Active
filter attributes (including LFS) return `external_filters_not_supported`;
the command does not execute those programs or guess their normalized results.
Installed but unused filter definitions do not block ordinary repositories.
This conservative support limit can be qualified in a later PR.

There is no checkout/reset/stash, config mutation, index refresh write, recovery
point or execution journal in this command. No Browser Runner/CDP files or tool
registration are changed. #257 will separately reconcile #279's browser effects.

## Reproducible acceptance

```sh
go -C apps/agent test ./internal/takeover ./internal/cli
go -C apps/agent test ./...
go -C apps/agent vet ./...
node scripts/go-coverage.mjs
```

Committed tests use real temporary Git repositories: staged/unstaged/deleted/
untracked files; index bytes and HEAD unchanged; deterministic hashes and
same-status content drift; subdirectories and linked worktrees; unborn/detached
HEAD; conflicts/local divergence; concurrent content/index/branch changes and
missing roots; filtered files and malicious fsmonitor/filter sentinels; inherited
Git redirection; sensitive/large/ignored files; symlinks/nested repositories;
output/entry bounds and CLI routing. CI runs the Go suite on Windows/macOS/Linux.
CI is not real installed-client or cross-agent E2E acceptance.

#255 remains open for visible history, source/session pinning, session-to-worktree
association, process evidence, WSL and complete interrupted-task reconstruction.
#258 remains the integration gate; this step does not claim Local Takeover Beta.

Git interface references: [porcelain v2 and optional index refresh](https://git-scm.com/docs/git-status),
[worktree porcelain](https://git-scm.com/docs/git-worktree),
[fsmonitor configuration](https://git-scm.com/docs/git-config),
[protocol allowlist and lazy-fetch controls](https://git-scm.com/docs/git).
