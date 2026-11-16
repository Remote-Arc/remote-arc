import type { Translate } from "../../locales/locale-catalog.js";
import type { ProTrialChoice } from "../../hooks/settings/use-pro-trial-choice.js";
import "../../styles/billing/pro-trial-choice.css";

const UNAVAILABLE = {
  subscribed: "billing.proTrial.unavailable.subscribed",
  used: "billing.proTrial.unavailable.used",
  paid_before: "billing.proTrial.unavailable.paid_before",
  shared_computer: "billing.proTrial.unavailable.shared_computer",
} as const;

/** The date a trial starting now ends, as the checkout shows it. */
export const proTrialEndDate = (days: number, locale: string) =>
  new Date(Date.now() + days * 86_400_000).toLocaleDateString(locale === "zh" ? "zh-CN" : "en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

/** The Pro trial at checkout: what starts today, what is charged and when, and how to
 * stop it. Cancelling is only in billing settings, which this says. */
export function ProTrialChoiceNote({
  choice,
  plan,
  price,
  locale,
  tr,
  disabled,
}: {
  choice: ProTrialChoice;
  /** The chosen plan's name: Pro or Max. */
  plan: string;
  /** The price after the trial, with its billing period. */
  price: string;
  locale: string;
  tr: Translate;
  disabled: boolean;
}) {
  if (choice.unavailable)
    return (
      <p className="proTrialChoice proTrialChoiceUnavailable" role="status">
        {tr(UNAVAILABLE[choice.unavailable])}
      </p>
    );
  if (!choice.eligible || !choice.offer) return null;
  const { days, credits } = choice.offer;
  if (!choice.on)
    return (
      <button
        type="button"
        className="proTrialChoiceSwitch"
        disabled={disabled}
        onClick={choice.accept}
      >
        {tr("billing.proTrial.useTrialInstead", { days })}
      </button>
    );
  return (
    <div className="proTrialChoice">
      <strong>{tr("billing.proTrial.title", { days, plan })}</strong>
      <p>
        {tr("billing.proTrial.terms", {
          days,
          plan,
          credits: credits.toLocaleString(locale === "zh" ? "zh-CN" : "en-US"),
          price,
          date: proTrialEndDate(days, locale),
        })}
      </p>
      <p className="proTrialChoiceCancel">{tr("billing.proTrial.cancelInSettings", { plan })}</p>
      <button
        type="button"
        className="proTrialChoiceSwitch"
        disabled={disabled}
        onClick={choice.decline}
      >
        {tr("billing.proTrial.payNowInstead")}
      </button>
    </div>
  );
}
