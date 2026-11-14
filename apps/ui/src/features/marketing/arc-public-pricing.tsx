import { ARC_TYPICAL_TASK_CREDITS, CONNECT_FAIR_USE } from "@remotearc/protocol";
import { useI18n } from "../../hooks/use-i18n.js";
import type { PlatformCatalog } from "../../hooks/use-platform-catalog.js";
import {
  checkoutProductSlug,
  isConnectOnlyPlan,
  offeredPlans,
  planIncludesArc,
} from "../billing/arc-billing-client.js";
import { planCardFeatures } from "./plan-card-features.js";
import { planDescriptionKey } from "./plan-copy.js";
import { PlanDetails } from "./plan-details-dialog.js";
export function ArcPublicPricing({
  catalog,
  startHref,
  usageHref,
}: {
  catalog: PlatformCatalog;
  startHref: string;
  usageHref: string;
}) {
  const { tr, locale } = useI18n(),
    billing = "https://agent.remotearc.app/checkout",
    plans = offeredPlans(catalog.plans),
    bundled = planIncludesArc(catalog.plans.find(isConnectOnlyPlan));
  // Once the paid plan includes Arc, every plan is one ladder; before that, plans
  // that bring your own AI and Arc's own agent plans are shown apart.
  const groups = bundled
    ? [
        {
          key: "all",
          title: tr("marketing.arcPublicPricing.onePlanForYourAiAndArc"),
          note: tr("marketing.arcPublicPricing.everyPlanWorksWithYourOwnAi"),
          plans,
        },
      ]
    : [
        {
          key: "own",
          title: tr("marketing.arcPublicPricing.bringYourOwnAi"),
          note: tr("marketing.arcPublicPricing.connectChatgptClaudeOrCodexTo"),
          plans: plans.filter((p) => p.id === "free" || isConnectOnlyPlan(p)),
        },
        {
          key: "arc",
          title: tr("marketing.arcPublicPricing.arcSOwnAgent"),
          note: tr("marketing.arcPublicPricing.arcRunsTheAiForYou"),
          plans: plans.filter((p) => p.id !== "free" && !isConnectOnlyPlan(p)),
        },
      ];
  return (
    <main className="pricingContent">
      <header className="pricingIntro">
        <span className="eyebrow">{tr("marketing.arcPublicPricing.clearPlansBoundedUsage")}</span>
        <h1>{tr("marketing.arcPublicPricing.aPersonalAgentAPlanThat")}</h1>
        <p>{tr("marketing.arcPublicPricing.connectYourExistingAiForFree")}</p>
      </header>
      <section className="arcPricingTrial">
        <div>
          <span className="eyebrow">ARC / {catalog.trial.days}-DAY TRIAL</span>
          <h2>{tr("marketing.arcPublicPricing.tryYourPersonalAgent")}</h2>
          <p>
            {tr("marketing.arcPublicPricing.daysCreditsActivateWhenYouAre", {
              days: catalog.trial.days,
              credits: catalog.trial.credits,
            })}
            {tr("marketing.arcPublicPricing.autoIsIncludedNamedModelsRequire")}
          </p>
        </div>
        <a className="primaryButton" href="https://agent.remotearc.app/dashboard/arc/chat">
          {tr("marketing.arcPublicPricing.startFreeTrial")} ↗
        </a>
      </section>
      <section
        className={"pricingPlans pricingPlans--saas" + (bundled ? " pricingPlans--bundled" : "")}
      >
        {groups.map((group) => (
          <div className="planGroup" key={group.key}>
            <header className="planGroupHeader">
              <h2>{group.title}</h2>
              <p>{group.note}</p>
            </header>
            <div className="planGroupCards">
              {group.plans.map((p) => {
                const connect = isConnectOnlyPlan(p),
                  yearly = connect && p.yearlyPriceCents ? p.yearlyPriceCents : null,
                  checkout =
                    billing +
                    "?" +
                    new URLSearchParams({ product: checkoutProductSlug(p.id), lang: locale });
                return (
                  <article
                    className={
                      "planCard " +
                      (p.id === "free" ? "freePlan" : connect ? "featuredPlan" : "arcPlan")
                    }
                    key={p.id}
                  >
                    {connect && (
                      <span className="planRibbon">
                        {tr("marketing.arcPublicPricing.recommended")}
                      </span>
                    )}
                    <div className="planHeader">
                      <span>{p.label.toUpperCase()}</span>
                      {!connect && p.id !== "free" && (
                        <span className="plusBadge">ARC + CONNECT</span>
                      )}
                    </div>
                    <div className="hostedPrice">
                      <strong>
                        {yearly ? (
                          <>
                            US${Math.floor(yearly / 1200)}
                            <small>.{(yearly / 1200).toFixed(2).split(".")[1]}</small>
                          </>
                        ) : (
                          "US$" + p.monthlyPriceCents / 100
                        )}
                      </strong>
                      <span>/ {tr("marketing.arcPublicPricing.month")}</span>
                    </div>
                    {yearly ? (
                      <>
                        <p className="hostedPriceNote">
                          {tr("marketing.arcPublicPricing.billedYearlyAtUs", {
                            yearly: yearly / 100,
                          })}{" "}
                          <span className="planSaveTag">
                            {tr("marketing.arcPublicPricing.save") +
                              Math.round((1 - yearly / (p.monthlyPriceCents * 12)) * 100) +
                              "%"}
                          </span>
                        </p>
                        <p className="hostedPriceNote">
                          {tr("marketing.arcPublicPricing.orUsMonthToMonth", {
                            monthlyPriceCents: p.monthlyPriceCents / 100,
                          })}
                        </p>
                      </>
                    ) : connect ? (
                      <p className="hostedPriceNote">
                        {tr("marketing.arcPublicPricing.aboutUsADay", {
                          toFixed: (p.monthlyPriceCents / 3000).toFixed(2),
                        })}
                      </p>
                    ) : null}
                    <p className="planDescription">{tr(planDescriptionKey(p))}</p>
                    <ul className="planIncluded">
                      {planCardFeatures(p, catalog, tr).map((item) => (
                        <li key={item}>
                          <span aria-hidden="true">✓</span>
                          {item}
                        </li>
                      ))}
                    </ul>
                    <PlanDetails plan={p} catalog={catalog} />
                    <div className="planActions">
                      <a
                        className={connect ? "primaryButton" : "ghostButton"}
                        href={
                          p.id === "free"
                            ? startHref
                            : checkout +
                              (yearly && catalog.billingAvailable ? "&interval=year" : "")
                        }
                      >
                        {p.id === "free"
                          ? tr("marketing.arcPublicPricing.startFree")
                          : !catalog.billingAvailable
                            ? tr("marketing.arcPublicPricing.viewBillingAvailability")
                            : yearly
                              ? tr("marketing.arcPublicPricing.chooseYearly")
                              : tr("marketing.arcPublicPricing.choose", { label: p.label })}{" "}
                        →
                      </a>
                      {yearly && catalog.billingAvailable ? (
                        <a className="planAltLink" href={checkout}>
                          {tr("marketing.arcPublicPricing.orPayMonthly")} →
                        </a>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        ))}
      </section>
      <p className="pricingFinePrint">
        {tr(
          bundled
            ? "marketing.arcPublicPricing.proFollowsPublishedFairUse"
            : "marketing.arcPublicPricing.connectUnlimitedFollowsPublishedFairUse",
          { computerRegistrationsPerDay: CONNECT_FAIR_USE.computerRegistrationsPerDay },
        )}
        {plans.some(planIncludesArc)
          ? " " +
            tr("marketing.arcPublicPricing.taskEstimateBasis", {
              credits: ARC_TYPICAL_TASK_CREDITS,
            })
          : null}
      </p>
      <section className="pricingEnterprise" aria-label="Enterprise">
        <div>
          <span className="planHeader">ENTERPRISE</span>
          <strong>{tr("marketing.arcPublicPricing.letSTalk")}</strong>
          <p>{tr("marketing.arcPublicPricing.customCapacityDeploymentSupportAndBilling")}</p>
        </div>
        <a
          className="ghostButton"
          href={(locale === "zh" ? "/zh" : "") + "/support?topic=enterprise"}
        >
          {tr("marketing.arcPublicPricing.contactUs")} →
        </a>
      </section>
      <section className="pricingMetering">
        <header>
          <span className="eyebrow">{tr("marketing.arcPublicPricing.yourUsageExplained")}</span>
          <h2>{tr("marketing.arcPublicPricing.moreWorkWithoutSurpriseBills")}</h2>
        </header>
        <div className="meteringGrid">
          <article>
            <span>01</span>
            <h3>{tr("marketing.arcPublicPricing.modelCredits")}</h3>
            <p>{tr("marketing.arcPublicPricing.autoPrioritizesLowCostAdvancedModels")}</p>
          </article>
          <article>
            <span>02</span>
            <h3>{tr("marketing.arcPublicPricing.connectCalls")}</h3>
            <p>{tr("marketing.arcPublicPricing.connectAllowanceIsSeparateFromModel")}</p>
          </article>
          <article>
            <span>03</span>
            <h3>{tr("marketing.arcPublicPricing.optionalTopUps")}</h3>
            <p>
              {catalog.topups[0]!.credits} Credits / ${catalog.topups[0]!.priceCents / 100}.{" "}
              {tr("marketing.arcPublicPricing.noAutomaticOverageChargesAnActive")}
            </p>
          </article>
        </div>
        <p>{tr("marketing.arcPublicPricing.monthlyCreditsExpireAtTheBilling")}</p>
        <a className="pricingUsageLink" href={usageHref}>
          {tr("marketing.arcPublicPricing.checkYourUsage")} →
        </a>
      </section>
    </main>
  );
}
