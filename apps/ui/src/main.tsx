import { startProductEvents } from './product-events.js';
import { useCaseSlugs } from '../../../packages/docs/src/arc-use-cases.js';
import { RunnerView } from "./runner-view.js";
import './arc-composer.css';
import './arc-references.css';
import './scrollbars.css';
import { WorkspaceLoading } from './workspace-loading.js';
import "./landing-content.js";
import "./install-commands.js";
import "./home-connection-scene.js";
import "./apps-manager.js";
import "./agent-use-cases.js";
import "./arc-workspace.js";
import "./connect-tasks.js";
import "./workspace-picker.js";
import { DASHBOARD_PATHS, LEGACY_DASHBOARD_PATHS } from "./dashboard-workspaces.js";
import "./dashboard-workspaces.css";
import "./arc-future.js";
import "./arc-roadmap.js";
import "./client-setup-guides.js";
import type { UseCaseSlug } from "./use-cases.js";
import "./dashboard-task-view.js";
import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { I18nProvider, useI18n } from "./i18n.js";
import { baseMarketingPath, chinesePages, isWebsite } from "./marketing-paths.js";
import "./dashboard-settings.js";
import "./admin-operations.js";
import "./usage-conversion.js";
import { AdminConsole } from "./admin/admin-console.js";
import { registerProductPwa } from './product-pwa.js';
import { EngagementPage } from "./public-engagement.js";
import "./trust-pages.js";
import { ThemeProvider } from "./theme.js";
import { UI_PREVIEW, installUiPreviewFetchMock } from "./preview.js";
import "./security-authorizations.js";
import "./styles.css";
import "./dashboard.css";
import "./laptop-hero.css";
import "./workspace-design.css";
import "./marketing-design.css";
import "./device-fleet-design.css";
import "./product-typography.css";
import "./arc-product-polish.css";
import "./brand-wordmark.css";
import "./experience-refresh.css";
import "./connect-guide.css";
import "./pairing.css";
import "./security-center.css";
import { MCP_ENDPOINT } from "./app-config.js";
import { type Device, type ProductStatus, type User } from "./app-types.js";
import { CenteredCard, PublicLayout } from "./public-layout.js";
import { DashboardAccess, OAuthConsent } from "./auth-pages.js";
import { PairDevice } from "./pair-device.js";
import { ClientInstallPage, type InstallClientSlug } from "./client-install-page.js";
import { ArcPage, ChatGptComputerAccessPage, ClaudeComputerAccessPage, ConnectPage, DemoPage, DocsPage, Landing, LegalPage, McpComputerAccessPage, McpPage, NotFoundPage, PricingPage, ResourcesRedirect, RoadmapPage, SecurityModelPage, UseCaseDetailPage, UseCasesPage } from "./marketing-pages.js";
import { ReleasesPage } from "./releases-page.js";
import { IntentDrivenComputingArticlePage } from "./intent-driven-article.js";
import { ArchitectureArticlePage, BlogArticlePage, BlogsPage, GoVsTypescriptBenchmarkArticlePage, PowerfulAccessArticlePage, RemoteArcVsOpenClawArticlePage } from "./blog-pages.js";
import { Dashboard } from "./dashboard.js";

const ArcCheckout = React.lazy(() => import('./arc-checkout.js').then(module=>({default:module.ArcCheckout})));
const DocsPortal = React.lazy(() => import("./docs-portal.js").then(module => ({ default: module.DocsPortal })));
const IntegrationsPage = React.lazy(() => import("./integrations-page.js").then(module => ({ default: module.IntegrationsPage })));
const NativeInstall = React.lazy(() => import("./native-install.js").then(module => ({ default: module.NativeInstall })));
const ChromeExtensionPage = React.lazy(() => import("./chrome-extension-page.js").then(module => ({ default: module.ChromeExtensionPage })));
const RemoteMcpGuide = React.lazy(() => import("./remote-mcp-guide.js").then(module => ({ default: module.RemoteMcpGuide })));
const LongRunningWorkDocs = React.lazy(() => import("./long-running-docs.js").then((module) => ({ default: module.LongRunningWorkDocs })));
installUiPreviewFetchMock(MCP_ENDPOINT);
function App() {
  const { tr } = useI18n();
  const pathname = location.pathname.replace(/\/+$/, "") || "/";
  const routePath = isWebsite() && chinesePages.has(baseMarketingPath(pathname)) ? baseMarketingPath(pathname) : pathname;
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [devices, setDevices] = useState<Device[]>([]);
  const [status, setStatus] = useState<ProductStatus | null>(null);

  async function loadMe(background = false) {
    try {
      const response = await fetch("/api/me", { headers: { accept: "application/json" } });
      if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) {
        if (!background || response.status === 401) setUser(null);
        return;
      }
      const payload = (await response.json()) as { user: User };
      setUser(previous => background && previous?.id !== payload.user?.id ? null : payload.user);
    } catch {
      if (!background) setUser(null);
    }
  }

  async function loadAll() {
    try {
      const response = await fetch("/api/status");
      if (!response.ok) return;
      const payload = (await response.json()) as ProductStatus;
      setDevices(payload.devices);
      setStatus(payload);
    } catch {
      // Keep the last known dashboard state during a temporary network interruption.
    }
  }

  async function signOut() {
    const response = await fetch("/auth/logout", { method: "POST" });
    if (!response.ok && response.status !== 401) throw new Error('sign_out_unconfirmed');
    setUser(null); setDevices([]); setStatus(null);
  }

  useEffect(() => { void loadMe(); }, []);
  useEffect(() => {
    void registerProductPwa(UI_PREVIEW);
  }, []);
  useEffect(() => {
    if (!user || location.hostname === "admin.remotearc.app") return;
    const refreshIfVisible = () => {
      if (document.visibilityState === "visible") { void loadAll(); void loadMe(true); }
    };
    void loadAll();
    const timer = window.setInterval(refreshIfVisible, 60_000);
    window.addEventListener("focus", refreshIfVisible);
    document.addEventListener("visibilitychange", refreshIfVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshIfVisible);
      document.removeEventListener("visibilitychange", refreshIfVisible);
    };
  }, [user?.id]);

  const isAdminHost = location.hostname === "admin.remotearc.app";
  if (isAdminHost || (UI_PREVIEW && routePath === "/admin-preview")) {
    if (UI_PREVIEW) return <AdminConsole preview />;
    if (user === undefined) return <CenteredCard title={tr("Loading admin workspace…","加载运营后台…")} body={tr("Checking permissions.","验证访问权限。")} />;
    if (!user) return <CenteredCard title={tr("Admin sign-in required","请先登录管理员账号")} body={tr("Sign in on agent.remotearc.app and return here.","请先在 agent.remotearc.app 登录，再返回此页面。")} />;
    if (!user.isAdmin) return <CenteredCard title={tr("Access restricted","访问受限")} body={tr("This area is for authorized Remote Arc administrators.","该页面仅对 Remote Arc 授权管理员开放。")} />;
    return <AdminConsole />;
  }
  const isAppHost = location.hostname === "agent.remotearc.app";
  const isDashboardHost = isAppHost || UI_PREVIEW;
  if(routePath==='/checkout'&&isDashboardHost){
    if(user===undefined)return <CenteredCard title={tr('Secure checkout','安全支付')} body={tr('Checking your account.','正在核对账户。')}><WorkspaceLoading label={tr('Loading your account…','正在加载账户…')} variant="compact"/></CenteredCard>;
    if(!user)return <DashboardAccess/>;
    return <React.Suspense fallback={<CenteredCard title={tr('Secure checkout','安全支付')} body={tr('Preparing your offers.','正在准备可用套餐。')}><WorkspaceLoading label={tr('Loading your offers…','正在读取可用套餐…')} variant="cards"/></CenteredCard>}><ArcCheckout email={user.email}/></React.Suspense>;
  }
  if (isAppHost && routePath === "/") {
    history.replaceState({}, "", "/overview");
  }

  if (routePath === "/device") return <PairDevice user={user} onSignedIn={loadMe} />;
  if (routePath === "/oauth/consent") return <OAuthConsent user={user} />;

  if (routePath === "/install") {
    location.replace("/install/chatgpt");
    return <CenteredCard title={tr("Opening installation…", "正在打开安装页…")} body={tr("Redirecting to the ChatGPT installation guide.", "正在跳转到 ChatGPT 安装指南。")} />;
  }

  const installMatch = routePath.match(/^\/install\/(chatgpt|claude|gemini|cursor)$/);
  if (installMatch) {
    return (
      <ClientInstallPage
        slug={installMatch[1] as InstallClientSlug}
        user={user === undefined ? null : user}
      />
    );
  }

  if (routePath === "/demo") return <DemoPage user={user === undefined ? null : user} />;
  if (routePath === "/connect-ai") return <ConnectPage user={user === undefined ? null : user} />;
  if (routePath === "/docs/long-running-work") return <PublicLayout user={user === undefined ? null : user}><React.Suspense fallback={<main className="technicalDoc"><WorkspaceLoading label={tr("Loading documentation…", "正在加载文档…")}/></main>}><LongRunningWorkDocs /></React.Suspense></PublicLayout>;
  if (routePath === "/docs" && window.location.hash.startsWith("#docs-")) return <DocsPage user={user === undefined ? null : user} />;
  if (routePath === "/docs" || (routePath.startsWith("/docs/") && routePath !== "/docs/mcp")) return <PublicLayout user={user === undefined ? null : user}><React.Suspense fallback={<main className="technicalDoc"><WorkspaceLoading label={tr("Loading documentation…", "正在加载文档…")}/></main>}><DocsPortal path={routePath}/></React.Suspense></PublicLayout>;
  if (routePath === "/security-model") return <SecurityModelPage user={user === undefined ? null : user} />;
  if (routePath === "/use-cases") return <UseCasesPage user={user === undefined ? null : user} />;
  const useCaseMatch = routePath.match(/^\/use-cases\/([a-z0-9-]+)$/);
  if (useCaseMatch && useCaseSlugs.includes(useCaseMatch[1] as UseCaseSlug)) {
    return <UseCaseDetailPage slug={useCaseMatch[1] as UseCaseSlug} user={user === undefined ? null : user} />;
  }
  if (routePath === "/chatgpt-computer-access") return <ChatGptComputerAccessPage user={user === undefined ? null : user} />;
  if (routePath === "/claude-computer-access") return <ClaudeComputerAccessPage user={user === undefined ? null : user} />;
  if (routePath === "/mcp-computer-access") return <McpComputerAccessPage user={user === undefined ? null : user} />;
  if (routePath === "/integrations") return <PublicLayout user={user === undefined ? null : user}><React.Suspense fallback={<main className="technicalDoc"><WorkspaceLoading label={tr("Loading integrations…", "正在加载应用目录…")}/></main>}><IntegrationsPage /></React.Suspense></PublicLayout>;
  if (routePath === "/pricing") return <PricingPage user={user === undefined ? null : user} />;
  if (routePath === "/early-access") return <PublicLayout user={user === undefined ? null : user}><EngagementPage category="early_access" /></PublicLayout>;
  if (routePath === "/feedback") return <PublicLayout user={user === undefined ? null : user}><EngagementPage category="feedback" /></PublicLayout>;
  if (routePath === "/arc") return <ArcPage user={user === undefined ? null : user} />;
  if (routePath === "/roadmap") return <RoadmapPage user={user === undefined ? null : user} />;
  if (routePath === "/downloads") return <PublicLayout user={user === undefined ? null : user}><main className="technicalDoc"><React.Suspense fallback={<WorkspaceLoading label={tr("Loading downloads…", "正在加载下载页面…")} variant="rows"/>}><NativeInstall /></React.Suspense></main></PublicLayout>;
  if (routePath === "/releases") return <ReleasesPage user={user === undefined ? null : user} />;
  if (routePath === "/blogs/from-code-to-intent-driven-computing") return <IntentDrivenComputingArticlePage user={user === undefined ? null : user} />;
  if (routePath === "/blogs") return <BlogsPage user={user === undefined ? null : user} />;
  if (routePath === "/blogs/go-vs-typescript-agent-benchmarks") return <GoVsTypescriptBenchmarkArticlePage user={user === undefined ? null : user} />;
  if (routePath === "/blogs/why-i-built-remote-arc") return <BlogArticlePage user={user === undefined ? null : user} />;
  if (routePath === "/blogs/remote-arc-vs-openclaw") return <RemoteArcVsOpenClawArticlePage user={user === undefined ? null : user} />;
  if (routePath === "/blogs/powerful-ai-access-without-exposing-your-computer") return <PowerfulAccessArticlePage user={user === undefined ? null : user} />;
  if (routePath === "/blogs/how-remote-arc-works") return <ArchitectureArticlePage user={user === undefined ? null : user} />;
  if (routePath === "/resources") return <ResourcesRedirect />;
  if (routePath === "/remote-mcp") return <PublicLayout user={user === undefined ? null : user}><React.Suspense fallback={<main className="technicalDoc"><WorkspaceLoading label={tr("Loading guide…", "正在加载指南…")}/></main>}><RemoteMcpGuide /></React.Suspense></PublicLayout>;
  if (routePath === "/chrome-extension") return <PublicLayout user={user === undefined ? null : user}><React.Suspense fallback={<main className="chromeExtensionPage"><WorkspaceLoading label={tr("Loading Chrome extension…", "正在加载 Chrome 扩展页面…")}/></main>}><ChromeExtensionPage /></React.Suspense></PublicLayout>;
  if (routePath === "/docs/mcp") return <McpPage user={user === undefined ? null : user} />;
  if (routePath === "/privacy") return <LegalPage kind="privacy" user={user === undefined ? null : user} />;
  if (routePath === "/terms") return <LegalPage kind="terms" user={user === undefined ? null : user} />;
  if (routePath === "/support") return <LegalPage kind="support" user={user === undefined ? null : user} />;

  const runnerRoute = routePath.match(/^\/dashboard\/browser\/([A-Za-z0-9_-]+)\/([A-Za-z0-9_-]{1,100})$/);
  if (isDashboardHost && runnerRoute) {
    if (user === undefined) return <CenteredCard title={tr("Loading…", "加载中…")} body={tr("Connecting to Remote Arc.", "正在连接 Remote Arc。")} />;
    if (!user) return <DashboardAccess/>;
    return <RunnerView deviceId={runnerRoute[1]!} sessionId={runnerRoute[2]!} preview={UI_PREVIEW}/>;
  }
  if (isDashboardHost && (routePath === "/dashboard" || Object.values(DASHBOARD_PATHS).includes(routePath) || Object.hasOwn(LEGACY_DASHBOARD_PATHS, routePath))) {
    if (user === undefined) {
      return <CenteredCard title={tr("Loading…", "加载中…")} body={tr("Connecting to Remote Arc.", "正在连接 Remote Arc。")} />;
    }
    if (!user) return <DashboardAccess />;
    if (routePath === "/monitor" && !user.isAdmin) {
      return <CenteredCard title={tr("Admin only", "仅管理员可访问")} body={tr("Service monitoring is restricted to Remote Arc administrators.", "服务监控仅限 Remote Arc 管理员访问。")} />;
    }
    return <Dashboard user={user} devices={devices} status={status} refreshAll={loadAll} signOut={signOut} />;
  }

  if (routePath !== "/") return <NotFoundPage user={user === undefined ? null : user} />;
  return <Landing user={user === undefined ? null : user} />;
}
startProductEvents();
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ThemeProvider>
      <I18nProvider><App /></I18nProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
