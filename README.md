# Latest measured coverage

Source: [f5248cd](https://github.com/Remote-Arc/remote-arc/commit/f5248cd4ded40ce493aa28b9d33a386675f1bdfc) · [CI run](https://github.com/Remote-Arc/remote-arc/actions/runs/41250139228) · 2026-10-31T23:40:17Z

**Combined statement coverage: 65.14% (38153/58572). Target: ≥90%.**

Production TypeScript/TSX and Linux Go module statements; Apps/Relay are overlapping breakouts.

| Scope | Statements | Branches | Functions | Lines |
| --- | ---: | ---: | ---: | ---: |
| TypeScript / TSX | 60.02% | 81.55% | 82.89% | 60.02% |
| Relay | 90.14% | 83.14% | 96.58% | 90.14% |
| Apps core | 99.49% | 95.51% | 98.65% | 99.49% |
| Go Agent | 90.36% | — | — | — |
| Go Execution Core | 93.32% | — | — | — |

The combined value weights covered/total statements in three disjoint scopes: TypeScript/TSX, Go Agent, and Go Execution Core. Apps and Relay are shown separately and are not added again. Go values are measured on Linux, matching the coverage job.

The report is published only from completed master push runs with successful coverage-producing jobs. A failed or incomplete measurement leaves the previous measured badge in place; the source SHA/time above identify its age. The CI status badge separately shows overall CI health.

Apps already requires ≥90% for every metric and file; Go Execution Core requires ≥90% module statement coverage. Other scopes use explicit regression floors while tests are expanded toward 90%. No source exclusions are added by badge generation.
