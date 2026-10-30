# Latest measured coverage

Source: [d70dbf6](https://github.com/Remote-Arc/remote-arc/commit/d70dbf6a947c4da677a651d43dc979a6349597a3) · [CI run](https://github.com/Remote-Arc/remote-arc/actions/runs/41134608913) · 2026-10-30T22:08:19Z

**Combined statement coverage: 56.85% (32953/57965). Target: ≥90%.**

Production TypeScript/TSX and Linux Go module statements; Apps/Relay are overlapping breakouts.

| Scope | Statements | Branches | Functions | Lines |
| --- | ---: | ---: | ---: | ---: |
| TypeScript / TSX | 51.90% | 80.98% | 76.50% | 51.90% |
| Relay | 65.96% | 82.45% | 84.52% | 65.96% |
| Apps core | 99.49% | 95.51% | 98.65% | 99.49% |
| Go Agent | 78.91% | — | — | — |
| Go Execution Core | 93.26% | — | — | — |

The combined value weights covered/total statements in three disjoint scopes: TypeScript/TSX, Go Agent, and Go Execution Core. Apps and Relay are shown separately and are not added again. Go values are measured on Linux, matching the coverage job.

The report is published only from completed master push runs with successful coverage-producing jobs. A failed or incomplete measurement leaves the previous measured badge in place; the source SHA/time above identify its age. The CI status badge separately shows overall CI health.

Apps already requires ≥90% for every metric and file; Go Execution Core requires ≥90% module statement coverage. Other scopes use explicit regression floors while tests are expanded toward 90%. No source exclusions are added by badge generation.
