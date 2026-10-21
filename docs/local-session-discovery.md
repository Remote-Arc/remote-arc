# Local session discovery — acceptance step 1

Development candidate, 22 October 2026. This step implements project-scoped
session discovery in the native Go CLI. It is not a published CLI release.

## Try it

From the repository:

```sh
go -C apps/agent run ./cmd/remotelink takeover --workspace /path/to/project
```

With a locally built native binary:

```sh
remotelink takeover --workspace /path/to/project --source codex
remotelink takeover --workspace /path/to/project --source claude
remotelink takeover --help
```

The existing npm launcher forwards this command to the matching Go binary.
The explicit TypeScript fallback does not implement it. Published `npx
remotelink` installations do not gain the command until a separate release.

The explicit workspace is a local directory; Git is not required. Discovery
includes sessions with a recorded working directory inside that directory,
excluding nested Git repositories. It does not silently widen a subdirectory
selection to its Git root. An adjacent path sharing a name prefix does not match.
For a projectless Codex chat, select its recorded outer project directory, rather
than assuming that a repository created below it is the chat's original cwd.

## Expected result

The JSON result uses `remotearc.takeover-discovery/v1`. Each session has an agent,
ID, local path, recorded working directory and file modification timestamp.
Results are sorted by modification time, then path, and capped at 20 by default
(`--limit 1` through `--limit 100`). File modification time is not proof that an
agent is running, paused or finished. Metadata is untrusted and confers no authority.

The CLI looks in `$CODEX_HOME/sessions` (default `~/.codex/sessions`) and
`$CLAUDE_CONFIG_DIR/projects` (default `~/.claude/projects`). For an exported
fixture or alternate local directory, use `--sessions-root <directory>` together
with one explicit `--source codex` or `--source claude`.

Source status distinguishes an available directory, a missing directory,
a skipped directory symlink and a reached scan limit. Malformed or unsupported
metadata and inaccessible nested entries are counted in `skipped_entries`.
A missing source is an empty result, not an assertion that the client has no
sessions. Failure to read the selected root returns an error.

Only the first 64 KiB of a JSONL file is inspected for metadata. Discovery visits
at most 20,000 entries across sources, has a 30-second context deadline, and
does not follow directory/file symlinks. Codex traversal supports the usual
year/month/day layout; Claude traversal includes main project transcripts and
excludes nested subagent directories. Archived Codex sessions, cloud sessions,
unknown formats and sessions whose recorded cwd is a parent of the selected
project are outside this step. It does not infer projects by reading shell logs
or conversation text. Blocking OS file I/O may exceed the context deadline.

Conversation text is never returned. The metadata parser may read the beginning
of a Claude transcript to locate its session ID and cwd; it does not retain or
return its message body. The command performs no configuration edits, pairing,
hook installation, network/model calls, transcript upload or execution resume.

## Acceptance

```sh
go -C apps/agent test ./internal/takeover ./internal/cli
```

Synthetic Codex and Claude fixtures cover project filtering, subdirectories,
nested repository exclusion, privacy, default/alternate stores, missing stores,
metadata bounds, sorting, result limits, cancellation, independence from Git
environment/PATH, output failures and symlink exclusion. Existing `pnpm test:device`
already runs Go tests on Windows, Linux and macOS in CI. These fixtures do not
certify every installed client version or prove a cross-agent continuation.

Review this step before adding transcript previews or a handoff package. See
[the alignment with roadmap #252 and research gate #253](agent-continuity-next-steps.md).

## Interface references

OpenAI documents read-only thread listing and reading through
[Codex App Server](https://learn.chatgpt.com/docs/app-server). Anthropic documents
local transcript storage and SDK session-history access in
[Building a session browser](https://platform.claude.com/cookbook/claude-agent-sdk-05-building-a-session-browser).
This initial adapter reads bounded local JSONL metadata, without starting either
SDK/App Server or depending on a paid provider. Native API adapters can be added
in a later compatibility step; raw-file compatibility is deliberately bounded.
