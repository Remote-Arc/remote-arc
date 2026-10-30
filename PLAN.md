# Remote Arc: current plan

Updated 2026-10-30. This replaces the 2026-10-05 long-running-work resume log.
That history remains in Git and in
[the progress log](docs/long-running-work-progress.md); the task design lives in
[the task architecture v2 contract](docs/task-architecture-v2.md) and
[the system architecture](docs/system-architecture.md).

## Where things stand

**In production** (last release `65015d1`):

- Connect Unlimited, a paid Connect-only plan (#392, #396).
- Refunding the current payment ends the Stripe subscription (#397).
- Native-looking Stripe Elements checkout with one-tap wallets (#398).
- Claude connector compatibility and hardening (#399, #401).
- The Safe Cleanup Skill (#380) and Safety Guard 2.0 (#403).
- Every Connect tool on every plan, the restored task workspace (#402), and the Free binary transfer allowance (#405).

The first live purchase, webhook activation, refund and revocation were verified before #397 and #398.

**In progress:**

- Archiving the TypeScript runtime to `Remote-Arc/ts-execution-core-archive`.
- Splitting `apps/ui/src/main.tsx`.
- Signed macOS app and DMG (#391).
- The ReArc Studio workspace (#376), which claims migration `0069`.
- Dependency updates.

## Next

1. Live acceptance of what just shipped:
   - buy Connect Unlimited, refund it, then buy again;
   - check the Elements card form and the wallet buttons;
   - confirm the results in D1 with read-only queries.
2. Activation. Most new accounts connect an AI client but never pair a computer, so the first-run path from a client connection to a paired device is the top product problem.
3. Monitoring:
   - Stripe webhook failures and `billing.payment.load_failed`;
   - Connect Unlimited call volume and cost;
   - how often Free accounts reach their call or transfer allowance.
4. Product:
   - ChatGPT and Claude directory submissions;
   - trial-to-paid conversion;
   - positioning Connect Unlimited on unlimited calls, computers and file transfer.
5. Decide the isolation route for terminal execution ([execution isolation](docs/execution-isolation.md)). Current checks are not a sandbox.
6. Later:
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
- Keep `ARCHITECTURE.md` and the website overview current in the same PR as the
  change they describe. `pnpm docs:architecture:check` runs in CI.
