import { AdminOperations } from "../admin-operations.js";
import { timeAgo } from "./format.js";
import type { DashboardModel } from "./use-dashboard-model.js";
import { MonitorReliability } from './monitor-reliability.js';

// Admin monitor tab.
export function MonitorView({ m }: { m: DashboardModel }) {
  const { monitorLoading, monitorState, refreshMonitor, tr } = m;
  return (
    <>
      <section className="overviewTopbar monitorTopbar">
        <div>
          <span className="eyebrow">{tr("MONITOR", "监控")}</span>
          <h1>{tr("Service health", "服务健康度")}</h1>
          <p>{tr("Worker errors, dependencies and alert delivery for Remote Arc production.", "查看 Remote Arc 生产环境的 Worker 错误、依赖状态与告警投递。")}</p>
        </div>
        <button className="ghostButton" disabled={monitorLoading} onClick={() => void refreshMonitor()}>
          {monitorLoading ? tr("Refreshing…", "刷新中…") : tr("Refresh", "刷新")}
        </button>
      </section>

      <section className="monitorSummary">
        <div className={"monitorHealth " + (monitorState?.status || "unknown")}>
          <span>{tr("Overall", "整体状态")}</span>
          <strong>{monitorState?.status === "operational" ? tr("Operational", "运行正常") : monitorState?.status === "degraded" ? tr("Degraded", "存在异常") : tr("Loading", "加载中")}</strong>
          <small>{monitorState ? tr("Checked ", "检查于 ") + new Date(monitorState.checkedAt).toLocaleTimeString() : "—"}</small>
        </div>
        <div><span>5xx · 15m</span><strong>{monitorState?.worker.errors15m ?? "—"}</strong><small>{tr("Recent errors", "最近错误")}</small></div>
        <div><span>5xx · 1h</span><strong>{monitorState?.worker.errors1h ?? "—"}</strong><small>{tr("Last hour", "过去一小时")}</small></div>
        <div><span>5xx · 24h</span><strong>{monitorState?.worker.errors24h ?? "—"}</strong><small>{tr("Last 24 hours", "过去 24 小时")}</small></div>
      </section>

      <AdminOperations />
      <MonitorReliability state={monitorState?.deviceReliability} tr={tr} />

      <section className="monitorMainGrid">
        <article className="monitorPanel">
          <div className="monitorPanelHeader">
            <div><span className="eyebrow">{tr("RECENT INCIDENTS", "最近异常")}</span><h2>{tr("Production errors", "生产错误")}</h2></div>
            <span className="privacyPill">{monitorState?.incidents.length ?? 0} {tr("shown", "条")}</span>
          </div>
          <div className="monitorIncidentList">
            {(monitorState?.incidents || []).map((incident) => (
              <div className={"monitorIncidentRow " + incident.severity} key={incident.id}>
                <span className="monitorIncidentCode">{incident.status_code || "ERR"}</span>
                <div className="monitorIncidentBody">
                  <strong>{incident.method ? incident.method + " " : ""}{incident.path || incident.kind}</strong>
                  <small>{incident.message}</small>
                  <code>{incident.ray_id ? "CF-Ray " + incident.ray_id : incident.kind}{incident.colo ? " · " + incident.colo : ""}</code>
                </div>
                <time>{timeAgo(incident.created_at)}</time>
              </div>
            ))}
            {monitorState && !monitorState.incidents.length && (
              <div className="monitorEmpty">✓ {tr("No recorded production errors.", "暂无已记录的生产错误。")}</div>
            )}
            {!monitorState && <div className="monitorEmpty">{tr("Loading monitor data…", "正在加载监控数据…")}</div>}
          </div>
        </article>

        <aside className="monitorSide">
          <section>
            <span className="eyebrow">{tr("DEPENDENCIES", "依赖")}</span>
            <div className="monitorCheck"><span><i className="healthDot good" />Cloudflare Worker</span><strong>{monitorState?.worker.status || "—"}</strong></div>
            <div className="monitorCheck"><span><i className="healthDot good" />D1</span><strong>{monitorState?.dependencies.d1.status || "—"}</strong></div>
            <div className="monitorCheck"><span><i className="healthDot good" />Durable Objects</span><strong>{monitorState?.dependencies.durableObjects.status || "—"}</strong></div>
          </section>
          <section>
            <span className="eyebrow">{tr("ALERTING", "告警")}</span>
            <div className="monitorAlertState">
              <strong>{monitorState?.alerts.emailConfigured ? tr("Email active", "邮件告警已启用") : tr("Email channel pending", "邮件通道待启用")}</strong>
              <span>{monitorState?.alerts.destination || "moviegoer24@gmail.com"}</span>
              <small>{monitorState?.alerts.emailConfigured ? tr("5xx and exceptions are rate-limited to one email per alert type every 10 minutes.", "5xx 与异常告警按类型限频，每 10 分钟最多一封。") : tr("Monitoring is active. Cloudflare Email Service is not enabled for this account yet, so incidents are stored here but email delivery is pending.", "监控已经生效；当前 Cloudflare Email Service 尚未对账号开放，因此异常会记录在这里，但邮件投递仍待启用。")}</small>
            </div>
          </section>
          <section>
            <span className="eyebrow">{tr("SERVICE", "服务")}</span>
            <div className="monitorCheck"><span>{tr("Deployment", "部署版本")}</span><code>{monitorState?.deployment?.slice(0, 12) || '—'}</code></div>
            <div className="monitorCheck"><span>{tr("Users", "用户")}</span><strong>{monitorState?.account.users ?? "—"}</strong></div>
            <div className="monitorCheck"><span>{tr("Devices", "设备")}</span><strong>{monitorState?.account.devices ?? "—"}</strong></div>
            <div className="monitorCheck"><span>{tr("Active OAuth tokens", "有效 OAuth Token")}</span><strong>{monitorState?.account.activeTokens ?? "—"}</strong></div>
          </section>
        </aside>
      </section>
    </>
  );
}
