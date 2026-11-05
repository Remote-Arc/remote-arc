# Latest measured coverage

Source: [e630a2c](https://github.com/Remote-Arc/remote-arc/commit/e630a2c0ebd7bb4e6d2ebcdffbd5ea3b697542e5) · [CI run](https://github.com/Remote-Arc/remote-arc/actions/runs/41962660602) · 2026-11-05T03:49:11Z

**Combined statement coverage: 56.86% (75551/132873). Target: ≥90%.**

Production TypeScript/TSX and Linux Go module statements; Apps/Relay are overlapping breakouts.

| Scope | Statements | Branches | Functions | Lines |
| --- | ---: | ---: | ---: | ---: |
| TypeScript / TSX | 54.14% | 82.01% | 83.29% | 54.14% |
| Relay | 92.88% | 84.07% | 97.01% | 92.88% |
| Apps core | 99.45% | 95.23% | 100.00% | 99.45% |
| Go Agent | 90.28% | — | — | — |
| Go Execution Core | 93.40% | — | — | — |

The combined value weights covered/total statements in three disjoint scopes: TypeScript/TSX, Go Agent, and Go Execution Core. Apps and Relay are shown separately and are not added again. Go values are measured on Linux, matching the coverage job.

The report is published only from completed master push runs with successful coverage-producing jobs. A failed or incomplete measurement leaves the previous measured badge in place; the source SHA/time above identify its age. The CI status badge separately shows overall CI health.

Apps already requires ≥90% for every metric and file; Go Execution Core requires ≥90% module statement coverage. Other scopes use explicit regression floors while tests are expanded toward 90%. No source exclusions are added by badge generation.
