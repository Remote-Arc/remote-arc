# Remote Arc coverage tracking — 2026-10-16

Goal: **at least 90% statement coverage in every production module**; measure branch coverage as well. Do not hide large production files or command entrypoints to inflate the result.

| Scope | Baseline | After focused tests | Target |
| --- | ---: | ---: | ---: |
| Go Agent overall, including cmd | 64.8% | 70.5% | 90% |
| Go Execution Core overall | 71.3% | 90.1% | 90% |
| Go Agent local MCP | 87.0% | 95.7% | 90% |
| Go Execution Core protocol | 46.9% | 100.0% | 90% |
| TypeScript Relay source, security suite only | 34.85% | 34.85% | 90% |
| TypeScript Relay source, entire existing CI | 43.11% | 43.11% | 90% |
| All app/package TypeScript source under existing CI | 28.40% | 28.40% | 90% |

All figures reflect statement coverage, not test pass rates. The Relay figure covers only the security scripts and must not be advertised as whole-repository coverage. UI and other TS modules still need instrumented measurement.

## Commands

- `pnpm coverage:go`: run Go coverage and non-regression CI gates; displays 90% goal.
- `pnpm coverage:go:target`: strict 90% aggregate gate for **both** Go modules. Intentionally fails while debt remains.
- `pnpm coverage:relay`: measure Relay security-suite source coverage, with non-regression floors.
- `pnpm coverage:relay:target`: strict 90% on Relay statements, lines, branches and functions (currently fails).
- `pnpm coverage:ts`: execute the existing full CI under source-mapped c8 with all apps/packages TS/TSX source files included, enforcing today's non-regression floors. This replaces the duplicate uninstrumented test step in the CI `verify` job.
- `pnpm coverage:ts:target`: strict 90% threshold for all four TypeScript coverage dimensions (currently fails).
- Full existing CI measured with c8 across all apps/packages TS/TSX source: **28.4% statements, 71.24% branches, 54.06% functions**. This is only the instrumented Node CI suite; browser-runtime E2E execution still needs separate instrumentation.

## Priorities

1. Cover the Go Agent CLI (46.0% after focused safety/flag tests), workspace (68.9%), lease (70.5%), device runtime (73.6%).
2. Cover execution engine (70.4%), policy (84.3%), config (80.7%) including denied actions, undo conflict, reconnect, credentials and failure paths.
3. Add source-mapped, all-file coverage accounting and tests for Relay, Dashboard, browser extension, MCP and other TS modules.
4. Increase CI baseline floors toward 90% and switch to strict mode once objectively achieved.

**Do not claim 90% based on a passing baseline gate.**
