import "../../../styles/marketing/use-cases/persona-use-cases.css";
import type { KeyboardEvent, ReactNode } from "react";
import { useI18n } from "../../../hooks/use-i18n.js";
import { CopyIcon } from "./copy-icon.js";
import { useCopiedText } from "../../../hooks/marketing/use-copied-text.js";
import { useHashChoice } from "../../../hooks/marketing/use-hash-choice.js";
import { localizedWebsiteHref } from "../../../lib/marketing-paths.js";
import type { MessageKey } from "../../../locales/locale-catalog.js";
import type { UseCaseSlug } from "../../../../../../packages/docs/src/arc-use-cases.js";

type PersonaId = "coder" | "ops" | "remote-server" | "office" | "agent-lead" | "creator";
type Persona = {
  id: PersonaId;
  plan: "pro" | "max";
  tasks: readonly MessageKey[];
  related: readonly UseCaseSlug[];
  /** A boundary the card must state so it does not promise more than ships today. */
  limit?: MessageKey;
};

const P = "marketing.useCases.personas.";

/** Who Remote Arc is for, each with tasks to copy into an AI chat and the plan that fits. */
export const PERSONAS: readonly Persona[] = [
  {
    id: "coder",
    plan: "pro",
    tasks: [`${P}coder.task1`, `${P}coder.task2`, `${P}coder.task3`, `${P}coder.task4`],
    related: ["remote-development", "long-running-jobs"],
  },
  {
    id: "ops",
    plan: "max",
    tasks: [`${P}ops.task1`, `${P}ops.task2`, `${P}ops.task3`],
    related: ["home-lab", "scheduled-checks"],
  },
  {
    id: "remote-server",
    plan: "pro",
    tasks: [`${P}remote-server.task1`, `${P}remote-server.task2`, `${P}remote-server.task3`],
    related: ["home-lab", "remote-support"],
  },
  {
    id: "office",
    plan: "pro",
    tasks: [`${P}office.task1`, `${P}office.task2`, `${P}office.task3`],
    related: ["file-organization", "browser-workflows"],
  },
  {
    id: "agent-lead",
    plan: "max",
    tasks: [`${P}agent-lead.task1`, `${P}agent-lead.task2`, `${P}agent-lead.task3`],
    related: ["cross-device-handoff", "ci-follow-up"],
    limit: `${P}agent-lead.limit`,
  },
  {
    id: "creator",
    plan: "pro",
    tasks: [`${P}creator.task1`, `${P}creator.task2`, `${P}creator.task3`],
    related: ["video-creation", "audio-transcription"],
  },
];

const nameKey = (id: PersonaId) => `${P}${id}.name` as const,
  introKey = (id: PersonaId) => `${P}${id}.intro` as const,
  planKey = (id: PersonaId) => `${P}${id}.plan` as const;
const IDS = PERSONAS.map((persona) => persona.id);

/** Six personas as a picker; the chosen one shows its tasks and the plan that fits.
 * It opens the use case page, so the page's own header (children) leads it and
 * holds the heading #persona-title.
 * titleOf: a related use case's title, from the catalog that renders this section. */
export function PersonaUseCases({
  titleOf,
  children,
}: {
  titleOf: (slug: UseCaseSlug) => string;
  children: ReactNode;
}) {
  const { tr, locale } = useI18n(),
    [copied, copy] = useCopiedText(),
    [chosen, choose] = useHashChoice(IDS, "for-");
  const persona = PERSONAS.find((item) => item.id === chosen)!;
  const onTabKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (!step) return;
    event.preventDefault();
    const next = IDS[(IDS.indexOf(chosen) + step + IDS.length) % IDS.length]!;
    choose(next);
    document.getElementById("persona-tab-" + next)?.focus();
  };
  return (
    <section className="personaShowcase" aria-labelledby="persona-title">
      {children}
      <div
        className="personaTabs"
        role="tablist"
        aria-label={tr("marketing.useCases.personas.tabsLabel")}
      >
        {PERSONAS.map((item) => (
          <button
            key={item.id}
            id={"persona-tab-" + item.id}
            type="button"
            role="tab"
            aria-selected={item.id === chosen}
            aria-controls={"for-" + item.id}
            tabIndex={item.id === chosen ? 0 : -1}
            onClick={() => choose(item.id)}
            onKeyDown={onTabKey}
          >
            <img src={"/use-case-art/persona-" + item.id + ".svg"} alt="" width="64" height="64" />
            <span>{tr(nameKey(item.id))}</span>
          </button>
        ))}
      </div>
      <article
        className="personaPanel"
        id={"for-" + persona.id}
        role="tabpanel"
        aria-labelledby={"persona-tab-" + persona.id}
      >
        <div className="personaPortrait">
          <img
            src={"/use-case-art/persona-" + persona.id + ".svg"}
            alt=""
            width="240"
            height="240"
          />
        </div>
        <div className="personaBody">
          <h3>{tr(nameKey(persona.id))}</h3>
          <p className="personaIntro">{tr(introKey(persona.id))}</p>
          <ol className="personaTasks">
            {persona.tasks.map((taskKey, index) => {
              const id = persona.id + "-" + index,
                task = tr(taskKey),
                done = copied === id;
              return (
                <li key={id}>
                  <span className="personaTaskIndex">{String(index + 1).padStart(2, "0")}</span>
                  <p>{task}</p>
                  <button
                    type="button"
                    className="personaCopy"
                    data-copied={done || undefined}
                    title={tr("marketing.useCases.personas.copy")}
                    aria-label={tr("marketing.useCases.personas.copyTask", { task })}
                    onClick={() => copy(id, task)}
                  >
                    <CopyIcon done={done} />
                    {done && <span>{tr("marketing.useCases.personas.copied")}</span>}
                  </button>
                </li>
              );
            })}
          </ol>
          {persona.limit && <p className="personaLimit">{tr(persona.limit)}</p>}
          <div className="personaFooter">
            <a
              className="personaPlan"
              data-plan={persona.plan}
              href={localizedWebsiteHref("/pricing#" + persona.plan, locale)}
            >
              {tr(
                persona.plan === "max"
                  ? "marketing.useCases.personas.seeMax"
                  : "marketing.useCases.personas.seePro",
              )}{" "}
              →
            </a>
            <span>{tr(planKey(persona.id))}</span>
          </div>
          <p className="personaRelated">
            {tr("marketing.useCases.personas.related")}{" "}
            {persona.related.map((slug, index) => (
              <span key={slug}>
                {index > 0 && " · "}
                <a href={localizedWebsiteHref("/use-cases/" + slug, locale)}>{titleOf(slug)}</a>
              </span>
            ))}
          </p>
        </div>
      </article>
    </section>
  );
}
