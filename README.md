# Latest measured coverage

Source: [46a80d9](https://github.com/Remote-Arc/remote-arc/commit/46a80d991efb52f3d5ce470254f9e17eefe5e1d7) · [CI run](https://github.com/Remote-Arc/remote-arc/actions/runs/41047688426) · 2026-10-30T11:38:25Z

**Combined statement coverage: 56.79% (32772/57705). Target: ≥90%.**

Production TypeScript/TSX and Linux Go module statements; Apps/Relay are overlapping breakouts.

| Scope | Statements | Branches | Functions | Lines |
| --- | ---: | ---: | ---: | ---: |
| TypeScript / TSX | 51.87% | 81.01% | 76.50% | 51.87% |
| Relay | 65.74% | 82.51% | 84.52% | 65.74% |
| Apps core | 99.49% | 95.51% | 98.65% | 99.49% |
| Go Agent | 78.65% | — | — | — |
| Go Execution Core | 93.26% | — | — | — |

The combined value weights covered/total statements in three disjoint scopes: TypeScript/TSX, Go Agent, and Go Execution Core. Apps and Relay are shown separately and are not added again. Go values are measured on Linux, matching the coverage job.

The report is published only from completed master push runs with successful coverage-producing jobs. A failed or incomplete measurement leaves the previous measured badge in place; the source SHA/time above identify its age. The CI status badge separately shows overall CI health.

Apps already requires ≥90% for every metric and file; Go Execution Core requires ≥90% module statement coverage. Other scopes use explicit regression floors while tests are expanded toward 90%. No source exclusions are added by badge generation.
