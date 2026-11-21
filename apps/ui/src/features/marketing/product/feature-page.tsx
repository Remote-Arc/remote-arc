import type { ReactNode } from "react";
import { useI18n } from "../../../hooks/use-i18n.js";
import { dashboardHref } from "../../../config/app-config.js";
import { CONNECT_UNLIMITED_PLAN_ID } from "@remotearc/protocol";
import { PRO_TRIAL_CHECKOUT_HREF, checkoutHref } from "../../billing/arc-billing-client.js";
import "../../../styles/marketing/product/feature-page.css";

const MAX_PLAN_ID = "arc-pro-v1";

export type FeaturePlanRow = { plan: "free" | "pro" | "max"; text: string };

/**
 * A product feature's own page: what it is, a picture of it working, how to
 * start, what each plan includes with upgrade and trial links, and details.
 * Copy comes from the caller, so each feature page stays a short list of keys.
 */
export function FeaturePage({
  id,
  eyebrow,
  title,
  lede,
  start,
  docs,
  visual,
  steps,
  plans,
  details,
  related,
}: {
  id: string;
  eyebrow: string;
  title: string;
  lede: string;
  start: { label: string; href: string };
  docs: { label: string; href: string };
  visual: ReactNode;
  steps: { title: string; text: string }[];
  plans: { title: string; note: string; rows: FeaturePlanRow[] };
  details: { title: string; text: string }[];
  related: { label: string; href: string }[];
}) {
  const { tr } = useI18n();
  const planNames = {
    free: "Free",
    pro: "Pro",
    max: "Max",
  } as const;
  return (
    <main className="featurePage" data-feature={id}>
      <section className="featureHero" aria-labelledby={id + "-title"}>
        <div className="featureHeroCopy">
          <span className="eyebrow">{eyebrow}</span>
          <h1 id={id + "-title"}>{title}</h1>
          <p>{lede}</p>
          <div className="featureCtas">
            <a className="primaryButton featurePrimary" href={start.href}>
              {start.label} ↗
            </a>
            <a className="featureSecondary" href={docs.href}>
              {docs.label} →
            </a>
          </div>
        </div>
        <div className="featureVisual">{visual}</div>
      </section>

      <section className="featureSteps" aria-labelledby={id + "-steps"}>
        <h2 id={id + "-steps"}>{tr("marketing.featurePage.howItWorks")}</h2>
        <ol>
          {steps.map((step, index) => (
            <li key={step.title}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="featurePlans" aria-labelledby={id + "-plans"}>
        <div className="featurePlansIntro">
          <h2 id={id + "-plans"}>{plans.title}</h2>
          <p>{plans.note}</p>
        </div>
        <div className="featurePlanCards">
          {plans.rows.map((row) => (
            <article key={row.plan} className="featurePlanCard" data-plan={row.plan}>
              <h3>{planNames[row.plan]}</h3>
              <p>{row.text}</p>
              {row.plan === "pro" && (
                <div className="featurePlanActions">
                  <a className="primaryButton" href={dashboardHref(PRO_TRIAL_CHECKOUT_HREF)}>
                    {tr("marketing.featurePage.startProTrial")} ↗
                  </a>
                  <a href={dashboardHref(checkoutHref(CONNECT_UNLIMITED_PLAN_ID))}>
                    {tr("marketing.featurePage.getPro")} →
                  </a>
                </div>
              )}
              {row.plan === "max" && (
                <div className="featurePlanActions">
                  <a href={dashboardHref(checkoutHref(MAX_PLAN_ID))}>
                    {tr("marketing.featurePage.getMax")} →
                  </a>
                </div>
              )}
            </article>
          ))}
        </div>
        <a className="featureComparePlans" href="/pricing">
          {tr("marketing.featurePage.comparePlans")} →
        </a>
      </section>

      <section className="featureDetails">
        {details.map((detail) => (
          <div key={detail.title}>
            <h2>{detail.title}</h2>
            <p>{detail.text}</p>
          </div>
        ))}
      </section>

      <nav className="featureRelated" aria-label={tr("marketing.featurePage.related")}>
        {related.map((link) => (
          <a key={link.href} href={link.href}>
            {link.label} →
          </a>
        ))}
      </nav>
    </main>
  );
}
