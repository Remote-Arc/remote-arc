import { ProductIcon } from "../../../components/product-icon.js";
import { usePlatformCatalog } from "../../../hooks/use-platform-catalog.js";
import { useI18n } from "../../../hooks/use-i18n.js";
import { localizedWebsiteHref } from "../../../lib/marketing-paths.js";
import { isConnectOnlyPlan, offeredPlans } from "../../billing/arc-billing-client.js";
import { planCardFeatures } from "../plan-card-features.js";
import { planAnchor, planAudienceKey, planMonthlyCents } from "../plan-copy.js";
import { SectionTitle } from "./section-title.js";
import "../../../styles/marketing/home/home-pricing.css";

const price = (cents: number) =>
  "US$" + (Number.isInteger(cents / 100) ? cents / 100 : (cents / 100).toFixed(2));

/**
 * The plans straight after the hero, read from the same catalog as /pricing.
 * Each card shows the price, who it is for and its first three terms, and links
 * to that plan on /pricing, where checkout and the full list live.
 */
export function HomePricing() {
  const { tr, locale } = useI18n();
  const catalog = usePlatformCatalog();
  const plans = catalog ? offeredPlans(catalog.plans) : [];
  return (
    <section
      className="homePricing sectionBlock"
      id="pricing"
      aria-labelledby="home-pricing-heading"
    >
      <header className="modernSectionIntro">
        <span className="eyebrow">{tr("marketing.home.homePricing.eyebrow")}</span>
        <SectionTitle id="home-pricing-heading" text={tr("marketing.home.homePricing.title")} />
        <p>{tr("marketing.planSummary.everyPlanHasEveryConnectTool")}</p>
      </header>
      {catalog && plans.length > 0 && (
        <div className="homePricingPlans">
          {plans.map((plan) => {
            const featured = isConnectOnlyPlan(plan);
            const { cents, billedYearlyCents } = planMonthlyCents(plan);
            return (
              <article
                key={plan.id}
                className="homePricingPlan"
                data-featured={featured || undefined}
              >
                <header>
                  <h3>{plan.label}</h3>
                  {featured && (
                    <span className="homePricingBadge">
                      {tr("marketing.arcPublicPricing.recommended")}
                    </span>
                  )}
                </header>
                <p className="homePricingPrice">
                  <strong>{price(cents)}</strong>
                  <span>/ {tr("marketing.arcPublicPricing.month")}</span>
                </p>
                <p className="homePricingNote">
                  {billedYearlyCents
                    ? tr("marketing.arcPublicPricing.billedYearlyAtUs", {
                        yearly: billedYearlyCents / 100,
                      })
                    : tr(planAudienceKey(plan))}
                </p>
                {cents > 0 && (
                  <p className="homePricingArc">
                    <img src="/remote-arc.svg" alt="" width={16} height={16} />
                    {tr("marketing.home.homePricing.arcIncluded")}
                  </p>
                )}
                <ul>
                  {planCardFeatures(plan, catalog, tr)
                    .slice(0, 3)
                    .map((item) => (
                      <li key={item.text}>
                        <ProductIcon name="check" size={14} />
                        <span>{item.text}</span>
                      </li>
                    ))}
                </ul>
                <a
                  className={featured ? "primaryButton marketingPrimary" : "marketingSecondary"}
                  href={localizedWebsiteHref("/pricing", locale) + "#" + planAnchor(plan)}
                >
                  {tr("marketing.home.homePricing.seePlan", { label: plan.label })}
                  <ProductIcon name="arrowUpRight" size={15} />
                </a>
              </article>
            );
          })}
        </div>
      )}
      {/* What paid plans add beyond Connect: Arc, which works while you are away. */}
      <aside className="homePricingArcCallout">
        <img src="/remote-arc.svg" alt="" width={34} height={34} />
        <div>
          <strong>{tr("marketing.home.homePricing.arcCalloutTitle")}</strong>
          <p>{tr("marketing.home.homePricing.arcCalloutBody")}</p>
        </div>
        <a className="primaryButton" href={localizedWebsiteHref("/arc", locale)}>
          {tr("marketing.home.homePricing.arcCalloutLink")}
          <ProductIcon name="arrowUpRight" size={15} />
        </a>
      </aside>
      <a className="homePricingAll" href={localizedWebsiteHref("/pricing", locale)}>
        {tr("marketing.home.homePricing.comparePlans")} →
      </a>
    </section>
  );
}
