# Incremental agent continuity plan

Baseline: master `d95a58e`, 22 October 2026. AI Teams acceptance is excluded.
Each row is a separate implementation and acceptance boundary. Only step 1 is
implemented in this change; complete its review before implementing step 2.

| Step | Deliverable | Acceptance boundary |
| --- | --- | --- |
| 1 — Local discovery | List Codex / Claude Code session metadata for one chosen project directory | Correct directory scope, useful empty/error states, no conversation text returned, no workspace changes |
| 2 — Selected-session preview | User selects one discovered session; preview bounded visible messages and current Git changes | Correct source/provenance; private reasoning excluded; historical claims separated from observed file facts; all local |
| 3 — Handoff package | Versioned goal, constraints, progress, workspace identity, evidence and unknowns | Detect changed HEAD/index/files and corrupt packages; do not replay uncertain writes; no task-success claim from assistant prose |
| 4 — Continue with one target | User reviews a handoff and continues the same local project in Codex or Claude Code | Finish one real interrupted task with no repeated completed work; preserve current permissions and require current authorization |
| 5 — Simple integration | Installer detects existing coding clients and offers narrowly scoped integration | No hand-edited JSON required; conflicts explained; reversible configuration; respect native hook trust approval |
| 6 — Protection and verification | Build Arc Shield and recovery UX from existing policy, approvals, Undo and receipts | Test one named risky operation at a time; distinguish blocked, unknown and verified results; prove recovery for the supported scope |
| 7 — Durable continuity | Opt-in lifecycle recording, local checkpoints, then one cross-device transfer | Recover from a missing end event; inventory dependencies and unsaved files; report unavailable state explicitly; no silent cloud upload |

The screenshots also propose a unified Verified Work Engine, source/version/
permission-aware personal knowledge, Fleet scheduling, workflow reuse and user
value/cost measurement. These stay as later, independent workstreams after the
single-project continuity flow has evidence of value. Avoid expanding Apps or
AI employee counts as a substitute for that validation.

Existing release reliability remains a separate operational gate: validate the
exact candidate SHA, CI, actual deployment, Windows recovery and scoped provider
flows before calling anything production-ready. This development change does
not merge, deploy, migrate data, publish packages or activate paid integrations.

Repository evidence behind this sequence: native policy and execution in
`packages/execution-core`; pause/recovery/lease handling in `apps/agent/internal`;
source-derived receipts in `apps/relay/src/arc-verification*`; feature contracts
in `docs/feature-map`. These existing parts should be extended, with a fresh
acceptance boundary, rather than presented as a complete new Shield product.
