# Latest measured coverage

Source: [edc4bbb](https://github.com/Remote-Arc/remote-arc/commit/edc4bbb57f175261cad5fdf1f17f71119364a328) · [CI run](https://github.com/Remote-Arc/remote-arc/actions/runs/41151012496) · 2026-10-31T00:53:38Z

**Combined statement coverage: 63.63% (37029/58194). Target: ≥90%.**

Production TypeScript/TSX and Linux Go module statements; Apps/Relay are overlapping breakouts.

| Scope | Statements | Branches | Functions | Lines |
| --- | ---: | ---: | ---: | ---: |
| TypeScript / TSX | 60.01% | 81.35% | 82.96% | 60.01% |
| Relay | 89.36% | 82.79% | 96.24% | 89.36% |
| Apps core | 99.49% | 95.51% | 98.65% | 99.49% |
| Go Agent | 78.74% | — | — | — |
| Go Execution Core | 93.26% | — | — | — |

The combined value weights covered/total statements in three disjoint scopes: TypeScript/TSX, Go Agent, and Go Execution Core. Apps and Relay are shown separately and are not added again. Go values are measured on Linux, matching the coverage job.

The report is published only from completed master push runs with successful coverage-producing jobs. A failed or incomplete measurement leaves the previous measured badge in place; the source SHA/time above identify its age. The CI status badge separately shows overall CI health.

Apps already requires ≥90% for every metric and file; Go Execution Core requires ≥90% module statement coverage. Other scopes use explicit regression floors while tests are expanded toward 90%. No source exclusions are added by badge generation.
