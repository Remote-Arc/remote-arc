import React from "react";
import { useI18n } from "../../hooks/use-i18n.js";
import { usePlatformCatalog } from "../../hooks/use-platform-catalog.js";
import { localizedWebsiteHref } from "../../lib/marketing-paths.js";
import { offeredPlans } from "../billing/arc-billing-client.js";
import { planDescriptionKey, planMonthlyCents } from "./plan-copy.js";
import "../../styles/marketing/plan-summary.css";

/** Compact plan list read from the same catalog as /pricing; the full details stay there. */
export function PlanSummary() {
  const { tr, locale } = useI18n();
  const catalog = usePlatformCatalog();
  const plans = catalog ? offeredPlans(catalog.plans) : [];
  return (
    <section className="planSummary" id="plans" aria-labelledby="plan-summary-heading">
      <header>
        <h2 id="plan-summary-heading">{tr("marketing.planSummary.title")}</h2>
        <p>{tr("marketing.planSummary.everyPlanHasEveryConnectTool")}</p>
      </header>
      {plans.length > 0 && (
        <ul className="planSummaryList">
          {plans.map((plan) => {
            const { cents, billedYearlyCents } = planMonthlyCents(plan);
            return (
              <li key={plan.id}>
                <strong>{plan.label}</strong>
                <span className="planSummaryPrice">
                  US${Number.isInteger(cents / 100) ? cents / 100 : (cents / 100).toFixed(2)}
                  <small> / {tr("marketing.arcPublicPricing.month")}</small>
                </span>
                {billedYearlyCents && (
                  <span className="planSummaryNote">
                    {tr("marketing.arcPublicPricing.billedYearlyAtUs", {
                      yearly: billedYearlyCents / 100,
                    })}
                  </span>
                )}
                <p>{tr(planDescriptionKey(plan))}</p>
              </li>
            );
          })}
        </ul>
      )}
      <a className="planSummaryLink" href={localizedWebsiteHref("/pricing", locale)}>
        {tr("marketing.planSummary.seeFullPricing")} →
      </a>
    </section>
  );
}
