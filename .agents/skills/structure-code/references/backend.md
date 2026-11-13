# Service and API structure

Use this with `structure-code` for a server, API, worker, command-line tool or
library. The names are examples. Follow the project's own layout where it has one.

## A layout that scales

```text
src/
  main.ts            start-up only: read config, build dependencies, start serving
  config.ts          every setting and secret, read and validated once
  errors.ts          error codes, their statuses and message keys
  auth/
    permissions.ts   every permission rule, by name
  billing/           one folder per domain
    routes.ts        entry points: parse, call the domain, shape the response
    plans.ts         business rules, with no framework or storage imports
    billing-store.ts reads and writes for this domain's tables
    billing.test.ts
  devices/
  clients/
    payments.ts      one client per outside service
  platform/          logging, metrics, database handle, request context
```

In Go, Rust or Java the same idea maps to packages or modules: one package per
domain, a small `cmd/` or `main` that wires them, and no package that imports
"everything".

## Layers and the direction of imports

```text
entry points  ->  domain  ->  interfaces for storage and clients
                    ^
         implementations (store, client) are passed in at start-up
```

- Entry points know the transport, such as HTTP, a queue or a command line. The
  domain does not.
- The domain decides. It receives its storage and clients as arguments or
  interfaces, so that a test can pass fakes without patching imports.
- A store holds queries for one domain. A query that joins two domains belongs to
  the domain that owns the result, not to a shared `db.ts`.
- `platform/` holds technical services every domain uses. It never imports a
  domain.

## One source of truth

| Concern | One place | Callers do |
| --- | --- | --- |
| Permissions | `auth/permissions.ts` | `can(actor, "devices:remove", device)` |
| Config | `config.ts`, validated at start-up | Receive typed config, never read the environment |
| Errors | `errors.ts` | Throw a code; one handler maps it to status and message |
| Limits and plans | One constants or plans module | Import the value, never repeat the number |
| Feature flags | One flag helper | `isEnabled("newCheckout", account)` |
| Logs and audit | One logger with a fixed event shape | Log an event name and fields, not free text |
| Time and ids | One clock and id helper | Inject them, so that tests are stable |

Ask "if this rule changes, how many files change?" The answer should be one.

## Edges

- Validate input once at the entry point with a schema, and turn it into typed
  values. Reject unknown fields where the project allows it.
- Each outside client sets a timeout, decides which errors are safe to retry, and
  converts provider errors into your own codes. Callers never see a raw provider
  error.
- Writes that can be repeated, such as webhooks and retried requests, carry an
  idempotency key checked in the same transaction. See `change-data-safely` for
  stored data.

## Signs that structure is going wrong

- A handler longer than a screen, or one that runs SQL or calls a provider
  directly.
- A `utils`, `helpers` or `common` file that every module imports.
- The same role check, limit or status string in more than one file.
- Environment variables read deep inside the code.
- Two domains that import each other.
- Tests that need the network or a real clock to pass.

Fix these in code you add or touch, and report the rest instead of reorganising
everything at once.
