# Latest measured coverage

Source: [a1ce6db](https://github.com/Remote-Arc/remote-arc/commit/a1ce6db412b6756f84f291162e577d31e02ce8ab) · [CI run](https://github.com/Remote-Arc/remote-arc/actions/runs/41421078928) · 2026-11-02T09:45:44Z

**Combined statement coverage: 65.35% (39327/60178). Target: ≥90%.**

Production TypeScript/TSX and Linux Go module statements; Apps/Relay are overlapping breakouts.

| Scope | Statements | Branches | Functions | Lines |
| --- | ---: | ---: | ---: | ---: |
| TypeScript / TSX | 60.35% | 81.91% | 83.29% | 60.35% |
| Relay | 90.42% | 83.59% | 96.64% | 90.42% |
| Apps core | 100.00% | 95.16% | 100.00% | 100.00% |
| Go Agent | 90.44% | — | — | — |
| Go Execution Core | 93.40% | — | — | — |

The combined value weights covered/total statements in three disjoint scopes: TypeScript/TSX, Go Agent, and Go Execution Core. Apps and Relay are shown separately and are not added again. Go values are measured on Linux, matching the coverage job.

The report is published only from completed master push runs with successful coverage-producing jobs. A failed or incomplete measurement leaves the previous measured badge in place; the source SHA/time above identify its age. The CI status badge separately shows overall CI health.

Apps already requires ≥90% for every metric and file; Go Execution Core requires ≥90% module statement coverage. Other scopes use explicit regression floors while tests are expanded toward 90%. No source exclusions are added by badge generation.
