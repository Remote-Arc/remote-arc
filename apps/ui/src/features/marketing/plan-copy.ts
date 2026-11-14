import { ARC_TYPICAL_TASK_CREDITS } from "@remotearc/protocol";
import type { PlatformCatalog } from "../../hooks/use-platform-catalog.js";
import { isConnectOnlyPlan } from "../billing/arc-billing-client.js";

type Plan = PlatformCatalog["plans"][number];

/** The one-line description each public plan card shows, shared by /pricing and summaries. */
export function planDescriptionKey(plan: Plan) {
  if (plan.id === "free") return "marketing.arcPublicPricing.yourAiConnectedToYourWorld";
  if (isConnectOnlyPlan(plan)) return "marketing.arcPublicPricing.yourOwnAiOnEveryComputer";
  return plan.label === "Plus"
    ? "marketing.arcPublicPricing.arcHandlesYourEverydayWorkWith"
    : "marketing.arcPublicPricing.forManyComputersAndAutomation";
}

/** About how many typical Arc tasks a Credit allowance covers, rounded down to two
 * significant figures so the estimate never overstates the allowance. */
export function approxTaskCount(credits: number) {
  const tasks = Math.floor(Math.max(0, credits) / ARC_TYPICAL_TASK_CREDITS),
    step = tasks >= 1000 ? 100 : tasks >= 100 ? 10 : 1;
  return Math.floor(tasks / step) * step;
}

/** Price per month as the plan card shows it: the yearly price per month when one is offered. */
export function planMonthlyCents(plan: Plan) {
  const yearly = isConnectOnlyPlan(plan) && plan.yearlyPriceCents ? plan.yearlyPriceCents : null;
  return { cents: yearly ? yearly / 12 : plan.monthlyPriceCents, billedYearlyCents: yearly };
}
