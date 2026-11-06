import { canonicalErrorEnvelope } from "../../../../../packages/protocol/src/error-codes.js";
import React, { useEffect, useMemo, useState } from "react";
import { useI18n } from "../../hooks/use-i18n.js";
import "../../styles/admin/user-usage-insights.css";

type Insight = {
  month: string;
  timeZone: string;
  chargedCalls: number;
  audited: { total: number; succeeded: number; failed: number };
  daily: { day: string; calls: number; failures: number }[];
  tools: { tool: string; calls: number; failures: number }[];
  outcomes: { outcome: string; calls: number }[];
  taskSuccessAvailable: boolean;
  retriesAvailable: boolean;
  preview?: boolean;
  work?: {
    deviceOperations: number;
    stateChecks: number;
    apps: { total: number; succeeded: number; failed: number; unknown: number };
    arc: { total: number; succeeded: number; failed: number; unknown: number };
    completedGoals: null;
    retries: null;
  };
  cost?: {
    currency: string;
    modelCostMicros: number | null;
    settledRequests: number;
    unresolvedRequests: number;
    cloudCostMicros: null;
    totalCostMicros: null;
    basis: string;
  };
};
const fmt = (v: number) => v.toLocaleString();

export function AdminUserUsageInsights({
  userId,
  used,
  allowance,
  extra,
}: {
  userId: string;
  used: number;
  allowance: number | null;
  extra: number;
}) {
  const { tr } = useI18n();
  const [data, setData] = useState<Insight | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError("");
    setLoading(true);
    void fetch("/api/admin/usage-insights?userId=" + encodeURIComponent(userId), {
      credentials: "same-origin",
      cache: "no-store",
    })
      .then(async (r) => {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json().then(canonicalErrorEnvelope) as Promise<Insight>;
      })
      .then((value) => {
        if (!cancelled) setData(value);
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, revision]);
  const pct = allowance === null ? 0 : Math.min(100, (used / Math.max(1, allowance)) * 100);
  const highest = Math.max(1, ...(data?.daily || []).map((day) => day.calls));
  const maxTool = Math.max(1, ...(data?.tools || []).map((tool) => tool.calls));
  const days = useMemo(() => {
    if (!data) return [];
    const lookup = new Map(data.daily.map((item) => [item.day, item]));
    const today = new Date().toISOString().slice(0, 10);
    const year = Number(data.month.slice(0, 4)),
      month = Number(data.month.slice(5, 7));
    const numberOfDays = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const lastDay = today.startsWith(data.month) ? Number(today.slice(-2)) : numberOfDays;
    return Array.from({ length: lastDay }, (_, idx) => {
      const day = data.month + "-" + String(idx + 1).padStart(2, "0");
      return { day, calls: lookup.get(day)?.calls || 0, failures: lookup.get(day)?.failures || 0 };
    });
  }, [data]);
  return (
    <section className="usageInsight" aria-label={tr("admin.userUsageInsights.usageDiagnostics")}>
      <div className="usageInsightTop">
        <div>
          <span className="usageInsightEyebrow">
            {tr("admin.userUsageInsights.usageIntelligence")} ·{" "}
            {data?.month || tr("admin.userUsageInsights.currentMonth")}
          </span>
          <h3>{tr("admin.userUsageInsights.whereTheCallsWent")}</h3>
          <p>{tr("admin.userUsageInsights.privacySafeMetadataOnlyNoDevice")}</p>
        </div>
        <div className="usageInsightTopActions">
          {data?.preview && (
            <span className="usageInsightPreview">{tr("admin.userUsageInsights.sampleData")}</span>
          )}
          {allowance !== null && (
            <span
              className={"usageInsightStatus " + (pct >= 100 ? "isMax" : pct >= 80 ? "isHigh" : "")}
            >
              {pct >= 100
                ? tr("admin.userUsageInsights.limitReached")
                : pct >= 80
                  ? tr("admin.userUsageInsights.nearLimit")
                  : tr("admin.userUsageInsights.withinBudget")}
            </span>
          )}
          <button
            type="button"
            disabled={loading}
            onClick={() => setRevision((value) => value + 1)}
          >
            {tr("admin.userUsageInsights.refreshDiagnostics")}
          </button>
        </div>
      </div>
      {data && (
        <div className="usageQualityGrid">
          {data.preview && (
            <p className="usageQualityPreviewNote">
              {tr("admin.userUsageInsights.previewWithSampleDataTheseFigures")}
            </p>
          )}
          <section
            className="usageQualityPane"
            aria-label={tr("admin.userUsageInsights.workDelivered")}
          >
            <header>
              <h4>{tr("admin.userUsageInsights.workDelivered")}</h4>
              <span>{tr("admin.userUsageInsights.recordedOutcomes")}</span>
            </header>
            <div className="usageQualityHeadline">
              <strong>
                {data.work ? fmt(data.work.deviceOperations + data.work.apps.succeeded) : "—"}
              </strong>
              <span>{tr("admin.userUsageInsights.successfulOperations")}</span>
            </div>
            <p>{tr("admin.userUsageInsights.successfulDeviceAndAppOperationsExcluding")}</p>
            <dl>
              <div>
                <dt>{tr("admin.userUsageInsights.deviceAppSuccesses")}</dt>
                <dd>
                  {data.work
                    ? fmt(data.work.deviceOperations) + " / " + fmt(data.work.apps.succeeded)
                    : "—"}
                </dd>
              </div>
              <div>
                <dt>{tr("admin.userUsageInsights.successfulArcRuns")}</dt>
                <dd>
                  {data.work ? fmt(data.work.arc.succeeded) : "—"}
                  <small>
                    {data.work
                      ? tr("admin.userUsageInsights.ofStarted", { total: fmt(data.work.arc.total) })
                      : ""}
                  </small>
                </dd>
              </div>
              <div>
                <dt>{tr("admin.userUsageInsights.statusWaitCalls")}</dt>
                <dd>
                  {data.work ? fmt(data.work.stateChecks) : "—"}
                  <small>
                    {data.work && data.audited.total
                      ? ((data.work.stateChecks / data.audited.total) * 100).toFixed(1) +
                        "% " +
                        tr("admin.userUsageInsights.ofAuditedDeviceCalls")
                      : ""}
                  </small>
                </dd>
              </div>
              <div>
                <dt>{tr("admin.userUsageInsights.failedDispatchesAppCalls")}</dt>
                <dd>
                  {data.work ? fmt(data.audited.failed) + " / " + fmt(data.work.apps.failed) : "—"}
                </dd>
              </div>
              <div>
                <dt>{tr("admin.userUsageInsights.retriesCompletedUserGoals")}</dt>
                <dd className="usageQualityUnknown">
                  {tr("admin.userUsageInsights.notTrackedReliably")}
                </dd>
              </div>
            </dl>
          </section>
          <section
            className="usageQualityPane"
            aria-label={tr("admin.userUsageInsights.costVisibility")}
          >
            <header>
              <h4>{tr("admin.userUsageInsights.costVisibility")}</h4>
              <span>{tr("admin.userUsageInsights.usdPartial")}</span>
            </header>
            <div className="usageQualityHeadline">
              <strong>
                {data.cost?.modelCostMicros === null || data.cost?.modelCostMicros === undefined
                  ? "—"
                  : new Intl.NumberFormat("en-US", {
                      style: "currency",
                      currency: "USD",
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 4,
                    }).format(data.cost.modelCostMicros / 1_000_000)}
              </strong>
              <span>{tr("admin.userUsageInsights.recordedArcModelCost")}</span>
            </div>
            <p>{tr("admin.userUsageInsights.calculatedFromRecordedUsageAndModel")}</p>
            <dl>
              <div>
                <dt>{tr("admin.userUsageInsights.settledModelRequests")}</dt>
                <dd>{data.cost ? fmt(data.cost.settledRequests) : "—"}</dd>
              </div>
              <div>
                <dt>{tr("admin.userUsageInsights.unresolvedModelRequests")}</dt>
                <dd>{data.cost ? fmt(data.cost.unresolvedRequests) : "—"}</dd>
              </div>
              <div>
                <dt>Workers / D1 / R2 / Relay</dt>
                <dd className="usageQualityUnknown">
                  {tr("admin.userUsageInsights.notAttributedPerUser")}
                </dd>
              </div>
              <div>
                <dt>{tr("admin.userUsageInsights.externalAiClientCost")}</dt>
                <dd className="usageQualityUnknown">
                  {tr("admin.userUsageInsights.outsideThisLedger")}
                </dd>
              </div>
              <div>
                <dt>{tr("admin.userUsageInsights.totalCostMargin")}</dt>
                <dd className="usageQualityUnknown">
                  {tr("admin.userUsageInsights.incompleteCoverage")}
                </dd>
              </div>
            </dl>
          </section>
        </div>
      )}
      <div className="usageInsightStats">
        <div>
          <span>{tr("admin.userUsageInsights.meteredConnectCalls")}</span>
          <strong>{fmt(used)}</strong>
          <small>
            {allowance === null
              ? tr("admin.userUsageInsights.unlimitedAllowance")
              : tr("admin.userUsageInsights.of") + fmt(allowance)}
            {extra > 0 ? " · +" + fmt(extra) + " " + tr("admin.userUsageInsights.granted") : ""}
          </small>
        </div>
        <div>
          <span>{tr("admin.userUsageInsights.auditedDeviceCalls")}</span>
          <strong>{data ? fmt(data.audited.total) : "—"}</strong>
          <small>{tr("admin.userUsageInsights.subsetOfAllChargedCalls")}</small>
        </div>
        <div>
          <span>{tr("admin.userUsageInsights.dispatchFailures")}</span>
          <strong>{data ? fmt(data.audited.failed) : "—"}</strong>
          <small>{tr("admin.userUsageInsights.notATaskFailureRate")}</small>
        </div>
      </div>
      {loading && (
        <div className="usageInsightEmpty" role="status">
          {tr("admin.userUsageInsights.loadingUsageMetadata")}
        </div>
      )}
      {error && (
        <div className="usageInsightEmpty" role="alert">
          {tr("admin.userUsageInsights.diagnosticsUnavailableAccountQuotaIsStill")} · {error}
        </div>
      )}
      {data && (
        <div className="usageInsightBody">
          <div className="usageInsightPane">
            <div className="usageInsightPaneTitle">
              <strong>{tr("admin.userUsageInsights.dailyDeviceDispatches")}</strong>
              <small>{tr("admin.userUsageInsights.utcCurrentMonth")}</small>
            </div>
            {data.audited.total === 0 ? (
              <p className="usageInsightEmpty">
                {tr("admin.userUsageInsights.noDeviceDispatchAuditRowsThis")}
              </p>
            ) : (
              <div
                className="usageInsightChart"
                role="img"
                aria-label={tr("admin.userUsageInsights.dailyAuditedDeviceCallsChart")}
              >
                {days.map((day) => (
                  <div
                    key={day.day}
                    className="usageInsightDay"
                    title={
                      day.day +
                      " · " +
                      day.calls +
                      " " +
                      tr("admin.userUsageInsights.calls") +
                      " · " +
                      day.failures +
                      " " +
                      tr("admin.userUsageInsights.failed")
                    }
                  >
                    <div
                      className="usageInsightDayBar"
                      style={{
                        height: Math.max(day.calls ? 3 : 0, (day.calls / highest) * 100) + "%",
                      }}
                    />
                    <small>
                      {day.day.endsWith("-01") || Number(day.day.slice(-2)) % 5 === 0
                        ? Number(day.day.slice(-2))
                        : ""}
                    </small>
                  </div>
                ))}
              </div>
            )}
            <div className="usageInsightLegend">
              <span>
                <i />
                {tr("admin.userUsageInsights.auditedDeviceCalls2")}
              </span>
              <span>{tr("admin.userUsageInsights.aCallACompletedTask")}</span>
            </div>
          </div>
          <div className="usageInsightPane">
            <div className="usageInsightPaneTitle">
              <strong>{tr("admin.userUsageInsights.mostUsedDeviceTools")}</strong>
              <small>{tr("admin.userUsageInsights.top")}</small>
            </div>
            {data.tools.length === 0 ? (
              <p className="usageInsightEmpty">{tr("admin.userUsageInsights.noToolMetadata")}</p>
            ) : (
              <div className="usageInsightTools">
                {data.tools.slice(0, 8).map((tool) => (
                  <div key={tool.tool} className="usageInsightTool">
                    <div>
                      <span title={tool.tool}>{tool.tool}</span>
                      <strong>{fmt(tool.calls)}</strong>
                    </div>
                    <div className="usageInsightToolTrack">
                      <i style={{ width: Math.max(2, (tool.calls / maxTool) * 100) + "%" }} />
                    </div>
                    {tool.failures > 0 && (
                      <small>
                        {fmt(tool.failures)} {tr("admin.userUsageInsights.failedDispatches")}
                      </small>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      <p className="usageInsightFoot">
        <strong>{tr("admin.userUsageInsights.measurementBoundary")}</strong> ·{" "}
        {tr("admin.userUsageInsights.recordedOperationsAndSuccessfulArcRuns")}
      </p>
    </section>
  );
}
