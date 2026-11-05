import type { ServiceMetrics } from "@remotearc/protocol";
import { useI18n } from "../../app/i18n.js";
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
    <section className="businessMetrics" aria-label={tr("Business modules", "业务模块指标")}>
      <header>
        <h3>{tr("Business modules", "业务模块指标")}</h3>
        <p>
          {tr(
            "Recorded failures by module. Select a module to inspect its trends and errors below.",
            "按模块查看失败记录，点击可查看对应趋势和下方错误明细。",
          )}
        </p>
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
          const label = labels ? tr(...labels) : tr("Other modules", "其他模块");
          return (
            <button
              key={item.domain}
              type="button"
              aria-pressed={domain === item.domain}
              aria-label={tr(`View ${label} metrics`, `查看${label}指标`)}
              disabled={!data || !labels}
              onClick={() => selectDomain(domain === item.domain ? "" : item.domain)}
            >
              <span>
                {label}
                <span aria-hidden="true">→</span>
              </span>
              <strong>{count(item.failures)}</strong>
              <small>{tr("Recorded failures", "已记录失败")}</small>
              <small>
                {tr("Investigate", "需要排查")} <b>{count(item.attention)}</b>
              </small>
            </button>
          );
        })}
      </div>
    </section>
  );
}
