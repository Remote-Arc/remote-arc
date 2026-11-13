import type { PlatformCatalog } from "../../hooks/use-platform-catalog.js";
import { isConnectOnlyPlan } from "../billing/arc-billing-client.js";

type Plan = PlatformCatalog["plans"][number];

/** The one-line description each public plan card shows, shared by /pricing and summaries. */
export function planDescriptionKey(plan: Plan) {
  if (plan.id === "free") return "marketing.arcPublicPricing.yourAiConnectedToYourWorld";
  if (isConnectOnlyPlan(plan)) return "marketing.arcPublicPricing.yourOwnAiOnEveryComputer";
  return plan.label === "Plus"
    ? "marketing.arcPublicPricing.arcHandlesYourEverydayWorkWith"
    : "marketing.arcPublicPricing.moreCreditsAndCapacityForOngoing";
}

/** Price per month as the plan card shows it: the yearly price per month when one is offered. */
export function planMonthlyCents(plan: Plan) {
  const yearly = isConnectOnlyPlan(plan) && plan.yearlyPriceCents ? plan.yearlyPriceCents : null;
  return { cents: yearly ? yearly / 12 : plan.monthlyPriceCents, billedYearlyCents: yearly };
}
