import { useI18n } from "../../hooks/use-i18n.js";

const TEMPLATES = [
  {
    name: "routines.empty.priceWatch",
    detail: "routines.empty.priceWatchDetail",
    prompt: "routines.empty.priceWatchPrompt",
  },
  {
    name: "routines.empty.nightlyTests",
    detail: "routines.empty.nightlyTestsDetail",
    prompt: "routines.empty.nightlyTestsPrompt",
  },
  {
    name: "routines.empty.dataExport",
    detail: "routines.empty.dataExportDetail",
    prompt: "routines.empty.dataExportPrompt",
  },
  {
    name: "routines.empty.hostCheck",
    detail: "routines.empty.hostCheckDetail",
    prompt: "routines.empty.hostCheckPrompt",
  },
] as const;

/** No routines yet: the two ways to make one, and templates to start from. */
export function RoutinesEmpty({
  arcAvailable,
  onChat,
  onConnectAI,
}: {
  arcAvailable: boolean;
  onChat: (prompt?: string) => void;
  onConnectAI: () => void;
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
          <button type="button" onClick={onConnectAI}>
            {tr("routines.empty.connectAi")}
          </button>
        </article>
      </div>
      {arcAvailable && (
        <section aria-labelledby="routine-templates">
          <h2 id="routine-templates">{tr("routines.empty.templates")}</h2>
          <div className="routinesTemplates">
            {TEMPLATES.map((template) => (
              <button type="button" key={template.name} onClick={() => onChat(tr(template.prompt))}>
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
