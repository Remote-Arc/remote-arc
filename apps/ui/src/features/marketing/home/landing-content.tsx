import { APP_WORKFLOW_EXAMPLES } from "./app-workflow-examples.js";
import { LOCAL_CREATIVE_EXAMPLES } from "./local-creative-examples.js";
import { AppsDirectory } from "./apps-directory.js";
import React, { useEffect, useRef, useState } from "react";
import { useI18n } from "../../../hooks/use-i18n.js";
import { ProductIcon } from "../../../components/product-icon.js";
import { InteractiveWorkDemo } from "./landing-interactive-demo.js";
import { ArcTeaser } from "../arc/arc-future.js";
import { InstallCommands } from "../../../components/install-commands.js";
import { localizedWebsiteHref } from "../../../lib/marketing-paths.js";
import "../../../styles/marketing/home/landing-content.css";

export function HeroHeadline({ mode = "arc" }: { mode?: "connect" | "arc" }) {
  const { tr, locale } = useI18n();
  const arc = mode === "arc";
  return (
    <TypewriterHeadline
      key={locale + mode}
      fixedLine={
        arc
          ? tr("marketing.home.landingContent.yourAiAgent")
          : tr("marketing.home.landingContent.yourAi")
      }
      accessible={
        arc
          ? tr("marketing.home.landingContent.remoteArcYourAiAgentReady")
          : tr("marketing.home.landingContent.remoteArcYourAiConnectedIn")
      }
      phrases={
        arc
          ? [
              tr("marketing.home.landingContent.readyAroundTheClock"),
              tr("marketing.home.landingContent.realWorkRealResults"),
              tr("marketing.home.landingContent.keepWorkMoving"),
            ]
          : [
              tr("marketing.home.landingContent.connectedInSeconds"),
              tr("marketing.home.landingContent.yourToolsYourRules"),
              tr("marketing.home.landingContent.readyForRealWork"),
            ]
      }
    />
  );
}

export function HomeHeroCopy({
  mode,
  arcAvailable,
  arcHref,
  connectHref,
}: {
  mode: "connect" | "arc";
  arcAvailable: boolean;
  arcHref: string;
  connectHref: string;
}) {
  const { tr, locale } = useI18n(),
    arc = mode === "arc";
  return (
    <div className="heroCopy" data-product={mode}>
      {/* The visible brand next to the headline lets the rendered page name Remote Arc, not only the server shell. */}
      <span className="eyebrow heroProductLabel">
        <i />
        REMOTE ARC ·{" "}
        {arc
          ? tr("marketing.home.landingContent.nextGenerationAiAgent")
          : tr("marketing.home.landingContent.aiInfrastructure")}
      </span>
      <HeroHeadline mode={mode} />
      <p>
        {arc
          ? tr("marketing.home.landingContent.giveArcAnOutcomeYourAi")
          : tr("marketing.home.landingContent.connectChatgptClaudeGeminiOrCursor")}
      </p>
      <div className="landingActions">
        <a className="primaryButton marketingPrimary" href={arc ? arcHref : connectHref}>
          {arc
            ? arcAvailable
              ? tr("marketing.home.landingContent.startYourFreeTrial")
              : tr("marketing.home.landingContent.exploreArc")
            : tr("marketing.home.landingContent.connectYourAi")}
          <ProductIcon name="arrowUpRight" size={16} />
        </a>
        <a
          className="marketingSecondary"
          href={arc ? localizedWebsiteHref("/arc", locale) : "#how-it-works"}
        >
          {arc
            ? tr("marketing.home.landingContent.meetArc")
            : tr("marketing.home.landingContent.seeItInAction")}
          <ProductIcon name="arrowUpRight" size={15} />
        </a>
      </div>
      {!arc && <InstallCommands />}
      <div className="heroSupportingInfo">
        <div className="heroProofLine">
          <span className="heroAccountFact">
            <ProductIcon name="check" size={14} />
            <span>
              {arc
                ? tr("marketing.home.landingContent.noModelApiKeyRequired")
                : tr("marketing.home.landingContent.worksWithYourExistingAiAccount")}
            </span>
          </span>
          <span className="heroPlatforms">Windows · Mac · Linux</span>
        </div>
        <a className="heroSecurityLink" href="/security-model">
          <ProductIcon name="shield" size={14} />
          <span>{tr("marketing.home.landingContent.scopedAccessDevicePoliciesLocalUndo")}</span>
          <ProductIcon name="arrowUpRight" size={12} />
        </a>
        <a className="heroTaskAvailability" href={arc ? "/connect-ai" : "/arc"}>
          <img src={arc ? "/connect-logo.svg" : "/remote-arc.svg"} width="14" height="14" alt="" />
          <span>
            {arc
              ? tr("marketing.home.landingContent.alreadyUseChatgptOrClaudeExplore")
              : tr("marketing.home.landingContent.wantAnAiAgentMeetArc")}
          </span>
          <ProductIcon name="arrowUpRight" size={12} />
        </a>
      </div>
    </div>
  );
}

function HomeSecurityIntro() {
  const { tr } = useI18n();
  return (
    <section
      className="homeSecurityIntro"
      aria-label={tr("marketing.home.landingContent.controlAndSecurity")}
    >
      <header>
        <div>
          <span className="eyebrow">
            {tr("marketing.home.landingContent.yourDevicesYourRules")}
          </span>
          <h2>{tr("marketing.home.landingContent.letAiWorkKeepControl")}</h2>
        </div>
        <a href="/security-model">
          {tr("marketing.home.landingContent.exploreTheSecurityModel")}{" "}
          <span aria-hidden="true">↗</span>
        </a>
      </header>
      <div className="homeSecurityCapabilities">
        <article>
          <ProductIcon name="shield" size={19} />
          <h3>{tr("marketing.home.landingContent.accessYouDefine")}</h3>
          <p>{tr("marketing.home.landingContent.chooseToolsAndTrustedDirectoriesFor")}</p>
        </article>
        <article>
          <ProductIcon name="device" size={19} />
          <h3>{tr("marketing.home.landingContent.workRunsOnYourComputers")}</h3>
          <p>{tr("marketing.home.landingContent.useTheProjectsAndSoftwareAlready")}</p>
        </article>
        <article>
          <ProductIcon name="history" size={19} />
          <h3>{tr("marketing.home.landingContent.activityYouCanInspect")}</h3>
          <p>{tr("marketing.home.landingContent.inspectToolActivityAndResultsRestore")}</p>
        </article>
      </div>
    </section>
  );
}

function TypewriterHeadline({
  phrases,
  fixedLine,
  accessible,
}: {
  phrases: [string, ...string[]];
  fixedLine: string;
  accessible: string;
}) {
  const [frame, setFrame] = useState({ index: 0, length: phrases[0].length, deleting: false });
  const [reducedMotion, setReducedMotion] = useState(
    () =>
      typeof window === "undefined" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [visible, setVisible] = useState(() => typeof document === "undefined" || !document.hidden);
  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onMotion = () => setReducedMotion(motion.matches);
    const onVisibility = () => setVisible(!document.hidden);
    motion.addEventListener("change", onMotion);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      motion.removeEventListener("change", onMotion);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);
  const phrase = phrases[frame.index] ?? phrases[0];
  useEffect(() => {
    if (reducedMotion || !visible) return;
    const delay = frame.deleting ? 48 : frame.length === phrase.length ? 2600 : 100;
    const timer = window.setTimeout(
      () =>
        setFrame((previous) => {
          if (previous.deleting)
            return previous.length === 0
              ? { index: (previous.index + 1) % phrases.length, length: 0, deleting: false }
              : { ...previous, length: previous.length - 1 };
          return previous.length >= phrase.length
            ? { ...previous, deleting: true }
            : { ...previous, length: previous.length + 1 };
        }),
      delay,
    );
    return () => window.clearTimeout(timer);
  }, [frame.deleting, frame.length, phrase.length, phrases.length, reducedMotion, visible]);
  return (
    <div className="heroHeadlineGroup">
      <h1 className="heroHeadline">
        <span className="heroAccessible">{accessible}</span>
        <span aria-hidden="true">
          <span className="heroFixedLine">{fixedLine}</span>
          <span className="heroTypeLine">
            {phrases.map((value) => (
              <span className="heroTypeMeasure" key={value}>
                {value}
              </span>
            ))}
            <span className="heroTypeVisible">
              {reducedMotion ? phrase : phrase.slice(0, frame.length)}
            </span>
          </span>
        </span>
      </h1>
    </div>
  );
}

export function ConnectionFilm() {
  const { tr, locale } = useI18n();
  const videoRef = useRef<HTMLVideoElement>(null);
  const autoplayAttempted = useRef(false);
  const [chapter, setChapter] = useState(0);
  const chapters = [
    {
      at: 0,
      title: tr("marketing.home.landingContent.chooseYourClient"),
      body: tr("marketing.home.landingContent.openTheConnectionPathForChatgpt"),
    },
    {
      at: 7,
      title: tr("marketing.home.landingContent.authorizeInTheClient"),
      body: tr("marketing.home.landingContent.theClientOpensRemoteArcOauth"),
    },
    {
      at: 14,
      title: tr("marketing.home.landingContent.reuseYourDevices"),
      body: tr("marketing.home.landingContent.askInYourAiChatThe"),
    },
  ] as const;
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onMotion = () => {
      if (motion.matches) video.pause();
    };
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        if (!entry.isIntersecting) video.pause();
        else if (!motion.matches && !autoplayAttempted.current) {
          autoplayAttempted.current = true;
          void video.play().catch(() => undefined);
        }
      },
      { threshold: 0.45 },
    );
    const onVisibility = () => {
      if (document.hidden) video.pause();
    };
    observer.observe(video);
    motion.addEventListener("change", onMotion);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      observer.disconnect();
      motion.removeEventListener("change", onMotion);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);
  return (
    <div className="connectionFilm">
      <div className="connectionFilmHeader">
        <span className="filmLiveMark" aria-hidden="true" />
        <strong>{tr("marketing.home.landingContent.insideRemoteArc")}</strong>
        <span>{tr("marketing.home.landingContent.productWalkthrough")}</span>
      </div>
      <video
        ref={videoRef}
        muted
        playsInline
        controls
        preload="metadata"
        poster="/demos/connect-workflow-poster.webp"
        aria-label={tr("marketing.home.landingContent.recordedRemoteArcInterfaceWalkthroughWith")}
        onTimeUpdate={() => {
          const time = videoRef.current?.currentTime || 0;
          setChapter(time >= 14 ? 2 : time >= 7 ? 1 : 0);
        }}
      >
        <source src="/demos/connect-workflow.webm" type="video/webm" />
        <source src="/demos/connect-workflow.mp4" type="video/mp4" />
        <track
          kind="captions"
          src="/demos/connect-workflow-en.vtt"
          srcLang="en"
          label="English"
          default={locale === "en"}
        />
        <track
          kind="captions"
          src="/demos/connect-workflow-zh.vtt"
          srcLang="zh"
          label="中文"
          default={locale === "zh"}
        />
      </video>
      <div className="filmChapters" aria-label={tr("marketing.home.landingContent.videoChapters")}>
        {chapters.map((item, index) => (
          <button
            type="button"
            key={item.at}
            aria-pressed={chapter === index}
            onClick={() => {
              if (videoRef.current) videoRef.current.currentTime = item.at;
              setChapter(index);
            }}
          >
            <span>{"0" + (index + 1)}</span>
            {item.title}
          </button>
        ))}
      </div>
      <p className="filmDescription">{(chapters[chapter] ?? chapters[0]).body}</p>
      <p className="filmDisclosure">
        {tr("marketing.home.landingContent.recordedFromTheRealProductUi")}
      </p>
    </div>
  );
}

/** Reused by the homepage and the Remote MCP guide so example behavior stays identical. */
export function LandingInteractiveDemo() {
  const { tr } = useI18n();
  const scenarios = [
    {
      id: "code",
      label: tr("marketing.home.landingContent.fixAProject"),
      request: tr("marketing.home.landingContent.onMyWorkstationFindTheFailing"),
      result: tr("marketing.home.landingContent.anActualChangeInYourCheckout"),
      steps: [
        tr("marketing.home.landingContent.findTheNamedComputerAndIts"),
        tr("marketing.home.landingContent.readTheCodeAndReproduceThe"),
        tr("marketing.home.landingContent.editTheAffectedFilesAndRerun"),
        tr("marketing.home.landingContent.returnTheDiffEvidenceAndRemaining"),
      ],
      tools: "read_file · edit_block · start_process",
      permission: tr("marketing.home.landingContent.fileEditingTerminal"),
      link: "remote-development",
    },
    ...LOCAL_CREATIVE_EXAMPLES.map((example) => ({
      id: example.id,
      label: tr(example.label),
      request: tr(example.request),
      result: tr(example.result),
      permission: tr(example.permission),
      link: example.link,
    })),
    ...APP_WORKFLOW_EXAMPLES.map((example) => ({
      id: example.id,
      label: tr(example.label),
      request: tr(example.request),
      result: tr(example.result),
      permission: tr(example.permission),
      link: "remote-development",
    })),
    {
      id: "slides",
      label: tr("marketing.home.landingContent.createAPpt"),
      request: tr("marketing.home.landingContent.useMyExistingNotesAndCharts"),
      result: tr("marketing.home.landingContent.anEditablePresentationSavedOnThe"),
      steps: [
        tr("marketing.home.landingContent.inspectTheNotesChartsAndInstalled"),
        tr("marketing.home.landingContent.generateTheDeckInTheApproved"),
        tr("marketing.home.landingContent.inspectTheSlideCountAndDocument"),
      ],
      tools: "read_file · start_process · get_file_info",
      permission: tr("marketing.home.landingContent.filesAuthorizedTerminalInstalledPptxLibrary"),
      link: "presentation-deck",
    },
    {
      id: "excel",
      label: tr("marketing.home.landingContent.buildAnExcelReport"),
      request: tr("marketing.home.landingContent.combineMyMonthlyCsvsIntoAn"),
      result: tr("marketing.home.landingContent.aCheckedXlsxWorkbookWithReconciled"),
      steps: [
        tr("marketing.home.landingContent.inspectSourceCsvsAndTheirColumns"),
        tr("marketing.home.landingContent.buildTheWorkbookWithLocallyInstalled"),
        tr("marketing.home.landingContent.reconcileTotalsAndCheckTheOutput"),
      ],
      tools: "read_file · start_process · get_file_info",
      permission: tr("marketing.home.landingContent.filesAuthorizedTerminalInstalledXlsxLibrary"),
      link: "spreadsheet-report",
    },
  ] as const;
  return <InteractiveWorkDemo scenarios={scenarios} />;
}

/** The homepage's existing AI / MCP / computer architecture illustration. */
export function LandingArchitectureDiagram() {
  const { tr } = useI18n();
  return (
    <>
      <div className="goalContract">
        <header>
          <span>{tr("marketing.home.landingContent.yourChatRealTools")}</span>
          <strong>{tr("marketing.home.landingContent.oneChatRealExecution")}</strong>
        </header>
        <dl>
          <div>
            <dt>{tr("marketing.home.landingContent.theBrain")}</dt>
            <dd>{tr("marketing.home.landingContent.yourExistingAiChatAndModel")}</dd>
          </div>
          <div>
            <dt>{tr("marketing.home.landingContent.theBridge")}</dt>
            <dd>{tr("marketing.home.landingContent.remoteArcMcpDevicePermissionsAnd")}</dd>
          </div>
          <div>
            <dt>{tr("marketing.home.landingContent.theTools")}</dt>
            <dd>{tr("marketing.home.landingContent.yourComputerFilesTerminalAndProcesses")}</dd>
          </div>
        </dl>
        <div className="goalCycle">
          <span>{tr("marketing.home.landingContent.think")}</span>
          <b>→</b>
          <span>{tr("marketing.home.landingContent.useTools")}</span>
          <b>→</b>
          <span>{tr("marketing.home.landingContent.verify")}</span>
          <b>↺</b>
        </div>
        <p>{tr("marketing.home.landingContent.noSeparateModelApiKeyIs")}</p>
      </div>
    </>
  );
}

export function LandingContent() {
  const { tr } = useI18n();
  const [faqCategory, setFaqCategory] = useState(0);
  const faqGroups: { id: string; title: string; entries: [string, React.ReactNode][] }[] = [
    {
      id: "product",
      title: tr("marketing.home.landingContent.productSetup"),
      entries: [
        [
          tr("marketing.home.landingContent.whatIsRemoteArcIsIt"),
          <>
            {tr("marketing.home.landingContent.remoteArcConnectsAiToYour")}{" "}
            <a href="/use-cases">{tr("marketing.home.landingContent.exploreWorkflows")} →</a>
          </>,
        ],
        [
          tr("marketing.home.landingContent.doINeedAPaidAi"),
          <>
            {tr("marketing.home.landingContent.youDoNotNeedToBring")}{" "}
            <a href="/pricing">{tr("marketing.home.landingContent.seePlans")} →</a>
          </>,
        ],
        [
          tr("marketing.home.landingContent.iInstalledTheChatgptPluginHow"),
          <>
            {tr("marketing.home.landingContent.tryInChatOpensAConversation")}{" "}
            <a href="/install/chatgpt">{tr("marketing.home.landingContent.chatgptSetupGuide")} →</a>
          </>,
        ],
        [
          tr("marketing.home.landingContent.whichComputersCanIConnect"),
          tr("marketing.home.landingContent.windowsMacosAndLinuxComputersWith"),
        ],
        [
          tr("marketing.home.landingContent.canIUseItFromMy"),
          tr("marketing.home.landingContent.yesThroughAnAiClientThat"),
        ],
        [
          tr("marketing.home.landingContent.whatDoesItCost"),
          <>
            {tr("marketing.home.landingContent.connectHasAMonthlyToolCall")}{" "}
            <a href="/pricing">{tr("marketing.home.landingContent.seePlans")} →</a>
          </>,
        ],
      ],
    },
    {
      id: "security",
      title: tr("marketing.home.landingContent.securityControl"),
      entries: [
        [
          tr("marketing.home.landingContent.howMuchAccessAmIGiving"),
          <>
            {tr("marketing.home.landingContent.youChooseToolsPerDeviceWhile")}{" "}
            <a href="/security-model">
              {tr("marketing.home.landingContent.readTheSecurityModel")} →
            </a>
          </>,
        ],
        [
          tr("marketing.home.landingContent.doIHaveToOpenA"),
          tr("marketing.home.landingContent.noInboundRemoteArcPortOr"),
        ],
        [
          tr("marketing.home.landingContent.doMyFilesStayPrivateWhat"),
          <>
            {tr("marketing.home.landingContent.requestedFileContentToolArgumentsAnd")}{" "}
            <a href="/privacy">{tr("marketing.home.landingContent.readDataHandling")} →</a>
          </>,
        ],
        [
          tr("marketing.home.landingContent.isPauseAiMcpTheSame"),
          <>
            {tr("marketing.home.landingContent.noPauseAiMcpIsAccount")}{" "}
            <a href="/overview">{tr("marketing.home.landingContent.manageDevices")} →</a>
          </>,
        ],
        [
          tr("marketing.home.landingContent.areTheCredentialsForAiClients"),
          tr("marketing.home.landingContent.bothButTheyAreSeparateEach"),
        ],
        [
          tr("marketing.home.landingContent.canIRevokeAccessOrStop"),
          tr("marketing.home.landingContent.useDashboardToRevokeADevice"),
        ],
        [
          tr("marketing.home.landingContent.canIUndoEverythingTheAi"),
          tr("marketing.home.landingContent.localUndoCanRestoreSupportedFile"),
        ],
      ],
    },
    {
      id: "tasks",
      title: tr("marketing.home.landingContent.tasksAvailability"),
      entries: [
        [
          tr("marketing.home.landingContent.doesEveryRequestBecomeATask"),
          tr("marketing.home.landingContent.noFileReadsAndShortCommands"),
        ],
        [
          tr("marketing.home.landingContent.canTheAiKeepWorkingWhile"),
          <>
            {tr("marketing.home.landingContent.whenItLaunchesArcIsDesigned")}{" "}
            <a href="/docs/long-running-work">
              {tr("marketing.home.landingContent.seeRequirements")} →
            </a>
          </>,
        ],
        [
          tr("marketing.home.landingContent.whatIfTheComputerSleepsDisconnects"),
          tr("marketing.home.landingContent.newLocalWorkWaitsWhileThe"),
        ],
      ],
    },
  ];
  const currentFaq = faqGroups[faqCategory] ?? faqGroups[0]!;

  return (
    <div className="landingContent">
      <section className="landingWork sectionBlock" id="how-it-works">
        <header className="modernSectionIntro">
          <span className="eyebrow">
            {tr("marketing.home.landingContent.justChatGetThingsDone")}
          </span>
          <h2>{tr("marketing.home.landingContent.donTJustChatWatchAi")}</h2>
          <p>{tr("marketing.home.landingContent.useTheAiChatYouAlready")}</p>
          <div className="chatSellingPoints">
            <span>{tr("marketing.home.landingContent.noExtraModelApiKey")}</span>
            <span>{tr("marketing.home.landingContent.noApiTokenTopUps")}</span>
            <span>{tr("marketing.home.landingContent.compatibleFreeChatPlansWorkToo")}</span>
          </div>
        </header>
        <LandingInteractiveDemo />
      </section>

      <ArcTeaser />

      <AppsDirectory />

      <section className="landingUnexpected sectionBlock" id="unexpected-workflows">
        <header className="modernSectionIntro">
          <span className="eyebrow">{tr("marketing.home.landingContent.aiChatRealWorkflows")}</span>
          <h2>{tr("marketing.home.landingContent.allThisFromASimpleAi")}</h2>
          <p>{tr("marketing.home.landingContent.noSeparateAgentWorkspaceOrModel")}</p>
        </header>
        <div className="unexpectedGrid">
          <a className="unexpectedCard" href="/use-cases/presentation-deck">
            <span className="unexpectedSymbol" aria-hidden="true">
              ▣
            </span>
            <span className="eyebrow">{tr("marketing.home.landingContent.documentsSlides")}</span>
            <h3>{tr("marketing.home.landingContent.aFolderOfNotesBecomesAn")}</h3>
            <p>{tr("marketing.home.landingContent.generateADeckFromLocalOutlines")}</p>
            <span className="unexpectedLink">
              {tr("marketing.home.landingContent.exploreSlides")} ↗
            </span>
          </a>
          <a className="unexpectedCard" href="/use-cases/spreadsheet-report">
            <span className="unexpectedSymbol" aria-hidden="true">
              ▦
            </span>
            <span className="eyebrow">
              {tr("marketing.home.landingContent.hundredsOfFilesExcel")}
            </span>
            <h3>{tr("marketing.home.landingContent.turnScatteredRecordsIntoAChecked")}</h3>
            <p>{tr("marketing.home.landingContent.deduplicateLocalCsvsBuildFormulasAnd")}</p>
            <span className="unexpectedLink">
              {tr("marketing.home.landingContent.exploreSpreadsheets")} ↗
            </span>
          </a>
          <a className="unexpectedCard" href="/use-cases/desktop-automation">
            <span className="unexpectedSymbol" aria-hidden="true">
              ⌖
            </span>
            <span className="eyebrow">{tr("marketing.home.landingContent.localGuiScripts")}</span>
            <h3>{tr("marketing.home.landingContent.automateTheSoftwareThatHasNo")}</h3>
            <p>{tr("marketing.home.landingContent.runAReviewedMouseAndKeyboard")}</p>
            <span className="unexpectedLink">
              {tr("marketing.home.landingContent.seeTheBoundaries")} ↗
            </span>
          </a>
          <a className="unexpectedCard" href="/use-cases/cross-device-handoff">
            <span className="unexpectedSymbol" aria-hidden="true">
              ⇄
            </span>
            <span className="eyebrow">{tr("marketing.home.landingContent.windowsMac")}</span>
            <h3>{tr("marketing.home.landingContent.oneChatTwoComputersIndependentlyVerified")}</h3>
            <p>{tr("marketing.home.landingContent.diagnoseAWindowsBuildAndVerify")}</p>
            <span className="unexpectedLink">
              {tr("marketing.home.landingContent.exploreMultiDeviceWork")} ↗
            </span>
          </a>
        </div>
        <p className="unexpectedDisclosure">
          {tr("marketing.home.landingContent.presentationAndSpreadsheetWorkUsesFile")}
        </p>
      </section>

      <div className="sectionResourceLinks">
        <a href="/remote-mcp">{tr("marketing.home.landingContent.newToRemoteMcpReadThe")} →</a>
        <a href="/docs/mcp">{tr("marketing.home.landingContent.mcpTechnicalReference")} →</a>
      </div>

      <section className="landingSetup sectionBlock" id="connect-once">
        <header className="modernSectionIntro">
          <span className="eyebrow">{tr("marketing.home.landingContent.beyondTheConnection")}</span>
          <h2>
            {tr("marketing.home.landingContent.moreThanAnMcpServer")}
            <br />
            <span>{tr("marketing.home.landingContent.controlledAccessToYourComputersWith")}</span>
          </h2>
          <p>{tr("marketing.home.landingContent.mcpConnectsYourAiToTools")}</p>
        </header>
        <div className="platformCapabilities">
          <article>
            <span className="platformCapabilityIndex">
              01 · {tr("marketing.home.landingContent.connect")}
            </span>
            <h3>{tr("marketing.home.landingContent.yourRealWorkingEnvironment")}</h3>
            <p>{tr("marketing.home.landingContent.reachYourPairedWindowsMacosAnd")}</p>
            <div className="platformCapabilityTags">
              <span>{tr("marketing.home.landingContent.multipleDevices")}</span>
              <span>{tr("marketing.home.landingContent.oauthAccess")}</span>
            </div>
            <a href="/connect-ai">{tr("marketing.home.landingContent.connectYourAi")} →</a>
          </article>
          <article>
            <span className="platformCapabilityIndex">
              02 · {tr("marketing.home.landingContent.execute")}
            </span>
            <h3>{tr("marketing.home.landingContent.savedWorkThatKeepsMoving")}</h3>
            <p>{tr("marketing.home.landingContent.trackLongCommandsAndRunApproved")}</p>
            <div className="platformCapabilityTags">
              <span>{tr("marketing.home.landingContent.tasks")}</span>
              <span>{tr("marketing.home.landingContent.progressResults")}</span>
            </div>
            <a href="/docs/long-running-work">
              {tr("marketing.home.landingContent.exploreTaskExecution")} →
            </a>
          </article>
          <article>
            <span className="platformCapabilityIndex">
              03 · {tr("marketing.home.landingContent.control")}
            </span>
            <h3>{tr("marketing.home.landingContent.authorityStaysWithYou")}</h3>
            <p>{tr("marketing.home.landingContent.chooseToolsAndTrustedWriteLocations")}</p>
            <div className="platformCapabilityTags">
              <span>{tr("marketing.home.landingContent.devicePolicies")}</span>
              <span>Local Undo</span>
            </div>
            <a href="/security-model">
              {tr("marketing.home.landingContent.understandTheBoundaries")} →
            </a>
          </article>
        </div>
      </section>

      <section className="landingControl sectionBlock" id="your-controls">
        <header className="modernSectionIntro">
          <span className="eyebrow">
            {tr("marketing.home.landingContent.builtForTrustControlByDesign")}
          </span>
          <h2>{tr("marketing.home.landingContent.realComputerAccessRealBoundaries")}</h2>
          <p>{tr("marketing.home.landingContent.everyActionAnAiTakesPasses")}</p>
        </header>
        <ol className="trustChain">
          {[
            [
              tr("marketing.home.landingContent.whichAi"),
              tr("marketing.home.landingContent.eachAiClientGetsItsOwn"),
              tr("marketing.home.landingContent.oauthGrant"),
            ],
            [
              tr("marketing.home.landingContent.whichComputer"),
              tr("marketing.home.landingContent.eachComputerHasItsOwnCredential"),
              tr("marketing.home.landingContent.deviceCredential"),
            ],
            [
              tr("marketing.home.landingContent.whichTools"),
              tr("marketing.home.landingContent.toolsAreSwitchedOnPerDevice"),
              "Safe · Developer · Full",
            ],
            [
              tr("marketing.home.landingContent.whichFolders"),
              tr("marketing.home.landingContent.writesStayInsideFoldersYouTrust"),
              tr("marketing.home.landingContent.trustedWriteLocations"),
            ],
            [
              tr("marketing.home.landingContent.whatGetsDeleted"),
              tr("marketing.home.landingContent.safetyGuardWorksOutWhereEvery"),
              "Safety Guard 2.0",
            ],
          ].map(([title, text, chip], index) => (
            <li key={title}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <h3>{title}</h3>
              <p>{text}</p>
              <code>{chip}</code>
            </li>
          ))}
        </ol>
        <div className="trustAfter">
          <strong>{tr("marketing.home.landingContent.afterItRuns")}</strong>
          <span>{tr("marketing.home.landingContent.localUndoForSupportedFileEdits")}</span>
          <span>{tr("marketing.home.landingContent.activityAndApprovalHistory")}</span>
          <span>{tr("marketing.home.landingContent.pauseOrFullyDisconnect")}</span>
        </div>
        <div className="safetyExample">
          <div className="safetyStory">
            <span className="eyebrow">SAFETY GUARD 2.0</span>
            <h3>{tr("marketing.home.landingContent.roomToWorkBoundariesYouSet")}</h3>
            <p>{tr("marketing.home.landingContent.aiCanClearBuildCachesTemp")}</p>
            <a className="safetyLearnLink" href="/security-model">
              {tr("marketing.home.landingContent.seeHowAccessIsControlled")} →
            </a>
          </div>
          <figure className="safetyTerminal">
            <figcaption>
              <span aria-hidden="true">● ● ●</span>
              <span>
                {tr("marketing.home.landingContent.illustrationCheckingWhereADeleteLands")}
              </span>
            </figcaption>
            <div className="safetyPolicyBody">
              <div className="safetyPolicyRequest blocked">
                <div>
                  <code>start_process</code>
                  <span>{tr("marketing.home.landingContent.blocked")}</span>
                </div>
                <code className="safetyPath">{String.raw`cmd /c rd /s /q \ "\\?\D:\Videos\cache"`}</code>
                <pre>{String.raw`Blocked by Remote Arc Safety Guard: deleting a drive, share or filesystem root (D:\).`}</pre>
                <p>{tr("marketing.home.landingContent.aQuotingSlipTurnedTheFirst")}</p>
              </div>
              <div className="safetyPolicyRequest allowed">
                <div>
                  <code>start_process</code>
                  <span>{tr("marketing.home.landingContent.allowed")}</span>
                </div>
                <code className="safetyPath">{String.raw`rd /s /q "D:\Videos\cache"`}</code>
                <p>{tr("marketing.home.landingContent.theSameCleanupWithALiteral")}</p>
              </div>
            </div>
          </figure>
        </div>
        <p className="securityPrivacyNote">
          {tr("marketing.home.landingContent.yourComputerConnectsOutwardOverEncrypted")}
        </p>
        <div className="sectionResourceLinks">
          <a href="/security-model">{tr("marketing.home.landingContent.securityModel")} →</a>
          <a href="/privacy">{tr("marketing.home.landingContent.privacyDataHandling")} →</a>
          <a href="/docs#docs-sandbox">
            {tr("marketing.home.landingContent.executionBoundaries")} →
          </a>
        </div>
      </section>

      <HomeSecurityIntro />

      <section className="landingQuestions sectionBlock">
        <header className="modernSectionIntro">
          <span className="eyebrow">{tr("marketing.home.landingContent.beforeYouConnect")}</span>
          <h2>{tr("marketing.home.landingContent.theQuestionsThatMatter")}</h2>
          <p>{tr("marketing.home.landingContent.whatItDoesWhatYouAuthorize")}</p>
        </header>
        <div className="faqContent">
          <div
            className="faqCategories"
            role="tablist"
            aria-label={tr("marketing.home.landingContent.faqTopics")}
          >
            {faqGroups.map((group, index) => (
              <button
                key={group.id}
                type="button"
                role="tab"
                id={"faq-tab-" + group.id}
                aria-controls={"faq-panel-" + group.id}
                aria-selected={faqCategory === index}
                tabIndex={faqCategory === index ? 0 : -1}
                onClick={() => setFaqCategory(index)}
                onKeyDown={(event) => {
                  const next =
                    event.key === "ArrowRight"
                      ? (index + 1) % faqGroups.length
                      : event.key === "ArrowLeft"
                        ? (index + faqGroups.length - 1) % faqGroups.length
                        : event.key === "Home"
                          ? 0
                          : event.key === "End"
                            ? faqGroups.length - 1
                            : null;
                  if (next === null) return;
                  event.preventDefault();
                  setFaqCategory(next);
                  document.getElementById("faq-tab-" + faqGroups[next]!.id)?.focus();
                }}
              >
                {group.title}
              </button>
            ))}
          </div>
          <div
            className="modernFaq"
            role="tabpanel"
            id={"faq-panel-" + currentFaq.id}
            aria-labelledby={"faq-tab-" + currentFaq.id}
          >
            {currentFaq.entries.map(([question, answer]) => (
              <details key={question}>
                <summary>
                  {question}
                  <span aria-hidden="true">
                    <ProductIcon name="add" size={17} />
                  </span>
                </summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
