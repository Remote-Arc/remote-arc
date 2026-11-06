import { canonicalErrorEnvelope } from "../../../../../packages/protocol/src/error-codes.js";
import { WorkspaceLoading } from "../../components/workspace-loading.js";
import { BrandWordmark } from "../../components/brand-wordmark.js";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
const AdminEvents = lazy(() =>
  import("./events/admin-events.js").then((module) => ({ default: module.AdminEvents })),
);
const AdminFollowups = lazy(() =>
  import("./followups/admin-followups.js").then((module) => ({ default: module.AdminFollowups })),
);
const AdminSupportInbox = lazy(() =>
  import("./support-inbox.js").then((module) => ({ default: module.AdminSupportInbox })),
);
const AdminPayments = lazy(() =>
  import("./payments/admin-payments.js").then((module) => ({ default: module.AdminPayments })),
);
import { useI18n } from "../../app/i18n.js";
import { AdminOperations } from "./admin-operations.js";
import { AdminOverview, type OverviewData, type OverviewSection } from "./admin-overview.js";
import { ServiceHealth } from "./service-health.js";
import type { HealthSnapshot } from "./service-health-model.js";
import { ProductIcon as Icon, type ProductIconName } from "../../components/product-icon.js";
import { ProductInstall } from "../../app/product-pwa.js";
import { useTheme } from "../../app/theme.js";
import "./admin-console.css";
import "./admin-design.css";

type Section =
  "overview" | "leads" | "operations" | "health" | "followups" | "support" | "payments" | "events";
type Submission = {
  id: string;
  category: "early_access" | "feedback";
  email: string;
  name: string;
  message: string;
  source: string;
  status: string;
  consent_at: string;
  created_at: string;
  updated_at: string;
};
type LeadsResponse = {
  items: Submission[];
  total: number;
  page: number;
  pageSize: number;
  counts: Array<{ category: string; count: number }>;
};
function sectionName(key: OverviewSection, tr: (en: string, zh: string) => string) {
  return {
    people: tr("people", "用户"),
    usage: tr("tool calls", "工具调用"),
    devices: tr("devices", "设备"),
    revenue: tr("revenue", "营收"),
    teams: tr("teams", "团队"),
    inbox: tr("inboxes", "收件箱"),
  }[key];
}
// Illustrative sample for the design preview only; never shown with live data.
function previewOverview(): OverviewData {
  const end = Math.floor(Date.now() / 3600000) * 3600000;
  return {
    checkedAt: new Date().toISOString(),
    unavailable: [],
    people: { total: 128, new7d: 9, activeToday: 21, active7d: 47 },
    usage: {
      monthlyCalls: 18742,
      calls24h: 4210,
      failed24h: 260,
      callsPrevious24h: 3720,
      failedPrevious24h: 90,
      hourly: Array.from({ length: 48 }, (_, i) => {
        const calls = [70, 120, 50, 0, 0, 20, 90, 230, 340, 280, 450, 370][i % 12]!;
        return {
          hour: new Date(end - (47 - i) * 3600000).toISOString().slice(0, 13),
          calls,
          failed: i % 7 === 0 ? Math.round(calls * 0.2) : Math.round(calls * 0.02),
          users: 3 + (i % 6),
        };
      }),
    },
    devices: { total: 46, online: 19, complete: true },
    revenue: { paidCents30d: 12600, payments30d: 14, activeSubscriptions: 11, activeTrials: 4 },
    teams: { teams: 8, members: 24 },
    inbox: { newSubmissions: 3, openSupport: 2 },
  };
}
async function readJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: { accept: "application/json" },
    signal,
  });
  if (!response.ok) throw new Error("HTTP " + response.status);
  return response.json().then(canonicalErrorEnvelope) as Promise<T>;
}
const time = (s: string | null | undefined) => (s ? new Date(s).toLocaleString() : "—");

function LeadsPanel() {
  const { tr } = useI18n();
  const [filter, setFilter] = useState<"all" | "early_access" | "feedback">("all");
  const [data, setData] = useState<LeadsResponse | null>(null);
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  async function refresh() {
    try {
      setError("");
      setData(
        await readJson<LeadsResponse>(
          "/api/admin/submissions?category=" + filter + "&page=" + page,
        ),
      );
    } catch (e) {
      setError(
        tr(
          "Could not load saved submissions. Check migrations and admin access.",
          "无法读取提交记录，请检查迁移和管理员权限。",
        ) +
          " " +
          String(e),
      );
    }
  }
  useEffect(() => {
    void refresh();
  }, [filter, page]);
  async function change(item: Submission, status: string) {
    setBusy(item.id);
    try {
      const res = await fetch("/api/admin/submissions/" + item.id, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw Error(String(res.status));
      await refresh();
    } catch {
      setError(tr("Could not update submission.", "无法修改记录。"));
    } finally {
      setBusy("");
    }
  }
  async function remove(item: Submission) {
    if (
      !window.confirm(tr("Permanently remove this contact submission?", "永久删除这条联系记录？"))
    )
      return;
    setBusy(item.id);
    try {
      const res = await fetch("/api/admin/submissions/" + item.id, {
        method: "DELETE",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
      });
      if (!res.ok) throw Error(String(res.status));
      await refresh();
    } catch {
      setError(tr("Could not delete submission.", "无法删除记录。"));
    } finally {
      setBusy("");
    }
  }
  return (
    <section className="adminSurface">
      <div className="adminSectionHeader">
        <div>
          <p>
            {tr(
              "Explicitly submitted contact requests only. No private device content or conversations.",
              "仅展示用户主动提交的联系信息，不采集设备文件或私人对话内容。",
            )}
          </p>
        </div>
        <button type="button" className="adminOutlineBtn" onClick={() => void refresh()}>
          {tr("Refresh", "刷新")} ↻
        </button>
      </div>
      <div className="adminFilterRow" role="group" aria-label={tr("Submission type", "提交类型")}>
        {(["all", "early_access", "feedback"] as const).map((kind) => (
          <button
            key={kind}
            type="button"
            className={filter === kind ? "isActive" : ""}
            aria-pressed={filter === kind}
            onClick={() => {
              setFilter(kind);
              setPage(0);
            }}
          >
            {kind === "all"
              ? tr("All", "全部")
              : kind === "early_access"
                ? tr("Early access", "抢先体验")
                : tr("Feedback", "反馈")}
          </button>
        ))}
        <span>
          {data?.total ?? "—"} {tr("submissions", "条记录")}
        </span>
      </div>
      {error && (
        <p className="adminAlert" role="alert">
          {error}
        </p>
      )}
      <div className="adminLeadsList">
        {data?.items.map((item) => (
          <article className="adminLeadItem" key={item.id}>
            <div className="adminLeadTop">
              <div>
                <span className="adminLeadType">
                  {item.source === "enterprise"
                    ? "ENTERPRISE"
                    : item.category === "early_access"
                      ? "ARC EARLY ACCESS"
                      : "FEEDBACK"}
                </span>
                <h3>{item.name || item.email}</h3>
                <a href={"mailto:" + encodeURIComponent(item.email)}>{item.email}</a>
                <small>
                  {item.source} · {time(item.created_at)}
                </small>
              </div>
              <span className="adminLeadStatus">{item.status}</span>
            </div>
            <p>{item.message}</p>
            <div className="adminLeadActions">
              <label>
                {tr("Status", "状态")}{" "}
                <select
                  value={item.status}
                  disabled={busy === item.id}
                  onChange={(e) => void change(item, e.target.value)}
                >
                  <option value="new">{tr("New", "新提交")}</option>
                  <option value="reviewed">{tr("Reviewed", "已查看")}</option>
                  <option value="contacted">{tr("Contacted", "已联系")}</option>
                  <option value="archived">{tr("Archived", "已归档")}</option>
                </select>
              </label>
              <button type="button" disabled={busy === item.id} onClick={() => void remove(item)}>
                {tr("Delete", "删除")}
              </button>
            </div>
          </article>
        ))}
        {data && data.items.length === 0 && (
          <div className="adminNoData">{tr("No submissions yet.", "暂无提交记录。")}</div>
        )}
      </div>
      <div className="adminPager">
        <button disabled={page === 0} onClick={() => setPage((v) => Math.max(0, v - 1))}>
          {tr("Previous", "上一页")}
        </button>
        <span>{page + 1}</span>
        <button
          disabled={!data || data.items.length < data.pageSize}
          onClick={() => setPage((v) => v + 1)}
        >
          {tr("Next", "下一页")}
        </button>
      </div>
    </section>
  );
}

function AdminGlyph({ name }: { name: Section | "arrow" | "refresh" | "shield" | "pulse" }) {
  const names: Record<typeof name, ProductIconName> = {
    overview: "overview",
    leads: "inbox",
    operations: "users",
    health: "activity",
    followups: "chat",
    support: "inbox",
    payments: "chart",
    events: "activity",
    arrow: "arrowUpRight",
    refresh: "refresh",
    shield: "shield",
    pulse: "activity",
  };
  return <Icon name={names[name]} />;
}
export function AdminConsole({ preview = false }: { preview?: boolean }) {
  const { tr, locale, setLocale } = useI18n();
  const { theme, setTheme } = useTheme();
  const readSection = () => {
    const value = new URLSearchParams(location.search).get("section");
    return [
      "overview",
      "leads",
      "operations",
      "health",
      "followups",
      "support",
      "payments",
      "events",
    ].includes(value || "")
      ? (value as Section)
      : "overview";
  };
  const [section, updateSection] = useState<Section>(readSection);
  const setSection = (value: Section) => {
    updateSection(value);
    const url = new URL(location.href);
    url.searchParams.set("section", value);
    history.replaceState({}, "", url);
  };
  useEffect(() => {
    const restore = () => updateSection(readSection());
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);
  const [overview, setOverview] = useState<OverviewData | null>(() =>
    preview ? previewOverview() : null,
  );
  const [overviewLoaded, setOverviewLoaded] = useState(preview);
  const [health, setHealth] = useState<HealthSnapshot | null>(() =>
    preview
      ? {
          status: "degraded",
          checkedAt: new Date().toISOString(),
          worker: { status: "healthy", errors15m: 0, errors1h: 0, errors24h: 2 },
          dependencies: { d1: { status: "healthy" }, durableObjects: { status: "healthy" } },
          alerts: { emailConfigured: false, destination: null, recent: [] },
          account: { users: 128, devices: 46, activeTokens: 39 },
          incidents: [],
          deviceExecution: {
            sample: true,
            coverage: "observed",
            status: "degraded",
            windowMinutes: 15,
            calls: 38,
            successfulCalls: 35,
            timeouts: 3,
            offlineCalls: 0,
            staleSignals: 1,
            keepAwakeFailures: 1,
            affectedDevices: 1,
            truncated: false,
            devices: [
              {
                deviceId: "sample-mac-device",
                name: "Example Mac",
                platform: "darwin",
                timeouts: 3,
                offlineCalls: 0,
                staleSignals: 1,
                keepAwakeFailures: 1,
                lastFailureAt: new Date(Date.now() - 60000).toISOString(),
                lastSuccessfulCallAt: new Date(Date.now() - 120000).toISOString(),
              },
            ],
          },
        }
      : null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const refreshController = useRef<AbortController | null>(null);
  async function refresh() {
    if (preview) return;
    refreshController.current?.abort();
    setError("");
    // Independent sections own their data. Do not scan accounts and audit history
    // while viewing analytics, mail or payments, or duplicate the users request.
    if (section !== "overview" && section !== "health") {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    refreshController.current = controller;
    setLoading(true);
    try {
      // The overview reads its own small summary. The Users tab owns the
      // per-account scan, so the overview never waits on it.
      const [summary, monitor] = await Promise.allSettled([
        section === "overview"
          ? readJson<OverviewData>("/api/admin/overview", controller.signal)
          : Promise.resolve(null),
        readJson<HealthSnapshot>("/api/monitor", controller.signal),
      ]);
      if (controller.signal.aborted) return;
      if (summary.status === "fulfilled" && summary.value) setOverview(summary.value);
      if (monitor.status === "fulfilled") setHealth(monitor.value);
      const missing: string[] = [];
      if (summary.status === "rejected") missing.push(tr("business summary", "业务汇总"));
      else for (const key of summary.value?.unavailable || []) missing.push(sectionName(key, tr));
      if (monitor.status === "rejected") missing.push(tr("service health", "服务健康"));
      setError(
        missing.length
          ? tr("Could not load: ", "以下数据暂时无法加载：") +
              missing.join(tr(", ", "、")) +
              tr(
                ". Everything else is current. Try Refresh in a moment.",
                "。其余数据是最新的，可稍后点击刷新重试。",
              )
          : "",
      );
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
        setOverviewLoaded(true);
      }
    }
  }
  // Load when entering a section; subsequent updates are explicitly requested.
  useEffect(() => {
    void refresh();
    return () => refreshController.current?.abort();
  }, [preview, section]);
  // Grouped by the question each tab answers: is anything wrong, who needs a
  // reply, and how is the business doing.
  const navGroups: Array<{
    en: string;
    zh: string;
    items: Array<{ key: Section; en: string; zh: string }>;
  }> = [
    {
      en: "TODAY",
      zh: "今日",
      items: [
        { key: "overview", en: "Overview", zh: "业务总览" },
        { key: "health", en: "Service health", zh: "服务健康" },
      ],
    },
    {
      en: "CUSTOMERS",
      zh: "客户",
      items: [
        { key: "support", en: "Support inbox", zh: "客服收件箱" },
        { key: "leads", en: "Leads & feedback", zh: "线索与反馈" },
        { key: "followups", en: "User follow-ups", zh: "用户跟进" },
        { key: "operations", en: "Users & operations", zh: "用户与运营" },
      ],
    },
    {
      en: "BUSINESS",
      zh: "经营",
      items: [
        { key: "events", en: "Business analytics", zh: "经营分析" },
        { key: "payments", en: "Payments & offers", zh: "支付与优惠" },
      ],
    },
  ];
  const nav = navGroups.flatMap((group) => group.items);
  const current = nav.find((x) => x.key === section)!;
  return (
    <div className="adminShell">
      <aside className="adminSidebar">
        <a className="adminBrand brand brandHasWordmark" aria-label="Remote Arc Admin" href="/">
          <span className="adminBrandSymbol">
            <img src="/remote-arc.svg" width="38" height="38" alt="" />
          </span>
          <span>
            <BrandWordmark />
            <small>ADMIN</small>
          </span>
        </a>
        <div className="adminSidebarGroup">
          <nav aria-label={tr("Admin sections", "管理员菜单")}>
            {navGroups.map((group) => (
              <div className="adminNavGroup" key={group.en}>
                <span className="adminSidebarKicker">{tr(group.en, group.zh)}</span>
                {group.items.map((n) => (
                  <button
                    type="button"
                    key={n.key}
                    aria-current={section === n.key ? "page" : undefined}
                    onClick={() => setSection(n.key)}
                  >
                    <AdminGlyph name={n.key} />
                    <span>{tr(n.en, n.zh)}</span>
                    <AdminGlyph name="arrow" />
                  </button>
                ))}
              </div>
            ))}
          </nav>
        </div>
        <div className="adminSidebarBottom">
          <div className="adminPreferenceRow">
            <label>
              <span className="arcSrOnly">{tr("Theme", "主题")}</span>
              <select
                aria-label={tr("Admin theme", "后台主题")}
                value={theme}
                onChange={(e) => setTheme(e.target.value as "light" | "dark" | "system")}
              >
                <option value="light">{tr("Light", "浅色")}</option>
                <option value="dark">{tr("Dark", "深色")}</option>
                <option value="system">{tr("System", "跟随系统")}</option>
              </select>
            </label>
            <button type="button" onClick={() => setLocale(locale === "en" ? "zh" : "en")}>
              {locale === "en" ? "中文" : "EN"}
            </button>
          </div>
          <ProductInstall admin />
          <a
            className="adminBackToApp"
            href="https://agent.remotearc.app/dashboard/connect/overview"
          >
            <Icon name="arrowUpRight" size={15} />
            {tr("Open workspace", "打开工作空间")}
          </a>
          <div className="adminOwnerChip">
            <span>
              <AdminGlyph name="shield" />
            </span>
            <div>
              <strong>{tr("Administrator", "管理员工作区")}</strong>
              <small>{tr("Protected access", "受保护的访问")}</small>
            </div>
          </div>
        </div>
      </aside>
      <main className="adminContent">
        <div className="adminTopbar">
          <div className="adminBreadcrumb">
            Remote Arc <span>/</span> Admin <span>/</span>{" "}
            <strong>{tr(current.en, current.zh)}</strong>
          </div>
          <div className="adminTopActions">
            <span className="adminTopPrivate">
              <AdminGlyph name="shield" />
              {tr("Private console", "私有后台")}
            </span>
            {section === "overview" && (
              <button type="button" onClick={() => void refresh()} disabled={loading || preview}>
                <AdminGlyph name="refresh" />
                {loading ? tr("Refreshing", "刷新中") : tr("Refresh", "刷新数据")}
              </button>
            )}
          </div>
        </div>
        <header className="adminHeading">
          <span className="adminSmallLabel">{tr("OPERATIONS CENTER", "运营工作台")}</span>
          <h1>{tr(current.en, current.zh)}</h1>
          <p>
            {section === "overview"
              ? tr(
                  "Product adoption, real activity and service health. One clear view.",
                  "产品增长、真实使用与服务状态，一目了然。",
                )
              : section === "leads"
                ? tr(
                    "Follow up on the people who actually reached out.",
                    "了解并跟进每一条用户主动提交的申请与反馈。",
                  )
                : section === "followups"
                  ? tr(
                      "Help people get started, learn from feedback and keep track of each follow-up.",
                      "帮助用户上手、收集真实反馈，并跟进每一次联系。",
                    )
                  : section === "support"
                    ? tr(
                        "Read customer mail, review Apps applications and keep replies clear.",
                        "查看客户来信、处理 Apps 内测申请，并跟进每一次回复。",
                      )
                    : section === "events"
                      ? tr(
                          "Growth, conversion and retention across real customer journeys.",
                          "看增长、转化、留存，掌握关键业务流程的成功率。",
                        )
                      : section === "payments"
                        ? tr(
                            "Verified payments, versioned plans and offers with clear limits.",
                            "核实支付、管理套餐版本，并发布规则清晰的优惠。",
                          )
                        : section === "operations"
                          ? tr(
                              "Manage accounts, connected devices, capacity and costs.",
                              "管理用户账户、连接设备、用量配额和成本。",
                            )
                          : tr(
                              "Is anything broken, and where? The answer is at the top; details follow.",
                              "有没有故障、问题在哪里？结论在最上面，明细在下方。",
                            )}
          </p>
        </header>
        {preview && (
          <div className="adminPreviewNote" role="status">
            {tr(
              "Design preview · illustrative sample metrics. No customer or billing data is connected here.",
              "设计预览 · 指标均为示例，不连接真实客户与账单数据。",
            )}
          </div>
        )}
        {error && (
          <div className="adminAlert" role="alert">
            {error}
          </div>
        )}
        {section === "support" && (
          <Suspense
            fallback={
              <WorkspaceLoading
                label={tr("Loading support inbox…", "正在加载客服收件箱…")}
                variant="rows"
              />
            }
          >
            <AdminSupportInbox />
          </Suspense>
        )}

        {section === "followups" && (
          <Suspense
            fallback={
              <WorkspaceLoading
                label={tr("Loading follow-ups…", "正在加载跟进信息…")}
                variant="rows"
              />
            }
          >
            <AdminFollowups />
          </Suspense>
        )}
        {section === "events" && (
          <Suspense
            fallback={
              <WorkspaceLoading
                label={tr("Loading business analytics…", "正在读取经营数据…")}
                variant="rows"
              />
            }
          >
            <AdminEvents preview={preview} />
          </Suspense>
        )}
        {section === "payments" && (
          <Suspense
            fallback={
              <WorkspaceLoading label={tr("Loading payments…", "正在读取支付…")} variant="rows" />
            }
          >
            <AdminPayments preview={preview} />
          </Suspense>
        )}
        {section === "overview" && (
          <AdminOverview
            preview={preview}
            data={overview}
            health={health}
            loaded={overviewLoaded}
            setSection={setSection}
          />
        )}
        {section === "leads" &&
          (preview ? (
            <div className="adminNoData">
              {tr(
                "Preview mode: private submissions are not loaded.",
                "预览环境不加载真实反馈记录。",
              )}
            </div>
          ) : (
            <LeadsPanel />
          ))}
        {section === "operations" && <AdminOperations readOnly={preview} embedded />}
        {section === "health" && (
          <ServiceHealth
            health={health}
            loading={loading}
            reload={() => void refresh()}
            preview={preview}
          />
        )}
      </main>
    </div>
  );
}
