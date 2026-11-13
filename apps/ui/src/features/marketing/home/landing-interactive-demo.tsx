import type { Translate } from "../../../locales/locale-catalog.js";
import { findAppWorkflow } from "./app-workflow-examples.js";
import { findLocalCreative } from "./local-creative-examples.js";
import { LocalCreativeResult } from "./local-creative-demo.js";
import { DemoResultCard } from "./landing-demo-result.js";
import React, { useEffect, useRef, useState } from "react";
import { useI18n } from "../../../hooks/use-i18n.js";
import { localizedWebsiteHref } from "../../../lib/marketing-paths.js";
import "../../../styles/marketing/home/landing-interactive-demo.css";

type DemoScenario = {
  id: string;
  label: string;
  request: string;
  result: string;
  permission: string;
  link: string;
};

type DemoEvent = {
  tool: string;
  arguments: string;
  output: string;
  duration: string;
};

type DemoClient = "ChatGPT" | "Claude" | "Cursor";

const clientLogo: Record<DemoClient, string> = {
  ChatGPT: "/demo-brands/chatgpt.svg",
  Claude: "/demo-brands/claude.svg",
  Cursor: "/demo-brands/cursor.svg",
};

type DemoGlyphName =
  | "menu"
  | "new"
  | "share"
  | "dots"
  | "plus"
  | "mic"
  | "send"
  | "chevron"
  | "terminal"
  | "check"
  | "sidebar"
  | "paperclip"
  | "sparkle"
  | "search"
  | "code"
  | "slides"
  | "table"
  | "video"
  | "image";

function DemoGlyph({ name, size = 18 }: { name: DemoGlyphName; size?: number }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {name === "menu" && (
        <>
          <path d="M4 7h16M4 12h16M4 17h16" />
        </>
      )}
      {name === "new" && (
        <>
          <path d="M12 5H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7" />
          <path d="m13 11 7-7 1 1-7 7-3 1 1-3z" />
        </>
      )}
      {name === "share" && (
        <>
          <path d="M12 16V3m0 0-4 4m4-4 4 4" />
          <path d="M5 13v5a3 3 0 0 0 3 3h8a3 3 0 0 0 3-3v-5" />
        </>
      )}
      {name === "dots" && (
        <>
          <circle cx="5" cy="12" r="1" />
          <circle cx="12" cy="12" r="1" />
          <circle cx="19" cy="12" r="1" />
        </>
      )}
      {name === "plus" && <path d="M12 5v14M5 12h14" />}
      {name === "mic" && (
        <>
          <rect x="9" y="3" width="6" height="12" rx="3" />
          <path d="M5 11a7 7 0 0 0 14 0M12 18v3m-4 0h8" />
        </>
      )}
      {name === "send" && (
        <>
          <path d="M12 19V5m0 0-6 6m6-6 6 6" />
        </>
      )}
      {name === "chevron" && <path d="m6 9 6 6 6-6" />}
      {name === "terminal" && (
        <>
          <rect x="3" y="4" width="18" height="16" rx="3" />
          <path d="m7 9 3 3-3 3m6 0h4" />
        </>
      )}
      {name === "check" && <path d="m5 12 4 4L19 6" />}
      {name === "sidebar" && (
        <>
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M9 4v16" />
        </>
      )}
      {name === "paperclip" && (
        <path d="m20 11-8 8a5 5 0 0 1-7-7l9-9a3 3 0 0 1 4 4l-9 9a1 1 0 0 1-2-2l8-8" />
      )}
      {name === "sparkle" && (
        <>
          <path d="m12 3 1.8 6.2L20 11l-6.2 1.8L12 19l-1.8-6.2L4 11l6.2-1.8L12 3Z" />
          <path d="m19 18 .5 1.5L21 20l-1.5.5L19 22l-.5-1.5L17 20l1.5-.5L19 18Z" />
        </>
      )}
      {name === "search" && (
        <>
          <circle cx="10" cy="10" r="6" />
          <path d="m14.5 14.5 6 6" />
        </>
      )}
      {name === "code" && (
        <>
          <path d="m7 7-5 5 5 5m10-10 5 5-5 5m-4-14-2 18" />
        </>
      )}
      {name === "slides" && (
        <>
          <path d="M3 3h18M4 3v13h16V3M12 16v5m-4 0 4-3 4 3" />
          <path d="m8 11 3-3 3 2 2-3" />
        </>
      )}
      {name === "video" && (
        <>
          <rect x="3" y="5" width="18" height="14" rx="3" />
          <path d="m10 9 5 3-5 3z" />
        </>
      )}
      {name === "image" && (
        <>
          <rect x="3" y="3" width="18" height="18" rx="3" />
          <circle cx="8" cy="8" r="1.5" />
          <path d="m3 17 5-5 4 4 3-3 6 6" />
        </>
      )}
      {name === "table" && (
        <>
          <rect x="3" y="3" width="18" height="18" rx="3" />
          <path d="M3 9h18M3 15h18M9 3v18" />
        </>
      )}
    </svg>
  );
}

function ScenarioIcon({ id }: { id: string }) {
  const workflow = findAppWorkflow(id);
  if (workflow)
    return (
      <span className="homeDemoExampleLogos" aria-hidden="true">
        {workflow.brands.slice(0, 2).map((brand) => (
          <img src={"/app-brands/" + brand.brand + ".svg"} key={brand.brand} alt="" />
        ))}
      </span>
    );
  return (
    <span className="homeDemoScenarioGlyph" aria-hidden="true">
      <DemoGlyph
        name={
          id === "video"
            ? "video"
            : id === "image"
              ? "image"
              : id === "slides"
                ? "slides"
                : id === "excel"
                  ? "table"
                  : "code"
        }
        size={18}
      />
    </span>
  );
}

function eventsFor(id: string, tr: Translate): DemoEvent[] {
  const workflow = findAppWorkflow(id);
  const creative = findLocalCreative(id);
  if (creative)
    return creative.traces.map((trace) => ({
      tool: trace.tool,
      arguments: JSON.stringify(trace.input),
      output: tr(trace.output),
      duration: "example",
    }));
  if (workflow)
    return workflow.traces.map((trace) => ({
      tool: trace.tool + (trace.provider ? " · " + trace.provider : ""),
      arguments: JSON.stringify(trace.input),
      output: tr(trace.output),
      duration: "example",
    }));
  switch (id) {
    case "mail":
      return [
        {
          tool: "list_apps",
          arguments: "{}",
          output: tr("marketing.home.landingInteractiveDemo.gmailOutlookConnectedEmailAccounts"),
          duration: "25ms",
        },
        {
          tool: "call_app · Gmail",
          arguments:
            '{"operation":"messages.list","arguments":{"query":"is:unread subject:launch","limit":10}}',
          output: tr(
            "marketing.home.landingInteractiveDemo.matchingThreadsSelectedLaunchDiscussion",
          ),
          duration: "129ms",
        },
        {
          tool: "call_app · Gmail",
          arguments: '{"operation":"messages.get","arguments":{"id":"example-thread-message"}}',
          output: tr("marketing.home.landingInteractiveDemo.originalMessageAndParticipantsRead"),
          duration: "93ms",
        },
        {
          tool: "call_app · Gmail",
          arguments:
            '{"operation":"drafts.create","arguments":{"to":["team@example.com"],"subject":"Re: Launch","body":"Thanks — here is the update…"}}',
          output: tr("marketing.home.landingInteractiveDemo.replyDraftCreatedMessageNotSent"),
          duration: "21ms",
        },
      ];
    case "calendar":
      return [
        {
          tool: "list_apps",
          arguments: "{}",
          output: tr(
            "marketing.home.landingInteractiveDemo.googleCalendarOutlookCalendarReadAccess",
          ),
          duration: "26ms",
        },
        {
          tool: "call_app · Google Calendar",
          arguments: '{"operation":"events.list","arguments":{"calendar":"primary","limit":30}}',
          output: tr("marketing.home.landingInteractiveDemo.tomorrowSEventsReadIsOpen"),
          duration: "118ms",
        },
        {
          tool: "call_app · Outlook Calendar",
          arguments: '{"operation":"events.list","arguments":{"calendar":"primary","limit":30}}',
          output: tr(
            "marketing.home.landingInteractiveDemo.secondCalendarCheckedNoOverlappingEvent",
          ),
          duration: "104ms",
        },
        {
          tool: "call_app · Google Calendar",
          arguments:
            '{"operation":"events.create","arguments":{"calendar":"primary","event":{"summary":"Project review","start":"2026-10-20T10:00:00+13:00","end":"2026-10-20T10:30:00+13:00"}}}',
          output: tr("marketing.home.landingInteractiveDemo.projectReviewEventCreated"),
          duration: "23ms",
        },
      ];
    case "job":
      return [
        {
          tool: "start_process",
          arguments: '{"command":"node export-report.js","background":true}',
          output: tr("marketing.home.landingInteractiveDemo.processIdProcDemoRunning"),
          duration: "164ms",
        },
        {
          tool: "process_status",
          arguments: '{"process_id":"proc_demo_01"}',
          output: tr("marketing.home.landingInteractiveDemo.statusExitedExitCode"),
          duration: "19ms",
        },
        {
          tool: "get_file_info",
          arguments: '{"path":"~/reports/export.csv"}',
          output: tr("marketing.home.landingInteractiveDemo.exportCsvFileExists"),
          duration: "12ms",
        },
      ];
    case "schedule":
      return [
        {
          tool: "list_devices",
          arguments: "{}",
          output: tr("marketing.home.landingInteractiveDemo.homeServerAvailable"),
          duration: "24ms",
        },
        {
          tool: "create_automation",
          arguments: '{"device":"home-server","type":"schedule"}',
          output: tr("marketing.home.landingInteractiveDemo.scheduleSavedAwaitingDueTime"),
          duration: "88ms",
        },
        {
          tool: "get_automation",
          arguments: '{"id":"example_schedule"}',
          output: tr("marketing.home.landingInteractiveDemo.statusScheduledNoServiceRestart"),
          duration: "16ms",
        },
      ];
    case "slides":
      return [
        {
          tool: "read_file",
          arguments: '{"path":"~/slides/outline.md"}',
          output: tr("marketing.home.landingInteractiveDemo.outlineAndReferencesRead"),
          duration: "31ms",
        },
        {
          tool: "start_process",
          arguments: '{"command":"node scripts/build-deck.js --verify","cwd":"~/slides"}',
          output: tr("marketing.home.landingInteractiveDemo.pptxGeneratedSlidesVerifiedExitCode"),
          duration: "2.3s",
        },
        {
          tool: "get_file_info",
          arguments: '{"path":"~/slides/review.pptx"}',
          output: tr("marketing.home.landingInteractiveDemo.reviewPptxOutputFileExists"),
          duration: "18ms",
        },
      ];
    case "excel":
      return [
        {
          tool: "list_directory",
          arguments: '{"path":"~/reports/2026"}',
          output: tr("marketing.home.landingInteractiveDemo.monthlyCsvInputsLocated"),
          duration: "23ms",
        },
        {
          tool: "start_process",
          arguments: '{"command":"python make_workbook.py","cwd":"~/reports"}',
          output: tr("marketing.home.landingInteractiveDemo.workbookGeneratedTotalsReconciled"),
          duration: "2.8s",
        },
        {
          tool: "get_file_info",
          arguments: '{"path":"~/reports/output/summary.xlsx"}',
          output: tr("marketing.home.landingInteractiveDemo.summaryXlsxFileExists"),
          duration: "12ms",
        },
      ];
    case "inspect":
      return [
        {
          tool: "list_processes",
          arguments: '{"device":"mini-pc"}',
          output: tr("marketing.home.landingInteractiveDemo.nodeServiceFoundPid"),
          duration: "36ms",
        },
        {
          tool: "read_file",
          arguments: '{"path":"~/app/logs/server.log","length":80}',
          output: tr(
            "marketing.home.landingInteractiveDemo.foundRepeatedConnectionTimeoutWarnings",
          ),
          duration: "27ms",
        },
        {
          tool: "get_file_info",
          arguments: '{"path":"~/app/logs/server.log"}',
          output: tr("marketing.home.landingInteractiveDemo.logReadableNoFilesModified"),
          duration: "14ms",
        },
      ];
    default:
      return [
        {
          tool: "list_directory",
          arguments: '{"path":"~/projects/app"}',
          output: tr("marketing.home.landingInteractiveDemo.entriesSourceAndTestsLocated"),
          duration: "32ms",
        },
        {
          tool: "read_file",
          arguments: '{"path":"~/projects/app/src/format.ts"}',
          output: tr("marketing.home.landingInteractiveDemo.linesReadFailingEdgeCaseLocated"),
          duration: "21ms",
        },
        {
          tool: "edit_block",
          arguments: JSON.stringify({
            file_path: "~/projects/app/src/format.ts",
            old_string: 'return value || "—";',
            new_string: 'return value == null ? "—" : String(value);',
            expected_replacements: 1,
          }),
          output: tr("marketing.home.landingInteractiveDemo.replacementLocalUndoAvailable"),
          duration: "55ms",
        },
        {
          tool: "start_process",
          arguments: '{"command":"npm test","cwd":"~/projects/app"}',
          output: tr("marketing.home.landingInteractiveDemo.passTestsExitCode"),
          duration: "2.4s",
        },
      ];
  }
}

type DemoProgress = { working: string; done: string };

function progressFor(id: string, tr: Translate): DemoProgress[] {
  const workflow = findAppWorkflow(id);
  const creative = findLocalCreative(id);
  if (creative)
    return creative.traces.map((trace) => ({
      working: tr(trace.working),
      done: tr(trace.output),
    }));
  if (workflow)
    return workflow.traces.map((trace) => ({
      working: tr(trace.working),
      done: tr(trace.output),
    }));
  switch (id) {
    case "mail":
      return [
        {
          working: tr("marketing.home.landingInteractiveDemo.checkingYourConnectedEmailAccounts"),
          done: tr("marketing.home.landingInteractiveDemo.yourGmailAndOutlookConnectionsAre"),
        },
        {
          working: tr("marketing.home.landingInteractiveDemo.findingTheLaunchConversation"),
          done: tr("marketing.home.landingInteractiveDemo.foundTheThreadThatNeedsYour"),
        },
        {
          working: tr("marketing.home.landingInteractiveDemo.readingTheOriginalMessageForContext"),
          done: tr("marketing.home.landingInteractiveDemo.replyGroundedInTheOriginalConversation"),
        },
        {
          working: tr("marketing.home.landingInteractiveDemo.savingTheReplyAsADraft"),
          done: tr("marketing.home.landingInteractiveDemo.replyDraftSavedToYourMailbox"),
        },
      ];
    case "calendar":
      return [
        {
          working: tr("marketing.home.landingInteractiveDemo.checkingBothCalendarConnections"),
          done: tr("marketing.home.landingInteractiveDemo.googleCalendarAndOutlookCalendarAre"),
        },
        {
          working: tr("marketing.home.landingInteractiveDemo.readingYourGoogleCalendar"),
          done: tr("marketing.home.landingInteractiveDemo.foundAMinuteOpeningInYour"),
        },
        {
          working: tr("marketing.home.landingInteractiveDemo.crossCheckingYourOutlookCalendar"),
          done: tr("marketing.home.landingInteractiveDemo.theProposedTimeIsClearIn"),
        },
        {
          working: tr("marketing.home.landingInteractiveDemo.creatingTheProjectReviewEvent"),
          done: tr("marketing.home.landingInteractiveDemo.meetingCreatedInTheAvailableTime"),
        },
      ];
    case "job":
      return [
        {
          working: tr("marketing.home.landingInteractiveDemo.startingTheReportExport"),
          done: tr("marketing.home.landingInteractiveDemo.reportExportStartedInTheBackground"),
        },
        {
          working: tr("marketing.home.landingInteractiveDemo.checkingWhetherTheProcessFinished"),
          done: tr("marketing.home.landingInteractiveDemo.theExportProcessExitedSuccessfully"),
        },
        {
          working: tr("marketing.home.landingInteractiveDemo.verifyingTheOutputFile"),
          done: tr("marketing.home.landingInteractiveDemo.confirmedThatExportCsvWasCreated"),
        },
      ];
    case "schedule":
      return [
        {
          working: tr("marketing.home.landingInteractiveDemo.checkingTheAvailableComputer"),
          done: tr("marketing.home.landingInteractiveDemo.theHomeServerIsAvailable"),
        },
        {
          working: tr("marketing.home.landingInteractiveDemo.savingTheHealthCheckSchedule"),
          done: tr("marketing.home.landingInteractiveDemo.theHealthCheckIsScheduled"),
        },
        {
          working: tr("marketing.home.landingInteractiveDemo.checkingTheSavedTaskSettings"),
          done: tr("marketing.home.landingInteractiveDemo.confirmedStatusOnlyNoServiceRestart"),
        },
      ];
    case "slides":
      return [
        {
          working: tr("marketing.home.landingInteractiveDemo.readingThePresentationMaterials"),
          done: tr("marketing.home.landingInteractiveDemo.foundTheOutlineAndLocalCharts"),
        },
        {
          working: tr(
            "marketing.home.landingInteractiveDemo.generatingAndVerifyingTheEditablePresentation",
          ),
          done: tr("marketing.home.landingInteractiveDemo.theLocalScriptGeneratedAndVerified"),
        },
        {
          working: tr("marketing.home.landingInteractiveDemo.checkingTheSavedOutputFile"),
          done: tr("marketing.home.landingInteractiveDemo.confirmedThatReviewPptxIsSaved"),
        },
      ];
    case "excel":
      return [
        {
          working: tr("marketing.home.landingInteractiveDemo.readingTheMonthlyCsvFiles"),
          done: tr("marketing.home.landingInteractiveDemo.foundTheSourceFilesAndColumns"),
        },
        {
          working: tr(
            "marketing.home.landingInteractiveDemo.generatingTheWorkbookAndCheckingTotals",
          ),
          done: tr(
            "marketing.home.landingInteractiveDemo.theWorkbookAndReconciliationWereGenerated",
          ),
        },
        {
          working: tr("marketing.home.landingInteractiveDemo.verifyingTheOutputFile2"),
          done: tr("marketing.home.landingInteractiveDemo.confirmedThatSummaryXlsxExists"),
        },
      ];
    case "inspect":
      return [
        {
          working: tr("marketing.home.landingInteractiveDemo.locatingTheRunningService"),
          done: tr("marketing.home.landingInteractiveDemo.foundTheRunningNodeJsService"),
        },
        {
          working: tr("marketing.home.landingInteractiveDemo.readingTheRecentServerLogs"),
          done: tr("marketing.home.landingInteractiveDemo.repeatedConnectionTimeoutsAppearInThe"),
        },
        {
          working: tr("marketing.home.landingInteractiveDemo.confirmingReadOnlyAccess"),
          done: tr("marketing.home.landingInteractiveDemo.logInspectionIsCompleteNothingWas"),
        },
      ];
    default:
      return [
        {
          working: tr("marketing.home.landingInteractiveDemo.findingTheRelevantFilesAndTests"),
          done: tr("marketing.home.landingInteractiveDemo.locatedTheSourceFileAndIts"),
        },
        {
          working: tr("marketing.home.landingInteractiveDemo.checkingTheFailingEdgeCase"),
          done: tr("marketing.home.landingInteractiveDemo.identifiedTheFormattingEdgeCase"),
        },
        {
          working: tr("marketing.home.landingInteractiveDemo.applyingAFocusedReversibleFix"),
          done: tr("marketing.home.landingInteractiveDemo.updatedTheFormatterLocalUndoIs"),
        },
        {
          working: tr("marketing.home.landingInteractiveDemo.runningTheTestSuite"),
          done: tr("marketing.home.landingInteractiveDemo.allTestsPassed"),
        },
      ];
  }
}

export function InteractiveWorkDemo({ scenarios }: { scenarios: readonly DemoScenario[] }) {
  const { tr, locale } = useI18n();
  const [selected, setSelected] = useState(0);
  const [step, setStep] = useState(-1);
  const [client, setClient] = useState<DemoClient>("ChatGPT");
  const demoRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<HTMLDivElement>(null);
  const chatBodyRef = useRef<HTMLDivElement>(null);
  const events = eventsFor(scenarios[selected]?.id ?? "code", tr);
  const scenario = scenarios[selected] ?? scenarios[0];
  const finished = step >= events.length * 2 + 1;
  const active = step >= 0 && !finished;

  useEffect(() => {
    if (step < 0 || finished) return;
    const delay = step === 0 ? 800 : step % 2 === 1 ? 580 : 430;
    const timer = window.setTimeout(() => setStep((previous) => previous + 1), delay);
    return () => window.clearTimeout(timer);
  }, [step, selected, finished]);

  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const showResult = () => {
      if (motion.matches) setStep(events.length * 2 + 1);
    };
    showResult();
    motion.addEventListener("change", showResult);
    return () => motion.removeEventListener("change", showResult);
  }, [events.length]);

  useEffect(() => {
    const container = demoRef.current;
    if (!container || !("IntersectionObserver" in window)) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setStep((current) => (current === -1 ? 0 : current));
          observer.disconnect();
        }
      },
      { threshold: 0.35 },
    );
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (terminalRef.current) terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
  }, [step, selected]);

  // Reveal the sample result without moving the surrounding page.
  useEffect(() => {
    if (finished && chatBodyRef.current) {
      chatBodyRef.current.scrollTop = chatBodyRef.current.scrollHeight;
    }
  }, [finished, scenario?.id, client]);

  if (!scenario) return null;

  const isAppScenario =
    Boolean(findAppWorkflow(scenario.id)) || ["mail", "calendar"].includes(scenario.id);
  const isCreativeScenario = scenario.id === "video" || scenario.id === "image";
  const finalReply =
    isAppScenario || isCreativeScenario
      ? scenario.result
      : scenarios[selected]?.id === "code"
        ? tr("marketing.home.landingInteractiveDemo.iFixedTheFormattingEdgeCase")
        : scenarios[selected]?.id === "inspect"
          ? tr("marketing.home.landingInteractiveDemo.theLogsPointToRepeatedConnection")
          : scenarios[selected]?.id === "schedule"
            ? tr("marketing.home.landingInteractiveDemo.theHealthCheckIsScheduledIt")
            : scenarios[selected]?.id === "slides"
              ? tr("marketing.home.landingInteractiveDemo.theLocalScriptGeneratedReviewPptx")
              : scenarios[selected]?.id === "excel"
                ? tr("marketing.home.landingInteractiveDemo.theLocalScriptGeneratedSummaryXlsx")
                : tr(
                    "marketing.home.landingInteractiveDemo.theExportFinishedSuccessfullyTheResult",
                  );

  const pickScenario = (index: number) => {
    setSelected(index);
    setStep(
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? eventsFor(scenarios[index]?.id ?? "code", tr).length * 2 + 1
        : 0,
    );
    if (chatBodyRef.current) chatBodyRef.current.scrollTop = 0;
    if (terminalRef.current) terminalRef.current.scrollTop = 0;
  };

  const progress = progressFor(scenario.id, tr);
  const progressIndex = Math.min(progress.length - 1, Math.max(0, Math.floor(step / 2)));
  const progressTitle = finished
    ? tr("marketing.home.landingInteractiveDemo.finishedWorkingOnYourRequest")
    : step < 1
      ? tr("marketing.home.landingInteractiveDemo.thinkingThroughTheNextSteps")
      : step >= progress.length * 2
        ? tr("marketing.home.landingInteractiveDemo.preparingTheResult")
        : (progress[progressIndex]?.working ??
          tr("marketing.home.landingInteractiveDemo.workingOnYourRequest"));
  const prompt = scenario.request.replace(/^“|”$/g, "");
  const workflow = findAppWorkflow(scenario.id);
  const workflowHref = workflow
    ? "/integrations?provider=" + workflow.connectionProvider
    : "/use-cases/" + scenario.link;

  return (
    <div
      className="homeDemo"
      ref={demoRef}
      data-scenario={scenario.id}
      data-state={finished ? "complete" : active ? "working" : "ready"}
    >
      <div className="homeDemoToolbar">
        <div
          className="homeDemoExamples"
          aria-label={tr("marketing.home.landingInteractiveDemo.tryAnExampleRequest")}
        >
          {scenarios.map((example, index) => (
            <button
              key={example.id}
              type="button"
              className={index === selected ? "active" : ""}
              aria-pressed={index === selected}
              onClick={() => pickScenario(index)}
            >
              <ScenarioIcon id={example.id} />
              <span>{example.label}</span>
            </button>
          ))}
        </div>
        <div
          className="homeDemoClientSwitch"
          aria-label={tr("marketing.home.landingInteractiveDemo.previewTheConversationInAnAi")}
        >
          <span>{tr("marketing.home.landingInteractiveDemo.chatView")}</span>
          {(["ChatGPT", "Claude", "Cursor"] as const).map((name) => (
            <button
              type="button"
              key={name}
              className={"homeDemoClientTab--" + name.toLowerCase()}
              aria-pressed={name === client}
              onClick={() => setClient(name)}
            >
              <img src={clientLogo[name]} alt="" />
              {name}
            </button>
          ))}
        </div>
      </div>

      <div className="homeDemoSurface">
        <section
          className={"homeDemoChat homeDemoChat--" + client.toLowerCase()}
          aria-label={tr("marketing.home.landingInteractiveDemo.exampleConversationIn", { client })}
        >
          {client !== "Cursor" && (
            <aside className="homeDemoChatRail" aria-hidden="true">
              <div className="homeDemoRailTop">
                <DemoGlyph name="sidebar" size={19} />
                <DemoGlyph name="new" size={19} />
              </div>
              <div className="homeDemoRailBottom">
                <span className="homeDemoRailAvatar">S</span>
              </div>
            </aside>
          )}
          <div className="homeDemoChatMain">
            <header className="homeDemoChatChrome">
              {client === "ChatGPT" && (
                <>
                  <div className="homeDemoBrandTitle">
                    <img src={clientLogo.ChatGPT} alt="" />
                    <strong>ChatGPT</strong>
                    <DemoGlyph name="chevron" size={14} />
                  </div>
                  <div className="homeDemoChromeActions">
                    <DemoGlyph name="share" size={17} />
                    <DemoGlyph name="dots" size={19} />
                  </div>
                </>
              )}
              {client === "Claude" && (
                <>
                  <div className="homeDemoBrandTitle">
                    <img src={clientLogo.Claude} alt="" />
                    <strong>Claude</strong>
                  </div>
                  <div className="homeDemoClaudeNav">
                    <span className="selected">Chat</span>
                    <span>Cowork</span>
                    <span>Code</span>
                  </div>
                </>
              )}
              {client === "Cursor" && (
                <>
                  <div className="homeDemoCursorWindow">
                    <span />
                    <span />
                    <span />
                  </div>
                  <div className="homeDemoCursorTab">
                    <img src={clientLogo.Cursor} alt="" />
                    <span>Agent</span>
                    <DemoGlyph name="chevron" size={12} />
                  </div>
                  <div className="homeDemoChromeActions">
                    <DemoGlyph name="new" size={16} />
                    <DemoGlyph name="dots" size={17} />
                  </div>
                </>
              )}
            </header>

            <div className="homeDemoChatBody" ref={chatBodyRef}>
              {client === "Cursor" && (
                <div className="homeDemoCursorContext">
                  <DemoGlyph name="sidebar" size={14} />
                  <span>{tr("marketing.home.landingInteractiveDemo.newChat")}</span>
                  <span className="homeDemoCursorContextModel">Auto</span>
                </div>
              )}
              <div className="homeDemoUserBubble">{prompt}</div>

              {step >= 0 && (
                <div className="homeDemoAssistant">
                  {client === "Claude" && (
                    <img className="homeDemoAssistantLogo" src={clientLogo.Claude} alt="" />
                  )}
                  {client === "Cursor" && (
                    <div className="homeDemoCursorAgent">
                      <DemoGlyph name="sparkle" size={15} />
                      <strong>Agent</strong>
                      <span>· Auto</span>
                    </div>
                  )}
                  {client !== "Cursor" && (
                    <p className="homeDemoAssistantIntro">
                      {isAppScenario
                        ? tr("marketing.home.landingInteractiveDemo.iLlUseYourConnectedApps")
                        : tr("marketing.home.landingInteractiveDemo.iLlUseRemoteArcTo")}
                    </p>
                  )}
                  <div className="homeDemoActivity" aria-live="polite" aria-atomic="false">
                    <header className="homeDemoActivityHeader">
                      <span className="homeDemoActivityIcon">
                        <img src="/remote-arc.svg" alt="" width="30" height="30" />
                      </span>
                      <div className="homeDemoActivityHeading">
                        <span>Remote Arc</span>
                        <strong>{progressTitle}</strong>
                      </div>
                      {finished ? (
                        <span className="homeDemoActivityCheck">
                          <DemoGlyph name="check" size={15} />
                        </span>
                      ) : (
                        <span
                          className="homeDemoMiniSpinner"
                          aria-label={tr("marketing.home.landingInteractiveDemo.working")}
                        />
                      )}
                    </header>
                    {step > 0 && (
                      <ol className="homeDemoProgressList">
                        {progress.map((part, index) => {
                          const started = step >= index * 2 + 1;
                          const done = step >= index * 2 + 2;
                          if (!started) return null;
                          return (
                            <li
                              key={index}
                              className={done ? "homeDemoProgressDone" : "homeDemoProgressCurrent"}
                            >
                              <span className="homeDemoProgressMarker">
                                {done ? (
                                  <DemoGlyph name="check" size={11} />
                                ) : (
                                  <span className="homeDemoProgressPulse" />
                                )}
                              </span>
                              <span>{done ? part.done : part.working}</span>
                            </li>
                          );
                        })}
                      </ol>
                    )}
                  </div>
                  {finished ? (
                    <>
                      <p className="homeDemoAssistantAnswer">{finalReply}</p>
                      <DemoResultCard key={scenario.id} id={scenario.id} />
                      {isCreativeScenario && (
                        <LocalCreativeResult
                          key={scenario.id + locale}
                          kind={scenario.id as "video" | "image"}
                        />
                      )}
                      <div className="homeDemoMessageTools" aria-hidden="true">
                        <DemoGlyph name="paperclip" size={14} />
                        <DemoGlyph name="share" size={14} />
                        <DemoGlyph name="dots" size={16} />
                      </div>
                    </>
                  ) : null}
                </div>
              )}
            </div>

            <div className="homeDemoComposer">
              {client === "ChatGPT" && (
                <div className="homeDemoComposerBox">
                  <div className="homeDemoComposerPlaceholder">
                    {tr("marketing.home.landingInteractiveDemo.askAnything")}
                  </div>
                  <div className="homeDemoComposerRow">
                    <span className="homeDemoComposerRound">
                      <DemoGlyph name="plus" size={19} />
                    </span>
                    <span className="homeDemoComposerTools">
                      <DemoGlyph name="sparkle" size={16} />
                      {tr("marketing.home.landingInteractiveDemo.tools")}
                    </span>
                    <span className="homeDemoComposerSpacer" />
                    <DemoGlyph name="mic" size={19} />
                    <span className="homeDemoComposerSend">
                      <DemoGlyph name="send" size={18} />
                    </span>
                  </div>
                </div>
              )}
              {client === "Claude" && (
                <div className="homeDemoComposerBox">
                  <div className="homeDemoComposerPlaceholder">
                    {tr("marketing.home.landingInteractiveDemo.replyToClaude")}
                  </div>
                  <div className="homeDemoComposerRow">
                    <DemoGlyph name="plus" size={20} />
                    <span className="homeDemoComposerSpacer" />
                    <span className="homeDemoClaudeModel">
                      Sonnet 4.6 <DemoGlyph name="chevron" size={13} />
                    </span>
                    <span className="homeDemoComposerSend">
                      <DemoGlyph name="send" size={18} />
                    </span>
                  </div>
                </div>
              )}
              {client === "Cursor" && (
                <div className="homeDemoComposerBox">
                  <div className="homeDemoCursorAddContext">
                    <DemoGlyph name="plus" size={13} />{" "}
                    {tr("marketing.home.landingInteractiveDemo.addContext")}
                  </div>
                  <div className="homeDemoComposerPlaceholder">
                    {tr("marketing.home.landingInteractiveDemo.planSearchBuildAnything")}
                  </div>
                  <div className="homeDemoComposerRow">
                    <span className="homeDemoCursorMode">
                      ∞ {tr("marketing.home.landingInteractiveDemo.agent")}{" "}
                      <DemoGlyph name="chevron" size={12} />
                    </span>
                    <span className="homeDemoCursorModel">
                      Auto <DemoGlyph name="chevron" size={12} />
                    </span>
                    <span className="homeDemoComposerSpacer" />
                    <DemoGlyph name="paperclip" size={16} />
                    <span className="homeDemoComposerSend">
                      <DemoGlyph name="send" size={16} />
                    </span>
                  </div>
                </div>
              )}
              <span className="homeDemoComposerDisclaimer">
                {client === "Cursor"
                  ? tr("marketing.home.landingInteractiveDemo.aiGeneratedCodeMayContainErrors")
                  : client === "Claude"
                    ? tr("marketing.home.landingInteractiveDemo.claudeCanMakeMistakesPleaseDouble")
                    : tr(
                        "marketing.home.landingInteractiveDemo.chatgptCanMakeMistakesCheckImportant",
                      )}
              </span>
            </div>
          </div>
        </section>

        <section
          className="homeDemoTerminal"
          aria-label={
            isAppScenario
              ? tr("marketing.home.landingInteractiveDemo.exampleAppActivity")
              : tr("marketing.home.landingInteractiveDemo.exampleDeviceExecutionLog")
          }
        >
          <header className="homeDemoTerminalHeader">
            <div className="homeDemoTerminalDots" aria-hidden="true">
              <i />
              <i />
              <i />
            </div>
            <span>
              Remote Arc <b>/</b>{" "}
              {isAppScenario
                ? tr("marketing.home.landingInteractiveDemo.appActivity")
                : tr("marketing.home.landingInteractiveDemo.deviceActivity")}
            </span>
            <span className="homeDemoTerminalDevice">
              <i aria-hidden="true" />
              {isAppScenario
                ? tr("marketing.home.landingInteractiveDemo.connectedApps")
                : tr("marketing.home.landingInteractiveDemo.exampleWorkstation")}
            </span>
          </header>
          <div
            className="homeDemoTerminalBody"
            ref={terminalRef}
            role="log"
            aria-label={tr("marketing.home.landingInteractiveDemo.simulatedToolCallSequence")}
          >
            <div className="homeDemoTerminalBanner">
              <span className="homeDemoMonoAccent">remote-arc</span>
              <span>
                {isAppScenario
                  ? tr("marketing.home.landingInteractiveDemo.cloudAppsWorkflow")
                  : tr("marketing.home.landingInteractiveDemo.localExecution")}
              </span>
            </div>
            <div className="homeDemoTerminalInfo">
              ✓ {tr("marketing.home.landingInteractiveDemo.secureMcpConnectionReady")}
            </div>
            {step < 0 && (
              <p className="homeDemoTerminalWaiting">
                {tr("marketing.home.landingInteractiveDemo.waitingForARequestFromYour")}
              </p>
            )}
            {step >= 0 && (
              <div className="homeDemoTraceLine">
                <span className="homeDemoTraceTime">00:00</span>
                <span className="homeDemoTraceEvent">request</span>
                <code>
                  {isAppScenario
                    ? tr(
                        "marketing.home.landingInteractiveDemo.connectedAccountScopesCheckedExecutingYour",
                      )
                    : tr("marketing.home.landingInteractiveDemo.devicePolicyCheckedApprovedTools")}
                </code>
              </div>
            )}
            {events.map((event, index) => {
              const showCall = step >= index * 2 + 1;
              const showResult = step >= index * 2 + 2;
              return showCall ? (
                <React.Fragment key={event.tool + index}>
                  <div className="homeDemoTraceLine">
                    <span className="homeDemoTraceTime">{`00:${String(index * 2 + 1).padStart(2, "0")}`}</span>
                    <span className="homeDemoTraceEvent">tool.call</span>
                    <code>{event.tool}</code>
                  </div>
                  <div className="homeDemoTraceArgs">
                    <code>{event.arguments}</code>
                  </div>
                  {showResult && (
                    <div className="homeDemoTraceLine homeDemoTraceResult">
                      <span className="homeDemoTraceTime">{`00:${String(index * 2 + 2).padStart(2, "0")}`}</span>
                      <span className="homeDemoTraceSuccess">tool.done</span>
                      <code>
                        {event.output} <small>· {event.duration}</small>
                      </code>
                    </div>
                  )}
                </React.Fragment>
              ) : null;
            })}
            {finished && (
              <div className="homeDemoTerminalFinished">
                ✓ {tr("marketing.home.landingInteractiveDemo.executionCompleteResponseDelivered")}
              </div>
            )}
            {active && (
              <span className="homeDemoTerminalCursor" aria-hidden="true">
                ▌
              </span>
            )}
          </div>
          <footer className="homeDemoTerminalFooter">
            <span>
              {tr("marketing.home.landingInteractiveDemo.permission")}: {scenario.permission}
            </span>
            <span>
              {finished
                ? tr("marketing.home.landingInteractiveDemo.complete")
                : active
                  ? tr("marketing.home.landingInteractiveDemo.executing")
                  : tr("marketing.home.landingInteractiveDemo.ready")}
            </span>
          </footer>
        </section>
      </div>

      <div className="homeDemoUnder">
        <p>
          {isCreativeScenario
            ? tr("marketing.home.landingInteractiveDemo.guidedToolCallSimulationTheFinished")
            : isAppScenario
              ? tr(
                  "marketing.home.landingInteractiveDemo.interactiveSimulationWithExampleAccountsApps",
                )
              : tr("marketing.home.landingInteractiveDemo.guidedSimulationWithExampleDataNo")}
        </p>
        <a href={localizedWebsiteHref(workflowHref, locale)}>
          {tr("marketing.home.landingInteractiveDemo.exploreThisWorkflow")} ↗
        </a>
      </div>
    </div>
  );
}
