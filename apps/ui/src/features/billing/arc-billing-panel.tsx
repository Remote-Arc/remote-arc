import type { Translate } from "../../locales/locale-catalog.js";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useI18n } from "../../hooks/use-i18n.js";
import { WorkspaceLoading } from "../../components/workspace-loading.js";
import {
  billingRequest,
  billingFailureMessage,
  isConnectOnlyPlan,
  planIncludesArc,
  transferSize,
  usageResetAt,
  type ArcBilling,
  type BillingDetails,
  type NativePaymentSession,
} from "./arc-billing-client.js";
import "../../styles/billing/arc-billing-panel.css";
import { BillingRecoveryActions } from "./billing-recovery-actions.js";
const PaymentMethodForm = lazy(() =>
  import("./stripe-embedded.js").then((module) => ({ default: module.StripePaymentMethod })),
);
const planTitle = (data: ArcBilling, tr: Translate) =>
  isConnectOnlyPlan(data.plan)
    ? data.plan.label
    : data.plan.monthlyPriceCents > 0
      ? "Arc " + data.plan.label
      : data.access?.status === "active"
        ? tr("billing.arcBillingPanel.arcTrial")
        : data.access?.status === "expired"
          ? tr("billing.arcBillingPanel.arcTrialEnded")
          : "Connect Free";
export function ArcAccountPlan({ onManage }: { onManage: () => void }) {
  const { tr } = useI18n(),
    [data, setData] = useState<ArcBilling | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void billingRequest<ArcBilling>("", undefined, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setData(value);
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);
  return (
    <section className="raSettingsSurface">
      <div className="raSettingsRow raSettingsRowLast">
        <div className="raSettingsRowInfo">
          <h4>{data ? planTitle(data, tr) : tr("billing.arcBillingPanel.yourPlan")}</h4>
          <p>
            {data?.access?.status === "active"
              ? tr("billing.arcBillingPanel.daysRemainingAutoCredits", {
                  daysRemaining: data.access.daysRemaining,
                  available: data.credits.available.toLocaleString(),
                })
              : tr("billing.arcBillingPanel.viewYourAccessCreditsAndSubscription")}
          </p>
        </div>
        <button type="button" className="raSettingsButton" onClick={onManage}>
          {tr("billing.arcBillingPanel.planUsage")}
        </button>
      </div>
    </section>
  );
}
export function ArcBillingPanel() {
  const { tr, locale } = useI18n(),
    [data, setData] = useState<ArcBilling | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0);
  const [managing, setManaging] = useState(false),
    [details, setDetails] = useState<BillingDetails | null>(null),
    [detailsError, setDetailsError] = useState(""),
    [setup, setSetup] = useState<NativePaymentSession | null>(null),
    [notice, setNotice] = useState("");
  const lock = useRef(false),
    setupRequest = useRef(crypto.randomUUID()),
    mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (!managing) return;
    const controller = new AbortController();
    setDetailsError("");
    void billingRequest<BillingDetails>("details", undefined, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setDetails(value);
      })
      .catch((error) => {
        if (!controller.signal.aborted) setDetailsError(billingFailureMessage(error, tr));
      });
    return () => controller.abort();
  }, [managing, revision, tr]);
  useEffect(() => {
    const url = new URL(location.href),
      setupIntentId = url.searchParams.get("setup_intent");
    if (!setupIntentId || !/^seti_[A-Za-z0-9_]+$/.test(setupIntentId)) return;
    for (const key of ["setup_intent_client_secret", "redirect_status"])
      url.searchParams.delete(key);
    history.replaceState(history.state, "", url.pathname + url.search);
    setManaging(true);
    setBusy(true);
    lock.current = true;
    void billingRequest("payment-method/confirm", { setupIntentId })
      .then(() => {
        if (mounted.current) {
          const clean = new URL(location.href);
          clean.searchParams.delete("setup_intent");
          history.replaceState(history.state, "", clean.pathname + clean.search);
          setNotice(tr("billing.arcBillingPanel.paymentMethodUpdated"));
          setRevision((value) => value + 1);
        }
      })
      .catch((error) => {
        if (mounted.current)
          setError(error instanceof Error ? error.message : "BILLING_UNAVAILABLE");
      })
      .finally(() => {
        lock.current = false;
        if (mounted.current) setBusy(false);
      });
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void billingRequest<ArcBilling>("", undefined, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setData(value);
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setError(error instanceof Error ? error.message : "BILLING_UNAVAILABLE");
      });
    return () => controller.abort();
  }, [revision, tr]);
  async function renewal(action: "cancel" | "resume") {
    const subscription = data?.subscriptions.find(
      (item) =>
        item.period_end > new Date().toISOString() &&
        ["active", "trialing", "past_due", "unpaid"].includes(item.status),
    );
    if (lock.current || !subscription || subscription.revision === undefined) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await billingRequest("subscription/renewal", { action, revision: subscription.revision });
      if (mounted.current) {
        setNotice(
          action === "cancel"
            ? tr("billing.arcBillingPanel.renewalCancelledYourPaidAccessContinues")
            : tr("billing.arcBillingPanel.renewalRestoredYourSubscriptionWillRenew"),
        );
        setRevision((value) => value + 1);
      }
    } catch (error) {
      if (mounted.current) {
        setError(error instanceof Error ? error.message : "BILLING_UNAVAILABLE");
        setRevision((value) => value + 1);
      }
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  async function paymentMethod() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const session = await billingRequest<NativePaymentSession & { verified?: boolean }>(
        "payment-method/setup",
        { requestId: setupRequest.current },
      );
      if (session.verified) {
        await billingRequest("payment-method/confirm", { setupIntentId: session.id });
        if (mounted.current) {
          setupRequest.current = crypto.randomUUID();
          setNotice(tr("billing.arcBillingPanel.paymentMethodUpdated"));
          setRevision((value) => value + 1);
        }
      } else if (mounted.current) setSetup(session);
    } catch (error) {
      if (mounted.current) setError(error instanceof Error ? error.message : "BILLING_UNAVAILABLE");
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  if (!data)
    return error ? (
      <section className="raSettingsSurface raBillingNotice" role="alert">
        <p>{billingFailureMessage(Error(error), tr)}</p>
        <BillingRecoveryActions code={error} tr={tr} />
        {error === "UNAUTHORIZED" && (
          <a
            className="raSettingsButton"
            href="/auth/login?return_to=%2Fsettings%3Fsection%3Dbilling"
          >
            {tr("billing.arcBillingPanel.signIn")}
          </a>
        )}
        <button className="raSettingsButton" onClick={() => setRevision((v) => v + 1)}>
          {tr("billing.arcBillingPanel.refreshStatus")}
        </button>
      </section>
    ) : (
      <WorkspaceLoading label={tr("billing.arcBillingPanel.loadingBilling")} variant="cards" />
    );
  // A cancelled subscription (ended early, e.g. after a refund) no longer has a renewal or access date.
  const resetText = data.usage.month
    ? usageResetAt(data.usage.month).toLocaleString(locale, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "";
  const near = (used: number, limit?: number | null) => limit != null && used >= limit * 0.8,
    unlimited = data.plans.find(isConnectOnlyPlan);
  const overflow = data.usage.freeOverflow,
    trialEnd = overflow?.trial
      ? new Date(overflow.trial.endsAt).toLocaleDateString(locale, {
          month: "short",
          day: "numeric",
        })
      : "";
  const overflowText = !overflow
    ? ""
    : overflow.trial?.active
      ? tr("billing.arcBillingPanel.unlimitedTrialFullSpeedUntil", { trialEnd })
      : overflow.trial
        ? tr("billing.arcBillingPanel.slowLaneCallsPerMinuteUntil", {
            slowLaneCallsPerMinute: overflow.slowLaneCallsPerMinute,
          })
        : tr("billing.arcBillingPanel.yourNextCallStartsADay", { trialDays: overflow.trialDays });
  // Once the Connect Unlimited on offer includes Arc, Plus is no longer offered to new subscribers.
  const bundled = planIncludesArc(unlimited);
  const paid = data.plan.monthlyPriceCents > 0,
    connect = isConnectOnlyPlan(data.plan) && !planIncludesArc(data.plan),
    subscription = data.subscriptions.find(
      (s) =>
        s.period_end > new Date().toISOString() &&
        !["canceled", "incomplete_expired"].includes(s.status),
    );
  return (
    <div className="raBilling">
      <section className="raSettingsSurface raBillingSummary">
        <div>
          <span className="raSettingsFieldLabel">{tr("billing.arcBillingPanel.yourPlan2")}</span>
          <h3>{planTitle(data, tr)}</h3>
          {data.access?.status === "active" && !paid && (
            <p>
              {tr("billing.arcBillingPanel.daysRemainingInYourTrialNo", {
                daysRemaining: data.access.daysRemaining,
              })}
            </p>
          )}
          {paid && (
            <p>
              US${data.plan.monthlyPriceCents / 100} / {tr("billing.arcBillingPanel.month")} ·{" "}
              {connect
                ? tr("billing.arcBillingPanel.unlimitedConnectCallsAndComputersNo")
                : isConnectOnlyPlan(data.plan)
                  ? tr("billing.arcBillingPanel.unlimitedConnectCallsAndComputersCredits", {
                      credits: data.plan.monthlyCredits.toLocaleString(),
                    })
                  : data.plan.monthlyCredits.toLocaleString() + " Credits"}
            </p>
          )}
          {subscription && (
            <p>
              {(subscription.cancel_at_period_end
                ? tr("billing.arcBillingPanel.availableUntil")
                : tr("billing.arcBillingPanel.renews")) +
                new Date(subscription.period_end).toLocaleDateString()}
            </p>
          )}
        </div>
        <div className="raBillingActions">
          <a className="raSettingsButton raSettingsButtonPrimary" href="/checkout">
            {paid
              ? tr("billing.arcBillingPanel.changePlan")
              : tr("billing.arcBillingPanel.chooseAPlan")}
          </a>
          {data.hasCustomer && (
            <button
              className="raSettingsButton"
              disabled={busy || data.subscriptionManagementEnabled === false}
              aria-expanded={managing}
              onClick={() => setManaging((value) => !value)}
            >
              {managing
                ? tr("billing.arcBillingPanel.hideSubscriptionDetails")
                : tr("billing.arcBillingPanel.manageSubscription")}
            </button>
          )}
        </div>
      </section>
      {notice && (
        <p className="raBillingNotice" role="status">
          {notice}
        </p>
      )}
      {subscription && ["past_due", "unpaid", "incomplete"].includes(subscription.status) && (
        <section className="raSettingsSurface raBillingNotice" role="alert">
          <h3>{tr("billing.arcBillingPanel.yourPaymentNeedsAttention")}</h3>
          <p>{tr("billing.arcBillingPanel.reviewYourInvoiceAndPaymentMethod")}</p>
          <button className="raSettingsButton" type="button" onClick={() => setManaging(true)}>
            {tr("billing.arcBillingPanel.reviewInvoicePaymentMethod")}
          </button>
        </section>
      )}
      {managing && (
        <section
          className="raSettingsSurface raBillingManagement"
          aria-label={tr("billing.arcBillingPanel.subscriptionManagement")}
        >
          <h3>{tr("billing.arcBillingPanel.manageYourSubscription")}</h3>
          {subscription &&
            ["active", "trialing", "past_due", "unpaid"].includes(subscription.status) && (
              <div className="raBillingRenewal">
                <div>
                  <h4>
                    {subscription.cancel_at_period_end
                      ? tr("billing.arcBillingPanel.renewalIsOff")
                      : tr("billing.arcBillingPanel.monthlyRenewal")}
                  </h4>
                  <p>
                    {(subscription.cancel_at_period_end
                      ? tr("billing.arcBillingPanel.currentAccessEndsOn")
                      : tr("billing.arcBillingPanel.nextBillingDateIs")) +
                      new Date(subscription.period_end).toLocaleDateString()}
                    {subscription.pending_product_id
                      ? tr("billing.arcBillingPanel.cancellingRenewalAlsoRemovesThePending")
                      : ""}
                  </p>
                </div>
                <button
                  type="button"
                  className="raSettingsButton"
                  disabled={busy || subscription.revision === undefined}
                  onClick={() =>
                    void renewal(subscription.cancel_at_period_end ? "resume" : "cancel")
                  }
                >
                  {subscription.cancel_at_period_end
                    ? tr("billing.arcBillingPanel.resumeRenewal")
                    : tr("billing.arcBillingPanel.cancelRenewal")}
                </button>
              </div>
            )}
          <div className="raBillingRenewal">
            <div>
              <h4>{tr("billing.arcBillingPanel.paymentMethod")}</h4>
              <p>
                {details?.paymentMethod
                  ? details.paymentMethod.type === "card"
                    ? (details.paymentMethod.wallet === "apple_pay"
                        ? "Apple Pay · "
                        : details.paymentMethod.wallet === "google_pay"
                          ? "Google Pay · "
                          : "") +
                      details.paymentMethod.brand +
                      " ···· " +
                      details.paymentMethod.last4 +
                      " · " +
                      String(details.paymentMethod.expMonth).padStart(2, "0") +
                      "/" +
                      details.paymentMethod.expYear
                    : details.paymentMethod.type === "link"
                      ? "Link"
                      : tr("billing.arcBillingPanel.savedPaymentMethod")
                  : tr("billing.arcBillingPanel.manageThePaymentMethodUsedFor")}
              </p>
            </div>
            <button
              type="button"
              className="raSettingsButton"
              disabled={busy || Boolean(setup) || data.embeddedCheckoutEnabled === false}
              onClick={() => void paymentMethod()}
            >
              {tr("billing.arcBillingPanel.updatePaymentMethod")}
            </button>
          </div>
          {setup && (
            <Suspense
              fallback={
                <WorkspaceLoading
                  label={tr("billing.arcBillingPanel.loadingSecureForm")}
                  variant="compact"
                />
              }
            >
              <PaymentMethodForm
                session={setup}
                locale={locale}
                tr={tr}
                onClose={() => setSetup(null)}
                onSaved={() => {
                  setSetup(null);
                  setupRequest.current = crypto.randomUUID();
                  setNotice(tr("billing.arcBillingPanel.paymentMethodUpdated"));
                  setRevision((value) => value + 1);
                }}
              />
            </Suspense>
          )}
          <h4>{tr("billing.arcBillingPanel.recentInvoices")}</h4>
          {detailsError ? (
            <p role="alert">
              {detailsError}{" "}
              <button
                type="button"
                className="raSettingsButton"
                onClick={() => setRevision((value) => value + 1)}
              >
                {tr("billing.arcBillingPanel.retry")}
              </button>
            </p>
          ) : !details ? (
            <WorkspaceLoading
              label={tr("billing.arcBillingPanel.loadingInvoiceDetails")}
              variant="compact"
            />
          ) : details.invoices.length ? (
            <div className="raBillingTable">
              <table>
                <thead>
                  <tr>
                    <th>{tr("billing.arcBillingPanel.date")}</th>
                    <th>{tr("billing.arcBillingPanel.invoice")}</th>
                    <th>{tr("billing.arcBillingPanel.amount")}</th>
                    <th>{tr("billing.arcBillingPanel.status")}</th>
                    <th>PDF</th>
                  </tr>
                </thead>
                <tbody>
                  {details.invoices.map((invoice) => (
                    <tr key={invoice.id}>
                      <td>{new Date(invoice.createdAt).toLocaleDateString()}</td>
                      <td>{invoice.number || invoice.id}</td>
                      <td>
                        {new Intl.NumberFormat(locale, {
                          style: "currency",
                          currency: invoice.currency.toUpperCase(),
                        }).format(
                          (["paid", "refunded"].includes(invoice.status)
                            ? invoice.amountPaid
                            : invoice.amountDue) / 100,
                        )}
                      </td>
                      <td>
                        {invoice.status === "refunded"
                          ? tr("billing.arcBillingPanel.refunded")
                          : invoice.status === "paid"
                            ? tr("billing.arcBillingPanel.paid")
                            : invoice.status === "open"
                              ? tr("billing.arcBillingPanel.due")
                              : invoice.status === "void"
                                ? tr("billing.arcBillingPanel.void")
                                : invoice.status === "draft"
                                  ? tr("billing.arcBillingPanel.draft")
                                  : tr("billing.arcBillingPanel.uncollectible")}
                      </td>
                      <td>
                        {invoice.pdfUrl && (
                          <a href={invoice.pdfUrl} target="_blank" rel="noopener noreferrer">
                            {tr("billing.arcBillingPanel.download")}
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {details.hasMore && (
                <p>{tr("billing.arcBillingPanel.showingTheMostRecentInvoices")}</p>
              )}
            </div>
          ) : (
            <p>{tr("billing.arcBillingPanel.noInvoicesYet")}</p>
          )}
        </section>
      )}
      <section className="raBillingBalances">
        <div className="raSettingsSurface">
          <span>{tr("billing.arcBillingPanel.availableCredits")}</span>
          <strong>
            {data.credits.available.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </strong>
          <small>{tr("billing.arcBillingPanel.forArcModelUsage")}</small>
        </div>
        <div className="raSettingsSurface">
          <span>{tr("billing.arcBillingPanel.reservedForWork")}</span>
          <strong>
            {data.credits.pending.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </strong>
          <small>{tr("billing.arcBillingPanel.uncertainWorkRetainsItsReservationUntil")}</small>
        </div>
        <div className="raSettingsSurface">
          <span>{tr("billing.arcBillingPanel.connectCallsThisMonth")}</span>
          <strong>
            {data.usage.used.toLocaleString()}{" "}
            <small>
              /{" "}
              {data.usage.limit === null
                ? tr("billing.arcBillingPanel.unlimited")
                : data.usage.limit.toLocaleString()}
            </small>
          </strong>
          {data.usage.limit !== null && resetText && (
            <small>{tr("billing.arcBillingPanel.resets") + resetText}</small>
          )}
          {overflowText && <small>{overflowText}</small>}
        </div>
        {data.transfer && (
          <div className="raSettingsSurface">
            <span>{tr("billing.arcBillingPanel.fileTransferThisMonth")}</span>
            <strong>
              {transferSize(data.transfer.used)}{" "}
              <small>
                /{" "}
                {data.transfer.limit === null
                  ? tr("billing.arcBillingPanel.unlimited")
                  : transferSize(data.transfer.limit)}
              </small>
            </strong>
            {data.transfer.limit !== null && resetText && (
              <small>{tr("billing.arcBillingPanel.resets") + resetText}</small>
            )}
          </div>
        )}
      </section>
      {subscription?.pending_product_id && (
        <p className="raBillingNotice">
          {tr("billing.arcBillingPanel.planChangeScheduledFor") +
            new Date(subscription.pending_effective_at!).toLocaleDateString()}{" "}
          · <a href="/checkout">{tr("billing.arcBillingPanel.reviewPlanChoices")}</a>
        </p>
      )}
      {error && (
        <div className="raBillingNotice" role="alert">
          <p>{billingFailureMessage(Error(error), tr)}</p>
          <BillingRecoveryActions code={error} tr={tr} />
        </div>
      )}
      {connect ? (
        // A Connect-only subscriber keeps their saved terms; Plus stays their way to add Arc.
        <section className="raSettingsSurface raBillingNotice">
          <h3>{tr("billing.arcBillingPanel.wantArcToDoTheWork")}</h3>
          <p>{tr("billing.arcBillingPanel.connectUnlimitedRunsYourOwnAi")}</p>
          <a className="raSettingsButton" href="/checkout?product=arc-plus-v1">
            {tr("billing.arcBillingPanel.compareWithPlus")} →
          </a>
        </section>
      ) : !paid ? (
        <section className="raSettingsSurface raBillingNotice">
          <h3>
            {overflow
              ? tr("billing.arcBillingPanel.keepYourAgentsAtFullSpeed")
              : near(data.usage.used, data.usage.limit) ||
                  near(data.transfer?.used ?? 0, data.transfer?.limit)
                ? tr("billing.arcBillingPanel.youReCloseToThisMonth")
                : tr("billing.arcBillingPanel.needMoreRoom")}
          </h3>
          <p>
            {(resetText ? tr("billing.arcBillingPanel.freeAllowancesRenew", { resetText }) : "") +
              tr(
                bundled
                  ? "billing.arcBillingPanel.connectUnlimitedIncludesArc"
                  : "billing.arcBillingPanel.connectUnlimitedKeepsYourAgentsRunning",
                {
                  price: unlimited
                    ? tr("billing.arcBillingPanel.connectPriceDetail", {
                        monthly: unlimited.monthlyPriceCents / 100,
                        daily: (unlimited.monthlyPriceCents / 3000).toFixed(2),
                      })
                    : "",
                  credits: (unlimited?.monthlyCredits ?? 0).toLocaleString(),
                },
              )}
          </p>
          <div className="raBillingActions">
            {unlimited && (
              <a
                className="raSettingsButton"
                href={"/checkout?product=" + encodeURIComponent(unlimited.id)}
              >
                {tr("billing.arcBillingPanel.choose") + unlimited.label} →
              </a>
            )}
            {!bundled && (
              <a className="raSettingsButton" href="/checkout?product=arc-plus-v1">
                {tr("billing.arcBillingPanel.compareWithPlus")} →
              </a>
            )}
          </div>
        </section>
      ) : (
        <section className="raSettingsSurface raBillingNotice">
          <h3>{tr("billing.arcBillingPanel.needMoreCredits")}</h3>
          <p>{tr("billing.arcBillingPanel.reviewTopUpsOnThePayment")}</p>
          {data.topups.map((product) => (
            <a
              className="raSettingsButton"
              key={product.id}
              href={"/checkout?product=" + encodeURIComponent(product.id)}
            >
              {product.credits} Credits · US${product.priceCents / 100} →
            </a>
          ))}
        </section>
      )}
      <section className="raSettingsSurface raBillingNotice">
        <h3>{tr("billing.arcBillingPanel.howModelsUseCredits")}</h3>
        <p>{tr("billing.arcBillingPanel.creditsTrackRatedInputOutputReasoning")}</p>
        <div className="raBillingTable">
          <table>
            <thead>
              <tr>
                <th>{tr("billing.arcBillingPanel.model")}</th>
                <th>{tr("billing.arcBillingPanel.inputKTokens")}</th>
                <th>{tr("billing.arcBillingPanel.outputKTokens")}</th>
              </tr>
            </thead>
            <tbody>
              {data.models.map((model) => (
                <tr key={model.id}>
                  <td>{model.label}</td>
                  <td>{model.inputCreditsPer1000} Credits</td>
                  <td>{model.outputCreditsPer1000} Credits</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
