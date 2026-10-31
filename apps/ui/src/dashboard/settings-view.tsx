import { DashboardSettings } from "../dashboard-settings.js";
import { MARKETING_ORIGIN } from "../app-config.js";
import type { DashboardModel } from "./use-dashboard-model.js";

// Settings tab.
export function SettingsView({ m }: { m: DashboardModel }) {
  const {
    arcAvailable, hasPlus, locale, mcpEndpoint, navigateTab, setLocale, signOutSafely, tr, usage,
    usageLimitLabel, user, workspace,
  } = m;
  return (
    <>
      <section className="pageHeader dashboardUtilityHeader">
        <div>
          <span className="eyebrow">{tr("ACCOUNT & WORKSPACE", "账号与工作空间")}</span>
          <h1>{tr("Settings", "设置")}</h1>
          <p>{tr("Manage your account, workspaces, connections and plan in one place.", "集中管理账号、工作空间、连接权限和订阅方案。")}</p>
        </div>
      </section>
      <DashboardSettings
        accountId={arcAvailable?user.id:undefined}
        currentName={user.name}
        currentEmail={user.email}
        locale={locale}
        setLocale={setLocale}
        hasPlus={hasPlus}
        usage={usage}
        usageLimitLabel={usageLimitLabel}
        mcpEndpoint={mcpEndpoint}
        marketingOrigin={MARKETING_ORIGIN}
        onSignOut={signOutSafely}
        onNavigate={destination => navigateTab(workspace === "agent" && destination === "apps" ? "agent-apps" : workspace === "agent" && destination === "devices" ? "agent-devices" : destination)}
      />
    </>
  );
}
