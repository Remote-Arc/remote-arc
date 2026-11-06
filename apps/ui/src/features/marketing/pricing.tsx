import { WorkspaceLoading } from "../../components/workspace-loading.js";
import { useI18n } from "../../hooks/use-i18n.js";
import "../../styles/marketing/pricing.css";
import { usePlatformCatalog } from "../../hooks/use-platform-catalog.js";
import { ArcPublicPricing } from "./arc-public-pricing.js";

export function PricingContent({
  startHref,
  usageHref,
}: {
  startHref: string;
  usageHref: string;
  signedIn: boolean;
  currentPlan: "free" | "connect" | "plus" | null;
}) {
  const { tr } = useI18n(),
    catalog = usePlatformCatalog();
  if (catalog)
    return <ArcPublicPricing catalog={catalog} startHref={startHref} usageHref={usageHref} />;
  return (
    <main className="pricingContent">
      <header className="pricingIntro">
        <h1>{tr("marketing.pricing.aPlanForYourWork")}</h1>
        <WorkspaceLoading
          label={tr("marketing.pricing.loadingCurrentPricesAndAllowances")}
          variant="cards"
        />
        <a className="primaryButton" href={usageHref}>
          {tr("marketing.pricing.viewPlansInYourWorkspace")} →
        </a>
      </header>
    </main>
  );
}
