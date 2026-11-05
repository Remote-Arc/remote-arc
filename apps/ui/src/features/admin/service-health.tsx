import { canonicalErrorEnvelope } from "../../../../../packages/protocol/src/error-codes.js";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "../../app/i18n.js";
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
import "./service-health.css";
import { ServiceMetricsPanel } from "./service-metrics-panel.js";
import { BusinessHealthOverview } from "./business-health-overview.js";
const date = (value: string | null | undefined) => (value ? new Date(value).toLocaleString() : "—");
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
            ? tr(
                "Check the error code, email and identifiers in your filters.",
                "请检查筛选条件中的错误码、邮箱和标识。",
              )
            : failure instanceof Error && failure.message === "admin_required"
              ? tr("Sign in with a current administrator account.", "请使用有效的管理员账号登录。")
              : tr(
                  "Monitoring data is unavailable. Retry after checking admin access and migrations.",
                  "监控数据暂不可用，请检查管理员权限和迁移后重试。",
                ),
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
        setDetailError(tr("Could not load failure details.", "异常详情加载失败。"));
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
      setCatalogError(tr("Could not load the error catalog.", "错误目录加载失败。"));
    }
  }
  const label = (labels: Record<string, [string, string]>, key: string) =>
    labels[key] ? tr(...labels[key]!) : key;
  return (
    <section className="serviceHealth" aria-label={tr("Service monitoring", "服务监控")}>
      <BusinessHealthOverview
        preview={preview}
        revision={metricsRevision}
        selectDomain={setDomain}
      />
      <div className="healthToolbar">
        <div>
          <span className="healthEyebrow">REMOTE ARC / OBSERVABILITY</span>
          <p>
            {tr(
              "Operational failures, with the context needed to investigate.",
              "统一查看业务与执行异常，关联排查所需信息。",
            )}
          </p>
          <small>
            {tr("Updated ", "更新于 ")}
            {date(data?.checkedAt || health?.checkedAt)} · {tr("Manual refresh", "手动刷新")}
          </small>
        </div>
        <button
          aria-label={tr("Refresh monitoring", "刷新监控")}
          className="adminOutlineBtn"
          disabled={busy || loading}
          onClick={() => {
            reload();
            void load();
            setMetricsRevision((value) => value + 1);
          }}
        >
          {busy || loading ? tr("Refreshing…", "刷新中…") : tr("Refresh", "刷新")} ↻
        </button>
      </div>
      {preview && (
        <p className="healthNotice">
          {tr(
            "Fictional sample data. No real user incidents or provider calls.",
            "虚构示例数据，不代表真实用户异常，不调用外部服务。",
          )}
        </p>
      )}
      <div className="healthStatusStrip">
        <div>
          <span
            className={"healthDot " + (health?.worker.status === "degraded" ? "isWarning" : "")}
          />
          <span>{tr("Platform", "平台服务")}</span>
          <strong>
            {!health
              ? "—"
              : health.worker.status === "degraded"
                ? tr("Needs attention", "需要排查")
                : tr("Reachable", "可访问")}
          </strong>
        </div>
        <div>
          <span>{tr("Device signals · 15m", "设备信号 · 15 分钟")}</span>
          <strong>
            {!health?.deviceExecution || health.deviceExecution.coverage === "no_samples"
              ? tr("Awaiting observations", "等待观测")
              : health.deviceExecution.coverage === "unavailable"
                ? tr("Unavailable", "不可用")
                : health?.deviceExecution?.affectedDevices
                  ? tr("Issues observed", "发现异常")
                  : tr("No recent issues recorded", "未记录近期异常")}
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
          {tr("Period", "时间范围")}
          <select
            aria-label={tr("Period", "时间范围")}
            value={hours}
            onChange={(e) => setHours(e.target.value)}
          >
            <option value="1">{tr("Last hour", "最近 1 小时")}</option>
            <option value="24">{tr("Last 24 hours", "最近 24 小时")}</option>
            <option value="168">{tr("Last 7 days", "最近 7 天")}</option>
          </select>
        </label>
        <label>
          {tr("Module", "业务模块")}
          <select
            aria-label={tr("Module", "业务模块")}
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
          >
            <option value="">{tr("All modules", "全部模块")}</option>
            {Object.keys(domainLabels).map((key) => (
              <option key={key} value={key}>
                {label(domainLabels, key)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {tr("Triage", "排查范围")}
          <select
            aria-label={tr("Triage", "排查范围")}
            value={mode}
            onChange={(e) => setMode(e.target.value)}
          >
            <option value="">{tr("All recorded failures", "所有失败记录")}</option>
            <option value="attention">{tr("Needs investigation", "需要排查")}</option>
            <option value="expected">{tr("Business limits & guards", "业务限制与拦截")}</option>
          </select>
        </label>
        <details className="healthAdvanced">
          <summary>{tr("Find a user, device or request", "定位用户、设备或请求")}</summary>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setApplied({ email, deviceId: device, trace, code });
            }}
          >
            <label>
              {tr("Account email", "用户邮箱")}
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
              {tr("Error code", "错误码")}
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="BILLING_INVALID_PLAN_CHANGE"
              />
            </label>
            <button className="adminOutlineBtn">{tr("Apply", "应用")}</button>
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
              {tr("Clear", "清空")}
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
          { label: tr("Failure observations", "失败记录"), value: data?.summary.total },
          { label: tr("Needs investigation", "需要排查"), value: data?.summary.attention },
          { label: tr("Affected accounts", "关联用户"), value: data?.summary.affectedUsers },
          { label: tr("Affected devices", "关联设备"), value: data?.summary.affectedDevices },
        ].map((item) => (
          <div key={item.label}>
            <span>{item.label}</span>
            <strong>{item.value?.toLocaleString() ?? "—"}</strong>
          </div>
        ))}
      </div>
      <p className="healthBoundary">
        {tr(
          "Counts are observations across stages, not unique incidents or failed user goals. Browser reports are unverified. Intake limits can reduce counts; missing history is not proof of health.",
          "统计跨阶段的失败记录，不等于独立故障数或用户任务失败数。前端报告未经服务端确认，限流可能减少记录，缺少历史记录不代表正常。",
        )}
      </p>
      <div className="healthWorkspace">
        <nav className="healthCategories" aria-label={tr("Failure categories", "异常分类")}>
          {[
            ["", tr("All categories", "全部分类")],
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
            <h3>{tr("Business & execution issues", "业务与执行异常")}</h3>
            <small>{tr("Grouped by error code", "按错误码聚合")}</small>
          </header>
          {busy && (
            <p className="healthEmpty" role="status">
              {tr("Loading observations…", "加载记录…")}
            </p>
          )}
          {!busy && data?.groups.length === 0 && (
            <p className="healthEmpty">
              {tr("No matching failures recorded in this period.", "当前范围未记录匹配的失败。")}
            </p>
          )}
          {!busy &&
            data?.groups.map((group) => (
              <div className="healthIssue" key={group.domain + group.code + group.category}>
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
                      {group.affectedUsers} {tr("accounts", "位用户")} · {group.affectedDevices}{" "}
                      {tr("devices", "台设备")}
                    </small>
                    <small>{date(group.lastSeen)}</small>
                  </span>
                </button>
                {selected?.code === group.code &&
                  selected.domain === group.domain &&
                  selected.category === group.category && (
                    <div className="healthIssueDetail">
                      <p>
                        <b>{tr("Next check", "排查建议")}</b>{" "}
                        {tr(
                          group.definition.actionEn || group.definition.action,
                          group.definition.action,
                        )}
                      </p>
                      <small>
                        {tr("First seen: ", "首次记录：")}
                        {date(group.firstSeen)} · {tr("Last seen: ", "最近记录：")}
                        {date(group.lastSeen)}
                      </small>
                      {detailError && (
                        <p role="alert">
                          {detailError}
                          <button onClick={() => void openGroup(group)}>
                            {tr("Retry", "重试")}
                          </button>
                        </p>
                      )}
                      {detailBusy && !detail && (
                        <p role="status">{tr("Loading details…", "加载详情…")}</p>
                      )}
                      {detail?.events.map((event) => (
                        <article className="healthEvent" key={event.id}>
                          <header>
                            <strong>
                              {event.userName ||
                                event.userEmail ||
                                tr("Unidentified account", "未识别账号")}
                            </strong>
                            <time>{date(event.occurred_at)}</time>
                          </header>
                          <small>
                            {event.userEmail ||
                              event.user_id ||
                              tr("No authenticated account recorded", "未记录已认证账号")}
                          </small>
                          <dl>
                            <div>
                              <dt>{tr("Device", "设备")}</dt>
                              <dd>
                                {event.deviceName ||
                                  tr("Not recorded / not applicable", "未记录／不适用")}
                                {event.devicePlatform ? " · " + event.devicePlatform : ""}
                                {event.device_id && <small>{event.device_id}</small>}
                              </dd>
                            </div>
                            <div>
                              <dt>{tr("Stage / operation", "阶段／操作")}</dt>
                              <dd>
                                {event.name}
                                {event.operation ? " · " + event.operation : ""}
                                {event.app_provider ? " · " + event.app_provider : ""}
                              </dd>
                            </div>
                            <div>
                              <dt>{tr("Evidence", "记录来源")}</dt>
                              <dd>
                                {event.source === "browser"
                                  ? tr("Browser report · unverified", "前端报告 · 未经确认")
                                  : event.source === "stripe"
                                    ? tr("Payment backend", "支付服务端")
                                    : tr("Server observation", "服务端记录")}
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
                                  {tr("Copy", "复制")}
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
                              <dt>{tr("Deployment / route", "部署／接口")}</dt>
                              <dd>
                                {event.deployment?.slice(0, 12) || tr("Unknown", "未知")} ·{" "}
                                {event.route || "—"}
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
                          {tr("Load more records", "加载更多记录")}
                        </button>
                      )}
                      <details className="healthSource">
                        <summary>{tr("Code locations", "代码位置")}</summary>
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
              {tr(
                "Showing 200 groups. Narrow the period or module to inspect more.",
                "当前最多展示 200 组，请缩小时间或业务模块后查看。",
              )}
            </p>
          )}
        </div>
      </div>
      <details className="healthSection">
        <summary>
          <span>{tr("Device execution", "设备执行")}</span>
          <small>
            {tr("15-minute signals and affected computers", "最近 15 分钟的执行信号与设备")}
          </small>
        </summary>
        <DeviceExecutionHealthPanel value={health?.deviceExecution} />
      </details>
      <details className="healthSection">
        <summary>
          <span>{tr("Infrastructure & alert delivery", "基础设施与告警")}</span>
          <small>
            {tr("Dependency probes and grouped service incidents", "依赖检测与分类服务异常")}
          </small>
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
            {tr("Email alerts", "邮件告警")}{" "}
            <b>
              {health?.alerts.emailConfigured
                ? tr("Configured", "已配置")
                : tr("Not configured", "未配置")}
            </b>
          </div>
        </div>
        {groupIncidents(health?.incidents || []).map((group) => (
          <details className="healthIncidentGroup" key={group.key}>
            <summary>
              {group.key === "database"
                ? tr("Database errors", "数据库异常")
                : group.key === "exceptions"
                  ? tr("Unhandled exceptions", "未捕获异常")
                  : tr("HTTP server errors", "HTTP 服务异常")}
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
          {tr(
            "The latest 40 sanitized infrastructure records are grouped here. Device issues and business guards do not by themselves prove a platform outage.",
            "此处分类展示最近 40 条脱敏基础设施记录。设备异常或业务拦截本身不代表平台故障。",
          )}
        </p>
      </details>
      <details
        className="healthSection"
        onToggle={(e) => {
          if (e.currentTarget.open) void loadCatalog();
        }}
      >
        <summary>
          <span>{tr("Error reference", "错误码说明")}</span>
          <small>{tr("Meaning, triage and code locations", "含义、排查建议与代码位置")}</small>
        </summary>
        <input
          className="healthCatalogSearch"
          aria-label={tr("Search error reference", "搜索错误码说明")}
          placeholder={tr("Search a code or meaning…", "搜索错误码或说明…")}
          value={catalogSearch}
          onChange={(e) => setCatalogSearch(e.target.value)}
        />
        {catalogError && (
          <p role="alert">
            {catalogError}
            <button onClick={() => void loadCatalog()}>{tr("Retry", "重试")}</button>
          </p>
        )}
        <small>
          {catalog?.length ?? "—"} {tr("catalogued codes", "个已收录错误码")}
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
          {tr(
            "Showing up to 60 matching definitions. Search to locate a specific code. Unknown errors are grouped without storing their original text.",
            "最多显示 60 条匹配说明，可搜索定位具体错误码。未识别错误统一归类，不保存原始文本。",
          )}
        </p>
      </details>
      <p className="healthBoundary">
        {tr(
          "30-day operational metadata retention. No message bodies, files, tool arguments, credentials or payment details. Account and device names are visible only to administrators.",
          "运维元数据保留 30 天。不采集正文、文件、工具参数、凭据或支付详情，用户与设备名称仅管理员可见。",
        )}
      </p>
    </section>
  );
}
