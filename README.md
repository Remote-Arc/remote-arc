# Latest measured coverage

Source: [43478ff](https://github.com/Remote-Arc/remote-arc/commit/43478ff35325728c2534702654a0a73fa0203af7) · [CI run](https://github.com/Remote-Arc/remote-arc/actions/runs/41277351337) · 2026-11-01T05:48:41Z

**Combined statement coverage: 65.22% (38703/59343). Target: ≥90%.**

Production TypeScript/TSX and Linux Go module statements; Apps/Relay are overlapping breakouts.

| Scope | Statements | Branches | Functions | Lines |
| --- | ---: | ---: | ---: | ---: |
| TypeScript / TSX | 60.12% | 81.94% | 83.14% | 60.12% |
| Relay | 90.27% | 83.56% | 96.66% | 90.27% |
| Apps core | 99.49% | 95.51% | 98.65% | 99.49% |
| Go Agent | 90.38% | — | — | — |
| Go Execution Core | 93.40% | — | — | — |

The combined value weights covered/total statements in three disjoint scopes: TypeScript/TSX, Go Agent, and Go Execution Core. Apps and Relay are shown separately and are not added again. Go values are measured on Linux, matching the coverage job.

The report is published only from completed master push runs with successful coverage-producing jobs. A failed or incomplete measurement leaves the previous measured badge in place; the source SHA/time above identify its age. The CI status badge separately shows overall CI health.

Apps already requires ≥90% for every metric and file; Go Execution Core requires ≥90% module statement coverage. Other scopes use explicit regression floors while tests are expanded toward 90%. No source exclusions are added by badge generation.
