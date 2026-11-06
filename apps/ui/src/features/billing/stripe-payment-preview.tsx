import type { Translate } from "../../locales/locale-catalog.js";
import { useState } from "react";
import { ElementsShell, type ElementsSummary } from "./checkout-elements-shell.js";
import {
  billingRequest,
  billingFailureMessage,
  type NativePaymentSession,
} from "./arc-billing-client.js";
type Tr = Translate;
export function PaymentPreview({
  session,
  tr,
  onComplete,
}: {
  session: NativePaymentSession;
  tr: Tr;
  onComplete: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function complete() {
    if (busy) return;
    setBusy(true);
    try {
      await billingRequest("preview/complete", { sessionId: session.sessionId });
      onComplete();
    } catch (error) {
      setError(billingFailureMessage(error, tr));
      setBusy(false);
    }
  }
  return (
    <section className="arcPaymentPreview">
      <span className="eyebrow">PAYMENT PREVIEW</span>
      <h3>{tr("billing.stripePaymentPreview.aSecureWayToPay")}</h3>
      <p>{tr("billing.stripePaymentPreview.interactiveDemoNoRealPaymentOr")}</p>
      <fieldset disabled>
        <legend>{tr("billing.stripePaymentPreview.cardDetailsDisplayOnly")}</legend>
        <label>
          {tr("billing.stripePaymentPreview.cardNumber")}
          <input placeholder="4242 4242 4242 4242" autoComplete="off" />
        </label>
        <div>
          <label>
            {tr("billing.stripePaymentPreview.expiryDate")}
            <input placeholder="MM / YY" autoComplete="off" />
          </label>
          <label>
            CVC
            <input placeholder="•••" autoComplete="off" />
          </label>
        </div>
      </fieldset>
      <p className="arcCheckoutQuiet">
        {tr("billing.stripePaymentPreview.inLiveCheckoutStripeDisplaysThe")}
      </p>
      {error && <p role="alert">{error}</p>}
      <button
        type="button"
        className="raSettingsButton raSettingsButtonPrimary"
        disabled={busy}
        onClick={() => void complete()}
      >
        {busy
          ? tr("billing.stripePaymentPreview.simulating")
          : tr("billing.stripePaymentPreview.simulateCompletedPayment")}
      </button>
    </section>
  );
}
/** The same layout as live Elements checkout, with display-only fields. */
export function ElementsPreview({
  session,
  tr,
  onComplete,
  summary,
}: {
  session: NativePaymentSession;
  tr: Tr;
  onComplete: () => void;
  summary: ElementsSummary;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function complete() {
    if (busy) return;
    setBusy(true);
    try {
      await billingRequest("preview/complete", { sessionId: session.sessionId });
      onComplete();
    } catch (error) {
      setError(billingFailureMessage(error, tr));
      setBusy(false);
    }
  }
  return (
    <section className="arcPaymentPreview arcPaymentPreviewElements">
      <p className="arcCheckoutQuiet">
        {tr("billing.stripePaymentPreview.interactiveDemoNoRealPaymentOr")}
      </p>
      <ElementsShell
        tr={tr}
        summary={summary}
        busy={busy}
        canPay
        error={error}
        express={
          <p className="arcElementsStripeSlot">
            {tr("billing.stripePaymentPreview.inLiveCheckoutStripeShowsApple")}
          </p>
        }
        submitLabel={tr("billing.stripePaymentPreview.simulateCompletedPayment")}
        onSubmit={(event) => {
          event.preventDefault();
          void complete();
        }}
        footer={<small>{tr("billing.stripePaymentPreview.inLiveCheckoutTheseFieldsAre")}</small>}
        fields={
          <fieldset className="arcElementsField arcElementsPreviewFields" disabled>
            <legend>{tr("billing.stripePaymentPreview.cardDetailsDisplayOnly")}</legend>
            <label>
              {tr("billing.stripePaymentPreview.cardNumber")}
              <input placeholder="4242 4242 4242 4242" autoComplete="off" />
            </label>
            <div>
              <label>
                {tr("billing.stripePaymentPreview.expiryDate")}
                <input placeholder="MM / YY" autoComplete="off" />
              </label>
              <label>
                CVC
                <input placeholder="•••" autoComplete="off" />
              </label>
            </div>
          </fieldset>
        }
      />
    </section>
  );
}
export function MethodPreview({
  session,
  tr,
  onSaved,
  onClose,
}: {
  session: NativePaymentSession;
  tr: Tr;
  onSaved: () => void;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function save() {
    if (busy) return;
    setBusy(true);
    try {
      await billingRequest("payment-method/confirm", { setupIntentId: session.id });
      onSaved();
    } catch (error) {
      setError(billingFailureMessage(error, tr));
      setBusy(false);
    }
  }
  return (
    <section className="raBillingMethodForm">
      <h3>{tr("billing.stripePaymentPreview.paymentMethodPreview")}</h3>
      <p>{tr("billing.stripePaymentPreview.thisOnlyChangesASimulatedCard")}</p>
      {error && <p role="alert">{error}</p>}
      <footer>
        <button type="button" className="raSettingsButton" disabled={busy} onClick={onClose}>
          {tr("billing.stripePaymentPreview.close")}
        </button>
        <button
          type="button"
          className="raSettingsButton raSettingsButtonPrimary"
          disabled={busy}
          onClick={() => void save()}
        >
          {tr("billing.stripePaymentPreview.simulateSavingANewCard")}
        </button>
      </footer>
    </section>
  );
}
