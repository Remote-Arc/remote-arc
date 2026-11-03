# Latest measured coverage

Source: [90fc5a0](https://github.com/Remote-Arc/remote-arc/commit/90fc5a09f81cdd7404673bf06b0b6c39be1fc462) · [CI run](https://github.com/Remote-Arc/remote-arc/actions/runs/41721092543) · 2026-11-03T21:36:43Z

**Combined statement coverage: 66.80% (42071/62982). Target: ≥90%.**

Production TypeScript/TSX and Linux Go module statements; Apps/Relay are overlapping breakouts.

| Scope | Statements | Branches | Functions | Lines |
| --- | ---: | ---: | ---: | ---: |
| TypeScript / TSX | 62.32% | 81.90% | 83.18% | 62.32% |
| Relay | 91.23% | 83.98% | 96.90% | 91.23% |
| Apps core | 100.00% | 95.16% | 100.00% | 100.00% |
| Go Agent | 90.38% | — | — | — |
| Go Execution Core | 93.40% | — | — | — |

The combined value weights covered/total statements in three disjoint scopes: TypeScript/TSX, Go Agent, and Go Execution Core. Apps and Relay are shown separately and are not added again. Go values are measured on Linux, matching the coverage job.

The report is published only from completed master push runs with successful coverage-producing jobs. A failed or incomplete measurement leaves the previous measured badge in place; the source SHA/time above identify its age. The CI status badge separately shows overall CI health.

Apps already requires ≥90% for every metric and file; Go Execution Core requires ≥90% module statement coverage. Other scopes use explicit regression floors while tests are expanded toward 90%. No source exclusions are added by badge generation.
