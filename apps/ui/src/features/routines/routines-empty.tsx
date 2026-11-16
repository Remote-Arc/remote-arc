import { useI18n } from "../../hooks/use-i18n.js";
import { ROUTINE_TEMPLATES } from "./routine-templates.js";

// Every template but the blank one, which the "Start a conversation" button already is.
const TEMPLATES = ROUTINE_TEMPLATES.filter((template) => template.id !== "general");

/** No routines yet: the two ways to make one, and templates to start from. */
export function RoutinesEmpty({
  arcAvailable,
  onChat,
  onConnectAI,
  onNewRoutine,
}: {
  arcAvailable: boolean;
  onChat: (prompt?: string) => void;
  onConnectAI: () => void;
  onNewRoutine: () => void;
}) {
  const { tr } = useI18n();
  return (
    <div className="routinesEmpty">
      <div className="routinesEmptyWays">
        {arcAvailable && (
          <article>
            <span>{tr("routines.empty.wayOne")}</span>
            <h2>{tr("routines.empty.sayItTitle")}</h2>
            <p>{tr("routines.empty.sayItDetail")}</p>
            <button
              type="button"
              className="routinePrimary"
              onClick={() => onChat(tr("routines.page.newRoutinePrompt"))}
            >
              {tr("routines.empty.startConversation")}
            </button>
          </article>
        )}
        <article>
          <span>{arcAvailable ? tr("routines.empty.wayTwo") : tr("routines.empty.wayOne")}</span>
          <h2>{tr("routines.empty.saveFromAiTitle")}</h2>
          <p>{tr("routines.empty.saveFromAiDetail")}</p>
          <div className="routinesEmptyActions">
            <button type="button" aria-haspopup="dialog" onClick={onNewRoutine}>
              {tr("routines.empty.getPrompt")}
            </button>
            <button type="button" onClick={onConnectAI}>
              {tr("routines.empty.connectAi")}
            </button>
          </div>
        </article>
      </div>
      {arcAvailable && (
        <section aria-labelledby="routine-templates">
          <h2 id="routine-templates">{tr("routines.empty.templates")}</h2>
          <div className="routinesTemplates">
            {TEMPLATES.map((template) => (
              <button
                type="button"
                key={template.id}
                onClick={() => onChat(tr(template.arcPrompt))}
              >
                <strong>{tr(template.name)}</strong>
                <small>{tr(template.detail)}</small>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
