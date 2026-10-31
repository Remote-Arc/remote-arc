# Latest measured coverage

Source: [d32fee6](https://github.com/Remote-Arc/remote-arc/commit/d32fee627a1df31f6c2c525fd86335a9147d63fc) · [CI run](https://github.com/Remote-Arc/remote-arc/actions/runs/41161993722) · 2026-10-31T03:22:18Z

**Combined statement coverage: 63.71% (37155/58316). Target: ≥90%.**

Production TypeScript/TSX and Linux Go module statements; Apps/Relay are overlapping breakouts.

| Scope | Statements | Branches | Functions | Lines |
| --- | ---: | ---: | ---: | ---: |
| TypeScript / TSX | 60.03% | 81.38% | 82.97% | 60.03% |
| Relay | 89.38% | 82.83% | 96.25% | 89.38% |
| Apps core | 99.49% | 95.51% | 98.65% | 99.49% |
| Go Agent | 79.05% | — | — | — |
| Go Execution Core | 93.26% | — | — | — |

The combined value weights covered/total statements in three disjoint scopes: TypeScript/TSX, Go Agent, and Go Execution Core. Apps and Relay are shown separately and are not added again. Go values are measured on Linux, matching the coverage job.

The report is published only from completed master push runs with successful coverage-producing jobs. A failed or incomplete measurement leaves the previous measured badge in place; the source SHA/time above identify its age. The CI status badge separately shows overall CI health.

Apps already requires ≥90% for every metric and file; Go Execution Core requires ≥90% module statement coverage. Other scopes use explicit regression floors while tests are expanded toward 90%. No source exclusions are added by badge generation.
