import type { MessageKey } from "../../../locales/locale-catalog.js";
import { AppsDirectory } from "../home/apps-directory.js";
import { AppWorkflowShowcase } from "../home/app-workflow-showcase.js";
import { useState } from "react";
import { useMarketingPlayback } from "../../../hooks/marketing/use-marketing-playback.js";
import { useI18n } from "../../../hooks/use-i18n.js";
import "../../../styles/marketing/arc/arc-capabilities.css";

type IconName =
  | "routine"
  | "skills"
  | "apps"
  | "workspace"
  | "teach"
  | "shield"
  | "calendar"
  | "git"
  | "radar"
  | "play"
  | "pause"
  | "check"
  | "message"
  | "device"
  | "document";
const paths: Record<IconName, string> = {
  routine: "M12 6v6l4 2M3.2 8.2a9 9 0 1 1-.1 7.8M3.2 3.8v4.5h4.5",
  skills: "M5 3h9l5 5v13H5V3Zm9 0v6h5M9 12l-2 3 2 3m6-6 2 3-2 3m-3-6-1 6",
  apps: "M3 3h6v6H3zM15 3h6v6h-6zM9 15h6v6H9zM6 9v3h12V9m-6 3v3",
  workspace: "M3 7h18v13H3zM3 7V4h18v3M9 7v13M3 11h6",
  teach: "M3 8V4h4m10 0h4v4m0 8v4h-4M7 20H3v-4M9 8l10 6-5 1-2 5L9 8Z",
  shield: "M12 2l8 4v6c0 5-3.4 8.4-8 10-4.6-1.6-8-5-8-10V6l8-4Zm-4 10 3 3 5-6",
  calendar: "M4 6h16v15H4zM8 3v6m8-6v6M4 11h16",
  git: "M6 7v10m2-12h5a5 5 0 0 1 5 5v7M8 5a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM8 19a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM20 19a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z",
  radar: "M3 4h18v16H3zM3 8h18M6 14h3l2-3 3 6 2-3h2",
  play: "M8 5l11 7-11 7V5z",
  pause: "M8 5v14m8-14v14",
  check: "M4 12l5 5L20 6",
  message: "M4 4h16v12H9l-5 4V4Zm4 4h8m-8 4h5",
  device: "M3 4h18v13H3zM8 21h8m-4-4v4M6 8h6m-6 4h10",
  document: "M5 3h9l5 5v13H5V3Zm9 0v6h5M8 13h8m-8 4h5",
};
export function ArcFeatureIcon({ name }: { name: IconName }) {
  return (
    <svg
      className="arcFeatureSvg"
      aria-hidden="true"
      width="26"
      height="26"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={paths[name]} />
    </svg>
  );
}

type RoutineCopy = MessageKey;
type RoutineExample = {
  icon: IconName;
  label: MessageKey;
  trigger: RoutineCopy;
  task: RoutineCopy;
  preparing: RoutineCopy;
  artifact: RoutineCopy;
  filename: string;
  approval: RoutineCopy;
  sources: { slug: string; name: string; title: RoutineCopy; detail: RoutineCopy }[];
  lines: RoutineCopy[];
};

const examples: RoutineExample[] = [
  {
    icon: "calendar",
    label: "marketing.arc.arcCapabilities.dailyBriefing",

    trigger: "marketing.arc.arcCapabilities.weekdays",
    task: "marketing.arc.arcCapabilities.prepareMyMorningBriefing",
    preparing: "marketing.arc.arcCapabilities.turnTodaySUpdatesInto",
    artifact: "marketing.arc.arcCapabilities.yourMorningInFocus",
    filename: "morning-briefing.md",
    approval: "marketing.arc.arcCapabilities.reviewTheBriefingBeforeSharing",
    sources: [
      {
        slug: "gmail",
        name: "Gmail",
        title: "marketing.arc.arcCapabilities.priorityMessages",
        detail: "marketing.arc.arcCapabilities.alexClientReviewNeedsA",
      },
      {
        slug: "googlecalendar",
        name: "Calendar",
        title: "marketing.arc.arcCapabilities.meetingsToday",
        detail: "marketing.arc.arcCapabilities.designReview",
      },
    ],
    lines: [
      "marketing.arc.arcCapabilities.replyToAlexBefore",
      "marketing.arc.arcCapabilities.designReviewAtNotesAttached",
    ],
  },
  {
    icon: "git",
    label: "marketing.arc.arcCapabilities.projectSummary",

    trigger: "marketing.arc.arcCapabilities.everyFriday",
    task: "marketing.arc.arcCapabilities.summarizeThisWeekSProject",
    preparing: "marketing.arc.arcCapabilities.matchShippedChangesToThe",
    artifact: "marketing.arc.arcCapabilities.thisWeekSProgress",
    filename: "weekly-project-update.md",
    approval: "marketing.arc.arcCapabilities.checkTheSummaryBeforePosting",
    sources: [
      {
        slug: "github",
        name: "GitHub",
        title: "marketing.arc.arcCapabilities.pullRequestsMerged",
        detail: "marketing.arc.arcCapabilities.authenticationFlowChecksPassing",
      },
      {
        slug: "linear",
        name: "Linear",
        title: "marketing.arc.arcCapabilities.sprintIssuesClosed",
        detail: "marketing.arc.arcCapabilities.releaseMilestoneOneBlocker",
      },
    ],
    lines: [
      "marketing.arc.arcCapabilities.shippedAuthenticationImprovements",
      "marketing.arc.arcCapabilities.blockerNeedsAnOwnerBefore",
    ],
  },
  {
    icon: "radar",
    label: "marketing.arc.arcCapabilities.changeMonitor",

    trigger: "marketing.arc.arcCapabilities.onAMeaningfulChange",
    task: "marketing.arc.arcCapabilities.tellMeWhenTheRelease",
    preparing: "marketing.arc.arcCapabilities.compareTheNewPlanWith",
    artifact: "marketing.arc.arcCapabilities.aChangeWorthYourAttention",
    filename: "release-plan-change.md",
    approval: "marketing.arc.arcCapabilities.reviewTheChangeBeforeAny",
    sources: [
      {
        slug: "notion",
        name: "Notion",
        title: "marketing.arc.arcCapabilities.releasePlanUpdated",
        detail: "marketing.arc.arcCapabilities.launchDateOctOct",
      },
      {
        slug: "github",
        name: "GitHub",
        title: "marketing.arc.arcCapabilities.relatedIssueChanged",
        detail: "marketing.arc.arcCapabilities.releaseChecklistReviewNeeded",
      },
    ],
    lines: [
      "marketing.arc.arcCapabilities.launchMovedFromOctTo",
      "marketing.arc.arcCapabilities.reviewTheAffectedReleaseChecklist",
    ],
  },
];

function RoutineConceptDemo() {
  const { tr } = useI18n();
  const [example, setExample] = useState(0);
  const { ref, step, setStep, playing, setPlaying, running, reducedMotion } = useMarketingPlayback(
    4,
    2800,
  );
  const current = examples[example]!;
  const copy = (value: RoutineCopy) => tr(value);
  const phases = [
    tr("marketing.arc.arcCapabilities.receive"),
    tr("marketing.arc.arcCapabilities.prepare"),
    tr("marketing.arc.arcCapabilities.review"),
    tr("marketing.arc.arcCapabilities.result"),
  ];
  const phaseTitles = [
    tr("marketing.arc.arcCapabilities.theRightContextArrives"),
    tr("marketing.arc.arcCapabilities.scatteredUpdatesBecomeADraft"),
    tr("marketing.arc.arcCapabilities.yourReviewIsTheNextStep"),
    tr("marketing.arc.arcCapabilities.aResultYouCanInspect"),
  ];
  return (
    <div
      className="arcRoutineDemo"
      ref={ref}
      data-running={running}
      data-routine-step={step}
      aria-label={tr("marketing.arc.arcCapabilities.illustrativeRoutineTemplatesWithExampleData")}
    >
      <div className="arcRoutineDemoTop">
        <span className="arcRoutineLiveDot" aria-hidden="true" />
        <span>{tr("marketing.arc.arcCapabilities.routineConcept")}</span>
        <small>{tr("marketing.arc.arcCapabilities.exampleData")}</small>
        <button
          type="button"
          className="arcRoutinePlayback"
          onClick={() => setPlaying((value) => !value)}
          aria-label={
            reducedMotion
              ? tr("marketing.arc.arcCapabilities.animationDisabledByYourMotionPreference")
              : playing
                ? tr("marketing.arc.arcCapabilities.pauseRoutineDemo")
                : tr("marketing.arc.arcCapabilities.playRoutineDemo")
          }
          disabled={reducedMotion}
        >
          <ArcFeatureIcon name={playing ? "pause" : "play"} />
        </button>
      </div>
      <div
        className="arcRoutineChoices"
        role="group"
        aria-label={tr("marketing.arc.arcCapabilities.chooseARoutineExample")}
      >
        {examples.map((item, index) => (
          <button
            key={item.label}
            type="button"
            className={example === index ? "selected" : ""}
            aria-pressed={example === index}
            onClick={() => {
              setExample(index);
              setStep(reducedMotion ? 3 : 0);
            }}
          >
            <ArcFeatureIcon name={item.icon} />
            <span>{tr(item.label)}</span>
          </button>
        ))}
      </div>
      <div className="arcRoutineStory" key={current.label}>
        <div className="arcRoutineRequest">
          <span>{copy(current.trigger)}</span>
          <strong>{copy(current.task)}</strong>
        </div>
        <div
          className="arcRoutineSources"
          aria-label={tr("marketing.arc.arcCapabilities.exampleSourcesNotConnectedAccounts")}
        >
          {current.sources.map((source) => (
            <div className="arcRoutineSource" key={source.slug}>
              <span className="arcRoutineSourceLogo" data-brand={source.slug}>
                <img
                  src={"/app-brands/" + source.slug + ".svg"}
                  width="24"
                  height="24"
                  alt={source.name}
                />
              </span>
              <div>
                <strong>{copy(source.title)}</strong>
                <span>{copy(source.detail)}</span>
              </div>
              <span className={"arcRoutineSourceState" + (step > 0 ? " is-read" : "")}>
                <ArcFeatureIcon name={step > 0 ? "check" : "document"} />
              </span>
            </div>
          ))}
        </div>
        <div
          className="arcRoutineProgress"
          aria-label={tr("marketing.arc.arcCapabilities.previewSteps")}
        >
          {phases.map((phase, index) => (
            <button
              key={phase}
              type="button"
              className={step === index ? "current" : step > index ? "complete" : ""}
              aria-pressed={step === index}
              onClick={() => {
                setStep(index);
                setPlaying(false);
              }}
            >
              <span>{step > index ? <ArcFeatureIcon name="check" /> : "0" + (index + 1)}</span>
              {phase}
            </button>
          ))}
        </div>
        <div className="arcRoutineWorkbench">
          <div className="arcRoutineWorkbenchHeading">
            <span className="arcRoutineArcLogo">
              <img src="/remote-arc.svg" width="24" height="24" alt="Arc" />
            </span>
            <div>
              <span>{tr("marketing.arc.arcCapabilities.exampleWorkflowNotLive")}</span>
              <strong>{phaseTitles[step]}</strong>
            </div>
            <span className={"arcRoutineBeat" + (step === 3 ? " is-done" : "")} aria-hidden="true">
              {step === 3 ? <ArcFeatureIcon name="check" /> : <i />}
            </span>
          </div>
          <div className="arcRoutineArtifact" data-ready={step >= 2}>
            <div className="arcRoutineArtifactHeader">
              <ArcFeatureIcon name="document" />
              <span>
                {step === 0
                  ? tr("marketing.arc.arcCapabilities.waitingToPrepareTheDraft")
                  : copy(current.artifact)}
              </span>
              <small>{step === 3 ? tr("marketing.arc.arcCapabilities.draft") : "01"}</small>
            </div>
            {step === 0 ? (
              <p className="arcRoutineArtifactWaiting">
                {tr("marketing.arc.arcCapabilities.onlyTheAuthorizedSourcesEnterThis")}
              </p>
            ) : step === 1 ? (
              <div className="arcRoutineDrafting">
                <p>{copy(current.preparing)}</p>
                <span />
                <span />
                <span />
              </div>
            ) : (
              <ul className="arcRoutineArtifactLines">
                {current.lines.map((line) => (
                  <li key={line}>
                    <ArcFeatureIcon name="check" />
                    {copy(line)}
                  </li>
                ))}
              </ul>
            )}
            <div className={"arcRoutineReviewNote" + (step >= 2 ? " visible" : "")}>
              <ArcFeatureIcon name="shield" />
              <span>{copy(current.approval)}</span>
            </div>
            <div className="arcRoutineArtifactFile">
              <code>
                {step === 3
                  ? current.filename
                  : tr("marketing.arc.arcCapabilities.sourceReferencesStayWithTheDraft")}
              </code>
              <span>
                {step === 3
                  ? tr("marketing.arc.arcCapabilities.readyToReview")
                  : tr("marketing.arc.arcCapabilities.exampleData2")}
              </span>
            </div>
          </div>
        </div>
        <p className="arcRoutineScope">
          {tr("marketing.arc.arcCapabilities.simulatedSourcesAndResultsNoAccounts")}
        </p>
      </div>
    </div>
  );
}

export function ArcCapabilities() {
  const { tr } = useI18n();
  return (
    <>
      <section className="arcCapabilities" id="arc-capabilities">
        <div className="arcCapabilitiesIntro">
          <span className="arcV3Eyebrow">
            {tr("marketing.arc.arcCapabilities.builtForRealWork")}
          </span>
          <h2>{tr("marketing.arc.arcCapabilities.moreThanAConversationAPlace")}</h2>
          <p>{tr("marketing.arc.arcCapabilities.aCompleteEnvironmentForDelegatedWork")}</p>
        </div>
        <div className="arcCapabilitiesSpotlight">
          <div className="arcCapabilityLead">
            <span className="arcFeatureIconFrame">
              <ArcFeatureIcon name="routine" />
            </span>
            <span className="arcCapabilityKicker">ROUTINES</span>
            <h3>{tr("marketing.arc.arcCapabilities.keepTheWorkMovingEvenWhen")}</h3>
            <p>{tr("marketing.arc.arcCapabilities.saveAGoalPauseItResume")}</p>
            <ul className="arcFeaturePills">
              <li>
                <ArcFeatureIcon name="pause" />
                {tr("marketing.arc.arcCapabilities.pauseResume")}
              </li>
              <li>
                <ArcFeatureIcon name="shield" />
                {tr("marketing.arc.arcCapabilities.approvalsCostCeilings")}
              </li>
              <li>
                <ArcFeatureIcon name="check" />
                {tr("marketing.arc.arcCapabilities.verifiedResults")}
              </li>
            </ul>
          </div>
          <RoutineConceptDemo />
        </div>
        <div className="arcCapabilitiesGrid">
          <article>
            <span className="arcFeatureIconFrame">
              <ArcFeatureIcon name="skills" />
            </span>
            <h3>{tr("marketing.arc.arcCapabilities.skillsThatYouCanReuse")}</h3>
            <p>{tr("marketing.arc.arcCapabilities.giveArcAGrowingLibraryOf")}</p>
            <span className="arcFeatureFoot">SKILL LIBRARY · REPLAY TESTS</span>
          </article>
          <article>
            <span className="arcFeatureIconFrame">
              <ArcFeatureIcon name="workspace" />
            </span>
            <h3>{tr("marketing.arc.arcCapabilities.aWorkspaceWithBoundaries")}</h3>
            <p>
              {tr(
                "marketing.arc.arcCapabilities.bringOrganizationMembersConnectionStatusPermissions",
              )}
            </p>
            <span className="arcFeatureFoot">TEAMS · ACCESS · BILLING</span>
          </article>
          <article>
            <span className="arcFeatureIconFrame">
              <ArcFeatureIcon name="teach" />
            </span>
            <h3>{tr("marketing.arc.arcCapabilities.teachArcByShowingNotCoding")}</h3>
            <p>{tr("marketing.arc.arcCapabilities.recordAnApprovedDemonstrationTurnIt")}</p>
            <span className="arcFeatureFoot">TEACH ARC · CONTROLLED DEMOS</span>
          </article>
          <article>
            <span className="arcFeatureIconFrame">
              <ArcFeatureIcon name="shield" />
            </span>
            <h3>{tr("marketing.arc.arcCapabilities.yourPermissionsYourBudget")}</h3>
            <p>{tr("marketing.arc.arcCapabilities.approvalsForSensitiveActionsHardModel")}</p>
            <span className="arcFeatureFoot">AUTO ROUTING · PREMIUM MODELS</span>
          </article>
        </div>
      </section>

      <AppWorkflowShowcase />
      <AppsDirectory id="arc-apps" />
    </>
  );
}
