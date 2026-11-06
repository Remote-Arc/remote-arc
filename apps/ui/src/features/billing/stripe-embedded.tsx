import type { Translate } from "../../locales/locale-catalog.js";
import { trackProductEvent } from "../../lib/product-events.js";
import { lazy, Suspense, useEffect, useRef, useState, type FormEvent } from "react";
import { loadStripe } from "@stripe/stripe-js/pure/index.js";
import type {
  Stripe,
  StripeElements,
  StripeEmbeddedCheckout,
  StripeElementLocale,
  StripeCheckoutLoadActionsSuccess,
  StripeCheckoutSession,
  StripeCheckoutConfirmResult,
} from "@stripe/stripe-js";
import { stripeAppearance, onThemeChange, STRIPE_FONTS } from "./stripe-appearance.js";
import { ElementsShell, type ElementsSummary } from "./checkout-elements-shell.js";
import {
  billingRequest,
  billingFailureMessage,
  type NativePaymentSession,
} from "./arc-billing-client.js";
import { WorkspaceLoading } from "../../components/workspace-loading.js";

type Tr = Translate;
type CheckoutProps = {
  session: NativePaymentSession;
  locale: StripeElementLocale;
  tr: Tr;
  onComplete: () => void;
};
type MethodProps = {
  session: NativePaymentSession;
  locale: StripeElementLocale;
  tr: Tr;
  onSaved: () => void;
  onClose: () => void;
};
type ElementsProps = CheckoutProps & { summary: ElementsSummary };
const PreviewCheckout =
  import.meta.env.VITE_UI_PREVIEW === "1"
    ? lazy(() =>
        import("./stripe-payment-preview.js").then((module) => ({
          default: module.PaymentPreview,
        })),
      )
    : null;
const PreviewMethod =
  import.meta.env.VITE_UI_PREVIEW === "1"
    ? lazy(() =>
        import("./stripe-payment-preview.js").then((module) => ({ default: module.MethodPreview })),
      )
    : null;
const PreviewElements =
  import.meta.env.VITE_UI_PREVIEW === "1"
    ? lazy(() =>
        import("./stripe-payment-preview.js").then((module) => ({
          default: module.ElementsPreview,
        })),
      )
    : null;
export function StripeEmbeddedCheckout(props: CheckoutProps) {
  return PreviewCheckout ? (
    <Suspense fallback={null}>
      <PreviewCheckout {...props} />
    </Suspense>
  ) : (
    <LiveEmbeddedCheckout {...props} />
  );
}
function LiveEmbeddedCheckout({ session, locale, tr, onComplete }: CheckoutProps) {
  const host = useRef<HTMLDivElement>(null),
    completed = useRef(onComplete),
    [ready, setReady] = useState(false),
    [failed, setFailed] = useState(false),
    [retry, setRetry] = useState(0);
  completed.current = onComplete;
  useEffect(() => {
    let disposed = false,
      checkout: StripeEmbeddedCheckout | undefined;
    setReady(false);
    setFailed(false);
    const timeout = setTimeout(() => {
      if (!disposed) {
        setFailed(true);
        trackProductEvent("billing.payment.load_failed", {
          entityId: session.sessionId,
          errorCode: "PAYMENT_FORM_LOAD_FAILED",
        });
      }
    }, 20000);
    void loadStripe(session.publishableKey, { locale })
      .then(async (stripe) => {
        if (disposed) return;
        if (!stripe) throw Error("BILLING_UNAVAILABLE");
        const instance = await stripe.createEmbeddedCheckoutPage({
          clientSecret: session.clientSecret,
          onComplete: () => {
            if (!disposed) completed.current();
          },
        });
        if (disposed) {
          instance.destroy();
          return;
        }
        checkout = instance;
        if (host.current) instance.mount(host.current);
        clearTimeout(timeout);
        setFailed(false);
        setReady(true);
        trackProductEvent("billing.payment.mounted", { entityId: session.sessionId });
      })
      .catch(() => {
        clearTimeout(timeout);
        if (!disposed) {
          setFailed(true);
          trackProductEvent("billing.payment.load_failed", {
            entityId: session.sessionId,
            errorCode: "PAYMENT_FORM_LOAD_FAILED",
          });
        }
      });
    return () => {
      disposed = true;
      clearTimeout(timeout);
      checkout?.destroy();
    };
  }, [session.clientSecret, session.publishableKey, locale, retry]);
  return (
    <section
      className="arcEmbeddedPayment"
      aria-label={tr("billing.stripeEmbedded.securePayment")}
      aria-busy={!ready && !failed}
    >
      {!ready && !failed && (
        <WorkspaceLoading
          label={tr("billing.stripeEmbedded.loadingSecurePayment")}
          variant="compact"
        />
      )}
      {failed && (
        <div role="alert">
          <p>{tr("billing.stripeEmbedded.thePaymentFormCouldNotLoad")}</p>
          <button className="raSettingsButton" onClick={() => setRetry((value) => value + 1)}>
            {tr("billing.stripeEmbedded.reloadPaymentForm")}
          </button>
        </div>
      )}
      <div ref={host} />
    </section>
  );
}
export function StripePaymentMethod(props: MethodProps) {
  return PreviewMethod ? (
    <Suspense fallback={null}>
      <PreviewMethod {...props} />
    </Suspense>
  ) : (
    <LivePaymentMethod {...props} />
  );
}
function LivePaymentMethod({ session, locale, tr, onSaved, onClose }: MethodProps) {
  const host = useRef<HTMLDivElement>(null),
    stripeRef = useRef<Stripe | null>(null),
    elementsRef = useRef<StripeElements | null>(null),
    confirmedIntent = useRef<string | null>(null),
    live = useRef(true),
    lock = useRef(false),
    [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    let disposed = false,
      destroy: undefined | (() => void);
    live.current = true;
    void loadStripe(session.publishableKey, { locale })
      .then((stripe) => {
        if (disposed) return;
        if (!stripe) throw Error("BILLING_UNAVAILABLE");
        stripeRef.current = stripe;
        const elements = stripe.elements({
          clientSecret: session.clientSecret,
          appearance: stripeAppearance(host.current ?? document.body),
          fonts: STRIPE_FONTS,
        });
        elementsRef.current = elements;
        const stopTheme = onThemeChange(() =>
          elements.update({ appearance: stripeAppearance(host.current ?? document.body) }),
        );
        const payment = elements.create("payment");
        destroy = () => {
          stopTheme();
          payment.destroy();
        };
        payment.on("ready", () => {
          if (!disposed) setReady(true);
        });
        payment.on("loaderror", () => {
          if (!disposed) setError(tr("billing.stripeEmbedded.theSecureFormCouldNotLoad"));
        });
        if (host.current) payment.mount(host.current);
      })
      .catch(() => {
        if (!disposed) setError(tr("billing.stripeEmbedded.theSecureFormCouldNotLoad"));
      });
    return () => {
      disposed = true;
      live.current = false;
      destroy?.();
      stripeRef.current = null;
      elementsRef.current = null;
    };
  }, [session.clientSecret, session.publishableKey, locale, tr]);
  async function save(event: FormEvent) {
    event.preventDefault();
    if (lock.current || !stripeRef.current || !elementsRef.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      if (!confirmedIntent.current) {
        const result = await stripeRef.current.confirmSetup({
          elements: elementsRef.current,
          confirmParams: { return_url: new URL("/settings?section=billing", location.origin).href },
          redirect: "if_required",
        });
        if (result.error || result.setupIntent?.status !== "succeeded")
          throw Error("BILLING_PAYMENT_METHOD_NOT_READY");
        confirmedIntent.current = result.setupIntent.id;
      }
      await billingRequest("payment-method/confirm", { setupIntentId: confirmedIntent.current });
      if (live.current) onSaved();
    } catch (error) {
      if (live.current) setError(billingFailureMessage(error, tr));
    } finally {
      lock.current = false;
      if (live.current) setBusy(false);
    }
  }
  return (
    <form className="raBillingMethodForm" onSubmit={(event) => void save(event)}>
      <h3>{tr("billing.stripeEmbedded.updatePaymentMethod")}</h3>
      <p>{tr("billing.stripeEmbedded.yourNewMethodWillBeUsed")}</p>
      {!ready && !error && (
        <WorkspaceLoading
          label={tr("billing.stripeEmbedded.loadingSecureForm")}
          variant="compact"
        />
      )}
      <div ref={host} />
      {error && <p role="alert">{error}</p>}
      <footer>
        <button type="button" className="raSettingsButton" disabled={busy} onClick={onClose}>
          {tr("billing.stripeEmbedded.close")}
        </button>
        <button
          className="raSettingsButton raSettingsButtonPrimary"
          type="submit"
          disabled={!ready || busy}
        >
          {busy
            ? tr("billing.stripeEmbedded.verifying")
            : tr("billing.stripeEmbedded.savePaymentMethod")}
        </button>
      </footer>
    </form>
  );
}
/** Checkout Sessions with ui_mode=elements: our layout, Stripe's themed fields. */
export function StripeElementsCheckout(props: ElementsProps) {
  return PreviewElements ? (
    <Suspense fallback={null}>
      <PreviewElements {...props} />
    </Suspense>
  ) : (
    <LiveElementsCheckout {...props} />
  );
}
function LiveElementsCheckout({ session, locale, tr, onComplete, summary }: ElementsProps) {
  const scope = useRef<HTMLDivElement>(null),
    expressHost = useRef<HTMLDivElement>(null),
    paymentHost = useRef<HTMLDivElement>(null),
    addressHost = useRef<HTMLDivElement>(null),
    actions = useRef<StripeCheckoutLoadActionsSuccess | null>(null),
    completed = useRef(onComplete),
    live = useRef(true),
    lock = useRef(false);
  completed.current = onComplete;
  const [expressState, setExpressState] = useState<"pending" | "available" | "none">("pending"),
    [stripeSession, setStripeSession] = useState<StripeCheckoutSession | null>(null),
    [ready, setReady] = useState(false),
    [failed, setFailed] = useState(false),
    [retry, setRetry] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    let disposed = false,
      cleanup: undefined | (() => void);
    live.current = true;
    setReady(false);
    setFailed(false);
    setError("");
    setExpressState("pending");
    const fail = () => {
      if (!disposed) {
        setFailed(true);
        trackProductEvent("billing.payment.load_failed", {
          entityId: session.sessionId,
          errorCode: "PAYMENT_FORM_LOAD_FAILED",
        });
      }
    };
    const timeout = setTimeout(fail, 20000);
    void loadStripe(session.publishableKey, { locale })
      .then(async (stripe) => {
        if (disposed) return;
        if (!stripe) throw Error("BILLING_UNAVAILABLE");
        const checkout = stripe.initCheckoutElementsSdk({
          clientSecret: session.clientSecret,
          elementsOptions: {
            appearance: stripeAppearance(scope.current ?? document.body),
            fonts: STRIPE_FONTS,
          },
        });
        checkout.on("change", (value) => {
          if (!disposed) setStripeSession(value);
        });
        const loaded = await checkout.loadActions();
        if (loaded.type !== "success") throw Error("BILLING_UNAVAILABLE");
        if (disposed) return;
        actions.current = loaded.actions;
        setStripeSession(loaded.actions.getSession());
        // Apple Pay, Google Pay and Link one-tap buttons. Stripe decides which apply to this device.
        const walletTheme = () =>
          document.documentElement.dataset.theme === "dark"
            ? ("white" as const)
            : ("black" as const);
        const express = checkout.createExpressCheckoutElement({
          buttonHeight: 48,
          buttonTheme: { applePay: walletTheme(), googlePay: walletTheme() },
          buttonType: undefined,
          layout: { maxColumns: 3, maxRows: 1, overflow: "auto" },
          paymentMethodOrder: ["apple_pay", "google_pay", "link"],
          paymentMethods: undefined,
        });
        express.on("ready", (event) => {
          if (!disposed)
            setExpressState(
              event.availablePaymentMethods &&
                Object.values(event.availablePaymentMethods).some(Boolean)
                ? "available"
                : "none",
            );
        });
        express.on("loaderror", () => {
          if (!disposed) setExpressState("none");
        });
        express.on("confirm", (event) => {
          void confirmPayment(() =>
            loaded.actions.confirm({ expressCheckoutConfirmEvent: event, redirect: "if_required" }),
          );
        });
        const payment = checkout.createPaymentElement({ layout: { type: "tabs" } }),
          address = session.billingAddress ? checkout.createBillingAddressElement() : null;
        payment.on("ready", () => {
          if (disposed) return;
          clearTimeout(timeout);
          setReady(true);
          trackProductEvent("billing.payment.mounted", { entityId: session.sessionId });
        });
        payment.on("loaderror", () => {
          clearTimeout(timeout);
          fail();
        });
        if (expressHost.current) express.mount(expressHost.current);
        if (paymentHost.current) payment.mount(paymentHost.current);
        if (address && addressHost.current) address.mount(addressHost.current);
        // Wallet button colors are fixed at creation; card fields follow theme switches live.
        const stopTheme = onThemeChange(() =>
          checkout.changeAppearance(stripeAppearance(scope.current ?? document.body)),
        );
        cleanup = () => {
          stopTheme();
          express.destroy();
          payment.destroy();
          address?.destroy();
        };
      })
      .catch(() => {
        clearTimeout(timeout);
        fail();
      });
    return () => {
      disposed = true;
      live.current = false;
      clearTimeout(timeout);
      cleanup?.();
      actions.current = null;
    };
  }, [session.clientSecret, session.publishableKey, session.billingAddress, locale, retry]);
  // One confirmation path for the card form and the one-tap wallet buttons.
  async function confirmPayment(confirm: () => Promise<StripeCheckoutConfirmResult>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      // Cards finish here; 3D Secure opens Stripe's own dialog, redirect methods return via return_url.
      const result = await confirm();
      if (result.type === "error") {
        if (live.current)
          setError(result.error.message || tr("billing.stripeEmbedded.thePaymentDidNotGoThrough"));
        return;
      }
      if (live.current) completed.current();
    } catch {
      if (live.current) setError(tr("billing.stripeEmbedded.thePaymentDidNotGoThrough"));
    } finally {
      lock.current = false;
      if (live.current) setBusy(false);
    }
  }
  function pay(event: FormEvent) {
    event.preventDefault();
    const current = actions.current;
    if (current) void confirmPayment(() => current.confirm({ redirect: "if_required" }));
  }
  const total = stripeSession?.total,
    shown: ElementsSummary = total
      ? {
          ...summary,
          subtotal: total.subtotal.amount,
          total: total.total.amount,
          discount: total.discount.minorUnitsAmount > 0 ? total.discount.amount : undefined,
          tax: total.taxExclusive.minorUnitsAmount > 0 ? total.taxExclusive.amount : undefined,
        }
      : summary;
  return (
    <div ref={scope}>
      <ElementsShell
        tr={tr}
        summary={shown}
        busy={busy}
        canPay={ready && !failed && Boolean(stripeSession?.canConfirm ?? true)}
        error={error}
        onSubmit={pay}
        express={<div ref={expressHost} />}
        expressState={expressState}
        status={
          <>
            {!ready && !failed && (
              <WorkspaceLoading
                label={tr("billing.stripeEmbedded.loadingSecurePayment")}
                variant="compact"
              />
            )}
            {failed && (
              <div className="arcElementsError" role="alert">
                <p>{tr("billing.stripeEmbedded.thePaymentFormCouldNotLoad")}</p>
                <button
                  type="button"
                  className="raSettingsButton"
                  onClick={() => setRetry((value) => value + 1)}
                >
                  {tr("billing.stripeEmbedded.reloadPaymentForm")}
                </button>
              </div>
            )}
          </>
        }
        fields={
          <>
            <div ref={paymentHost} className="arcElementsField" />
            {session.billingAddress && <div ref={addressHost} className="arcElementsField" />}
          </>
        }
      />
    </div>
  );
}
