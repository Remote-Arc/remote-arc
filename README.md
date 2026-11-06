# Latest measured coverage

Source: [bb529ec](https://github.com/Remote-Arc/remote-arc/commit/bb529ec73899f25d12f6c6036a7293c93788c40b) · [CI run](https://github.com/Remote-Arc/remote-arc/actions/runs/42256209830) · 2026-11-06T17:04:49Z

**Combined statement coverage: 57.26% (77740/135755). Target: ≥90%.**

Production TypeScript/TSX and Linux Go module statements; Apps/Relay are overlapping breakouts.

| Scope | Statements | Branches | Functions | Lines |
| --- | ---: | ---: | ---: | ---: |
| TypeScript / TSX | 54.64% | 82.21% | 83.31% | 54.64% |
| Relay | 93.03% | 84.33% | 97.08% | 93.03% |
| Apps core | 99.45% | 95.25% | 100.00% | 99.45% |
| Go Agent | 90.32% | — | — | — |
| Go Execution Core | 93.40% | — | — | — |

The combined value weights covered/total statements in three disjoint scopes: TypeScript/TSX, Go Agent, and Go Execution Core. Apps and Relay are shown separately and are not added again. Go values are measured on Linux, matching the coverage job.

The report is published only from completed master push runs with successful coverage-producing jobs. A failed or incomplete measurement leaves the previous measured badge in place; the source SHA/time above identify its age. The CI status badge separately shows overall CI health.

Apps already requires ≥90% for every metric and file; Go Execution Core requires ≥90% module statement coverage. Other scopes use explicit regression floors while tests are expanded toward 90%. No source exclusions are added by badge generation.
