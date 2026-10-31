# Latest measured coverage

Source: [a5adcd8](https://github.com/Remote-Arc/remote-arc/commit/a5adcd869466fe2b499636c7abf452b384f391bf) · [CI run](https://github.com/Remote-Arc/remote-arc/actions/runs/41164681181) · 2026-10-31T03:43:36Z

**Combined statement coverage: 63.75% (37204/58355). Target: ≥90%.**

Production TypeScript/TSX and Linux Go module statements; Apps/Relay are overlapping breakouts.

| Scope | Statements | Branches | Functions | Lines |
| --- | ---: | ---: | ---: | ---: |
| TypeScript / TSX | 60.06% | 81.42% | 83.01% | 60.06% |
| Relay | 89.39% | 82.85% | 96.26% | 89.39% |
| Apps core | 99.49% | 95.51% | 98.65% | 99.49% |
| Go Agent | 79.18% | — | — | — |
| Go Execution Core | 93.26% | — | — | — |

The combined value weights covered/total statements in three disjoint scopes: TypeScript/TSX, Go Agent, and Go Execution Core. Apps and Relay are shown separately and are not added again. Go values are measured on Linux, matching the coverage job.

The report is published only from completed master push runs with successful coverage-producing jobs. A failed or incomplete measurement leaves the previous measured badge in place; the source SHA/time above identify its age. The CI status badge separately shows overall CI health.

Apps already requires ≥90% for every metric and file; Go Execution Core requires ≥90% module statement coverage. Other scopes use explicit regression floors while tests are expanded toward 90%. No source exclusions are added by badge generation.
