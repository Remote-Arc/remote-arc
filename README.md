# Latest measured coverage

Source: [cf817cc](https://github.com/Remote-Arc/remote-arc/commit/cf817cc70f21f1435f1c508647c3d03f64c34fa5) · [CI run](https://github.com/Remote-Arc/remote-arc/actions/runs/41186080293) · 2026-10-31T09:01:28Z

**Combined statement coverage: 63.67% (37286/58557). Target: ≥90%.**

Production TypeScript/TSX and Linux Go module statements; Apps/Relay are overlapping breakouts.

| Scope | Statements | Branches | Functions | Lines |
| --- | ---: | ---: | ---: | ---: |
| TypeScript / TSX | 60.02% | 81.47% | 83.01% | 60.02% |
| Relay | 89.42% | 82.91% | 96.28% | 89.42% |
| Apps core | 99.49% | 95.51% | 98.65% | 99.49% |
| Go Agent | 78.94% | — | — | — |
| Go Execution Core | 93.26% | — | — | — |

The combined value weights covered/total statements in three disjoint scopes: TypeScript/TSX, Go Agent, and Go Execution Core. Apps and Relay are shown separately and are not added again. Go values are measured on Linux, matching the coverage job.

The report is published only from completed master push runs with successful coverage-producing jobs. A failed or incomplete measurement leaves the previous measured badge in place; the source SHA/time above identify its age. The CI status badge separately shows overall CI health.

Apps already requires ≥90% for every metric and file; Go Execution Core requires ≥90% module statement coverage. Other scopes use explicit regression floors while tests are expanded toward 90%. No source exclusions are added by badge generation.
