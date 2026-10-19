# Commercial configuration and payments

D1 is the source of truth for runtime plan prices, monthly Credits, Connect allowances, capacities, top-ups and trial terms. `ARC_PLANS` / `ARC_TOPUPS` in the protocol package are bootstrap and preview defaults. They are not read to price an order or authorize a new paid grant. Provider cost rates and Credit conversion remain reviewed, versioned metering code; changing them requires a reviewed release rather than letting an operator arbitrarily revalue a wallet.

## Storage boundaries

| Location | Values |
| --- | --- |
| D1 commercial versions and heads | Price, Credits, trial duration, capacity and execution terms |
| D1 promotion records | Public code or target user, discount, expiry, redemption cap and status |
| D1 receipts, subscriptions and trials | Immutable commercial version used for that purchase or activation |
| Worker Secrets | Stripe/model API keys, signing secrets and the existing encryption key |
| Worker vars / activation Secrets | Environment identity, release flags, emergency pause and hard spending ceilings |

This is sufficient for the present service. Apollo or a second distributed configuration service would add dependencies without solving the critical transactional link between an order and its allowance. Add a short-lived cache only when measured D1 reads justify it; the present commercial reads use the active D1 head directly. Public catalog responses use `no-store`, and the UI refreshes within 30 seconds/focus; checkout independently rejects a stale version quote.

## Publishing and restoring terms

Admin → Payments & offers → Plans & Credits lets an operator save an immutable draft, inspect the exact offer, then publish. Publishing creates a distinct Stripe Price and atomically advances a D1 head with an expected revision. An unpublished/orphan Stripe Price is not accepted for fulfillment. Concurrent releases cannot both win. A lost response can be retried with the same draft ID and Stripe idempotency key.

New checkouts pin the published version, including pending attempts recovered after a failure. Invoices use the version associated with their canonical Stripe Price, not today's active head. Old paid subscriptions retain the original price and included Credits; an existing trial retains its activation version. A plan change selects the newly quoted version for the next period. Keeping the current plan preserves its original Stripe Price. There is no bulk migration of existing customers or immediate prorated upgrade.

Published commercial rows cannot be edited or deleted. The release history can copy old terms into a **new** draft to restore them for future purchases. Every draft/publish action stores the real authenticated admin actor, mode and audit timestamp. No operator can submit a fake actor or role in the request body.

Use isolated databases and credentials for sandbox and production. Commercial heads are additionally separated by mode; payment/customer tables belong to their environment. Never switch the production database to a test key.

## Promotions

An operator can draft/publish an explicitly scoped one-cycle percentage offer (1–90%), with expiry and total redemption cap. Public codes are entered in Billing before checkout. A private email must resolve to an existing account; it is restricted to that Stripe customer. It applies to the next eligible existing-subscription invoice, or to that user's first checkout. Existing schedules, cancellations or another discount require review instead of overwriting them. Applying an offer does not immediately charge the user.

Stripe receives a product-scoped `duration=once` coupon and an application-managed promotion code. An invoice's discount must match the immutable D1 offer, canonical expanded Stripe coupon, subscription/user authority and local checkout/assignment. Credits follow the purchased version, independently of net cash paid. A promo/user redemption is unique; retries cannot issue a second grant. Disabling a code stops future uses; an already applied discount remains valid. Ambiguous private application is retained for reconciliation, never blindly replayed beyond Stripe's idempotency window.

Unsupported discounts, stacking, 100% coupons, prorated invoices, multiple invoice payment sources and manual/off-Stripe payments do not issue automatic Credits. Fulfillment failures remain visible to operators and Stripe retries. Refunds/disputes revoke the receipt's remaining Credits and paid authority. Even partial refunds currently revoke that receipt's remaining entitlement; revenue cards label excluded/refunded receipt values and do not claim net cash, exact MRR or gross margin.

## Operations and acceptance

The Admin payment workspace shows verified receipt revenue, recurring list value, renewing customers, rated model usage cost, actual discounts, failed invoices and unresolved webhook processing. These are distinct measures. Stripe/payment-processing charges, provider invoice adjustments and infrastructure/support costs are not included in the rated model-cost figure. `invoice.payment_failed` records the canonical invoice status; `invoice.paid` resolves an earlier issue. A delayed failure notification cannot mark an already paid canonical invoice as failed.

The canonical webhook path validates timestamped signatures, retrieves the event and its current payment objects from this account, checks mode/owner/product/period/amount and provisions idempotently. A Checkout redirect only polls the owner-scoped local confirmation record; it never grants Credits.

Tests cover real SQLite migrations, draft isolation, immutable history, concurrent publication, old subscription/trial terms, stale quotes, promotion scope and replay, discounted allowance, invalid-source rejection, session role revocation, host and CSRF boundaries. Actual sandbox acceptance on 2026-10-19 additionally verified an application-created $29 / 1,200 Credits version, a 20% offer, $23.20 hosted test payment, signed webhook fulfillment and refund revocation. No live pricing was published.

Official references: [Stripe price changes](https://docs.stripe.com/billing/subscriptions/change-price), [coupons and promotions](https://docs.stripe.com/billing/subscriptions/coupons), [coupon expansion](https://docs.stripe.com/api/coupons/object), [dynamic payment methods](https://docs.stripe.com/payments/payment-methods/dynamic-payment-methods).
