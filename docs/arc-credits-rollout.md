# Arc Credits foundation rollout

This branch prepares the wallet and a versioned launch-plan proposal. It does not activate checkout or change production allowances. Keep `ARC_CREDITS_ENABLED` unset until the release checklist below is complete. Users do not provide model API keys.

## Implemented

- Migration `0038_arc_credits.sql`: verified-payment receipt records, separate trial/subscription/top-up/promotion lots, reservation allocations and audit events.
- Credits share the existing billing reservation transaction. Concurrent requests cannot spend the same available units. Settlement releases unused holds. Unknown provider outcomes retain their full hold until verified reconciliation.
- Paid grants validate the receipt owner, product, exact configured catalog amount and subscription dates. Trial grants use the original one-time source and expiry. Promotional adjustments require a real admin and an audit reason.
- Trial activation provisions 200 Credits only when the wallet flag is enabled. Earlier recorded trial usage is carried forward, so switching modes does not reset usage.
- New plan constants propose finite Free allowances, Plus $29/1,500 Credits, Pro $79/5,000 Credits and negotiated Enterprise. Plus and Pro expose the same configured model catalog. These constants do not currently override legacy Connect entitlements or per-run limits.

## Validation

Run `pnpm --filter @remotearc/relay test:credits` for real SQLite coverage of receipt amount/owner checks, refund races, concurrent reserves, duplicate events, expiry ordering, unknown results, revocation, settlement and balances across more than 500 lots. The second test runs the native Chat/Apps/scheduler flow with the wallet enabled. `test:security` also includes these checks.

## Before enabling production paid usage

1. Implement and verify hosted checkout and signed payment webhooks. A browser success redirect is never proof of payment. Record receipts from authoritative provider state, then provision the matching plan assignment, wallet lot and provider model grants automatically. Plus must not require a manual model-unlock step. Coupon, annual and prorated purchases need explicit catalog rules; the current exact-amount grant fails closed for those cases.
2. Add ownership-checked billing read APIs, balance/pending UI, payment portal and Admin cost/reconciliation views. Process cancellation, payment failure, refunds and disputes without double-granting or destroying pending holds.
3. Configure platform-owned model/payment credentials through Cloudflare Secrets and actual product/price mappings on the server. Confirm model IDs and current rate tables; never put keys in frontend code or ask users to provide model keys.
4. Bind the proposal's plan limits to server enforcement. Decide and document grandfathering for existing Connect users before changing their 10,000-call allowance. Audit runtime, storage, provider-funded tool and global free-trial costs against the gross-margin budget.
5. After successful CI and migration preflight, promote the D1 migration through the existing production approval workflow. Enable the wallet only after account acceptance, bounded usage and reconciliation are verified. No production promotion was performed here.

Disabling the flag restores the old inference-meter path, not a database rollback. Existing lots and holds must be retained and reconciled; do not use flag changes to erase committed spending or issue a second trial.
