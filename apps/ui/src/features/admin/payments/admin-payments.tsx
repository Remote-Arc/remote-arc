import type { MessageKey } from "../../../locales/locale-catalog.js";
import { canonicalErrorEnvelope } from "../../../../../../packages/protocol/src/error-codes.js";
import { useEffect, useRef, useState } from "react";
import { ARC_PLANS, ARC_TOPUPS, CONNECT_UNLIMITED_PLAN_ID } from "@remotearc/protocol";
import { useI18n } from "../../../hooks/use-i18n.js";
import "../../../styles/admin/payments/admin-payments.css";
import { AdminFunding, type FundingOverview } from "./admin-funding.js";
import { AdminFeedbackRewards } from "./admin-feedback-rewards.js";
import { AdminTrials } from "./admin-trials.js";
import { PUBLISHED_PLAN_LABELS } from "../../../preview/billing-preview.js";

type Config = {
  id: string;
  label?: string;
  monthlyPriceCents?: number;
  monthlyCredits?: number;
  priceCents?: number;
  credits?: number;
  days?: number;
  connectToolCalls?: number | null;
  versionId: string;
  revision: number;
  [key: string]: unknown;
};
type Version = {
  id: string;
  product_id: string;
  kind: "plan" | "topup" | "trial";
  config_json: string;
  published_at: string | null;
  created_at: string;
  base_revision: number;
};
type Promotion = {
  id: string;
  code: string;
  product_id: string;
  percent_off: number;
  target_email: string | null;
  status: string;
  expires_at: string;
  redemptions: number;
  max_redemptions: number;
  assignment_status?: string;
};
type Payments = {
  funding?: FundingOverview;
  mode: string;
  configured: boolean;
  month: string;
  revenue: Array<{ state: string; cents: number; receipts: number }>;
  recurring: { customers: number; cents: number };
  modelCost: { micros: number };
  receipts: Array<{
    id: string;
    email: string;
    product_id: string;
    state: string;
    amount_cents: number;
    discount_cents: number;
    verified_at: string;
  }>;
  issues: Array<{ invoice_id: string; email: string; amount_due_cents: number }>;
  events: Array<{ id: string; error_code: string; status: string }>;
  catalog: { plans: Config[]; topups: Config[]; trial: Config };
  versions: Version[];
  promotions: Promotion[];
  audit: Array<{
    id: string;
    actor_email: string;
    action: string;
    subject_id: string;
    created_at: string;
  }>;
};
type PaymentTab =
  "payments" | "trials" | "promotions" | "pricing" | "rewards" | "funding" | "audit";
// Each tab says what you do there, so the purpose is clear before opening it.
const PAYMENT_TABS: Array<{ key: PaymentTab; label: MessageKey; purpose: MessageKey }> = [
  {
    key: "payments",
    label: "admin.payments.adminPayments.revenue",
    purpose: "admin.payments.adminPayments.howMuchCameInThis",
  },
  {
    key: "trials",
    label: "admin.payments.adminPayments.trialUsers",
    purpose: "admin.payments.adminPayments.whoIsOnATrial",
  },
  {
    key: "promotions",
    label: "admin.payments.adminPayments.discountCodes",
    purpose: "admin.payments.adminPayments.createADiscountCodePublish",
  },
  {
    key: "pricing",
    label: "admin.payments.adminPayments.plansPrices",
    purpose: "admin.payments.adminPayments.changeAPlanSPrice",
  },
  {
    key: "rewards",
    label: "admin.payments.adminPayments.feedbackRewards",
    purpose: "admin.payments.adminPayments.approveOrRejectPeopleWho",
  },
  {
    key: "funding",
    label: "admin.payments.adminPayments.modelBudget",
    purpose: "admin.payments.adminPayments.capHowMuchFreeTrials",
  },
  {
    key: "audit",
    label: "admin.payments.adminPayments.changeHistory",
    purpose: "admin.payments.adminPayments.whoChangedAPriceOr",
  },
];
const money = (cents: number) =>
  new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(cents / 100);
const date = (value: string) => new Date(value).toLocaleString();
function previewData(): Payments {
  return {
    funding: {
      managed: 1,
      enabled: 1,
      revision: 1,
      total_micros: 3000000,
      daily_micros: 500000,
      spent: 410000,
      reserved: 70000,
      dailyUsed: 95000,
      alert: false,
      trials: { total: 9, active: 6, startedToday: 2 },
      usage: [
        {
          provider: "openai",
          model_id: "arc-auto",
          day: new Date().toISOString().slice(0, 10),
          calls: 40,
          users: 6,
          spent: 25000,
          reserved: 70000,
        },
      ],
      audit: [],
    },
    mode: "test",
    configured: false,
    month: new Date().toISOString().slice(0, 7),
    revenue: [{ state: "paid", cents: 23600, receipts: 4 }],
    recurring: { customers: 4, cents: 23600 },
    modelCost: { micros: 41200000 },
    receipts: [
      {
        id: "in_example",
        email: "alex@example.invalid",
        product_id: "arc-plus-v1",
        state: "paid",
        amount_cents: 3120,
        discount_cents: 780,
        verified_at: new Date().toISOString(),
      },
    ],
    issues: [],
    events: [],
    catalog: {
      plans: ARC_PLANS.map((p) => ({
        ...p,
        label: PUBLISHED_PLAN_LABELS[p.id] ?? p.label,
        versionId: "preview:" + p.id,
        revision: 1,
      })),
      topups: ARC_TOPUPS.map((p) => ({ ...p, versionId: "preview:" + p.id, revision: 1 })),
      trial: {
        id: "arc-trial-v1",
        days: 14,
        credits: 200,
        versionId: "preview:trial",
        revision: 1,
      },
    },
    versions: [],
    promotions: [
      {
        id: "preview-offer",
        code: "WELCOME20",
        product_id: "arc-plus-v1",
        percent_off: 20,
        target_email: null,
        status: "active",
        expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
        redemptions: 1,
        max_redemptions: 100,
      },
    ],
    audit: [],
  };
}
export function AdminPayments({ preview = false }: { preview?: boolean }) {
  const { tr } = useI18n(),
    [data, setData] = useState<Payments | null>(() => (preview ? previewData() : null)),
    [tab, setTab] = useState<PaymentTab>("payments"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [errorReference, setErrorReference] = useState("");
  const mutationLock = useRef(false);
  const [selected, setSelected] = useState("arc-plus-v1"),
    [editing, setEditing] = useState<Config | null>(null),
    [draft, setDraft] = useState<Version | null>(null);
  const [code, setCode] = useState(""),
    [percent, setPercent] = useState(20),
    [target, setTarget] = useState(""),
    [offerPlan, setOfferPlan] = useState("arc-plus-v1"),
    [maximum, setMaximum] = useState(100),
    [expires, setExpires] = useState(() =>
      new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
    ),
    [promoDraft, setPromoDraft] = useState<string | null>(null);
  async function refresh() {
    if (preview) return;
    try {
      const r = await fetch("/api/admin/payments", { credentials: "same-origin" });
      if (!r.ok) throw Error("HTTP " + r.status);
      setData(await r.json().then(canonicalErrorEnvelope));
    } catch {
      setError(tr("admin.payments.adminPayments.paymentDataIsUnavailableCheckAdmin"));
    }
  }
  useEffect(() => {
    void refresh();
  }, [preview]);
  const configs = data ? [...data.catalog.plans, ...data.catalog.topups, data.catalog.trial] : [],
    current = configs.find((p) => p.id === selected);
  useEffect(() => {
    // Connect Unlimited may add a yearly price; blank keeps it monthly-only.
    setEditing(
      current
        ? current.id === CONNECT_UNLIMITED_PLAN_ID
          ? { yearlyPriceCents: null, ...current }
          : { ...current }
        : null,
    );
    setDraft(null);
  }, [current?.versionId, selected]);
  async function mutate(path: string, value: unknown) {
    if (preview || mutationLock.current) return null;
    mutationLock.current = true;
    setBusy(true);
    setError("");
    setErrorReference("");
    setNotice("");
    try {
      const r = await fetch("/api/admin/payments/" + path, {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(value),
        }),
        result = await r.json().then(canonicalErrorEnvelope);
      if (!r.ok) throw Error(result.error || "payments_unavailable");
      await refresh();
      return result;
    } catch (e) {
      const code = e instanceof Error ? e.message : "payments_unavailable";
      await refresh();
      setErrorReference(/^[A-Z][A-Z0-9_]{0,100}$/.test(code) ? code : "PAYMENT_ACTION_UNCONFIRMED");
      setError(
        path.startsWith("promotions/")
          ? tr("admin.payments.adminPayments.theOfferSPublicationWasNot")
          : tr("admin.payments.adminPayments.thePaymentServiceCouldNotComplete"),
      );
      return null;
    } finally {
      mutationLock.current = false;
      setBusy(false);
    }
  }
  async function save() {
    if (!editing || !current) return;
    const { versionId: _, revision, ...config } = editing,
      id = crypto.randomUUID(),
      kind = "days" in config ? "trial" : "monthlyPriceCents" in config ? "plan" : "topup";
    const result = await mutate("config/drafts", { id, kind, revision: current.revision, config });
    if (result)
      setDraft({
        id,
        kind,
        product_id: config.id,
        config_json: JSON.stringify(config),
        published_at: null,
        created_at: new Date().toISOString(),
        base_revision: current.revision,
      });
  }
  async function publish(version: Version) {
    if (await mutate("config/" + version.id + "/publish", {})) {
      setDraft(null);
      setNotice(tr("admin.payments.adminPayments.newTermsPublishedExistingPaidSubscriptions"));
    }
  }
  const fields = editing
    ? Object.keys(editing).filter((k) => !["id", "label", "versionId", "revision"].includes(k))
    : [];
  const label = (key: string) =>
    ({
      monthlyPriceCents: tr("admin.payments.adminPayments.monthlyPriceUsd"),
      yearlyPriceCents: tr("admin.payments.adminPayments.yearlyPriceUsdBlankMonthlyOnly"),
      priceCents: tr("admin.payments.adminPayments.priceUsd"),
      monthlyCredits: tr("admin.payments.adminPayments.monthlyCredits"),
      credits: "Credits",
      days: tr("admin.payments.adminPayments.trialDays"),
      connectToolCalls: tr("admin.payments.adminPayments.monthlyConnectCallsBlankUnlimited"),
      deviceLimit: tr("admin.payments.adminPayments.computersBlankUnlimited"),
      connectionLimit: tr("admin.payments.adminPayments.appConnections"),
      concurrentRuns: tr("admin.payments.adminPayments.concurrentRuns"),
      routines: tr("admin.payments.adminPayments.routines"),
      maxSteps: tr("admin.payments.adminPayments.stepsPerRun"),
      maxTokens: tr("admin.payments.adminPayments.tokensPerRun"),
      maxSeconds: tr("admin.payments.adminPayments.secondsPerRun"),
      allHostedModels: tr("admin.payments.adminPayments.allHostedModels"),
    })[key] || key;
  if (!data)
    return (
      <section className="adminSurface">
        <p role="status">{error || tr("admin.payments.adminPayments.loadingPayments")}</p>
        <button onClick={() => void refresh()}>{tr("admin.payments.adminPayments.retry")}</button>
      </section>
    );
  const productName = (id: string) => configs.find((item) => item.id === id)?.label || id;
  const pending = data.versions.filter((v) => !v.published_at),
    review = draft && { ...JSON.parse(draft.config_json) };
  return (
    <div className="adminPayments">
      <div className="adminPaymentMode">
        <span className="adminLeadStatus">
          {data.mode === "test"
            ? tr("admin.payments.adminPayments.stripeSandbox")
            : tr("admin.payments.adminPayments.liveCatalog")}
        </span>
        <p>
          {preview
            ? tr("admin.payments.adminPayments.illustrativeDataPublishingIsDisabledIn")
            : data.configured
              ? tr("admin.payments.adminPayments.connectedToStripeAllAmountsBelow")
              : tr("admin.payments.adminPayments.checkoutIsDisabledConfigurationDraftsAre")}
        </p>
        <button
          className="adminOutlineBtn"
          onClick={() => void refresh()}
          disabled={busy || preview}
        >
          {tr("admin.payments.adminPayments.refresh")}
        </button>
      </div>
      {error && (
        <div className="adminAlert" role="alert">
          <p>{error}</p>
          {errorReference && (
            <details>
              <summary>{tr("admin.payments.adminPayments.referenceDetails")}</summary>
              <code>{errorReference}</code>
            </details>
          )}
        </div>
      )}
      {notice && (
        <p className="adminPaymentNotice" role="status">
          {notice}
        </p>
      )}

      <div
        className="adminFilterRow"
        role="tablist"
        aria-label={tr("admin.payments.adminPayments.paymentSections")}
      >
        {PAYMENT_TABS.map((item) => (
          <button
            role="tab"
            aria-selected={tab === item.key}
            className={tab === item.key ? "isActive" : ""}
            key={item.key}
            onClick={() => setTab(item.key)}
          >
            {tr(item.label)}
          </button>
        ))}
      </div>
      <p className="adminPaymentPurpose">
        {tr(PAYMENT_TABS.find((item) => item.key === tab)!.purpose)}
      </p>
      {tab === "trials" && <AdminTrials preview={preview} />}
      {tab === "rewards" && <AdminFeedbackRewards preview={preview} />}
      {tab === "funding" && (
        <AdminFunding funding={data.funding} busy={busy} preview={preview} mutate={mutate} />
      )}
      {tab === "payments" && (
        <>
          {data.issues.length || data.events.length || data.funding?.alert ? (
            <section className="adminPaymentIssues" aria-labelledby="payment-issues-title">
              <h2 id="payment-issues-title">
                {tr("admin.payments.adminPayments.needsYourAction")}{" "}
                <span>
                  {data.issues.length + data.events.length + (data.funding?.alert ? 1 : 0)}
                </span>
              </h2>
              <ul>
                {data.funding?.alert && (
                  <li>
                    <strong>{tr("admin.payments.adminPayments.modelBudgetIsPausedOrUsed")}</strong>
                    <small>
                      {tr("admin.payments.adminPayments.trialUsersMayStopGettingAi")}{" "}
                      <button type="button" onClick={() => setTab("funding")}>
                        {tr("admin.payments.adminPayments.openModelBudget")} →
                      </button>
                    </small>
                  </li>
                )}
                {data.issues.map((issue) => (
                  <li key={issue.invoice_id}>
                    <strong>
                      {tr("admin.payments.adminPayments.paymentFailed")}
                      {issue.email}
                    </strong>
                    <small>
                      {tr("admin.payments.adminPayments.amountDue")}
                      {money(issue.amount_due_cents)} ·{" "}
                      {tr("admin.payments.adminPayments.stripeWillRetryContactTheCustomer")} ·{" "}
                      <code>{issue.invoice_id}</code>
                    </small>
                  </li>
                ))}
                {data.events.map((event) => (
                  <li key={event.id}>
                    <strong>
                      {tr("admin.payments.adminPayments.aStripeNotificationWasNotProcessed")}
                    </strong>
                    <small>
                      {tr("admin.payments.adminPayments.theCustomerMayHavePaidWithout")} ·{" "}
                      {event.status} · {event.error_code} · <code>{event.id}</code>
                    </small>
                  </li>
                ))}
              </ul>
            </section>
          ) : (
            <p className="adminPaymentClear">
              {tr("admin.payments.adminPayments.nothingToHandleNoFailedPayments")}
            </p>
          )}
          <div className="adminMetrics adminMetrics--overview">
            {[
              {
                label: tr("admin.payments.adminPayments.receivedThisMonth"),
                value: money(data.revenue.find((r) => r.state === "paid")?.cents || 0),
                caption:
                  data.month + tr("admin.payments.adminPayments.verifiedPaymentsRefundsExcluded"),
              },
              {
                label: tr("admin.payments.adminPayments.payingSubscribers"),
                value: data.recurring.customers,
                caption: tr("admin.payments.adminPayments.willRenewExcludesCancellations"),
              },
              {
                label: tr("admin.payments.adminPayments.monthlySubscriptionValue"),
                value: money(data.recurring.cents),
                caption: tr("admin.payments.adminPayments.listPriceBeforeDiscountsAndTax"),
              },
              {
                label: tr("admin.payments.adminPayments.modelCostThisMonth"),
                value: money(data.modelCost.micros / 10000),
                caption: tr("admin.payments.adminPayments.estimatedAiModelSpendExcludesStripe"),
              },
            ].map((item) => (
              <article className="adminMetricCard" key={item.label}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
                <small>{item.caption}</small>
              </article>
            ))}
          </div>
          <section className="adminSurface">
            <div className="adminSectionHeader">
              <div>
                <h2>{tr("admin.payments.adminPayments.recentPayments")}</h2>
                <p>{tr("admin.payments.adminPayments.paymentsStripeHasConfirmedARefunded")}</p>
              </div>
            </div>
            <div className="adminPaymentTable">
              <table>
                <thead>
                  <tr>
                    {[
                      tr("admin.payments.adminPayments.customer"),
                      tr("admin.payments.adminPayments.plan"),
                      tr("admin.payments.adminPayments.paid"),
                      tr("admin.payments.adminPayments.discount"),
                      tr("admin.payments.adminPayments.status"),
                      tr("admin.payments.adminPayments.verified"),
                    ].map((h) => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.receipts.map((r) => (
                    <tr key={r.id}>
                      <td>
                        {r.email}
                        <small>{r.id}</small>
                      </td>
                      <td>
                        {productName(r.product_id)}
                        <small>{r.product_id}</small>
                      </td>
                      <td>{money(r.amount_cents)}</td>
                      <td>{r.discount_cents ? money(r.discount_cents) : "—"}</td>
                      <td>
                        <span className={"adminPaymentState is-" + r.state}>
                          {r.state === "paid"
                            ? tr("admin.payments.adminPayments.paid2")
                            : r.state === "refunded"
                              ? tr("admin.payments.adminPayments.refunded")
                              : r.state}
                        </span>
                      </td>
                      <td>{date(r.verified_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!data.receipts.length && (
                <p className="adminNoData">
                  {tr("admin.payments.adminPayments.noVerifiedPaymentsYet")}
                </p>
              )}
            </div>
          </section>
        </>
      )}
      {tab === "pricing" && (
        <section className="adminSurface">
          <div className="adminSectionHeader">
            <div>
              <h2>{tr("admin.payments.adminPayments.commercialConfiguration")}</h2>
              <p>{tr("admin.payments.adminPayments.saveADraftReviewItsExact")}</p>
            </div>
          </div>
          <label className="adminPaymentField">
            {tr("admin.payments.adminPayments.offer")}
            <select value={selected} onChange={(e) => setSelected(e.target.value)}>
              {configs.map((c) => (
                <option value={c.id} key={c.id}>
                  {c.label ||
                    ("days" in c
                      ? tr("admin.payments.adminPayments.arcTrial")
                      : tr("admin.payments.adminPayments.creditTopUp"))}
                </option>
              ))}
            </select>
          </label>
          {editing && (
            <>
              <div className="adminPaymentForm">
                {"label" in editing && (
                  <label className="adminPaymentField">
                    {tr("admin.payments.adminPayments.name")}
                    <input
                      value={String(editing.label)}
                      onChange={(e) => {
                        setEditing({ ...editing, label: e.target.value });
                        setDraft(null);
                      }}
                      maxLength={40}
                    />
                  </label>
                )}
                {fields
                  .filter((k) =>
                    [
                      "monthlyPriceCents",
                      "yearlyPriceCents",
                      "priceCents",
                      "monthlyCredits",
                      "credits",
                      "days",
                      "connectToolCalls",
                    ].includes(k),
                  )
                  .map((key) => (
                    <label className="adminPaymentField" key={key}>
                      {label(key)}
                      <input
                        type="number"
                        min="0"
                        step={key.endsWith("Cents") ? "0.01" : "1"}
                        value={
                          editing[key] === null
                            ? ""
                            : Number(editing[key]) / (key.endsWith("Cents") ? 100 : 1)
                        }
                        onChange={(e) => {
                          setEditing({
                            ...editing,
                            [key]:
                              (key === "connectToolCalls" || key === "yearlyPriceCents") &&
                              e.target.value === ""
                                ? null
                                : Math.round(
                                    Number(e.target.value) * (key.endsWith("Cents") ? 100 : 1),
                                  ),
                          });
                          setDraft(null);
                        }}
                      />
                    </label>
                  ))}
              </div>
              <details>
                <summary>{tr("admin.payments.adminPayments.capacityAndExecutionLimits")}</summary>
                <div className="adminPaymentForm">
                  {fields
                    .filter(
                      (k) =>
                        ![
                          "monthlyPriceCents",
                          "yearlyPriceCents",
                          "priceCents",
                          "monthlyCredits",
                          "credits",
                          "days",
                          "connectToolCalls",
                        ].includes(k),
                    )
                    .map((key) => (
                      <label className="adminPaymentField" key={key}>
                        {label(key)}
                        {typeof editing[key] === "boolean" ? (
                          <input
                            type="checkbox"
                            checked={Boolean(editing[key])}
                            onChange={(e) => {
                              setEditing({ ...editing, [key]: e.target.checked });
                              setDraft(null);
                            }}
                          />
                        ) : (
                          <input
                            type="number"
                            value={editing[key] === null ? "" : Number(editing[key])}
                            onChange={(e) => {
                              setEditing({
                                ...editing,
                                [key]:
                                  key === "deviceLimit" && e.target.value === ""
                                    ? null
                                    : Number(e.target.value),
                              });
                              setDraft(null);
                            }}
                          />
                        )}
                      </label>
                    ))}
                </div>
              </details>
              <button
                className="adminOutlineBtn"
                disabled={busy || preview}
                onClick={() => void save()}
              >
                {tr("admin.payments.adminPayments.saveDraftForReview")}
              </button>
              <small className="adminPaymentVersion">
                {tr("admin.payments.adminPayments.currentVersion")} {current?.versionId} · r
                {current?.revision}
              </small>
            </>
          )}
          {draft && review && (
            <div className="adminPaymentReview">
              <h3>{tr("admin.payments.adminPayments.reviewBeforePublishing")}</h3>
              <p>
                {review.label || review.id} ·{" "}
                {review.monthlyPriceCents !== undefined
                  ? money(review.monthlyPriceCents) +
                    tr("admin.payments.adminPayments.month") +
                    (review.yearlyPriceCents
                      ? " · " +
                        money(review.yearlyPriceCents) +
                        tr("admin.payments.adminPayments.year")
                      : "")
                  : review.priceCents !== undefined
                    ? money(review.priceCents)
                    : review.days + tr("admin.payments.adminPayments.days")}{" "}
                · {review.monthlyCredits ?? review.credits} Credits
                {review.monthlyCredits !== undefined
                  ? tr("admin.payments.adminPayments.month")
                  : ""}
              </p>
              <p>{tr("admin.payments.adminPayments.thisTakesEffectForNewPurchases")}</p>
              <button
                className="adminOutlineBtn"
                disabled={busy || preview}
                onClick={() => void publish(draft)}
              >
                {tr("admin.payments.adminPayments.publishTheseTerms")}
              </button>
            </div>
          )}
          {pending.length > 0 && (
            <details>
              <summary>
                {tr("admin.payments.adminPayments.savedDrafts")} ({pending.length})
              </summary>
              {pending.map((v) => (
                <div className="adminPaymentRow" key={v.id}>
                  <span>
                    {v.product_id} · {date(v.created_at)}
                  </span>
                  <button className="adminOutlineBtn" onClick={() => setDraft(v)}>
                    {tr("admin.payments.adminPayments.review")}
                  </button>
                </div>
              ))}
            </details>
          )}
        </section>
      )}
      {tab === "promotions" && (
        <>
          <section className="adminSurface">
            <h2>{tr("admin.payments.adminPayments.aUsefulOfferWithClearTerms")}</h2>
            <p>{tr("admin.payments.adminPayments.oneBillingCycleOffOneRedemption")}</p>
            <div className="adminPaymentForm">
              <label className="adminPaymentField">
                {tr("admin.payments.adminPayments.code")}
                <input
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value.toUpperCase());
                    setPromoDraft(null);
                  }}
                  maxLength={32}
                  placeholder="WELCOME20"
                />
              </label>
              <label className="adminPaymentField">
                {tr("admin.payments.adminPayments.plan")}
                <select
                  value={offerPlan}
                  onChange={(e) => {
                    setOfferPlan(e.target.value);
                    setPromoDraft(null);
                  }}
                >
                  {data.catalog.plans
                    .filter((p) => p.id !== "free" && p.id !== CONNECT_UNLIMITED_PLAN_ID)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                </select>
              </label>
              <label className="adminPaymentField">
                {tr("admin.payments.adminPayments.percentOff")}
                <input
                  type="number"
                  min="1"
                  max="90"
                  value={percent}
                  onChange={(e) => {
                    setPercent(Number(e.target.value));
                    setPromoDraft(null);
                  }}
                />
              </label>
              <label className="adminPaymentField">
                {tr("admin.payments.adminPayments.customerEmailOptional")}
                <input
                  type="email"
                  value={target}
                  onChange={(e) => {
                    setTarget(e.target.value);
                    setPromoDraft(null);
                  }}
                  placeholder={tr("admin.payments.adminPayments.blankPublicCode")}
                />
              </label>
              <label className="adminPaymentField">
                {tr("admin.payments.adminPayments.expiresEndOfUtcDate")}
                <input
                  type="date"
                  value={expires}
                  onChange={(e) => {
                    setExpires(e.target.value);
                    setPromoDraft(null);
                  }}
                />
              </label>
              <label className="adminPaymentField">
                {tr("admin.payments.adminPayments.maximumRedemptions")}
                <input
                  type="number"
                  min="1"
                  max="100000"
                  value={maximum}
                  onChange={(e) => {
                    setMaximum(Number(e.target.value));
                    setPromoDraft(null);
                  }}
                />
              </label>
            </div>
            <div className="adminPaymentReview">
              <strong>
                {code || "—"} · {percent}% {tr("admin.payments.adminPayments.off")} ·{" "}
                {target || tr("admin.payments.adminPayments.publicCode")}
              </strong>
              <p>
                {tr("admin.payments.adminPayments.expires")}
                {expires} UTC · {target ? 1 : maximum}{" "}
                {tr("admin.payments.adminPayments.redemptions")} ·{" "}
                {tr("admin.payments.adminPayments.oneInvoiceOnlyNoImmediateCharge")}
              </p>
              {!promoDraft ? (
                <button
                  className="adminOutlineBtn"
                  disabled={busy || preview}
                  onClick={async () => {
                    const result = await mutate("promotions/drafts", {
                      id: crypto.randomUUID(),
                      code,
                      productId: offerPlan,
                      percentOff: percent,
                      ...(target.trim() ? { targetEmail: target.trim() } : {}),
                      expiresAt: expires + "T23:59:59.000Z",
                      maxRedemptions: target ? 1 : maximum,
                    });
                    if (result) setPromoDraft(result.id);
                  }}
                >
                  {tr("admin.payments.adminPayments.saveOfferDraft")}
                </button>
              ) : (
                <button
                  className="adminOutlineBtn"
                  disabled={busy || preview}
                  onClick={async () => {
                    if (await mutate("promotions/" + promoDraft + "/publish", {})) {
                      setPromoDraft(null);
                      setNotice(
                        tr("admin.payments.adminPayments.offerPublishedCheckItsApplicationStatus"),
                      );
                    }
                  }}
                >
                  {tr("admin.payments.adminPayments.publishThisOffer")}
                </button>
              )}
            </div>
          </section>
          <section className="adminSurface">
            <h2>{tr("admin.payments.adminPayments.offers")}</h2>
            {data.promotions.map((p) => (
              <div className="adminPaymentRow" key={p.id}>
                <div>
                  <strong>
                    {p.code} · {p.percent_off}% {tr("admin.payments.adminPayments.off")}
                  </strong>
                  <p>
                    {p.target_email || tr("admin.payments.adminPayments.public")} · {p.product_id} ·{" "}
                    {(
                      {
                        draft: tr("admin.payments.adminPayments.draftNotPublished"),
                        active: tr("admin.payments.adminPayments.active"),
                        disabled: tr("admin.payments.adminPayments.disabled"),
                      } as Record<string, string>
                    )[p.status] || p.status}
                    {p.assignment_status ? " / " + p.assignment_status : ""}
                  </p>
                  <small>
                    {p.redemptions}/{p.max_redemptions} · {date(p.expires_at)}
                  </small>
                </div>
                <div>
                  {p.status === "draft" ||
                  (p.status === "active" && p.target_email && p.assignment_status !== "applied") ? (
                    <button
                      className="adminOutlineBtn"
                      disabled={busy || preview}
                      onClick={() => void mutate("promotions/" + p.id + "/publish", {})}
                    >
                      {p.status === "draft"
                        ? tr("admin.payments.adminPayments.publish")
                        : tr("admin.payments.adminPayments.retryApplication")}
                    </button>
                  ) : null}
                  {p.status !== "disabled" && (
                    <button
                      className="adminOutlineBtn"
                      disabled={busy || preview}
                      onClick={() => {
                        if (
                          window.confirm(
                            tr("admin.payments.adminPayments.disableFutureUseOfThisCode"),
                          )
                        )
                          void mutate("promotions/" + p.id + "/disable", {});
                      }}
                    >
                      {tr("admin.payments.adminPayments.disable")}
                    </button>
                  )}
                </div>
              </div>
            ))}
            {!data.promotions.length && <p>{tr("admin.payments.adminPayments.noOffersCreated")}</p>}
          </section>
        </>
      )}
      {tab === "audit" && (
        <section className="adminSurface">
          <h2>{tr("admin.payments.adminPayments.publishedVersionsAndOperatorHistory")}</h2>
          <p>{tr("admin.payments.adminPayments.publishedTermsCannotBeEditedTo")}</p>
          {data.versions.map((v) => (
            <div className="adminPaymentRow" key={v.id}>
              <div>
                <strong>{v.product_id}</strong>
                <small>
                  {v.id} ·{" "}
                  {v.published_at ? date(v.published_at) : tr("admin.payments.adminPayments.draft")}
                </small>
              </div>
              <button
                className="adminOutlineBtn"
                disabled={busy || preview}
                onClick={() => {
                  const head = configs.find((p) => p.id === v.product_id);
                  if (head) {
                    setSelected(v.product_id);
                    setTab("pricing");
                    setTimeout(() => {
                      setEditing({
                        ...JSON.parse(v.config_json),
                        versionId: head.versionId,
                        revision: head.revision,
                      });
                      setDraft(null);
                    }, 0);
                  }
                }}
              >
                {tr("admin.payments.adminPayments.copyToNewDraft")}
              </button>
            </div>
          ))}
          <h3>{tr("admin.payments.adminPayments.auditTrail")}</h3>
          {data.audit.map((a) => (
            <p className="adminPaymentAudit" key={a.id}>
              {date(a.created_at)} · {a.actor_email || "—"} · {a.action}
              <small>{a.subject_id}</small>
            </p>
          ))}
        </section>
      )}
    </div>
  );
}
