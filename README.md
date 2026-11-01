# Latest measured coverage

Source: [25dcdf3](https://github.com/Remote-Arc/remote-arc/commit/25dcdf3e6b45c6bc41b13ff2d81a10ca0319896d) · [CI run](https://github.com/Remote-Arc/remote-arc/actions/runs/41348593009) · 2026-11-01T21:02:59Z

**Combined statement coverage: 65.16% (38899/59694). Target: ≥90%.**

Production TypeScript/TSX and Linux Go module statements; Apps/Relay are overlapping breakouts.

| Scope | Statements | Branches | Functions | Lines |
| --- | ---: | ---: | ---: | ---: |
| TypeScript / TSX | 60.10% | 81.87% | 83.03% | 60.10% |
| Relay | 90.30% | 83.45% | 96.49% | 90.30% |
| Apps core | 99.49% | 95.51% | 98.65% | 99.49% |
| Go Agent | 90.32% | — | — | — |
| Go Execution Core | 93.40% | — | — | — |

The combined value weights covered/total statements in three disjoint scopes: TypeScript/TSX, Go Agent, and Go Execution Core. Apps and Relay are shown separately and are not added again. Go values are measured on Linux, matching the coverage job.

The report is published only from completed master push runs with successful coverage-producing jobs. A failed or incomplete measurement leaves the previous measured badge in place; the source SHA/time above identify its age. The CI status badge separately shows overall CI health.

Apps already requires ≥90% for every metric and file; Go Execution Core requires ≥90% module statement coverage. Other scopes use explicit regression floors while tests are expanded toward 90%. No source exclusions are added by badge generation.
