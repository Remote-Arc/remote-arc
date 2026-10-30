# Latest measured coverage

Source: [c2ee2b5](https://github.com/Remote-Arc/remote-arc/commit/c2ee2b51f8dba2555e2c49268c726a20fd3246d9) · [CI run](https://github.com/Remote-Arc/remote-arc/actions/runs/41038549653) · 2026-10-30T10:23:48Z

**Combined statement coverage: 56.79% (32680/57548). Target: ≥90%.**

Production TypeScript/TSX and Linux Go module statements; Apps/Relay are overlapping breakouts.

| Scope | Statements | Branches | Functions | Lines |
| --- | ---: | ---: | ---: | ---: |
| TypeScript / TSX | 51.83% | 81.06% | 76.55% | 51.83% |
| Relay | 65.96% | 82.51% | 84.52% | 65.96% |
| Apps core | 99.49% | 95.51% | 98.65% | 99.49% |
| Go Agent | 78.75% | — | — | — |
| Go Execution Core | 93.26% | — | — | — |

The combined value weights covered/total statements in three disjoint scopes: TypeScript/TSX, Go Agent, and Go Execution Core. Apps and Relay are shown separately and are not added again. Go values are measured on Linux, matching the coverage job.

The report is published only from completed master push runs with successful coverage-producing jobs. A failed or incomplete measurement leaves the previous measured badge in place; the source SHA/time above identify its age. The CI status badge separately shows overall CI health.

Apps already requires ≥90% for every metric and file; Go Execution Core requires ≥90% module statement coverage. Other scopes use explicit regression floors while tests are expanded toward 90%. No source exclusions are added by badge generation.
