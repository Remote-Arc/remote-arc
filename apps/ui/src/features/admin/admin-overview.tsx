import { lazy, Suspense, useState } from "react";
import { useI18n } from "../../app/i18n.js";
import { WorkspaceLoading } from "../../components/workspace-loading.js";
import { ProductIcon as Icon, type ProductIconName } from "../../components/product-icon.js";
import type { HealthSnapshot } from "./service-health-model.js";
import "./admin-overview.css";

const AdminApiUsage = lazy(() =>
  import("./admin-api-usage.js").then((module) => ({ default: module.AdminApiUsage })),
);

export type OverviewSection = "people" | "usage" | "devices" | "revenue" | "teams" | "inbox";
export type OverviewHour = { hour: string; calls: number; failed: number; users: number };
export type OverviewData = {
  checkedAt: string;
  unavailable: OverviewSection[];
  people: { total: number; new7d: number; activeToday: number; active7d: number } | null;
  usage: {
    monthlyCalls: number;
    calls24h: number;
    failed24h: number;
    callsPrevious24h: number;
    failedPrevious24h: number;
    hourly: OverviewHour[];
  } | null;
  devices: { total: number; online: number; complete: boolean } | null;
  revenue: {
    paidCents30d: number;
    payments30d: number;
    activeSubscriptions: number;
    activeTrials: number;
  } | null;
  teams: { teams: number; members: number } | null;
  inbox: { newSubmissions: number; openSupport: number } | null;
};

export type AdminSectionKey =
  "overview" | "leads" | "operations" | "health" | "followups" | "support" | "payments" | "events";

// Above this share of failed device calls in 24 hours, the overview asks for attention.
export const FAILURE_ATTENTION_RATE = 0.05;

const number = (value: number | undefined | null) =>
  value === undefined || value === null ? "—" : value.toLocaleString();
const usd = (cents: number) =>
  "$" + (cents / 100).toLocaleString(undefined, { maximumFractionDigits: cents % 100 ? 2 : 0 });
const percent = (value: number) =>
  (value * 100).toLocaleString(undefined, { maximumFractionDigits: value < 0.1 ? 1 : 0 }) + "%";

function change(current: number, previous: number) {
  if (previous === 0) return null;
  return (current - previous) / previous;
}

type Attention = {
  key: string;
  tone: "critical" | "warning" | "info";
  title: string;
  detail: string;
  target: AdminSectionKey;
  action: string;
};

function attentionItems(
  data: OverviewData | null,
  health: HealthSnapshot | null,
  tr: (en: string, zh: string) => string,
): Attention[] {
  const items: Attention[] = [];
  if (health && health.status !== "operational" && health.status !== "healthy") {
    items.push({
      key: "health",
      tone: health.status === "degraded" ? "warning" : "critical",
      title: tr("Service is degraded", "服务状态异常"),
      detail:
        tr("Errors in the last 15 minutes: ", "最近 15 分钟错误：") +
        number(health.worker?.errors15m) +
        tr(" · 24 hours: ", " · 24 小时：") +
        number(health.worker?.errors24h),
      target: "health",
      action: tr("Inspect", "查看"),
    });
  }
  const usage = data?.usage;
  if (usage && usage.calls24h > 0 && usage.failed24h / usage.calls24h >= FAILURE_ATTENTION_RATE) {
    items.push({
      key: "failures",
      tone: "warning",
      title: tr("Device calls are failing", "设备调用失败偏多"),
      detail:
        percent(usage.failed24h / usage.calls24h) +
        tr(" of tool calls failed in 24 hours (", " 的工具调用在 24 小时内失败（") +
        number(usage.failed24h) +
        tr(")", " 次）"),
      target: "health",
      action: tr("Inspect", "查看"),
    });
  }
  if (data?.inbox?.openSupport) {
    items.push({
      key: "support",
      tone: "info",
      title: tr("Customer mail waiting", "客户来信待回复"),
      detail: number(data.inbox.openSupport) + tr(" open conversations", " 个未处理会话"),
      target: "support",
      action: tr("Reply", "回复"),
    });
  }
  if (data?.inbox?.newSubmissions) {
    items.push({
      key: "leads",
      tone: "info",
      title: tr("New sign-up requests and feedback", "新的申请与反馈"),
      detail: number(data.inbox.newSubmissions) + tr(" not reviewed yet", " 条尚未查看"),
      target: "leads",
      action: tr("Review", "查看"),
    });
  }
  return items;
}

function AttentionList({
  data,
  health,
  loaded,
  setSection,
}: {
  data: OverviewData | null;
  health: HealthSnapshot | null;
  loaded: boolean;
  setSection: (section: AdminSectionKey) => void;
}) {
  const { tr } = useI18n();
  const items = attentionItems(data, health, tr);
  const unknown = !data?.inbox || !data?.usage || !health;
  return (
    <section className="ovAttention" aria-labelledby="ov-attention-title">
      <div className="ovSectionTitle">
        <h2 id="ov-attention-title">{tr("Needs your attention", "需要处理")}</h2>
        {items.length > 0 && <span className="ovCount">{items.length}</span>}
      </div>
      {items.length > 0 ? (
        <ul>
          {items.map((item) => (
            <li key={item.key} className={"ovAttentionItem is-" + item.tone}>
              <span className="ovDot" aria-hidden="true" />
              <div>
                <strong>{item.title}</strong>
                <small>{item.detail}</small>
              </div>
              <button type="button" onClick={() => setSection(item.target)}>
                {item.action}
                <Icon name="arrowUpRight" size={14} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className={"ovAllClear" + (loaded && !unknown ? " is-clear" : "")}>
          {!loaded
            ? tr("Checking…", "正在检查…")
            : unknown
              ? tr(
                  "Nothing flagged in the data that loaded. Some checks could not run.",
                  "已加载的数据中没有需要处理的事项，但部分检查未能完成。",
                )
              : tr(
                  "Nothing needs you right now. Service, device calls and inboxes are clear.",
                  "目前没有需要处理的事项：服务、设备调用和收件箱都正常。",
                )}
        </p>
      )}
    </section>
  );
}

function Kpi({
  label,
  value,
  detail,
  trend,
  icon,
  onOpen,
  openLabel,
}: {
  label: string;
  value: string;
  detail: string;
  trend?: { value: number | null; label: string; goodWhenUp?: boolean } | null;
  icon: ProductIconName;
  onOpen?: () => void;
  openLabel?: string;
}) {
  const direction =
    trend?.value === null || trend?.value === undefined ? 0 : Math.sign(trend.value);
  const good = trend?.goodWhenUp === false ? direction < 0 : direction > 0;
  return (
    <article className="ovKpi">
      <div className="ovKpiHead">
        <span>{label}</span>
        {onOpen ? (
          <button type="button" onClick={onOpen} aria-label={openLabel}>
            <Icon name={icon} size={16} />
          </button>
        ) : (
          <Icon name={icon} size={16} />
        )}
      </div>
      <strong>{value}</strong>
      <div className="ovKpiFoot">
        {trend && trend.value !== null && (
          <span className={"ovTrend " + (direction === 0 ? "" : good ? "is-good" : "is-bad")}>
            {direction > 0 ? "↑" : direction < 0 ? "↓" : "→"} {percent(Math.abs(trend.value))}{" "}
            <em>{trend.label}</em>
          </span>
        )}
        <small>{detail}</small>
      </div>
    </article>
  );
}

function ActivityChart({ data }: { data: OverviewData | null }) {
  const { tr } = useI18n();
  const [hours, setHours] = useState<24 | 48>(24);
  const usage = data?.usage;
  const end = data ? Math.floor(Date.parse(data.checkedAt) / 3600000) * 3600000 : Date.now();
  const byHour = new Map((usage?.hourly || []).map((row) => [row.hour.slice(0, 13), row]));
  const rows = Array.from({ length: hours }, (_, index) => {
    const hour = new Date(end - (hours - 1 - index) * 3600000).toISOString().slice(0, 13);
    return byHour.get(hour) || { hour, calls: 0, failed: 0, users: 0 };
  });
  const max = Math.max(1, ...rows.map((row) => row.calls));
  const calls = rows.reduce((sum, row) => sum + row.calls, 0);
  const failed = rows.reduce((sum, row) => sum + row.failed, 0);
  const peakUsers = Math.max(0, ...rows.map((row) => row.users));
  return (
    <section className="ovPanel ovChart">
      <div className="ovPanelHead">
        <div>
          <h2>{tr("Tool calls", "工具调用")}</h2>
          <p>
            {usage
              ? number(calls) +
                tr(" calls · ", " 次调用 · ") +
                number(failed) +
                tr(" failed · up to ", " 次失败 · 单小时最多 ") +
                peakUsers +
                tr(" people in an hour", " 人在用")
              : tr("Activity could not be loaded.", "调用数据暂时无法加载。")}
          </p>
        </div>
        <div className="adminRangeControl" role="group" aria-label={tr("Chart range", "图表范围")}>
          {([24, 48] as const).map((value) => (
            <button
              type="button"
              key={value}
              onClick={() => setHours(value)}
              aria-pressed={hours === value}
            >
              {value}h
            </button>
          ))}
        </div>
      </div>
      <div
        className="ovBars"
        role="img"
        aria-label={tr(
          `Hourly tool calls and failures over the last ${hours} hours`,
          `最近 ${hours} 小时每小时的工具调用与失败`,
        )}
      >
        {usage ? (
          rows.map((row) => (
            <div
              key={row.hour}
              className="ovBar"
              title={
                row.hour +
                ":00 UTC · " +
                row.calls +
                tr(" calls · ", " 次调用 · ") +
                row.failed +
                tr(" failed · ", " 次失败 · ") +
                row.users +
                tr(" people", " 人")
              }
              style={{ height: (row.calls ? Math.max(4, (100 * row.calls) / max) : 1.5) + "%" }}
            >
              {row.failed > 0 && (
                <span style={{ height: Math.max(8, (100 * row.failed) / row.calls) + "%" }} />
              )}
            </div>
          ))
        ) : (
          <div className="adminEmptyChart">{tr("No data", "暂无数据")}</div>
        )}
      </div>
      <div className="ovChartFoot">
        <span>
          {hours}h {tr("ago", "前")}
        </span>
        <span className="ovLegend">
          <i className="is-calls" /> {tr("Calls", "调用")} <i className="is-failed" />{" "}
          {tr("Failed", "失败")}
        </span>
        <span>{tr("Now · UTC", "现在 · UTC")}</span>
      </div>
    </section>
  );
}

function Vitals({
  data,
  setSection,
}: {
  data: OverviewData | null;
  setSection: (section: AdminSectionKey) => void;
}) {
  const { tr } = useI18n();
  const rows: Array<{
    label: string;
    value: string;
    detail: string;
    target: AdminSectionKey;
  }> = [
    {
      label: tr("Devices online", "在线设备"),
      value: data?.devices ? number(data.devices.online) + " / " + number(data.devices.total) : "—",
      detail: !data?.devices
        ? tr("Unavailable", "暂时无法读取")
        : data.devices.complete
          ? tr("Live from the device registry", "实时读取设备注册表")
          : tr("Some devices could not be checked", "部分设备未能检查"),
      target: "operations",
    },
    {
      label: tr("Tool calls this month", "本月工具调用"),
      value: number(data?.usage?.monthlyCalls),
      detail: tr("Charged calls, UTC month", "计费调用，按 UTC 月"),
      target: "operations",
    },
    {
      label: tr("Registered accounts", "注册账户"),
      value: number(data?.people?.total),
      detail: tr("All time", "累计"),
      target: "operations",
    },
    {
      label: tr("Teams", "团队"),
      value: data?.teams
        ? number(data.teams.teams) + tr(" · ", " 个 · ") + number(data.teams.members)
        : "—",
      detail: tr("Teams · active members", "团队数 · 活跃成员"),
      target: "operations",
    },
  ];
  return (
    <section className="ovPanel ovVitals">
      <div className="ovPanelHead">
        <h2>{tr("Product vitals", "产品概况")}</h2>
      </div>
      <dl>
        {rows.map((row) => (
          <div key={row.label}>
            <dt>{row.label}</dt>
            <dd>
              <strong>{row.value}</strong>
              <small>{row.detail}</small>
            </dd>
          </div>
        ))}
      </dl>
      <button type="button" className="adminOutlineBtn" onClick={() => setSection("operations")}>
        {tr("Open users & devices", "查看用户与设备")} →
      </button>
    </section>
  );
}

export function AdminOverview({
  data,
  health,
  loaded,
  setSection,
  preview = false,
}: {
  data: OverviewData | null;
  health: HealthSnapshot | null;
  loaded: boolean;
  setSection: (section: AdminSectionKey) => void;
  preview?: boolean;
}) {
  const { tr } = useI18n();
  const people = data?.people;
  const usage = data?.usage;
  const revenue = data?.revenue;
  const failureRate = usage && usage.calls24h ? usage.failed24h / usage.calls24h : null;
  return (
    <div className="ovRoot">
      <AttentionList data={data} health={health} loaded={loaded} setSection={setSection} />
      <div className="ovKpis">
        <Kpi
          label={tr("Active people today", "今日活跃用户")}
          value={number(people?.activeToday)}
          detail={
            people
              ? number(people.active7d) + tr(" active in the last 7 days", " 人近 7 天活跃")
              : tr("Unavailable", "暂时无法读取")
          }
          icon="users"
          onOpen={() => setSection("events")}
          openLabel={tr("Open business analytics", "查看经营分析")}
        />
        <Kpi
          label={tr("Tool calls · 24h", "工具调用 · 24 小时")}
          value={number(usage?.calls24h)}
          trend={
            usage
              ? {
                  value: change(usage.calls24h, usage.callsPrevious24h),
                  label: tr("vs previous 24h", "较前 24 小时"),
                }
              : null
          }
          detail={
            failureRate === null
              ? usage
                ? tr("No calls yet", "暂无调用")
                : tr("Unavailable", "暂时无法读取")
              : percent(1 - failureRate) + tr(" succeeded", " 成功率")
          }
          icon="activity"
          onOpen={() => setSection("health")}
          openLabel={tr("Open service health", "查看服务健康")}
        />
        <Kpi
          label={tr("New sign-ups · 7 days", "新注册 · 7 天")}
          value={number(people?.new7d)}
          detail={
            people
              ? number(people.total) + tr(" accounts in total", " 个累计账户")
              : tr("Unavailable", "暂时无法读取")
          }
          icon="add"
          onOpen={() => setSection("events")}
          openLabel={tr("Open business analytics", "查看经营分析")}
        />
        <Kpi
          label={tr("Revenue · 30 days", "营收 · 30 天")}
          value={revenue ? usd(revenue.paidCents30d) : "—"}
          detail={
            revenue
              ? number(revenue.payments30d) +
                tr(" payments · ", " 笔付款 · ") +
                number(revenue.activeSubscriptions) +
                tr(" subscriptions · ", " 个订阅 · ") +
                number(revenue.activeTrials) +
                tr(" trials", " 个试用")
              : tr("Unavailable", "暂时无法读取")
          }
          icon="chart"
          onOpen={() => setSection("payments")}
          openLabel={tr("Open payments", "查看支付")}
        />
      </div>
      <div className="ovGrid">
        <ActivityChart data={data} />
        <Vitals data={data} setSection={setSection} />
      </div>
      <Suspense
        fallback={
          <WorkspaceLoading
            label={tr("Loading model usage…", "正在读取模型用量…")}
            variant="rows"
          />
        }
      >
        <AdminApiUsage preview={preview} />
      </Suspense>
    </div>
  );
}
