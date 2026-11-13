import type { MessageKey } from "../../locales/locale-catalog.js";
import { canonicalErrorEnvelope } from "../../../../../packages/protocol/src/error-codes.js";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "../../hooks/use-i18n.js";
import { MonitorReliability } from "./monitor-reliability.js";
import { DeviceExecutionHealthPanel } from "./device-execution-health.js";
import {
  categoryLabels,
  domainLabels,
  groupIncidents,
  type ErrorDefinition,
  type FailureGroup,
  type HealthSnapshot,
  type MonitoringSnapshot,
} from "./service-health-model.js";
import "../../styles/admin/service-health.css";
import { ServiceMetricsPanel } from "./service-metrics-panel.js";
import { BusinessHealthOverview } from "./business-health-overview.js";
import { PaymentHealthPanel } from "./payment-health-panel.js";
import { healthVerdict, type Problem, type Verdict } from "./service-health-verdict.js";
const date = (value: string | null | undefined) => (value ? new Date(value).toLocaleString() : "—");
const groupId = (group: FailureGroup) =>
  "health-group-" + [group.domain, group.code, group.category].join("-").replace(/[^\w-]/g, "_");

function VerdictPanel({
  verdict,
  scope,
  loading,
  open,
}: {
  verdict: Verdict;
  scope: string;
  loading: boolean;
  open: (problem: Problem) => void;
}) {
  const { tr } = useI18n();
  return (
    <section
      className={"healthVerdict is-" + (loading ? "unknown" : verdict.level)}
      aria-labelledby="health-verdict-title"
    >
      <div className="healthVerdictHead">
        <span className="healthVerdictLight" aria-hidden="true" />
        <div>
          <h2 id="health-verdict-title">
            {loading ? tr("admin.serviceHealth.checkingServiceHealth") : verdict.headline}
          </h2>
          {!loading && <p>{verdict.summary}</p>}
          <small>{scope}</small>
        </div>
      </div>
      {!loading && verdict.problems.length > 0 && (
        <ol className="healthProblems">
          {verdict.problems.map((problem) => (
            <li key={problem.key} className={"is-" + problem.level}>
              <div>
                <strong>{problem.title}</strong>
                <small>{problem.detail}</small>
              </div>
              <button type="button" onClick={() => open(problem)}>
                {problem.target === "group"
                  ? tr("admin.serviceHealth.seeWhoAndWhen")
                  : tr("admin.serviceHealth.openDetails")}{" "}
                ↓
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
async function read<T>(path: string): Promise<T> {
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: { accept: "application/json" },
  });
  if (!response.ok)
    throw Error(
      response.status === 400
        ? "INVALID_FILTER"
        : [401, 403].includes(response.status)
          ? "admin_required"
          : "monitor_unavailable",
    );
  return response.json().then(canonicalErrorEnvelope);
}
export function ServiceHealth({
  health,
  loading,
  reload,
  preview = false,
}: {
  health: HealthSnapshot | null;
  loading: boolean;
  reload: () => void;
  preview?: boolean;
}) {
  const { tr } = useI18n(),
    [data, setData] = useState<MonitoringSnapshot | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [metricsRevision, setMetricsRevision] = useState(0);
  const [hours, setHours] = useState("24"),
    [domain, setDomain] = useState(""),
    [category, setCategory] = useState(""),
    [mode, setMode] = useState("");
  const [email, setEmail] = useState(""),
    [device, setDevice] = useState(""),
    [trace, setTrace] = useState(""),
    [code, setCode] = useState(""),
    [applied, setApplied] = useState({ email: "", deviceId: "", trace: "", code: "" });
  const [selected, setSelected] = useState<FailureGroup | null>(null),
    [detail, setDetail] = useState<MonitoringSnapshot | null>(null),
    [detailBusy, setDetailBusy] = useState(false),
    [detailError, setDetailError] = useState("");
  const [catalog, setCatalog] = useState<ErrorDefinition[] | null>(null),
    [catalogSearch, setCatalogSearch] = useState(""),
    [catalogError, setCatalogError] = useState("");
  const root = useRef<HTMLElement>(null);
  const generation = useRef(0),
    detailGeneration = useRef(0);
  const params = () => {
    const query = new URLSearchParams({ hours });
    if (domain) query.set("domain", domain);
    if (category) query.set("category", category);
    if (mode) query.set("mode", mode);
    for (const [key, value] of Object.entries(applied))
      if (value.trim()) query.set(key, value.trim());
    return query;
  };
  async function load() {
    const current = ++generation.current;
    detailGeneration.current++;
    setBusy(true);
    setError("");
    setData(null);
    setSelected(null);
    setDetail(null);
    try {
      const value = preview
        ? (await import("./service-health-preview.js")).monitoringPreview(false, params())
        : await read<MonitoringSnapshot>("/api/admin/monitoring?" + params());
      if (current === generation.current) setData(value);
    } catch (failure) {
      if (current === generation.current) {
        setData(null);
        setError(
          failure instanceof Error && failure.message === "INVALID_FILTER"
            ? tr("admin.serviceHealth.checkTheErrorCodeEmailAnd")
            : failure instanceof Error && failure.message === "admin_required"
              ? tr("admin.serviceHealth.signInWithACurrentAdministrator")
              : tr("admin.serviceHealth.monitoringDataIsUnavailableRetryAfter"),
        );
      }
    } finally {
      if (current === generation.current) setBusy(false);
    }
  }
  useEffect(() => {
    void load();
    return () => {
      generation.current++;
      detailGeneration.current++;
    };
  }, [hours, domain, category, mode, applied, preview]);
  async function openGroup(group: FailureGroup, cursor?: string) {
    const current = ++detailGeneration.current;
    setSelected(group);
    setDetailBusy(true);
    setDetailError("");
    if (!cursor) setDetail(null);
    try {
      const query = params();
      query.set("code", group.code);
      query.set("domain", group.domain);
      query.set("category", group.category);
      if (cursor) query.set("before", cursor);
      const value = preview
        ? (await import("./service-health-preview.js")).monitoringPreview(true, query)
        : await read<MonitoringSnapshot>("/api/admin/monitoring?" + query);
      if (current === detailGeneration.current)
        setDetail((old) =>
          cursor && old ? { ...value, events: [...old.events, ...value.events] } : value,
        );
    } catch {
      if (current === detailGeneration.current)
        setDetailError(tr("admin.serviceHealth.couldNotLoadFailureDetails"));
    } finally {
      if (current === detailGeneration.current) setDetailBusy(false);
    }
  }
  async function loadCatalog() {
    if (catalog) return;
    setCatalogError("");
    try {
      setCatalog(
        preview
          ? (await import("./service-health-preview.js"))
              .monitoringPreview()
              .groups.map((g) => g.definition)
          : (
              await read<{
                catalog: ErrorDefinition[];
              }>("/api/admin/monitoring?catalog=1")
            ).catalog,
      );
    } catch {
      setCatalogError(tr("admin.serviceHealth.couldNotLoadTheErrorCatalog"));
    }
  }
  const label = (labels: Record<string, MessageKey>, key: string) =>
    labels[key] ? tr(labels[key]!) : key;
  const verdict = healthVerdict(health, data, tr);
  const scope =
    tr("admin.serviceHealth.errorCodes") +
    ({ "1": tr("admin.serviceHealth.lastHour"), "168": tr("admin.serviceHealth.lastDays") }[
      hours
    ] || tr("admin.serviceHealth.lastHours")) +
    (domain ? " · " + label(domainLabels, domain) : "") +
    tr("admin.serviceHealth.serverErrorsAndComputersLive");
  // Anchors are looked up inside this component, never by global id, so a
  // second copy of the console on the page cannot capture the jump.
  const anchor = (name: string) =>
    root.current?.querySelector<HTMLElement>(`[data-health-anchor="${name}"]`) || null;
  function openProblem(problem: Problem) {
    if (problem.target === "group" && problem.group) {
      const name = groupId(problem.group);
      void openGroup(problem.group);
      requestAnimationFrame(() =>
        anchor(name)?.scrollIntoView({ behavior: "smooth", block: "start" }),
      );
      return;
    }
    const section = anchor(problem.target) as HTMLDetailsElement | null;
    if (!section) return;
    section.open = true;
    section.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  return (
    <section
      ref={root}
      className="serviceHealth"
      aria-label={tr("admin.serviceHealth.serviceMonitoring")}
    >
      <VerdictPanel
        verdict={verdict}
        scope={scope}
        loading={(busy && !data) || (loading && !health)}
        open={openProblem}
      />
      <PaymentHealthPanel value={health?.payments} />
      <BusinessHealthOverview
        preview={preview}
        revision={metricsRevision}
        selectDomain={setDomain}
      />
      <div className="healthToolbar">
        <div>
          <span className="healthEyebrow">REMOTE ARC / OBSERVABILITY</span>
          <p>{tr("admin.serviceHealth.operationalFailuresWithTheContextNeeded")}</p>
          <small>
            {tr("admin.serviceHealth.updated")}
            {date(data?.checkedAt || health?.checkedAt)} · {tr("admin.serviceHealth.manualRefresh")}
          </small>
        </div>
        <button
          aria-label={tr("admin.serviceHealth.refreshMonitoring")}
          className="adminOutlineBtn"
          disabled={busy || loading}
          onClick={() => {
            reload();
            void load();
            setMetricsRevision((value) => value + 1);
          }}
        >
          {busy || loading
            ? tr("admin.serviceHealth.refreshing")
            : tr("admin.serviceHealth.refresh")}{" "}
          ↻
        </button>
      </div>
      {preview && (
        <p className="healthNotice">{tr("admin.serviceHealth.fictionalSampleDataNoRealUser")}</p>
      )}
      <div className="healthStatusStrip">
        <div>
          <span
            className={"healthDot " + (health?.worker.status === "degraded" ? "isWarning" : "")}
          />
          <span>{tr("admin.serviceHealth.platform")}</span>
          <strong>
            {!health
              ? "—"
              : health.worker.status === "degraded"
                ? tr("admin.serviceHealth.needsAttention")
                : tr("admin.serviceHealth.reachable")}
          </strong>
        </div>
        <div>
          <span>{tr("admin.serviceHealth.deviceSignalsM")}</span>
          <strong>
            {!health?.deviceExecution || health.deviceExecution.coverage === "no_samples"
              ? tr("admin.serviceHealth.awaitingObservations")
              : health.deviceExecution.coverage === "unavailable"
                ? tr("admin.serviceHealth.unavailable")
                : health?.deviceExecution?.affectedDevices
                  ? tr("admin.serviceHealth.issuesObserved")
                  : tr("admin.serviceHealth.noRecentIssuesRecorded")}
          </strong>
        </div>
        <div>
          <span>HTTP 5xx · 15m / 1h / 24h</span>
          <strong>
            {health
              ? `${health.worker.errors15m} / ${health.worker.errors1h} / ${health.worker.errors24h}`
              : "—"}
          </strong>
        </div>
      </div>
      <div className="healthFilters">
        <label>
          {tr("admin.serviceHealth.period")}
          <select
            aria-label={tr("admin.serviceHealth.period")}
            value={hours}
            onChange={(e) => setHours(e.target.value)}
          >
            <option value="1">{tr("admin.serviceHealth.lastHour2")}</option>
            <option value="24">{tr("admin.serviceHealth.lastHours2")}</option>
            <option value="168">{tr("admin.serviceHealth.lastDays2")}</option>
          </select>
        </label>
        <label>
          {tr("admin.serviceHealth.module")}
          <select
            aria-label={tr("admin.serviceHealth.module")}
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
          >
            <option value="">{tr("admin.serviceHealth.allModules")}</option>
            {Object.keys(domainLabels).map((key) => (
              <option key={key} value={key}>
                {label(domainLabels, key)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {tr("admin.serviceHealth.triage")}
          <select
            aria-label={tr("admin.serviceHealth.triage")}
            value={mode}
            onChange={(e) => setMode(e.target.value)}
          >
            <option value="">{tr("admin.serviceHealth.allRecordedFailures")}</option>
            <option value="attention">{tr("admin.serviceHealth.needsInvestigation")}</option>
            <option value="expected">{tr("admin.serviceHealth.businessLimitsGuards")}</option>
          </select>
        </label>
        <details className="healthAdvanced">
          <summary>{tr("admin.serviceHealth.findAUserDeviceOrRequest")}</summary>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setApplied({ email, deviceId: device, trace, code });
            }}
          >
            <label>
              {tr("admin.serviceHealth.accountEmail")}
              <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" />
            </label>
            <label>
              Device ID
              <input value={device} onChange={(e) => setDevice(e.target.value)} />
            </label>
            <label>
              Trace / entity ID
              <input value={trace} onChange={(e) => setTrace(e.target.value)} />
            </label>
            <label>
              {tr("admin.serviceHealth.errorCode")}
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="BILLING_INVALID_PLAN_CHANGE"
              />
            </label>
            <button className="adminOutlineBtn">{tr("admin.serviceHealth.apply")}</button>
            <button
              type="button"
              className="adminOutlineBtn"
              onClick={() => {
                setEmail("");
                setDevice("");
                setTrace("");
                setCode("");
                setApplied({ email: "", deviceId: "", trace: "", code: "" });
              }}
            >
              {tr("admin.serviceHealth.clear")}
            </button>
          </form>
        </details>
      </div>
      {error && (
        <p role="alert" className="healthNotice isError">
          {error}
        </p>
      )}
      <ServiceMetricsPanel
        selectDomain={setDomain}
        hours={Number(hours)}
        domain={domain}
        revision={metricsRevision}
        preview={preview}
      />
      <div className="healthMetrics">
        {[
          { label: tr("admin.serviceHealth.failureObservations"), value: data?.summary.total },
          { label: tr("admin.serviceHealth.needsInvestigation"), value: data?.summary.attention },
          { label: tr("admin.serviceHealth.affectedAccounts"), value: data?.summary.affectedUsers },
          {
            label: tr("admin.serviceHealth.affectedDevices"),
            value: data?.summary.affectedDevices,
          },
        ].map((item) => (
          <div key={item.label}>
            <span>{item.label}</span>
            <strong>{item.value?.toLocaleString() ?? "—"}</strong>
          </div>
        ))}
      </div>
      <p className="healthBoundary">
        {tr("admin.serviceHealth.countsAreObservationsAcrossStagesNot")}
      </p>
      <div className="healthWorkspace">
        <nav className="healthCategories" aria-label={tr("admin.serviceHealth.failureCategories")}>
          {[
            ["", tr("admin.serviceHealth.allCategories")],
            ...Object.keys(categoryLabels).map((key) => [key, label(categoryLabels, key)]),
          ].map(([key, title]) => (
            <button key={key} aria-pressed={category === key} onClick={() => setCategory(key!)}>
              <span>{title}</span>
              <small>
                {data?.facets
                  .filter((f) => !key || f.category === key)
                  .reduce((sum, f) => sum + f.total, 0) ?? "—"}
              </small>
            </button>
          ))}
        </nav>
        <div className="healthIssueList">
          <header>
            <h3>{tr("admin.serviceHealth.businessExecutionIssues")}</h3>
            <small>{tr("admin.serviceHealth.groupedByErrorCode")}</small>
          </header>
          {busy && (
            <p className="healthEmpty" role="status">
              {tr("admin.serviceHealth.loadingObservations")}
            </p>
          )}
          {!busy && data?.groups.length === 0 && (
            <p className="healthEmpty">
              {tr("admin.serviceHealth.noMatchingFailuresRecordedInThis")}
            </p>
          )}
          {!busy &&
            data?.groups.map((group) => (
              <div
                className="healthIssue"
                data-health-anchor={groupId(group)}
                key={group.domain + group.code + group.category}
              >
                <button
                  className="healthIssueSummary"
                  aria-expanded={
                    selected?.code === group.code &&
                    selected.domain === group.domain &&
                    selected.category === group.category
                  }
                  onClick={() =>
                    selected?.code === group.code &&
                    selected.domain === group.domain &&
                    selected.category === group.category
                      ? (detailGeneration.current++, setSelected(null), setDetail(null))
                      : void openGroup(group)
                  }
                >
                  <span>
                    <small>
                      {label(domainLabels, group.domain)} · {label(categoryLabels, group.category)}
                    </small>
                    <code>{group.code}</code>
                    <span className="healthIssueMeaning">
                      {tr(
                        group.definition.meaningEn || group.definition.meaning,
                        group.definition.meaning,
                      )}
                    </span>
                  </span>
                  <span className="healthIssueCount">
                    <strong>{group.total.toLocaleString()}</strong>
                    <small>
                      {group.affectedUsers} {tr("admin.serviceHealth.accounts")} ·{" "}
                      {group.affectedDevices} {tr("admin.serviceHealth.devices")}
                    </small>
                    <small>{date(group.lastSeen)}</small>
                  </span>
                </button>
                {selected?.code === group.code &&
                  selected.domain === group.domain &&
                  selected.category === group.category && (
                    <div className="healthIssueDetail">
                      <p>
                        <b>{tr("admin.serviceHealth.nextCheck")}</b>{" "}
                        {tr(
                          group.definition.actionEn || group.definition.action,
                          group.definition.action,
                        )}
                      </p>
                      <small>
                        {tr("admin.serviceHealth.firstSeen")}
                        {date(group.firstSeen)} · {tr("admin.serviceHealth.lastSeen")}
                        {date(group.lastSeen)}
                      </small>
                      {detailError && (
                        <p role="alert">
                          {detailError}
                          <button onClick={() => void openGroup(group)}>
                            {tr("admin.serviceHealth.retry")}
                          </button>
                        </p>
                      )}
                      {detailBusy && !detail && (
                        <p role="status">{tr("admin.serviceHealth.loadingDetails")}</p>
                      )}
                      {detail?.events.map((event) => (
                        <article className="healthEvent" key={event.id}>
                          <header>
                            <strong>
                              {event.userName ||
                                event.userEmail ||
                                tr("admin.serviceHealth.unidentifiedAccount")}
                            </strong>
                            <time>{date(event.occurred_at)}</time>
                          </header>
                          <small>
                            {event.userEmail ||
                              event.user_id ||
                              tr("admin.serviceHealth.noAuthenticatedAccountRecorded")}
                          </small>
                          <dl>
                            <div>
                              <dt>{tr("admin.serviceHealth.device")}</dt>
                              <dd>
                                {event.deviceName ||
                                  tr("admin.serviceHealth.notRecordedNotApplicable")}
                                {event.devicePlatform ? " · " + event.devicePlatform : ""}
                                {event.device_id && <small>{event.device_id}</small>}
                              </dd>
                            </div>
                            <div>
                              <dt>{tr("admin.serviceHealth.stageOperation")}</dt>
                              <dd>
                                {event.name}
                                {event.operation ? " · " + event.operation : ""}
                                {event.app_provider ? " · " + event.app_provider : ""}
                              </dd>
                            </div>
                            <div>
                              <dt>{tr("admin.serviceHealth.evidence")}</dt>
                              <dd>
                                {event.source === "browser"
                                  ? tr("admin.serviceHealth.browserReportUnverified")
                                  : event.source === "stripe"
                                    ? tr("admin.serviceHealth.paymentBackend")
                                    : tr("admin.serviceHealth.serverObservation")}
                                {event.http_status ? " · HTTP " + event.http_status : ""}
                                {event.duration_ms != null ? " · " + event.duration_ms + " ms" : ""}
                              </dd>
                            </div>
                            <div>
                              <dt>Trace ID</dt>
                              <dd>
                                <code>{event.trace_id}</code>
                                <button
                                  type="button"
                                  className="healthCopy"
                                  onClick={() =>
                                    void navigator.clipboard
                                      ?.writeText(event.trace_id)
                                      .catch(() => {})
                                  }
                                >
                                  {tr("admin.serviceHealth.copy")}
                                </button>
                              </dd>
                            </div>
                            {event.entity_id && (
                              <div>
                                <dt>Entity ID</dt>
                                <dd>
                                  <code>{event.entity_id}</code>
                                </dd>
                              </div>
                            )}
                            <div>
                              <dt>{tr("admin.serviceHealth.deploymentRoute")}</dt>
                              <dd>
                                {event.deployment?.slice(0, 12) ||
                                  tr("admin.serviceHealth.unknown")}{" "}
                                · {event.route || "—"}
                              </dd>
                            </div>
                          </dl>
                        </article>
                      ))}
                      {detail?.nextCursor && (
                        <button
                          disabled={detailBusy}
                          className="adminOutlineBtn"
                          onClick={() => void openGroup(group, detail.nextCursor!)}
                        >
                          {tr("admin.serviceHealth.loadMoreRecords")}
                        </button>
                      )}
                      <details className="healthSource">
                        <summary>{tr("admin.serviceHealth.codeLocations")}</summary>
                        {group.definition.sources.map((source) => (
                          <code key={source}>{source}</code>
                        ))}
                      </details>
                    </div>
                  )}
              </div>
            ))}
          {data?.groupsTruncated && (
            <p className="healthBoundary">
              {tr("admin.serviceHealth.showingGroupsNarrowThePeriodOr")}
            </p>
          )}
        </div>
      </div>
      <details className="healthSection" data-health-anchor="devices">
        <summary>
          <span>{tr("admin.serviceHealth.deviceExecution")}</span>
          <small>{tr("admin.serviceHealth.minuteSignalsAndAffectedComputers")}</small>
        </summary>
        <DeviceExecutionHealthPanel value={health?.deviceExecution} />
        <MonitorReliability state={health?.deviceReliability} tr={tr} />
      </details>
      <details className="healthSection" data-health-anchor="infrastructure">
        <summary>
          <span>{tr("admin.serviceHealth.infrastructureAlertDelivery")}</span>
          <small>{tr("admin.serviceHealth.dependencyProbesAndGroupedServiceIncidents")}</small>
        </summary>
        <div className="healthDependencies">
          <div>
            Worker <b>{health?.worker.status || "—"}</b>
          </div>
          <div>
            D1 <b>{health?.dependencies.d1.status || "—"}</b>
          </div>
          <div>
            Durable Objects <b>{health?.dependencies.durableObjects.status || "—"}</b>
          </div>
          <div>
            {tr("admin.serviceHealth.emailAlerts")}{" "}
            <b>
              {health?.alerts.emailConfigured
                ? tr("admin.serviceHealth.configured")
                : tr("admin.serviceHealth.notConfigured")}
            </b>
          </div>
        </div>
        {groupIncidents(health?.incidents || []).map((group) => (
          <details className="healthIncidentGroup" key={group.key}>
            <summary>
              {group.key === "database"
                ? tr("admin.serviceHealth.databaseErrors")
                : group.key === "exceptions"
                  ? tr("admin.serviceHealth.unhandledExceptions")
                  : tr("admin.serviceHealth.httpServerErrors")}
              <b>{group.count}</b>
            </summary>
            {group.items.map((item) => (
              <article key={item.id}>
                <code>
                  {item.status_code || item.kind} · {item.method} {item.path}
                </code>
                <p>{item.message}</p>
                <small>
                  {date(item.created_at)} · {item.severity} · {item.colo || "—"} ·{" "}
                  {item.ray_id || "—"}
                </small>
              </article>
            ))}
          </details>
        ))}
        <p className="healthBoundary">
          {tr("admin.serviceHealth.theLatestSanitizedInfrastructureRecordsAre")}
        </p>
      </details>
      <details
        className="healthSection"
        onToggle={(e) => {
          if (e.currentTarget.open) void loadCatalog();
        }}
      >
        <summary>
          <span>{tr("admin.serviceHealth.errorReference")}</span>
          <small>{tr("admin.serviceHealth.meaningTriageAndCodeLocations")}</small>
        </summary>
        <input
          className="healthCatalogSearch"
          aria-label={tr("admin.serviceHealth.searchErrorReference")}
          placeholder={tr("admin.serviceHealth.searchACodeOrMeaning")}
          value={catalogSearch}
          onChange={(e) => setCatalogSearch(e.target.value)}
        />
        {catalogError && (
          <p role="alert">
            {catalogError}
            <button onClick={() => void loadCatalog()}>{tr("admin.serviceHealth.retry")}</button>
          </p>
        )}
        <small>
          {catalog?.length ?? "—"} {tr("admin.serviceHealth.cataloguedCodes")}
        </small>
        <div className="healthCatalog">
          {catalog
            ?.filter((item) =>
              (item.code + " " + item.meaning + " " + (item.meaningEn || ""))
                .toLowerCase()
                .includes(catalogSearch.toLowerCase()),
            )
            .slice(0, 60)
            .map((item) => (
              <details key={item.code}>
                <summary>
                  <code>{item.code}</code>
                  <small>{label(categoryLabels, item.category)}</small>
                </summary>
                <p>{tr(item.meaningEn || item.meaning, item.meaning)}</p>
                <p>{tr(item.actionEn || item.action, item.action)}</p>
                {item.sources.map((source) => (
                  <code className="healthSource" key={source}>
                    {source}
                  </code>
                ))}
              </details>
            ))}
        </div>
        <p className="healthBoundary">
          {tr("admin.serviceHealth.showingUpToMatchingDefinitionsSearch")}
        </p>
      </details>
      <p className="healthBoundary">
        {tr("admin.serviceHealth.dayOperationalMetadataRetentionNoMessage")}
      </p>
    </section>
  );
}
