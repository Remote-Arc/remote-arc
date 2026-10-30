# Test coverage

The README badge reports the latest validated default-branch measurement. **90% is the target, not a claim that the whole repository has already reached it.**

The [live report](https://github.com/Remote-Arc/remote-arc/tree/coverage-badges) contains the source commit, CI run, measurement time, counts and component metrics. Its JSON and SVG files are generated from actual CI output; percentages are never manually entered into the README.

## Scope and calculation

The combined badge is statement coverage across three disjoint scopes:

1. All production TypeScript/TSX source included by `coverage:ts`: `apps/**/src/**/*.ts(x)` and `packages/**/src/**/*.ts(x)`.
2. All compiled packages in the Go Agent module.
3. All compiled packages in the Go Execution Core module.

Add covered statements and total statements across these scopes, then divide. Do not average module percentages. Apps and Relay are TypeScript subsets and appear only as breakdowns, without being counted again.

Go measurement uses Linux, matching the coverage job. Browser-extension JavaScript, non-source scripts, other OS build-tag branches and generated data outside these existing scopes are not represented by this badge. Browser behavioral tests remain separate evidence; their pass rate is not substituted for source coverage.

## Current stages

The measured baseline is [master c4bc77f / CI 40998299997](https://github.com/Remote-Arc/remote-arc/actions/runs/40998299997).

| Scope | Measured statements | Enforced regression floor |
| --- | ---: | --- |
| Apps core | 99.49% | 90% for every metric and file |
| Go Execution Core | 90.88% | 90% module statements; protocol 90% |
| Go Agent | 78.62% | 78% module statements; local MCP 90% |
| Relay | 89.24%* | 88% lines/statements, 82% branches, 95% functions |
| TypeScript/TSX | 50.25% | 50% lines/statements, 80% branches, 76% functions |

\* Relay was re-measured after `coverage:relay` switched from the security suite alone to `test:coverage`: the security suite plus the other relay suites CI already runs, with the goal harnesses importing the real sources. Its earlier baseline was 63.76%.

Combined baseline: **54.41% (32,793 / 60,267 statements)**. Current values continue updating in the live report; this table records the baseline used to raise the regression floors.

`scripts/coverage-policy.mjs` owns the phased floors. Existing Apps and Core 90% gates remain. The Go Agent, Relay and full TypeScript floors have been raised from their earlier lower settings. Source inclusion has not been narrowed.

Strict target commands remain available:

- `pnpm coverage:go:target`
- `pnpm coverage:relay:target`
- `pnpm coverage:ts:target`

They require 90% for the relevant metrics. Expand meaningful tests in separate changes, ratchet the measured floors upward, and switch each remaining scope to the strict target only after its real suite reaches it.

## Automatic publication

After CI completes on a push to master, `coverage-badges.yml` reads the verify, go-coverage and relay-coverage job logs. Those coverage-producing jobs must all pass and their run identity must match. Unexpected counts, missing metrics, forks and pull-request runs are rejected.

The publisher checks that the measured commit is still the current master before updating the dedicated `coverage-badges` branch. It checks out trusted master code, never a pull-request checkout with write permissions. Only the publishing job receives repository write permission. It does not need Codecov credentials or another external service.

If coverage measurement fails or the run is obsolete, the previous badge remains; its report still identifies the source SHA and measurement time. The adjacent CI badge separately shows CI health. A failed or incomplete measurement is never rewritten as a successful 90% result.

Local generation, without writing to GitHub:

```sh
node --test scripts/coverage-badges-test.mjs
node scripts/coverage-badges.mjs --repo Remote-Arc/remote-arc --run CI_RUN_ID --out work/coverage-badges
```

The explicit `--publish` option updates only the dedicated badge branch, with a normal fast-forward ref update; it does not modify master or deploy the product.
