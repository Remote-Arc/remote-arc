# Latest measured coverage

Source: [aa052c4](https://github.com/Remote-Arc/remote-arc/commit/aa052c40b14d2bc8a7c84079321eccdaac589278) · [CI run](https://github.com/Remote-Arc/remote-arc/actions/runs/41602628985) · 2026-11-03T08:37:48Z

**Combined statement coverage: 65.43% (39616/60551). Target: ≥90%.**

Production TypeScript/TSX and Linux Go module statements; Apps/Relay are overlapping breakouts.

| Scope | Statements | Branches | Functions | Lines |
| --- | ---: | ---: | ---: | ---: |
| TypeScript / TSX | 60.49% | 82.10% | 83.42% | 60.49% |
| Relay | 90.56% | 83.78% | 96.86% | 90.56% |
| Apps core | 100.00% | 95.16% | 100.00% | 100.00% |
| Go Agent | 90.28% | — | — | — |
| Go Execution Core | 93.40% | — | — | — |

The combined value weights covered/total statements in three disjoint scopes: TypeScript/TSX, Go Agent, and Go Execution Core. Apps and Relay are shown separately and are not added again. Go values are measured on Linux, matching the coverage job.

The report is published only from completed master push runs with successful coverage-producing jobs. A failed or incomplete measurement leaves the previous measured badge in place; the source SHA/time above identify its age. The CI status badge separately shows overall CI health.

Apps already requires ≥90% for every metric and file; Go Execution Core requires ≥90% module statement coverage. Other scopes use explicit regression floors while tests are expanded toward 90%. No source exclusions are added by badge generation.
