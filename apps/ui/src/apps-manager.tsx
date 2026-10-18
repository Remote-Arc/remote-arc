import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "./i18n.js";
import {UI_PREVIEW} from "./preview.js";
import "./apps-manager.css";
import directory from "./app-directory.json" with { type: "json" };
import { AppCredentialForm, type AppCredentialInput } from "./apps-auth-form.js";

type Permission = "read" | "write";
export type AppDefinition = {
  provider: string; name: string; brand: string; configured: boolean;
  category?: string; auth?: "oauth" | "api_key"; billingNote?: string; connectionNote?: string;
  operations: { name: string; description: string; permission: Permission; inputSchema?: unknown }[];
  permissions: { read: string[]; write: string[] }; consentNote?: string;
};
export type AppConnection = {
  id: string; provider: string; accountLabel: string; status: string;
  settings?: Record<string, string>; dailyCallLimit?: number;
  permissions: Permission[]; scopes: string[]; expiresAt: string | null; lastError: string | null; updatedAt: string;
};
export type AppApproval = {
  id: string; connectionId: string; operation: string; status: string; expiresAt: string; arguments: Record<string, unknown>; review?: Record<string, unknown>;
};
export type AppsSnapshot = { enabled: boolean; apps: AppDefinition[]; connections: AppConnection[] };
export type AppsRequest = (path: string, init?: RequestInit) => Promise<unknown>;

const brandFiles: Record<string, string> = Object.fromEntries(directory.apps.map(app => [app.brand, app.brand]));
const connectedPermissions: Permission[] = ["read", "write"];

export function AppIcon({ brand }: { brand: string }) {
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
    case "app_daily_limit_reached": return tr("This connection or provider reached its daily operation limit. Try again tomorrow.", "此连接或服务已达到每日操作上限，请明天再试。");
    case "app_cost_limit": return tr("The estimated usage exceeds the limit in this request. Review the estimate before requesting again.", "预计用量超出本次请求的上限，请核对估算后重新提出请求。");
    case "app_user_token_required": return tr("X requires an OAuth user access token from your own developer project.", "X 需要你自己开发者项目的 OAuth 用户访问令牌。");
    case "app_whatsapp_settings_required": return tr("Enter your WhatsApp Business account and phone number IDs.", "请填写 WhatsApp Business 账号与电话号码 ID。");
    case "app_shop_domain_required": return tr("Enter the store's myshopify.com domain.", "请填写店铺的 myshopify.com 域名。");
    case "app_connection_not_found": return tr("This connection no longer exists. Refresh the page.", "该连接已不存在，请刷新页面。");
    default: return tr("Apps could not be updated. Check your connection and try again.", "应用状态暂时无法更新，请检查网络后重试。");
  }
}

function ConnectionRow({ app, connection, busy, onAuthorize, onSave, onDisconnect }: {
  app: AppDefinition; connection: AppConnection; busy: boolean;
  onAuthorize: (provider: string, permissions: Permission[], settings?: Record<string, string>) => void;
  onSave: (connection: AppConnection, permissions: Permission[]) => void;
  onDisconnect: (connection: AppConnection) => void;
}) {
  const { tr } = useI18n();
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  useEffect(() => { setConfirmDisconnect(false); }, [connection.id, connection.status]);
  const active = connection.status === "active";
  const needsScopes = [...app.permissions.read, ...app.permissions.write].some(scope => !["offline_access", "offline.access", "refresh_token"].includes(scope) && !connection.scopes.includes(scope));
  const needsAccess = app.operations.some(op => op.permission === "write") && !connection.permissions.includes("write");
  return <article className="appsManagerConnection" data-status={connection.status}>
    <div className="appsManagerConnectionTop"><strong>{connection.accountLabel}</strong><span className="appsManagerStatus" data-status={connection.status}>{statusLabel(connection.status, tr)}</span></div>
    {connection.status === "reauthorization_required" && <p className="appsManagerConnectionHint">{tr("Provider access expired or was revoked. Reconnect this account to restore access.", "应用授权已过期或被撤销，请重新连接此账号以恢复访问。")}</p>}
    <p className="appsManagerConnectionHint">{needsScopes || needsAccess ? tr("Reconnect once to authorize all available tools.", "重新授权一次，即可使用全部可用工具。") : tr("All authorized tools are ready to use.", "已授权的工具均可直接使用。")}</p>
    <div className="appsManagerConnectionActions">
      {(!active || needsScopes || needsAccess) && <button type="button" disabled={busy || !app.configured} onClick={() => needsAccess && !needsScopes && active ? onSave(connection, connectedPermissions) : onAuthorize(app.provider, connectedPermissions, connection.settings)}>{tr("Reconnect account", "重新授权账号")}</button>}
      {connection.status !== "disconnected" && <button type="button" className="appsManagerTextAction" disabled={busy} onClick={() => setConfirmDisconnect(true)}>{tr("Disconnect", "断开连接")}</button>}
    </div>
    {confirmDisconnect && <div className="appsManagerDisconnect" role="group" aria-label={tr("Confirm account disconnection", "确认断开账号")}>
      <p>{tr("Disconnect this account and cancel its pending approvals? Earlier changes in the app will remain.", "断开此账号并取消待处理审批？应用中已经发生的改动仍会保留。")}</p>
      <div><button type="button" className="appsManagerDanger" disabled={busy} onClick={() => onDisconnect(connection)}>{tr("Confirm disconnect", "确认断开")}</button><button type="button" disabled={busy} onClick={() => setConfirmDisconnect(false)}>{tr("Keep connected", "保持连接")}</button></div>
    </div>}
    <details className="appsManagerScopes"><summary>{tr("Provider scopes", "应用授权范围")}</summary><ul>{connection.scopes.map(scope => <li key={scope}><code>{scope}</code></li>)}</ul></details>
  </article>;
}

type CatalogOperation = AppDefinition["operations"][number];

function AppToolsDialog({ app, connections, onClose, onConnect, busy }: {
  app: AppDefinition; connections: AppConnection[]; onClose: () => void; onConnect: () => void; busy: boolean;
}) {
  const { tr } = useI18n();
  const [query, setQuery] = useState("");
  const [selectedName, setSelectedName] = useState(app.operations[0]?.name || "");
  const [copied, setCopied] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const active = connections.find(connection => connection.status === "active");
  const selected = app.operations.find(item => item.name === selectedName);
  const matching = app.operations.filter(item => (item.name + " " + item.description).toLowerCase().includes(query.trim().toLowerCase()));
  useEffect(() => {
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const elements = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), a[href]')).filter(item => item.getClientRects().length);
      if (!elements.length) return;
      const first = elements[0]!, last = elements[elements.length - 1]!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = oldOverflow; document.removeEventListener("keydown", onKey); previousFocus.current?.focus(); };
  }, [onClose]);
  async function copyInstruction(operation: CatalogOperation) {
    const prompt = `Use Remote Arc Connect (list_apps / call_app) to run ${app.provider}.${operation.name}${active ? ` with connectionId ${active.id}` : ""}. Ask me for any required arguments and obtain my approval before any write. Do not claim success without the provider result.`;
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
    } catch { setCopied(false); }
  }
  const schema = selected?.inputSchema && typeof selected.inputSchema === "object" ? selected.inputSchema as { properties?: Record<string, { type?: string; description?: string; enum?: unknown[] }>; required?: string[] } : null;
  const params = Object.entries(schema?.properties || {});
  return createPortal(
    <div className="appsToolsOverlay" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="appsToolsDialog" ref={dialogRef} role="dialog" aria-modal="true" aria-label={tr(app.name + " tools", app.name + " 工具")}>
        <header className="appsToolsHead">
          <AppIcon brand={app.brand} />
          <div><h2>{app.name} · {tr("Tools", "工具")}</h2><p>{app.operations.length} {tr("available operations", "项可用操作")} · {active ? tr("Account connected", "账号已连接") : tr("Connect an account to use tools", "连接账号后即可使用工具")}</p></div>
          <button ref={closeRef} type="button" className="appsToolsClose" aria-label={tr("Close tools", "关闭工具浮层")} onClick={onClose}>✕</button>
        </header>
        <div className="appsToolsBody">
          <aside className="appsToolsList">
            <label htmlFor={"apps-tool-search-" + app.provider}>{tr("Find a tool", "搜索工具")}</label>
            <input id={"apps-tool-search-" + app.provider} type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={tr("Search name or purpose…", "搜索名称或用途…")} />
            <div className="appsToolsItems" role="list" aria-label={tr("Available tools", "可用工具")}>
              {matching.map(item => <div role="listitem" key={item.name}><button type="button" className="appsToolsItem" aria-pressed={selectedName === item.name} onClick={() => { setSelectedName(item.name); setCopied(false); }}>
                <span className="appsToolsItemTitle">{item.name}</span><span className="appsToolsItemMeta">{item.description}</span><span className="appsToolsItemFooter"><small>{item.permission === "write" ? tr("Write · approval", "写入 · 需审批") : tr("Read-only", "只读")}</small><b>{tr("View details →", "查看详情 →")}</b></span>
              </button></div>)}
              {!matching.length && <p className="appsToolsEmpty">{tr("No tools match. Try another keyword.", "没有匹配的工具，试试其他关键词。")}</p>}
            </div>
          </aside>
          <section className="appsToolsDetail" aria-live="polite">
            {selected ? <>
              <div className="appsToolsDetailTop"><span className="appsToolsEyebrow">{tr("OPERATION DETAILS", "操作详情")}</span><span className="appsToolsRisk" data-permission={selected.permission}>{selected.permission === "write" ? tr("Write · human approval", "写入 · 人工审批") : tr("Read only", "只读操作")}</span></div>
              <h3>{selected.name}</h3>
              <p className="appsToolsDescription">{selected.description}</p>
              <div className="appsToolsParameterHeader"><h4>{tr("Required inputs", "调用参数")}</h4><span>{tr("Validated by Remote Arc", "由 Remote Arc 校验")}</span></div>
              {params.length ? <ul className="appsToolsParams">{params.map(([key, value]) => <li key={key}><code>{key}</code><span>{schema?.required?.includes(key) ? tr("Required", "必填") : tr("Optional", "选填")}</span><small>{value.type || "value"}{value.description ? " · " + value.description : ""}</small></li>)}</ul> : <p className="appsToolsParamEmpty">{tr("No parameter schema listed here. Your AI can discover the tool's current schema through list_apps.", "页面暂无参数定义。AI 可通过 list_apps 获取当前工具的完整参数结构。")}</p>}
              <p className="appsToolsPolicy">{selected.permission === "write" ? tr("Your AI prepares the request; you review its exact target and payload before execution.", "AI 先准备操作请求，你核对目标与完整参数后才会执行。") : tr("Only accessible data from the connected account is returned.", "只能读取此连接账号有权限访问的数据。")}</p>
              <div className="appsToolsActions">
                {active ? <button type="button" className="appsToolsPrimary" onClick={() => void copyInstruction(selected)}>{copied ? tr("Copied ✓", "已复制 ✓") : tr("Copy instruction for AI →", "复制给 AI 使用 →")}</button>
                : <button type="button" className="appsToolsPrimary" disabled={busy || !app.configured} onClick={() => { onClose(); onConnect(); }}>{app.configured ? tr("Connect account to use →", "连接账号后使用 →") : tr("Administrator setup needed", "需要管理员配置")}</button>}
                <button type="button" className="appsToolsSecondary" onClick={onClose}>{tr("Back to apps", "返回应用列表")}</button>
              </div>
              {copied && <p className="appsToolsCopied" role="status">{tr("Paste the instruction into an AI chat connected to Remote Arc. Nothing was executed here.", "将指令粘贴到已连接 Remote Arc 的 AI 对话中。本页面没有执行任何操作。")}</p>}
            </> : <p>{tr("Select a tool to inspect its inputs.", "选择一项工具查看参数。")}</p>}
          </section>
        </div>
      </div>
    </div>, document.body
  );
}

function CatalogCard({ app, connections, busy, onAuthorize, onSave, onDisconnect, onCredential }: {
  app: AppDefinition; connections: AppConnection[]; busy: boolean;
  onCredential: (provider: string, input: AppCredentialInput) => Promise<boolean>;
  onAuthorize: (provider: string, permissions: Permission[], settings?: Record<string, string>) => void;
  onSave: (connection: AppConnection, permissions: Permission[]) => void;
  onDisconnect: (connection: AppConnection) => void;
}) {
  const { tr } = useI18n();
  const [toolsOpen, setToolsOpen] = useState(false);
  const [credentialOpen, setCredentialOpen] = useState(false);
  const [shopDomain, setShopDomain] = useState("");
  function connect(provider: string, permissions: Permission[], settings?: Record<string, string>) {
    if (app.auth === "api_key") { setCredentialOpen(true); }
    else onAuthorize(provider, permissions, settings || (provider === "shopify" ? {shopDomain} : undefined));
  }
  return <article className="appsManagerCard" data-provider={app.provider}>
    <header><AppIcon brand={app.brand} /><div><h2>{app.name}</h2><span>{app.configured ? tr("Ready to connect", "可授权连接") : tr("Administrator setup needed", "等待管理员配置")}</span></div><span className="appsManagerOperationCount">{app.operations.length} {tr("operations", "项操作")}</span></header>

    {app.connectionNote && <p className="appsManagerConnectionHint">{app.connectionNote}</p>}
    {app.billingNote && <p className="appsManagerBilling">{app.billingNote}</p>}
    {app.provider === "runway" && <a className="appsRunwayAttribution" href="https://runwayml.com" target="_blank" rel="noreferrer"><img src="/app-brands/runwayattribution.svg" alt="Powered by Runway" /></a>}
    {connections.map(connection => <ConnectionRow key={connection.id} app={app} connection={connection} busy={busy} onAuthorize={connect} onSave={onSave} onDisconnect={onDisconnect} />)}
    <div className="appsManagerAuthorize">
      <p className="appsManagerConnectionHint">{tr("Connect once to use all available tools. Changes to app data are reviewed when requested.", "连接一次即可使用全部可用工具。修改应用数据时，再核对具体操作。")}</p>
      {app.provider === "shopify" && <label className="appsManagerStore">{tr("Store domain", "店铺域名")}<input value={shopDomain} onChange={e => setShopDomain(e.target.value)} placeholder="your-store.myshopify.com" autoComplete="off" maxLength={100} /></label>}
      <button type="button" className="appsManagerPrimary" disabled={busy || !app.configured || (app.provider === "shopify" && !/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shopDomain))} onClick={() => connect(app.provider, connectedPermissions)}>{app.configured ? connections.length ? tr("Connect another account", "连接其他账号") : tr("Connect account", "连接账号") : tr("Not configured", "尚未配置")}</button>
    </div>
    {credentialOpen && <AppCredentialForm provider={app.provider} write={true} busy={busy} onConnect={input => onCredential(app.provider, input)} onCancel={() => setCredentialOpen(false)} />}
    <div className="appsManagerToolsAction">
      <div><strong>{tr("Explore tools", "探索工具")}</strong><p>{tr("Search the operations and view their inputs without expanding this card.", "在独立窗口中搜索工具、查看参数，不会撑开当前卡片。")}</p></div>
      <button type="button" className="appsManagerExploreButton" aria-haspopup="dialog" onClick={() => setToolsOpen(true)}>{tr("Explore " + app.operations.length + " tools →", "查看 " + app.operations.length + " 项工具 →")}</button>
    </div>
    {toolsOpen && <AppToolsDialog app={app} connections={connections} busy={busy} onClose={() => setToolsOpen(false)} onConnect={() => connect(app.provider, connectedPermissions)} />}

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
  const [query, setQuery] = useState(() => new URLSearchParams(window.location.search).get("provider") || "");
  const [category, setCategory] = useState(() => new URLSearchParams(window.location.search).get("category") || "all");
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
    if (mutationLock.current) return false;
    mutationLock.current = true; setBusy(key); setError(""); setNotice("");
    try {
      await action();
      if (!mounted.current) return false;
      setNotice(success);
      await refresh();
      return true;
    } catch (cause) { if (mounted.current) setError(cause instanceof Error ? cause.message : "app_service_unavailable"); return false; }
    finally { mutationLock.current = false; if (mounted.current) setBusy(""); }
  }
  function authorize(provider: string, permissions: Permission[], settings?: Record<string, string>) {
    void mutate("authorize:" + provider, async () => {
      const result = await request("/api/apps/authorize", { method: "POST", body: JSON.stringify({ provider, permissions, settings }) }) as { authorizationUrl?: string };
      if (!result.authorizationUrl || !/^https:\/\//i.test(result.authorizationUrl)) throw new Error("app_service_unavailable");
      navigate(result.authorizationUrl);
    }, tr("Continue in the provider's authorization page.", "请在应用的授权页面继续。"));
  }
  function connectCredential(provider: string, input: AppCredentialInput) {
    return mutate("connect:" + provider, () => request("/api/apps/connections", {method: "POST", body: JSON.stringify({provider, ...input})}), tr("Account validated and connected.", "账号已验证并连接。"));
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
  const visibleApps = snapshot?.apps.filter(app => (category === "all" || (app.category || directory.apps.find(item => item.provider === app.provider)?.category) === category) && (app.name + " " + app.provider).toLowerCase().includes(query.trim().toLowerCase())) || [];
  const activeCount = snapshot?.connections.filter(connection => connection.status === "active").length || 0;
  const pendingCount = approvals.filter(approval => approval.status === "pending_approval" && Date.parse(approval.expiresAt) > Date.now()).length;
  return <div className="appsManager">
    <header className="appsManagerHeader"><div><span className="eyebrow">APPS</span><h1>{tr("Your connected apps", "你的应用连接")}</h1><p>{tr("Connect your apps to the AI chat you already use. Remote Arc Connect works with Apps independently of Arc Agent. Review write requests before they run.", "把应用连接到你正在使用的 AI 聊天。Remote Arc Connect 的 Apps 无需等待 Arc Agent 上线；写入操作执行前由你审核。")}</p></div><button type="button" disabled={loading || Boolean(busy)} onClick={() => { setNotice(""); void refresh(); }}>{loading ? tr("Refreshing…", "刷新中…") : tr("Refresh", "刷新")}</button></header>
    {error && <div className="appsManagerMessage appsManagerError" role="alert"><p>{errorLabel(error, tr)}</p>{error === "unauthorized" && <a href="/auth/login?return_to=%2Fapps">{tr("Sign in", "登录")}</a>}<button type="button" onClick={() => setError("")}>{tr("Dismiss", "关闭")}</button></div>}
    {notice && <p className="appsManagerMessage" role="status">{notice}</p>}
    {loading && !snapshot && <p className="appsManagerLoading" role="status">{tr("Loading app connections…", "正在加载应用连接…")}</p>}
    {snapshot && !snapshot.enabled && <section className="appsManagerDisabled"><h2>{tr("Apps are not enabled yet", "应用连接尚未启用")}</h2><p>{tr("An administrator needs to enable Apps and configure the providers before you can connect accounts. Your existing device and AI connections are unchanged.", "管理员启用 Apps 并配置应用授权后，你即可连接账号。现有设备和 AI 连接仍可继续使用。")}</p></section>}
    {snapshot?.enabled && <>
      <section className="appsManagerSummary" aria-label={tr("Connection overview", "连接概览")}><span><strong>{activeCount}</strong>{tr("connected accounts", "个已连接账号")}</span><a href="#approvals"><strong>{pendingCount}</strong>{tr("awaiting review", "项等待审核")}</a><p>{tr("All available tools are enabled when you connect. Review each write request before it runs.", "连接后默认启用全部可用工具。写入执行前核对具体请求。")}</p></section>
      <section className="appsManagerMcpTools" aria-labelledby="apps-mcp-tools-title">
        <div>
          <h2 id="apps-mcp-tools-title">{tr("Use your apps in ChatGPT", "在 ChatGPT 中使用你连接的应用")}</h2>
          <p>{tr("Ask your AI to find information in Slack, check a project, or prepare an update. Your connected accounts stay private to you. Sending or changing anything still requires approval.", "你可以直接让 AI 查找 Slack 消息、检查项目，或准备更新。每个人使用自己连接的账号；发送消息或修改内容仍需审批。")}</p>
        </div>
        <a className="appsManagerSetupLink" href="/install/chatgpt">{tr("Connect an AI assistant", "连接 AI 助手")} →</a>
        <p className="appsManagerMcpToolsHint">{tr("Already connected, but your AI asks to reconnect or cannot perform changes? Older permissions may need a fresh connection. In ChatGPT, open Plugins → Remote Arc and reconnect. If its reconnect link fails, remove the stale ChatGPT connection and add the Remote Arc MCP endpoint again. Your Remote Arc accounts and devices are not deleted.", "已经连接，却无法发送消息或提示重新登录？旧连接可能没有最新权限。请到 ChatGPT 的 Plugins → Remote Arc 重新授权；如果重连按钮本身报错，可以只重新添加 ChatGPT 侧的 Remote Arc 连接。Remote Arc 里的设备和已连接账号不会因此被删除。")}</p>
        <details className="appsManagerMcpDetails">
          <summary>{tr("For developers: MCP tools and scopes", "开发者详情：MCP 工具及权限")}</summary>
          <div className="appsManagerMcpToolList">
            <div><code>list_apps</code><span>{tr("Find linked services (apps:read)", "查找已连接服务（apps:read）")}</span></div>
            <div><code>call_app</code><span>{tr("Read or request actions (apps:read + apps:write for new authorizations)", "读取或请求操作（新授权申请 apps:read + apps:write）")}</span></div>
          </div>
        </details>
      </section>

      <div className="appsManagerFilters"><label>{tr("Find an app", "查找应用")}<input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder={tr("Search apps…", "搜索应用…")} /></label><div role="group" aria-label={tr("App categories", "应用分类")}><button type="button" aria-pressed={category === "all"} onClick={() => setCategory("all")}>{tr("All apps", "全部应用")} <span>{snapshot.apps.length}</span></button>{directory.categories.map(item => <button type="button" key={item.id} aria-pressed={category === item.id} onClick={() => setCategory(item.id)}>{tr(item.name, item.nameZh)}</button>)}</div></div>
      {directory.categories.map(group => {
        const apps = visibleApps.filter(app => (app.category || directory.apps.find(item => item.provider === app.provider)?.category) === group.id);
        return apps.length ? <section className="appsManagerCategory" key={group.id} aria-label={tr(group.name, group.nameZh)}><header><h2>{tr(group.name, group.nameZh)}</h2><p>{tr(group.description, group.descriptionZh)}</p></header><div className="appsManagerGrid">{apps.map(app => <CatalogCard key={app.provider} app={app} connections={snapshot.connections.filter(connection => connection.provider === app.provider)} busy={Boolean(busy) || UI_PREVIEW} onAuthorize={authorize} onCredential={connectCredential} onSave={save} onDisconnect={disconnect} />)}</div></section> : null;
      })}
      {!!snapshot.apps.length && !visibleApps.length && <p className="appsManagerEmpty">{tr("No apps match your search.", "没有匹配的应用。")}</p>}
      {!snapshot.apps.length && <p className="appsManagerEmpty">{tr("No app providers are available yet.", "目前还没有可用的应用服务。")}</p>}
      <section className="appsManagerApprovals" id="approvals" aria-labelledby="apps-manager-approvals-heading"><div className="appsManagerSectionHeading"><h2 id="apps-manager-approvals-heading">{tr("Review app requests", "审核应用请求")}</h2><p>{tr("Approve or reject the exact operation requested by your AI.", "核对 AI 请求的具体操作，再决定批准或拒绝。")}</p></div>
        {approvalError ? <p className="appsManagerMessage appsManagerError" role="alert">{tr("Approval requests could not be loaded. Refresh to try again.", "暂时无法加载审批请求，请刷新后重试。")}</p> : approvals.length ? <div className="appsManagerApprovalGrid">{approvals.map(approval => {
          const connection = snapshot.connections.find(item => item.id === approval.connectionId);
          return <ApprovalCard key={approval.id} approval={approval} connection={connection} app={snapshot.apps.find(item => item.provider === connection?.provider)} busy={Boolean(busy) || UI_PREVIEW} onDecide={decide} />;
        })}</div> : <p className="appsManagerEmpty">{tr("No app requests need review.", "目前没有需要审核的应用请求。")}</p>}
      </section>
    </>}
  </div>;
}
