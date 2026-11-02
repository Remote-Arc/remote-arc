import {SlackBotPanel} from "./slack-bot-panel.js";
import {WorkspaceLoading} from '../../components/workspace-loading.js';
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "../../app/i18n.js";
import {UI_PREVIEW} from "../../preview/preview-mode.js";
import "./apps-manager.css";
import {ProductIcon} from "../../components/product-icon.js";
import directory from "../../data/app-directory.json" with { type: "json" };
import { AppCredentialForm, type AppCredentialInput } from "./apps-auth-form.js";
import {GoogleBetaApplication,GoogleConsentDialog,type GoogleBetaState} from './google-app-beta.js';

type Permission = "read" | "write";
export type AppDefinition = {
  provider: string; name: string; brand: string; configured: boolean;
  category?: string; auth?: "oauth" | "api_key"; billingNote?: string; connectionNote?: string;
  operations: { name: string; description: string; permission: Permission; inputSchema?: unknown }[];
  permissions: { read: string[]; write: string[] }; consentNote?: string;dataPolicy?:{version:string;retentionDays:number};requiresBetaApproval?:boolean;
};
export type AppConnection = {
  id: string; provider: string; accountLabel: string; status: string;
  settings?: Record<string, string>; dailyCallLimit?: number;
  permissions: Permission[]; scopes: string[]; expiresAt: string | null; lastError: string | null; updatedAt: string;
  toolAccess?: { available: number; total: number; needsReconnect: boolean };
  dataConsentRequired?:boolean;
};
export type AppConnectionCheck = { connectionId: string; provider: string; accountLabel: string; checkedAt: string; verification: "provider_identity_checked"; toolAccess: { available: number; total: number; needsReconnect: boolean } };
export type AppApproval = {
  id: string; connectionId: string; operation: string; status: string; expiresAt: string; arguments: Record<string, unknown>; review?: Record<string, unknown>;
};
export type AppsSnapshot = { enabled: boolean; apps: AppDefinition[]; connections: AppConnection[];googleBeta?:GoogleBetaState };
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
    case "slack_distribution_required": return tr("Slack installation is not available for this workspace yet. Contact support@remotearc.app or try again later.", "此工作区暂时无法安装 Slack 应用，请联系 support@remotearc.app 或稍后重试。");
    case "app_authorization_denied": return tr("Slack authorization was cancelled or denied. You can connect again.", "Slack 授权已取消或被拒绝，可以重新连接。");
    case "slack_bot_installation_failed": return tr("Slack Bot installation could not be completed. Try adding it again or contact support@remotearc.app.", "Slack Bot 安装未完成，请重新添加，或联系 support@remotearc.app。");
    case "app_scope_required": return tr("The provider needs additional permissions. Reconnect the account with the access you want.", "应用需要额外授权，请选择所需权限后重新连接账号。");
    case 'google_apps_beta_invitation_required':return tr('Apply for Google Apps Beta before connecting.','请先申请 Google Apps 内测，获邀后再连接。');
    case 'google_app_data_consent_required':return tr('Review Google data use in Apps before continuing.','请先在 Apps 查看并同意 Google 数据使用方式。');
    case "app_reauthorization_required": return tr("This account needs authorization again. Reconnect to continue.", "此账号需要重新授权，请重新连接后继续。");
    case "app_account_changed": return tr("The provider returned a different account. Reconnect the intended account.", "服务商返回了不同的账号，请重新授权你要使用的账号。");
    case "app_connection_changed": return tr("This connection changed during the check. Refresh and try again.", "检查期间连接已发生变更，请刷新后重试。");
    case "app_rate_limited": return tr("The provider is temporarily limiting requests. Try again later.", "服务商暂时限制了请求频率，请稍后重试。");
    case "app_refresh_in_progress": return tr("The account is refreshing its authorization. Try again shortly.", "账号正在刷新授权，请稍后重试。");
    case "app_provider_unavailable": case "app_provider_failed": return tr("The provider is temporarily unavailable. Try the check again later.", "服务商暂时不可用，请稍后重新检查。");
    case "mcp_paused": return tr("Tool access is paused. Resume it in Security before checking this account.", "工具访问已暂停，请先在安全设置中恢复，再检查账号。");
    case "app_permission_required": return tr("This connection does not allow that permission.", "当前连接没有授予该项权限。");
    case "app_approval_unavailable": return tr("This approval expired or the connection changed. Refresh and ask your AI for a new request.", "审批已过期或连接已变更。请刷新，并让 AI 重新提交请求。");
    case "app_daily_limit_reached": return tr("This connection or provider reached its daily operation limit. Try again tomorrow.", "此连接或服务已达到每日操作上限，请明天再试。");
    case "app_cost_limit": return tr("The estimated usage exceeds the limit in this request. Review the estimate before requesting again.", "预计用量超出本次请求的上限，请核对估算后重新提出请求。");
    case "app_user_token_required": return tr("Reconnect X to authorize your user account.", "请重新连接 X，完成用户账号授权。");
    case "app_whatsapp_settings_required": return tr("Enter your WhatsApp Business account and phone number IDs.", "请填写 WhatsApp Business 账号与电话号码 ID。");
    case "app_shop_domain_required": return tr("Enter the store's myshopify.com domain.", "请填写店铺的 myshopify.com 域名。");
    case "app_connection_not_found": return tr("This connection no longer exists. Refresh the page.", "该连接已不存在，请刷新页面。");
    default: return tr("Apps could not be updated. Check your connection and try again.", "应用状态暂时无法更新，请检查网络后重试。");
  }
}

function ConnectionRow({ app, connection, busy, onAuthorize, onDisconnect, onCheck,onConsent,onErase }: {
  app: AppDefinition; connection: AppConnection; busy: boolean;
  onAuthorize: (provider: string, permissions: Permission[], settings?: Record<string, string>) => void;
  onDisconnect: (connection: AppConnection) => void;
  onCheck: (connection: AppConnection) => Promise<AppConnectionCheck | undefined>;
  onConsent:(connection:AppConnection)=>void;onErase:(connection:AppConnection)=>void;
}) {
  const { tr } = useI18n();
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [confirmErase,setConfirmErase]=useState(false);
  const [verification, setVerification] = useState<AppConnectionCheck>();
  useEffect(() => { setConfirmDisconnect(false); }, [connection.id, connection.status]);
  useEffect(() => { setVerification(undefined); }, [connection.id, connection.status, connection.updatedAt]);
  const active = connection.status === "active";
  const needsScopes = connection.toolAccess?.needsReconnect === true&&!connection.dataConsentRequired;
  return <article className="appsManagerConnection" data-status={connection.status}>
    <div className="appsManagerConnectionTop"><strong>{connection.accountLabel}</strong><span className="appsManagerStatus" data-status={needsScopes ? "limited" : connection.status}>{needsScopes ? tr("Update access", "需要补充授权") : statusLabel(connection.status, tr)}</span></div>
    {connection.status === "reauthorization_required" && <p className="appsManagerConnectionHint">{tr("Provider access expired or was revoked. Reconnect this account to restore access.", "应用授权已过期或被撤销，请重新连接此账号以恢复访问。")}</p>}
    {needsScopes && <p className="appsManagerConnectionHint">{tr("Some tools need additional provider permissions. Reconnect to enable them; existing authorized tools remain available.", "部分工具需要补充服务商权限，重新授权即可启用，已有权限的工具仍可使用。")}</p>}
    {verification && <p className="appsManagerConnectionCheck" role="status"><ProductIcon name="check" size={15}/><span>{tr("Account access verified", "账号访问已验证")} · {verification.toolAccess.available}/{verification.toolAccess.total} {tr("tools authorized", "项工具已授权")}</span></p>}
    <div className="appsManagerConnectionActions">
      {(!active || needsScopes) && <button type="button" className="appsManagerPrimary" disabled={busy || !app.configured} onClick={() => onAuthorize(app.provider, connectedPermissions, connection.settings)}>{tr("Reconnect account", "重新授权账号")}</button>}
      {connection.dataConsentRequired&&<button type="button" disabled={busy} onClick={()=>onConsent(connection)}>{tr('Review data access','查看数据授权')}</button>}
      {active && !connection.dataConsentRequired&&<button type="button" disabled={busy || !app.configured} onClick={async () => { setVerification(undefined); setVerification(await onCheck(connection)); }}>{tr("Check connection", "检查连接")}</button>}
      {connection.status !== "disconnected" && <button type="button" className="appsManagerTextAction" disabled={busy} onClick={() => setConfirmDisconnect(true)}>{tr("Disconnect", "断开连接")}</button>}
      {app.dataPolicy&&<button type="button" className="appsManagerTextAction" disabled={busy} onClick={()=>setConfirmErase(true)}>{tr('Delete saved call data','删除保存的调用原文')}</button>}
    </div>
    {confirmDisconnect && <div className="appsManagerDisconnect" role="group" aria-label={tr("Confirm account disconnection", "确认断开账号")}>
      <p>{tr("Disconnect this account? Arc and connected AI clients will lose access.", "断开此账号？Arc 和已连接 AI 客户端将无法再使用此账号。")}</p>
      <div><button type="button" className="appsManagerDanger" disabled={busy} onClick={() => onDisconnect(connection)}>{tr("Confirm disconnect", "确认断开")}</button><button type="button" disabled={busy} onClick={() => setConfirmDisconnect(false)}>{tr("Keep connected", "保持连接")}</button></div>
    </div>}
    {confirmErase&&<div className="appsManagerDisconnect" role="group" aria-label={tr('Confirm deletion of saved call data','确认删除调用原文')}><p>{tr('Permanently delete background call contents for this account? Waiting calls are cancelled; already dispatched operations may finish. This does not delete chat/task/memory copies or undo changes in Google.','永久删除此账号的后台调用原文？等待中的调用会被取消，已派发的操作可能继续完成。对话、任务和记忆副本需分别删除，Google 中已完成的更改不会被撤销。')}</p><div><button type="button" className="appsManagerDanger" disabled={busy} onClick={()=>{onErase(connection);setConfirmErase(false);}}>{tr('Delete call contents','删除调用原文')}</button><button type="button" disabled={busy} onClick={()=>setConfirmErase(false)}>{tr('Cancel','取消')}</button></div></div>}
  </article>;
}

type AppPanelTab = "accounts" | "tools";

const appSummaries: Record<string, [string, string]> = {
  github: ["Work with repositories, issues, pull requests and CI runs.", "查看代码仓库、跟进 Issue 和 PR，检查 CI 运行结果。"],
  slack: ["Find conversations, share updates and keep your team in sync.", "查找团队对话、发送进展，让信息同步到位。"],
  gmail: ["Find emails, prepare replies and organize your inbox.", "查找邮件、起草回复，整理收件箱。"],
  outlook: ["Read mail, draft replies and manage your inbox.", "阅读邮件、起草回复，管理收件箱。"],
  google_calendar: ["Check availability and keep meetings up to date.", "查询空闲时间，创建和更新会议日程。"],
  microsoft_calendar: ["Plan meetings and respond to calendar invitations.", "安排会议，管理日历邀请与出席状态。"],
  google_drive: ["Find files, read documents and organize shared work.", "查找文件、读取文档，整理已授权的工作资料。"],
  google_docs: ["Create documents and turn your ideas into written work.", "创建与编辑文档，把想法整理成文字。"],
  google_sheets: ["Read data, update spreadsheets and build reports.", "读取数据、更新电子表格，整理工作报表。"],
  notion: ["Find knowledge, create pages and keep notes current.", "查找知识、创建页面，更新工作笔记。"],
  linear: ["Track issues and turn next steps into team tasks.", "跟进 Issue，把下一步工作变成团队任务。"],
  vercel: ["Inspect projects, check deployments and review domains.", "检查项目、查看部署状态，管理域名信息。"],
  jira: ["Find issues, add context and track project work.", "查找 Issue、补充讨论，跟踪项目工作。"],
  confluence: ["Find team spaces, read pages and publish documentation.", "查找团队空间、阅读页面，创建项目文档。"],
  runway: ["Generate images and videos, then follow their actual results.", "生成图片与视频，跟踪创作任务的实际结果。"],
  youtube: ["Explore videos and create, edit or organize playlists.", "查看视频，创建、编辑和整理播放列表。"],
  facebook: ["Follow your Pages and publish updates to your audience.", "查看主页动态，向你的受众发布更新。"],
  instagram: ["Manage media, publish content and respond to comments.", "管理媒体内容、发布动态，回复用户评论。"],
  x: ["Read your posts and create or manage new updates.", "查看账号帖子，创建和管理发布内容。"],
  whatsapp: ["Send business messages and work with approved templates.", "发送商务消息，使用已获服务商批准的消息模板。"],
  linkedin: ["Publish professional updates and manage your posts.", "发布职业动态，管理你的帖子内容。"],
  google_search_console: ["Analyze search traffic and submit or remove sitemaps.", "分析搜索流量，提交或移除 Sitemap。"],
  google_analytics: ["Explore traffic and create or maintain GA4 custom dimensions.", "分析网站流量，创建和维护 GA4 自定义维度。"],
  google_ads: ["Review ad performance, pause delivery and organize labels.", "查看投放表现，暂停广告并整理标签。"],
  meta_ads: ["Review campaign results and pause underperforming campaigns.", "查看广告活动表现，暂停需要调整的活动。"],
  shopify: ["Review orders, browse products and prepare new listings.", "查看订单、浏览商品，创建商品草稿。"],
  supabase: ["Inspect projects, query data and review deployed functions.", "检查项目、查询数据，查看已部署的函数。"],
  hubspot: ["Follow deals and keep customer contacts up to date.", "跟进销售机会，更新客户联系人信息。"],
  salesforce: ["Review opportunities and manage customer contacts.", "查看销售机会，管理客户联系人。"],
  google_slides: ["Read presentations, create slides and edit their text.", "阅读演示文稿，创建幻灯片并编辑文字。"],
  onedrive: ["Find files, create folders and organize your drive.", "查找文件、创建文件夹，移动和整理云盘资料。"],
  microsoft_excel: ["Read workbook data, update cells and build tables.", "读取工作簿，更新单元格并创建表格。"],
  microsoft_teams: ["Read chats and send, edit or remove your messages.", "查看聊天，发送、编辑或删除自己的消息。"],
  microsoft_todo: ["Read task lists, create tasks and track completion.", "查看任务列表，创建任务并更新完成状态。"],
  dropbox: ["Find files, create folders and copy or move your work.", "查找文件、创建文件夹，复制和移动工作资料。"],
  asana: ["Find project tasks, update progress and add comments.", "查看项目任务，更新进度并添加评论。"],
  airtable: ["Read base records and create, update or remove entries.", "读取数据表记录，创建、更新和删除条目。"],
};

function appCategory(app: AppDefinition) {
  return directory.categories.find(item => item.id === (app.category || directory.apps.find(item => item.provider === app.provider)?.category));
}

function AppTools({ app, connections, busy, onConnect }: {
  app: AppDefinition; connections: AppConnection[]; busy: boolean; onConnect: () => void;
}) {
  const { tr } = useI18n();
  const [query, setQuery] = useState("");
  const [selectedName, setSelectedName] = useState("");
  const [permissionFilter,setPermissionFilter]=useState('all');
  const active = connections.find(connection => connection.status === "active");
  const matching = app.operations.filter(item => (permissionFilter==='all'||item.permission===permissionFilter)&&(item.name + " " + item.description).toLowerCase().includes(query.trim().toLowerCase()));
  return <div className="appsToolsContent">
    <p className="appsPanelIntro">{active ? tr("Connected. Just tell Arc or your connected AI what you want to get done.", "已连接。直接告诉 Arc 或已连接的 AI 你想做什么即可。") : tr("Connect your account, then describe what you need in chat.", "连接账号后，直接在对话里说出你的需求即可。")}</p>
    <label className="appsSearchField appsToolsSearch"><ProductIcon name="search" size={17}/><span className="appsSrOnly">{tr("Find a tool", "搜索工具")}</span><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={tr("Search tools…", "搜索工具…")} /></label>
    <div className="appsToolFilters" role="group" aria-label={tr('Tool access type','工具读写类型')}>{[['all',tr('All tools','全部工具')],['read',tr('Read','读取')],['write',tr('Write','写入')]].map(([kind,label])=><button type="button" key={kind} aria-pressed={permissionFilter===kind} onClick={()=>setPermissionFilter(kind!)}>{label} · {app.operations.filter(item=>kind==='all'||item.permission===kind).length}</button>)}</div><div className="appsToolsItems">
      {matching.map(item => <section className="appsTool" key={item.name}>
        <h3><button type="button" className="appsToolTrigger" aria-expanded={selectedName === item.name} aria-controls={"app-operation-" + app.provider + "-" + item.name} onClick={() => setSelectedName(selectedName === item.name ? "" : item.name)}>
          <span className="appsToolTitle"><strong>{item.description || item.name}</strong></span><span className="appsToolMeta"><small className="appsToolAccessBadge" data-permission={item.permission}>{item.permission==='write'?tr('Write','写入'):tr('Read','读取')}</small><ProductIcon name="chevron" size={15}/></span>
        </button></h3>
        {selectedName === item.name && <div className="appsToolDetail" id={"app-operation-" + app.provider + "-" + item.name}>
          <span className="appsToolPermission">{item.permission === "write" ? tr("Makes changes", "可进行更改") : tr("Reads data", "读取数据")}</span>
          <p>{item.permission === "write" ? tr("Uses the permissions granted by your connected account.", "使用连接账号已授予的权限。") : tr("Returns data this account has access to.", "返回该账号有权访问的数据。")}</p>
          {!active && <button type="button" className="appsToolsPrimary" disabled={busy || !app.configured} onClick={onConnect}>{app.configured ? tr("Connect account", "连接账号") : tr("Connection coming soon", "账号连接即将开放")}</button>}
        </div>}
      </section>)}
      {!matching.length && <p className="appsToolsEmpty">{tr("No matching tools. Try another keyword.", "没有匹配的工具，试试其他关键词。")}</p>}
    </div>
  </div>;
}

function AppDetailsPanel({ app, connections, initialTab, onClose, onAuthorize, onDisconnect, onCredential, onCheck,onConsent,onErase, busy, error, notice }: {
  app: AppDefinition; connections: AppConnection[]; initialTab: AppPanelTab; onClose: () => void; busy: boolean; error: string; notice: string;
  onAuthorize: (provider: string, permissions: Permission[], settings?: Record<string, string>) => void;
  onDisconnect: (connection: AppConnection) => void;
  onCredential: (provider: string, input: AppCredentialInput) => Promise<boolean>;
  onCheck: (connection: AppConnection) => Promise<AppConnectionCheck | undefined>;
  onConsent:(connection:AppConnection)=>void;onErase:(connection:AppConnection)=>void;
}) {
  const { tr } = useI18n();
  const [tab, setTab] = useState(initialTab);
  const [credentialOpen, setCredentialOpen] = useState(app.auth === "api_key" && !connections.length);
  const [shopDomain, setShopDomain] = useState("");
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const category = appCategory(app);
  const summary = appSummaries[app.provider];
  function connect(provider: string, permissions: Permission[], settings?: Record<string, string>) {
    if (app.auth === "api_key") { setTab("accounts"); setCredentialOpen(true); }
    else if (provider === "shopify" && !settings) setTab("accounts");
    else onAuthorize(provider, permissions, settings);
  }
  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const background = Array.from(document.body.children).filter((item): item is HTMLElement => item instanceof HTMLElement && !item.contains(dialogRef.current));
    const oldInert = background.map(item => item.inert);
    background.forEach(item => { item.inert = true; });
    closeRef.current?.focus();
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const elements = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button:not(:disabled):not([tabindex="-1"]), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], summary')).filter(item => item.getClientRects().length);
      if (!elements.length) return;
      const first = elements[0]!, last = elements[elements.length - 1]!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = oldOverflow; document.removeEventListener("keydown", onKey); background.forEach((item, index) => { item.inert = oldInert[index]!; }); if (previousFocus?.isConnected) previousFocus.focus(); };
  }, [onClose]);
  return createPortal(
    <div className="appsPanelOverlay workspaceSurface" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="appsPanel" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={"app-panel-title-" + app.provider}>
        <header className="appsPanelHead">
          <div className="appsPanelIdentity"><AppIcon brand={app.brand}/><div><h2 id={"app-panel-title-" + app.provider}>{app.name}</h2><p>{category ? tr(category.name, category.nameZh) : tr("Integration", "应用集成")}</p></div></div>
          <button ref={closeRef} type="button" className="appsPanelClose" aria-label={tr("Close app details", "关闭应用详情")} onClick={onClose}><ProductIcon name="close"/></button>
        </header>
        <div className="appsPanelTabs" role="tablist" aria-label={tr("App details", "应用详情")}>
          {(["accounts", "tools"] as const).map(value => <button key={value} id={"app-panel-tab-" + value} type="button" role="tab" aria-selected={tab === value} tabIndex={tab === value ? 0 : -1} aria-controls={"app-panel-" + value} onClick={() => setTab(value)} onKeyDown={event => {
            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
            event.preventDefault(); const next = event.key === "Home" ? "accounts" : event.key === "End" ? "tools" : value === "accounts" ? "tools" : "accounts";
            setTab(next); document.getElementById("app-panel-tab-" + next)?.focus();
          }}>{value === "accounts" ? tr("Accounts", "连接账号") : tr("Tools", "工具")}<span>{value === "accounts" ? connections.length : app.operations.length}</span></button>)}
        </div>
        <div className="appsPanelScroll">
          {error && <p className="appsPanelFeedback" role="alert" data-error="true">{errorLabel(error, tr)}</p>}
          {notice && !error && <p className="appsPanelFeedback" role="status">{notice}</p>}
          <section id={"app-panel-" + tab} role="tabpanel" aria-labelledby={"app-panel-tab-" + tab}>
            {tab === "tools" ? <AppTools app={app} connections={connections} busy={busy} onConnect={() => connect(app.provider, connectedPermissions)}/> : <>
              {app.provider === "slack" && <SlackBotPanel/>}
              {summary && <p className="appsPanelIntro">{tr(...summary)}</p>}
              {connections.length ? <div className="appsPanelAccounts">{connections.map(connection => <ConnectionRow key={connection.id} app={app} connection={connection} busy={busy} onAuthorize={connect} onDisconnect={onDisconnect} onCheck={onCheck} onConsent={onConsent} onErase={onErase}/>)}</div> : <div className="appsPanelEmpty"><ProductIcon name="link" size={25}/><h3>{tr("Connect your " + app.name + " account", "连接你的 " + app.name + " 账号")}</h3><p>{tr("Your connected AI can use this app with the access you grant.", "连接后，你的 AI 即可在授权范围内使用此应用。")}</p></div>}
              {!app.configured ? <p className="appsPanelAvailability">{tr("Account connection is coming soon. You can explore the tools in the meantime.", "账号连接即将开放，你可以先浏览应用工具。")}</p> : <div className="appsPanelConnect">
                {app.provider === "shopify" ? <form onSubmit={event => { event.preventDefault(); onAuthorize(app.provider, connectedPermissions, {shopDomain}); }}><label className="appsManagerStore">{tr("Store domain", "店铺域名")}<input value={shopDomain} onChange={event => setShopDomain(event.target.value)} placeholder="your-store.myshopify.com" autoComplete="off" required pattern="[a-z0-9][a-z0-9-]*\.myshopify\.com" maxLength={100}/></label><button type="submit" className="appsManagerPrimary" disabled={busy || !/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shopDomain)}>{tr("Connect store", "连接店铺")}</button></form>
                : credentialOpen ? <AppCredentialForm provider={app.provider} write={true} busy={busy} onConnect={input => onCredential(app.provider, input)} onCancel={() => setCredentialOpen(false)}/>
                : <button type="button" className="appsManagerPrimary" disabled={busy} onClick={() => connect(app.provider, connectedPermissions)}><ProductIcon name={connections.length ? "add" : "link"} size={16}/>{connections.length ? tr("Connect another account", "连接其他账号") : tr("Connect account", "连接账号")}</button>}
                <p className="appsPanelAccessNote"><ProductIcon name="shield" size={15}/>{app.auth === "api_key" ? tr("Credentials are encrypted and kept out of AI messages.", "凭据加密保存，不会进入 AI 对话。") : tr("Sign in securely with " + app.name + ". Disconnect at any time.", "通过 " + app.name + " 安全登录，随时可以断开连接。")}</p>
              </div>}
              {(app.connectionNote || app.billingNote) && <details className="appsManagerProviderNotes"><summary>{tr("Connection & billing details", "连接与费用说明")}</summary>{app.connectionNote && <p>{app.connectionNote}</p>}{app.billingNote && <p>{app.billingNote}</p>}</details>}
            </>}
          </section>
        </div>
        {app.provider === "runway" && <footer className="appsPanelAttribution"><a className="appsRunwayAttribution" href="https://runwayml.com" target="_blank" rel="noreferrer"><img src="/app-brands/runwayattribution.svg" alt="Powered by Runway"/></a></footer>}
      </div>
    </div>, document.body
  );
}

function CatalogCard({ app, connections, busy, onConnect, onOpen }: {
  app: AppDefinition; connections: AppConnection[]; busy: boolean;
  onConnect: () => void; onOpen: (tab: AppPanelTab) => void;
}) {
  const { tr } = useI18n();
  const category = appCategory(app);
  const summary = appSummaries[app.provider];
  const needsAttention = connections.some(connection => connection.status !== "active" || connection.toolAccess?.needsReconnect);
  const state = connections.length ? needsAttention ? "attention" : "connected" : app.configured ? "available" : "soon";
  return <article className="appsManagerCard" data-provider={app.provider} data-state={state}>
    <header><AppIcon brand={app.brand}/><div><h2><button type="button" className="appsCardTitle" onClick={() => onOpen(app.provider==='slack'?"accounts":"tools")} aria-haspopup="dialog">{app.name}</button></h2><span>{category ? tr(category.name, category.nameZh) : tr("Integration", "应用集成")}</span></div></header>
    <p className="appsCardDescription">{summary ? tr(...summary) : tr("Use this app from your connected AI chat.", "通过已连接的 AI 对话使用此应用。")}</p>
    <div className="appsCardState" data-state={state}>{state === "connected" ? <><ProductIcon name="check" size={14}/>{tr("Connected", "已连接")}{connections.length > 1 && <span>· {connections.length} {tr("accounts", "个账号")}</span>}</> : state === "attention" ? <><span className="appsCardStateDot"/>{tr("Needs attention", "需要关注")}</> : state === "soon" ? tr("Coming soon", "即将开放") : tr("Ready to connect", "可连接账号")}</div>
    <footer className="appsCardFooter">
      <button type="button" className="appsCardTools" aria-haspopup="dialog" onClick={() => onOpen("tools")}>{app.operations.length} {tr("tools", "项工具")} · {app.operations.filter(item=>item.permission==='write').length} {tr('write','写入')}<ProductIcon name="chevron" size={14}/></button>
      {connections.length ? <button type="button" className="appsCardManage" aria-haspopup="dialog" onClick={() => onOpen("accounts")}>{tr("Manage", "管理连接")}<ProductIcon name="chevron" size={14}/></button> : app.provider==='slack'?<button type="button" className="appsManagerPrimary" aria-haspopup="dialog" onClick={()=>onOpen('accounts')}>{tr('Set up Slack','设置 Slack')}</button>:app.configured ? <button type="button" className="appsManagerPrimary" disabled={busy} onClick={onConnect}><ProductIcon name="add" size={15}/>{tr("Connect", "连接账号")}</button> : <button type="button" className="appsCardManage" aria-haspopup="dialog" onClick={() => onOpen("tools")}>{tr("Explore", "查看详情")}<ProductIcon name="chevron" size={14}/></button>}
    </footer>
  </article>;
}

export function AppsManager({ request = requestJson, navigate = (url: string) => window.location.assign(url) }: {
  request?: AppsRequest; navigate?: (url: string) => void;
} = {}) {
  const { tr } = useI18n();
  const [snapshot, setSnapshot] = useState<AppsSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [betaProvider,setBetaProvider]=useState(()=>new URLSearchParams(window.location.search).get('apply')||'');
  const [consent,setConsent]=useState<{provider:string;permissions:Permission[];settings?:Record<string,string>;connectionId?:string}|null>(null);
  const closeBeta=useCallback(()=>setBetaProvider(''),[]),closeConsent=useCallback(()=>setConsent(null),[]);
  const [query, setQuery] = useState(() => new URLSearchParams(window.location.search).get("provider") || "");
  const [category, setCategory] = useState(() => new URLSearchParams(window.location.search).get("category") || "all");
  const [connectionView, setConnectionView] = useState<"all" | "available" | "connected">("all");
  const [details, setDetails] = useState<{ provider: string; tab: AppPanelTab } | null>(() => {const query=new URLSearchParams(location.search);return query.get("provider")==="slack"||query.has("slack_bot")||query.has("slack_error")||query.get("app_error")?.startsWith("slack_")?{provider:"slack",tab:"accounts"}:null;});
  const callbackFeedback=useRef(false);
  useEffect(()=>{if(loading||callbackFeedback.current)return;callbackFeedback.current=true;const query=new URLSearchParams(location.search),appError=query.get('app_error'),slackError=query.get('slack_error');if(appError==='slack_distribution_required'||slackError==='distribution_not_enabled')setError('slack_distribution_required');else if(slackError==='installation_failed')setError('slack_bot_installation_failed');else if(appError==='app_authorization_denied'||slackError)setError('app_authorization_denied');else if(query.get('slack_bot')==='installed')setNotice(tr('Remote Arc Bot was installed. Open Remote Arc in Slack Apps and send a message to link your account.','Remote Arc Bot 已安装。在 Slack 应用中打开 Remote Arc，发送消息以关联账号。'));},[loading,tr]);
  const closeDetails = useCallback(() => setDetails(null), []);
  const mounted = useRef(false);
  const revision = useRef(0);
  const mutationLock = useRef(false);
  const refresh = useCallback(async () => {
    const version = ++revision.current;
    setLoading(true); setError("");
    try {
      const data = await request("/api/apps") as AppsSnapshot;
      if (!data || typeof data.enabled !== "boolean" || !Array.isArray(data.apps) || !Array.isArray(data.connections)) throw new Error("app_service_unavailable");
      if (!mounted.current || version !== revision.current) return;
      setSnapshot(data);

    } catch (cause) { if (mounted.current && version === revision.current) setError(cause instanceof Error ? cause.message : "app_service_unavailable"); }
    finally { if (mounted.current && version === revision.current) setLoading(false); }
  }, [request]);
  useEffect(() => { mounted.current = true; void refresh(); return () => { mounted.current = false; revision.current++; }; }, [refresh]);
  async function mutate(key: string, action: () => Promise<unknown>, success: string, refreshOnFailure = false) {
    if (UI_PREVIEW || mutationLock.current) return false;
    mutationLock.current = true; setBusy(key); setError(""); setNotice("");
    try {
      await action();
      if (!mounted.current) return false;
      setNotice(success);
      await refresh();
      return true;
    } catch (cause) { if (refreshOnFailure && mounted.current) await refresh(); if (mounted.current) setError(cause instanceof Error ? cause.message : "app_service_unavailable"); return false; }
    finally { mutationLock.current = false; if (mounted.current) setBusy(""); }
  }
  function authorize(provider: string, permissions: Permission[], settings?: Record<string, string>) {
    const app=snapshot?.apps.find(value=>value.provider===provider);
    if(app?.requiresBetaApproval){setBetaProvider(provider);return;}
    if(app?.dataPolicy){setConsent({provider,permissions,settings});return;}
    authorizeNow(provider,permissions,settings);
  }
  function authorizeNow(provider:string,permissions:Permission[],settings?:Record<string,string>,dataConsent?:string){
    void mutate("authorize:" + provider, async () => {
      const result = await request("/api/apps/authorize", { method: "POST", body: JSON.stringify({ provider, permissions, settings,...(dataConsent?{dataConsent}:{}) }) }) as { authorizationUrl?: string };
      if (!result.authorizationUrl || !/^https:\/\//i.test(result.authorizationUrl)) throw new Error("app_service_unavailable");
      navigate(result.authorizationUrl);
    }, tr("Continue in the provider's authorization page.", "请在应用的授权页面继续。"));
  }
  function reviewData(connection:AppConnection){setConsent({provider:connection.provider,permissions:connection.permissions,connectionId:connection.id});}
  function acceptData(){
    if(!consent)return;const app=snapshot?.apps.find(value=>value.provider===consent.provider);if(!app?.dataPolicy)return;
    if(consent.connectionId){void mutate('consent:'+consent.connectionId,()=>request('/api/apps/connections/'+encodeURIComponent(consent.connectionId!)+'/data-consent',{method:'POST',body:JSON.stringify({dataConsent:app.dataPolicy!.version})}),tr('Google data access confirmed.','已确认 Google 数据授权。'));}
    else authorizeNow(consent.provider,consent.permissions,consent.settings,app.dataPolicy.version);
    setConsent(null);
  }
  function eraseData(connection:AppConnection){void mutate('erase:'+connection.id,()=>request('/api/apps/connections/'+encodeURIComponent(connection.id)+'/data-deletion',{method:'POST',body:JSON.stringify({confirm:true})}),tr('Saved call contents deleted. Chat, task and memory copies have separate controls.','已删除后台调用原文，对话、任务和记忆副本需分别删除。'));}
  function submitBeta(input:{googleEmail:string;providers:string[];useCase:string;betaTerms:true}){void mutate('google-beta',()=>request('/api/apps/google-beta',{method:'POST',body:JSON.stringify(input)}),tr('Beta application received.','已收到内测申请。'));}
  function connectCredential(provider: string, input: AppCredentialInput) {
    return mutate("connect:" + provider, () => request("/api/apps/connections", {method: "POST", body: JSON.stringify({provider, ...input})}), tr("Account validated and connected.", "账号已验证并连接。"));
  }
  function disconnect(connection: AppConnection) {
    void mutate("disconnect:" + connection.id, () => request("/api/apps/connections/" + encodeURIComponent(connection.id), { method: "DELETE" }), tr("The account was disconnected.", "账号已断开。"));
  }
  async function check(connection: AppConnection) {
    let result: AppConnectionCheck | undefined;
    const success = await mutate("check:" + connection.id, async () => {
      const checked = await request("/api/apps/connections/" + encodeURIComponent(connection.id) + "/check", { method: "POST", body: "{}" }) as AppConnectionCheck;
      if (checked.connectionId !== connection.id || checked.verification !== "provider_identity_checked") throw new Error("app_service_unavailable");
      result = checked;
    }, tr("Account access verified. Actual tool results still need to be checked in your workflow.", "账号访问已验证，具体工具结果仍需在实际工作中核对。"), true);
    return success ? result : undefined;
  }
  function openDetails(provider: string, tab: AppPanelTab) { setError(""); setNotice(""); setDetails({provider, tab}); }
  const connections = snapshot?.connections.filter(connection => connection.status !== "disconnected") ?? [];
  const connectedProviders = new Set(connections.map(connection => connection.provider));
  const featuredProviders = ["github", "slack", "gmail", "google_calendar", "google_drive", "notion", "linear", "vercel"];
  const featuredRank = (provider: string) => { const index = featuredProviders.indexOf(provider); return index < 0 ? featuredProviders.length : index; };
  const visibleApps = snapshot?.apps.filter(app =>
    (connectionView === "all" || (connectionView === "available" ? app.configured : connectedProviders.has(app.provider)))
    && (category === "all" || (app.category || directory.apps.find(item => item.provider === app.provider)?.category) === category)
    && (app.name + " " + app.provider + " " + app.operations.map(item=>item.name+" "+item.description).join(" ")).toLowerCase().includes(query.trim().toLowerCase())
  ).sort((a, b) => Number(connectedProviders.has(b.provider)) - Number(connectedProviders.has(a.provider)) || Number(b.configured) - Number(a.configured) || featuredRank(a.provider) - featuredRank(b.provider) || a.name.localeCompare(b.name)) || [];
  const selectedApp = snapshot?.enabled ? snapshot.apps.find(app => app.provider === details?.provider) : undefined;
  const availableCount = snapshot?.apps.filter(app => app.configured).length || 0;
  return <div className="appsManager">
    <header className="appsManagerHeader"><div><span className="eyebrow">{tr("YOUR AI'S TOOLKIT", "让 AI 开始工作")}</span><h1>{tr("Apps", "应用")}</h1><p>{tr("Your everyday apps. Ready to work with your AI.", "连接你每天使用的应用，让 AI 帮你完成工作。")}</p></div><button type="button" className="appsManagerRefresh" disabled={loading || Boolean(busy)} onClick={() => { setNotice(""); void refresh(); }}><ProductIcon name="refresh" size={16}/>{loading ? tr("Refreshing…", "刷新中…") : tr("Refresh", "刷新")}</button></header>
    {error && <div className="appsManagerMessage appsManagerError" role="alert"><p>{errorLabel(error, tr)}</p>{error === "unauthorized" && <a href="/auth/login?return_to=%2Fapps">{tr("Sign in", "登录")}</a>}<button type="button" onClick={() => setError("")}>{tr("Dismiss", "关闭")}</button></div>}
    {notice && <p className="appsManagerMessage" role="status">{notice}</p>}
    {snapshot?.googleBeta?.mode==='beta'&&<section className="appsBetaBanner"><strong>Google Apps <span className="appsBetaBadge">Beta</span></strong><p>{tr('By invitation. Apply once, then connect after approval. Google authorization normally expires after 7 days.','申请获邀后即可连接。Google 授权通常在 7 天后需重新连接。')}</p><button type="button" onClick={()=>setBetaProvider('gmail')}>{snapshot.googleBeta.request?tr('View application','查看申请'):tr('Apply to join','申请加入')}</button></section>}
    {loading && !snapshot && <WorkspaceLoading label={tr("Loading app connections…", "正在加载应用连接…")} variant="rows"/>}
    {snapshot && !snapshot.enabled && <section className="appsManagerDisabled"><h2>{tr("Apps are not enabled yet", "应用连接尚未启用")}</h2><p>{tr("An administrator needs to enable Apps and configure the providers before you can connect accounts. Your existing device and AI connections are unchanged.", "管理员启用 Apps 并配置应用授权后，你即可连接账号。现有设备和 AI 连接仍可继续使用。")}</p></section>}
    {snapshot?.enabled && <>
      <div className="appsManagerFilters">
        <div className="appsManagerViewTabs" role="group" aria-label={tr("Connection filter", "连接筛选")}>
          <button type="button" aria-pressed={connectionView === "all"} onClick={() => setConnectionView("all")}>{tr("All apps", "全部应用")} <span>{snapshot.apps.length}</span></button>
          <button type="button" aria-pressed={connectionView === "available"} onClick={() => setConnectionView("available")}>{tr("Available", "可连接")} <span>{availableCount}</span></button>
          <button type="button" aria-pressed={connectionView === "connected"} onClick={() => setConnectionView("connected")}>{tr("Connected", "已连接")} <span>{connectedProviders.size}</span></button>
        </div>
        <label className="appsSearchField">
          <span className="appsSrOnly">{tr("Search apps", "搜索应用")}</span>
          <span className="appsSearchIcon"><ProductIcon name="search" size={17}/></span>
          <input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder={tr("Search apps…", "搜索应用…")} />
        </label>
        <div className="appsManagerCategories" role="group" aria-label={tr("App categories", "应用分类")}>
          <button type="button" aria-pressed={category === "all"} onClick={() => setCategory("all")}>{tr("All categories", "全部分类")}</button>
          {directory.categories.map(item => <button type="button" key={item.id} aria-pressed={category === item.id} onClick={() => setCategory(item.id)}>{tr(item.name, item.nameZh)}</button>)}
        </div>
      </div>
      <section className="appsManagerGrid" aria-label={tr("Available apps", "可用应用")}>
        {visibleApps.map(app => <CatalogCard key={app.provider} app={app} connections={connections.filter(connection => connection.provider === app.provider)} busy={Boolean(busy) || UI_PREVIEW} onOpen={tab => openDetails(app.provider, tab)} onConnect={() => app.auth === "api_key" || app.provider === "shopify" ? openDetails(app.provider, "accounts") : authorize(app.provider, connectedPermissions)}/>)}
      </section>
      {!!snapshot.apps.length && !visibleApps.length && <div className="appsManagerEmpty"><ProductIcon name="search" size={24}/><h2>{tr("No matching apps", "没有匹配的应用")}</h2><p>{tr("Try another keyword or reset your filters.", "试试其他关键词，或重置筛选条件。")}</p><button type="button" onClick={() => { setQuery(""); setCategory("all"); setConnectionView("all"); }}>{tr("Reset filters", "重置筛选")}</button></div>}
      {!snapshot.apps.length && <p className="appsManagerEmpty">{tr("No app providers are available yet.", "目前还没有可用的应用服务。")}</p>}

    </>}
    {selectedApp && details && <AppDetailsPanel key={selectedApp.provider} app={selectedApp} connections={(snapshot?.connections||[]).filter(connection => connection.provider === selectedApp.provider)} initialTab={details.tab} onClose={closeDetails} busy={Boolean(busy) || UI_PREVIEW} error={error} notice={notice} onAuthorize={authorize} onCredential={connectCredential} onDisconnect={disconnect} onCheck={check} onConsent={reviewData} onErase={eraseData}/>}
    {betaProvider&&snapshot?.googleBeta&&<GoogleBetaApplication apps={snapshot.apps.filter(app=>app.dataPolicy&&app.configured)} initialProvider={betaProvider} state={snapshot.googleBeta} busy={Boolean(busy)} error={error?errorLabel(error,tr):''} onSubmit={submitBeta} onClose={closeBeta}/>}
    {consent&&<GoogleConsentDialog provider={consent.provider} name={snapshot?.apps.find(app=>app.provider===consent.provider)?.name||consent.provider} busy={Boolean(busy)} onAccept={acceptData} onClose={closeConsent}/>}
  </div>;
}
