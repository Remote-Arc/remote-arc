import { useI18n } from "../../hooks/use-i18n.js";
import "../../styles/apps/apps-plan-notice.css";

/** Shown when the account's plan has no Apps: the server refuses new connections,
 * while connections made before the plan changed keep working. */
export function AppsPlanNotice() {
  const { tr } = useI18n();
  return (
    <section className="appsPlanNotice" role="status">
      <div>
        <h2>{tr("apps.appsPlanNotice.title")}</h2>
        <p>{tr("apps.appsPlanNotice.body")}</p>
      </div>
      <a className="appsPlanNoticeAction" href="/settings?section=billing">
        {tr("apps.appsPlanNotice.seePlans")} →
      </a>
    </section>
  );
}
