# Latest measured coverage

Source: [5532592](https://github.com/Remote-Arc/remote-arc/commit/5532592b7045a8e47cb600f249319311c28ab093) · [CI run](https://github.com/Remote-Arc/remote-arc/actions/runs/41365070792) · 2026-11-02T00:19:41Z

**Combined statement coverage: 65.19% (38942/59733). Target: ≥90%.**

Production TypeScript/TSX and Linux Go module statements; Apps/Relay are overlapping breakouts.

| Scope | Statements | Branches | Functions | Lines |
| --- | ---: | ---: | ---: | ---: |
| TypeScript / TSX | 60.13% | 81.91% | 83.04% | 60.13% |
| Relay | 90.31% | 83.50% | 96.49% | 90.31% |
| Apps core | 99.49% | 95.51% | 98.65% | 99.49% |
| Go Agent | 90.38% | — | — | — |
| Go Execution Core | 93.40% | — | — | — |

The combined value weights covered/total statements in three disjoint scopes: TypeScript/TSX, Go Agent, and Go Execution Core. Apps and Relay are shown separately and are not added again. Go values are measured on Linux, matching the coverage job.

The report is published only from completed master push runs with successful coverage-producing jobs. A failed or incomplete measurement leaves the previous measured badge in place; the source SHA/time above identify its age. The CI status badge separately shows overall CI health.

Apps already requires ≥90% for every metric and file; Go Execution Core requires ≥90% module statement coverage. Other scopes use explicit regression floors while tests are expanded toward 90%. No source exclusions are added by badge generation.
