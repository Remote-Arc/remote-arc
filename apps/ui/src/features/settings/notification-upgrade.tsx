import { useI18n } from "../../hooks/use-i18n.js";
import { usePlatformCatalog } from "../../hooks/use-platform-catalog.js";
import { checkoutHref } from "../billing/arc-billing-client.js";
import { CONNECT_UNLIMITED_PLAN_ID } from "@remotearc/protocol";

/** Shown above the channels when the plan does not include notifications: what they
 * do for the person, and one clear way to get them. */
export function NotificationUpgrade() {
  const { tr } = useI18n();
  const catalog = usePlatformCatalog();
  const trial = Boolean(catalog?.proTrial);
  const href = checkoutHref(CONNECT_UNLIMITED_PLAN_ID) + (trial ? "&trial=1" : "");
  return (
    <section className="raSettingsSurface notificationUpgrade" aria-labelledby="notify-upgrade">
      <div>
        <span className="notificationUpgradeBadge">Pro</span>
        <h4 id="notify-upgrade">{tr("settings.notificationSettings.upgradeTitle")}</h4>
        <p>{tr("settings.notificationSettings.upgradeDetail")}</p>
      </div>
      <a className="raSettingsButton raSettingsButtonPrimary notificationUpgradeAction" href={href}>
        {trial
          ? tr("settings.notificationSettings.upgradeTrial", {
              days: catalog?.trial.days ?? 7,
            })
          : tr("settings.notificationSettings.upgradeAction")}
      </a>
    </section>
  );
}
