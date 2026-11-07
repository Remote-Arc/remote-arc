# Latest measured coverage

Source: [ad42f80](https://github.com/Remote-Arc/remote-arc/commit/ad42f80c3368318389735514d54f9b4cab2c4ca5) · [CI run](https://github.com/Remote-Arc/remote-arc/actions/runs/42325038078) · 2026-11-07T01:50:21Z

**Combined statement coverage: 59.71% (77946/130538). Target: ≥90%.**

Production TypeScript/TSX and Linux Go module statements; Apps/Relay are overlapping breakouts.

| Scope | Statements | Branches | Functions | Lines |
| --- | ---: | ---: | ---: | ---: |
| TypeScript / TSX | 57.16% | 82.23% | 82.81% | 57.16% |
| Relay | 93.10% | 84.38% | 97.11% | 93.10% |
| Apps core | 99.45% | 95.25% | 100.00% | 99.45% |
| Go Agent | 90.41% | — | — | — |
| Go Execution Core | 93.40% | — | — | — |

The combined value weights covered/total statements in three disjoint scopes: TypeScript/TSX, Go Agent, and Go Execution Core. Apps and Relay are shown separately and are not added again. Go values are measured on Linux, matching the coverage job.

The report is published only from completed master push runs with successful coverage-producing jobs. A failed or incomplete measurement leaves the previous measured badge in place; the source SHA/time above identify its age. The CI status badge separately shows overall CI health.

Apps already requires ≥90% for every metric and file; Go Execution Core requires ≥90% module statement coverage. Other scopes use explicit regression floors while tests are expanded toward 90%. No source exclusions are added by badge generation.
