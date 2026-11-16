import { useEffect, useId, useRef, useState } from "react";
import { ProductIcon } from "../../components/product-icon.js";
import { useI18n } from "../../hooks/use-i18n.js";
import { useCopiedText } from "../../hooks/marketing/use-copied-text.js";
import {
  ROUTINE_TEMPLATES,
  aiConversationLinks,
  type RoutineTemplateId,
} from "./routine-templates.js";
import "../../styles/routines/new-routine-dialog.css";

/**
 * The ways to make a routine: say a prompt in your own AI (ChatGPT or Claude,
 * connected to Remote Arc), or ask Arc. Both start from the same templates.
 */
export function NewRoutineDialog({
  arcAvailable,
  onChat,
  onConnectAI,
  onClose,
}: {
  arcAvailable: boolean;
  onChat: (prompt?: string) => void;
  onConnectAI: () => void;
  onClose: () => void;
}) {
  const { tr } = useI18n();
  const titleId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const [templateId, setTemplateId] = useState<RoutineTemplateId>("general");
  const [copied, copy] = useCopiedText(4000);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  const template = ROUTINE_TEMPLATES.find((item) => item.id === templateId)!;
  const aiPrompt = tr(template.aiPrompt);
  const links = aiConversationLinks(aiPrompt);
  // The links fill the message box; the copy is there if a service ignores it.
  const copyPrompt = () => void copy(template.id, aiPrompt);
  const startInArc = () => {
    onClose();
    onChat(tr(template.arcPrompt));
  };
  const connectAI = () => {
    onClose();
    onConnectAI();
  };

  return (
    <dialog
      ref={dialog}
      className="newRoutineDialog"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      // A click on the dialog element itself is a click on the backdrop.
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="newRoutinePanel">
        <header className="newRoutineHeader">
          <div>
            <h2 id={titleId}>{tr("routines.newDialog.title")}</h2>
            <p>{tr("routines.newDialog.description")}</p>
          </div>
          <button
            type="button"
            className="newRoutineClose"
            aria-label={tr("routines.newDialog.close")}
            onClick={onClose}
          >
            <span aria-hidden="true">×</span>
          </button>
        </header>

        <div
          className="newRoutineTemplates"
          role="group"
          aria-label={tr("routines.newDialog.startFrom")}
        >
          {ROUTINE_TEMPLATES.map((item) => (
            <button
              type="button"
              key={item.id}
              aria-pressed={item.id === templateId}
              title={tr(item.detail)}
              onClick={() => setTemplateId(item.id)}
            >
              {tr(item.name)}
            </button>
          ))}
        </div>

        <section className="newRoutineAi" data-way="ai" aria-labelledby={titleId + "-prompt"}>
          <div className="newRoutinePromptCard">
            <h3 id={titleId + "-prompt"}>{tr("routines.newDialog.promptHeading")}</h3>
            <blockquote className="newRoutinePrompt" data-template={template.id}>
              {aiPrompt}
            </blockquote>
            <div className="newRoutineToolbar">
              <button type="button" className="routinePrimary" onClick={copyPrompt}>
                {copied === template.id && <ProductIcon name="check" size={15} />}
                {copied === template.id
                  ? tr("routines.newDialog.copied")
                  : tr("routines.newDialog.copyPrompt")}
              </button>
              <a
                href={links.chatgpt}
                target="_blank"
                rel="noopener noreferrer"
                data-ai="chatgpt"
                onClick={copyPrompt}
              >
                {tr("routines.newDialog.openChatGpt")}
                <ProductIcon name="arrowUpRight" size={14} />
              </a>
              <a
                href={links.claude}
                target="_blank"
                rel="noopener noreferrer"
                data-ai="claude"
                onClick={copyPrompt}
              >
                {tr("routines.newDialog.openClaude")}
                <ProductIcon name="arrowUpRight" size={14} />
              </a>
              <span className="newRoutineStatus" role="status">
                {copied === template.id ? tr("routines.newDialog.copiedDetail") : ""}
              </span>
            </div>
          </div>
          <p className="newRoutineHelp">
            {tr("routines.newDialog.aiDetail")} {tr("routines.newDialog.notConnected")}{" "}
            <button type="button" className="newRoutineLink" onClick={connectAI}>
              {tr("routines.empty.connectAi")}
            </button>
          </p>
        </section>

        {arcAvailable && (
          <footer className="newRoutineArc" data-way="arc">
            <p>
              <strong>{tr("routines.newDialog.arcTitle")}</strong>{" "}
              {tr("routines.newDialog.arcDetail")}
            </p>
            <button type="button" onClick={startInArc}>
              <ProductIcon name="chat" size={15} />
              {tr("routines.newDialog.startInArc")}
            </button>
          </footer>
        )}
      </div>
    </dialog>
  );
}
