# Working on Remote Arc

Use Node 24, pnpm 10.17.1 and the Go version in `apps/agent/go.mod`.

```sh
pnpm install --frozen-lockfile
pnpm check
```

## Formatting and linting

Prettier and ESLint are pinned project dependencies. Their configuration is
shared across the repository and CI, independent of any editor or IDE.

```sh
pnpm format        # Format maintained JS, TS, TSX, CSS, JSON, HTML, YAML and Markdown
pnpm format:check  # Same formatting check as CI
pnpm lint          # JavaScript/TypeScript correctness and React Hook call rules
pnpm lint:fix      # Safe ESLint fixes; remaining findings require an edit
pnpm typecheck     # All workspace TypeScript projects
```

Go files use `gofmt`. Python and
SQL are not parsed by Prettier. Dependencies, generated catalogs, pinned skill
resources and download artifacts are excluded, so editing source does not
silently rewrite their checksums. Regenerate those files with their own scripts.

Prettier owns layout; ESLint owns correctness. Existing dynamic provider adapters
and test fixtures may use `any`. Unused declarations are errors; prefix a truly
intentional unused positional argument with `_`. Do not compress source into
single-line functions or bypass checks to make a change pass.

## Tests and coverage

`package.json` keeps short entry points. Longer ordered suites live in
`scripts/tasks/root.json`, `relay.json`, `ui.json` and `cli.json`. Add a command as
an executable/argument array in the relevant suite, rather than extending a shell
string with another `&&`.

```sh
pnpm task --list
pnpm --filter @remotearc/relay test:apps
pnpm --filter @remotearc/ui test:workspaces
pnpm task relay test:security --dry-run
pnpm test:wiring
```

The runner executes in the suite's declared directory, in order, stops on the
first failing command, and forwards extra arguments to the last step. It does
not interpret shell operators. Existing suite names remain available for CI and
local workflows. `test:wiring` follows only selected manifest tasks, so an unused
definition cannot hide a test that no command runs.

Coverage is intentionally split by runtime. The sources and floors remain in
`scripts/coverage-policy.mjs`; the task lists do not replace that policy.

| Command               | What it measures                                  |
| --------------------- | ------------------------------------------------- |
| `pnpm coverage:apps`  | Apps core; 90% for every metric and file          |
| `pnpm coverage:relay` | All production Relay TypeScript                   |
| `pnpm coverage:ts`    | All workspace TypeScript/TSX through the CI suite |
| `pnpm coverage:go`    | Both Go modules                                   |

The `:target` commands apply the existing stricter target. Do not remove tests,
narrow instrumentation, or lower floors while reorganizing a suite.

## Application error codes

Business error identifiers use `UPPER_SNAKE_CASE`, such as `APP_CONNECTION_LIMIT`.
Relay JSON responses use `applicationJson`; MCP results and monitoring use the
same canonical form. Readers accept legacy lowercase identifiers. OAuth standard
errors and numeric JSON-RPC codes retain their protocol-defined forms. User
messages, operation names and status values are separate from error identifiers.
