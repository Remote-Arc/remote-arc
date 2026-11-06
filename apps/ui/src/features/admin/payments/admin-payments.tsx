import { canonicalErrorEnvelope } from "../../../../../../packages/protocol/src/error-codes.js";
import { useEffect, useRef, useState } from "react";
import { ARC_PLANS, ARC_TOPUPS, CONNECT_UNLIMITED_PLAN_ID } from "@remotearc/protocol";
import { useI18n } from "../../../app/i18n.js";
import "./admin-payments.css";
import { AdminFunding, type FundingOverview } from "./admin-funding.js";
import { AdminFeedbackRewards } from "./admin-feedback-rewards.js";
import { AdminTrials } from "./admin-trials.js";

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
const PAYMENT_TABS: Array<{ key: PaymentTab; label: [string, string]; purpose: [string, string] }> =
  [
    {
      key: "payments",
      label: ["Revenue", "收入"],
      purpose: [
        "How much came in this month, who paid, and any failed payment you need to handle.",
        "本月收了多少钱、谁付了款，以及需要处理的失败付款。",
      ],
    },
    {
      key: "trials",
      label: ["Trial users", "试用用户"],
      purpose: [
        "Who is on a trial and when it ends, so you can follow up before it expires.",
        "谁在试用、什么时候到期，方便在到期前跟进转化。",
      ],
    },
    {
      key: "promotions",
      label: ["Discount codes", "优惠码"],
      purpose: [
        "Create a discount code, publish it, or switch one off.",
        "创建折扣码、发布或停用。",
      ],
    },
    {
      key: "pricing",
      label: ["Plans & prices", "套餐与价格"],
      purpose: [
        "Change a plan’s price or allowance. Save a draft, check it, then publish. Existing subscribers keep their price.",
        "修改套餐价格或额度：先存草稿、核对后发布。已订阅用户保留原价。",
      ],
    },
    {
      key: "rewards",
      label: ["Feedback rewards", "反馈奖励"],
      purpose: [
        "Approve or reject people who earned extra calls by giving feedback.",
        "审核用户用反馈换取额外调用次数的申请。",
      ],
    },
    {
      key: "funding",
      label: ["Model budget", "模型预算"],
      purpose: [
        "Cap how much free trials can spend on AI models, so costs cannot run away.",
        "限制免费试用在 AI 模型上的花费，防止成本失控。",
      ],
    },
    {
      key: "audit",
      label: ["Change history", "变更记录"],
      purpose: ["Who changed a price or discount, and when.", "谁在什么时候修改了价格或优惠。"],
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
      plans: ARC_PLANS.map((p) => ({ ...p, versionId: "preview:" + p.id, revision: 1 })),
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
      setError(
        tr(
          "Payment data is unavailable. Check admin access and database migrations.",
          "暂时无法读取支付数据，请检查管理员权限和数据库迁移。",
        ),
      );
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
          ? tr(
              "The offer’s publication was not confirmed. Your draft is kept. Check the refreshed offer list below before retrying.",
              "优惠发布尚未获确认。草稿已保留，请先核对下方已刷新的优惠列表，再重试。",
            )
          : tr(
              "The payment service could not complete this request. Your changes are kept. Check the latest status before retrying.",
              "支付服务未能完成请求。修改内容已保留，请核对最新状态后再重试。",
            ),
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
      setNotice(
        tr(
          "New terms published. Existing paid subscriptions keep their original price and allowance.",
          "新条款已发布，现有付费订阅保留原价格和额度。",
        ),
      );
    }
  }
  const fields = editing
    ? Object.keys(editing).filter((k) => !["id", "label", "versionId", "revision"].includes(k))
    : [];
  const label = (key: string) =>
    ({
      monthlyPriceCents: tr("Monthly price · USD", "月费 · 美元"),
      yearlyPriceCents: tr(
        "Yearly price · USD · blank = monthly only",
        "年费 · 美元 · 留空表示仅按月",
      ),
      priceCents: tr("Price · USD", "价格 · 美元"),
      monthlyCredits: tr("Monthly Credits", "月度 Credits"),
      credits: "Credits",
      days: tr("Trial days", "试用天数"),
      connectToolCalls: tr(
        "Monthly Connect calls · blank = unlimited",
        "月度 Connect 调用 · 留空表示无限",
      ),
      deviceLimit: tr("Computers · blank = unlimited", "电脑数 · 留空表示无限"),
      connectionLimit: tr("App connections", "应用连接数"),
      concurrentRuns: tr("Concurrent runs", "并行工作数"),
      routines: tr("Routines", "重复任务数"),
      maxSteps: tr("Steps per run", "单次最大步骤"),
      maxTokens: tr("Tokens per run", "单次最大 tokens"),
      maxSeconds: tr("Seconds per run", "单次最大秒数"),
      allHostedModels: tr("All hosted models", "全部托管模型"),
    })[key] || key;
  if (!data)
    return (
      <section className="adminSurface">
        <p role="status">{error || tr("Loading payments…", "正在读取支付…")}</p>
        <button onClick={() => void refresh()}>{tr("Retry", "重试")}</button>
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
            ? tr("STRIPE SANDBOX", "STRIPE 沙盒")
            : tr("LIVE CATALOG", "正式配置")}
        </span>
        <p>
          {preview
            ? tr(
                "Illustrative data. Publishing is disabled in preview.",
                "示例数据，预览中不可发布。",
              )
            : data.configured
              ? tr(
                  "Connected to Stripe. All amounts below are USD.",
                  "已连接 Stripe，下方金额均为美元。",
                )
              : tr(
                  "Checkout is disabled. Configuration drafts are available; Stripe setup is required to publish paid offers.",
                  "结账尚未开放，可保存配置草稿；发布付费方案需要配置 Stripe。",
                )}
        </p>
        <button
          className="adminOutlineBtn"
          onClick={() => void refresh()}
          disabled={busy || preview}
        >
          {tr("Refresh", "刷新")}
        </button>
      </div>
      {error && (
        <div className="adminAlert" role="alert">
          <p>{error}</p>
          {errorReference && (
            <details>
              <summary>{tr("Reference details", "排查编号")}</summary>
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
        aria-label={tr("Payment sections", "支付栏目")}
      >
        {PAYMENT_TABS.map((item) => (
          <button
            role="tab"
            aria-selected={tab === item.key}
            className={tab === item.key ? "isActive" : ""}
            key={item.key}
            onClick={() => setTab(item.key)}
          >
            {tr(...item.label)}
          </button>
        ))}
      </div>
      <p className="adminPaymentPurpose">
        {tr(...PAYMENT_TABS.find((item) => item.key === tab)!.purpose)}
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
                {tr("Needs your action", "需要你处理")}{" "}
                <span>
                  {data.issues.length + data.events.length + (data.funding?.alert ? 1 : 0)}
                </span>
              </h2>
              <ul>
                {data.funding?.alert && (
                  <li>
                    <strong>
                      {tr("Model budget is paused or 80% used", "模型预算已暂停或已用到 80%")}
                    </strong>
                    <small>
                      {tr(
                        "Trial users may stop getting AI answers. Check provider balances, then adjust the budget.",
                        "试用用户可能无法再获得 AI 回答。请核对供应商余额后调整预算。",
                      )}{" "}
                      <button type="button" onClick={() => setTab("funding")}>
                        {tr("Open model budget", "打开模型预算")} →
                      </button>
                    </small>
                  </li>
                )}
                {data.issues.map((issue) => (
                  <li key={issue.invoice_id}>
                    <strong>
                      {tr("Payment failed: ", "付款失败：")}
                      {issue.email}
                    </strong>
                    <small>
                      {tr("Amount due ", "待付 ")}
                      {money(issue.amount_due_cents)} ·{" "}
                      {tr(
                        "Stripe will retry; contact the customer if it keeps failing.",
                        "Stripe 会自动重试；如果持续失败请联系客户。",
                      )}{" "}
                      · <code>{issue.invoice_id}</code>
                    </small>
                  </li>
                ))}
                {data.events.map((event) => (
                  <li key={event.id}>
                    <strong>
                      {tr(
                        "A Stripe notification was not processed",
                        "有一条 Stripe 支付通知未处理成功",
                      )}
                    </strong>
                    <small>
                      {tr(
                        "The customer may have paid without getting access. Check the event in Stripe.",
                        "客户可能已付款但没有拿到权益，请在 Stripe 中核对该事件。",
                      )}{" "}
                      · {event.status} · {event.error_code} · <code>{event.id}</code>
                    </small>
                  </li>
                ))}
              </ul>
            </section>
          ) : (
            <p className="adminPaymentClear">
              {tr(
                "Nothing to handle: no failed payments and no unprocessed Stripe notifications.",
                "没有需要处理的事项：没有失败付款，也没有未处理的 Stripe 通知。",
              )}
            </p>
          )}
          <div className="adminMetrics adminMetrics--overview">
            {[
              {
                label: tr("Received this month", "本月实收"),
                value: money(data.revenue.find((r) => r.state === "paid")?.cents || 0),
                caption:
                  data.month +
                  tr(" · verified payments, refunds excluded", " · 已核实付款，不含退款"),
              },
              {
                label: tr("Paying subscribers", "付费订阅用户"),
                value: data.recurring.customers,
                caption: tr("Will renew; excludes cancellations", "会续订的用户，不含已取消"),
              },
              {
                label: tr("Monthly subscription value", "订阅月收入（标价）"),
                value: money(data.recurring.cents),
                caption: tr("List price, before discounts and tax", "按标价计，不含优惠和税"),
              },
              {
                label: tr("Model cost this month", "本月模型成本（估算）"),
                value: money(data.modelCost.micros / 10000),
                caption: tr(
                  "Estimated AI model spend; excludes Stripe and hosting fees",
                  "AI 模型花费估算，不含 Stripe 手续费和服务器费用",
                ),
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
                <h2>{tr("Recent payments", "最近付款")}</h2>
                <p>
                  {tr(
                    "Payments Stripe has confirmed. A refunded payment does not count as revenue and removes what it paid for.",
                    "Stripe 已确认的付款。已退款的不计入收入，并会收回对应权益。",
                  )}
                </p>
              </div>
            </div>
            <div className="adminPaymentTable">
              <table>
                <thead>
                  <tr>
                    {[
                      tr("Customer", "客户"),
                      tr("Plan", "套餐"),
                      tr("Paid", "实付"),
                      tr("Discount", "优惠"),
                      tr("Status", "状态"),
                      tr("Verified", "确认时间"),
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
                            ? tr("Paid", "已付款")
                            : r.state === "refunded"
                              ? tr("Refunded", "已退款")
                              : r.state}
                        </span>
                      </td>
                      <td>{date(r.verified_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!data.receipts.length && (
                <p className="adminNoData">{tr("No verified payments yet.", "暂无已确认支付。")}</p>
              )}
            </div>
          </section>
        </>
      )}
      {tab === "pricing" && (
        <section className="adminSurface">
          <div className="adminSectionHeader">
            <div>
              <h2>{tr("Commercial configuration", "商业配置")}</h2>
              <p>
                {tr(
                  "Save a draft, review its exact terms, then publish. New purchases use the new version; paid subscriptions and started trials keep their saved terms.",
                  "先保存草稿、核对条款，再发布。新购买使用新版本；已付费订阅和已开始试用保留原条款。",
                )}
              </p>
            </div>
          </div>
          <label className="adminPaymentField">
            {tr("Offer", "配置项目")}
            <select value={selected} onChange={(e) => setSelected(e.target.value)}>
              {configs.map((c) => (
                <option value={c.id} key={c.id}>
                  {c.label ||
                    ("days" in c
                      ? tr("Arc trial", "Arc 试用")
                      : tr("Credit top-up", "Credits 充值"))}
                </option>
              ))}
            </select>
          </label>
          {editing && (
            <>
              <div className="adminPaymentForm">
                {"label" in editing && (
                  <label className="adminPaymentField">
                    {tr("Name", "名称")}
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
                <summary>{tr("Capacity and execution limits", "容量与执行上限")}</summary>
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
                {tr("Save draft for review", "保存草稿并核对")}
              </button>
              <small className="adminPaymentVersion">
                {tr("Current version", "当前版本")} {current?.versionId} · r{current?.revision}
              </small>
            </>
          )}
          {draft && review && (
            <div className="adminPaymentReview">
              <h3>{tr("Review before publishing", "发布前核对")}</h3>
              <p>
                {review.label || review.id} ·{" "}
                {review.monthlyPriceCents !== undefined
                  ? money(review.monthlyPriceCents) +
                    tr(" / month", " / 月") +
                    (review.yearlyPriceCents
                      ? " · " + money(review.yearlyPriceCents) + tr(" / year", " / 年")
                      : "")
                  : review.priceCents !== undefined
                    ? money(review.priceCents)
                    : review.days + tr(" days", " 天")}{" "}
                · {review.monthlyCredits ?? review.credits} Credits
                {review.monthlyCredits !== undefined ? tr(" / month", " / 月") : ""}
              </p>
              <p>
                {tr(
                  "This takes effect for new purchases immediately. Existing paid prices and allowances are retained.",
                  "发布后立即对新购买生效，现有已付费价格和额度保留。",
                )}
              </p>
              <button
                className="adminOutlineBtn"
                disabled={busy || preview}
                onClick={() => void publish(draft)}
              >
                {tr("Publish these terms", "发布上述条款")}
              </button>
            </div>
          )}
          {pending.length > 0 && (
            <details>
              <summary>
                {tr("Saved drafts", "已保存草稿")} ({pending.length})
              </summary>
              {pending.map((v) => (
                <div className="adminPaymentRow" key={v.id}>
                  <span>
                    {v.product_id} · {date(v.created_at)}
                  </span>
                  <button className="adminOutlineBtn" onClick={() => setDraft(v)}>
                    {tr("Review", "核对")}
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
            <h2>{tr("A useful offer, with clear terms.", "优惠条款，明确可控。")}</h2>
            <p>
              {tr(
                "One billing cycle, 1–90% off, one redemption per user. Enter an email for a private offer: it applies to their next eligible invoice, or to their first checkout. Credits stay unchanged. Offers do not stack.",
                "仅优惠一个账期，可减免 1–90%，每位用户限用一次。填写邮箱可定向优惠：用于其下一张符合条件的账单，或首次结账。Credits 不变，不叠加优惠。",
              )}
            </p>
            <div className="adminPaymentForm">
              <label className="adminPaymentField">
                {tr("Code", "优惠码")}
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
                {tr("Plan", "套餐")}
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
                {tr("Percent off", "减免百分比")}
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
                {tr("Customer email · optional", "客户邮箱 · 选填")}
                <input
                  type="email"
                  value={target}
                  onChange={(e) => {
                    setTarget(e.target.value);
                    setPromoDraft(null);
                  }}
                  placeholder={tr("Blank = public code", "留空为公开优惠码")}
                />
              </label>
              <label className="adminPaymentField">
                {tr("Expires · end of UTC date", "有效期至 · UTC 当日结束")}
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
                {tr("Maximum redemptions", "总使用次数上限")}
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
                {code || "—"} · {percent}% {tr("off", "减免")} ·{" "}
                {target || tr("Public code", "公开优惠码")}
              </strong>
              <p>
                {tr("Expires ", "有效期至 ")}
                {expires} UTC · {target ? 1 : maximum} {tr("redemptions", "次")} ·{" "}
                {tr(
                  "One invoice only; no immediate charge for existing subscriptions.",
                  "仅一张账单；现有订阅不会立即扣费。",
                )}
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
                  {tr("Save offer draft", "保存优惠草稿")}
                </button>
              ) : (
                <button
                  className="adminOutlineBtn"
                  disabled={busy || preview}
                  onClick={async () => {
                    if (await mutate("promotions/" + promoDraft + "/publish", {})) {
                      setPromoDraft(null);
                      setNotice(
                        tr(
                          "Offer published. Check its application status below.",
                          "优惠已发布，请查看下方应用状态。",
                        ),
                      );
                    }
                  }}
                >
                  {tr("Publish this offer", "发布上述优惠")}
                </button>
              )}
            </div>
          </section>
          <section className="adminSurface">
            <h2>{tr("Offers", "优惠列表")}</h2>
            {data.promotions.map((p) => (
              <div className="adminPaymentRow" key={p.id}>
                <div>
                  <strong>
                    {p.code} · {p.percent_off}% {tr("off", "减免")}
                  </strong>
                  <p>
                    {p.target_email || tr("Public", "公开")} · {p.product_id} ·{" "}
                    {(
                      {
                        draft: tr("Draft · not published", "草稿 · 未发布"),
                        active: tr("Active", "已发布"),
                        disabled: tr("Disabled", "已停用"),
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
                        ? tr("Publish", "发布")
                        : tr("Retry application", "重试应用")}
                    </button>
                  ) : null}
                  {p.status !== "disabled" && (
                    <button
                      className="adminOutlineBtn"
                      disabled={busy || preview}
                      onClick={() => {
                        if (
                          window.confirm(
                            tr(
                              "Disable future use of this code? Already applied invoice discounts remain valid.",
                              "停用此码的后续使用？已应用到账单的优惠仍有效。",
                            ),
                          )
                        )
                          void mutate("promotions/" + p.id + "/disable", {});
                      }}
                    >
                      {tr("Disable", "停用")}
                    </button>
                  )}
                </div>
              </div>
            ))}
            {!data.promotions.length && <p>{tr("No offers created.", "尚未创建优惠。")}</p>}
          </section>
        </>
      )}
      {tab === "audit" && (
        <section className="adminSurface">
          <h2>{tr("Published versions and operator history", "配置版本与操作记录")}</h2>
          <p>
            {tr(
              "Published terms cannot be edited. To restore earlier terms, copy that version into a new draft and publish it.",
              "已发布版本不可修改；恢复旧条款时，复制为新草稿再发布。",
            )}
          </p>
          {data.versions.map((v) => (
            <div className="adminPaymentRow" key={v.id}>
              <div>
                <strong>{v.product_id}</strong>
                <small>
                  {v.id} · {v.published_at ? date(v.published_at) : tr("Draft", "草稿")}
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
                {tr("Copy to new draft", "复制为新草稿")}
              </button>
            </div>
          ))}
          <h3>{tr("Audit trail", "审计记录")}</h3>
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
