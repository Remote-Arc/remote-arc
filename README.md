# Latest measured coverage

Source: [00cae1d](https://github.com/Remote-Arc/remote-arc/commit/00cae1d0224eabe0bf86818b79487a06391ec3d2) · [CI run](https://github.com/Remote-Arc/remote-arc/actions/runs/41173880751) · 2026-10-31T06:01:42Z

**Combined statement coverage: 63.78% (37232/58378). Target: ≥90%.**

Production TypeScript/TSX and Linux Go module statements; Apps/Relay are overlapping breakouts.

| Scope | Statements | Branches | Functions | Lines |
| --- | ---: | ---: | ---: | ---: |
| TypeScript / TSX | 60.12% | 81.44% | 83.07% | 60.12% |
| Relay | 89.39% | 82.87% | 96.26% | 89.39% |
| Apps core | 99.49% | 95.51% | 98.65% | 99.49% |
| Go Agent | 79.01% | — | — | — |
| Go Execution Core | 93.26% | — | — | — |

The combined value weights covered/total statements in three disjoint scopes: TypeScript/TSX, Go Agent, and Go Execution Core. Apps and Relay are shown separately and are not added again. Go values are measured on Linux, matching the coverage job.

The report is published only from completed master push runs with successful coverage-producing jobs. A failed or incomplete measurement leaves the previous measured badge in place; the source SHA/time above identify its age. The CI status badge separately shows overall CI health.

Apps already requires ≥90% for every metric and file; Go Execution Core requires ≥90% module statement coverage. Other scopes use explicit regression floors while tests are expanded toward 90%. No source exclusions are added by badge generation.
