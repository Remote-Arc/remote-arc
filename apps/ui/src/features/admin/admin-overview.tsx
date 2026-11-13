import type { Translate } from "../../locales/locale-catalog.js";
import { lazy, Suspense, useState } from "react";
import { useI18n } from "../../hooks/use-i18n.js";
import { WorkspaceLoading } from "../../components/workspace-loading.js";
import { ProductIcon as Icon, type ProductIconName } from "../../components/product-icon.js";
import type { HealthSnapshot } from "./service-health-model.js";
import { paymentSignalText } from "./payment-health-model.js";
import "../../styles/admin/admin-overview.css";

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
  tr: Translate,
): Attention[] {
  const items: Attention[] = [];
  const payment = health?.payments?.signals.find((signal) => signal.firing);
  if (payment)
    items.push({
      key: "payments",
      tone: health!.payments!.signals.some((s) => s.firing && s.severity === "critical")
        ? "critical"
        : "warning",
      title: tr("admin.adminOverview.paymentAlert"),
      detail: tr(paymentSignalText[payment.key].title),
      target: "health",
      action: tr("admin.adminOverview.inspect"),
    });
  if (health && health.status !== "operational" && health.status !== "healthy") {
    items.push({
      key: "health",
      tone: health.status === "degraded" ? "warning" : "critical",
      title: tr("admin.adminOverview.serviceIsDegraded"),
      detail:
        tr("admin.adminOverview.errorsInTheLastMinutes") +
        number(health.worker?.errors15m) +
        tr("admin.adminOverview.hours") +
        number(health.worker?.errors24h),
      target: "health",
      action: tr("admin.adminOverview.inspect"),
    });
  }
  const usage = data?.usage;
  if (usage && usage.calls24h > 0 && usage.failed24h / usage.calls24h >= FAILURE_ATTENTION_RATE) {
    items.push({
      key: "failures",
      tone: "warning",
      title: tr("admin.adminOverview.deviceCallsAreFailing"),
      detail:
        percent(usage.failed24h / usage.calls24h) +
        tr("admin.adminOverview.ofToolCallsFailedInHours") +
        number(usage.failed24h) +
        tr("admin.adminOverview.label"),
      target: "health",
      action: tr("admin.adminOverview.inspect"),
    });
  }
  if (data?.inbox?.openSupport) {
    items.push({
      key: "support",
      tone: "info",
      title: tr("admin.adminOverview.customerMailWaiting"),
      detail: number(data.inbox.openSupport) + tr("admin.adminOverview.openConversations"),
      target: "support",
      action: tr("admin.adminOverview.reply"),
    });
  }
  if (data?.inbox?.newSubmissions) {
    items.push({
      key: "leads",
      tone: "info",
      title: tr("admin.adminOverview.newSignUpRequestsAndFeedback"),
      detail: number(data.inbox.newSubmissions) + tr("admin.adminOverview.notReviewedYet"),
      target: "leads",
      action: tr("admin.adminOverview.review"),
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
        <h2 id="ov-attention-title">{tr("admin.adminOverview.needsYourAttention")}</h2>
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
            ? tr("admin.adminOverview.checking")
            : unknown
              ? tr("admin.adminOverview.nothingFlaggedInTheDataThat")
              : tr("admin.adminOverview.nothingNeedsYouRightNowService")}
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
          <h2>{tr("admin.adminOverview.toolCalls")}</h2>
          <p>
            {usage
              ? number(calls) +
                tr("admin.adminOverview.calls") +
                number(failed) +
                tr("admin.adminOverview.failedUpTo") +
                peakUsers +
                tr("admin.adminOverview.peopleInAnHour")
              : tr("admin.adminOverview.activityCouldNotBeLoaded")}
          </p>
        </div>
        <div
          className="adminRangeControl"
          role="group"
          aria-label={tr("admin.adminOverview.chartRange")}
        >
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
        aria-label={tr("admin.adminOverview.hourlyToolCallsAndFailuresOver", { hours })}
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
                tr("admin.adminOverview.calls") +
                row.failed +
                tr("admin.adminOverview.failed") +
                row.users +
                tr("admin.adminOverview.people")
              }
              style={{ height: (row.calls ? Math.max(4, (100 * row.calls) / max) : 1.5) + "%" }}
            >
              {row.failed > 0 && (
                <span style={{ height: Math.max(8, (100 * row.failed) / row.calls) + "%" }} />
              )}
            </div>
          ))
        ) : (
          <div className="adminEmptyChart">{tr("admin.adminOverview.noData")}</div>
        )}
      </div>
      <div className="ovChartFoot">
        <span>
          {hours}h {tr("admin.adminOverview.ago")}
        </span>
        <span className="ovLegend">
          <i className="is-calls" /> {tr("admin.adminOverview.calls2")} <i className="is-failed" />{" "}
          {tr("admin.adminOverview.failed2")}
        </span>
        <span>{tr("admin.adminOverview.nowUtc")}</span>
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
      label: tr("admin.adminOverview.devicesOnline"),
      value: data?.devices ? number(data.devices.online) + " / " + number(data.devices.total) : "—",
      detail: !data?.devices
        ? tr("admin.adminOverview.unavailable")
        : data.devices.complete
          ? tr("admin.adminOverview.liveFromTheDeviceRegistry")
          : tr("admin.adminOverview.someDevicesCouldNotBeChecked"),
      target: "operations",
    },
    {
      label: tr("admin.adminOverview.toolCallsThisMonth"),
      value: number(data?.usage?.monthlyCalls),
      detail: tr("admin.adminOverview.chargedCallsUtcMonth"),
      target: "operations",
    },
    {
      label: tr("admin.adminOverview.registeredAccounts"),
      value: number(data?.people?.total),
      detail: tr("admin.adminOverview.allTime"),
      target: "operations",
    },
    {
      label: tr("admin.adminOverview.teams"),
      value: data?.teams
        ? number(data.teams.teams) + tr("admin.adminOverview.label2") + number(data.teams.members)
        : "—",
      detail: tr("admin.adminOverview.teamsActiveMembers"),
      target: "operations",
    },
  ];
  return (
    <section className="ovPanel ovVitals">
      <div className="ovPanelHead">
        <h2>{tr("admin.adminOverview.productVitals")}</h2>
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
        {tr("admin.adminOverview.openUsersDevices")} →
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
          label={tr("admin.adminOverview.activePeopleToday")}
          value={number(people?.activeToday)}
          detail={
            people
              ? number(people.active7d) + tr("admin.adminOverview.activeInTheLastDays")
              : tr("admin.adminOverview.unavailable")
          }
          icon="users"
          onOpen={() => setSection("events")}
          openLabel={tr("admin.adminOverview.openBusinessAnalytics")}
        />
        <Kpi
          label={tr("admin.adminOverview.toolCallsH")}
          value={number(usage?.calls24h)}
          trend={
            usage
              ? {
                  value: change(usage.calls24h, usage.callsPrevious24h),
                  label: tr("admin.adminOverview.vsPreviousH"),
                }
              : null
          }
          detail={
            failureRate === null
              ? usage
                ? tr("admin.adminOverview.noCallsYet")
                : tr("admin.adminOverview.unavailable")
              : percent(1 - failureRate) + tr("admin.adminOverview.succeeded")
          }
          icon="activity"
          onOpen={() => setSection("health")}
          openLabel={tr("admin.adminOverview.openServiceHealth")}
        />
        <Kpi
          label={tr("admin.adminOverview.newSignUpsDays")}
          value={number(people?.new7d)}
          detail={
            people
              ? number(people.total) + tr("admin.adminOverview.accountsInTotal")
              : tr("admin.adminOverview.unavailable")
          }
          icon="add"
          onOpen={() => setSection("events")}
          openLabel={tr("admin.adminOverview.openBusinessAnalytics")}
        />
        <Kpi
          label={tr("admin.adminOverview.revenueDays")}
          value={revenue ? usd(revenue.paidCents30d) : "—"}
          detail={
            revenue
              ? number(revenue.payments30d) +
                tr("admin.adminOverview.payments") +
                number(revenue.activeSubscriptions) +
                tr("admin.adminOverview.subscriptions") +
                number(revenue.activeTrials) +
                tr("admin.adminOverview.trials")
              : tr("admin.adminOverview.unavailable")
          }
          icon="chart"
          onOpen={() => setSection("payments")}
          openLabel={tr("admin.adminOverview.openPayments")}
        />
      </div>
      <div className="ovGrid">
        <ActivityChart data={data} />
        <Vitals data={data} setSection={setSection} />
      </div>
      <Suspense
        fallback={
          <WorkspaceLoading label={tr("admin.adminOverview.loadingModelUsage")} variant="rows" />
        }
      >
        <AdminApiUsage preview={preview} />
      </Suspense>
    </div>
  );
}
