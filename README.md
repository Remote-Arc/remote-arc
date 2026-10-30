# Latest measured coverage

Source: [8090af4](https://github.com/Remote-Arc/remote-arc/commit/8090af4a15d1084153ac08d4d5b2b030edda6832) · [CI run](https://github.com/Remote-Arc/remote-arc/actions/runs/41029688989) · 2026-10-30T09:07:58Z

**Combined statement coverage: 55.80% (32063/57458). Target: ≥90%.**

Production TypeScript/TSX and Linux Go module statements; Apps/Relay are overlapping breakouts.

| Scope | Statements | Branches | Functions | Lines |
| --- | ---: | ---: | ---: | ---: |
| TypeScript / TSX | 50.66% | 81.12% | 75.65% | 50.66% |
| Relay | 63.84% | 82.61% | 83.26% | 63.84% |
| Apps core | 99.49% | 95.51% | 98.65% | 99.49% |
| Go Agent | 78.67% | — | — | — |
| Go Execution Core | 93.26% | — | — | — |

The combined value weights covered/total statements in three disjoint scopes: TypeScript/TSX, Go Agent, and Go Execution Core. Apps and Relay are shown separately and are not added again. Go values are measured on Linux, matching the coverage job.

The report is published only from completed master push runs with successful coverage-producing jobs. A failed or incomplete measurement leaves the previous measured badge in place; the source SHA/time above identify its age. The CI status badge separately shows overall CI health.

Apps already requires ≥90% for every metric and file; Go Execution Core requires ≥90% module statement coverage. Other scopes use explicit regression floors while tests are expanded toward 90%. No source exclusions are added by badge generation.
