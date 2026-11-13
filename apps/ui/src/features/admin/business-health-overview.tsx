import { useEffect, useState } from "react";
import type { BusinessHealthMetrics } from "@remotearc/protocol";
import { useI18n } from "../../hooks/use-i18n.js";
import { percent } from "./events/admin-events-model.js";
import "../../styles/admin/business-health-overview.css";

const flowLabels = {
  login: ["admin.businessHealthOverview.signInCompletion", "auth"],
  devices: ["admin.businessHealthOverview.devicePairingCompletion", "devices"],
  tasks: ["admin.businessHealthOverview.taskCompletion", "tasks"],
  payment: ["admin.businessHealthOverview.purchaseCompletion", "billing"],
} as const;

function valid(value: unknown): value is BusinessHealthMetrics {
  if (!value || typeof value !== "object") return false;
  const data = value as BusinessHealthMetrics;
  const count = (n: unknown) => typeof n === "number" && Number.isInteger(n) && n >= 0;
  return (
    [1, 7, 30].includes(data.days) &&
    Number.isFinite(Date.parse(data.checkedAt)) &&
    Number.isFinite(Date.parse(data.from)) &&
    count(data.registrations) &&
    count(data.payments) &&
    Array.isArray(data.flows) &&
    data.flows.length === 4 &&
    Object.keys(flowLabels).every(
      (id) => data.flows.filter((flow) => flow.id === id).length === 1,
    ) &&
    data.flows.every(
      (flow) =>
        [flow.total, flow.completed, flow.pending, flow.failed, flow.incompleteEvidence].every(
          count,
        ) &&
        flow.completed <= flow.total &&
        flow.pending <= flow.total &&
        flow.failed <= flow.total &&
        (flow.rate === null ||
          (typeof flow.rate === "number" &&
            Number.isFinite(flow.rate) &&
            flow.rate >= 0 &&
            flow.rate <= 1)),
    )
  );
}

export function BusinessHealthOverview({
  preview,
  revision,
  selectDomain,
}: {
  preview: boolean;
  revision: number;
  selectDomain: (domain: string) => void;
}) {
  const { tr, locale } = useI18n();
  const [days, setDays] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [data, setData] = useState<BusinessHealthMetrics | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (preview) return;
    const controller = new AbortController();
    setBusy(true);
    setFailed(false);
    setData(null);
    void fetch(
      "/api/admin/analytics?" + new URLSearchParams({ view: "health", days: String(days) }),
      {
        credentials: "same-origin",
        signal: controller.signal,
      },
    )
      .then(async (response) => {
        if (!response.ok) throw Error("Unavailable");
        const value: unknown = await response.json();
        if (!valid(value)) throw Error("Invalid business health");
        if (!controller.signal.aborted) setData(value);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [preview, days, refresh, revision]);
  const count = (value: number | undefined) =>
    value === undefined ? "—" : value.toLocaleString(locale === "zh" ? "zh-CN" : "en-US");
  return (
    <section
      className="businessHealthOverview"
      aria-label={tr("admin.businessHealthOverview.businessFlowHealth")}
      aria-busy={busy}
    >
      <header>
        <div>
          <h2>{tr("admin.businessHealthOverview.businessFlowHealth")}</h2>
          <p>{tr("admin.businessHealthOverview.registrationSignInDevicePairingTask")}</p>
        </div>
        <div className="businessHealthControls">
          <select
            aria-label={tr("admin.businessHealthOverview.businessPeriod")}
            value={days}
            onChange={(event) => setDays(Number(event.target.value))}
          >
            <option value={1}>{tr("admin.businessHealthOverview.todayUtc")}</option>
            <option value={7}>{tr("admin.businessHealthOverview.lastDays")}</option>
            <option value={30}>{tr("admin.businessHealthOverview.lastDays2")}</option>
          </select>
          <button
            type="button"
            disabled={preview || busy}
            onClick={() => setRefresh((value) => value + 1)}
          >
            {tr("admin.businessHealthOverview.refreshBusinessMetrics")}
          </button>
        </div>
      </header>
      {failed && (
        <p className="healthNotice businessHealthError" role="alert">
          {tr("admin.businessHealthOverview.businessFlowMetricsAreUnavailableRefresh")}
        </p>
      )}
      <div className="businessHealthKpis">
        <article>
          <span>{tr("admin.businessHealthOverview.completedRegistrations")}</span>
          <strong>{count(data?.registrations)}</strong>
          <small>{tr("admin.businessHealthOverview.realAccountsCreatedInThisPeriod")}</small>
        </article>
        <article>
          <span>{tr("admin.businessHealthOverview.confirmedPayments")}</span>
          <strong>{count(data?.payments)}</strong>
          <small>
            {tr("admin.businessHealthOverview.verifiedNonzeroLivePaymentsRetriesCount")}
          </small>
        </article>
        {(Object.keys(flowLabels) as (keyof typeof flowLabels)[]).map((id) => {
          const [labelKey, domain] = flowLabels[id];
          const label = tr(labelKey);
          const flow = data?.flows.find((item) => item.id === id);
          return (
            <button
              type="button"
              key={id}
              disabled={!data}
              onClick={() => selectDomain(domain)}
              aria-label={tr("admin.businessHealthOverview.inspect", { label })}
            >
              <span>{label} →</span>
              <strong>{percent(flow?.rate)}</strong>
              <small>
                {!flow
                  ? tr("admin.businessHealthOverview.waitingForBusinessData")
                  : flow.incompleteEvidence
                    ? tr("admin.businessHealthOverview.incompleteOutcomeEvidence")
                    : flow.total === 0
                      ? tr("admin.businessHealthOverview.noActivity")
                      : count(flow.completed) +
                        " / " +
                        count(flow.total) +
                        " " +
                        tr("admin.businessHealthOverview.completed")}
              </small>
              {flow && (flow.failed > 0 || flow.pending > 0) && (
                <small>
                  {tr("admin.businessHealthOverview.failed")} {count(flow.failed)} ·{" "}
                  {tr("admin.businessHealthOverview.pending")} {count(flow.pending)}
                </small>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
