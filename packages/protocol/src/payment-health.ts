/** Payment alert signals. Each one is a way a customer can fail to pay or fail
 * to receive what they paid for. */
export type PaymentSignalKey =
  | "billing_unavailable"
  | "paid_not_recorded"
  | "paid_not_fulfilled"
  | "webhook_failed"
  | "checkout_errors"
  | "stripe_unreachable"
  | "payment_form_errors"
  | "no_successful_payments"
  | "renewal_failures";

export type PaymentSignal = {
  key: PaymentSignalKey;
  severity: "critical" | "warning";
  firing: boolean;
  /** Observed value compared with the threshold; null when it could not be measured. */
  count: number | null;
  threshold: number;
  windowMinutes: number;
};

export type PaymentWindow = {
  hours: 24 | 168;
  /** Checkout sessions customers started (real, live accounts). */
  checkouts: number;
  completed: number;
  /** Still open and not expired, so neither success nor failure yet. */
  pending: number;
  /** completed / (checkouts - pending); null with no settled checkout. */
  successRate: number | null;
  /** Server-side (5xx) failures while creating a checkout. */
  checkoutErrors: number;
  confirmedPayments: number;
  renewalFailures: number;
};

export type PaymentHealth = {
  checkedAt: string;
  /** not_configured: payments are switched off, so nobody can buy. */
  status: "ok" | "warning" | "critical" | "not_configured" | "unavailable";
  billingConfigured: boolean;
  signals: PaymentSignal[];
  windows: PaymentWindow[];
  alerting: {
    emailConfigured: boolean;
    /** Last time the scheduled evaluator ran. A stale value means alerts are not being checked. */
    lastEvaluatedAt: string | null;
    lastNotifiedAt: string | null;
    /** Stripe reconciliation result from the last evaluation. */
    stripeCheck: "ok" | "unavailable" | "not_configured" | "not_run";
    evaluationIntervalMinutes: number;
  };
};
