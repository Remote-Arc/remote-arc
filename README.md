# Latest measured coverage

Source: [c4bc77f](https://github.com/Remote-Arc/remote-arc/commit/c4bc77f1d6892a2e4f2bf6f3237857facb33ccac) · [CI run](https://github.com/Remote-Arc/remote-arc/actions/runs/40998299997) · 2026-10-30T03:46:41Z

**Combined statement coverage: 54.41% (32793/60267). Target: ≥90%.**

Production TypeScript/TSX and Linux Go module statements; Apps/Relay are overlapping breakouts.

| Scope | Statements | Branches | Functions | Lines |
| --- | ---: | ---: | ---: | ---: |
| TypeScript / TSX | 50.25% | 80.66% | 76.73% | 50.25% |
| Relay | 63.76% | 82.62% | 83.35% | 63.76% |
| Apps core | 99.49% | 95.51% | 98.65% | 99.49% |
| Go Agent | 78.62% | — | — | — |
| Go Execution Core | 90.88% | — | — | — |

The combined value weights covered/total statements in three disjoint scopes: TypeScript/TSX, Go Agent, and Go Execution Core. Apps and Relay are shown separately and are not added again. Go values are measured on Linux, matching the coverage job.

The report is published only from completed master push runs with successful coverage-producing jobs. A failed or incomplete measurement leaves the previous measured badge in place; the source SHA/time above identify its age. The CI status badge separately shows overall CI health.

Apps already requires ≥90% for every metric and file; Go Execution Core requires ≥90% module statement coverage. Other scopes use explicit regression floors while tests are expanded toward 90%. No source exclusions are added by badge generation.
