import { useEffect, useState } from "react";
import type { BusinessHealthMetrics } from "@remotearc/protocol";
import { useI18n } from "../../app/i18n.js";
import { percent } from "./events/admin-events-model.js";
import "./business-health-overview.css";

const flowLabels = {
  login: ["Sign-in completion", "登录完成率", "auth"],
  devices: ["Device pairing completion", "设备配对完成率", "devices"],
  tasks: ["Task completion", "任务完成率", "tasks"],
  payment: ["Purchase completion", "购买流程完成率", "billing"],
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
      aria-label={tr("Business flow health", "业务链路健康")}
      aria-busy={busy}
    >
      <header>
        <div>
          <h2>{tr("Business flow health", "业务链路健康")}</h2>
          <p>
            {tr(
              "Registration, sign-in, device pairing, task execution and payment outcomes.",
              "查看注册、登录、设备配对、任务执行和支付流程是否正常。",
            )}
          </p>
        </div>
        <div className="businessHealthControls">
          <select
            aria-label={tr("Business period", "业务统计周期")}
            value={days}
            onChange={(event) => setDays(Number(event.target.value))}
          >
            <option value={1}>{tr("Today · UTC", "今天 · UTC")}</option>
            <option value={7}>{tr("Last 7 days", "近 7 天")}</option>
            <option value={30}>{tr("Last 30 days", "近 30 天")}</option>
          </select>
          <button
            type="button"
            disabled={preview || busy}
            onClick={() => setRefresh((value) => value + 1)}
          >
            {tr("Refresh business metrics", "刷新业务指标")}
          </button>
        </div>
      </header>
      {failed && (
        <p className="healthNotice businessHealthError" role="alert">
          {tr(
            "Business flow metrics are unavailable. Refresh to retry; error investigation remains available.",
            "业务流程指标暂时无法读取，请刷新重试；错误码排查仍可使用。",
          )}
        </p>
      )}
      <div className="businessHealthKpis">
        <article>
          <span>{tr("Completed registrations", "注册成功数")}</span>
          <strong>{count(data?.registrations)}</strong>
          <small>{tr("Real accounts created in this period", "所选周期内创建的真实账号")}</small>
        </article>
        <article>
          <span>{tr("Confirmed payments", "已确认付款笔数")}</span>
          <strong>{count(data?.payments)}</strong>
          <small>
            {tr(
              "Verified nonzero live payments; retries count once",
              "已核验的正式非零付款，重试不重复计数",
            )}
          </small>
        </article>
        {(Object.keys(flowLabels) as (keyof typeof flowLabels)[]).map((id) => {
          const labels = flowLabels[id];
          const flow = data?.flows.find((item) => item.id === id);
          return (
            <button
              type="button"
              key={id}
              disabled={!data}
              onClick={() => selectDomain(labels[2])}
              aria-label={tr(`Inspect ${labels[0]}`, `排查${labels[1]}`)}
            >
              <span>{tr(labels[0], labels[1])} →</span>
              <strong>{percent(flow?.rate)}</strong>
              <small>
                {flow
                  ? flow.incompleteEvidence
                    ? tr("Incomplete outcome evidence", "结果证据尚不完整")
                    : count(flow.completed) +
                      " / " +
                      count(flow.total) +
                      " " +
                      tr("completed", "已完成")
                  : tr("Waiting for business data", "等待业务数据")}
              </small>
              <small>
                {tr("Failed", "失败")} {count(flow?.failed)} · {tr("Pending", "等待中")}{" "}
                {count(flow?.pending)}
              </small>
            </button>
          );
        })}
      </div>
    </section>
  );
}
