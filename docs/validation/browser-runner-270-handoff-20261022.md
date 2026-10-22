# Browser Runner #270 — takeover handoff (2026-10-22)

**Base:** Claude's `feat/270-browser-runner` @ `febae2db`.
**Continuation:** `fix/270-browser-runner-safety` (separate worktree/branch; Claude's original branch remains unchanged).
**State:** source-only changes. No Relay deployment, npm release, feature-flag activation, live ATS submission, or production data change.

## Why this handoff exists

Two P0 safety gaps appeared in a read-only CTO review:

1. A connected model could omit `effect=submit`, or claim `effect=navigation`, while clicking a native POST submit control. The action then bypassed the write-ahead external-effect checkpoint.
2. A model-supplied `scope_change_reason` alone widened an already-running task's allowed website origins. A text explanation is not a user approval.

## Changes and design trade-offs

- **Go:** adds fail-closed `effect_risk` inspection in the CDP isolated world for native POST submit controls and clearly submit-like buttons. Enter also needs explicit submit classification. The existing durable in-flight receipt and idempotency key are reused. One final external submit per task is enforced even if the model chooses a different key later. Ordinary GET-form Next navigation and standard links remain usable.
- **Relay:** reuses the existing D1 approval broker for `browser_runner_start` calls carrying `scope_change_reason`. The pending approval shows the task and exact requested site list; approval must be `allow_once` and argument-hash matched to the connected grant and device. Relay injects `scope_change_approved` into the device request only after a valid approval; caller-supplied values are replaced. Go rejects widening without that bit. Other calls and first starts remain unchanged.
- **Dashboard:** shows only Allow once / Deny for Browser Runner scope expansion, not 10-minute or trusted-folder permissions.
- **Tests:** extends Windows Edge E2E for undeclared submit, forged navigation, new submit key after confirmation, and denied scope expansion. Extends the real SQLite approval broker regression to cover unapproved attempts, non-allow-once refusal, one-time consumption, and changed origins.

## Unresolved acceptance / limitations

- The control-label/HTML-form heuristic is *not* a universal detector for arbitrary JavaScript network effects. A visually ordinary button can invoke custom JS that sends data. True provider-level exactly-once semantics cannot be guaranteed solely by local MCP hints and DOM classification. Do not advertise universal exactly-once until external identity/effect ledger #279 and conservative action approval are fully qualified.
- Scope-change approval is enforced at Relay for normal Connect clients. The local Go function's `scope_change_approved` field is an internal transport assertion, not a cryptographic proof against a malicious actor already able to invoke arbitrary local Agent commands.
- Current task isolation is device-local; account/task binding, existing-profile reuse, cross-device continuation and user handoff (#276) still require separate acceptance.
- Real Mac visible browser acceptance, 3+ source AI client sessions (ChatGPT / Claude / Cursor or Codex), independent Relay test deployment with `ENABLE_BROWSER_RUNNER=1`, and authorized real ATS job submission #271 are not performed by this handoff.
- Existing public/stable versions and production tool registration remain **unchanged**. Feature is opt-in and requires fresh approval before broad activation.

## Claude / reviewer resumption

Read the PR diff and GitHub #270 comment first. Confirm commit SHAs against CI, then prioritize #276 real Windows background-agent visible-browser handoff and macOS real device checks. Only after that, stage a Relay test environment and obtain owner approval to enable the new MCP tools. Keep the original Claude branch for comparison; do not overwrite other Codex worktrees.
