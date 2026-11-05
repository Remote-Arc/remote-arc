# Admin business metrics

Admin → Service health shows operational business outcomes: completed
registrations, confirmed payment quantities, sign-in/device-pairing/task/purchase
completion rates, and business error codes. Growth, returning-user and retention
panels remain in user analytics and are not repeated here. A dedicated
`/api/admin/analytics?view=health` query reads only current flow aggregates, not
growth, activity history or retention cohorts. It loads on entry or explicit
refresh, without background polling. Flow statistics use today / seven days /
thirty days; error investigation has its own clearly labelled time range.

Confirmed payment quantities count verified, nonzero, live-mode receipts in the
reporting period. Multiple payments by one account count separately; webhook
retries do not create extra receipts. Free and test payments are excluded.
Registration is a count of real accounts created; it is not a visitor conversion
rate. Login completion covers recorded new and returning-user sign-in flows.
No visitor-to-registration rate is inferred without its visitor denominator.
Missing business data shows a dash rather than a false zero.

HTTP request and latency charts are not part of this business dashboard. Use
Cloudflare's native dashboard for platform metrics. The business error view
requests `view=business`, which performs only the bounded failure aggregation and
does not calculate unused HTTP request percentiles. Business analytics and error
investigation remain usable independently when either source fails.

Business module cards show recorded failures and the subset needing investigation
for MCP tools, Apps, devices, Arc tasks and billing. Modules with other failures
also appear. Selecting a card filters both the trend charts and the error
investigation; selecting it again restores all modules. These cards reuse the
existing timestamp-bounded failure query, without a separate query per module.
They include business failures returned with HTTP 200 and do not infer success
rates from partial records. Unavailable data displays a dash, never a false zero.

The charts aggregate **recorded product events**, not complete Worker traffic.
Successful GET and MCP requests are not all recorded; failure reporting can also
be rate limited. Counts are observations, not unique incidents or all requests.
Do not calculate a platform success rate from these counts. Use Cloudflare's
native Workers analytics for complete request volume, CPU and platform errors.
Missing duration samples stay null. P50/P95 use nearest-rank order statistics
across all recorded HTTP samples in the selected window, rather than averages of
bucket percentiles. Dates and chart axes use UTC.

## Optional Prometheus collection

Prometheus and Grafana can run separately from the Worker. The Worker serves an
aggregate-only Prometheus text endpoint:

```text
GET https://admin.remotearc.app/api/admin/metrics?format=prometheus&hours=1
```

The normal Admin session can open this export. An external collector can instead
use a dedicated `ADMIN_METRICS_TOKEN` Worker secret of 32–256 characters in an
`Authorization: Bearer …` header. Generate a random secret and install it through
the normal production secret workflow. Never put it in a URL, source, logs or a
browser bundle. This token grants only this aggregate text export; it cannot read
the Admin JSON endpoint, users, payments or other Admin APIs. Without a valid
token or Admin session the endpoint returns 401. No token is provisioned by this
change.

Example collector configuration (the credentials file contains only the token):

```yaml
scrape_configs:
  - job_name: remote_arc_observations
    scheme: https
    metrics_path: /api/admin/metrics
    scrape_interval: 5m
    scrape_timeout: 30s
    params:
      format: [prometheus]
      hours: [1]
    authorization:
      type: Bearer
      credentials_file: /run/secrets/remote_arc_metrics_token
    static_configs:
      - targets: [admin.remotearc.app]
```

Supported windows are 1, 24 and 168 hours. The optional `domain` is one of the
existing fixed business modules. Labels contain only window and module; they
never contain user IDs, emails, device IDs, routes or request bodies.

All exported values are **gauges**: counts are rolling-window observations, not
monotonically increasing counters. Graph them directly; do not apply `rate()` or
`increase()`. Durations use seconds, absent durations use `NaN`. For example:

```promql
remote_arc_observed_server_errors{window="1h",domain="all"}
remote_arc_observed_duration_p95_seconds{window="1h",domain="all"}
```

The optional legacy export executes two bounded aggregation queries against D1.
The configuration above is an integration example, not a recommendation to
continuously scrape raw events. Measure the selected window's database reads
before enabling scheduled collection. A
separate collector, dashboards and alerting are optional infrastructure and are
not deployed by this change.

## Query performance and index rollout

User pagination and activation facets share one materialized aggregation for a
nonempty page. Search narrows candidates before historical evidence is read.
Only an empty selected stage or an out-of-range page needs a second facet query.
Unrelated Admin sections do not load user history or submissions. User views pass
`auditTotals=0`, returning `auditRows: null` and a timestamp-bounded seven-day
count. The cost view and legacy API callers retain the full audit count.
Business analytics materializes successful-use evidence once per period instead
of rescanning it per new user. Its unused lifetime `coverage.recordedEvents`
metadata is now null; the indexed earliest-event timestamp is still available.

Migration `0078_admin_query_indexes.sql` adds four partial covering indexes; it
does not rewrite stored rows. Existing code remains compatible. It must be
reviewed and approved before production application: record table sizes and
matching-row counts, verify the current backup, and schedule index construction
with D1 load in mind. Recovery is to revert the application and, if necessary,
drop only the four new indexes. No production migration is run by local tests.
