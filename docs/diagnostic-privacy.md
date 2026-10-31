# Operational diagnostic privacy

Service incident records, incident alert emails, monitor fallback logs, relay entrypoint exception logs and telemetry-write failure logs use content-free diagnostics.

Exception text can contain credentials or arbitrary personal file contents. Instead of matching a growing list of token formats, these boundaries omit the original message. The allowlisted D1_ERROR classification remains available for existing D1 health queries; Error, TypeError and RangeError classifications contain no original details. HTTP 5xx records retain a canonical status message. This intentionally omits benign error details too.

Incident metadata retains only known event/severity/method values, valid 5xx status codes, Cloudflare request/colo identifiers with constrained formats and static route families. Dynamic path suffixes and unknown routes become :redacted. The sanitized copy is created before D1 binding and reused by the email and failure-log paths. The caller's object is preserved.

Failed Arc device reads also use content-free diagnostics before both the conversation message and the step result are encrypted and persisted. A fixed classification (for example ENOENT or a policy denial) remains available for recovery; original exception paths, queries and contents are omitted, including benign details. Recovery uses the already-authorized tool arguments and observed device state. A failed read remains a failed read, and uncertain writes are never retried by this change.

These are the monitoring and failed-device-read slices of #45. Successful tool output and user-requested file content are not diagnostic errors. This does not sanitize every durable-task recovery field, source session, audit writer, other module's logs, or historical database row. Those remain separate inventory and migration work. No production data is rewritten by this change.

Run the focused credential/content fixtures and failure-sink regression with:

```sh
pnpm --filter @remotearc/relay exec tsx scripts/monitor-privacy-test.ts
```

The same test runs in test:security. All email delivery in the test is mocked.
