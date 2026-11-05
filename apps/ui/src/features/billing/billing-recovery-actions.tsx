import { billingRecovery } from "../../../../../packages/protocol/src/billing-recovery.js";
import "./billing-recovery-actions.css";

export function BillingRecoveryActions({
  code,
  tr,
}: {
  code: string;
  tr: (en: string, zh: string) => string;
}) {
  const recovery = billingRecovery(code);
  return recovery ? (
    <span
      className="billingRecoveryActions"
      role="group"
      aria-label={tr("Ways to continue", "继续操作")}
    >
      {recovery.actions.map((action) => (
        <a key={action.href} href={action.href}>
          {tr(...action.label)} →
        </a>
      ))}
    </span>
  ) : null;
}
