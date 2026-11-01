# Latest measured coverage

Source: [b6b9104](https://github.com/Remote-Arc/remote-arc/commit/b6b9104f09ff0d58948c1312f5577942d36d7559) · [CI run](https://github.com/Remote-Arc/remote-arc/actions/runs/41341600380) · 2026-11-01T19:40:35Z

**Combined statement coverage: 65.16% (38882/59675). Target: ≥90%.**

Production TypeScript/TSX and Linux Go module statements; Apps/Relay are overlapping breakouts.

| Scope | Statements | Branches | Functions | Lines |
| --- | ---: | ---: | ---: | ---: |
| TypeScript / TSX | 60.08% | 81.86% | 83.02% | 60.08% |
| Relay | 90.29% | 83.46% | 96.49% | 90.29% |
| Apps core | 99.49% | 95.51% | 98.65% | 99.49% |
| Go Agent | 90.34% | — | — | — |
| Go Execution Core | 93.44% | — | — | — |

The combined value weights covered/total statements in three disjoint scopes: TypeScript/TSX, Go Agent, and Go Execution Core. Apps and Relay are shown separately and are not added again. Go values are measured on Linux, matching the coverage job.

The report is published only from completed master push runs with successful coverage-producing jobs. A failed or incomplete measurement leaves the previous measured badge in place; the source SHA/time above identify its age. The CI status badge separately shows overall CI health.

Apps already requires ≥90% for every metric and file; Go Execution Core requires ≥90% module statement coverage. Other scopes use explicit regression floors while tests are expanded toward 90%. No source exclusions are added by badge generation.
