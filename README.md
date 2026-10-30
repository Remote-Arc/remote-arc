# Latest measured coverage

Source: [65015d1](https://github.com/Remote-Arc/remote-arc/commit/65015d1f96403caf1c0d580a7bf45ec3e28354ca) · [CI run](https://github.com/Remote-Arc/remote-arc/actions/runs/41003351133) · 2026-10-30T04:42:14Z

**Combined statement coverage: 55.70% (34661/62227). Target: ≥90%.**

Production TypeScript/TSX and Linux Go module statements; Apps/Relay are overlapping breakouts.

| Scope | Statements | Branches | Functions | Lines |
| --- | ---: | ---: | ---: | ---: |
| TypeScript / TSX | 51.00% | 81.35% | 77.16% | 51.00% |
| Relay | 63.71% | 82.62% | 83.14% | 63.71% |
| Apps core | 99.49% | 95.51% | 98.65% | 99.49% |
| Go Agent | 78.72% | — | — | — |
| Go Execution Core | 93.33% | — | — | — |

The combined value weights covered/total statements in three disjoint scopes: TypeScript/TSX, Go Agent, and Go Execution Core. Apps and Relay are shown separately and are not added again. Go values are measured on Linux, matching the coverage job.

The report is published only from completed master push runs with successful coverage-producing jobs. A failed or incomplete measurement leaves the previous measured badge in place; the source SHA/time above identify its age. The CI status badge separately shows overall CI health.

Apps already requires ≥90% for every metric and file; Go Execution Core requires ≥90% module statement coverage. Other scopes use explicit regression floors while tests are expanded toward 90%. No source exclusions are added by badge generation.
