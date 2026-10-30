import React from "react";
import { RunnerAttentionList } from "./runner-view.js";
import { WorkspaceLoading } from './workspace-loading.js';
import { AppsManager } from "./apps-manager.js";
import { ArcWorkWorkspace } from "./arc-workspace.js";
import { ConnectTasks } from "./connect-tasks.js";
import { ProductIcon, type ProductIconName } from "./product-icon.js";
import { WorkspacePicker } from "./workspace-picker.js";
import { type DashboardTab } from "./dashboard-workspaces.js";
import { useDashboardModel, type DashboardProps } from "./dashboard/use-dashboard-model.js";
import { OverviewView } from "./dashboard/overview-view.js";
import { DevicesView } from "./dashboard/devices-view.js";
import { ConnectView } from "./dashboard/connect-view.js";
import { SecurityView } from "./dashboard/security-view.js";
import { MonitorView } from "./dashboard/monitor-view.js";
import { SettingsView } from "./dashboard/settings-view.js";
import { AddDeviceDialog, DashboardDialogHost, DirectoryPickerDialog } from "./dashboard/dashboard-overlays.js";
import { UI_PREVIEW } from "./preview.js";
import { MARKETING_ORIGIN } from "./app-config.js";
import { Brand, ThemeSwitcher } from "./public-layout.js";

const ArcNativeChat = React.lazy(() => import("./arc-native-chat.js").then(module => ({default:module.ArcNativeChat})));
const ArcTeammates = React.lazy(() => import('./arc-teams-page.js').then(module=>({default:module.ArcTeamsPage})));
const ArcSkills = React.lazy(() => import("./arc-skills.js").then(module => ({default:module.ArcSkills})));
function DashboardNavIcon({ tab }: { tab: DashboardTab }) {
 const names: Partial<Record<DashboardTab,ProductIconName>> = {overview:'overview',devices:'device','agent-devices':'device',apps:'apps','agent-apps':'apps',connect:'link',security:'shield',monitor:'activity','agent-chat':'chat','agent-goals':'tasks','agent-routines':'routine','agent-skills':'spark','agent-activity':'activity',automations:'tasks'};
 return <ProductIcon name={names[tab] || 'settings'}/>;
}
export function Dashboard(props: DashboardProps) {
  const m = useDashboardModel(props);
  const {
    active, arcAvailable, arcEntry, arcNavigationOpen, devices, dialog, directoryPicker,
    mobileNavItems, navItems, navigateTab, openArcChat, setArcNavigationOpen, showAdd,
    sidebarCollapsed, signOutSafely, toggleSidebar, tr, user, workspace,
  } = m;
  const renderWorkspacePicker = (mobile = false) => (
    <WorkspacePicker workspace={workspace} arcAvailable={arcAvailable} mobile={mobile} tr={tr} onNavigate={navigateTab} />
  );

  return (
    <div className="appFrame" data-active-tab={active} data-workspace={workspace} data-sidebar-collapsed={sidebarCollapsed}>
      <aside className="sidebar">
        <div className="sidebarBrand"><Brand /><button type="button" className="sidebarCollapseToggle" aria-label={sidebarCollapsed ? tr('Expand sidebar','展开侧栏') : tr('Collapse sidebar','收起侧栏')} aria-expanded={!sidebarCollapsed} aria-controls={workspace === 'agent' ? 'arc-sidebar-nav-root' : 'dashboard-sidebar-navigation'} title={sidebarCollapsed ? tr('Expand sidebar','展开侧栏') : tr('Collapse sidebar','收起侧栏')} onClick={toggleSidebar}><ProductIcon name="panel" size={17}/></button></div>
        {renderWorkspacePicker()}
        <div id="arc-sidebar-nav-root" className="arcSidebarPortalRoot" hidden={workspace !== 'agent'} />
        {workspace === "agent" ? (
          null
        ) : (
          <>
            <div className="workspaceNavHeading">{tr("CONNECTIONS", "连接管理")}</div>
            <nav id="dashboard-sidebar-navigation" className="sideNav" aria-label={tr("Dashboard navigation", "控制台导航")}>
              {navItems.map(([id, label]) => (
                <button key={id} data-dashboard-tab={id} title={label} aria-label={label} aria-current={active === id ? "page" : undefined} className={active === id ? "active" : ""} onClick={() => navigateTab(id)}>
                  <span className="sideNavIcon"><DashboardNavIcon tab={id} /></span>
                  <span className="sideNavLabel">{label}</span>
                </button>
              ))}
            </nav>
          </>
        )}
        <div className="sidebarGlobalNavigation">
          <div className="workspaceNavHeading">{tr("ACCOUNT", "账户")}</div>
          <button type="button" aria-label={tr("Settings", "设置")} title={tr("Settings", "设置")} aria-current={active === "settings" || active === "agent-settings" ? "page" : undefined} className={active === "settings" || active === "agent-settings" ? "active" : ""} onClick={() => navigateTab(workspace === "agent" ? "agent-settings" : "settings")}><span className="sideNavIcon"><DashboardNavIcon tab="settings" /></span><span className="sideNavLabel">{tr("Settings", "设置")}</span></button>
          {user.isAdmin && <a href="https://admin.remotearc.app/" aria-label={tr("Admin", "管理员后台")} title={tr("Admin", "管理员后台")}><span className="sideNavIcon"><ProductIcon name="shield"/></span><span className="sideNavLabel">{tr("Admin", "管理员后台")}</span><ProductIcon name="arrowUpRight" size={13}/></a>}
          <a href={MARKETING_ORIGIN + "/docs"} aria-label={tr("Help & documentation", "帮助与文档")} title={tr("Help & documentation", "帮助与文档")}><span className="sideNavIcon"><ProductIcon name="book"/></span><span className="sideNavLabel">{tr("Help & documentation", "帮助与文档")}</span><ProductIcon name="arrowUpRight" size={13}/></a>
        </div>
        <div className="sidebarAccount">
          {user.avatarUrl ? <img src={user.avatarUrl} alt=""/> : <div className="avatarFallback">{(user.name || user.email).charAt(0).toUpperCase()}</div>}
          <div><strong>{user.name || "Owner"}</strong><span>{user.email}</span></div>
          <button onClick={() => void signOutSafely()} aria-label={tr("Sign out", "退出登录")}><ProductIcon name="logout"/></button>
        </div>
      </aside>

      <main className="dashboardMain">
        {active !== "agent-chat" && <RunnerAttentionList/>}
        {UI_PREVIEW && (
          <div className="previewModeBanner" role="status">
            <strong>PR PREVIEW</strong>
            <span>{tr("Interactive Arc demo · simulated data · no real accounts, tools, models or payments", "Arc 交互演示 · 模拟数据 · 不连接真实账号、工具、模型或支付")}</span>
            <a href="/device">{tr("Preview onboarding", "预览配对流程")} →</a>
          </div>
        )}
        <header className="mobileTopbar">
          {workspace === "agent" && <button className="arcWorkspaceMobileMenu" type="button" aria-label={tr("Open workspace navigation","打开工作空间导航")} onClick={()=>setArcNavigationOpen(true)}><ProductIcon name="menu"/></button>}<Brand/>
          {renderWorkspacePicker(true)}
          <div className="mobileActions"><ThemeSwitcher compact/></div>
        </header>

        {workspace === "agent" && <div className="arcChatMount" hidden={active !== "agent-chat"}>
          <React.Suspense fallback={<WorkspaceLoading label={tr("Opening Arc…","正在打开 Arc…")} variant="rows"/>}><ArcNativeChat
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
          /></React.Suspense>
        </div>}

        {active === "automations" && <ConnectTasks devices={devices} onConnectAI={()=>navigateTab("connect")}/>}

        {['agent-goals','agent-routines','agent-activity'].includes(active) && <ArcWorkWorkspace view={active==='agent-routines'?'routines':active==='agent-activity'?'activity':'tasks'} tr={tr} onChat={openArcChat}/>}

        {active === "agent-teams" && <section className="arcTeammatesPage"><header className="overviewTopbar"><div><span className="eyebrow">ARC / {tr('AGENTS','智能体')}</span><h1>{tr('Agents','智能体')}</h1><p>{tr('Choose who helps with your next goal. Review roles and access, then continue in Chat.','选择协助下一个目标的智能体，查看分工与权限，然后在 Chat 中推进工作。')}</p></div></header><React.Suspense fallback={<WorkspaceLoading label={tr('Loading agents…','正在读取智能体…')} variant="cards"/>}><ArcTeammates accountId={user.id} tr={tr} onWork={(prompt,reference)=>openArcChat(prompt,undefined,reference?[reference]:undefined)}/></React.Suspense></section>}
        {active === "agent-skills" && <React.Suspense fallback={<WorkspaceLoading label={tr('Loading skills…','正在加载技能…')} variant="rows"/>}><ArcSkills tr={tr} onChat={openArcChat}/></React.Suspense>}

        {active === "overview" && <OverviewView m={m} />}

        {(active === "devices" || active === "agent-devices") && <DevicesView m={m} />}

        {(active === "apps" || active === "agent-apps") && <AppsManager />}

        {active === "connect" && <ConnectView m={m} />}

        {active === "security" && <SecurityView m={m} />}

        {active === "monitor" && user.isAdmin && <MonitorView m={m} />}

        {(active === "settings" || active === "agent-settings") && <SettingsView m={m} />}

        <footer className="dashboardFooter"><span>Remote Arc · agent.remotearc.app</span><div><a href={MARKETING_ORIGIN + "/pricing"}>{tr("Pricing", "价格")}</a><a href={MARKETING_ORIGIN + "/docs"}>{tr("Docs", "文档")}</a><a href={MARKETING_ORIGIN + "/docs/mcp"}>MCP</a><a href={MARKETING_ORIGIN + "/privacy"}>{tr("Privacy", "隐私")}</a><a href={MARKETING_ORIGIN + "/terms"}>{tr("Terms", "条款")}</a><a href={MARKETING_ORIGIN + "/support"}>{tr("Support", "支持")}</a></div></footer>
      </main>

      <nav className="mobileBottomNav" aria-label={tr("Dashboard navigation", "控制台导航")}>
        {mobileNavItems.map(([id, label]) => (
          <button key={id} data-dashboard-tab={id} aria-current={active === id ? "page" : undefined} className={active === id ? "active" : ""} onClick={() => navigateTab(id)}>
            <span aria-hidden="true"><DashboardNavIcon tab={id} /></span>
            <small>{id === "overview" ? tr("Home", "首页") : id === "connect" ? tr("Clients", "客户端") : id === "agent-chat" ? tr("Home", "首页") : label}</small>
          </button>
        ))}
        <button data-dashboard-tab="settings" aria-current={active === "settings" || active === "agent-settings" ? "page" : undefined} className={active === "settings" || active === "agent-settings" ? "active" : ""} onClick={() => navigateTab(workspace === "agent" ? "agent-settings" : "settings")}><span aria-hidden="true"><DashboardNavIcon tab="settings"/></span><small>{tr("Settings", "设置")}</small></button>
      </nav>

      {directoryPicker && <DirectoryPickerDialog m={m} />}

      {dialog && <DashboardDialogHost m={m} />}

      {showAdd && <AddDeviceDialog m={m} />}
    </div>
  );
}
