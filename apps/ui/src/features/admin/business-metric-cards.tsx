import type { ServiceMetrics } from "@remotearc/protocol";
import { useI18n } from "../../hooks/use-i18n.js";
import { domainLabels } from "./service-health-model.js";

const coreModules = ["mcp", "apps", "devices", "tasks", "billing"];

export function BusinessMetricCards({
  data,
  domain,
  selectDomain,
}: {
  data: ServiceMetrics | null;
  domain: string;
  selectDomain: (domain: string) => void;
}) {
  const { tr, locale } = useI18n();
  const modules = data?.modules.filter(
    (item) => domain || coreModules.includes(item.domain) || item.failures > 0,
  );
  const count = (value: number | undefined) =>
    value === undefined ? "—" : value.toLocaleString(locale === "zh" ? "zh-CN" : "en-US");
  return (
    <section
      className="businessMetrics"
      aria-label={tr("admin.businessMetricCards.businessModules")}
    >
      <header>
        <h3>{tr("admin.businessMetricCards.businessModules")}</h3>
        <p>{tr("admin.businessMetricCards.recordedFailuresByModuleSelectA")}</p>
      </header>
      <div className="businessMetricCards">
        {(
          modules ||
          coreModules.map((module) => ({
            domain: module,
            failures: undefined,
            attention: undefined,
          }))
        ).map((item) => {
          const labels = domainLabels[item.domain];
          const label = labels ? tr(labels) : tr("admin.businessMetricCards.otherModules");
          return (
            <button
              key={item.domain}
              type="button"
              aria-pressed={domain === item.domain}
              aria-label={tr("admin.businessMetricCards.viewMetrics", { label })}
              disabled={!data || !labels}
              onClick={() => selectDomain(domain === item.domain ? "" : item.domain)}
            >
              <span>
                {label}
                <span aria-hidden="true">→</span>
              </span>
              <strong>{count(item.failures)}</strong>
              <small>{tr("admin.businessMetricCards.recordedFailures")}</small>
              <small>
                {tr("admin.businessMetricCards.investigate")} <b>{count(item.attention)}</b>
              </small>
            </button>
          );
        })}
      </div>
    </section>
  );
}
