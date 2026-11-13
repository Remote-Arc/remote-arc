import type { Translate } from "../../locales/locale-catalog.js";
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
import { useI18n, useMessages } from "../../hooks/use-i18n.js";
import { useSubmissionReply } from "../../hooks/admin/use-submission-reply.js";
import { AdminOperations } from "./admin-operations.js";
import { AdminOverview, type OverviewData, type OverviewSection } from "./admin-overview.js";
import { ServiceHealth } from "./service-health.js";
import type { HealthSnapshot } from "./service-health-model.js";
import { samplePaymentHealth } from "./payment-health-model.js";
import { ProductIcon as Icon, type ProductIconName } from "../../components/product-icon.js";
import { ProductInstall } from "../../app/product-pwa.js";
import { useTheme } from "../../hooks/use-theme.js";
import "../../styles/admin/admin-console.css";
import "../../styles/admin/admin-design.css";

type Section =
  "overview" | "leads" | "operations" | "health" | "followups" | "support" | "payments" | "events";
// Grouped by the questions operators need to answer.
const navGroups = [
  { key: "today", items: ["overview", "health"] },
  { key: "customers", items: ["support", "leads", "followups", "operations"] },
  { key: "business", items: ["events", "payments"] },
] as const satisfies readonly { key: string; items: readonly Section[] }[];

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
function sectionName(key: OverviewSection, tr: Translate) {
  return {
    people: tr("admin.adminConsole.people"),
    usage: tr("admin.adminConsole.toolCalls"),
    devices: tr("admin.adminConsole.devices"),
    revenue: tr("admin.adminConsole.revenue"),
    teams: tr("admin.adminConsole.teams"),
    inbox: tr("admin.adminConsole.inboxes"),
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

function LeadsPanel({ onReply }: { onReply: (threadId: string) => void }) {
  const { tr } = useI18n();
  const reply = useSubmissionReply(onReply);
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
      setError(tr("admin.adminConsole.couldNotLoadSavedSubmissionsCheck") + " " + String(e));
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
      setError(tr("admin.adminConsole.couldNotUpdateSubmission"));
    } finally {
      setBusy("");
    }
  }
  async function remove(item: Submission) {
    if (!window.confirm(tr("admin.adminConsole.permanentlyRemoveThisContactSubmission"))) return;
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
      setError(tr("admin.adminConsole.couldNotDeleteSubmission"));
    } finally {
      setBusy("");
    }
  }
  return (
    <section className="adminSurface">
      <div className="adminSectionHeader">
        <div>
          <p>{tr("admin.adminConsole.explicitlySubmittedContactRequestsOnlyNo")}</p>
        </div>
        <button type="button" className="adminOutlineBtn" onClick={() => void refresh()}>
          {tr("admin.adminConsole.refresh")} ↻
        </button>
      </div>
      <div
        className="adminFilterRow"
        role="group"
        aria-label={tr("admin.adminConsole.submissionType")}
      >
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
              ? tr("admin.adminConsole.all")
              : kind === "early_access"
                ? tr("admin.adminConsole.earlyAccess")
                : tr("admin.adminConsole.feedback")}
          </button>
        ))}
        <span>
          {data?.total ?? "—"} {tr("admin.adminConsole.submissions")}
        </span>
      </div>
      {error && (
        <p className="adminAlert" role="alert">
          {error}
        </p>
      )}
      {reply.failed && (
        <p className="adminAlert" role="alert">
          {tr("admin.adminConsole.couldNotOpenSupportConversation")}
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
                {tr("admin.adminConsole.status")}{" "}
                <select
                  value={item.status}
                  disabled={busy === item.id}
                  onChange={(e) => void change(item, e.target.value)}
                >
                  <option value="new">{tr("admin.adminConsole.new")}</option>
                  <option value="reviewed">{tr("admin.adminConsole.reviewed")}</option>
                  <option value="contacted">{tr("admin.adminConsole.contacted")}</option>
                  <option value="archived">{tr("admin.adminConsole.archived")}</option>
                </select>
              </label>
              <div className="adminLeadButtons">
                <button
                  type="button"
                  disabled={busy === item.id || reply.openingId !== ""}
                  onClick={() => void reply.replyByEmail(item.id)}
                >
                  {reply.openingId === item.id
                    ? tr("admin.adminConsole.openingSupportConversation")
                    : tr("admin.adminConsole.replyFromSupport")}
                </button>
                <button type="button" disabled={busy === item.id} onClick={() => void remove(item)}>
                  {tr("admin.adminConsole.delete")}
                </button>
              </div>
            </div>
          </article>
        ))}
        {data && data.items.length === 0 && (
          <div className="adminNoData">{tr("admin.adminConsole.noSubmissionsYet")}</div>
        )}
      </div>
      <div className="adminPager">
        <button disabled={page === 0} onClick={() => setPage((v) => Math.max(0, v - 1))}>
          {tr("admin.adminConsole.previous")}
        </button>
        <span>{page + 1}</span>
        <button
          disabled={!data || data.items.length < data.pageSize}
          onClick={() => setPage((v) => v + 1)}
        >
          {tr("admin.adminConsole.next")}
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
  const labels = useMessages("admin");
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
  const [supportThread, setSupportThread] = useState("");
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
          payments: samplePaymentHealth(),
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
      if (summary.status === "rejected") missing.push(tr("admin.adminConsole.businessSummary"));
      else for (const key of summary.value?.unavailable || []) missing.push(sectionName(key, tr));
      if (monitor.status === "rejected") missing.push(tr("admin.adminConsole.serviceHealth"));
      setError(
        missing.length
          ? tr("admin.adminConsole.couldNotLoad") +
              missing.join(tr("admin.adminConsole.label")) +
              tr("admin.adminConsole.everythingElseIsCurrentTryRefresh")
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
          <nav aria-label={labels.navigation}>
            {navGroups.map((group) => (
              <div className="adminNavGroup" key={group.key}>
                <span className="adminSidebarKicker">{labels.groups[group.key]}</span>
                {group.items.map((key) => (
                  <button
                    type="button"
                    key={key}
                    aria-current={section === key ? "page" : undefined}
                    onClick={() => setSection(key)}
                  >
                    <AdminGlyph name={key} />
                    <span>{labels.sections[key]}</span>
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
              <span className="arcSrOnly">{labels.theme}</span>
              <select
                aria-label={labels.themeSetting}
                value={theme}
                onChange={(e) => setTheme(e.target.value as "light" | "dark" | "system")}
              >
                <option value="light">{labels.light}</option>
                <option value="dark">{labels.dark}</option>
                <option value="system">{labels.system}</option>
              </select>
            </label>
            <button type="button" onClick={() => setLocale(locale === "en" ? "zh" : "en")}>
              {tr("admin.adminConsole.switchLanguage")}
            </button>
          </div>
          <ProductInstall admin />
          <a
            className="adminBackToApp"
            href="https://agent.remotearc.app/dashboard/connect/overview"
          >
            <Icon name="arrowUpRight" size={15} />
            {labels.openWorkspace}
          </a>
          <div className="adminOwnerChip">
            <span>
              <AdminGlyph name="shield" />
            </span>
            <div>
              <strong>{tr("admin.adminConsole.administrator")}</strong>
              <small>{tr("admin.adminConsole.protectedAccess")}</small>
            </div>
          </div>
        </div>
      </aside>
      <main className="adminContent">
        <div className="adminTopbar">
          <div className="adminBreadcrumb">
            Remote Arc <span>/</span> Admin <span>/</span>{" "}
            <strong>{labels.sections[section]}</strong>
          </div>
          <div className="adminTopActions">
            <span className="adminTopPrivate">
              <AdminGlyph name="shield" />
              {tr("admin.adminConsole.privateConsole")}
            </span>
            {section === "overview" && (
              <button type="button" onClick={() => void refresh()} disabled={loading || preview}>
                <AdminGlyph name="refresh" />
                {loading ? tr("admin.adminConsole.refreshing") : tr("admin.adminConsole.refresh2")}
              </button>
            )}
          </div>
        </div>
        <header className="adminHeading">
          <span className="adminSmallLabel">{tr("admin.adminConsole.operationsCenter")}</span>
          <h1>{labels.sections[section]}</h1>
          <p>
            {section === "overview"
              ? tr("admin.adminConsole.productAdoptionRealActivityAndService")
              : section === "leads"
                ? tr("admin.adminConsole.followUpOnThePeopleWho")
                : section === "followups"
                  ? tr("admin.adminConsole.helpPeopleGetStartedLearnFrom")
                  : section === "support"
                    ? tr("admin.adminConsole.readCustomerMailReviewAppsApplications")
                    : section === "events"
                      ? tr("admin.adminConsole.growthConversionAndRetentionAcrossReal")
                      : section === "payments"
                        ? tr("admin.adminConsole.verifiedPaymentsVersionedPlansAndOffers")
                        : section === "operations"
                          ? tr("admin.adminConsole.manageAccountsConnectedDevicesCapacityAnd")
                          : tr("admin.adminConsole.isAnythingBrokenAndWhereThe")}
          </p>
        </header>
        {preview && (
          <div className="adminPreviewNote" role="status">
            {tr("admin.adminConsole.designPreviewIllustrativeSampleMetricsNo")}
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
                label={tr("admin.adminConsole.loadingSupportInbox")}
                variant="rows"
              />
            }
          >
            <AdminSupportInbox initialThread={supportThread} />
          </Suspense>
        )}

        {section === "followups" && (
          <Suspense
            fallback={
              <WorkspaceLoading label={tr("admin.adminConsole.loadingFollowUps")} variant="rows" />
            }
          >
            <AdminFollowups />
          </Suspense>
        )}
        {section === "events" && (
          <Suspense
            fallback={
              <WorkspaceLoading
                label={tr("admin.adminConsole.loadingBusinessAnalytics")}
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
              <WorkspaceLoading label={tr("admin.adminConsole.loadingPayments")} variant="rows" />
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
              {tr("admin.adminConsole.previewModePrivateSubmissionsAreNot")}
            </div>
          ) : (
            <LeadsPanel
              onReply={(threadId) => {
                setSupportThread(threadId);
                setSection("support");
              }}
            />
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
