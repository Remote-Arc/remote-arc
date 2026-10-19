# Arc Credits implementation

See [Platform launch, owner configuration, plans and operations](./arc-platform-launch.md) for the current release instructions.

Migration 0038 adds verified receipts, credit lots, atomic allocations and audit events. Migration 0039 adds Stripe customer/checkout/subscription records, event leases, refund tombstones and preserved Connect allowances.

Credits are reserved in the same database transaction as model authorization and spending limits. Measured usage settles once; unused reservations return to the wallet. Unknown provider outcomes retain their maximum reservation until verified. Paid lots require a matching authoritative receipt, amount, product, owner and period. One-time trials carry previous recorded use forward.

The backend includes Stripe Checkout, signed canonical webhooks, automatic plan/model authorization, refunds/disputes, billing reads, the customer portal, and plan changes at the next billing cycle. Browser redirects never issue Credits. The Settings panel displays actual balances and usage. The repository SaaS economics tools share the runtime catalog. All current deployment flags remain closed; operator setup and normal release are still required.

Run `pnpm --filter @remotearc/relay test:credits`, `test:stripe`, `test:model-billing` and `pnpm test:saas`. Provider HTTP is mocked; these tests do not certify live account credentials.
