import { canonicalErrorEnvelope } from "../../../../packages/protocol/src/error-codes.js";
import { useEffect, useState } from "react";
export type CatalogPlan = {
  id: string;
  label: string;
  monthlyPriceCents: number;
  /** Connect Unlimited only, once a yearly price is published. */
  yearlyPriceCents?: number | null;
  monthlyCredits: number;
  connectToolCalls: number | null;
  concurrentRuns: number;
  maxSeconds: number;
  deviceLimit: number | null;
  /** Published by every current catalog version; the plan details leave out a
   * term an older response does not send. */
  connectionLimit?: number;
  routines?: number;
  maxSteps?: number;
  maxTokens?: number;
  allHostedModels: boolean;
  versionId: string;
};
export type PlatformCatalog = {
  arcAvailable: boolean;
  billingAvailable: boolean;
  connectFreeCalls: number | null;
  plans: CatalogPlan[];
  topups: Array<{ id: string; priceCents: number; credits: number; versionId: string }>;
  trial: { days: number; credits: number };
};
let current: PlatformCatalog | null = null,
  pending: Promise<PlatformCatalog> | null = null,
  updatedAt = 0;
function load() {
  if (current && Date.now() - updatedAt < 30000) return Promise.resolve(current);
  if (!pending)
    pending = fetch("/api/billing/catalog", { credentials: "omit", cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw Error();
        const value = await response.json().then(canonicalErrorEnvelope);
        if (
          typeof value.arcAvailable !== "boolean" ||
          typeof value.billingAvailable !== "boolean" ||
          (value.connectFreeCalls !== null &&
            (!Number.isSafeInteger(value.connectFreeCalls) || value.connectFreeCalls < 1)) ||
          !Array.isArray(value.plans) ||
          !value.topups?.length ||
          !value.trial?.days
        )
          throw Error();
        updatedAt = Date.now();
        return (current = value as PlatformCatalog);
      })
      .finally(() => {
        pending = null;
      });
  return pending;
}
export function usePlatformCatalog() {
  const [catalog, setCatalog] = useState<PlatformCatalog | null>(current);
  useEffect(() => {
    let active = true;
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      void load()
        .then((value) => {
          if (active) setCatalog(value);
        })
        .catch(() => {
          if (active) setCatalog(null);
        });
    };
    refresh();
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  return catalog;
}
