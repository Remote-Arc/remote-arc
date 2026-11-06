import { trackProductEvent } from "../../lib/product-events.js";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useI18n } from "../../hooks/use-i18n.js";
import { WorkspaceLoading } from "../../components/workspace-loading.js";
import {
  billingRequest,
  billingFailureMessage,
  BillingFailure,
  connectPlanFeatures,
  isConnectOnlyPlan,
  type ArcBilling,
  type BillingInterval,
  type NativePaymentSession,
} from "./arc-billing-client.js";
import "../../styles/settings/dashboard-settings.css";
import "../../styles/billing/arc-billing-panel.css";
import "../../styles/billing/arc-checkout.css";
import { BillingRecoveryActions } from "./billing-recovery-actions.js";
import {
  billingRecovery,
  paymentStatusHref,
} from "../../../../../packages/protocol/src/billing-recovery.js";

const EmbeddedPayment = lazy(() =>
  import("./stripe-embedded.js").then((module) => ({ default: module.StripeEmbeddedCheckout })),
);
const ElementsPayment = lazy(() =>
  import("./stripe-embedded.js").then((module) => ({ default: module.StripeElementsCheckout })),
);
export function ArcCheckout({ email }: { email: string }) {
  const { tr, locale } = useI18n(),
    [data, setData] = useState<ArcBilling | null>(null),
    [failure, setFailure] = useState<unknown>(null),
    [revision, setRevision] = useState(0),
    [busy, setBusy] = useState(false),
    [promo, setPromo] = useState(""),
    [scheduled, setScheduled] = useState<string | null>(null);
  const [embedded, setEmbedded] = useState<NativePaymentSession | null>(null);
  const [selected, setSelected] = useState(
    () =>
      new URLSearchParams(location.search).get("product") ||
      new URLSearchParams(location.search).get("plan") ||
      "",
  );
  const [cycle, setCycle] = useState<BillingInterval>(() =>
    new URLSearchParams(location.search).get("interval") === "year" ? "year" : "month",
  );
  const [payment, setPayment] = useState<"pending" | "confirmed" | "waiting">("pending"),
    sending = useRef(false),
    mounted = useRef(true);
  const result = new URLSearchParams(location.search).get("checkout"),
    session = new URLSearchParams(location.search).get("session_id");
  useEffect(() => {
    trackProductEvent("billing.checkout.viewed", { route: "/checkout" });
  }, []);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void billingRequest<ArcBilling>("", undefined, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) {
          setData(value);
          setSelected(
            (previous) =>
              previous ||
              value.plans.find((plan) => plan.monthlyPriceCents > 0 && !isConnectOnlyPlan(plan))
                ?.id ||
              "",
          );
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) setFailure(error);
      });
    return () => controller.abort();
  }, [revision]);
  useEffect(() => {
    if (result !== "success" || !session) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>,
      attempt = 0;
    async function check() {
      try {
        const status = await billingRequest<{ status: string }>(
          "checkout-status?session=" + encodeURIComponent(session!),
          undefined,
          controller.signal,
        );
        if (controller.signal.aborted) return;
        if (status.status === "complete") {
          trackProductEvent("billing.confirmation.displayed", { entityId: session! });
          setPayment("confirmed");
          setRevision((value) => value + 1);
          return;
        }
      } catch {
        if (controller.signal.aborted) return;
      }
      if (++attempt >= 10) {
        trackProductEvent("billing.confirmation.waiting", { entityId: session! });
        setPayment("waiting");
        return;
      }
      timer = setTimeout(check, 3000);
    }
    void check();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [result, session]);
  function choose(id: string) {
    if (busy) return;
    trackProductEvent("billing.offer.selected", { entityId: id });
    setSelected(id);
    setFailure(null);
    setScheduled(null);
    const url = new URL(location.href);
    url.searchParams.set("product", id);
    url.searchParams.delete("plan");
    history.replaceState({}, "", url);
  }
  function chooseCycle(value: BillingInterval) {
    if (busy) return;
    trackProductEvent("billing.offer.selected", { entityId: selected + ":" + value });
    setCycle(value);
    setFailure(null);
    setScheduled(null);
    const url = new URL(location.href);
    if (value === "year") url.searchParams.set("interval", "year");
    else url.searchParams.delete("interval");
    history.replaceState({}, "", url);
  }
  const plan = data?.plans.find(
      (product) => product.id === selected && product.monthlyPriceCents > 0,
    ),
    topup = data?.topups.find((product) => product.id === selected),
    paid = Boolean(data && data.plan.monthlyPriceCents > 0),
    product = plan || topup;
  // Connect Unlimited is sold without hosted Arc; top-ups still need an Arc plan.
  const connect = Boolean(plan && isConnectOnlyPlan(plan)),
    arcPaid = paid && !isConnectOnlyPlan(data!.plan),
    available = connect ? (data?.connectEnabled ?? data?.enabled) : data?.enabled;
  // Yearly is offered only for Connect Unlimited, and only once its price is published.
  const yearlyCents = connect ? plan?.yearlyPriceCents || null : null,
    billed: BillingInterval = yearlyCents && cycle === "year" ? "year" : "month",
    active = data?.subscriptions.find((s) => s.status === "active"),
    pendingChange = Boolean(data?.subscriptions.some((s) => s.pending_product_id));
  async function proceed() {
    if (sending.current || !available || !product || result === "success") return;
    sending.current = true;
    setBusy(true);
    setFailure(null);
    trackProductEvent("billing.checkout.continued");
    try {
      const response = await billingRequest<
        NativePaymentSession & { mode?: string; scheduled?: boolean; effectiveAt?: string }
      >(paid && plan ? "plan/change" : "checkout", {
        productId: product.id,
        versionId: product.versionId,
        ...(plan ? { interval: billed } : {}),
        ...(!(paid && plan) ? { uiMode: "elements" } : {}),
        ...(!paid && plan && !connect && promo.trim() ? { promoCode: promo.trim() } : {}),
      });
      if (!mounted.current) return;
      if (response.scheduled && response.effectiveAt) {
        setScheduled(response.effectiveAt);
        setRevision((value) => value + 1);
      } else if (
        (response.mode === "elements" || response.mode === "embedded_page") &&
        response.clientSecret &&
        response.publishableKey &&
        response.sessionId
      )
        setEmbedded(response);
      else throw new BillingFailure("BILLING_UNAVAILABLE");
    } catch (error) {
      if (mounted.current) {
        setFailure(error);
        if (error instanceof Error && error.message === "BILLING_PRICE_CHANGED")
          setRevision((value) => value + 1);
      }
    } finally {
      sending.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  function complete() {
    trackProductEvent("billing.payment.completed_client", { entityId: embedded?.sessionId });
    if (embedded?.sessionId)
      location.assign(
        "/checkout?product=" +
          encodeURIComponent(selected) +
          (billed === "year" ? "&interval=year" : "") +
          "&checkout=success&session_id=" +
          encodeURIComponent(embedded.sessionId),
      );
  }
  async function back() {
    if (sending.current || !embedded?.sessionId) return;
    sending.current = true;
    setBusy(true);
    setFailure(null);
    try {
      const response = await billingRequest<{ expired?: boolean; complete?: boolean }>(
        "checkout/abandon",
        { sessionId: embedded.sessionId },
      );
      if (!mounted.current) return;
      if (response.complete) complete();
      else if (response.expired) {
        trackProductEvent("billing.checkout.abandoned_client", { entityId: embedded.sessionId });
        setEmbedded(null);
      }
    } catch (error) {
      if (mounted.current) setFailure(error);
    } finally {
      sending.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  const usd = (cents: number) =>
      new Intl.NumberFormat(locale === "zh" ? "zh-CN" : "en-US", {
        style: "currency",
        currency: "USD",
        currencyDisplay: "narrowSymbol",
      }).format(cents / 100),
    amount = billed === "year" ? yearlyCents! : (plan?.monthlyPriceCents ?? topup?.priceCents),
    price = amount === undefined ? "" : usd(amount),
    // "US$8.25/month, billed yearly": the yearly price as a monthly equivalent.
    yearlyAsMonthly = yearlyCents
      ? "US" + usd(Math.round(yearlyCents / 12)) + tr("billing.arcCheckout.monthBilledYearly")
      : "",
    orderLabel = plan
      ? connect
        ? plan.label
        : "Arc " + plan.label
      : topup
        ? topup.credits.toLocaleString() + " Credits"
        : tr("billing.arcCheckout.offerUnavailable"),
    code =
      failure instanceof Error && /^[\w]{1,100}$/.test(failure.message)
        ? failure.message
        : "BILLING_UNAVAILABLE";
  return (
    <div className="appFrame arcCheckoutFrame" data-workspace="agent">
      <main className="arcCheckoutPage raSettings">
        {import.meta.env.VITE_UI_PREVIEW === "1" && (
          <div className="arcCheckoutPreviewNotice" role="status">
            <strong>PR PREVIEW</strong>
            <span>{tr("billing.arcCheckout.simulatedOrdersAndPaymentsNoReal")}</span>
            <a href="/checkout?demo=new">{tr("billing.arcCheckout.previewANewPurchase")}</a>
          </div>
        )}
        <header className="arcCheckoutHeader">
          <a href="/dashboard/agent/chat">
            <img src="/remote-arc.svg" width={30} height={30} alt="" />
            Remote Arc
          </a>
          <a href="/settings?section=billing">← {tr("billing.arcCheckout.planUsage")}</a>
        </header>
        <div className={"arcCheckoutIntro" + (embedded ? " arcCheckoutIntroPayment" : "")}>
          <span className="eyebrow">ARC BILLING</span>
          <h1>
            {result === "success"
              ? tr("billing.arcCheckout.yourPaymentStatus")
              : embedded
                ? tr("billing.arcCheckout.completeYourPayment")
                : tr("billing.arcCheckout.aPlanForTheWorkAhead")}
          </h1>
          <p>
            {embedded
              ? tr("billing.arcCheckout.paySecurelyWithACardOr")
              : tr("billing.arcCheckout.chooseYourPlanAndPaySecurely")}
          </p>
          <small>{email}</small>
        </div>
        {result !== "success" && (
          <ol className="arcCheckoutSteps" aria-label={tr("billing.arcCheckout.checkoutProgress")}>
            <li aria-current={!embedded ? "step" : undefined}>
              <span>{embedded ? "✓" : "1"}</span>
              {tr("billing.arcCheckout.chooseYourOffer")}
            </li>
            <li aria-current={embedded ? "step" : undefined}>
              <span>2</span>
              {tr("billing.arcCheckout.securePayment")}
            </li>
          </ol>
        )}
        {Boolean(failure) && (
          <div className="arcCheckoutAlert" role="alert">
            <p>{billingFailureMessage(failure, tr)}</p>
            <BillingRecoveryActions code={code} tr={tr} />
            {billingRecovery(code)?.retry === "check_status" &&
              (embedded?.sessionId || session) && (
                <a
                  className="raSettingsButton"
                  href={paymentStatusHref(embedded?.sessionId || session || undefined)}
                >
                  {tr("billing.arcCheckout.checkThisPaymentStatus")}
                </a>
              )}
            {code === "UNAUTHORIZED" && (
              <a className="raSettingsButton" href="/auth/login?return_to=%2Fcheckout">
                {tr("billing.arcCheckout.signIn")}
              </a>
            )}
            <details>
              <summary>{tr("billing.arcCheckout.referenceDetails")}</summary>
              <code>
                {code}
                {failure instanceof BillingFailure && failure.reference
                  ? " · " + failure.reference
                  : ""}
              </code>
            </details>
            {!data && (
              <button
                className="raSettingsButton"
                onClick={() => {
                  setFailure(null);
                  setRevision((value) => value + 1);
                }}
              >
                {tr("billing.arcCheckout.refreshStatus")}
              </button>
            )}
          </div>
        )}
        {!data && !failure && (
          <WorkspaceLoading label={tr("billing.arcCheckout.loadingYourOffers")} variant="cards" />
        )}
        {data && embedded && result !== "success" ? (
          <section className="arcCheckoutEmbedded">
            <header>
              <div>
                <h2>{orderLabel}</h2>
                <p>
                  {connect
                    ? tr("billing.arcCheckout.unlimitedConnectManageRenewalInSettings")
                    : plan
                      ? plan.monthlyCredits.toLocaleString() +
                        tr("billing.arcCheckout.creditsEveryMonthManageRenewalIn")
                      : tr("billing.arcCheckout.oneTimeTopUpCreditsDo")}
                </p>
              </div>
              <button
                type="button"
                className="raSettingsButton"
                disabled={busy}
                onClick={() => void back()}
              >
                {busy
                  ? tr("billing.arcCheckout.closingOrder")
                  : tr("billing.arcCheckout.backToOffers")}
              </button>
            </header>
            <div className="arcCheckoutPaymentNote">
              <span>{tr("billing.arcCheckout.availableExpressPaymentOptionsAppearIn")}</span>
              <span>{tr("billing.arcCheckout.pricesInUsdReviewTheFinal")}</span>
            </div>
            <Suspense
              fallback={
                <WorkspaceLoading
                  label={tr("billing.arcCheckout.loadingSecurePayment")}
                  variant="compact"
                />
              }
            >
              {embedded.mode === "elements" ? (
                <ElementsPayment
                  session={embedded}
                  locale={locale}
                  tr={tr}
                  onComplete={complete}
                  summary={{
                    label: orderLabel,
                    subtotal: price,
                    total: price,
                    cadence: plan
                      ? billed === "year"
                        ? tr("billing.arcCheckout.year")
                        : tr("billing.arcCheckout.month")
                      : tr("billing.arcCheckout.oneTime"),
                    recurringNote: plan
                      ? billed === "year"
                        ? tr("billing.arcCheckout.renewsYearlyUntilCancelledNoMonthly")
                        : connect
                          ? tr("billing.arcCheckout.renewsMonthlyUntilCancelledNoMonthly")
                          : tr("billing.arcCheckout.renewsMonthlyUntilCancelledMonthlyCredits")
                      : tr("billing.arcCheckout.topUpCreditsDoNotExpire"),
                  }}
                />
              ) : (
                <EmbeddedPayment session={embedded} locale={locale} tr={tr} onComplete={complete} />
              )}
            </Suspense>
          </section>
        ) : data && result === "success" ? (
          <section className="arcCheckoutResult" role="status">
            <h2>
              {payment === "confirmed"
                ? tr("billing.arcCheckout.paymentConfirmed")
                : payment === "waiting"
                  ? tr("billing.arcCheckout.confirmationIsTakingLonger")
                  : tr("billing.arcCheckout.confirmingYourPayment")}
            </h2>
            <p>
              {payment === "confirmed"
                ? tr("billing.arcCheckout.yourVerifiedPaymentAndUpdatedAllowance")
                : tr("billing.arcCheckout.weAreCheckingTheSavedPayment")}
            </p>
            <a
              className="raSettingsButton raSettingsButtonPrimary"
              href="/settings?section=billing"
            >
              {tr("billing.arcCheckout.viewPlanUsage")}
            </a>
            <a className="raSettingsButton" href="/dashboard/agent/chat">
              {tr("billing.arcCheckout.openArc")}
            </a>
          </section>
        ) : (
          data && (
            <div className="arcCheckoutLayout">
              <section
                className="arcCheckoutOptions"
                aria-label={tr("billing.arcCheckout.chooseAPlan")}
              >
                <h2>
                  {topup
                    ? tr("billing.arcCheckout.topUpYourCredits")
                    : tr("billing.arcCheckout.chooseYourPlan")}
                </h2>
                {result === "cancelled" && (
                  <p className="arcCheckoutQuiet" role="status">
                    {tr("billing.arcCheckout.checkoutWasClosedReviewYourChoice")}
                  </p>
                )}
                <div
                  className="arcCheckoutChoices"
                  role="group"
                  aria-label={tr("billing.arcCheckout.availableOffers")}
                >
                  {(topup
                    ? data.topups
                    : data.plans.filter((plan) => plan.monthlyPriceCents > 0)
                  ).map((offer) => (
                    <button
                      key={offer.id}
                      type="button"
                      aria-pressed={selected === offer.id}
                      disabled={busy}
                      onClick={() => choose(offer.id)}
                    >
                      <span>
                        <strong>
                          {"label" in offer
                            ? offer.label
                            : offer.credits.toLocaleString() + " Credits"}
                        </strong>
                        <small>
                          {"monthlyCredits" in offer && isConnectOnlyPlan(offer)
                            ? tr("billing.arcCheckout.yourOwnAiUnlimitedComputers")
                            : "monthlyCredits" in offer
                              ? offer.monthlyCredits.toLocaleString() +
                                tr("billing.arcCheckout.creditsMonth")
                              : tr("billing.arcCheckout.oneTimeTopUp")}
                        </small>
                      </span>
                      <span className="arcCheckoutOfferPrice">
                        US$
                        {("monthlyPriceCents" in offer
                          ? offer.monthlyPriceCents
                          : offer.priceCents) / 100}
                        <small>
                          {"monthlyPriceCents" in offer
                            ? tr("billing.arcCheckout.month2")
                            : tr("billing.arcCheckout.oneTime2")}
                        </small>
                      </span>
                    </button>
                  ))}
                </div>
                {yearlyCents !== null && (
                  <div
                    className="arcCheckoutCycle"
                    role="radiogroup"
                    aria-label={tr("billing.arcCheckout.billingPeriod")}
                  >
                    <button
                      type="button"
                      role="radio"
                      aria-checked={billed === "month"}
                      disabled={busy}
                      onClick={() => chooseCycle("month")}
                    >
                      <span>
                        <strong>{tr("billing.arcCheckout.monthly")}</strong>
                        <small>{tr("billing.arcCheckout.cancelRenewalAnytime")}</small>
                      </span>
                      <span className="arcCheckoutOfferPrice">
                        {"US" + usd(plan!.monthlyPriceCents)}
                        <small>{tr("billing.arcCheckout.month2")}</small>
                      </span>
                    </button>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={billed === "year"}
                      disabled={busy}
                      onClick={() => chooseCycle("year")}
                    >
                      <span>
                        <strong>{tr("billing.arcCheckout.yearly")}</strong>
                        <small>{yearlyAsMonthly}</small>
                      </span>
                      <span className="arcCheckoutOfferPrice">
                        {"US" + usd(yearlyCents)}
                        <small>{tr("billing.arcCheckout.year2")}</small>
                      </span>
                    </button>
                  </div>
                )}
                {plan && connect && (
                  <ul className="arcCheckoutFeatures">
                    {connectPlanFeatures(tr).map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                )}
                {plan && !connect && (
                  <ul className="arcCheckoutFeatures">
                    <li>{tr("billing.arcCheckout.hostedPersonalAgentAcrossYourApps")}</li>
                    <li>{tr("billing.arcCheckout.allConfiguredPremiumModels")}</li>
                    <li>
                      {plan.connectToolCalls === null
                        ? tr("billing.arcCheckout.unlimitedConnectCalls")
                        : plan.connectToolCalls.toLocaleString() +
                          tr("billing.arcCheckout.connectCallsMonth")}
                    </li>
                    <li>
                      {plan.concurrentRuns} {tr("billing.arcCheckout.concurrentRuns")} ·{" "}
                      {tr("billing.arcCheckout.upTo")}
                      {plan.maxSeconds / 60} {tr("billing.arcCheckout.minutesPerRun")}
                    </li>
                  </ul>
                )}
                {topup && <p>{tr("billing.arcCheckout.topUpCreditsDoNotExpire2")}</p>}
                <a href={topup ? "/checkout" : "/settings?section=billing"}>
                  {topup
                    ? tr("billing.arcCheckout.viewArcPlans")
                    : tr("billing.arcCheckout.keepMyCurrentPlan")}{" "}
                  →
                </a>
              </section>
              <aside
                className="arcCheckoutSummary"
                aria-label={tr("billing.arcCheckout.orderSummary")}
              >
                <span className="raSettingsFieldLabel">{tr("billing.arcCheckout.yourOrder")}</span>
                <h2>{orderLabel}</h2>
                {amount !== undefined && (
                  <p className="arcCheckoutTotal">
                    {price}
                    <small>
                      {plan
                        ? billed === "year"
                          ? tr("billing.arcCheckout.usdYear")
                          : tr("billing.arcCheckout.usdMonth")
                        : tr("billing.arcCheckout.usdOneTime")}
                    </small>
                  </p>
                )}
                {billed === "year" && <p className="arcCheckoutQuiet">{yearlyAsMonthly}</p>}
                {plan && (
                  <p>
                    {billed === "year"
                      ? tr("billing.arcCheckout.renewsYearlyUntilCancelledCancelRenewal")
                      : connect
                        ? tr("billing.arcCheckout.renewsMonthlyUntilCancelledCancelRenewal")
                        : tr("billing.arcCheckout.renewsMonthlyUntilCancelledCancelRenewal2")}
                  </p>
                )}
                {paid && plan && <p>{tr("billing.arcCheckout.planChangesTakeEffectAtYour")}</p>}
                {!paid && plan && !connect && (
                  <details className="arcCheckoutPromo">
                    <summary>{tr("billing.arcCheckout.haveAPromoCode")}</summary>
                    <label htmlFor="checkout-promo">{tr("billing.arcCheckout.promoCode")}</label>
                    <input
                      id="checkout-promo"
                      maxLength={32}
                      value={promo}
                      disabled={busy}
                      onChange={(event) => setPromo(event.target.value)}
                      autoComplete="off"
                    />
                    <small>
                      {tr("billing.arcCheckout.eligiblePrivateOffersApplyAutomaticallyVerify")}
                    </small>
                  </details>
                )}
                {scheduled ? (
                  <div role="status">
                    <p>
                      {tr("billing.arcCheckout.planChangeScheduledFor") +
                        new Date(scheduled).toLocaleDateString()}
                      {tr("billing.arcCheckout.noChargeToday")}
                    </p>
                    <a className="raSettingsButton" href="/settings?section=billing">
                      {tr("billing.arcCheckout.returnToPlanUsage")}
                    </a>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="raSettingsButton raSettingsButtonPrimary arcCheckoutContinue"
                    disabled={
                      busy ||
                      !available ||
                      !product ||
                      Boolean(topup && !arcPaid) ||
                      Boolean(
                        paid &&
                        plan?.id === data.plan.id &&
                        billed === (active?.billing_interval ?? "month") &&
                        !pendingChange,
                      )
                    }
                    onClick={() => void proceed()}
                  >
                    {busy
                      ? tr("billing.arcCheckout.preparingPayment")
                      : paid && plan
                        ? tr("billing.arcCheckout.confirmPlanChange")
                        : tr("billing.arcCheckout.continueToPayment")}
                  </button>
                )}
                {!available && (
                  <p role="status">{tr("billing.arcCheckout.checkoutIsTemporarilyUnavailable")}</p>
                )}
                {topup && !arcPaid && <p>{tr("billing.arcCheckout.chooseAPaidArcPlanBefore")}</p>}
                <small>{tr("billing.arcCheckout.applicableTaxEligibleDiscountsAndThe")}</small>
              </aside>
            </div>
          )
        )}
        <footer className="arcCheckoutFooter">
          <span>{tr("billing.arcCheckout.secureBillingByStripe")}</span>
          <div>
            <a href={"https://remotearc.app" + (locale === "zh" ? "/zh" : "") + "/terms"}>
              {tr("billing.arcCheckout.terms")}
            </a>
            <a href={"https://remotearc.app" + (locale === "zh" ? "/zh" : "") + "/privacy"}>
              {tr("billing.arcCheckout.privacy")}
            </a>
            <a href="https://remotearc.app/support?topic=billing">
              {tr("billing.arcCheckout.billingHelp")}
            </a>
          </div>
        </footer>
      </main>
    </div>
  );
}
