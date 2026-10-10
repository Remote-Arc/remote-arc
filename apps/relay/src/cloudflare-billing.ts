/** Normalize Cloudflare's restricted Alpha billable usage output.
 * This is account-level usage cost, NOT an invoice or real-time bill.
 */
export type BillableRow = {
  ServiceFamilyName?: string | null;
  ServiceName?: string | null;
  BillingCurrency?: string | null;
  ContractedCost?: number | null;
  BilledCost?: number | null;
  ChargePeriodStart?: string | null;
};
export function summarizeCloudflareBillableUsage(payload: unknown) {
  if (!payload || typeof payload !== "object") throw new Error("billing_invalid_response");
  const result = (payload as { result?: unknown }).result;
  if (!Array.isArray(result)) throw new Error("billing_invalid_rows");
  const buckets = new Map<string, number>();
  const currencies = new Set<string>();
  let total = 0;
  let counted = 0;
  for (const item of result as BillableRow[]) {
    const amount = typeof item.ContractedCost === "number" && Number.isFinite(item.ContractedCost)
      ? item.ContractedCost : typeof item.BilledCost === "number" && Number.isFinite(item.BilledCost)
        ? item.BilledCost : null;
    if (amount === null) continue;
    counted++;
    const currency = item.BillingCurrency || "USD";
    currencies.add(currency);
    const name = (item.ServiceFamilyName || item.ServiceName || "Other").slice(0, 80);
    buckets.set(name, (buckets.get(name) || 0) + amount);
    total += amount;
  }
  if (currencies.size > 1) throw new Error("billing_mixed_currencies");
  if (!counted && result.length) throw new Error("billing_costs_unavailable");
  return { total: Number(total.toFixed(4)), currency: [...currencies][0] || "USD",
    services: [...buckets.entries()].map(([name, cost]) => ({ name, cost: Number(cost.toFixed(4)) }))
      .sort((a,b) => b.cost - a.cost), rows: result.length };
}
