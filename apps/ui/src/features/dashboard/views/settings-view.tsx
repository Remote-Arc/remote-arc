import { DashboardSettings } from "../../settings/dashboard-settings.js";
import { MARKETING_ORIGIN } from "../../../config/app-config.js";
import type { DashboardModel } from "../../../hooks/dashboard/use-dashboard-model.js";

// Settings tab.
export function SettingsView({ m }: { m: DashboardModel }) {
  const {
    arcAvailable,
    hasPlus,
    locale,
    mcpEndpoint,
    navigateTab,
    setLocale,
    signOutSafely,
    tr,
    usage,
    usageLimitLabel,
    user,
    workspace,
  } = m;
  return (
    <>
      <section className="pageHeader dashboardUtilityHeader">
        <div>
          <span className="eyebrow">{tr("dashboard.views.settingsView.accountWorkspace")}</span>
          <h1>{tr("dashboard.views.settingsView.settings")}</h1>
          <p>{tr("dashboard.views.settingsView.manageYourAccountWorkspacesConnectionsAnd")}</p>
        </div>
      </section>
      <DashboardSettings
        accountId={arcAvailable ? user.id : undefined}
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
        onNavigate={(destination) =>
          navigateTab(
            workspace === "agent" && destination === "apps"
              ? "agent-apps"
              : workspace === "agent" && destination === "devices"
                ? "agent-devices"
                : destination,
          )
        }
      />
    </>
  );
}
