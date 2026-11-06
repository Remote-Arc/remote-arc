import type { Translate } from "../../locales/locale-catalog.js";
import { billingRecovery } from "../../../../../packages/protocol/src/billing-recovery.js";
import "../../styles/billing/billing-recovery-actions.css";

export function BillingRecoveryActions({ code, tr }: { code: string; tr: Translate }) {
  const recovery = billingRecovery(code);
  return recovery ? (
    <span
      className="billingRecoveryActions"
      role="group"
      aria-label={tr("billing.billingRecoveryActions.waysToContinue")}
    >
      {recovery.actions.map((action) => (
        <a key={action.href} href={action.href}>
          {tr(...action.label)} →
        </a>
      ))}
    </span>
  ) : null;
}
