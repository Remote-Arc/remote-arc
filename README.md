# Latest measured coverage

Source: [95b46cb](https://github.com/Remote-Arc/remote-arc/commit/95b46cb61475ba1e6e39202c4000939fa1c86bec) · [CI run](https://github.com/Remote-Arc/remote-arc/actions/runs/42354634282) · 2026-11-07T08:38:56Z

**Combined statement coverage: 59.91% (78431/130913). Target: ≥90%.**

Production TypeScript/TSX and Linux Go module statements; Apps/Relay are overlapping breakouts.

| Scope | Statements | Branches | Functions | Lines |
| --- | ---: | ---: | ---: | ---: |
| TypeScript / TSX | 57.39% | 82.26% | 83.11% | 57.39% |
| Relay | 93.20% | 84.41% | 97.22% | 93.20% |
| Apps core | 99.45% | 95.25% | 100.00% | 99.45% |
| Go Agent | 90.33% | — | — | — |
| Go Execution Core | 93.40% | — | — | — |

The combined value weights covered/total statements in three disjoint scopes: TypeScript/TSX, Go Agent, and Go Execution Core. Apps and Relay are shown separately and are not added again. Go values are measured on Linux, matching the coverage job.

The report is published only from completed master push runs with successful coverage-producing jobs. A failed or incomplete measurement leaves the previous measured badge in place; the source SHA/time above identify its age. The CI status badge separately shows overall CI health.

Apps already requires ≥90% for every metric and file; Go Execution Core requires ≥90% module statement coverage. Other scopes use explicit regression floors while tests are expanded toward 90%. No source exclusions are added by badge generation.
