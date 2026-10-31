# Latest measured coverage

Source: [116eca7](https://github.com/Remote-Arc/remote-arc/commit/116eca7802d1419f32901f58232c29d5a1f7f78c) · [CI run](https://github.com/Remote-Arc/remote-arc/actions/runs/41187598646) · 2026-10-31T09:26:10Z

**Combined statement coverage: 63.69% (37300/58568). Target: ≥90%.**

Production TypeScript/TSX and Linux Go module statements; Apps/Relay are overlapping breakouts.

| Scope | Statements | Branches | Functions | Lines |
| --- | ---: | ---: | ---: | ---: |
| TypeScript / TSX | 60.01% | 81.46% | 82.89% | 60.01% |
| Relay | 89.42% | 82.92% | 96.28% | 89.42% |
| Apps core | 99.49% | 95.51% | 98.65% | 99.49% |
| Go Agent | 79.11% | — | — | — |
| Go Execution Core | 93.26% | — | — | — |

The combined value weights covered/total statements in three disjoint scopes: TypeScript/TSX, Go Agent, and Go Execution Core. Apps and Relay are shown separately and are not added again. Go values are measured on Linux, matching the coverage job.

The report is published only from completed master push runs with successful coverage-producing jobs. A failed or incomplete measurement leaves the previous measured badge in place; the source SHA/time above identify its age. The CI status badge separately shows overall CI health.

Apps already requires ≥90% for every metric and file; Go Execution Core requires ≥90% module statement coverage. Other scopes use explicit regression floors while tests are expanded toward 90%. No source exclusions are added by badge generation.
