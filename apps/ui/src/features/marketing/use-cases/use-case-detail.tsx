import "../../../styles/public-docs.css";
import "../../../styles/marketing/use-cases/use-case-catalog.css";
import "../../../styles/marketing/use-cases/use-case-detail.css";
import type { ReactNode } from "react";
import { ProductIcon as Icon } from "../../../components/product-icon.js";
import { useCopiedText } from "../../../hooks/marketing/use-copied-text.js";
import { useRunMode, type RunMode } from "../../../hooks/marketing/use-run-mode.js";
import { useI18n } from "../../../hooks/use-i18n.js";
import { localizedWebsiteHref } from "../../../lib/marketing-paths.js";
import type { MessageKey } from "../../../locales/locale-catalog.js";
import {
  ARC_USE_CASES,
  arcChatHref,
  arcUseCasePrompt,
  type UseCaseSlug,
} from "../../../../../../packages/docs/src/arc-use-cases.js";
import { TaskAvailability } from "../../docs/product-docs.js";
import { ImageDemoGallery } from "./image-demo-gallery.js";
import { MediaDemoGallery } from "./media-demo-gallery.js";
import { CopyIcon } from "./copy-icon.js";
import { caseTitle, cases } from "./use-case-entries.js";

const U = "marketing.useCases.useCases.",
  D = "marketing.useCases.detail.";

const MODES: ReadonlyArray<{
  id: RunMode;
  icon: "chat" | "spark";
  title: MessageKey;
  hint: MessageKey;
}> = [
  { id: "connect", icon: "chat", title: `${U}withConnect`, hint: `${D}connectHint` },
  { id: "arc", icon: "spark", title: `${U}withArc`, hint: `${D}arcHint` },
];

type Fact = { title: string; body: readonly string[]; code?: string; links?: ReactNode };

/** One use case: what to ask, how the work proceeds, and its limits, done either
 * from your own AI (Connect) or by Arc. */
export function UseCaseDetail({ slug }: { slug: UseCaseSlug }) {
  const { tr, locale } = useI18n(),
    [copied, copy] = useCopiedText();
  const item = cases(tr).find((entry) => entry.slug === slug)!,
    [chosenMode, setMode] = useRunMode(),
    arc = ARC_USE_CASES[slug];
  // A Connect-only workflow always shows its Connect path.
  const mode: RunMode = item.connectOnly ? "connect" : chosenMode,
    isArc = mode === "arc";
  const arcHref = arcChatHref(arcUseCasePrompt(slug, locale), "use-case:" + slug);
  const arcProof =
    slug === "ci-follow-up"
      ? tr(`${U}theActualCommitWorkflowStatusInspected`)
      : slug === "scheduled-checks"
        ? tr(`${U}perRunTimestampsActualResourceObservations`)
        : item.proof;
  const prompt = isArc ? arc.prompt[locale] : item.prompt;
  const steps = isArc
    ? [
        tr(`${U}resolveTheActualAccountComputerFiles`),
        arc.kind === "task"
          ? tr(`${U}confirmTimingThenSaveSelfContained`)
          : arc.kind === "routine"
            ? tr(`${U}confirmTheScheduleAndTimezoneSave`)
            : tr(`${U}useTheAuthorizedToolsToPerform`),
        tr(`${U}verifyTheRequestedOutputAndReturn`),
      ]
    : item.steps;
  const facts: Fact[] = isArc
    ? [
        {
          title: tr(`${U}whatToConnect`),
          body: [arc.requires[locale]],
          links: (
            <>
              <a href={localizedWebsiteHref("/docs/apps", locale)}>{tr(`${U}appsGuide`)} →</a>
              <a href={localizedWebsiteHref("/docs/devices", locale)}>{tr(`${U}deviceGuide`)} →</a>
            </>
          ),
        },
        {
          title: tr(`${U}whatAUsefulResultContains`),
          body:
            arc.kind === "direct" ? [arcProof] : [arcProof, tr(`${U}aSavedTaskOrRoutineReturns`)],
        },
        {
          title: tr(`${U}knowTheBoundary`),
          body: [arc.boundary[locale], tr(`${U}arcModelUseHasRunAnd`)],
        },
      ]
    : [
        {
          title: tr(`${U}toolsAndPermissions`),
          code: item.tools,
          body: [item.permission, tr(`${U}permissionsBelongToTheDeviceTask`)],
        },
        {
          title: tr(`${U}whatAUsefulResultContains`),
          body: item.durable ? [item.proof, tr(`${U}getTheSavedStatusAndRecent`)] : [item.proof],
        },
        {
          title: tr(`${U}knowTheBoundary`),
          body: [item.limit, tr(`${U}activeToolResultsPassThroughThe`)],
        },
      ];
  return (
    <main
      className={
        "technicalDoc revisedUseCases useCaseDetail" +
        (slug === "video-creation"
          ? " videoCreationCase"
          : slug === "image-studio"
            ? " imageCreationCase"
            : "")
      }
    >
      <header className="caseHero">
        <div className="caseHeroText">
          <a className="caseBack" href={localizedWebsiteHref("/use-cases?mode=" + mode, locale)}>
            ← {tr(`${U}allUseCases`)}
          </a>
          <span className="eyebrow">{item.category}</span>
          <h1>{isArc ? caseTitle(slug, item.title, tr) : item.title}</h1>
          <p>{isArc ? arc.intro[locale] : item.intro}</p>
        </div>
        <div className="caseHeroArt" aria-hidden="true">
          <img src={"/use-case-art/" + slug + ".svg"} alt="" width="640" height="360" />
        </div>
      </header>

      {item.connectOnly ? (
        <p className="caseConnectOnly">
          {tr(`${U}availableThroughConnectFromTheAi`)}{" "}
          <a href={localizedWebsiteHref("/connect-ai", locale)}>{tr(`${U}connectYourAi`)} →</a>
        </p>
      ) : (
        <div className="caseModes" role="group" aria-label={tr(`${U}chooseHowToWork`)}>
          {MODES.map((choice) => (
            <button
              key={choice.id}
              type="button"
              aria-pressed={mode === choice.id}
              onClick={() => setMode(choice.id)}
            >
              <span className="caseModeIcon" aria-hidden="true">
                <Icon name={choice.icon} size={20} />
              </span>
              <span className="caseModeText">
                <strong>{tr(choice.title)}</strong>
                <span>{tr(choice.hint)}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      {slug === "video-creation" && <MediaDemoGallery />}
      {slug === "image-studio" && <ImageDemoGallery />}

      <article className="caseBody">
        <section className="casePromptCard" aria-labelledby="case-prompt-title">
          <div className="casePromptTop">
            <h2 id="case-prompt-title">{tr(isArc ? `${U}askArc` : `${U}askInYourAiChat`)}</h2>
            <button
              type="button"
              className="caseCopy"
              data-copied={copied === mode || undefined}
              onClick={() => copy(mode, prompt)}
            >
              <CopyIcon done={copied === mode} />
              {tr(
                copied === mode
                  ? "marketing.useCases.personas.copied"
                  : "marketing.useCases.personas.copy",
              )}
            </button>
          </div>
          <blockquote className="casePrompt">{prompt}</blockquote>
          {isArc ? (
            <div className="caseStartActions">
              <a className="primaryButton" href={arcHref}>
                {tr(`${U}startInArc`)} ↗
              </a>
              <span>{tr(`${U}reviewThePreparedRequestBeforeSending`)}</span>
            </div>
          ) : (
            <p className="casePromptNote">{tr(`${U}thisIsASampleRequestNot`)}</p>
          )}
          {!isArc && item.durable && <TaskAvailability />}
        </section>

        <section className="caseStepsSection" aria-labelledby="case-steps-title">
          <h2 id="case-steps-title">
            {tr(isArc ? `${U}howArcHandlesTheWork` : `${U}howTheWorkProceeds`)}
          </h2>
          <ol className="caseSteps">
            {steps.map((step, index) => (
              <li key={step}>
                <span className="caseStepIndex" aria-hidden="true">
                  {index + 1}
                </span>
                <p>{step}</p>
              </li>
            ))}
          </ol>
        </section>

        <div className="caseFacts">
          {facts.map((fact) => (
            <section key={fact.title} className="caseFact">
              <h2>{fact.title}</h2>
              {fact.code && <code className="caseTools">{fact.code}</code>}
              {fact.body.map((text) => (
                <p key={text}>{text}</p>
              ))}
              {fact.links && <div className="caseFactLinks">{fact.links}</div>}
            </section>
          ))}
        </div>

        <footer className="articleEndLinks">
          {isArc ? (
            <>
              <a href={arcHref}>{tr(`${U}startInArc`)} ↗</a>
              <a href={localizedWebsiteHref("/docs/arc", locale)}>{tr(`${U}arcGuide`)} →</a>
              <a href={localizedWebsiteHref("/docs/skills", locale)}>{tr(`${U}reuseASkill`)} →</a>
            </>
          ) : (
            <>
              <a href={localizedWebsiteHref("/connect-ai", locale)}>{tr(`${U}connectYourAi2`)} →</a>
              <a href={localizedWebsiteHref("/docs/long-running-work", locale)}>
                {tr(`${U}longRunningWork`)} →
              </a>
              <a href={localizedWebsiteHref("/docs", locale) + "#docs-sandbox"}>
                {tr(`${U}executionBoundaries`)} →
              </a>
            </>
          )}
        </footer>
      </article>
    </main>
  );
}
