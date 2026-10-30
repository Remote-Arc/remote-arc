# Latest measured coverage

Source: [55f3e3a](https://github.com/Remote-Arc/remote-arc/commit/55f3e3a7ad48f78f4d8fcae41f7b01c41d5d1340) · [CI run](https://github.com/Remote-Arc/remote-arc/actions/runs/41016076091) · 2026-10-30T07:00:27Z

**Combined statement coverage: 55.68% (34760/62431). Target: ≥90%.**

Production TypeScript/TSX and Linux Go module statements; Apps/Relay are overlapping breakouts.

| Scope | Statements | Branches | Functions | Lines |
| --- | ---: | ---: | ---: | ---: |
| TypeScript / TSX | 50.98% | 81.27% | 76.64% | 50.98% |
| Relay | 63.85% | 82.60% | 83.26% | 63.85% |
| Apps core | 99.49% | 95.51% | 98.65% | 99.49% |
| Go Agent | 78.80% | — | — | — |
| Go Execution Core | 93.33% | — | — | — |

The combined value weights covered/total statements in three disjoint scopes: TypeScript/TSX, Go Agent, and Go Execution Core. Apps and Relay are shown separately and are not added again. Go values are measured on Linux, matching the coverage job.

The report is published only from completed master push runs with successful coverage-producing jobs. A failed or incomplete measurement leaves the previous measured badge in place; the source SHA/time above identify its age. The CI status badge separately shows overall CI health.

Apps already requires ≥90% for every metric and file; Go Execution Core requires ≥90% module statement coverage. Other scopes use explicit regression floors while tests are expanded toward 90%. No source exclusions are added by badge generation.
