import { APP_WORKFLOW_EXAMPLES } from "./app-workflow-examples.js";
import { LOCAL_CREATIVE_EXAMPLES } from "./local-creative-examples.js";
import React, { useEffect, useRef, useState } from "react";
import { useI18n } from "../../../hooks/use-i18n.js";
import { ProductIcon } from "../../../components/product-icon.js";
import { InteractiveWorkDemo } from "./landing-interactive-demo.js";
import { ArcTeaser } from "../arc/arc-future.js";
import { AgentUseCases } from "../use-cases/agent-use-cases.js";
import { SectionTitle } from "./section-title.js";
import { HomeUseCases } from "./home-use-cases.js";
import "../../../styles/marketing/home/landing-content.css";

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
          tr("marketing.home.landingContent.chatgptAndClaudeAlreadyUseComputers"),
          <>
            {tr("marketing.home.landingContent.remoteArcAddsThreeThings")}{" "}
            <a href="/docs/computer-use">
              {tr("marketing.home.landingContent.howComputerUseWorks")} →
            </a>
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
          <SectionTitle text={tr("marketing.home.landingContent.donTJustChatWatchAi")} />
          <p>{tr("marketing.home.landingContent.useTheAiChatYouAlready")}</p>
        </header>
        <HomeUseCases />
      </section>

      <AgentUseCases />

      <ArcTeaser />

      <section className="landingQuestions sectionBlock">
        <header className="modernSectionIntro">
          <span className="eyebrow">{tr("marketing.home.landingContent.beforeYouConnect")}</span>
          <SectionTitle text={tr("marketing.home.landingContent.theQuestionsThatMatter")} />
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
