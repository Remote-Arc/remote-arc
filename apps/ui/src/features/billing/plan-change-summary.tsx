import type { Translate } from "../../locales/locale-catalog.js";
import type { PlanChange } from "../../hooks/settings/use-plan-change.js";
import { billingFailureMessage } from "./arc-billing-client.js";
import "../../styles/billing/plan-change-summary.css";

/** A paid account's plan change at checkout: what happens today, and the button that
 * does it. An upgrade shows Stripe's amount and needs the person's agreement first. */
export function PlanChangeSummary({
  change,
  planLabel,
  usd,
  locale,
  tr,
  same,
}: {
  change: PlanChange;
  planLabel: string;
  usd: (cents: number) => string;
  locale: string;
  tr: Translate;
  same: boolean;
}) {
  const date = (iso?: string | null) =>
    iso
      ? new Date(iso).toLocaleDateString(locale === "zh" ? "zh-CN" : "en-US", {
          year: "numeric",
          month: "short",
          day: "numeric",
        })
      : "";
  const { preview, outcome, failure, busy } = change;
  const recurring = preview
    ? tr(
        preview.interval === "year" ? "billing.planChange.perYear" : "billing.planChange.perMonth",
        {
          price: usd(preview.priceCents),
        },
      )
    : "";
  if (outcome)
    return (
      <div className="planChange" role="status">
        <p>
          {outcome === "switched"
            ? tr("billing.planChange.switched", { plan: planLabel })
            : outcome === "scheduled"
              ? tr("billing.planChange.scheduled", { date: date(preview?.effectiveAt) })
              : outcome === "upgrading"
                ? tr("billing.planChange.upgrading")
                : outcome === "upgraded"
                  ? tr("billing.planChange.upgraded", { plan: planLabel })
                  : tr("billing.planChange.pending")}
        </p>
        <a className="raSettingsButton" href="/settings?section=billing">
          {tr("billing.arcCheckout.returnToPlanUsage")}
        </a>
      </div>
    );
  if (same) return <p className="planChange">{tr("billing.planChange.samePlan")}</p>;
  if (failure && !preview)
    return (
      <p className="planChange" role="alert">
        {billingFailureMessage(failure, tr)}
      </p>
    );
  if (!preview) return <p className="planChange">{tr("billing.planChange.calculating")}</p>;
  return (
    <div className="planChange">
      {preview.mode === "trial" && (
        <p>
          {tr("billing.planChange.trialSwitch", {
            plan: planLabel,
            price: recurring,
            date: date(preview.effectiveAt),
          })}
        </p>
      )}
      {preview.mode === "scheduled" && (
        <p>{tr("billing.planChange.scheduledNote", { date: date(preview.effectiveAt) })}</p>
      )}
      {preview.mode === "upgrade" && (
        <>
          <dl className="planChangeLines">
            <div>
              <dt>{tr("billing.planChange.newPlan", { plan: planLabel })}</dt>
              <dd>{usd(preview.priceCents)}</dd>
            </div>
            {Boolean(preview.creditCents) && (
              <div>
                <dt>{tr("billing.planChange.credit")}</dt>
                <dd>−{usd(preview.creditCents!)}</dd>
              </div>
            )}
            {Boolean(preview.taxCents) && (
              <div>
                <dt>{tr("billing.planChange.tax")}</dt>
                <dd>{usd(preview.taxCents!)}</dd>
              </div>
            )}
            <div className="planChangeTotal">
              <dt>{tr("billing.planChange.dueToday")}</dt>
              <dd>{usd(preview.totalCents ?? 0)}</dd>
            </div>
          </dl>
          <p className="planChangeQuiet">
            {tr("billing.planChange.renews", { date: date(preview.renewsAt), price: recurring })}
          </p>
          <label className="planChangeAgree">
            <input
              type="checkbox"
              checked={change.agreed}
              disabled={busy}
              onChange={(event) => change.setAgreed(event.target.checked)}
            />
            <span>
              {tr("billing.planChange.agree", {
                total: usd(preview.totalCents ?? 0),
                price: recurring,
              })}
            </span>
          </label>
        </>
      )}
      {Boolean(failure) && (
        <p role="alert" className="planChangeError">
          {billingFailureMessage(failure, tr)}
        </p>
      )}
      <button
        type="button"
        className="raSettingsButton raSettingsButtonPrimary arcCheckoutContinue"
        disabled={busy || (preview.mode === "upgrade" && !change.agreed)}
        onClick={() => void change.confirm()}
      >
        {busy
          ? tr("billing.arcCheckout.preparingPayment")
          : preview.mode === "upgrade"
            ? tr("billing.planChange.upgradeNow")
            : preview.mode === "trial"
              ? tr("billing.planChange.switchPlan")
              : tr("billing.planChange.confirm")}
      </button>
    </div>
  );
}
