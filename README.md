# Latest measured coverage

Source: [492df4d](https://github.com/Remote-Arc/remote-arc/commit/492df4d0ffe3701e38144fb8cbe24154a834c00d) · [CI run](https://github.com/Remote-Arc/remote-arc/actions/runs/41155793844) · 2026-10-31T01:47:55Z

**Combined statement coverage: 63.68% (37128/58300). Target: ≥90%.**

Production TypeScript/TSX and Linux Go module statements; Apps/Relay are overlapping breakouts.

| Scope | Statements | Branches | Functions | Lines |
| --- | ---: | ---: | ---: | ---: |
| TypeScript / TSX | 60.01% | 81.34% | 82.96% | 60.01% |
| Relay | 89.36% | 82.80% | 96.24% | 89.36% |
| Apps core | 99.49% | 95.51% | 98.65% | 99.49% |
| Go Agent | 78.94% | — | — | — |
| Go Execution Core | 93.26% | — | — | — |

The combined value weights covered/total statements in three disjoint scopes: TypeScript/TSX, Go Agent, and Go Execution Core. Apps and Relay are shown separately and are not added again. Go values are measured on Linux, matching the coverage job.

The report is published only from completed master push runs with successful coverage-producing jobs. A failed or incomplete measurement leaves the previous measured badge in place; the source SHA/time above identify its age. The CI status badge separately shows overall CI health.

Apps already requires ≥90% for every metric and file; Go Execution Core requires ≥90% module statement coverage. Other scopes use explicit regression floors while tests are expanded toward 90%. No source exclusions are added by badge generation.
