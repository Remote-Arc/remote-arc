import { useAmbientMotion } from "../../../hooks/marketing/use-ambient-motion.js";
import { useEffect, useId, useState, type CSSProperties } from "react";
import { useI18n } from "../../../hooks/use-i18n.js";
import { localizedWebsiteHref } from "../../../lib/marketing-paths.js";
import directory from "../../../data/app-directory.json" with { type: "json" };
import "../../../styles/marketing/home/home-connection-scene.css";

type AiClient = { name: string; slug: string; icon: string; tone: string };
export type HomeConnectionMode = "connect" | "arc";
type Mode = HomeConnectionMode;
// An app names its provider in the apps directory; its link opens that integration.
type Resource = {
  id: string;
  name: string;
  icon: string;
  kind: "app" | "device";
  provider?: string;
};

const apps: readonly Resource[] = [
  { id: "github", name: "GitHub", icon: "/app-brands/github.svg", kind: "app", provider: "github" },
  { id: "slack", name: "Slack", icon: "/app-brands/slack.svg", kind: "app", provider: "slack" },
  { id: "gmail", name: "Gmail", icon: "/app-brands/gmail.svg", kind: "app", provider: "gmail" },
  {
    id: "calendar",
    name: "Google Calendar",
    icon: "/app-brands/googlecalendar.svg",
    kind: "app",
    provider: "google_calendar",
  },
  {
    id: "drive",
    name: "Google Drive",
    icon: "/app-brands/googledrive.svg",
    kind: "app",
    provider: "google_drive",
  },
  {
    id: "whatsapp",
    name: "WhatsApp",
    icon: "/app-brands/whatsapp.svg",
    kind: "app",
    provider: "whatsapp",
  },
];
const devices: readonly Resource[] = [
  { id: "mac", name: "Mac", icon: "/platform-brands/macos.svg", kind: "device" },
  { id: "windows", name: "Windows", icon: "/platform-brands/windows.svg", kind: "device" },
  { id: "linux", name: "Linux", icon: "/platform-brands/linux.svg", kind: "device" },
  { id: "browser", name: "Browser", icon: "/platform-brands/browser.svg", kind: "device" },
];

// One request per beat: a beam runs from the asking AI into Remote Arc, then out
// to the app or computer that does the work, which lights up and is logged.
// `source` is the AI client's index (Arc has a single source).
type Run = { source: number; target: string; tool: string; took: string };
const CONNECT_RUNS: readonly Run[] = [
  { source: 0, target: "windows", tool: "start_process", took: "1.8s" },
  { source: 1, target: "github", tool: "open_pull_request", took: "0.9s" },
  { source: 2, target: "mac", tool: "read_file", took: "0.2s" },
  { source: 0, target: "gmail", tool: "create_draft", took: "0.6s" },
  { source: 1, target: "calendar", tool: "find_free_time", took: "0.4s" },
  { source: 2, target: "linux", tool: "tail_logs", took: "0.3s" },
];
const ARC_RUNS: readonly Run[] = [
  { source: 0, target: "calendar", tool: "list_events", took: "0.4s" },
  { source: 0, target: "gmail", tool: "search_threads", took: "0.7s" },
  { source: 0, target: "whatsapp", tool: "templates.send", took: "0.5s" },
  { source: 0, target: "slack", tool: "post_summary", took: "0.3s" },
];
const BEAT_MS = 3200;

// The stage is drawn on a 640 x 354 grid; CSS scales it with the scene width,
// so the wires in the SVG always meet the cards at these points.
const SOURCE_Y = [64, 164, 264];
const HUB = { left: 264, right: 380, y: 164 };
const GROUP_Y = { app: 101, device: 268 };
const wireIn = (y: number) => `M182 ${y} C224 ${y},222 ${HUB.y},${HUB.left} ${HUB.y}`;
const wireOut = (y: number) => `M${HUB.right} ${HUB.y} C412 ${HUB.y},408 ${y},440 ${y}`;

function resourceHref(node: Resource) {
  if (node.provider) {
    // Fail loudly in tests rather than link to an integration that does not exist.
    const app = directory.apps.find((entry) => entry.provider === node.provider);
    if (!app) throw new Error("Unknown app provider: " + node.provider);
    return "/integrations?provider=" + app.provider;
  }
  return node.name === "Browser" ? "/chrome-extension" : "/downloads";
}

const cls = (...parts: (string | false | undefined)[]) => parts.filter(Boolean).join(" ");
const byId = new Map([...apps, ...devices].map((node) => [node.id, node]));

export function HomeConnectionScene({
  clients,
  arcAvailable = false,
  initialMode = "connect",
  mode: controlledMode,
  onModeChange,
}: {
  clients: readonly AiClient[];
  arcAvailable?: boolean;
  initialMode?: Mode;
  mode?: Mode;
  onModeChange?: (mode: Mode) => void;
}) {
  const { tr, locale } = useI18n();
  const { ref, running } = useAmbientMotion();
  const [localMode, setLocalMode] = useState<Mode>(initialMode);
  const [beat, setBeat] = useState(0);
  const mode = controlledMode ?? localMode;
  const uid = useId();
  const arc = mode === "arc";
  const topologyClients = clients.filter((client) => client.slug !== "gemini").slice(0, 3);
  const headlineId = uid + "-heading";
  const descriptionId = uid + "-description";
  const panelId = uid + "-panel";
  const runs = arc ? ARC_RUNS : CONNECT_RUNS;
  const run = runs[beat % runs.length]!;
  const target = byId.get(run.target)!;
  // Alternating class names restart the CSS animations on every beat.
  const go = running ? "is-go" + (beat % 2) : "";

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setBeat((value) => value + 1), BEAT_MS);
    return () => window.clearInterval(timer);
  }, [running]);

  const switchMode = (value: Mode) => {
    if (controlledMode === undefined) setLocalMode(value);
    setBeat(0);
    onModeChange?.(value);
  };
  const sourceName = (index: number) =>
    arc ? "Arc" : (topologyClients[index]?.name ?? topologyClients[0]?.name ?? "AI");
  const log = [0, 1, 2].map((back) => {
    const index = (((beat - back) % runs.length) + runs.length) % runs.length;
    const entry = runs[index]!;
    return {
      key: beat - back,
      fresh: back === 0,
      route: sourceName(entry.source) + " → " + byId.get(entry.target)!.name,
      tool: entry.tool,
      took: entry.took,
    };
  });
  const resourceNode = (node: Resource) => (
    <a
      key={node.id}
      className={cls(
        "hcsFloatingNode hcsResourceNode hcsResourceNode--" + node.kind,
        node.id === target.id && go,
      )}
      data-resource={node.kind}
      href={localizedWebsiteHref(resourceHref(node), locale)}
      aria-label={
        node.kind === "app"
          ? tr("marketing.home.homeConnectionScene.explore") + node.name
          : tr("marketing.home.homeConnectionScene.connect2") + node.name
      }
    >
      <span className="hcsLogoTile">
        <img src={node.icon} alt="" width={22} height={22} />
      </span>
      <span className="hcsNodeLabel">{node.name}</span>
      {node.kind === "device" && <i className="hcsDeviceStatus" aria-hidden="true" />}
    </a>
  );

  return (
    <div
      ref={ref}
      className="homeConnectionScene"
      data-layout="router"
      data-mode={mode}
      data-running={running}
      role="region"
      aria-labelledby={headlineId}
    >
      <header className="hcsHeader">
        <span className="hcsLive" aria-hidden="true" />
        <h2 id={headlineId}>{tr("marketing.home.homeConnectionScene.fromChatToAction")}</h2>
        <div
          className="hcsModeSwitch"
          role="tablist"
          aria-label={tr("marketing.home.homeConnectionScene.exploreRemoteArcModes")}
        >
          <span className="hcsModeSlider" aria-hidden="true" />
          {(["connect", "arc"] as const).map((value) => (
            <button
              key={value}
              id={uid + "-" + value}
              type="button"
              role="tab"
              aria-selected={mode === value}
              aria-controls={panelId}
              tabIndex={mode === value ? 0 : -1}
              onClick={() => switchMode(value)}
              onKeyDown={(event) => {
                if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
                  event.preventDefault();
                  const next =
                    event.key === "Home"
                      ? "connect"
                      : event.key === "End"
                        ? "arc"
                        : mode === "connect"
                          ? "arc"
                          : "connect";
                  switchMode(next);
                  document.getElementById(uid + "-" + next)?.focus();
                }
              }}
            >
              {value === "connect" ? (
                "Connect"
              ) : (
                <>
                  Arc
                  {!arcAvailable && (
                    <span className="hcsSoonLabel">
                      {tr("marketing.home.homeConnectionScene.checkAvailability")}
                    </span>
                  )}
                </>
              )}
            </button>
          ))}
        </div>
      </header>
      <p className="hcsModeIntroduction" id={descriptionId}>
        <strong>
          {arc
            ? tr("marketing.home.homeConnectionScene.anAiAgentOfYourOwn")
            : tr("marketing.home.homeConnectionScene.yourFavoriteAiConnectedToYour")}
        </strong>{" "}
        <span>
          {arc
            ? tr("marketing.home.homeConnectionScene.builtWithConnectByAiDescribe")
            : tr("marketing.home.homeConnectionScene.bringChatgptClaudeOrCursorConnect")}
        </span>
      </p>

      <div
        id={panelId}
        role="tabpanel"
        aria-labelledby={uid + "-" + mode}
        aria-describedby={descriptionId}
        className="hcsUniverse"
        tabIndex={0}
      >
        <svg className="hcsWires" viewBox="0 0 640 354" aria-hidden="true">
          <defs>
            <linearGradient id={uid + "-in"} gradientUnits="userSpaceOnUse" x1="182" x2="264">
              <stop offset="0" style={{ stopColor: "var(--hcs-beam-a)" }} />
              <stop offset="1" style={{ stopColor: "var(--hcs-beam-b)" }} />
            </linearGradient>
            <linearGradient id={uid + "-out"} gradientUnits="userSpaceOnUse" x1="380" x2="440">
              <stop offset="0" style={{ stopColor: "var(--hcs-beam-b)" }} />
              <stop offset="1" style={{ stopColor: "var(--hcs-beam-c)" }} />
            </linearGradient>
          </defs>
          <g className="hcsInboundPaths">
            {(arc ? [HUB.y] : SOURCE_Y.slice(0, topologyClients.length)).map((y, index) => (
              <g key={index}>
                <path className="hcsTrack" d={wireIn(y)} />
                <path className="hcsTrickle" d={wireIn(y)} />
                <path
                  className={cls("hcsBeam", run.source === index && go)}
                  stroke={"url(#" + uid + "-in)"}
                  pathLength="100"
                  d={wireIn(y)}
                />
              </g>
            ))}
          </g>
          <g className="hcsOutboundPaths">
            {(["app", "device"] as const).map((kind) => (
              <g key={kind}>
                <path className="hcsTrack" d={wireOut(GROUP_Y[kind])} />
                <path className="hcsTrickle" d={wireOut(GROUP_Y[kind])} />
                <path
                  className={cls("hcsBeam hcsBeam--out", target.kind === kind && go)}
                  stroke={"url(#" + uid + "-out)"}
                  pathLength="100"
                  d={wireOut(GROUP_Y[kind])}
                />
              </g>
            ))}
          </g>
        </svg>

        <span className="hcsCaption hcsCaption--sources">
          {arc
            ? tr("marketing.home.homeConnectionScene.you")
            : tr("marketing.home.homeConnectionScene.yourAi")}
        </span>
        <div
          className={"hcsSource hcsSource--connect" + (arc ? " hcsSource--hidden" : "")}
          aria-hidden={arc}
        >
          {topologyClients.map((client, index) => (
            <a
              className={cls(
                "hcsFloatingNode hcsAiNode",
                client.tone === "mono" && "hcsAiNode--mono",
                !arc && run.source === index && go,
              )}
              key={client.slug}
              href={localizedWebsiteHref("/install/" + client.slug, locale)}
              tabIndex={arc ? -1 : 0}
              aria-label={tr("marketing.home.homeConnectionScene.connect", { name: client.name })}
              style={{ "--row": index } as CSSProperties}
            >
              <span className="hcsLogoTile">
                <img src={client.icon} alt="" width={19} height={19} />
              </span>
              <span className="hcsNodeLabel">{client.name}</span>
            </a>
          ))}
        </div>
        <div
          className={"hcsSource hcsSource--arc" + (arc ? "" : " hcsSource--hidden")}
          aria-hidden={!arc}
        >
          <div className={cls("hcsPromptBubble", arc && go)}>
            <span className="hcsPromptAvatar" aria-hidden="true">
              {tr("marketing.home.homeConnectionScene.you")}
            </span>
            <span>
              {tr("marketing.home.homeConnectionScene.planMyWeekBringEverythingTogether")}
            </span>
          </div>
        </div>

        <div className="hcsCore">
          <span className="hcsCoreName">{arc ? "Arc Agent" : "Remote Arc"}</span>
          <a
            className="hcsCoreMark"
            href={localizedWebsiteHref(arc ? "/arc" : "/connect-ai", locale)}
            aria-label={
              arc
                ? tr("marketing.home.homeConnectionScene.exploreArcAgent")
                : tr("marketing.home.homeConnectionScene.exploreRemoteArcConnect")
            }
          >
            <span className="hcsCoreGlow" aria-hidden="true" />
            <span className="hcsPowerCore">
              <img
                className="hcsBrandLogo"
                src="/remote-arc.svg"
                alt="Remote Arc"
                width={58}
                height={58}
              />
            </span>
            <span className={cls("hcsLogoCurrent", go)} aria-hidden="true" />
          </a>
          <span className="hcsCoreTagline">
            {arc
              ? tr("marketing.home.homeConnectionScene.yourAiAgent")
              : tr("marketing.home.homeConnectionScene.yourAiYourRules")}
          </span>
          <span className={cls("hcsRoute", go)} aria-hidden="true">
            → {target.name} · {run.tool}
          </span>
        </div>

        <section
          className="hcsGroup hcsGroup--apps"
          aria-label={tr("marketing.home.homeConnectionScene.apps")}
        >
          <span className="hcsCaption">{tr("marketing.home.homeConnectionScene.apps")}</span>
          <div className="hcsAppGrid">{apps.map(resourceNode)}</div>
        </section>
        <section
          className="hcsGroup hcsGroup--devices"
          aria-label={tr("marketing.home.homeConnectionScene.devices")}
        >
          <span className="hcsCaption">{tr("marketing.home.homeConnectionScene.devices")}</span>
          <div className="hcsDeviceList">{devices.map(resourceNode)}</div>
        </section>
      </div>

      <ol className="hcsLog" aria-hidden="true">
        {log.map((row) => (
          <li key={row.key} className={(row.fresh && go) || undefined}>
            <span className="hcsLogRoute">{row.route}</span>
            <span className="hcsLogTool">{row.tool}</span>
            <span className="hcsLogOk">✓ {row.took}</span>
          </li>
        ))}
      </ol>

      <footer className="hcsFooter">
        <ul
          className="hcsFoundation"
          aria-label={tr("marketing.home.homeConnectionScene.sharedPlatformCapabilities")}
        >
          {[
            tr("marketing.home.homeConnectionScene.skills"),
            tr("marketing.home.homeConnectionScene.execution"),
            tr("marketing.home.homeConnectionScene.approvals"),
            tr("marketing.home.homeConnectionScene.verifiedResults"),
          ].map((label) => (
            <li key={label}>{label}</li>
          ))}
        </ul>
        <div className="hcsFooterRow">
          <span className="hcsModeStatus">
            <i aria-hidden="true" />
            {arc
              ? arcAvailable
                ? tr("marketing.home.homeConnectionScene.arcAgentAvailableNow")
                : tr("marketing.home.homeConnectionScene.arcAgentCheckWorkspaceAccess")
              : tr("marketing.home.homeConnectionScene.connectAvailableNow")}
          </span>
          <a href={localizedWebsiteHref(arc ? "/arc" : "/connect-ai", locale)}>
            {arc
              ? tr("marketing.home.homeConnectionScene.meetArc")
              : tr("marketing.home.homeConnectionScene.connectYourAi")}{" "}
            <span aria-hidden="true">↗</span>
          </a>
        </div>
        <p className="hcsPlatformScope">
          {tr("marketing.home.homeConnectionScene.chooseTheAccountsAndComputersYour")}
        </p>
      </footer>
    </div>
  );
}
