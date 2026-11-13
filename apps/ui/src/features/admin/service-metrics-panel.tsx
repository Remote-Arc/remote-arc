import { useEffect, useState } from "react";
import type { ServiceMetrics } from "@remotearc/protocol";
import { useI18n } from "../../hooks/use-i18n.js";
import { MetricChart } from "./metric-chart.js";
import { BusinessMetricCards } from "./business-metric-cards.js";
import { sampleServiceMetrics, validServiceMetrics } from "./service-metrics-model.js";
import "../../styles/admin/service-metrics.css";

export function ServiceMetricsPanel({
  hours,
  domain,
  revision,
  preview,
  selectDomain,
}: {
  hours: number;
  domain: string;
  revision: number;
  preview: boolean;
  selectDomain: (domain: string) => void;
}) {
  const { tr, locale } = useI18n();
  const [data, setData] = useState<ServiceMetrics | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (preview) {
      setData(sampleServiceMetrics(hours, domain, true));
      return;
    }
    const controller = new AbortController();
    setBusy(true);
    setFailed(false);
    setData(null);
    void fetch(
      "/api/admin/metrics?" +
        new URLSearchParams({ view: "business", hours: String(hours), domain }),
      {
        credentials: "same-origin",
        signal: controller.signal,
      },
    )
      .then(async (response) => {
        if (!response.ok) throw Error("Unavailable");
        const value: unknown = await response.json();
        if (!validServiceMetrics(value) || value.coverage !== "recorded_business_errors")
          throw Error("Invalid metrics");
        if (!controller.signal.aborted) setData(value);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [hours, domain, revision, preview]);
  return (
    <section
      className="serviceMetricPanel"
      id="business-error-metrics"
      aria-label={tr("admin.serviceMetricsPanel.businessErrorMetrics")}
      aria-busy={busy}
    >
      <header className="serviceMetricHeading">
        <div>
          <h2>{tr("admin.serviceMetricsPanel.businessErrorMetrics")}</h2>
          <p>{tr("admin.serviceMetricsPanel.errorsAndBusinessLimitsByModule")}</p>
        </div>
      </header>
      <p className="healthBoundary">
        {tr("admin.serviceMetricsPanel.includesBusinessFailuresReturnedWithHttp")}
      </p>
      <BusinessMetricCards data={data} domain={domain} selectDomain={selectDomain} />
      {failed ? (
        <div className="healthNotice" role="alert">
          {tr("admin.serviceMetricsPanel.businessErrorMetricsCouldNotBe")}
        </div>
      ) : !data ? (
        <div className="serviceMetricsEmpty" role="status">
          {tr("admin.serviceMetricsPanel.readingBusinessErrors")}
        </div>
      ) : (
        <>
          <MetricChart
            title={tr("admin.serviceMetricsPanel.businessFailures")}
            note={tr("admin.serviceMetricsPanel.recordedFailuresAndTheSubsetNeeding")}
            points={data.points}
            unit={tr("admin.serviceMetricsPanel.events")}
            locale={locale}
            series={[
              {
                key: "failures",
                label: tr("admin.serviceMetricsPanel.failures"),
                color: "#ef8290",
              },
              {
                key: "attention",
                label: tr("admin.serviceMetricsPanel.investigate"),
                color: "#e6b56b",
              },
            ]}
          />
          <details className="metricDataTable">
            <summary>{tr("admin.serviceMetricsPanel.exactIntervalValuesUtc")}</summary>
            <div>
              <table>
                <thead>
                  <tr>
                    <th>UTC</th>
                    <th>{tr("admin.serviceMetricsPanel.failures2")}</th>
                    <th>{tr("admin.serviceMetricsPanel.investigate")}</th>
                    <th>{tr("admin.serviceMetricsPanel.affectedUsers")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.points.map((point) => (
                    <tr key={point.at}>
                      <td>{point.at.replace("T", " ").slice(0, 19)}</td>
                      <td>{point.failures}</td>
                      <td>{point.attention}</td>
                      <td>{point.affectedUsers}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </section>
  );
}
