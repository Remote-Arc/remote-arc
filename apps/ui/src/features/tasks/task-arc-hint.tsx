import { useI18n } from "../../hooks/use-i18n.js";

/** Shown on a routine whose failure Arc could have repaired: what Arc would do,
 * and where to start a plan or trial. */
export function TaskArcHint() {
  const { tr } = useI18n();
  return (
    <aside className="taskArcHint" aria-label={tr("tasks.taskArcHint.label")}>
      <p className="taskArcHintTitle">{tr("tasks.taskArcHint.title")}</p>
      <p>{tr("tasks.taskArcHint.detail")}</p>
      <a className="ghostButton" href="/settings?section=billing">
        {tr("tasks.taskArcHint.seePlans")}
      </a>
    </aside>
  );
}
