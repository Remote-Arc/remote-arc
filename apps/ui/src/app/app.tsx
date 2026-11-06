import { useCaseSlugs } from "../../../../packages/docs/src/arc-use-cases.js";
import { RunnerView } from "../features/browser-runner/runner-view.js";
import { WorkspaceLoading } from "../components/workspace-loading.js";
import { DASHBOARD_PATHS, LEGACY_DASHBOARD_PATHS } from "../lib/dashboard-workspaces.js";
import type { UseCaseSlug } from "../features/marketing/use-cases/use-cases.js";
import React, { useEffect } from "react";
import { useI18n, useMessages } from "../hooks/use-i18n.js";
import { useAppSession } from "../hooks/use-app-session.js";
import { usePermission } from "../hooks/use-permission.js";
import { baseMarketingPath, chinesePages, isWebsite } from "../lib/marketing-paths.js";
import { AdminConsole } from "../features/admin/admin-console.js";
import { registerProductPwa } from "./product-pwa.js";
import { EngagementPage } from "../features/marketing/public-engagement.js";
import { UI_PREVIEW } from "../preview/preview-mode.js";
import { CenteredCard, PublicLayout } from "../components/public-layout.js";
import { DashboardAccess, OAuthConsent } from "../features/auth/auth-pages.js";
import { PairDevice } from "../features/auth/pair-device.js";
import {
  ClientInstallPage,
  type InstallClientSlug,
} from "../features/install/client-install-page.js";
import {
  ArcPage,
  ChatGptComputerAccessPage,
  ClaudeComputerAccessPage,
  ConnectPage,
  DemoPage,
  DocsPage,
  Landing,
  LegalPage,
  McpComputerAccessPage,
  McpPage,
  NotFoundPage,
  PricingPage,
  ResourcesRedirect,
  RoadmapPage,
  SecurityModelPage,
  UseCaseDetailPage,
  UseCasesPage,
} from "../features/marketing/marketing-pages.js";
import { ReleasesPage } from "../features/marketing/releases-page.js";
import { IntentDrivenComputingArticlePage } from "../features/blog/intent-driven-article.js";
import {
  ArchitectureArticlePage,
  BlogArticlePage,
  BlogsPage,
  GoVsTypescriptBenchmarkArticlePage,
  PowerfulAccessArticlePage,
  RemoteArcVsOpenClawArticlePage,
} from "../features/blog/blog-pages.js";
import { Dashboard } from "../features/dashboard/dashboard.js";

const SecretEntry = React.lazy(() =>
  import("../features/secrets/secret-entry.js").then((module) => ({ default: module.SecretEntry })),
);

const ArcCheckout = React.lazy(() =>
  import("../features/billing/arc-checkout.js").then((module) => ({ default: module.ArcCheckout })),
);

const DocsPortal = React.lazy(() =>
  import("../features/docs/docs-portal.js").then((module) => ({ default: module.DocsPortal })),
);

const IntegrationsPage = React.lazy(() =>
  import("../features/marketing/integrations-page.js").then((module) => ({
    default: module.IntegrationsPage,
  })),
);

const NativeInstall = React.lazy(() =>
  import("../features/install/native-install.js").then((module) => ({
    default: module.NativeInstall,
  })),
);

const ChromeExtensionPage = React.lazy(() =>
  import("../features/install/chrome-extension-page.js").then((module) => ({
    default: module.ChromeExtensionPage,
  })),
);

const RemoteMcpGuide = React.lazy(() =>
  import("../features/marketing/remote-mcp-guide.js").then((module) => ({
    default: module.RemoteMcpGuide,
  })),
);

const LongRunningWorkDocs = React.lazy(() =>
  import("../features/docs/long-running-docs.js").then((module) => ({
    default: module.LongRunningWorkDocs,
  })),
);

export function App() {
  const { tr } = useI18n();
  const pathname = location.pathname.replace(/\/+$/, "") || "/";
  const routePath =
    isWebsite() && chinesePages.has(baseMarketingPath(pathname))
      ? baseMarketingPath(pathname)
      : pathname;
  const isAdminHost = location.hostname === "admin.remotearc.app";
  const { user, devices, status, loadMe, loadAll, signOut } = useAppSession(isAdminHost);
  const access = useMessages("access");
  const { can } = usePermission(user);

  useEffect(() => {
    void registerProductPwa(UI_PREVIEW);
  }, []);

  if (isAdminHost || (UI_PREVIEW && routePath === "/admin-preview")) {
    if (UI_PREVIEW) return <AdminConsole preview />;
    if (user === undefined)
      return <CenteredCard title={access.checkingTitle} body={access.checkingBody} />;
    if (!user) return <CenteredCard title={access.signInTitle} body={access.signInBody} />;
    if (!can("admin:access"))
      return <CenteredCard title={access.deniedTitle} body={access.deniedBody} />;
    return <AdminConsole />;
  }
  const isAppHost = location.hostname === "agent.remotearc.app";
  const isDashboardHost = isAppHost || UI_PREVIEW;
  if (routePath === "/checkout" && isDashboardHost) {
    if (user === undefined)
      return (
        <CenteredCard title={tr("app.app.secureCheckout")} body={tr("app.app.checkingYourAccount")}>
          <WorkspaceLoading label={tr("app.app.loadingYourAccount")} variant="compact" />
        </CenteredCard>
      );
    if (!user) return <DashboardAccess />;
    return (
      <React.Suspense
        fallback={
          <CenteredCard
            title={tr("app.app.secureCheckout")}
            body={tr("app.app.preparingYourOffers")}
          >
            <WorkspaceLoading label={tr("app.app.loadingYourOffers")} variant="cards" />
          </CenteredCard>
        }
      >
        <ArcCheckout email={user.email} />
      </React.Suspense>
    );
  }
  const secretMatch = routePath.match(/^\/secret\/(sec_[a-z2-7]{24})$/);
  if (secretMatch && isDashboardHost) {
    if (user === undefined)
      return (
        <CenteredCard
          title={tr("app.app.loadingRequest")}
          body={tr("app.app.checkingYourAccount")}
        />
      );
    if (!user) return <DashboardAccess />;
    return (
      <React.Suspense fallback={<CenteredCard title={tr("app.app.loadingRequest")} body="" />}>
        <SecretEntry handle={secretMatch[1]!} />
      </React.Suspense>
    );
  }
  if (routePath === "/device") return <PairDevice user={user} onSignedIn={loadMe} />;
  if (routePath === "/oauth/consent") return <OAuthConsent user={user} />;

  if (routePath === "/install") {
    location.replace("/install/chatgpt");
    return (
      <CenteredCard
        title={tr("app.app.openingInstallation")}
        body={tr("app.app.redirectingToTheChatgptInstallationGuide")}
      />
    );
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
  if (routePath === "/docs/long-running-work")
    return (
      <PublicLayout user={user === undefined ? null : user}>
        <React.Suspense
          fallback={
            <main className="technicalDoc">
              <WorkspaceLoading label={tr("app.app.loadingDocumentation")} />
            </main>
          }
        >
          <LongRunningWorkDocs />
        </React.Suspense>
      </PublicLayout>
    );
  if (routePath === "/docs" && window.location.hash.startsWith("#docs-"))
    return <DocsPage user={user === undefined ? null : user} />;
  if (routePath === "/docs" || (routePath.startsWith("/docs/") && routePath !== "/docs/mcp"))
    return (
      <PublicLayout user={user === undefined ? null : user}>
        <React.Suspense
          fallback={
            <main className="technicalDoc">
              <WorkspaceLoading label={tr("app.app.loadingDocumentation")} />
            </main>
          }
        >
          <DocsPortal path={routePath} />
        </React.Suspense>
      </PublicLayout>
    );
  if (routePath === "/security-model")
    return <SecurityModelPage user={user === undefined ? null : user} />;
  if (routePath === "/use-cases") return <UseCasesPage user={user === undefined ? null : user} />;
  const useCaseMatch = routePath.match(/^\/use-cases\/([a-z0-9-]+)$/);
  if (useCaseMatch && useCaseSlugs.includes(useCaseMatch[1] as UseCaseSlug)) {
    return (
      <UseCaseDetailPage
        slug={useCaseMatch[1] as UseCaseSlug}
        user={user === undefined ? null : user}
      />
    );
  }
  if (routePath === "/chatgpt-computer-access")
    return <ChatGptComputerAccessPage user={user === undefined ? null : user} />;
  if (routePath === "/claude-computer-access")
    return <ClaudeComputerAccessPage user={user === undefined ? null : user} />;
  if (routePath === "/mcp-computer-access")
    return <McpComputerAccessPage user={user === undefined ? null : user} />;
  if (routePath === "/integrations")
    return (
      <PublicLayout user={user === undefined ? null : user}>
        <React.Suspense
          fallback={
            <main className="technicalDoc">
              <WorkspaceLoading label={tr("app.app.loadingIntegrations")} />
            </main>
          }
        >
          <IntegrationsPage />
        </React.Suspense>
      </PublicLayout>
    );
  if (routePath === "/pricing") return <PricingPage user={user === undefined ? null : user} />;
  if (routePath === "/early-access")
    return (
      <PublicLayout user={user === undefined ? null : user}>
        <EngagementPage category="early_access" />
      </PublicLayout>
    );
  if (routePath === "/feedback")
    return (
      <PublicLayout user={user === undefined ? null : user}>
        <EngagementPage category="feedback" />
      </PublicLayout>
    );
  if (routePath === "/arc") return <ArcPage user={user === undefined ? null : user} />;
  if (routePath === "/roadmap") return <RoadmapPage user={user === undefined ? null : user} />;
  if (routePath === "/downloads")
    return (
      <PublicLayout user={user === undefined ? null : user}>
        <main className="technicalDoc">
          <React.Suspense
            fallback={<WorkspaceLoading label={tr("app.app.loadingDownloads")} variant="rows" />}
          >
            <NativeInstall />
          </React.Suspense>
        </main>
      </PublicLayout>
    );
  if (routePath === "/releases") return <ReleasesPage user={user === undefined ? null : user} />;
  if (routePath === "/blogs/from-code-to-intent-driven-computing")
    return <IntentDrivenComputingArticlePage user={user === undefined ? null : user} />;
  if (routePath === "/blogs") return <BlogsPage user={user === undefined ? null : user} />;
  if (routePath === "/blogs/go-vs-typescript-agent-benchmarks")
    return <GoVsTypescriptBenchmarkArticlePage user={user === undefined ? null : user} />;
  if (routePath === "/blogs/why-i-built-remote-arc")
    return <BlogArticlePage user={user === undefined ? null : user} />;
  if (routePath === "/blogs/remote-arc-vs-openclaw")
    return <RemoteArcVsOpenClawArticlePage user={user === undefined ? null : user} />;
  if (routePath === "/blogs/powerful-ai-access-without-exposing-your-computer")
    return <PowerfulAccessArticlePage user={user === undefined ? null : user} />;
  if (routePath === "/blogs/how-remote-arc-works")
    return <ArchitectureArticlePage user={user === undefined ? null : user} />;
  if (routePath === "/resources") return <ResourcesRedirect />;
  if (routePath === "/remote-mcp")
    return (
      <PublicLayout user={user === undefined ? null : user}>
        <React.Suspense
          fallback={
            <main className="technicalDoc">
              <WorkspaceLoading label={tr("app.app.loadingGuide")} />
            </main>
          }
        >
          <RemoteMcpGuide />
        </React.Suspense>
      </PublicLayout>
    );
  if (routePath === "/chrome-extension")
    return (
      <PublicLayout user={user === undefined ? null : user}>
        <React.Suspense
          fallback={
            <main className="chromeExtensionPage">
              <WorkspaceLoading label={tr("app.app.loadingChromeExtension")} />
            </main>
          }
        >
          <ChromeExtensionPage />
        </React.Suspense>
      </PublicLayout>
    );
  if (routePath === "/docs/mcp") return <McpPage user={user === undefined ? null : user} />;
  if (routePath === "/privacy")
    return <LegalPage kind="privacy" user={user === undefined ? null : user} />;
  if (routePath === "/terms")
    return <LegalPage kind="terms" user={user === undefined ? null : user} />;
  if (routePath === "/support")
    return <LegalPage kind="support" user={user === undefined ? null : user} />;

  const runnerRoute = routePath.match(
    /^\/dashboard\/browser\/([A-Za-z0-9_-]+)\/([A-Za-z0-9_-]{1,100})$/,
  );
  if (isDashboardHost && runnerRoute) {
    if (user === undefined)
      return (
        <CenteredCard title={tr("app.app.loading")} body={tr("app.app.connectingToRemoteArc")} />
      );
    if (!user) return <DashboardAccess />;
    return (
      <RunnerView deviceId={runnerRoute[1]!} sessionId={runnerRoute[2]!} preview={UI_PREVIEW} />
    );
  }
  if (
    isDashboardHost &&
    (routePath === "/dashboard" ||
      Object.values(DASHBOARD_PATHS).includes(routePath) ||
      Object.hasOwn(LEGACY_DASHBOARD_PATHS, routePath))
  ) {
    if (user === undefined) {
      return (
        <CenteredCard title={tr("app.app.loading")} body={tr("app.app.connectingToRemoteArc")} />
      );
    }
    if (!user) return <DashboardAccess />;
    return (
      <Dashboard
        user={user}
        devices={devices}
        status={status}
        refreshAll={loadAll}
        signOut={signOut}
      />
    );
  }

  if (routePath !== "/") return <NotFoundPage user={user === undefined ? null : user} />;
  return <Landing user={user === undefined ? null : user} />;
}
