# Latest measured coverage

Source: [f324b70](https://github.com/Remote-Arc/remote-arc/commit/f324b708fe53cc981d82588e26e9bf6c8d4952d0) · [CI run](https://github.com/Remote-Arc/remote-arc/actions/runs/41143107558) · 2026-10-30T23:28:59Z

**Combined statement coverage: 63.39% (36667/57843). Target: ≥90%.**

Production TypeScript/TSX and Linux Go module statements; Apps/Relay are overlapping breakouts.

| Scope | Statements | Branches | Functions | Lines |
| --- | ---: | ---: | ---: | ---: |
| TypeScript / TSX | 59.72% | 81.21% | 82.74% | 59.72% |
| Relay | 89.07% | 82.66% | 96.10% | 89.07% |
| Apps core | 99.49% | 95.51% | 98.65% | 99.49% |
| Go Agent | 78.84% | — | — | — |
| Go Execution Core | 93.26% | — | — | — |

The combined value weights covered/total statements in three disjoint scopes: TypeScript/TSX, Go Agent, and Go Execution Core. Apps and Relay are shown separately and are not added again. Go values are measured on Linux, matching the coverage job.

The report is published only from completed master push runs with successful coverage-producing jobs. A failed or incomplete measurement leaves the previous measured badge in place; the source SHA/time above identify its age. The CI status badge separately shows overall CI health.

Apps already requires ≥90% for every metric and file; Go Execution Core requires ≥90% module statement coverage. Other scopes use explicit regression floors while tests are expanded toward 90%. No source exclusions are added by badge generation.
