# Latest measured coverage

Source: [5ee37ee](https://github.com/Remote-Arc/remote-arc/commit/5ee37ee278881a1b69816c20f7981fc8b6203956) · [CI run](https://github.com/Remote-Arc/remote-arc/actions/runs/41269201597) · 2026-11-01T03:40:02Z

**Combined statement coverage: 65.21% (38314/58758). Target: ≥90%.**

Production TypeScript/TSX and Linux Go module statements; Apps/Relay are overlapping breakouts.

| Scope | Statements | Branches | Functions | Lines |
| --- | ---: | ---: | ---: | ---: |
| TypeScript / TSX | 60.11% | 81.89% | 83.06% | 60.11% |
| Relay | 90.19% | 83.51% | 96.63% | 90.19% |
| Apps core | 99.49% | 95.51% | 98.65% | 99.49% |
| Go Agent | 90.43% | — | — | — |
| Go Execution Core | 93.32% | — | — | — |

The combined value weights covered/total statements in three disjoint scopes: TypeScript/TSX, Go Agent, and Go Execution Core. Apps and Relay are shown separately and are not added again. Go values are measured on Linux, matching the coverage job.

The report is published only from completed master push runs with successful coverage-producing jobs. A failed or incomplete measurement leaves the previous measured badge in place; the source SHA/time above identify its age. The CI status badge separately shows overall CI health.

Apps already requires ≥90% for every metric and file; Go Execution Core requires ≥90% module statement coverage. Other scopes use explicit regression floors while tests are expanded toward 90%. No source exclusions are added by badge generation.
