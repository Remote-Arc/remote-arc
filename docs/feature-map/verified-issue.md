# Create and read back one exact GitHub issue

Owner: Remote Arc. Version: 1.0.0. Skill: arc-verified-issue.

Entrance: Arc Chat → Verified task → Create and verify a GitHub issue. Explicitly choose Account, Repository (owner/repo), Exact issue title and Exact issue body. Title is at most 200 characters; body is required, at most 4,000 characters and 6 KB UTF-8. Create issue and verify creates one issue subject to the repository's visibility and notification settings.

Preconditions: active Arc access, current usage allowance and both issue write/read permissions. Missing read-back permission blocks run creation before a provider write. The server freezes account, repository, title and body with the encrypted user message and request identity. Changing these fields cannot reuse an old identity.

Expected behavior: create precisely the reviewed fields, retain the acknowledged positive issue number and exact GitHub issue URL, then read back that issue through the same account and repository. No arbitrary issue reads, extra writes, device operations or task creation are included.

Verification: creation acknowledgement AND independent read-back must pass. The read-back number, URL, title and full body must match. Proof is derived from the original provider result before context compaction, so a long body is not certified merely because its shortened excerpt looks correct.

Recovery: an acknowledged creation without read-back is partial, never complete. Preserve the existing issue link and inspect it; do not create a replacement. An unknown write stops pending inspection and is not repeated after restart. A mismatch cannot be overridden by an assistant saying success. The issue is not closed automatically; closing it is a new authorized request.

Drive using dialog labels above and the named Create issue and verify button. Inspect Execution receipt → Evidence and changes, then compare the acknowledged result with GitHub if doing a separately authorized live test.

Regression: arc-verification-test.ts covers frozen scope, preflight read permission, exact full-body verification, restored decisions, false completion, acknowledgement-only partial success and unknown-write stopping. Automated tests use synthetic repository/provider responses.

