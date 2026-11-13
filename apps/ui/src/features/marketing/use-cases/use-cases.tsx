import type { Translate } from "../../../locales/locale-catalog.js";
import { useRunMode, type RunMode } from "../../../hooks/marketing/use-run-mode.js";
import {
  SKILL_USE_CASES,
  getUseCaseSkillIds,
} from "../../../../../../packages/docs/src/skill-use-cases.js";
import "../../../styles/marketing/use-cases/use-case-catalog.css";
import React, { useEffect, useState } from "react";
import { ImageDemoGallery } from "./image-demo-gallery.js";
import { MediaDemoGallery } from "./media-demo-gallery.js";
import { useI18n } from "../../../hooks/use-i18n.js";
import { localizedWebsiteHref } from "../../../lib/marketing-paths.js";
import { TaskAvailability } from "../../docs/product-docs.js";
import {
  ARC_USE_CASES,
  arcChatHref,
  arcUseCasePrompt,
} from "../../../../../../packages/docs/src/arc-use-cases.js";
import "../../../styles/public-docs.css";

export { useCaseSlugs } from "../../../../../../packages/docs/src/arc-use-cases.js";
import type { UseCaseSlug } from "../../../../../../packages/docs/src/arc-use-cases.js";
export type { UseCaseSlug } from "../../../../../../packages/docs/src/arc-use-cases.js";
type Tr = Translate;

function cases(tr: Tr) {
  return [
    ...SKILL_USE_CASES.map((item) => ({
      slug: item.slug,
      category: tr(item.category.en, item.category.zh),
      title: tr(item.title.en, item.title.zh),
      intro: tr(item.intro.en, item.intro.zh),
      prompt: tr(item.prompt.en, item.prompt.zh),
      permission: tr(item.requires.en, item.requires.zh),
      limit: tr(item.boundary.en, item.boundary.zh),
      proof: tr(item.proof.en, item.proof.zh),
      steps: item.steps.map((step) => tr(step.en, step.zh)),
      tools: item.tools,
      durable: false,
      connectOnly: item.connectOnly,
    })),
    {
      slug: "job-applications",
      category: tr("marketing.useCases.useCases.browserRunnerBeta"),
      title: tr("marketing.useCases.useCases.prepareAJobApplicationOnThe"),
      intro: tr("marketing.useCases.useCases.yourAiFillsARealApplication"),
      prompt: tr("marketing.useCases.useCases.onMyWindowsPcUseBrowser"),
      tools:
        "browser_runner_start · browser_runner_snapshot · browser_runner_act · browser_runner_confirm · browser_runner_status",
      permission: tr("marketing.useCases.useCases.browserRunnerSwitchedOnForThe"),
      steps: [
        tr("marketing.useCases.useCases.startATaskBrowserLimitedTo"),
        tr("marketing.useCases.useCases.readThePageFillFieldsAnd"),
        tr("marketing.useCases.useCases.submitOnceWithYourApprovalThe"),
      ],
      proof: tr("marketing.useCases.useCases.theConfirmationTextOrReferenceNumber"),
      limit: tr("marketing.useCases.useCases.betaNewChromeConnectionsRequireAllow"),
      durable: false,
      connectOnly: true,
    },
    {
      slug: "remote-development",
      category: tr("marketing.useCases.useCases.development"),
      title: tr("marketing.useCases.useCases.fixAProjectOnYourOwn"),
      intro: tr("marketing.useCases.useCases.useTheExistingCheckoutInstalledDependencies"),
      prompt: tr("marketing.useCases.useCases.onMyWorkstationInspectTheCheckout"),
      tools: "list_devices · device_tools · read_file · edit_block · start_process",
      permission: tr("marketing.useCases.useCases.fileReadsFileEditingAndTerminal"),
      steps: [
        tr("marketing.useCases.useCases.resolveTheNamedDeviceAndInspect"),
        tr("marketing.useCases.useCases.readTheFailingImplementationBeforeEditing"),
        tr("marketing.useCases.useCases.useFocusedChecksInspectTheDiff"),
      ],
      proof: tr("marketing.useCases.useCases.aConcreteDiffFocusedTestOutput"),
      limit: tr("marketing.useCases.useCases.terminalRunsAsTheLocalOs"),
      durable: false,
    },
    {
      slug: "file-organization",
      category: tr("marketing.useCases.useCases.files"),
      title: tr("marketing.useCases.useCases.organizeFilesWithAReviewedMove"),
      intro: tr("marketing.useCases.useCases.inspectAChosenFolderProposeA"),
      prompt: tr("marketing.useCases.useCases.inspectMySelectedDownloadsFolderAnd"),
      tools: "list_directory · get_file_info · read_file · start_process",
      permission: tr("marketing.useCases.useCases.folderReadsForPlanningSeparatelyAuthorized"),
      steps: [
        tr("marketing.useCases.useCases.inspectNamesAndMetadataAvoidReading"),
        tr("marketing.useCases.useCases.reviewDestinationsCollisionsAndTheExact"),
        tr("marketing.useCases.useCases.executeTheApprovedPlanAndVerify"),
      ],
      proof: tr("marketing.useCases.useCases.theApprovedMoveListCollisionHandling"),
      limit: tr("marketing.useCases.useCases.noDedicatedMoveFileMcpTool"),
      durable: false,
    },
    {
      slug: "disk-space-cleanup",
      category: tr("marketing.useCases.useCases.diskSpace"),
      title: tr("marketing.useCases.useCases.findWhatIsFillingYourWindows"),
      intro: tr("marketing.useCases.useCases.inspectLargeFoldersCachesAndDuplicated"),
      prompt: tr("marketing.useCases.useCases.onMyWindowsPcInvestigateWhy"),
      tools: "list_directory · get_file_info · start_process · process_output",
      permission: tr("marketing.useCases.useCases.readOnlyInspectionFirstSeparatelyApproved"),
      steps: [
        tr("marketing.useCases.useCases.measureTotalFreeSpaceAndInspect"),
        tr("marketing.useCases.useCases.groupCandidatesTemporaryBuildOutputsInstaller"),
        tr("marketing.useCases.useCases.presentADryRunPlanDelete"),
      ],
      proof: tr("marketing.useCases.useCases.beforeAfterFreeSpaceExactApproved"),
      limit: tr("marketing.useCases.useCases.neverBlindlyPurgeWindowsWinsxsSystem32"),
      durable: false,
    },
    {
      slug: "overnight-goals",
      category: tr("marketing.useCases.useCases.durableLoop"),
      title: tr("marketing.useCases.useCases.leaveABoundedFixedPlanRunning"),
      intro: tr("marketing.useCases.useCases.saveAKnownWorkPlanAnd"),
      prompt: tr("marketing.useCases.useCases.onBuildPcRunTheExisting"),
      tools: "create_automation(kind=goal_loop) · get_automation · manage_automation",
      permission: tr("marketing.useCases.useCases.terminalBackgroundTasks"),
      steps: [
        tr("marketing.useCases.useCases.saveTheExactWorkCommandVerification"),
        tr("marketing.useCases.useCases.runTheSameAuthorizedPlanAnd"),
        tr("marketing.useCases.useCases.ifTheResultRequiresAGenuinely"),
      ],
      proof: tr("marketing.useCases.useCases.runHistoryExitCodesAndThe"),
      limit: tr("marketing.useCases.useCases.thisIsDeterministicOrchestrationNotA"),
      durable: true,
    },
    {
      slug: "long-running-jobs",
      category: tr("marketing.useCases.useCases.longTask"),
      title: tr("marketing.useCases.useCases.trackABuildExportOrScript"),
      intro: tr("marketing.useCases.useCases.whenTheCommandIsKnownSave"),
      prompt: tr("marketing.useCases.useCases.runTheExistingReportExportOn"),
      tools: "create_automation(kind=long_task) · get_automation · manage_automation",
      permission: tr("marketing.useCases.useCases.terminalBackgroundTasks"),
      steps: [
        tr("marketing.useCases.useCases.saveTheCommandCwdRecoveryChoice"),
        tr("marketing.useCases.useCases.theSchedulerStartsAndFollowsThe"),
        tr("marketing.useCases.useCases.readExitStatusAndBoundedOutput"),
      ],
      proof: tr("marketing.useCases.useCases.exitCodeAndTheGeneratedArtifact"),
      limit: tr("marketing.useCases.useCases.theTaskSurvivesInTheDatabase"),
      durable: true,
    },
    {
      slug: "scheduled-checks",
      category: tr("marketing.useCases.useCases.scheduledWork"),
      title: tr("marketing.useCases.useCases.runACheckLaterOrRepeat"),
      intro: tr("marketing.useCases.useCases.saveAFixedCheckOrDeterministic"),
      prompt: tr("marketing.useCases.useCases.atTheAgreedTimeRunThe"),
      tools:
        "create_automation(kind=schedule_watch) or create_agent_goal(schedule=…) · get_automation",
      permission: tr("marketing.useCases.useCases.requiredToolsBackgroundTasksScheduledTasks"),
      steps: [
        tr("marketing.useCases.useCases.confirmAnExplicitTimestampOrInterval"),
        tr("marketing.useCases.useCases.theCloudSchedulerMakesWorkDue"),
        tr("marketing.useCases.useCases.readEachRunSResultFor"),
      ],
      proof: tr("marketing.useCases.useCases.perRunTimestampsExitCodesAnd"),
      limit: tr("marketing.useCases.useCases.intervalsStartAfterCompletionNotAt"),
      durable: true,
    },
    {
      slug: "ci-follow-up",
      category: tr("marketing.useCases.useCases.conditionWatch"),
      title: tr("marketing.useCases.useCases.actAfterAMatchingCiOr"),
      intro: tr("marketing.useCases.useCases.aConditionWatchSavesTheMatching"),
      prompt: tr("marketing.useCases.useCases.watchTheConfiguredCiCallbackFor"),
      tools: "create_automation(kind=condition_watch) · get_automation · manage_automation",
      permission: tr("marketing.useCases.useCases.requiredDeviceToolsAndBackgroundTasks"),
      steps: [
        tr("marketing.useCases.useCases.freezeTheConditionMatchAndAction"),
        tr("marketing.useCases.useCases.configureTheEventSourceToDeliver"),
        tr("marketing.useCases.useCases.checkTheActionResultAndRun"),
      ],
      proof: tr("marketing.useCases.useCases.theMatchedEventAndTheActual"),
      limit: tr("marketing.useCases.useCases.inboundConditionHooksUseASecret"),
      durable: true,
    },
    {
      slug: "data-work",
      category: tr("marketing.useCases.useCases.data"),
      title: tr("marketing.useCases.useCases.processDataUsingYourInstalledEnvironment"),
      intro: tr("marketing.useCases.useCases.useThePythonNodeOrOther"),
      prompt: tr("marketing.useCases.useCases.onDataPcUseTheExisting"),
      tools:
        "read_file · get_file_info · start_process · write_file; create_automation for a long job",
      permission: tr("marketing.useCases.useCases.fileReadsNeededEditingTerminalTools"),
      steps: [
        tr("marketing.useCases.useCases.inspectTheSchemaAndTheInstalled"),
        tr("marketing.useCases.useCases.runTheApprovedAnalysisAndKeep"),
        tr("marketing.useCases.useCases.validateTotalsOrOutputStructureAnd"),
      ],
      proof: tr("marketing.useCases.useCases.savedOutputPathValidatedTotalsAnd"),
      limit: tr("marketing.useCases.useCases.fileReadsAndCommandResultsCan"),
      durable: false,
    },
    {
      slug: "presentation-deck",
      category: tr("marketing.useCases.useCases.presentations"),
      title: tr("marketing.useCases.useCases.turnLocalNotesIntoAPowerpoint"),
      intro: tr("marketing.useCases.useCases.askYourAiToTurnExisting"),
      prompt: tr("marketing.useCases.useCases.onMyWorkstationTurnSlidesOutline"),
      tools: "read_file · list_directory · start_process · get_file_info",
      permission: tr("marketing.useCases.useCases.readSourcesEnabledLocalTerminalAnd"),
      steps: [
        tr("marketing.useCases.useCases.inspectTheOutlineAssetsInstalledLibrary"),
        tr("marketing.useCases.useCases.generateThePptxInTheChosen"),
        tr("marketing.useCases.useCases.openOrInspectTheSlideStructure"),
      ],
      proof: tr("marketing.useCases.useCases.anEditablePptxOnTheWorkstation"),
      limit: tr("marketing.useCases.useCases.thisIsAWorkflowUsingStart"),
      durable: false,
    },
    {
      slug: "spreadsheet-report",
      category: tr("marketing.useCases.useCases.spreadsheets"),
      title: tr("marketing.useCases.useCases.turnHundredsOfFilesIntoA"),
      intro: tr("marketing.useCases.useCases.readSelectedCsvsOrStructuredDocuments"),
      prompt: tr("marketing.useCases.useCases.onDataPcCombineReportsCsv"),
      tools: "list_directory · read_file · start_process · get_file_info",
      permission: tr("marketing.useCases.useCases.readAccessToInputFilesEnabled"),
      steps: [
        tr("marketing.useCases.useCases.inspectFormatsHeadersAndPossibleDuplicates"),
        tr("marketing.useCases.useCases.runAReviewedScriptUsingExcel"),
        tr("marketing.useCases.useCases.reconcileTotalsInspectWorksheetsAndReturn"),
      ],
      proof: tr("marketing.useCases.useCases.aRealXlsxFileWithChecked"),
      limit: tr("marketing.useCases.useCases.excelOutputRequiresASuitableInstalled"),
      durable: false,
    },
    {
      slug: "desktop-automation",
      category: tr("marketing.useCases.useCases.desktopAutomation"),
      title: tr("marketing.useCases.useCases.runAnApprovedMouseAndKeyboard"),
      intro: tr("marketing.useCases.useCases.ifTheComputerAlreadyHasAn"),
      prompt: tr("marketing.useCases.useCases.onMyUnlockedTestWorkstationReview"),
      tools: "read_file · start_process · get_file_info",
      permission: tr(
        "marketing.useCases.useCases.explicitTerminalAuthorizationLocalInteractiveDesktop",
      ),
      steps: [
        tr("marketing.useCases.useCases.readTheScriptAndIdentifyWindow"),
        tr("marketing.useCases.useCases.confirmTheUserIsPresentOr"),
        tr("marketing.useCases.useCases.runTheLocalScriptWithEnabled"),
      ],
      proof: tr("marketing.useCases.useCases.scriptOutputApplicationExportAndAn"),
      limit: tr("marketing.useCases.useCases.remoteArcDoesNotCurrentlyOffer"),
      durable: false,
    },
    {
      slug: "cross-device-handoff",
      category: tr("marketing.useCases.useCases.multiComputer"),
      title: tr("marketing.useCases.useCases.fixOnOneComputerVerifyOn"),
      intro: tr("marketing.useCases.useCases.askYourAiToInspectTwo"),
      prompt: tr("marketing.useCases.useCases.useTheLinkedWindowsAndMac"),
      tools: "list_devices · read_file · edit_block · start_process",
      permission: tr("marketing.useCases.useCases.separateDeviceAuthorizationFileEditingAnd"),
      steps: [
        tr("marketing.useCases.useCases.selectEachDeviceAndValidateThat"),
        tr("marketing.useCases.useCases.runABoundedDiagnosticAndPermitted"),
        tr("marketing.useCases.useCases.verifyTestsSeparatelyOnWindowsAnd"),
      ],
      proof: tr("marketing.useCases.useCases.twoActualRunLogsTiedTo"),
      limit: tr("marketing.useCases.useCases.thereIsNoAutomaticCrossDevice"),
      durable: false,
    },
    {
      slug: "home-lab",
      category: tr("marketing.useCases.useCases.homeLab"),
      title: tr("marketing.useCases.useCases.inspectAHeadlessHostThroughIts"),
      intro: tr("marketing.useCases.useCases.inspectServicesLogsAndInstalledTooling"),
      prompt: tr("marketing.useCases.useCases.onHomeServerInspectDiskUsage"),
      tools: "list_processes · read_file · start_process · process_output",
      permission: tr("marketing.useCases.useCases.readToolsTerminalWhenCommandBased"),
      steps: [
        tr("marketing.useCases.useCases.confirmTheHostIsOnlineAnd"),
        tr("marketing.useCases.useCases.inspectTheRequestedFactsWithBounded"),
        tr("marketing.useCases.useCases.reportDiagnosisSeparatelyFromAnyProposed"),
      ],
      proof: tr("marketing.useCases.useCases.relevantLogExcerptsProcessStateAnd"),
      limit: tr("marketing.useCases.useCases.backgroundLoginConnectionNeedsAnAvailable"),
      durable: false,
    },
    {
      slug: "browser-research",
      category: tr("marketing.useCases.useCases.browserContext"),
      title: tr("marketing.useCases.useCases.readAPageYouExplicitlyShare"),
      intro: tr("marketing.useCases.useCases.shareSelectedChromeTabsAndLet"),
      prompt: tr("marketing.useCases.useCases.readTheTabISharedExtract"),
      tools: "shared_tab_list · shared_tab_read · shared_tab_open · shared_tab_act",
      permission: tr("marketing.useCases.useCases.aTabYouShareOrA"),
      steps: [
        tr("marketing.useCases.useCases.installTheCompanionAndExplicitlyShare"),
        tr("marketing.useCases.useCases.selectTheSharedTabIdAnd"),
        tr("marketing.useCases.useCases.returnTheExtractedFactsRevokeTab"),
      ],
      proof: tr("marketing.useCases.useCases.extractedTextOrTableRowsTied"),
      limit: tr("marketing.useCases.useCases.tabsStartReadOnlyClickFill"),
      durable: false,
    },
    {
      slug: "remote-support",
      category: tr("marketing.useCases.useCases.authorizedSupport"),
      title: tr("marketing.useCases.useCases.diagnoseAComputerYouAreAllowed"),
      intro: tr("marketing.useCases.useCases.readLogsAndProcessStateOn"),
      prompt: tr("marketing.useCases.useCases.onTheOfficeMiniPcInspect"),
      tools: "read_file · list_processes · start_process",
      permission: tr("marketing.useCases.useCases.readToolsForDiagnosisSeparatelyAuthorized"),
      steps: [
        tr("marketing.useCases.useCases.pairOnlyAComputerYouOwn"),
        tr("marketing.useCases.useCases.inspectFactsWithinTheGrantedTool"),
        tr("marketing.useCases.useCases.explainTheCauseAndObtainThe"),
      ],
      proof: tr("marketing.useCases.useCases.aDiagnosisBackedByTheObserved"),
      limit: tr("marketing.useCases.useCases.thisIsFileProcessSupportRather"),
      durable: false,
    },
  ];
}

function RunModeChoice({
  mode,
  onChange,
  tr,
}: {
  mode: RunMode;
  onChange: (value: RunMode) => void;
  tr: Tr;
}) {
  return (
    <div
      className="caseRunModes"
      role="group"
      aria-label={tr("marketing.useCases.useCases.chooseHowToWork")}
    >
      <button type="button" aria-pressed={mode === "connect"} onClick={() => onChange("connect")}>
        {tr("marketing.useCases.useCases.withConnect")}
      </button>
      <button type="button" aria-pressed={mode === "arc"} onClick={() => onChange("arc")}>
        {tr("marketing.useCases.useCases.withArc")}
      </button>
    </div>
  );
}
function caseTitle(slug: string, fallback: string, tr: Tr) {
  return slug === "overnight-goals"
    ? tr("marketing.useCases.useCases.delegateABoundedTaskForLater")
    : slug === "ci-follow-up"
      ? tr("marketing.useCases.useCases.checkCiAndPrepareTheNext")
      : slug === "scheduled-checks"
        ? tr("marketing.useCases.useCases.keepACheckOnADaily")
        : fallback;
}

export function UseCaseCatalog() {
  const { tr, locale } = useI18n(),
    [mode, setMode] = useRunMode(),
    [query, setQuery] = useState("");
  useEffect(() => {
    if (window.location.hash === "#video-gallery")
      window.location.replace(
        localizedWebsiteHref("/use-cases/video-creation#video-gallery", locale),
      );
  }, [locale]);
  const order = [
    "video-creation",
    "mathematical-animation",
    "blender-3d",
    "audio-transcription",
    "word-documents",
    "pdf-workflows",
    "presentation-deck",
    "spreadsheet-report",
    "image-studio",
    "website-building",
    "research-reports",
    "data-work",
    "data-visualization",
    "statistical-analysis",
    "machine-learning",
    "network-analysis",
    "ui-inspection",
    "webapp-testing",
    "mcp-integrations",
    "browser-workflows",
    "job-applications",
    "remote-development",
    "desktop-automation",
    "file-organization",
    "disk-space-cleanup",
    "scheduled-checks",
    "overnight-goals",
    "long-running-jobs",
    "ci-follow-up",
    "cross-device-handoff",
    "home-lab",
    "browser-research",
    "remote-support",
  ];
  const needle = query.trim().toLocaleLowerCase();
  const items = cases(tr)
    .filter((item) => mode === "connect" || !item.connectOnly)
    .filter(
      (item) =>
        !needle ||
        [item.title, item.intro, item.category, item.slug, ...getUseCaseSkillIds(item.slug)]
          .join(" ")
          .toLocaleLowerCase()
          .includes(needle),
    )
    .sort((a, b) => order.indexOf(a.slug) - order.indexOf(b.slug));
  return (
    <main className="useCaseCatalog revisedUseCases flatUseCaseCatalog">
      <header className="toolPageHeader">
        <span className="eyebrow">{tr("marketing.useCases.useCases.useCases")}</span>
        <h1>
          {mode === "arc"
            ? tr("marketing.useCases.useCases.whatWouldYouLikeArcTo")
            : tr("marketing.useCases.useCases.whatWouldYouLikeYourAi")}
        </h1>
        <p>{tr("marketing.useCases.useCases.createAnalyzeResearchOrAutomateChoose")}</p>
        <RunModeChoice mode={mode} onChange={setMode} tr={tr} />
      </header>
      <div className="useCaseBrowse">
        <label className="useCaseSearch">
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <circle cx="10.5" cy="10.5" r="6.5" />
            <path d="m16 16 5 5" />
          </svg>
          <span className="srOnly">{tr("marketing.useCases.useCases.searchUseCases")}</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={tr("marketing.useCases.useCases.searchRecordingsVideoWordCharts")}
          />
        </label>
        <span className="useCaseResultCount" aria-live="polite">
          {items.length} {tr("marketing.useCases.useCases.useCases2")}
        </span>
      </div>
      <section
        className="useCaseGrid visualUseCaseGrid"
        aria-label={tr("marketing.useCases.useCases.workflows")}
      >
        {items.map((item, index) => (
          <a
            className="useCaseCard"
            key={item.slug}
            href={localizedWebsiteHref("/use-cases/" + item.slug + "?mode=" + mode, locale)}
          >
            <div className="useCaseCardPreview">
              <img
                data-use-case-art={item.slug}
                src={"/use-case-art/" + item.slug + ".svg"}
                alt=""
                width="640"
                height="360"
                loading={index < 6 ? "eager" : "lazy"}
                decoding="async"
              />
            </div>
            <div className="useCaseCardBody">
              <span className="eyebrow">{item.category}</span>
              <h2>{mode === "arc" ? caseTitle(item.slug, item.title, tr) : item.title}</h2>
              <p className="useCaseCardIntro">
                {mode === "arc"
                  ? ARC_USE_CASES[item.slug as UseCaseSlug].intro[locale]
                  : item.intro}
              </p>
              <span className="caseMode">
                {mode === "arc"
                  ? tr("marketing.useCases.useCases.arcAppsDevicesTasks")
                  : item.connectOnly
                    ? tr("marketing.useCases.useCases.connectBrowserRunner")
                    : item.durable
                      ? tr("marketing.useCases.useCases.connectSavedTask")
                      : tr("marketing.useCases.useCases.connectDirectTools")}
              </span>
            </div>
            <b aria-hidden="true">→</b>
          </a>
        ))}
      </section>
      {items.length === 0 && (
        <div className="useCaseEmpty">
          <h2>{tr("marketing.useCases.useCases.tryAnotherTaskOrKeyword")}</h2>
          <p>{tr("marketing.useCases.useCases.searchAResultSuchAsA")}</p>
          <button type="button" onClick={() => setQuery("")}>
            {tr("marketing.useCases.useCases.showAllUseCases")}
          </button>
        </div>
      )}
      <footer className="catalogFooter">
        <p>{tr("marketing.useCases.useCases.workRunsThroughTheToolsAnd")}</p>
        <a href={localizedWebsiteHref("/docs/skills", locale)}>
          {tr("marketing.useCases.useCases.exploreTheSkills")} →
        </a>
      </footer>
    </main>
  );
}

export function UseCaseDetail({ slug }: { slug: UseCaseSlug }) {
  const { tr, locale } = useI18n();
  const item = cases(tr).find((entry) => entry.slug === slug)!,
    [chosenMode, setMode] = useRunMode(),
    arc = ARC_USE_CASES[slug];
  // A Connect-only workflow always shows its Connect path.
  const mode: RunMode = item.connectOnly ? "connect" : chosenMode;
  const arcHref = arcChatHref(arcUseCasePrompt(slug, locale), "use-case:" + slug);
  const arcProof =
    slug === "ci-follow-up"
      ? tr("marketing.useCases.useCases.theActualCommitWorkflowStatusInspected")
      : slug === "scheduled-checks"
        ? tr("marketing.useCases.useCases.perRunTimestampsActualResourceObservations")
        : item.proof;
  return (
    <main
      className={
        "technicalDoc revisedUseCases" +
        (slug === "video-creation"
          ? " videoCreationCase"
          : slug === "image-studio"
            ? " imageCreationCase"
            : "")
      }
    >
      <header className="articleHeader">
        <a className="caseBack" href={localizedWebsiteHref("/use-cases?mode=" + mode, locale)}>
          ← {tr("marketing.useCases.useCases.allUseCases")}
        </a>
        <span className="eyebrow">{item.category}</span>
        <h1>{mode === "arc" ? caseTitle(slug, item.title, tr) : item.title}</h1>
        <p>{mode === "arc" ? arc.intro[locale] : item.intro}</p>
        {item.connectOnly ? (
          <p className="caseConnectOnly">
            {tr("marketing.useCases.useCases.availableThroughConnectFromTheAi")}{" "}
            <a href={localizedWebsiteHref("/connect-ai", locale)}>
              {tr("marketing.useCases.useCases.connectYourAi")} →
            </a>
          </p>
        ) : (
          <RunModeChoice mode={mode} onChange={setMode} tr={tr} />
        )}
        {mode === "arc" ? (
          <div className="caseStartActions">
            <a className="primaryButton" href={arcHref}>
              {tr("marketing.useCases.useCases.startInArc")} ↗
            </a>
            <span>{tr("marketing.useCases.useCases.reviewThePreparedRequestBeforeSending")}</span>
          </div>
        ) : (
          item.durable && <TaskAvailability />
        )}
      </header>
      {slug === "video-creation" && <MediaDemoGallery />}
      {slug === "image-studio" && <ImageDemoGallery />}
      <article className="technicalArticle useCaseDetailBody">
        {mode === "arc" ? (
          <>
            <section>
              <h2>{tr("marketing.useCases.useCases.askArc")}</h2>
              <blockquote className="casePrompt">{arc.prompt[locale]}</blockquote>
              <p>{tr("marketing.useCases.useCases.theButtonOpensADraftIn")}</p>
            </section>
            <section className="caseArcRequirements">
              <h2>{tr("marketing.useCases.useCases.whatToConnect")}</h2>
              <p>{arc.requires[locale]}</p>
              <a href={localizedWebsiteHref("/docs/apps", locale)}>
                {tr("marketing.useCases.useCases.appsGuide")} →
              </a>
              <a href={localizedWebsiteHref("/docs/devices", locale)}>
                {tr("marketing.useCases.useCases.deviceGuide")} →
              </a>
            </section>
            <section>
              <h2>{tr("marketing.useCases.useCases.howArcHandlesTheWork")}</h2>
              <ol>
                <li>{tr("marketing.useCases.useCases.resolveTheActualAccountComputerFiles")}</li>
                <li>
                  {arc.kind === "task"
                    ? tr("marketing.useCases.useCases.confirmTimingThenSaveSelfContained")
                    : arc.kind === "routine"
                      ? tr("marketing.useCases.useCases.confirmTheScheduleAndTimezoneSave")
                      : tr("marketing.useCases.useCases.useTheAuthorizedToolsToPerform")}
                </li>
                <li>{tr("marketing.useCases.useCases.verifyTheRequestedOutputAndReturn")}</li>
              </ol>
            </section>
            <section>
              <h2>{tr("marketing.useCases.useCases.whatAUsefulResultContains")}</h2>
              <p>{arcProof}</p>
              {arc.kind !== "direct" && (
                <p>{tr("marketing.useCases.useCases.aSavedTaskOrRoutineReturns")}</p>
              )}
            </section>
            <section>
              <h2>{tr("marketing.useCases.useCases.knowTheBoundary")}</h2>
              <p>{arc.boundary[locale]}</p>
              <p>{tr("marketing.useCases.useCases.arcModelUseHasRunAnd")}</p>
            </section>
            <footer className="articleEndLinks">
              <a href={arcHref}>{tr("marketing.useCases.useCases.startInArc")} ↗</a>
              <a href={localizedWebsiteHref("/docs/arc", locale)}>
                {tr("marketing.useCases.useCases.arcGuide")} →
              </a>
              <a href={localizedWebsiteHref("/docs/skills", locale)}>
                {tr("marketing.useCases.useCases.reuseASkill")} →
              </a>
            </footer>
          </>
        ) : (
          <>
            <section>
              <h2>{tr("marketing.useCases.useCases.askInYourAiChat")}</h2>
              <blockquote className="casePrompt">{item.prompt}</blockquote>
              <p>{tr("marketing.useCases.useCases.thisIsASampleRequestNot")}</p>
            </section>
            <section>
              <h2>{tr("marketing.useCases.useCases.howTheWorkProceeds")}</h2>
              <ol>
                {item.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </section>
            <section>
              <h2>{tr("marketing.useCases.useCases.toolsAndPermissions")}</h2>
              <div className="caseTools">
                <code>{item.tools}</code>
              </div>
              <p>{item.permission}</p>
              <p>{tr("marketing.useCases.useCases.permissionsBelongToTheDeviceTask")}</p>
            </section>
            <section>
              <h2>{tr("marketing.useCases.useCases.whatAUsefulResultContains")}</h2>
              <p>{item.proof}</p>
              {item.durable && (
                <p>{tr("marketing.useCases.useCases.getTheSavedStatusAndRecent")}</p>
              )}
            </section>
            <section>
              <h2>{tr("marketing.useCases.useCases.knowTheBoundary")}</h2>
              <p>{item.limit}</p>
              <p>{tr("marketing.useCases.useCases.activeToolResultsPassThroughThe")}</p>
            </section>
            <footer className="articleEndLinks">
              <a href="/connect-ai">{tr("marketing.useCases.useCases.connectYourAi2")} →</a>
              <a href="/docs/long-running-work">
                {tr("marketing.useCases.useCases.longRunningWork")} →
              </a>
              <a href="/docs#docs-sandbox">
                {tr("marketing.useCases.useCases.executionBoundaries")} →
              </a>
            </footer>
          </>
        )}
      </article>
    </main>
  );
}
