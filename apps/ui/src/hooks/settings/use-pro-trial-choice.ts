import { useState } from "react";
import {
  isConnectOnlyPlan,
  MAX_PLAN_ID,
  type ArcBilling,
  type BillingInterval,
  type BillingPlan,
} from "../../features/billing/arc-billing-client.js";

/**
 * Whether this checkout starts the trial. A Free account that can take it gets it on
 * Pro or Max, monthly or yearly, by default and may pay now instead; `?trial=0`
 * starts without it. The Relay checks eligibility again when checkout opens.
 */
export function useProTrialChoice(
  billing: ArcBilling | null,
  plan: BillingPlan | undefined,
  interval: BillingInterval,
  paid: boolean,
) {
  const params = new URLSearchParams(location.search);
  const [declined, setDeclined] = useState(() => params.get("trial") === "0");
  const offer = billing?.proTrial;
  const eligible = Boolean(
    offer?.available &&
    !paid &&
    plan &&
    (isConnectOnlyPlan(plan) || plan.id === MAX_PLAN_ID) &&
    (interval === "month" || plan.yearlyPriceCents),
  );
  return {
    offer,
    eligible,
    on: eligible && !declined,
    /** Asked for by a trial link, but this account cannot take it. */
    unavailable:
      params.get("trial") === "1" && offer && !offer.available && offer.reason !== "not_offered"
        ? offer.reason
        : null,
    decline: () => setDeclined(true),
    accept: () => setDeclined(false),
  };
}
export type ProTrialChoice = ReturnType<typeof useProTrialChoice>;
