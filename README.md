# Latest measured coverage

Source: [f8cee68](https://github.com/Remote-Arc/remote-arc/commit/f8cee683f6d0582185872a6ec8eba78331ac457d) · [CI run](https://github.com/Remote-Arc/remote-arc/actions/runs/42001939687) · 2026-11-05T09:37:06Z

**Combined statement coverage: 57.11% (76593/134104). Target: ≥90%.**

Production TypeScript/TSX and Linux Go module statements; Apps/Relay are overlapping breakouts.

| Scope | Statements | Branches | Functions | Lines |
| --- | ---: | ---: | ---: | ---: |
| TypeScript / TSX | 54.44% | 82.05% | 83.00% | 54.44% |
| Relay | 92.93% | 84.20% | 97.03% | 92.93% |
| Apps core | 99.45% | 95.23% | 100.00% | 99.45% |
| Go Agent | 90.34% | — | — | — |
| Go Execution Core | 93.40% | — | — | — |

The combined value weights covered/total statements in three disjoint scopes: TypeScript/TSX, Go Agent, and Go Execution Core. Apps and Relay are shown separately and are not added again. Go values are measured on Linux, matching the coverage job.

The report is published only from completed master push runs with successful coverage-producing jobs. A failed or incomplete measurement leaves the previous measured badge in place; the source SHA/time above identify its age. The CI status badge separately shows overall CI health.

Apps already requires ≥90% for every metric and file; Go Execution Core requires ≥90% module statement coverage. Other scopes use explicit regression floors while tests are expanded toward 90%. No source exclusions are added by badge generation.
