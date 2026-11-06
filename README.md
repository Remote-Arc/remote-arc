# Latest measured coverage

Source: [7c1fde2](https://github.com/Remote-Arc/remote-arc/commit/7c1fde2efcad4a6d0c98c9810c91b9a612e07ea6) · [CI run](https://github.com/Remote-Arc/remote-arc/actions/runs/42311860685) · 2026-11-06T23:46:19Z

**Combined statement coverage: 59.68% (77810/130374). Target: ≥90%.**

Production TypeScript/TSX and Linux Go module statements; Apps/Relay are overlapping breakouts.

| Scope | Statements | Branches | Functions | Lines |
| --- | ---: | ---: | ---: | ---: |
| TypeScript / TSX | 57.13% | 82.22% | 82.79% | 57.13% |
| Relay | 93.08% | 84.38% | 97.11% | 93.08% |
| Apps core | 99.45% | 95.25% | 100.00% | 99.45% |
| Go Agent | 90.34% | — | — | — |
| Go Execution Core | 93.40% | — | — | — |

The combined value weights covered/total statements in three disjoint scopes: TypeScript/TSX, Go Agent, and Go Execution Core. Apps and Relay are shown separately and are not added again. Go values are measured on Linux, matching the coverage job.

The report is published only from completed master push runs with successful coverage-producing jobs. A failed or incomplete measurement leaves the previous measured badge in place; the source SHA/time above identify its age. The CI status badge separately shows overall CI health.

Apps already requires ≥90% for every metric and file; Go Execution Core requires ≥90% module statement coverage. Other scopes use explicit regression floors while tests are expanded toward 90%. No source exclusions are added by badge generation.
