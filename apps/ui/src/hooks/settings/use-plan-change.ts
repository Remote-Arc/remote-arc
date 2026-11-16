import { useEffect, useRef, useState } from "react";
import {
  billingRequest,
  type ArcBilling,
  type BillingInterval,
} from "../../features/billing/arc-billing-client.js";

/** What changing to the chosen plan does, as the Relay previews it (plan/preview). */
export type PlanChangePreview = {
  mode: "trial" | "upgrade" | "scheduled";
  productId: string;
  interval: BillingInterval;
  priceCents: number;
  /** trial: the first charge; scheduled: the renewal it waits for. */
  effectiveAt?: string;
  /** upgrade: Stripe's preview of today's charge. */
  creditCents?: number;
  taxCents?: number;
  totalCents?: number;
  renewsAt?: string | null;
};
type Outcome = "switched" | "scheduled" | "upgrading" | "upgraded" | "pending";

/**
 * A paid account changing plan: preview it, then confirm. An upgrade charges today's
 * previewed amount only after the person agrees; a trial switches for nothing; a
 * move down is scheduled for the renewal. After an upgrade the plan follows the
 * payment's webhook, so the new plan is waited for before it is shown as active.
 */
export function usePlanChange(input: {
  enabled: boolean;
  productId?: string;
  versionId?: string;
  interval: BillingInterval;
  onChanged: () => void;
}) {
  const { enabled, productId, versionId, interval } = input;
  const [preview, setPreview] = useState<PlanChangePreview | null>(null),
    [failure, setFailure] = useState<unknown>(null),
    [busy, setBusy] = useState(false),
    [agreed, setAgreed] = useState(false),
    [outcome, setOutcome] = useState<Outcome | null>(null),
    // Bumped when the amount changed before confirming, to fetch a fresh quote.
    [quote, setQuote] = useState(0),
    [repriced, setRepriced] = useState(false);
  const changed = useRef(input.onChanged);
  changed.current = input.onChanged;
  // A new choice starts over; a finished change keeps its outcome on screen even after
  // the refreshed billing makes the new plan the current one.
  useEffect(() => {
    setAgreed(false);
    setOutcome(null);
    setRepriced(false);
  }, [productId, versionId, interval]);
  useEffect(() => {
    setPreview(null);
    setFailure(null);
    if (!enabled || !productId) return;
    const controller = new AbortController();
    billingRequest<PlanChangePreview>(
      "plan/preview",
      { productId, versionId, interval },
      controller.signal,
    )
      .then((value) => !controller.signal.aborted && setPreview(value))
      .catch((error) => !controller.signal.aborted && setFailure(error));
    return () => controller.abort();
  }, [enabled, productId, versionId, interval, quote]);

  async function waitForPlan(target: string) {
    for (let attempt = 0; attempt < 15; attempt++) {
      const billing = await billingRequest<ArcBilling>("").catch(() => null);
      if (billing?.plan.id === target) return true;
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    return false;
  }

  async function confirm() {
    if (busy || !preview || (preview.mode === "upgrade" && !agreed)) return;
    setBusy(true);
    setFailure(null);
    try {
      const response = await billingRequest<{
        upgraded?: boolean;
        changed?: boolean;
        scheduled?: boolean;
      }>("plan/change", {
        productId,
        versionId,
        interval,
        // The amount the person agreed to; the Relay charges it or nothing.
        ...(preview.mode === "upgrade" ? { quotedTotalCents: preview.totalCents } : {}),
      });
      if (response.upgraded) {
        setOutcome("upgrading");
        setOutcome((await waitForPlan(preview.productId)) ? "upgraded" : "pending");
      } else setOutcome(response.changed ? "switched" : "scheduled");
      changed.current();
    } catch (error) {
      // The amount moved since the preview: show the new one and ask again.
      if (error instanceof Error && error.message === "BILLING_PRICE_CHANGED") {
        setAgreed(false);
        setRepriced(true);
        setQuote((value) => value + 1);
      } else setFailure(error);
    } finally {
      setBusy(false);
    }
  }
  return { preview, failure, busy, agreed, setAgreed, outcome, repriced, confirm };
}
export type PlanChange = ReturnType<typeof usePlanChange>;
