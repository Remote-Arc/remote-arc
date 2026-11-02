# Latest measured coverage

Source: [e6fa17e](https://github.com/Remote-Arc/remote-arc/commit/e6fa17ed354fd9ec15fa477e91f84c7188dde7a0) · [CI run](https://github.com/Remote-Arc/remote-arc/actions/runs/41530021273) · 2026-11-02T22:00:14Z

**Combined statement coverage: 65.41% (39540/60449). Target: ≥90%.**

Production TypeScript/TSX and Linux Go module statements; Apps/Relay are overlapping breakouts.

| Scope | Statements | Branches | Functions | Lines |
| --- | ---: | ---: | ---: | ---: |
| TypeScript / TSX | 60.44% | 82.05% | 83.45% | 60.44% |
| Relay | 90.54% | 83.73% | 96.86% | 90.54% |
| Apps core | 100.00% | 95.16% | 100.00% | 100.00% |
| Go Agent | 90.38% | — | — | — |
| Go Execution Core | 93.44% | — | — | — |

The combined value weights covered/total statements in three disjoint scopes: TypeScript/TSX, Go Agent, and Go Execution Core. Apps and Relay are shown separately and are not added again. Go values are measured on Linux, matching the coverage job.

The report is published only from completed master push runs with successful coverage-producing jobs. A failed or incomplete measurement leaves the previous measured badge in place; the source SHA/time above identify its age. The CI status badge separately shows overall CI health.

Apps already requires ≥90% for every metric and file; Go Execution Core requires ≥90% module statement coverage. Other scopes use explicit regression floors while tests are expanded toward 90%. No source exclusions are added by badge generation.
