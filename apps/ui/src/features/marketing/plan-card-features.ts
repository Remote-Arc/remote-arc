import { CONNECT_FREE_OVERFLOW } from "@remotearc/protocol";
import type { CatalogPlan, PlatformCatalog } from "../../hooks/use-platform-catalog.js";
import type { Translate } from "../../locales/locale-catalog.js";
import { isConnectOnlyPlan, planIncludesArc } from "../billing/arc-billing-client.js";
import { approxTaskCount } from "./plan-copy.js";

/** Every plan with Arc lists the same terms in the same order, so Pro and Max can
 * be compared line by line. Credits come after the capacity terms. */
function arcPlanFeatures(plan: CatalogPlan, tr: Translate) {
  const count = (value: number) => value.toLocaleString();
  return [
    plan.connectToolCalls === null
      ? tr("marketing.arcPublicPricing.yourAgentsAtFullSpeedAll")
      : count(plan.connectToolCalls) + tr("marketing.arcPublicPricing.connectCallsMonth"),
    plan.deviceLimit != null
      ? tr("marketing.arcPublicPricing.upToComputersAndUnlimitedTransfer", {
          computers: count(plan.deviceLimit),
        })
      : tr("marketing.arcPublicPricing.unlimitedComputersAndFileTransfer"),
    tr("marketing.arcPublicPricing.tasksAtOnceUpToMinutes", {
      runs: count(plan.concurrentRuns),
      minutes: count(Math.round(plan.maxSeconds / 60)),
    }),
    ...(plan.routines
      ? [tr("marketing.arcPublicPricing.upToRoutines", { routines: count(plan.routines) })]
      : []),
    tr("marketing.arcPublicPricing.creditsMonthAboutTasks", {
      credits: count(plan.monthlyCredits),
      tasks: count(approxTaskCount(plan.monthlyCredits)),
    }),
    tr("marketing.arcPublicPricing.terminalFilesBrowserFleetAndConnected"),
    tr("marketing.arcPublicPricing.yourAiOrArcAutoAndNamed"),
  ];
}

/** The checklist on one public pricing card, read from the live catalog. */
export function planCardFeatures(plan: CatalogPlan, catalog: PlatformCatalog, tr: Translate) {
  if (planIncludesArc(plan)) return arcPlanFeatures(plan, tr);
  if (isConnectOnlyPlan(plan))
    return [
      tr("marketing.arcPublicPricing.yourAgentsAtFullSpeedAll"),
      tr("marketing.arcPublicPricing.unlimitedComputersAndFileTransfer"),
      tr("marketing.arcPublicPricing.terminalFilesBrowserFleetAndConnected"),
      tr("marketing.arcPublicPricing.worksWithYourOwnChatgptClaude"),
    ];
  return [
    (catalog.connectFreeCalls === null
      ? tr("marketing.arcPublicPricing.unlimited")
      : catalog.connectFreeCalls.toLocaleString()) +
      tr("marketing.arcPublicPricing.connectCallsMonth"),
    tr("marketing.arcPublicPricing.runOutAOneTimeDay", {
      trialDays: CONNECT_FREE_OVERFLOW.trialDays,
      slowLaneCallsPerMinute: CONNECT_FREE_OVERFLOW.slowLaneCallsPerMinute,
    }),
    tr("marketing.arcPublicPricing.upToComputers"),
    tr("marketing.arcPublicPricing.gbFileTransferMonth"),
    tr("marketing.arcPublicPricing.devicePermissionsAndLocalUndo"),
  ];
}
