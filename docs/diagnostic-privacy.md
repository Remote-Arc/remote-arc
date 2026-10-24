# Operational diagnostic privacy

Service incident records, incident alert emails, monitor fallback logs, relay entrypoint exception logs and telemetry-write failure logs use content-free diagnostics.

Exception text can contain credentials or arbitrary personal file contents. Instead of matching a growing list of token formats, these boundaries omit the original message. The allowlisted D1_ERROR classification remains available for existing D1 health queries; Error, TypeError and RangeError classifications contain no original details. HTTP 5xx records retain a canonical status message. This intentionally omits benign error details too.

Incident metadata retains only known event/severity/method values, valid 5xx status codes, Cloudflare request/colo identifiers with constrained formats and static route families. Dynamic path suffixes and unknown routes become :redacted. The sanitized copy is created before D1 binding and reused by the email and failure-log paths. The caller's object is preserved.

This is the monitoring slice of #45 / REM-34. It does not sanitize durable-task recovery state, source sessions, all audit writers, other modules' logs, or historical database rows. Those remain separate inventory and migration work. No production data is rewritten by this change.

Run the focused credential/content fixtures and failure-sink regression with:

```sh
pnpm --filter @remotearc/relay exec tsx scripts/monitor-privacy-test.ts
```

The same test runs in test:security. All email delivery in the test is mocked.
