# Latest measured coverage

Source: [c9023cc](https://github.com/Remote-Arc/remote-arc/commit/c9023cc59cae64c64ab052125342331d2d27e1d7) · [CI run](https://github.com/Remote-Arc/remote-arc/actions/runs/41013110904) · 2026-10-30T06:40:18Z

**Combined statement coverage: 55.57% (34651/62350). Target: ≥90%.**

Production TypeScript/TSX and Linux Go module statements; Apps/Relay are overlapping breakouts.

| Scope | Statements | Branches | Functions | Lines |
| --- | ---: | ---: | ---: | ---: |
| TypeScript / TSX | 50.88% | 81.27% | 76.53% | 50.88% |
| Relay | 63.71% | 82.61% | 83.14% | 63.71% |
| Apps core | 99.49% | 95.51% | 98.65% | 99.49% |
| Go Agent | 78.55% | — | — | — |
| Go Execution Core | 93.33% | — | — | — |

The combined value weights covered/total statements in three disjoint scopes: TypeScript/TSX, Go Agent, and Go Execution Core. Apps and Relay are shown separately and are not added again. Go values are measured on Linux, matching the coverage job.

The report is published only from completed master push runs with successful coverage-producing jobs. A failed or incomplete measurement leaves the previous measured badge in place; the source SHA/time above identify its age. The CI status badge separately shows overall CI health.

Apps already requires ≥90% for every metric and file; Go Execution Core requires ≥90% module statement coverage. Other scopes use explicit regression floors while tests are expanded toward 90%. No source exclusions are added by badge generation.
