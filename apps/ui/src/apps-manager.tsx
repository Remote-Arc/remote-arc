import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "./i18n.js";
import "./apps-manager.css";

type Permission = "read" | "write";
export type AppDefinition = {
  provider: string; name: string; brand: string; configured: boolean;
  operations: { name: string; description: string; permission: Permission; inputSchema?: unknown }[];
  permissions: { read: string[]; write: string[] }; consentNote?: string;
};
export type AppConnection = {
  id: string; provider: string; accountLabel: string; status: string;
  permissions: Permission[]; scopes: string[]; expiresAt: string | null; lastError: string | null; updatedAt: string;
};
export type AppApproval = {
  id: string; connectionId: string; operation: string; status: string; expiresAt: string; arguments: Record<string, unknown>; review?: Record<string, unknown>;
};
export type AppsSnapshot = { enabled: boolean; apps: AppDefinition[]; connections: AppConnection[] };
export type AppsRequest = (path: string, init?: RequestInit) => Promise<unknown>;

const brandFiles: Record<string, string> = {
  github: "github", slack: "slack", gmail: "gmail", outlook: "microsoftoutlook",
  microsoftoutlook: "microsoftoutlook", googlecalendar: "googlecalendar",
  google_calendar: "googlecalendar", microsoft_calendar: "microsoftoutlook",
};
const permissionsFor = (write: boolean): Permission[] => write ? ["read", "write"] : ["read"];

function AppIcon({ brand }: { brand: string }) {
  const file = brandFiles[brand];
  return <span className="appsManagerBrand" data-brand={file || "generic"}>
    {file ? <img src={"/app-brands/" + file + ".svg"} alt="" width={30} height={30} /> : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z" /></svg>}
  </span>;
}
async function requestJson(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(path, {
    ...init, credentials: "same-origin",
    headers: { accept: "application/json", ...(init?.body ? { "content-type": "application/json" } : {}), ...init?.headers },
  });
  const body = await response.json().catch(() => null) as { error?: string } | null;
  if (!response.ok) throw new Error(body?.error || "app_service_unavailable");
  if (!body) throw new Error("app_service_unavailable");
  return body;
}
function statusLabel(status: string, tr: (en: string, zh: string) => string) {
  switch (status) {
    case "active": return tr("Connected", "已连接");
    case "disconnected": return tr("Disconnected", "已断开");
    case "reauthorization_required": return tr("Reconnect required", "需要重新授权");
    case "pending_approval": return tr("Awaiting review", "等待审核");
    case "approved": return tr("Approved", "已批准");
    case "running": return tr("Running", "执行中");
    case "unknown": return tr("Outcome unknown", "结果待核实");
    default: return tr("Unavailable", "暂不可用");
  }
}
function errorLabel(code: string, tr: (en: string, zh: string) => string) {
  switch (code) {
    case "unauthorized": return tr("Your session expired. Sign in again to manage Apps.", "登录已过期，请重新登录后管理应用。");
    case "apps_not_enabled": return tr("Apps are not enabled yet. Contact your administrator.", "应用连接尚未启用，请联系管理员。");
    case "app_not_configured": return tr("This provider has not been configured by your administrator.", "管理员尚未配置此应用的授权信息。");
    case "app_scope_required": return tr("The provider needs additional permissions. Reconnect the account with the access you want.", "应用需要额外授权，请选择所需权限后重新连接账号。");
    case "app_reauthorization_required": return tr("This account needs authorization again. Reconnect to continue.", "此账号需要重新授权，请重新连接后继续。");
    case "app_permission_required": return tr("This connection does not allow that permission.", "当前连接没有授予该项权限。");
    case "app_approval_unavailable": return tr("This approval expired or the connection changed. Refresh and ask your AI for a new request.", "审批已过期或连接已变更。请刷新，并让 AI 重新提交请求。");
    case "app_connection_not_found": return tr("This connection no longer exists. Refresh the page.", "该连接已不存在，请刷新页面。");
    default: return tr("Apps could not be updated. Check your connection and try again.", "应用状态暂时无法更新，请检查网络后重试。");
  }
}

function ConnectionRow({ app, connection, busy, onAuthorize, onSave, onDisconnect }: {
  app: AppDefinition; connection: AppConnection; busy: boolean;
  onAuthorize: (provider: string, permissions: Permission[]) => void;
  onSave: (connection: AppConnection, permissions: Permission[]) => void;
  onDisconnect: (connection: AppConnection) => void;
}) {
  const { tr } = useI18n();
  const [write, setWrite] = useState(connection.permissions.includes("write"));
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const savedWrite = connection.permissions.includes("write");
  useEffect(() => { setWrite(savedWrite); setConfirmDisconnect(false); }, [connection.id, savedWrite, connection.status]);
  const active = connection.status === "active";
  const needsScopes = write && app.permissions.write.some(scope => scope !== "offline_access" && !connection.scopes.includes(scope));
  const changed = write !== savedWrite;
  return <article className="appsManagerConnection" data-status={connection.status}>
    <div className="appsManagerConnectionTop"><strong>{connection.accountLabel}</strong><span className="appsManagerStatus" data-status={connection.status}>{statusLabel(connection.status, tr)}</span></div>
    {connection.status === "reauthorization_required" && <p className="appsManagerConnectionHint">{tr("Provider access expired or was revoked. Reconnect this account to restore access.", "应用授权已过期或被撤销，请重新连接此账号以恢复访问。")}</p>}
    <fieldset className="appsManagerPermissions" disabled={busy || !app.configured}>
      <legend>{tr("Remote Arc permissions", "Remote Arc 访问权限")}</legend>
      <label><input type="checkbox" checked disabled /><span>{tr("Read access", "读取权限")}</span></label>
      <label><input type="checkbox" checked={write} onChange={event => setWrite(event.target.checked)} /><span>{tr("Allow write actions", "允许写入操作")}</span></label>
    </fieldset>
    <div className="appsManagerConnectionActions">
      {active ? <button type="button" disabled={busy || !app.configured || !changed} onClick={() => needsScopes ? onAuthorize(app.provider, permissionsFor(write)) : onSave(connection, permissionsFor(write))}>
        {needsScopes ? tr("Authorize write access", "授权写入权限") : tr("Save permissions", "保存权限")}
      </button> : <button type="button" disabled={busy || !app.configured} onClick={() => onAuthorize(app.provider, permissionsFor(write))}>{tr("Reconnect", "重新连接")}</button>}
      {connection.status !== "disconnected" && <button type="button" className="appsManagerTextAction" disabled={busy} onClick={() => setConfirmDisconnect(true)}>{tr("Disconnect", "断开连接")}</button>}
    </div>
    {confirmDisconnect && <div className="appsManagerDisconnect" role="group" aria-label={tr("Confirm account disconnection", "确认断开账号")}>
      <p>{tr("Disconnect this account and cancel its pending approvals? Earlier changes in the app will remain.", "断开此账号并取消待处理审批？应用中已经发生的改动仍会保留。")}</p>
      <div><button type="button" className="appsManagerDanger" disabled={busy} onClick={() => onDisconnect(connection)}>{tr("Confirm disconnect", "确认断开")}</button><button type="button" disabled={busy} onClick={() => setConfirmDisconnect(false)}>{tr("Keep connected", "保持连接")}</button></div>
    </div>}
    <details className="appsManagerScopes"><summary>{tr("Provider scopes", "应用授权范围")}</summary><ul>{connection.scopes.map(scope => <li key={scope}><code>{scope}</code></li>)}</ul></details>
  </article>;
}

function CatalogCard({ app, connections, busy, onAuthorize, onSave, onDisconnect }: {
  app: AppDefinition; connections: AppConnection[]; busy: boolean;
  onAuthorize: (provider: string, permissions: Permission[]) => void;
  onSave: (connection: AppConnection, permissions: Permission[]) => void;
  onDisconnect: (connection: AppConnection) => void;
}) {
  const { tr } = useI18n();
  const [write, setWrite] = useState(false);
  const note = app.provider === "github" && app.consentNote
    ? tr("GitHub's repo scope includes write access at GitHub. Remote Arc still blocks write actions unless you explicitly enable them here.", "GitHub 的 repo 授权范围包含上游写入权限；只有你在这里明确允许写入，Remote Arc 才会放行写入操作。")
    : app.consentNote;
  return <article className="appsManagerCard" data-provider={app.provider}>
    <header><AppIcon brand={app.brand} /><div><h2>{app.name}</h2><span>{app.configured ? tr("Ready to connect", "可授权连接") : tr("Administrator setup needed", "等待管理员配置")}</span></div><span className="appsManagerOperationCount">{app.operations.length} {tr("operations", "项操作")}</span></header>
    {note && <p className="appsManagerConsentNote">{note}</p>}
    {connections.map(connection => <ConnectionRow key={connection.id} app={app} connection={connection} busy={busy} onAuthorize={onAuthorize} onSave={onSave} onDisconnect={onDisconnect} />)}
    <div className="appsManagerAuthorize">
      <fieldset disabled={busy || !app.configured}>
        <legend>{connections.length ? tr("Connect another account", "连接其他账号") : tr("Choose access for this connection", "选择本次连接的权限")}</legend>
        <label><input type="checkbox" checked disabled /><span>{tr("Read", "读取")}</span></label>
        <label><input type="checkbox" checked={write} onChange={event => setWrite(event.target.checked)} /><span>{tr("Write actions (optional)", "写入操作（可选）")}</span></label>
      </fieldset>
      <button type="button" className="appsManagerPrimary" disabled={busy || !app.configured} onClick={() => onAuthorize(app.provider, permissionsFor(write))}>{app.configured ? connections.length ? tr("Connect another account", "连接其他账号") : tr("Connect account", "连接账号") : tr("Not configured", "尚未配置")}</button>
    </div>
    <details className="appsManagerOperations"><summary>{tr("Available operations", "可用操作")} <span>{app.operations.length}</span></summary>
      <ul>{app.operations.map(operation => <li key={operation.name}><div><strong>{operation.description}</strong><span className="appsManagerPermissionTag" data-permission={operation.permission}>{operation.permission === "write" ? tr("Write · approval required", "写入 · 需审批") : tr("Read", "读取")}</span></div><code>{operation.name}</code></li>)}</ul>
    </details>
  </article>;
}

function ApprovalCard({ approval, connection, app, busy, onDecide }: {
  approval: AppApproval; connection?: AppConnection; app?: AppDefinition; busy: boolean;
  onDecide: (approval: AppApproval, approve: boolean) => void;
}) {
  const { tr, locale } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const [, refreshExpiry] = useState(0);
  const expiration = Date.parse(approval.expiresAt);
  useEffect(() => {
    if (!Number.isFinite(expiration) || expiration <= Date.now()) return;
    const timer = window.setTimeout(() => refreshExpiry(value => value + 1), Math.min(expiration - Date.now() + 20, 2147483647));
    return () => window.clearTimeout(timer);
  }, [expiration]);
  const expired = !Number.isFinite(expiration) || expiration <= Date.now();
  const pending = approval.status === "pending_approval";
  const allowed = pending && !expired && connection?.status === "active";
  return <article className="appsManagerApproval" data-status={approval.status}>
    <header><AppIcon brand={app?.brand || ""} /><div><h3>{app?.name || tr("App request", "应用请求")}</h3><span>{connection?.accountLabel || tr("Connection unavailable", "连接不可用")}</span></div><span className="appsManagerStatus" data-status={expired && pending ? "expired" : approval.status}>{expired && pending ? tr("Expired", "已过期") : statusLabel(approval.status, tr)}</span></header>
    <p className="appsManagerApprovalOperation"><strong>{tr("Requested operation", "请求的操作")}</strong><code>{approval.operation}</code></p>
    <button type="button" className="appsManagerReviewToggle" aria-expanded={expanded} onClick={() => { setExpanded(!expanded); if (expanded) setReviewed(false); }}>{expanded ? tr("Hide exact request", "收起完整请求") : tr("Review exact request", "查看完整请求")}</button>
    {expanded && <div className="appsManagerApprovalPayload"><p>{tr("Review the account, operation and every argument before approving.", "批准前，请核对账号、操作及每一项参数。")}</p><pre aria-label={tr("Exact operation arguments", "操作的完整参数")}>{JSON.stringify(approval.arguments, null, 2)}</pre>
      {approval.review && <><p>{tr("Current target checked before approval", "审批前核实的操作对象")}</p><pre aria-label={tr("Reviewed app target", "已核实的操作对象")}>{JSON.stringify(approval.review, null, 2)}</pre></>}
      <p className="appsManagerApprovalExpires">{tr("Expires", "有效期至")} {Number.isFinite(expiration) ? new Date(expiration).toLocaleString(locale === "zh" ? "zh-CN" : "en", { dateStyle: "medium", timeStyle: "short" }) : tr("Unavailable", "不可用")}</p>
      {allowed && <label className="appsManagerReviewConfirmation"><input type="checkbox" checked={reviewed} onChange={event => setReviewed(event.target.checked)} /><span>{tr("I reviewed this exact operation and its arguments.", "我已核对这项操作及其完整参数。")}</span></label>}
    </div>}
    {pending && <div className="appsManagerApprovalActions"><button type="button" className="appsManagerPrimary" disabled={busy || !allowed || !expanded || !reviewed} onClick={() => onDecide(approval, true)}>{tr("Approve this request", "批准此请求")}</button><button type="button" disabled={busy || !allowed} onClick={() => onDecide(approval, false)}>{tr("Reject", "拒绝")}</button></div>}
    <p className="appsManagerApprovalBoundary">{approval.status === "unknown" ? tr("The execution outcome is uncertain. Check the app before requesting another action.", "执行结果尚不明确，请先检查应用中的实际状态，再提出下一次操作。") : approval.status === "running" ? tr("The approved operation is being executed. This page will not repeat it.", "已批准的操作正在执行，本页面不会重复执行。") : tr("Approval authorizes only this exact request. Your AI must retry the original request to execute it; this page does not send messages or change app data.", "审批仅授权这项具体请求。AI 需重试原请求才会执行；本页面不会发送消息或修改应用数据。")}</p>
  </article>;
}

export function AppsManager({ request = requestJson, navigate = (url: string) => window.location.assign(url) }: {
  request?: AppsRequest; navigate?: (url: string) => void;
} = {}) {
  const { tr } = useI18n();
  const [snapshot, setSnapshot] = useState<AppsSnapshot | null>(null);
  const [approvals, setApprovals] = useState<AppApproval[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [approvalError, setApprovalError] = useState(false);
  const [notice, setNotice] = useState("");
  const mounted = useRef(false);
  const revision = useRef(0);
  const mutationLock = useRef(false);
  const refresh = useCallback(async () => {
    const version = ++revision.current;
    setLoading(true); setError(""); setApprovalError(false);
    try {
      const data = await request("/api/apps") as AppsSnapshot;
      if (!data || typeof data.enabled !== "boolean" || !Array.isArray(data.apps) || !Array.isArray(data.connections)) throw new Error("app_service_unavailable");
      if (!mounted.current || version !== revision.current) return;
      setSnapshot(data);
      if (data.enabled) {
        try {
          const result = await request("/api/apps/approvals") as { approvals: AppApproval[] };
          if (!Array.isArray(result?.approvals)) throw new Error("app_service_unavailable");
          if (mounted.current && version === revision.current) setApprovals(result.approvals);
        } catch { if (mounted.current && version === revision.current) { setApprovals([]); setApprovalError(true); } }
      } else setApprovals([]);
    } catch (cause) { if (mounted.current && version === revision.current) setError(cause instanceof Error ? cause.message : "app_service_unavailable"); }
    finally { if (mounted.current && version === revision.current) setLoading(false); }
  }, [request]);
  useEffect(() => { mounted.current = true; void refresh(); return () => { mounted.current = false; revision.current++; }; }, [refresh]);
  async function mutate(key: string, action: () => Promise<unknown>, success: string) {
    if (mutationLock.current) return;
    mutationLock.current = true; setBusy(key); setError(""); setNotice("");
    try {
      await action();
      if (!mounted.current) return;
      setNotice(success);
      await refresh();
    } catch (cause) { if (mounted.current) setError(cause instanceof Error ? cause.message : "app_service_unavailable"); }
    finally { mutationLock.current = false; if (mounted.current) setBusy(""); }
  }
  function authorize(provider: string, permissions: Permission[]) {
    void mutate("authorize:" + provider, async () => {
      const result = await request("/api/apps/authorize", { method: "POST", body: JSON.stringify({ provider, permissions }) }) as { authorizationUrl?: string };
      if (!result.authorizationUrl || !/^https:\/\//i.test(result.authorizationUrl)) throw new Error("app_service_unavailable");
      navigate(result.authorizationUrl);
    }, tr("Continue in the provider's authorization page.", "请在应用的授权页面继续。"));
  }
  function save(connection: AppConnection, permissions: Permission[]) {
    void mutate("permissions:" + connection.id, () => request("/api/apps/connections/" + encodeURIComponent(connection.id), { method: "PATCH", body: JSON.stringify({ permissions }) }), tr("Connection permissions updated.", "连接权限已更新。"));
  }
  function disconnect(connection: AppConnection) {
    void mutate("disconnect:" + connection.id, () => request("/api/apps/connections/" + encodeURIComponent(connection.id), { method: "DELETE" }), tr("The account was disconnected and its pending approvals cancelled.", "账号已断开，相关待处理审批已取消。"));
  }
  function decide(approval: AppApproval, approve: boolean) {
    if (approval.status !== "pending_approval" || Date.parse(approval.expiresAt) <= Date.now()) { setError("app_approval_unavailable"); return; }
    void mutate("approval:" + approval.id, () => request("/api/apps/approvals/" + encodeURIComponent(approval.id), { method: "POST", body: JSON.stringify({ approve }) }), approve ? tr("Request approved. Ask your AI to retry the original request. No app action was executed here.", "请求已批准。请让 AI 重试原请求；本页面没有执行应用操作。") : tr("Request rejected. No app action was executed.", "请求已拒绝，没有执行应用操作。"));
  }
  const activeCount = snapshot?.connections.filter(connection => connection.status === "active").length || 0;
  const pendingCount = approvals.filter(approval => approval.status === "pending_approval" && Date.parse(approval.expiresAt) > Date.now()).length;
  return <div className="appsManager">
    <header className="appsManagerHeader"><div><span className="eyebrow">APPS</span><h1>{tr("Your connected apps", "你的应用连接")}</h1><p>{tr("Choose the accounts and permissions your AI can use. Review write requests before they run.", "选择 AI 可以使用的账号与权限，并在写入操作执行前审核具体请求。")}</p></div><button type="button" disabled={loading || Boolean(busy)} onClick={() => { setNotice(""); void refresh(); }}>{loading ? tr("Refreshing…", "刷新中…") : tr("Refresh", "刷新")}</button></header>
    {error && <div className="appsManagerMessage appsManagerError" role="alert"><p>{errorLabel(error, tr)}</p>{error === "unauthorized" && <a href="/auth/login?return_to=%2Fapps">{tr("Sign in", "登录")}</a>}<button type="button" onClick={() => setError("")}>{tr("Dismiss", "关闭")}</button></div>}
    {notice && <p className="appsManagerMessage" role="status">{notice}</p>}
    {loading && !snapshot && <p className="appsManagerLoading" role="status">{tr("Loading app connections…", "正在加载应用连接…")}</p>}
    {snapshot && !snapshot.enabled && <section className="appsManagerDisabled"><h2>{tr("Apps are not enabled yet", "应用连接尚未启用")}</h2><p>{tr("An administrator needs to enable Apps and configure the providers before you can connect accounts. Your existing device and AI connections are unchanged.", "管理员启用 Apps 并配置应用授权后，你即可连接账号。现有设备和 AI 连接仍可继续使用。")}</p></section>}
    {snapshot?.enabled && <>
      <section className="appsManagerSummary" aria-label={tr("Connection overview", "连接概览")}><span><strong>{activeCount}</strong>{tr("connected accounts", "个已连接账号")}</span><a href="#approvals"><strong>{pendingCount}</strong>{tr("awaiting review", "项等待审核")}</a><p>{tr("Read access is the default. Write actions require both permission and approval for each request.", "默认仅授予读取权限。写入操作同时需要写入权限和逐次请求审批。")}</p></section>
      <section className="appsManagerGrid" aria-label={tr("Available app connections", "可用的应用连接")}>{snapshot.apps.map(app => <CatalogCard key={app.provider} app={app} connections={snapshot.connections.filter(connection => connection.provider === app.provider)} busy={Boolean(busy)} onAuthorize={authorize} onSave={save} onDisconnect={disconnect} />)}</section>
      {!snapshot.apps.length && <p className="appsManagerEmpty">{tr("No app providers are available yet.", "目前还没有可用的应用服务。")}</p>}
      <section className="appsManagerApprovals" id="approvals" aria-labelledby="apps-manager-approvals-heading"><div className="appsManagerSectionHeading"><h2 id="apps-manager-approvals-heading">{tr("Review app requests", "审核应用请求")}</h2><p>{tr("Approve or reject the exact operation requested by your AI.", "核对 AI 请求的具体操作，再决定批准或拒绝。")}</p></div>
        {approvalError ? <p className="appsManagerMessage appsManagerError" role="alert">{tr("Approval requests could not be loaded. Refresh to try again.", "暂时无法加载审批请求，请刷新后重试。")}</p> : approvals.length ? <div className="appsManagerApprovalGrid">{approvals.map(approval => {
          const connection = snapshot.connections.find(item => item.id === approval.connectionId);
          return <ApprovalCard key={approval.id} approval={approval} connection={connection} app={snapshot.apps.find(item => item.provider === connection?.provider)} busy={Boolean(busy)} onDecide={decide} />;
        })}</div> : <p className="appsManagerEmpty">{tr("No app requests need review.", "目前没有需要审核的应用请求。")}</p>}
      </section>
    </>}
  </div>;
}
