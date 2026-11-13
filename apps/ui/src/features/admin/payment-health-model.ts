import type { PaymentHealth, PaymentSignal, PaymentSignalKey } from "@remotearc/protocol";
import type { MessageKey, Translate } from "../../locales/locale-catalog.js";

/** Matches PAYMENT_ALERT_POLICY.staleMinutes in the relay. */
export const PAYMENT_EVALUATION_STALE_MINUTES = 15;

export const paymentSignalText: Record<PaymentSignalKey, { title: MessageKey; next: MessageKey }> =
  {
    billing_unavailable: {
      title: "admin.paymentHealth.signal.billing_unavailable.title",
      next: "admin.paymentHealth.signal.billing_unavailable.next",
    },
    paid_not_recorded: {
      title: "admin.paymentHealth.signal.paid_not_recorded.title",
      next: "admin.paymentHealth.signal.paid_not_recorded.next",
    },
    paid_not_fulfilled: {
      title: "admin.paymentHealth.signal.paid_not_fulfilled.title",
      next: "admin.paymentHealth.signal.paid_not_fulfilled.next",
    },
    webhook_failed: {
      title: "admin.paymentHealth.signal.webhook_failed.title",
      next: "admin.paymentHealth.signal.webhook_failed.next",
    },
    checkout_errors: {
      title: "admin.paymentHealth.signal.checkout_errors.title",
      next: "admin.paymentHealth.signal.checkout_errors.next",
    },
    stripe_unreachable: {
      title: "admin.paymentHealth.signal.stripe_unreachable.title",
      next: "admin.paymentHealth.signal.stripe_unreachable.next",
    },
    payment_form_errors: {
      title: "admin.paymentHealth.signal.payment_form_errors.title",
      next: "admin.paymentHealth.signal.payment_form_errors.next",
    },
    no_successful_payments: {
      title: "admin.paymentHealth.signal.no_successful_payments.title",
      next: "admin.paymentHealth.signal.no_successful_payments.next",
    },
    renewal_failures: {
      title: "admin.paymentHealth.signal.renewal_failures.title",
      next: "admin.paymentHealth.signal.renewal_failures.next",
    },
  };

export function paymentWindowLabel(minutes: number, tr: Translate) {
  if (minutes <= 0) return tr("admin.paymentHealth.window.check");
  if (minutes % 1440 === 0 && minutes >= 2880)
    return tr("admin.paymentHealth.window.days", { count: minutes / 1440 });
  if (minutes % 60 === 0 && minutes >= 60)
    return tr("admin.paymentHealth.window.hours", { count: minutes / 60 });
  return tr("admin.paymentHealth.window.minutes", { count: minutes });
}

/** What was seen, in words: "1 in the last 7 days". Thresholds stay internal. */
export function paymentObserved(signal: PaymentSignal, tr: Translate) {
  if (signal.count === null) return tr("admin.paymentHealth.notMeasured");
  return tr("admin.paymentHealth.observed", {
    count: signal.count.toLocaleString(),
    window: paymentWindowLabel(signal.windowMinutes, tr),
  });
}

/** What still stands between "no alert email" and "payments work". Empty when nothing does. */
export function paymentTrustGaps(value: PaymentHealth, tr: Translate, now = Date.now()): string[] {
  const gaps: string[] = [];
  if (!value.billingConfigured) gaps.push(tr("admin.paymentHealth.trust.off"));
  if (!value.alerting.emailConfigured) gaps.push(tr("admin.paymentHealth.trust.noEmail"));
  const evaluated = value.alerting.lastEvaluatedAt
    ? Date.parse(value.alerting.lastEvaluatedAt)
    : NaN;
  if (!Number.isFinite(evaluated) || now - evaluated > PAYMENT_EVALUATION_STALE_MINUTES * 60000)
    gaps.push(tr("admin.paymentHealth.trust.stale"));
  else if (value.billingConfigured && value.alerting.stripeCheck !== "ok")
    gaps.push(tr("admin.paymentHealth.trust.noStripe"));
  return gaps;
}

// Illustrative sample for the design preview only; never shown with live data.
export function samplePaymentHealth(now = Date.now()): PaymentHealth {
  const signal = (
    key: PaymentSignalKey,
    severity: PaymentSignal["severity"],
    count: number,
    threshold: number,
    windowMinutes: number,
  ): PaymentSignal => ({
    key,
    severity,
    count,
    threshold,
    windowMinutes,
    firing: count >= threshold,
  });
  return {
    checkedAt: new Date(now).toISOString(),
    status: "warning",
    billingConfigured: true,
    signals: [
      signal("billing_unavailable", "critical", 0, 1, 0),
      signal("paid_not_recorded", "critical", 0, 1, 1440),
      signal("paid_not_fulfilled", "critical", 0, 1, 10080),
      signal("webhook_failed", "critical", 0, 1, 10080),
      signal("checkout_errors", "critical", 0, 2, 30),
      signal("stripe_unreachable", "warning", 0, 1, 5),
      signal("payment_form_errors", "warning", 2, 2, 30),
      signal("no_successful_payments", "warning", 0, 5, 1440),
      signal("renewal_failures", "warning", 1, 3, 1440),
    ],
    windows: [
      {
        hours: 24,
        checkouts: 9,
        completed: 6,
        pending: 1,
        successRate: 0.75,
        checkoutErrors: 0,
        confirmedPayments: 6,
        renewalFailures: 1,
      },
      {
        hours: 168,
        checkouts: 41,
        completed: 30,
        pending: 1,
        successRate: 0.75,
        checkoutErrors: 1,
        confirmedPayments: 31,
        renewalFailures: 2,
      },
    ],
    alerting: {
      emailConfigured: true,
      lastEvaluatedAt: new Date(now - 2 * 60000).toISOString(),
      lastNotifiedAt: new Date(now - 40 * 60000).toISOString(),
      stripeCheck: "ok",
      evaluationIntervalMinutes: 5,
    },
  };
}
