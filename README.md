# Latest measured coverage

Source: [5fa043e](https://github.com/Remote-Arc/remote-arc/commit/5fa043e370ccf3a99b8072c37f1e11093f5c2a3e) · [CI run](https://github.com/Remote-Arc/remote-arc/actions/runs/42289598669) · 2026-11-06T20:54:49Z

**Combined statement coverage: 57.27% (78297/136708). Target: ≥90%.**

Production TypeScript/TSX and Linux Go module statements; Apps/Relay are overlapping breakouts.

| Scope | Statements | Branches | Functions | Lines |
| --- | ---: | ---: | ---: | ---: |
| TypeScript / TSX | 54.67% | 82.27% | 83.27% | 54.67% |
| Relay | 93.07% | 84.36% | 97.10% | 93.07% |
| Apps core | 99.45% | 95.25% | 100.00% | 99.45% |
| Go Agent | 90.32% | — | — | — |
| Go Execution Core | 93.40% | — | — | — |

The combined value weights covered/total statements in three disjoint scopes: TypeScript/TSX, Go Agent, and Go Execution Core. Apps and Relay are shown separately and are not added again. Go values are measured on Linux, matching the coverage job.

The report is published only from completed master push runs with successful coverage-producing jobs. A failed or incomplete measurement leaves the previous measured badge in place; the source SHA/time above identify its age. The CI status badge separately shows overall CI health.

Apps already requires ≥90% for every metric and file; Go Execution Core requires ≥90% module statement coverage. Other scopes use explicit regression floors while tests are expanded toward 90%. No source exclusions are added by badge generation.
