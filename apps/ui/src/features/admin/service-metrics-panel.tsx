import { useEffect, useState } from "react";
import type { ServiceMetrics } from "@remotearc/protocol";
import { useI18n } from "../../app/i18n.js";
import { MetricChart } from "./metric-chart.js";
import {
  durationLabel,
  sampleServiceMetrics,
  validServiceMetrics,
} from "./service-metrics-model.js";
import "./service-metrics.css";

export function ServiceMetricsPanel({
  hours,
  domain,
  revision,
  preview,
}: {
  hours: number;
  domain: string;
  revision: number;
  preview: boolean;
}) {
  const { tr, locale } = useI18n();
  const [data, setData] = useState<ServiceMetrics | null>(null),
    [busy, setBusy] = useState(false),
    [failed, setFailed] = useState(false);
  useEffect(() => {
    if (preview) {
      setData(sampleServiceMetrics(hours, domain));
      return;
    }
    const controller = new AbortController();
    setBusy(true);
    setFailed(false);
    setData(null);
    void fetch("/api/admin/metrics?" + new URLSearchParams({ hours: String(hours), domain }), {
      credentials: "same-origin",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw Error("Unavailable");
        const value: unknown = await response.json();
        if (!validServiceMetrics(value)) throw Error("Invalid metrics");
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
  const count = (value: number | undefined) =>
    value === undefined ? "—" : value.toLocaleString(locale === "zh" ? "zh-CN" : "en-US");
  return (
    <section
      className="serviceMetricPanel"
      aria-label={tr("Service metrics", "服务指标")}
      aria-busy={busy}
    >
      <header className="serviceMetricHeading">
        <div>
          <h2>{tr("Service metrics", "服务指标")}</h2>
          <p>
            {tr(
              "Request observations, response times and failures over time.",
              "按时间查看请求记录、响应耗时和失败变化。",
            )}
          </p>
        </div>
        {!preview && (
          <a
            className="adminOutlineBtn"
            href={
              "/api/admin/metrics?" +
              new URLSearchParams({ format: "prometheus", hours: String(hours), domain })
            }
            target="_blank"
            rel="noreferrer"
          >
            {tr("Export metrics", "导出指标")} ↗
          </a>
        )}
      </header>
      <p className="healthBoundary">
        {tr(
          "Recorded business observations, not complete Worker traffic. Missing latency samples remain blank; zero records do not prove the service is healthy.",
          "仅统计已记录业务事件，不代表 Worker 全量流量。没有耗时样本时保留空白，零记录不等于服务健康。",
        )}
      </p>
      <div className="serviceMetricTotals">
        <div>
          <span>{tr("HTTP observations", "HTTP 请求记录")}</span>
          <strong>{count(data?.totals.requests)}</strong>
        </div>
        <div>
          <span>{tr("HTTP 5xx recorded", "HTTP 5xx 记录")}</span>
          <strong>{count(data?.totals.serverErrors)}</strong>
        </div>
        <div>
          <span>{tr("Observed response P95", "记录响应耗时 P95")}</span>
          <strong>{durationLabel(data?.totals.p95Ms)}</strong>
        </div>
        <div>
          <span>{tr("Observed requests ≥ 1s", "慢请求记录 ≥ 1 秒")}</span>
          <strong>{count(data?.totals.slowRequests)}</strong>
        </div>
      </div>
      {failed ? (
        <div className="healthNotice" role="alert">
          {tr(
            "Metrics could not be read. Refresh to retry; the failure investigation below is independent.",
            "指标暂时无法读取，请刷新重试；下方异常排查仍可独立使用。",
          )}
        </div>
      ) : !data ? (
        <div className="serviceMetricsEmpty" role="status">
          {tr("Reading service metrics…", "正在读取服务指标…")}
        </div>
      ) : (
        <>
          <div className="serviceMetricGrid">
            <MetricChart
              title={tr("HTTP request observations", "HTTP 请求记录趋势")}
              note={tr("Recorded requests per interval", "每个时间段记录的请求数")}
              points={data.points}
              unit={tr("Requests", "次请求")}
              locale={locale}
              series={[{ key: "requests", label: tr("Recorded", "记录请求"), color: "#729eff" }]}
            />
            <MetricChart
              title={tr("HTTP errors", "HTTP 错误趋势")}
              note={tr(
                "HTTP response statuses; distinct from business failures",
                "按 HTTP 响应状态统计，与业务失败口径不同",
              )}
              points={data.points}
              unit={tr("Responses", "次响应")}
              locale={locale}
              series={[
                { key: "serverErrors", label: "5xx", color: "#ef8290" },
                { key: "clientErrors", label: "4xx", color: "#e6b56b" },
              ]}
            />
            <MetricChart
              title={tr("Response duration", "响应耗时趋势")}
              note={tr("P50 and P95 of recorded request durations", "记录请求耗时的 P50 与 P95")}
              points={data.points}
              unit="ms"
              locale={locale}
              series={[
                { key: "p50Ms", label: "P50", color: "#6bc8bd" },
                { key: "p95Ms", label: "P95", color: "#b69bff" },
              ]}
            />
            <MetricChart
              title={tr("Business failures", "业务失败趋势")}
              note={tr(
                "Recorded events, not unique incidents or failed tasks",
                "失败记录数，不等于独立故障或任务失败数",
              )}
              points={data.points}
              unit={tr("Events", "条记录")}
              locale={locale}
              series={[
                { key: "failures", label: tr("Failures", "失败记录"), color: "#ef8290" },
                { key: "attention", label: tr("Investigate", "需要排查"), color: "#e6b56b" },
              ]}
            />
          </div>
          <details className="metricDataTable">
            <summary>{tr("Exact interval values · UTC", "查看每个时间段的准确数值 · UTC")}</summary>
            <div>
              <table>
                <thead>
                  <tr>
                    <th>UTC</th>
                    <th>{tr("Requests", "请求")}</th>
                    <th>5xx</th>
                    <th>{tr("Failures", "失败")}</th>
                    <th>P50</th>
                    <th>P95</th>
                  </tr>
                </thead>
                <tbody>
                  {data.points.map((point) => (
                    <tr key={point.at}>
                      <td>{point.at.replace("T", " ").slice(0, 19)}</td>
                      <td>{point.requests}</td>
                      <td>{point.serverErrors}</td>
                      <td>{point.failures}</td>
                      <td>{durationLabel(point.p50Ms)}</td>
                      <td>{durationLabel(point.p95Ms)}</td>
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
