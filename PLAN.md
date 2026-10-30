# Remote Arc: current plan

Updated 2026-10-30. This replaces the 2026-10-05 long-running-work resume log.
That history remains in Git and in
[the progress log](docs/long-running-work-progress.md); the task design lives in
[the task architecture v2 contract](docs/task-architecture-v2.md) and
[the system architecture](docs/system-architecture.md).

## Where things stand

**In production** (last release `e858d04`):

- Connect Unlimited, a paid Connect-only plan (#392, #396).
- Refunding the current payment ends the Stripe subscription (#397).
- A live purchase, webhook activation, refund and revocation were verified once.

**Merged, waiting for the next production release:**

- Native-looking Stripe Elements checkout with one-tap wallets, plus migration `0070` (#398).
- Claude connector compatibility and hardening (#399, #401).
- The Safe Cleanup Skill (#380).
- Every Connect tool on every plan, and the restored task workspace (#402).
- Safety Guard 2.0 (#403).

**Open:**

- The Free binary transfer allowance (#405). Release it together with #402: #402 opens file links to Free, and without #405 Free binary transfer is unlimited.
- Signed macOS app and DMG (#391).
- The ReArc Studio workspace (#376), which claims migration `0069`.
- Dependency updates.

## Next

1. Merge #405, then run one Production Release from the latest `master`. Watch
   migration `0070`, which rebuilds `arc_billing_checkouts`.
2. Live acceptance after the release:
   - buy Connect Unlimited, refund it, then buy again;
   - check the Elements card form and the wallet buttons;
   - confirm the results in D1 with read-only queries.
3. Monitoring:
   - Stripe webhook failures and `billing.payment.load_failed`;
   - Connect Unlimited call volume and cost;
   - how often Free accounts reach their call or transfer allowance.
4. Product:
   - ChatGPT and Claude directory submissions;
   - trial-to-paid conversion;
   - positioning Connect Unlimited on unlimited calls, computers and file transfer.
5. Later:
   - signed installers and automatic Agent updates;
   - finer command/network policy;
   - persistent goal continuation;
   - the AI Teams rollout.

## Working rules

- Start from the latest `master`, with one branch and PR per change. PRs are
  squash-merged; the repository does not allow auto-merge.
- Before pushing follow-up fixes, confirm the PR is still open. A merged PR needs
  a new branch from `master`.
- Merging never deploys. Production changes only through the owner-run
  **Production Release - D1 + Relay + Website** workflow.
- D1 migrations are additive and take the next free number. Check open PRs for
  numbers they already claim.
- Automation never makes live payments or refunds. Production D1 access for
  verification is read-only and does not print personal or card data.
- Keep claims in docs consistent with tests. Real host/device overnight
  acceptance stays pending until it actually runs.
