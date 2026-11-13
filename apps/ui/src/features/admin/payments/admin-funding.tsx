import { useEffect, useState } from "react";
import { useI18n } from "../../../hooks/use-i18n.js";
type Pool = {
  limit: number;
  dailyLimit: number;
  spent: number;
  reserved: number;
  dailyUsed: number;
};
export type FundingOverview = {
  mode?: "manual" | "automatic";
  automatic?: { sponsored: Pool; paid: Pool; paid_users: number; trial_users: number } | null;
  paid_user_daily_micros?: number;
  managed: number;
  enabled: number;
  revision: number;
  total_micros: number;
  daily_micros: number;
  spent: number;
  reserved: number;
  dailyUsed: number;
  alert: boolean;
  trials: { total: number; active: number; startedToday: number };
  usage: Array<{
    provider: string;
    model_id: string;
    day: string;
    calls: number;
    users: number;
    spent: number;
    reserved: number;
  }>;
  audit: Array<{ id: string; actor_email: string; action: string; created_at: string }>;
};
export function AdminFunding({
  funding,
  busy,
  preview,
  mutate,
}: {
  funding?: FundingOverview;
  busy: boolean;
  preview: boolean;
  mutate: (path: string, value: unknown) => Promise<unknown>;
}) {
  const { tr } = useI18n(),
    [total, setTotal] = useState(3),
    [paidDaily, setPaidDaily] = useState(1),
    [daily, setDaily] = useState(0.5),
    [enabled, setEnabled] = useState(true),
    [review, setReview] = useState(false),
    [mode, setMode] = useState<"manual" | "automatic">("automatic");
  useEffect(() => {
    if (funding) {
      setTotal(funding.total_micros / 1000000);
      setDaily(funding.daily_micros / 1000000);
      setPaidDaily((funding.paid_user_daily_micros ?? 1000000) / 1000000);
      setEnabled(Boolean(funding.enabled));
      setMode(funding.mode || "manual");
      setReview(false);
    }
  }, [funding?.revision]);
  if (!funding) return null;
  const pools = funding.automatic,
    usd = (n: number) => "$" + (n / 1000000).toFixed(3);
  return (
    <section className="adminSurface">
      <div className="adminSectionHeader">
        <div>
          <span className="adminLeadStatus">
            {tr("admin.payments.adminFunding.modelOperations")}
          </span>
          <h2>{tr("admin.payments.adminFunding.freeTrialsAndModelFunding")}</h2>
          <p>{tr("admin.payments.adminFunding.automaticModeFundsFreeTrialsFrom")}</p>
        </div>
      </div>
      {funding.alert && (
        <p className="adminAlert" role="status">
          {tr("admin.payments.adminFunding.modelCallsArePausedOrA")}
        </p>
      )}
      <div className="adminMetrics adminMetrics--overview">
        {[
          { label: tr("admin.payments.adminFunding.activeTrials"), value: funding.trials.active },
          {
            label: tr("admin.payments.adminFunding.trialsStartedToday"),
            value: funding.trials.startedToday,
          },
          {
            label: tr("admin.payments.adminFunding.ratedSpendReserved"),
            value: usd(funding.spent) + " + " + usd(funding.reserved),
          },
          {
            label: tr("admin.payments.adminFunding.todayDailyCap"),
            value:
              usd(funding.dailyUsed) +
              " / " +
              usd(
                pools ? pools.sponsored.dailyLimit + pools.paid.dailyLimit : funding.daily_micros,
              ),
          },
        ].map((item) => (
          <article className="adminMetricCard" key={item.label}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </article>
        ))}
      </div>
      <p>
        {tr("admin.payments.adminFunding.remainingCumulativeBudget")}{" "}
        {usd(
          Math.max(
            0,
            (pools ? pools.sponsored.limit + pools.paid.limit : funding.total_micros) -
              funding.spent -
              funding.reserved,
          ),
        )}{" "}
        · {tr("admin.payments.adminFunding.thisIsAnArcOperatingCap")}
      </p>
      {pools && (
        <div className="adminFundingPools">
          {[
            ["sponsored", tr("admin.payments.adminFunding.freeTrialAcquisitionBudget")],
            ["paid", tr("admin.payments.adminFunding.verifiedPaymentFunding")],
          ].map(([key, label]) => {
            const pool = pools[key as "sponsored" | "paid"];
            return (
              <article key={key}>
                <h3>{label}</h3>
                <p>
                  {usd(pool.spent + pool.reserved)} / {usd(pool.limit)}
                </p>
                <small>
                  {tr("admin.payments.adminFunding.today") +
                    usd(pool.dailyUsed) +
                    " / " +
                    usd(pool.dailyLimit)}
                </small>
              </article>
            );
          })}
          <p>{tr("admin.payments.adminFunding.freeDailyCapacityFollowsActiveTrials")}</p>
        </div>
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setReview(true);
        }}
      >
        <div className="adminPaymentForm">
          <label className="adminPaymentField">
            {tr("admin.payments.adminFunding.budgetMode")}
            <select
              value={mode}
              onChange={(event) => {
                setMode(event.target.value as "manual" | "automatic");
                setReview(false);
              }}
            >
              <option value="automatic">
                {tr("admin.payments.adminFunding.automaticSeparateTrialAndPaidFunding")}
              </option>
              <option value="manual">{tr("admin.payments.adminFunding.fixedSharedBudget")}</option>
            </select>
          </label>
          <label className="adminPaymentField">
            {mode === "automatic"
              ? tr("admin.payments.adminFunding.trialAcquisitionBudgetUsd")
              : tr("admin.payments.adminFunding.cumulativeBudgetUsd")}
            <input
              type="number"
              min="0.001"
              step="0.001"
              max="10000"
              value={total}
              onChange={(event) => {
                setTotal(Number(event.target.value));
                setReview(false);
              }}
            />
          </label>
          <label className="adminPaymentField">
            {mode === "automatic"
              ? tr("admin.payments.adminFunding.trialDailyBaselineUsd")
              : tr("admin.payments.adminFunding.dailySharedCapUsd")}
            <input
              type="number"
              min="0.001"
              step="0.001"
              max="1000"
              value={daily}
              onChange={(event) => {
                setDaily(Number(event.target.value));
                setReview(false);
              }}
            />
          </label>
          {mode === "automatic" && (
            <label className="adminPaymentField">
              {tr("admin.payments.adminFunding.dailyCapPerPayingAccountUsd")}
              <input
                type="number"
                min="0.001"
                step="0.001"
                max="1000"
                value={paidDaily}
                onChange={(event) => {
                  setPaidDaily(Number(event.target.value));
                  setReview(false);
                }}
              />
            </label>
          )}
          <label className="adminPaymentField">
            {tr("admin.payments.adminFunding.allowModelCalls")}
            <input
              type="checkbox"
              checked={enabled}
              onChange={(event) => {
                setEnabled(event.target.checked);
                setReview(false);
              }}
            />
          </label>
        </div>
        <button className="adminOutlineBtn" disabled={busy || preview || !funding.managed}>
          {tr("admin.payments.adminFunding.reviewBudgetChange")}
        </button>
      </form>
      {review && (
        <div className="adminPaymentReview">
          <p>
            {enabled
              ? tr("admin.payments.adminFunding.callsEnabled")
              : tr("admin.payments.adminFunding.callsPaused")}{" "}
            · ${total} {tr("admin.payments.adminFunding.cumulative")} · ${daily} /{" "}
            {tr("admin.payments.adminFunding.day")}
          </p>
          <p>{tr("admin.payments.adminFunding.raisingThisCapDoesNotRecharge")}</p>
          <button
            className="adminOutlineBtn"
            disabled={busy || preview}
            onClick={() =>
              void mutate("funding", {
                revision: funding.revision,
                enabled,
                mode,
                paidUserDailyMicros: Math.round(paidDaily * 1000000),
                totalMicros: Math.round(total * 1000000),
                dailyMicros: Math.round(daily * 1000000),
              })
            }
          >
            {tr("admin.payments.adminFunding.publishThisBudget")}
          </button>
        </div>
      )}
      <div className="adminPaymentTable">
        <table>
          <thead>
            <tr>
              {[
                tr("admin.payments.adminFunding.date"),
                tr("admin.payments.adminFunding.model"),
                tr("admin.payments.adminFunding.callsUsers"),
                tr("admin.payments.adminFunding.ratedSpend"),
                tr("admin.payments.adminFunding.reserved"),
              ].map((label) => (
                <th key={label}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {funding.usage.map((row) => (
              <tr key={row.day + row.provider + row.model_id}>
                <td>{row.day}</td>
                <td>
                  {row.model_id === "arc-auto" ? "Auto" : row.model_id}
                  <small>{row.provider}</small>
                </td>
                <td>
                  {row.calls} / {row.users}
                </td>
                <td>{usd(row.spent)}</td>
                <td>{usd(row.reserved)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <details>
        <summary>{tr("admin.payments.adminFunding.budgetAuditHistory")}</summary>
        {funding.audit.map((row) => (
          <p key={row.id}>
            {new Date(row.created_at).toLocaleString()} · {row.actor_email || "—"} · {row.action}
          </p>
        ))}
      </details>
    </section>
  );
}
