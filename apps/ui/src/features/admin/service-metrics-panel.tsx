import { useEffect, useState } from "react";
import type { ServiceMetrics } from "@remotearc/protocol";
import { useI18n } from "../../app/i18n.js";
import { MetricChart } from "./metric-chart.js";
import { BusinessMetricCards } from "./business-metric-cards.js";
import { sampleServiceMetrics, validServiceMetrics } from "./service-metrics-model.js";
import "./service-metrics.css";

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
      aria-label={tr("Business error metrics", "业务错误指标")}
      aria-busy={busy}
    >
      <header className="serviceMetricHeading">
        <div>
          <h2>{tr("Business error metrics", "业务错误指标")}</h2>
          <p>
            {tr(
              "Errors and business limits by module, with trends and request details below.",
              "按业务模块查看错误、额度拦截及变化趋势，并关联下方排查明细。",
            )}
          </p>
        </div>
      </header>
      <p className="healthBoundary">
        {tr(
          "Includes business failures returned with HTTP 200. Records are not unique failed users or orders; missing records do not prove business success.",
          "包含 HTTP 200 中的业务失败。记录数不等于失败用户数或订单数，缺少记录不代表业务成功。",
        )}
      </p>
      <BusinessMetricCards data={data} domain={domain} selectDomain={selectDomain} />
      {failed ? (
        <div className="healthNotice" role="alert">
          {tr(
            "Business error metrics could not be read. Refresh to retry; the error investigation remains available.",
            "业务错误指标暂时无法读取，请刷新重试；下方错误排查仍可独立使用。",
          )}
        </div>
      ) : !data ? (
        <div className="serviceMetricsEmpty" role="status">
          {tr("Reading business errors…", "正在读取业务错误指标…")}
        </div>
      ) : (
        <>
          <MetricChart
            title={tr("Business failures", "业务失败趋势")}
            note={tr(
              "Recorded failures and the subset needing investigation",
              "失败记录及其中需要排查的记录",
            )}
            points={data.points}
            unit={tr("Events", "条记录")}
            locale={locale}
            series={[
              { key: "failures", label: tr("Failures", "失败记录"), color: "#ef8290" },
              { key: "attention", label: tr("Investigate", "需要排查"), color: "#e6b56b" },
            ]}
          />
          <details className="metricDataTable">
            <summary>{tr("Exact interval values · UTC", "查看每个时间段的准确数值 · UTC")}</summary>
            <div>
              <table>
                <thead>
                  <tr>
                    <th>UTC</th>
                    <th>{tr("Failures", "失败")}</th>
                    <th>{tr("Investigate", "需要排查")}</th>
                    <th>{tr("Affected users", "关联用户")}</th>
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
