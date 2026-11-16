import { useI18n } from "../../hooks/use-i18n.js";
import { PRO_TRIAL_CHECKOUT_HREF, type ProTrial } from "../billing/arc-billing-client.js";
import "../../styles/dashboard/pro-trial-entry.css";

/** The trial can start at any time, not only when Free calls run low: a Free account
 * that can take it sees this on the Overview while the usage banner is not showing. */
export function ProTrialEntry({ proTrial }: { proTrial?: ProTrial }) {
  const { tr, locale } = useI18n();
  if (!proTrial?.available) return null;
  return (
    <section className="proTrialEntry" aria-label={tr("dashboard.proTrialEntry.label")}>
      <div>
        <strong>{tr("dashboard.proTrialEntry.title", { days: proTrial.days })}</strong>
        <p>
          {tr("dashboard.proTrialEntry.body", {
            days: proTrial.days,
            credits: proTrial.credits.toLocaleString(locale === "zh" ? "zh-CN" : "en-US"),
          })}
        </p>
      </div>
      <a className="addButton arcRadiantCta" href={PRO_TRIAL_CHECKOUT_HREF}>
        {tr("dashboard.proTrialEntry.start")}
      </a>
    </section>
  );
}
