# Consent, boundaries and receipts

Owner: Remote Arc. Version: 1.0.0.

1. Opening a verified-task dialog is read-only. A user must choose an account and review exact fields before sending. Switching task type clears the account. Imported skill text never creates this frozen scope.
2. The server validates schema, account/provider ownership and all needed App operations before creating a run. Current permissions are checked again by normal App dispatch. User, provider, file and skill content cannot broaden this authority.
3. A restored encrypted model_complete decision still crosses the argument and scope gates before dispatch. The issue read-back number must come from this run's acknowledged creation, connection and repository.
4. Acknowledged writes reuse their durable identity within the run. An unacknowledged effect is unknown and stops for inspection. A final assistant sentence cannot override failed or missing checks.
5. Source-derived proof is sealed in the execution journal before result compaction. Receipts are derived from that account-owned journal. If a run leaves the recent 100-message context window, its own journal is loaded to reconstruct the receipt. Another account cannot retrieve it.
6. The compact receipt shows declared-check status, acknowledged App changes, evidence IDs/times/links and next action. completed means the selected checks passed; it is not a universal certificate for unrelated goals. An uncontracted run is pending verification. Inbox retrieval does not grade summary quality, and deployment READY does not prove application behavior.
7. Cancel, time/token/step limits, unavailable capabilities and unknown outcomes preserve remaining work. These bounds do not silently create an overnight continuation or a Team. Budgets and all paid inference still pass normal accounting.

Verify using pnpm --filter @remotearc/relay test:arc and pnpm --filter @remotearc/ui test:arc-client, plus a browser through the actual consent → request → tool → receipt path. Test state must include false completion, read-back mismatch, restart, unknown write, invalid ownership and historical receipt restoration. Logs must not expose provider credentials or private model reasoning.
