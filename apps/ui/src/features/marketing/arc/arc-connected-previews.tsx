import { useId, useState, type CSSProperties, type FormEvent } from "react";
import { useI18n } from "../../../hooks/use-i18n.js";
import { localizedWebsiteHref } from "../../../lib/marketing-paths.js";
import { ProductIcon as Icon } from "../../../components/product-icon.js";
import { arcChatHref } from "../../../../../../packages/docs/src/arc-use-cases.js";
import "../../../styles/marketing/arc/arc-connected-previews.css";
import "../../../styles/marketing/arc/arc-connected-workspace.css";
import "../../../styles/marketing/arc/connected-video-edit.css";

export const previewDevices = [
  {
    name: "Studio Mac",
    platform: "macos",
    system: "macOS",
    cpu: 24,
    memory: "12.8 / 32 GB",
    state: "online",
  },
  {
    name: "Build PC",
    platform: "windows",
    system: "Windows",
    cpu: 68,
    memory: "21.4 / 64 GB",
    state: "online",
  },
  {
    name: "Linux Server",
    platform: "linux",
    system: "Ubuntu",
    cpu: 12,
    memory: "4.2 / 16 GB",
    state: "online",
  },
  { name: "Travel Mac", platform: "macos", system: "macOS", cpu: 0, memory: "—", state: "offline" },
] as const;

export function DeviceFleetPreview({ compact = false }: { compact?: boolean }) {
  const { tr } = useI18n();
  return (
    <div className={"connectedFleet" + (compact ? " connectedFleet--compact" : "")}>
      <div className="connectedFleetSummary">
        <span>
          <i className="connectedOnlineDot" />
          {tr("marketing.arc.arcConnectedPreviews.online")}
        </span>
        <span>{tr("marketing.arc.arcConnectedPreviews.offline")}</span>
        <span>{tr("marketing.arc.arcConnectedPreviews.devices")}</span>
      </div>
      <div className="connectedDeviceList">
        {previewDevices.slice(0, compact ? 3 : 4).map((device) => (
          <div className="connectedDevice" key={device.name} data-state={device.state}>
            <span className="connectedPlatform">
              <img
                src={"/platform-brands/" + device.platform + ".svg"}
                width={23}
                height={23}
                alt={device.system}
              />
            </span>
            <div>
              <strong>{device.name}</strong>
              <small>
                {device.system} ·{" "}
                {device.state === "online"
                  ? tr("marketing.arc.arcConnectedPreviews.connected")
                  : tr("marketing.arc.arcConnectedPreviews.lastSeenHAgo")}
              </small>
            </div>
            <span className="connectedDeviceState">
              {device.state === "online" ? (
                <>
                  <i className="connectedOnlineDot" />
                  {tr("marketing.arc.arcConnectedPreviews.online2")}
                </>
              ) : (
                tr("marketing.arc.arcConnectedPreviews.offline2")
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PerformancePreview({ compact = false }: { compact?: boolean }) {
  const { tr } = useI18n();
  return (
    <div className={"connectedPerformance" + (compact ? " connectedPerformance--compact" : "")}>
      <div className="connectedPerformanceHead">
        <span className="connectedPlatform">
          <img src="/platform-brands/windows.svg" alt="Windows" width={22} height={22} />
        </span>
        <div>
          <strong>Build PC</strong>
          <small>{tr("marketing.arc.arcConnectedPreviews.performanceSnapshot")}</small>
        </div>
        <span>
          <i className="connectedOnlineDot" />
          {tr("marketing.arc.arcConnectedPreviews.online2")}
        </span>
      </div>
      <div className="connectedMetrics">
        {[
          { label: "CPU", value: "68", unit: "%", width: 68 },
          {
            label: tr("marketing.arc.arcConnectedPreviews.memory"),
            value: "21.4",
            unit: "/ 64 GB",
            width: 33,
          },
          {
            label: tr("marketing.arc.arcConnectedPreviews.disk"),
            value: "426",
            unit: "GB free",
            width: 58,
          },
        ].map((metric) => (
          <div key={metric.label}>
            <small>{metric.label}</small>
            <strong>
              {metric.value}
              <span>
                {metric.unit === "GB free"
                  ? tr("marketing.arc.arcConnectedPreviews.gbFree")
                  : metric.unit}
              </span>
            </strong>
            <span className="connectedMetricTrack">
              <i style={{ "--metric-width": metric.width + "%" } as CSSProperties} />
            </span>
          </div>
        ))}
      </div>
      {!compact && (
        <div className="connectedChart">
          <div>
            <span>{tr("marketing.arc.arcConnectedPreviews.cpuActivity")}</span>
            <span>{tr("marketing.arc.arcConnectedPreviews.lastSecondsExample")}</span>
          </div>
          <svg
            viewBox="0 0 500 100"
            role="img"
            aria-label={tr("marketing.arc.arcConnectedPreviews.exampleCpuActivityChart")}
            preserveAspectRatio="none"
          >
            <path className="connectedChartGrid" d="M0 20H500M0 50H500M0 80H500" />
            <path
              className="connectedChartArea"
              d="M0 82 20 78 40 80 60 62 80 65 100 50 120 58 140 66 160 40 180 48 200 25 220 35 240 20 260 31 280 54 300 49 320 38 340 44 360 25 380 32 400 18 420 38 440 30 460 40 480 25 500 32V100H0Z"
            />
            <path
              className="connectedChartLine"
              d="M0 82 20 78 40 80 60 62 80 65 100 50 120 58 140 66 160 40 180 48 200 25 220 35 240 20 260 31 280 54 300 49 320 38 340 44 360 25 380 32 400 18 420 38 440 30 460 40 480 25 500 32"
            />
          </svg>
        </div>
      )}
    </div>
  );
}

export function WorkspacePreview({ compact = false }: { compact?: boolean }) {
  const { tr } = useI18n();
  const [project, setProject] = useState(0);
  const [device, setDevice] = useState<"mac" | "windows">("mac");
  const [result, setResult] = useState(false);
  const projects = [
    {
      name: tr("marketing.arc.arcConnectedPreviews.websiteProject"),
      folder: "remote-arc",
      task: tr("marketing.arc.arcConnectedPreviews.fixTheLoginButtonLayoutThen"),
      output: "login-fix.md",
      checks: tr("marketing.arc.arcConnectedPreviews.testsPassed"),
    },
    {
      name: tr("marketing.arc.arcConnectedPreviews.salesReport"),
      folder: "sales-report",
      task: tr("marketing.arc.arcConnectedPreviews.summarizeThisMonthSOrdersAnd"),
      output: "monthly-sales.xlsx",
      checks: tr("marketing.arc.arcConnectedPreviews.totalsReconciled"),
    },
  ];
  const current = projects[project]!;
  const directory =
    device === "mac" ? "~/Projects/" + current.folder : "D:\\Projects\\" + current.folder;
  if (!compact)
    return (
      <div className="connectedWorkspaceFlow">
        <div className="connectedWorkspaceStep">
          <span>01</span>
          <strong>{tr("marketing.arc.arcConnectedPreviews.chooseAProject")}</strong>
        </div>
        <div
          className="connectedProjectChoices"
          role="group"
          aria-label={tr("marketing.arc.arcConnectedPreviews.exampleProject")}
        >
          {projects.map((item, index) => (
            <button
              key={item.folder}
              type="button"
              aria-pressed={project === index}
              onClick={() => {
                setProject(index);
                setResult(false);
              }}
            >
              <Icon name={index === 0 ? "panel" : "chart"} size={16} />
              <span>{item.name}</span>
            </button>
          ))}
        </div>
        <div className="connectedWorkspaceStep">
          <span>02</span>
          <strong>{tr("marketing.arc.arcConnectedPreviews.chooseTheComputer")}</strong>
        </div>
        <div
          className="connectedWorkspaceMachines"
          role="group"
          aria-label={tr("marketing.arc.arcConnectedPreviews.exampleWorkspaceComputer")}
        >
          {(["mac", "windows"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={device === value}
              onClick={() => {
                setDevice(value);
                setResult(false);
              }}
            >
              <img
                src={"/platform-brands/" + (value === "mac" ? "macos" : "windows") + ".svg"}
                width={17}
                height={17}
                alt=""
              />
              <span>{value === "mac" ? "Studio Mac" : "Build PC"}</span>
              <i className="connectedOnlineDot" />
            </button>
          ))}
        </div>
        <div className="connectedWorkspaceJob">
          <header>
            <Icon name="panel" size={14} />
            <code>{directory}</code>
            <span>{tr("marketing.arc.arcConnectedPreviews.workspace")}</span>
          </header>
          <div>
            <span className="connectedWorkspaceStep">
              <span>03</span>
              <strong>{tr("marketing.arc.arcConnectedPreviews.tellArcWhatToDoHere")}</strong>
            </span>
            <p>
              <img src="/remote-arc.svg" width={22} height={22} alt="Arc" />
              <span>{current.task}</span>
            </p>
            <button
              className="connectedWorkspaceRun"
              type="button"
              onClick={() => setResult(!result)}
            >
              {result
                ? tr("marketing.arc.arcConnectedPreviews.backToTask")
                : tr("marketing.arc.arcConnectedPreviews.seeExampleResult")}
              <Icon name={result ? "refresh" : "arrowUpRight"} size={13} />
            </button>
          </div>
          <footer aria-live="polite">
            {result ? (
              <>
                <Icon name="check" size={14} />
                <span>
                  <strong>{current.output}</strong>
                  {current.checks}
                </span>
              </>
            ) : (
              <>
                <Icon name="shield" size={14} />
                <span>{tr("marketing.arc.arcConnectedPreviews.arcWorksInThisProjectFolder")}</span>
              </>
            )}
          </footer>
        </div>
      </div>
    );
  return (
    <div className="connectedWorkspaces connectedWorkspaces--compact">
      <div className="connectedWorkspacePath">
        <Icon name="panel" size={15} />
        <span>Studio Mac</span>
        <span>/</span>
        <strong>Workspaces</strong>
      </div>
      {[
        {
          name: "remote-arc",
          detail: tr("marketing.arc.arcConnectedPreviews.appWebsite"),
          path: "~/Projects/remote-arc",
          branch: "main",
          color: "blue",
        },
        {
          name: "design-system",
          detail: tr("marketing.arc.arcConnectedPreviews.componentsBrand"),
          path: "~/Projects/design-system",
          branch: "design/v2",
          color: "violet",
        },
        {
          name: "research",
          detail: tr("marketing.arc.arcConnectedPreviews.notesBrowserWork"),
          path: "~/Work/research",
          branch: "—",
          color: "green",
        },
      ]
        .slice(0, compact ? 2 : 3)
        .map((project) => (
          <div className="connectedWorkspace" key={project.name}>
            <span data-color={project.color}>
              <Icon name="panel" size={19} />
            </span>
            <div>
              <strong>{project.name}</strong>
              <small>{compact ? project.detail : project.path}</small>
            </div>
            <code>{project.branch}</code>
          </div>
        ))}
      {!compact && (
        <div className="connectedWorkspaceNote">
          <Icon name="link" size={14} />
          {tr("marketing.arc.arcConnectedPreviews.theRightProjectOnTheRight")}
        </div>
      )}
    </div>
  );
}

export function VideoEditingPreview() {
  const { tr } = useI18n();
  const [portrait, setPortrait] = useState(false);
  const [review, setReview] = useState(false);
  return (
    <div className="connectedVideoEdit">
      <header>
        <span className="connectedWindowDots">
          <i />
          <i />
          <i />
        </span>
        <span>weekend-cut</span>
        <small>{tr("marketing.arc.arcConnectedPreviews.localProject")}</small>
      </header>
      <div className="connectedEditStage" data-format={portrait ? "portrait" : "landscape"}>
        <div className="connectedEditPicture" aria-hidden="true">
          <span className="connectedEditSun" />
          <span className="connectedEditHills" />
          <span className="connectedEditTitle">
            WEEKEND
            <br />
            STORIES
          </span>
          <small>00:12 / 00:30</small>
        </div>
        <span className="connectedEditCaption">
          {tr("marketing.arc.arcConnectedPreviews.keepTheMomentsThatMatter")}
        </span>
      </div>
      <div className="connectedEditTracks">
        <div className="connectedEditRuler">
          <span>00:00</span>
          <span>00:15</span>
          <span>00:30</span>
        </div>
        <div
          className="connectedEditClips"
          aria-label={tr("marketing.arc.arcConnectedPreviews.threeExampleClips")}
        >
          {["01", "02", "03"].map((clip, index) => (
            <span key={clip} data-clip={index}>
              <Icon name="panel" size={13} />
              <span>clip-{clip}.mp4</span>
            </span>
          ))}
        </div>
        <div className="connectedEditSubtitles">
          <Icon name="chat" size={12} />
          {tr("marketing.arc.arcConnectedPreviews.subtitleTrack")}
          <span>00:00 — 00:30</span>
        </div>
      </div>
      <div className="connectedEditControls">
        <div role="group" aria-label={tr("marketing.arc.arcConnectedPreviews.videoFormat")}>
          {[false, true].map((value) => (
            <button
              type="button"
              key={String(value)}
              aria-pressed={portrait === value}
              onClick={() => {
                setPortrait(value);
                setReview(false);
              }}
            >
              {value ? "9:16" : "16:9"}
            </button>
          ))}
        </div>
        <button className="connectedEditReview" type="button" onClick={() => setReview(!review)}>
          {review
            ? tr("marketing.arc.arcConnectedPreviews.adjustTheEdit")
            : tr("marketing.arc.arcConnectedPreviews.reviewExportPlan")}
          <Icon name={review ? "refresh" : "arrowUpRight"} size={13} />
        </button>
      </div>
      <div className="connectedEditResult" aria-live="polite">
        <Icon name={review ? "check" : "device"} size={15} />
        <span>
          {review
            ? tr("marketing.arc.arcConnectedPreviews.exportPlanSMp4Subtitles", {
                portrait: portrait ? "1080 × 1920" : "1920 × 1080",
              })
            : tr("marketing.arc.arcConnectedPreviews.trimCombineAndSubtitleOnYour")}
        </span>
      </div>
    </div>
  );
}

export function SlackAgentPreview() {
  const { tr, locale } = useI18n();
  const uid = useId();
  const [scenario, setScenario] = useState(0);
  const [input, setInput] = useState("");
  const [customQuestion, setCustomQuestion] = useState("");
  const [unsupported, setUnsupported] = useState(false);
  const questions = [
    tr("marketing.arc.arcConnectedPreviews.howAreMyDevicesDoing"),
    tr("marketing.arc.arcConnectedPreviews.checkThePerformanceOfMyBuild"),
    tr("marketing.arc.arcConnectedPreviews.showMeMyConnectedWorkspaces"),
  ];
  const select = (index: number) => {
    setScenario(index);
    setCustomQuestion("");
    setUnsupported(false);
    setInput("");
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!input.trim()) return;
    const query = input.trim();
    const index = /workspace|project|工作区|项目/i.test(query)
      ? 2
      : /performance|cpu|memory|性能|内存/i.test(query)
        ? 1
        : /device|online|computer|status|设备|电脑|在线|状态/i.test(query)
          ? 0
          : -1;
    setCustomQuestion(query);
    setUnsupported(index < 0);
    if (index >= 0) setScenario(index);
    setInput("");
  };
  return (
    <div
      className="slackAgentPreview"
      aria-label={tr("marketing.arc.arcConnectedPreviews.slackStyleRemoteArcChatDemo")}
    >
      <header className="slackTitlebar">
        <a
          href={localizedWebsiteHref("/integrations?provider=slack", locale)}
          aria-label={tr("marketing.arc.arcConnectedPreviews.exploreSlackIntegration")}
        >
          <img src="/app-brands/slack.svg" width={16} height={16} alt="Slack" />
        </a>
        <span>
          <Icon name="search" size={12} />
          {tr("marketing.arc.arcConnectedPreviews.searchYourWorkspace")}
        </span>
        <span className="connectedWindowDots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
      </header>
      <div className="slackPreviewBody">
        <aside className="slackSidebar">
          <div className="slackWorkspaceName">
            Arc workspace
            <Icon name="chevron" size={13} />
          </div>
          <a href={localizedWebsiteHref("/arc", locale)}>
            <Icon name="inbox" size={14} />
            {tr("marketing.arc.arcConnectedPreviews.activity")}
          </a>
          <small>{tr("marketing.arc.arcConnectedPreviews.channels")}</small>
          <span className="slackChannel"># {tr("marketing.arc.arcConnectedPreviews.general")}</span>
          <span className="slackChannel">
            # {tr("marketing.arc.arcConnectedPreviews.deviceOps")}
          </span>
          <small>{tr("marketing.arc.arcConnectedPreviews.directMessages")}</small>
          <div className="slackSelectedDm">
            <img src="/remote-arc.svg" alt="" width={17} height={17} />
            Remote Arc
            <i className="connectedOnlineDot" />
          </div>
          <div className="slackSidebarFooter">
            <i className="connectedOnlineDot" />
            {tr("marketing.arc.arcConnectedPreviews.yourFleetOneMessageAway")}
          </div>
        </aside>
        <div className="slackConversation">
          <header className="slackConversationHeader">
            <a href={localizedWebsiteHref("/arc", locale)}>
              <span className="slackArcAvatar">
                <img src="/remote-arc.svg" width={23} height={23} alt="" />
              </span>
              <div>
                <strong>Remote Arc</strong>
                <small>
                  <i className="connectedOnlineDot" />
                  {tr("marketing.arc.arcConnectedPreviews.yourPersonalAgent")}
                </small>
              </div>
            </a>
            <span className="slackAppBadge">APP</span>
          </header>
          <div className="slackMessages" aria-live="polite">
            <div className="slackDayDivider">
              <span>{tr("marketing.arc.arcConnectedPreviews.today")}</span>
            </div>
            <div className="slackMessage">
              <span className="slackUserAvatar">Y</span>
              <div>
                <div className="slackMessageAuthor">
                  <strong>{tr("marketing.arc.arcConnectedPreviews.you")}</strong>
                  <time>9:41</time>
                </div>
                <p>{customQuestion || questions[scenario]}</p>
              </div>
            </div>
            <div className="slackMessage">
              <span className="slackArcAvatar">
                <img src="/remote-arc.svg" width={25} height={25} alt="" />
              </span>
              <div className="slackAgentMessage">
                <div className="slackMessageAuthor">
                  <strong>Remote Arc</strong>
                  <span className="slackAppBadge">APP</span>
                  <time>9:41</time>
                </div>
                <p>
                  {unsupported
                    ? tr(
                        "marketing.arc.arcConnectedPreviews.thisPreviewSupportsDeviceStatusPerformance",
                      )
                    : scenario === 0
                      ? tr("marketing.arc.arcConnectedPreviews.yourFleetIsLookingGoodHere")
                      : scenario === 1
                        ? tr("marketing.arc.arcConnectedPreviews.hereSTheLatestSnapshotFor")
                        : tr("marketing.arc.arcConnectedPreviews.hereAreTheWorkspacesOnYour")}
                </p>
                {!unsupported && (
                  <div className="slackResultCard">
                    {scenario === 0 ? (
                      <DeviceFleetPreview compact />
                    ) : scenario === 1 ? (
                      <PerformancePreview compact />
                    ) : (
                      <WorkspacePreview compact />
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
          <div
            className="slackQuickPrompts"
            role="group"
            aria-label={tr("marketing.arc.arcConnectedPreviews.tryADeviceQuestion")}
          >
            {[
              tr("marketing.arc.arcConnectedPreviews.deviceStatus"),
              tr("marketing.arc.arcConnectedPreviews.performance"),
              tr("marketing.arc.arcConnectedPreviews.workspaces"),
            ].map((label, index) => (
              <button
                type="button"
                key={index}
                aria-pressed={!unsupported && scenario === index}
                onClick={() => select(index)}
              >
                {label}
              </button>
            ))}
          </div>
          <form className="slackComposer" onSubmit={submit}>
            <label htmlFor={uid} className="srOnly">
              {tr("marketing.arc.arcConnectedPreviews.messageRemoteArcDemo")}
            </label>
            <input
              id={uid}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder={tr("marketing.arc.arcConnectedPreviews.askAboutYourDevices")}
              maxLength={500}
            />
            <div>
              <span>
                <Icon name="add" size={15} />
                <strong>Aa</strong>
                <span>@</span>
              </span>
              <button
                type="submit"
                disabled={!input.trim()}
                aria-label={tr("marketing.arc.arcConnectedPreviews.sendDemoMessage")}
              >
                <Icon name="arrowUp" size={15} />
              </button>
            </div>
          </form>
          <footer className="slackPreviewFootnote">
            <span>{tr("marketing.arc.arcConnectedPreviews.interactivePreviewExampleData")}</span>
            <a href={arcChatHref(customQuestion || questions[scenario]!, "homepage-slack-preview")}>
              {tr("marketing.arc.arcConnectedPreviews.tryInArc")}
              <Icon name="arrowUpRight" size={11} />
            </a>
          </footer>
        </div>
      </div>
    </div>
  );
}
