import type { Translate } from "../../locales/locale-catalog.js";
import type { FormEvent, ReactNode } from "react";
import { ProductIcon } from "../../components/product-icon.js";
type Tr = Translate;
export type ElementsSummary = {
  label: string;
  subtotal: string;
  discount?: string;
  tax?: string;
  total: string;
  cadence: string;
  recurringNote?: string;
};
/** Remote Arc's own payment layout. Only the payment fields inside `fields` are
 * rendered by Stripe; summary, errors and the pay button are ours. */
export function ElementsShell({
  tr,
  summary,
  express,
  expressState = "available",
  fields,
  status,
  error,
  busy,
  canPay,
  submitLabel,
  onSubmit,
  footer,
}: {
  tr: Tr;
  summary: ElementsSummary;
  express?: ReactNode;
  expressState?: "pending" | "available" | "none";
  fields: ReactNode;
  status?: ReactNode;
  error?: string;
  busy: boolean;
  canPay: boolean;
  submitLabel?: string;
  onSubmit: (event: FormEvent) => void;
  footer?: ReactNode;
}) {
  return (
    <div className="arcElementsCheckout">
      <form className="arcElementsPay" onSubmit={onSubmit} aria-busy={busy} noValidate>
        <header>
          <h3>{tr("billing.checkoutElementsShell.paymentDetails")}</h3>
          <p>
            <ProductIcon name="shield" size={14} />
            {tr("billing.checkoutElementsShell.cardDetailsGoDirectlyToStripe")}
          </p>
        </header>
        {status}
        {/* Stays mounted while pending so Stripe can measure; collapses when no wallet applies. */}
        {express && (
          <div
            className="arcElementsExpress"
            data-state={expressState}
            aria-hidden={expressState !== "available"}
          >
            {express}
            <p className="arcElementsDivider">
              <span>{tr("billing.checkoutElementsShell.orPayWithCard")}</span>
            </p>
          </div>
        )}
        {fields}
        {error && (
          <p className="arcElementsError" role="alert">
            {error}
          </p>
        )}
        <button
          type="submit"
          className="raSettingsButton raSettingsButtonPrimary arcElementsSubmit"
          disabled={!canPay || busy}
        >
          {busy
            ? tr("billing.checkoutElementsShell.processingPayment")
            : (submitLabel ?? tr("billing.checkoutElementsShell.pay") + summary.total)}
        </button>
        {footer ?? <small>{tr("billing.checkoutElementsShell.yourBankMayAskYouTo")}</small>}
      </form>
      <aside
        className="arcElementsSummary"
        aria-label={tr("billing.checkoutElementsShell.orderSummary")}
      >
        <span className="raSettingsFieldLabel">
          {tr("billing.checkoutElementsShell.orderSummary2")}
        </span>
        <dl>
          <div>
            <dt>{summary.label}</dt>
            <dd>{summary.subtotal}</dd>
          </div>
          {summary.discount && (
            <div>
              <dt>{tr("billing.checkoutElementsShell.discount")}</dt>
              <dd>−{summary.discount}</dd>
            </div>
          )}
          {summary.tax && (
            <div>
              <dt>{tr("billing.checkoutElementsShell.tax")}</dt>
              <dd>{summary.tax}</dd>
            </div>
          )}
          <div className="arcElementsTotal">
            <dt>{tr("billing.checkoutElementsShell.dueToday")}</dt>
            <dd>
              {summary.total}
              <small>{summary.cadence}</small>
            </dd>
          </div>
        </dl>
        {summary.recurringNote && <p>{summary.recurringNote}</p>}
      </aside>
    </div>
  );
}
