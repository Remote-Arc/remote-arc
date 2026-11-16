import { CONNECT_FREE_OVERFLOW } from "@remotearc/protocol";
import type { MessageKey } from "../../locales/locale-catalog.js";
import { useI18n } from "../../hooks/use-i18n.js";
import type { CatalogPlan, PlatformCatalog } from "../../hooks/use-platform-catalog.js";
import "../../styles/marketing/plan-comparison.css";
import { planAudienceKey } from "./plan-copy.js";

type Cell = string | boolean;
type Row = { key: MessageKey; cell: (plan: CatalogPlan) => Cell };

/** Every term the plan cards show, side by side. Values come from the published
 * catalog; a feature switch a version does not set is included. */
export function PlanComparison({
  plans,
  catalog,
}: {
  plans: readonly CatalogPlan[];
  catalog: PlatformCatalog;
}) {
  const { tr, locale } = useI18n(),
    count = (value: number) => value.toLocaleString(locale === "zh" ? "zh-CN" : "en-US"),
    unlimited = tr("marketing.planComparison.unlimited"),
    included = (
      plan: CatalogPlan,
      key: "notifications" | "unattendedBrowser" | "fleetRun" | "apps" | "unattendedApps",
    ) => plan[key] !== false;
  const rows: Row[] = [
    { key: "marketing.planComparison.bestFor", cell: (p) => tr(planAudienceKey(p)) },
    {
      key: "marketing.planComparison.price",
      cell: (p) =>
        p.monthlyPriceCents === 0
          ? tr("marketing.planComparison.free")
          : tr("marketing.planComparison.pricePerMonth", { price: p.monthlyPriceCents / 100 }) +
            (p.yearlyPriceCents
              ? " · " +
                tr("marketing.planComparison.pricePerYear", { price: p.yearlyPriceCents / 100 })
              : ""),
    },
    {
      key: "marketing.planComparison.connectCalls",
      cell: (p) =>
        p.connectToolCalls === null
          ? unlimited
          : tr("marketing.planComparison.callsPerMonth", { calls: count(p.connectToolCalls) }) +
            (p.connectWriteCalls
              ? " · " +
                tr("marketing.planComparison.writesUpTo", { writes: count(p.connectWriteCalls) })
              : ""),
    },
    {
      key: "marketing.planComparison.afterTheAllowance",
      cell: (p) =>
        p.connectToolCalls === null
          ? tr("marketing.planComparison.noCap")
          : tr("marketing.planComparison.trialThenReadOnly", {
              days: CONNECT_FREE_OVERFLOW.trialDays,
              perMinute: CONNECT_FREE_OVERFLOW.slowLaneCallsPerMinute,
            }),
    },
    {
      key: "marketing.planComparison.computers",
      cell: (p) => (p.deviceLimit === null ? unlimited : count(p.deviceLimit)),
    },
    {
      key: "marketing.planComparison.arcCredits",
      cell: (p) =>
        p.monthlyCredits > 0
          ? tr("marketing.planComparison.creditsPerMonth", { credits: count(p.monthlyCredits) })
          : tr("marketing.planComparison.trialCredits", {
              days: catalog.trial.days,
              credits: count(catalog.trial.credits),
            }),
    },
    {
      key: "marketing.planComparison.routines",
      cell: (p) => (p.routines === undefined ? false : count(p.routines)),
    },
    {
      key: "marketing.planComparison.parallelTasks",
      cell: (p) =>
        tr("marketing.planComparison.parallelAndLength", {
          runs: p.concurrentRuns,
          minutes: Math.round(p.maxSeconds / 60),
        }),
    },
    {
      key: "marketing.planComparison.apps",
      // How many accounts a plan can connect; a plan without Apps has them in the Arc trial.
      cell: (p) =>
        !included(p, "apps")
          ? tr("marketing.planComparison.appsDuringTrial", { days: catalog.trial.days })
          : p.connectionLimit
            ? tr("marketing.planComparison.upToConnections", { count: count(p.connectionLimit) })
            : true,
    },
    {
      key: "marketing.planComparison.appsInRoutines",
      cell: (p) => included(p, "unattendedApps"),
    },
    {
      key: "marketing.planComparison.browserInRoutines",
      cell: (p) => included(p, "unattendedBrowser"),
    },
    { key: "marketing.planComparison.notifications", cell: (p) => included(p, "notifications") },
    { key: "marketing.planComparison.fleetRun", cell: (p) => included(p, "fleetRun") },
    { key: "marketing.planComparison.safety", cell: () => true },
  ];
  return (
    <section className="planComparison" aria-labelledby="plan-comparison-title">
      <header>
        <h2 id="plan-comparison-title">{tr("marketing.planComparison.compareEveryPlan")}</h2>
        <p>{tr("marketing.planComparison.sameNumbersAsCheckout")}</p>
      </header>
      <div className="planComparisonScroll">
        <table>
          <thead>
            <tr>
              <th scope="col">
                <span className="visuallyHidden">{tr("marketing.planComparison.term")}</span>
              </th>
              {plans.map((plan) => (
                <th scope="col" key={plan.id}>
                  {plan.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                <th scope="row">{tr(row.key)}</th>
                {plans.map((plan) => {
                  const value = row.cell(plan);
                  return (
                    <td key={plan.id} data-label={plan.label}>
                      {value === true ? (
                        <span className="planComparisonYes">
                          <span aria-hidden="true">✓</span>
                          <span className="visuallyHidden">
                            {tr("marketing.planComparison.included")}
                          </span>
                        </span>
                      ) : value === false ? (
                        <span className="planComparisonNo">
                          <span aria-hidden="true">—</span>
                          <span className="visuallyHidden">
                            {tr("marketing.planComparison.notIncluded")}
                          </span>
                        </span>
                      ) : (
                        value
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
