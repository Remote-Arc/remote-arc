import React from "react";
import { useMessages } from "../../hooks/use-i18n.js";
import { useRunnerAttention } from "../../hooks/use-runner-attention.js";
import { WorkspaceLoading } from "../../components/workspace-loading.js";
import { AppsManager } from "../apps/apps-manager.js";
import { ArcWorkWorkspace } from "../arc/workspace/arc-workspace.js";
import { ConnectTasks } from "../tasks/connect-tasks.js";
import { ConnectTasksErrorBoundary } from "../tasks/connect-tasks-error-boundary.js";
import { ProductIcon, type ProductIconName } from "../../components/product-icon.js";
import { WorkspacePicker } from "./workspace-picker.js";
import { type DashboardTab } from "../../lib/dashboard-workspaces.js";
import {
  useDashboardModel,
  type DashboardProps,
} from "../../hooks/dashboard/use-dashboard-model.js";
import { OverviewView } from "./views/overview-view.js";
import { DevicesView } from "./views/devices-view.js";
import { ConnectView } from "./views/connect-view.js";
import { SecurityView } from "./views/security-view.js";
import { SettingsView } from "./views/settings-view.js";
import { DashboardDialogHost, DirectoryPickerDialog } from "./views/dashboard-overlays.js";
import { AddDeviceDialog } from "./views/add-device-dialog.js";
import { UI_PREVIEW } from "../../preview/preview-mode.js";
import { MARKETING_ORIGIN } from "../../config/app-config.js";
import { Brand, ThemeSwitcher } from "../../components/public-layout.js";

const ArcNativeChat = React.lazy(() =>
  import("../arc/chat/arc-native-chat.js").then((module) => ({ default: module.ArcNativeChat })),
);
const ArcTeammates = React.lazy(() =>
  import("../arc/teams/arc-teams-page.js").then((module) => ({ default: module.ArcTeamsPage })),
);
const ArcSkills = React.lazy(() =>
  import("../arc/skills/arc-skills.js").then((module) => ({ default: module.ArcSkills })),
);
function DashboardNavIcon({ tab }: { tab: DashboardTab }) {
  const names: Partial<Record<DashboardTab, ProductIconName>> = {
    overview: "overview",
    devices: "device",
    "agent-devices": "device",
    apps: "apps",
    "agent-apps": "apps",
    connect: "link",
    security: "shield",
    "agent-chat": "chat",
    "agent-goals": "tasks",
    "agent-routines": "routine",
    "agent-skills": "spark",
    "agent-activity": "activity",
    automations: "tasks",
  };
  return <ProductIcon name={names[tab] || "settings"} />;
}
export function Dashboard(props: DashboardProps) {
  const m = useDashboardModel(props);
  const labels = useMessages("dashboard");
  const {
    active,
    arcAvailable,
    arcEntry,
    arcNavigationOpen,
    can,
    devices,
    dialog,
    directoryPicker,
    mobileNavItems,
    navItems,
    navigateTab,
    openArcChat,
    setArcNavigationOpen,
    showAdd,
    sidebarCollapsed,
    signOutSafely,
    toggleSidebar,
    tr,
    user,
    workspace,
  } = m;
  const onDevices = active === "devices" || active === "agent-devices";
  const browserAttention = useRunnerAttention({ enabled: onDevices || active === "security" });
  const browserTaskCount =
    browserAttention.rows?.filter((row) => row.availability !== "unavailable").length ?? 0;
  const renderWorkspacePicker = (mobile = false) => (
    <WorkspacePicker
      workspace={workspace}
      arcAvailable={arcAvailable}
      mobile={mobile}
      tr={tr}
      onNavigate={navigateTab}
    />
  );

  return (
    <div
      className="appFrame"
      data-active-tab={active}
      data-workspace={workspace}
      data-sidebar-collapsed={sidebarCollapsed}
    >
      <aside className="sidebar">
        <div className="sidebarBrand">
          <Brand />
          <button
            type="button"
            className="sidebarCollapseToggle"
            aria-label={sidebarCollapsed ? labels.expandSidebar : labels.collapseSidebar}
            aria-expanded={!sidebarCollapsed}
            aria-controls={
              workspace === "agent" ? "arc-sidebar-nav-root" : "dashboard-sidebar-navigation"
            }
            title={sidebarCollapsed ? labels.expandSidebar : labels.collapseSidebar}
            onClick={toggleSidebar}
          >
            <ProductIcon name="panel" size={17} />
          </button>
        </div>
        {renderWorkspacePicker()}
        <div
          id="arc-sidebar-nav-root"
          className="arcSidebarPortalRoot"
          hidden={workspace !== "agent"}
        />
        {workspace === "agent" ? null : (
          <>
            <div className="workspaceNavHeading">{labels.connectionsGroup}</div>
            <nav
              id="dashboard-sidebar-navigation"
              className="sideNav"
              aria-label={labels.navigation}
            >
              {navItems.map(([id, label]) => (
                <button
                  key={id}
                  data-dashboard-tab={id}
                  title={label}
                  aria-label={label}
                  aria-current={active === id ? "page" : undefined}
                  className={active === id ? "active" : ""}
                  onClick={() => navigateTab(id)}
                >
                  <span className="sideNavIcon">
                    <DashboardNavIcon tab={id} />
                  </span>
                  <span className="sideNavLabel">{label}</span>
                </button>
              ))}
            </nav>
          </>
        )}
        <div className="sidebarGlobalNavigation">
          <div className="workspaceNavHeading">{labels.accountGroup}</div>
          <button
            type="button"
            aria-label={labels.settings}
            title={labels.settings}
            aria-current={active === "settings" || active === "agent-settings" ? "page" : undefined}
            className={active === "settings" || active === "agent-settings" ? "active" : ""}
            onClick={() => navigateTab(workspace === "agent" ? "agent-settings" : "settings")}
          >
            <span className="sideNavIcon">
              <DashboardNavIcon tab="settings" />
            </span>
            <span className="sideNavLabel">{labels.settings}</span>
          </button>
          {can("admin:access") && (
            <a href="https://admin.remotearc.app/" aria-label={labels.admin} title={labels.admin}>
              <span className="sideNavIcon">
                <ProductIcon name="shield" />
              </span>
              <span className="sideNavLabel">{labels.admin}</span>
              <ProductIcon name="arrowUpRight" size={13} />
            </a>
          )}
          <a href={MARKETING_ORIGIN + "/docs"} aria-label={labels.help} title={labels.help}>
            <span className="sideNavIcon">
              <ProductIcon name="book" />
            </span>
            <span className="sideNavLabel">{labels.help}</span>
            <ProductIcon name="arrowUpRight" size={13} />
          </a>
        </div>
        <div className="sidebarAccount">
          {user.avatarUrl ? (
            <img src={user.avatarUrl} alt="" />
          ) : (
            <div className="avatarFallback">
              {(user.name || user.email).charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <strong>{user.name || "Owner"}</strong>
            <span>{user.email}</span>
          </div>
          <button onClick={() => void signOutSafely()} aria-label={labels.signOut}>
            <ProductIcon name="logout" />
          </button>
        </div>
      </aside>

      <main className="dashboardMain">
        {UI_PREVIEW && (
          <div className="previewModeBanner" role="status">
            <strong>PR PREVIEW</strong>
            <span>{tr("dashboard.dashboard.interactiveArcDemoSimulatedDataNo")}</span>
            <a href="/device">{tr("dashboard.dashboard.previewOnboarding")} →</a>
          </div>
        )}
        <header className="mobileTopbar">
          {workspace === "agent" && (
            <button
              className="arcWorkspaceMobileMenu"
              type="button"
              aria-label={labels.openNavigation}
              onClick={() => setArcNavigationOpen(true)}
            >
              <ProductIcon name="menu" />
            </button>
          )}
          <Brand />
          {renderWorkspacePicker(true)}
          <div className="mobileActions">
            <ThemeSwitcher compact />
          </div>
        </header>

        {workspace === "agent" && (
          <div className="arcChatMount" hidden={active !== "agent-chat"}>
            <React.Suspense
              fallback={
                <WorkspaceLoading label={tr("dashboard.dashboard.openingArc")} variant="rows" />
              }
            >
              <ArcNativeChat
                key={user.id + ":" + arcEntry.version}
                initialPrompt={arcEntry.prompt}
                initialReferences={arcEntry.references}
                initialSessionId={arcEntry.sessionId}
                tr={tr}
                activeTab={active}
                navigationOpen={arcNavigationOpen}
                onNavigationChange={setArcNavigationOpen}
                onOpenChat={() => navigateTab("agent-chat")}
                accountId={user.id}
                accountName={user.name}
                totalDevices={devices.length}
                onlineDevices={devices.filter((device) => device.status === "online").length}
                onOpenGoals={() => navigateTab("agent-goals")}
                onOpenActivity={() => navigateTab("agent-activity")}
                onOpenSettings={() => navigateTab("agent-settings")}
                onOpenRoutines={() => navigateTab("agent-goals")}
                onManageApps={() => navigateTab("agent-apps")}
                onManageDevices={() => navigateTab("agent-devices")}
                onManageSkills={() => navigateTab("agent-skills")}
                onManageTeams={() => navigateTab("agent-teams")}
              />
            </React.Suspense>
          </div>
        )}

        {active === "automations" && (
          <ConnectTasksErrorBoundary tr={tr}>
            <ConnectTasks devices={devices} onConnectAI={() => navigateTab("connect")} />
          </ConnectTasksErrorBoundary>
        )}

        {["agent-goals", "agent-routines", "agent-activity"].includes(active) && (
          <ArcWorkWorkspace
            view={
              active === "agent-routines"
                ? "routines"
                : active === "agent-activity"
                  ? "activity"
                  : "tasks"
            }
            tr={tr}
            onChat={openArcChat}
          />
        )}

        {active === "agent-teams" && (
          <section className="arcTeammatesPage">
            <header className="overviewTopbar">
              <div>
                <span className="eyebrow">ARC / {tr("dashboard.dashboard.agents")}</span>
                <h1>{tr("dashboard.dashboard.agents2")}</h1>
                <p>{tr("dashboard.dashboard.chooseWhoHelpsWithYourNext")}</p>
              </div>
            </header>
            <React.Suspense
              fallback={
                <WorkspaceLoading label={tr("dashboard.dashboard.loadingAgents")} variant="cards" />
              }
            >
              <ArcTeammates
                accountId={user.id}
                tr={tr}
                onWork={(prompt, reference) =>
                  openArcChat(prompt, undefined, reference ? [reference] : undefined)
                }
              />
            </React.Suspense>
          </section>
        )}
        {active === "agent-skills" && (
          <React.Suspense
            fallback={
              <WorkspaceLoading label={tr("dashboard.dashboard.loadingSkills")} variant="rows" />
            }
          >
            <ArcSkills tr={tr} onChat={openArcChat} />
          </React.Suspense>
        )}

        {active === "overview" && <OverviewView m={m} />}

        {onDevices && <DevicesView m={m} browserTaskCount={browserTaskCount} />}

        {(active === "apps" || active === "agent-apps") && <AppsManager />}

        {active === "connect" && <ConnectView m={m} />}

        {active === "security" && <SecurityView m={m} browserAttention={browserAttention} />}

        {(active === "settings" || active === "agent-settings") && <SettingsView m={m} />}

        <footer className="dashboardFooter">
          <span>Remote Arc · agent.remotearc.app</span>
          <div>
            <a href={MARKETING_ORIGIN + "/pricing"}>{labels.pricing}</a>
            <a href={MARKETING_ORIGIN + "/docs"}>{labels.docs}</a>
            <a href={MARKETING_ORIGIN + "/docs/mcp"}>MCP</a>
            <a href={MARKETING_ORIGIN + "/privacy"}>{labels.privacy}</a>
            <a href={MARKETING_ORIGIN + "/terms"}>{labels.terms}</a>
            <a href={MARKETING_ORIGIN + "/support"}>{labels.support}</a>
          </div>
        </footer>
      </main>

      <nav className="mobileBottomNav" aria-label={labels.navigation}>
        {mobileNavItems.map(([id, label]) => (
          <button
            key={id}
            data-dashboard-tab={id}
            aria-current={active === id ? "page" : undefined}
            className={active === id ? "active" : ""}
            onClick={() => navigateTab(id)}
          >
            <span aria-hidden="true">
              <DashboardNavIcon tab={id} />
            </span>
            <small>
              {id === "overview"
                ? labels.home
                : id === "connect"
                  ? labels.clients
                  : id === "agent-chat"
                    ? labels.home
                    : label}
            </small>
          </button>
        ))}
        <button
          data-dashboard-tab="settings"
          aria-current={active === "settings" || active === "agent-settings" ? "page" : undefined}
          className={active === "settings" || active === "agent-settings" ? "active" : ""}
          onClick={() => navigateTab(workspace === "agent" ? "agent-settings" : "settings")}
        >
          <span aria-hidden="true">
            <DashboardNavIcon tab="settings" />
          </span>
          <small>{labels.settings}</small>
        </button>
      </nav>

      {directoryPicker && <DirectoryPickerDialog m={m} />}

      {dialog && <DashboardDialogHost m={m} />}

      {showAdd && <AddDeviceDialog m={m} />}
    </div>
  );
}
