import type { PaymentHealth, PaymentWindow } from "@remotearc/protocol";
import { useI18n } from "../../hooks/use-i18n.js";
import { percent } from "./events/admin-events-model.js";
import { paymentObserved, paymentSignalText, paymentTrustGaps } from "./payment-health-model.js";
import "../../styles/admin/payment-health.css";

function SuccessRate({ label, window }: { label: string; window: PaymentWindow | undefined }) {
  const { tr } = useI18n();
  return (
    <article>
      <span>{label}</span>
      <strong>{percent(window?.successRate)}</strong>
      <small>
        {window
          ? tr("admin.paymentHealth.successDetail", {
              completed: window.completed.toLocaleString(),
              settled: (window.checkouts - window.pending).toLocaleString(),
              pending: window.pending.toLocaleString(),
            })
          : "—"}
      </small>
    </article>
  );
}

/**
 * Payment alerts. When nothing needs action the panel is one calm line; when
 * something does, it lists only the alerts that fired (or could not be
 * measured), what to do next, and the numbers behind them.
 */
export function PaymentHealthPanel({ value }: { value: PaymentHealth | undefined }) {
  const { tr } = useI18n();
  const status = value?.status || "loading";
  const day = value?.windows.find((item) => item.hours === 24);
  const week = value?.windows.find((item) => item.hours === 168);
  const gaps = value && value.status !== "unavailable" ? paymentTrustGaps(value, tr) : [];
  const attention = (value?.signals || [])
    .filter((signal) => signal.firing || signal.count === null)
    .sort(
      (a, b) =>
        Number(b.firing) - Number(a.firing) ||
        Number(b.severity === "critical") - Number(a.severity === "critical"),
    );
  const calm = status === "ok" && !gaps.length && !attention.length;
  const count = (n: number | undefined) => (n === undefined ? "—" : n.toLocaleString());
  return (
    <section
      className={"paymentHealth is-" + (calm ? "calm" : status)}
      data-health-anchor="payments"
      aria-labelledby="payment-health-title"
    >
      <header>
        <h2 id="payment-health-title">
          <span className="paymentHealthLight" aria-hidden="true" />
          {tr(
            {
              ok: "admin.paymentHealth.status.ok",
              warning: "admin.paymentHealth.status.warning",
              critical: "admin.paymentHealth.status.critical",
              not_configured: "admin.paymentHealth.status.not_configured",
              unavailable: "admin.paymentHealth.status.unavailable",
              loading: "admin.paymentHealth.status.loading",
            }[status] as "admin.paymentHealth.status.ok",
          )}
        </h2>
        {calm && (
          <p className="paymentHealthSummary">
            {tr("admin.paymentHealth.calmSummary", {
              confirmed: count(day?.confirmedPayments),
              rate: percent(week?.successRate),
            })}
          </p>
        )}
      </header>
      {gaps.length > 0 && (
        <p className="paymentHealthTrust" role="status">
          {tr("admin.paymentHealth.trust.notReady") + " " + gaps.join(" · ")}
        </p>
      )}
      {attention.length > 0 && (
        <ul className="paymentHealthSignals">
          {attention.map((signal) => (
            <li key={signal.key} className={signal.firing ? "is-" + signal.severity : "is-unknown"}>
              <div>
                <strong>{tr(paymentSignalText[signal.key].title)}</strong>
                <small>{paymentObserved(signal, tr)}</small>
                {signal.firing && (
                  <small className="paymentHealthNext">
                    {tr("admin.paymentHealth.nextStep")} {tr(paymentSignalText[signal.key].next)}
                  </small>
                )}
              </div>
              <span className="paymentHealthState">
                {!signal.firing
                  ? tr("admin.paymentHealth.unknown")
                  : signal.severity === "critical"
                    ? tr("admin.paymentHealth.critical")
                    : tr("admin.paymentHealth.warning")}
              </span>
            </li>
          ))}
        </ul>
      )}
      {!calm && value && value.status !== "unavailable" && (
        <div className="paymentHealthKpis">
          <SuccessRate label={tr("admin.paymentHealth.successRate24h")} window={day} />
          <SuccessRate label={tr("admin.paymentHealth.successRate7d")} window={week} />
          <article>
            <span>{tr("admin.paymentHealth.confirmed24h")}</span>
            <strong>{count(day?.confirmedPayments)}</strong>
            <small>{tr("admin.paymentHealth.confirmedDetail")}</small>
          </article>
          <article>
            <span>{tr("admin.paymentHealth.checkoutErrors24h")}</span>
            <strong>{count(day?.checkoutErrors)}</strong>
            <small>{tr("admin.paymentHealth.checkoutErrorsDetail")}</small>
          </article>
          <article>
            <span>{tr("admin.paymentHealth.renewalFailures24h")}</span>
            <strong>{count(day?.renewalFailures)}</strong>
            <small>{tr("admin.paymentHealth.renewalFailuresDetail")}</small>
          </article>
        </div>
      )}
    </section>
  );
}
