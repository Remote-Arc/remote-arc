# Latest measured coverage

Source: [34e3bba](https://github.com/Remote-Arc/remote-arc/commit/34e3bbacae983b5d967ba85e60bb6cb15d76cff6) · [CI run](https://github.com/Remote-Arc/remote-arc/actions/runs/41001142523) · 2026-10-30T04:20:51Z

**Combined statement coverage: 55.69% (34594/62122). Target: ≥90%.**

Production TypeScript/TSX and Linux Go module statements; Apps/Relay are overlapping breakouts.

| Scope | Statements | Branches | Functions | Lines |
| --- | ---: | ---: | ---: | ---: |
| TypeScript / TSX | 50.99% | 81.33% | 77.28% | 50.99% |
| Relay | 63.76% | 82.61% | 83.35% | 63.76% |
| Apps core | 99.49% | 95.51% | 98.65% | 99.49% |
| Go Agent | 78.59% | — | — | — |
| Go Execution Core | 93.33% | — | — | — |

The combined value weights covered/total statements in three disjoint scopes: TypeScript/TSX, Go Agent, and Go Execution Core. Apps and Relay are shown separately and are not added again. Go values are measured on Linux, matching the coverage job.

The report is published only from completed master push runs with successful coverage-producing jobs. A failed or incomplete measurement leaves the previous measured badge in place; the source SHA/time above identify its age. The CI status badge separately shows overall CI health.

Apps already requires ≥90% for every metric and file; Go Execution Core requires ≥90% module statement coverage. Other scopes use explicit regression floors while tests are expanded toward 90%. No source exclusions are added by badge generation.
