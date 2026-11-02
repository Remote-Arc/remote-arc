# Latest measured coverage

Source: [b54098f](https://github.com/Remote-Arc/remote-arc/commit/b54098f97ee26f838c144b0b21070d4e626689c2) · [CI run](https://github.com/Remote-Arc/remote-arc/actions/runs/41377348419) · 2026-11-02T02:35:05Z

**Combined statement coverage: 65.40% (39282/60061). Target: ≥90%.**

Production TypeScript/TSX and Linux Go module statements; Apps/Relay are overlapping breakouts.

| Scope | Statements | Branches | Functions | Lines |
| --- | ---: | ---: | ---: | ---: |
| TypeScript / TSX | 60.40% | 81.89% | 83.32% | 60.40% |
| Relay | 90.40% | 83.57% | 96.64% | 90.40% |
| Apps core | 100.00% | 95.16% | 100.00% | 100.00% |
| Go Agent | 90.44% | — | — | — |
| Go Execution Core | 93.40% | — | — | — |

The combined value weights covered/total statements in three disjoint scopes: TypeScript/TSX, Go Agent, and Go Execution Core. Apps and Relay are shown separately and are not added again. Go values are measured on Linux, matching the coverage job.

The report is published only from completed master push runs with successful coverage-producing jobs. A failed or incomplete measurement leaves the previous measured badge in place; the source SHA/time above identify its age. The CI status badge separately shows overall CI health.

Apps already requires ≥90% for every metric and file; Go Execution Core requires ≥90% module statement coverage. Other scopes use explicit regression floors while tests are expanded toward 90%. No source exclusions are added by badge generation.
