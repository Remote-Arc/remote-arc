# Latest measured coverage

Source: [0f04b99](https://github.com/Remote-Arc/remote-arc/commit/0f04b99c1ccb0e440e374b91f1c39b836a4fe4b5) · [CI run](https://github.com/Remote-Arc/remote-arc/actions/runs/41369661793) · 2026-11-02T01:10:21Z

**Combined statement coverage: 65.40% (39103/59786). Target: ≥90%.**

Production TypeScript/TSX and Linux Go module statements; Apps/Relay are overlapping breakouts.

| Scope | Statements | Branches | Functions | Lines |
| --- | ---: | ---: | ---: | ---: |
| TypeScript / TSX | 60.38% | 81.81% | 83.15% | 60.38% |
| Relay | 90.31% | 83.50% | 96.49% | 90.31% |
| Apps core | 99.49% | 95.51% | 98.65% | 99.49% |
| Go Agent | 90.40% | — | — | — |
| Go Execution Core | 93.40% | — | — | — |

The combined value weights covered/total statements in three disjoint scopes: TypeScript/TSX, Go Agent, and Go Execution Core. Apps and Relay are shown separately and are not added again. Go values are measured on Linux, matching the coverage job.

The report is published only from completed master push runs with successful coverage-producing jobs. A failed or incomplete measurement leaves the previous measured badge in place; the source SHA/time above identify its age. The CI status badge separately shows overall CI health.

Apps already requires ≥90% for every metric and file; Go Execution Core requires ≥90% module statement coverage. Other scopes use explicit regression floors while tests are expanded toward 90%. No source exclusions are added by badge generation.
