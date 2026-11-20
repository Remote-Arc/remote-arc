import { useEffect, useId, useState } from "react";
import { useAmbientMotion } from "../../../hooks/marketing/use-ambient-motion.js";
import { useArcRequests } from "../../../hooks/marketing/use-arc-requests.js";
import { useI18n } from "../../../hooks/use-i18n.js";
import {
  ARC_APEX,
  arcGeometry,
  arcPath,
  arcPoint,
  globeLines,
  ringGeometry,
  routePath,
  routeStreak,
  type RouteStop,
} from "../../../lib/arc-horizon.js";
import { localizedWebsiteHref } from "../../../lib/marketing-paths.js";
import "../../../styles/marketing/home/home-arc-horizon.css";

type ArcNode = {
  id: string;
  name: string;
  icon: string;
  href: string;
  /** The rim carries the AI clients and apps; the inner ring carries the computers. */
  ring: RouteStop["ring"];
  angle: number;
  /** Where it sits on a phone; without one it is left off there. */
  narrowAngle?: number;
  kind: "ai" | "app" | "device";
};

const node = (
  id: string,
  name: string,
  icon: string,
  href: string,
  kind: ArcNode["kind"],
  ring: ArcNode["ring"],
  angle: number,
  narrowAngle?: number,
): ArcNode => ({ id, name, icon, href, kind, ring, angle, narrowAngle });

// AI clients on the rim's left, apps on its right, computers on the inner ring.
const NODES: readonly ArcNode[] = [
  node("chatgpt", "ChatGPT", "/ai-openai.svg", "/install/chatgpt", "ai", "rim", 137, 128),
  node("claude", "Claude", "/ai-claude.svg", "/install/claude", "ai", "rim", 121, 108),
  node("cursor", "Cursor", "/ai-cursor.svg", "/install/cursor", "ai", "rim", 105),
  node(
    "github",
    "GitHub",
    "/app-brands/github.svg",
    "/integrations?provider=github",
    "app",
    "rim",
    75,
  ),
  node(
    "slack",
    "Slack",
    "/app-brands/slack.svg",
    "/integrations?provider=slack",
    "app",
    "rim",
    59,
    52,
  ),
  node(
    "whatsapp",
    "WhatsApp",
    "/app-brands/whatsapp.svg",
    "/integrations?provider=whatsapp",
    "app",
    "rim",
    43,
    72,
  ),
  node("mac", "Mac", "/platform-brands/macos.svg", "/downloads", "device", "ring", 124, 72),
  node(
    "windows",
    "Windows",
    "/platform-brands/windows.svg",
    "/downloads",
    "device",
    "ring",
    106,
    108,
  ),
  node("linux", "Linux", "/platform-brands/linux.svg", "/downloads", "device", "ring", 74),
  node(
    "browser",
    "Chrome",
    "/platform-brands/browser.svg",
    "/chrome-extension",
    "device",
    "ring",
    56,
  ),
];

// Example requests, one per beat: which AI asked, what it reached, the tool it
// used, and what that did in plain words.
const ROUTES = [
  { from: "chatgpt", to: "windows", tool: "start_process", took: "1.8s", say: "chatgptWindows" },
  { from: "claude", to: "github", tool: "pulls.get", took: "0.4s", say: "claudeGithub" },
  { from: "cursor", to: "mac", tool: "edit_block", took: "0.3s", say: "cursorMac" },
  { from: "chatgpt", to: "whatsapp", tool: "messages.send", took: "0.7s", say: "chatgptWhatsapp" },
  { from: "claude", to: "browser", tool: "shared_tab_read", took: "0.9s", say: "claudeBrowser" },
  { from: "cursor", to: "linux", tool: "start_process", took: "1.1s", say: "cursorLinux" },
  { from: "chatgpt", to: "slack", tool: "messages.list", took: "0.6s", say: "chatgptSlack" },
  { from: "claude", to: "windows", tool: "read_file", took: "0.2s", say: "claudeWindowsLog" },
] as const;

const pct = (value: number) => value / 10 + "%";

function useNarrow() {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 700px)");
    const update = () => setNarrow(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return narrow;
}

/**
 * The hero's arc, drawn as the rim of a globe: AI clients on its left, apps on
 * its right, computers on an inner latitude and Remote Arc at the top, with
 * one example request running from an AI to its target at a time.
 * `progress` (0–1, from the page's scroll) grows the arc upward until its
 * inside fills the screen; scrolling back shrinks it again.
 */
export function HomeArcHorizon({ progress }: { progress: number }) {
  const { tr, locale } = useI18n();
  const uid = useId().replace(/:/g, "");
  const narrow = useNarrow();
  const { ref, running } = useAmbientMotion();
  const nodes = NODES.filter((item) => (narrow ? item.narrowAngle : item.angle) !== undefined);
  const stop: Record<string, RouteStop> = Object.fromEntries(
    nodes.map((item) => [
      item.id,
      { ring: item.ring, angle: narrow ? item.narrowAngle! : item.angle },
    ]),
  );
  const routes = ROUTES.filter((item) => item.from in stop && item.to in stop);
  const { route, travel, log } = useArcRequests(routes.length, running, 1);
  const arc = arcGeometry(progress, narrow);
  const ring = ringGeometry(arc);
  const lines = globeLines(arc);
  const apex = arcPoint(arc, ARC_APEX);
  const current = routes[route % routes.length]!;
  const from = stop[current.from]!;
  const to = stop[current.to]!;
  // Eased, so a request sets off gently, runs, and settles onto its target.
  const t = travel === null ? null : travel * travel * (3 - 2 * travel);
  const lit = t === null ? null : t < 0.48 ? current.from : t >= 0.58 ? current.to : null;
  const href = (path: string) => localizedWebsiteHref(path, locale);

  return (
    <div
      className="homeArc"
      ref={ref}
      data-running={running}
      style={{ ["--arc-fade" as string]: String(Math.max(0, 1 - progress * 2.4)) }}
    >
      <svg
        className="homeArcArt"
        viewBox="0 0 1000 1000"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <defs>
          <linearGradient
            id={uid + "-rim"}
            x1="0"
            x2="1000"
            y1="0"
            y2="0"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0" className="homeArcStopEdge" />
            <stop offset="0.22" className="homeArcStopFrom" />
            <stop offset="0.5" className="homeArcStopMid" />
            <stop offset="0.78" className="homeArcStopTo" />
            <stop offset="1" className="homeArcStopEdge" />
          </linearGradient>
          <linearGradient
            id={uid + "-fill"}
            x1="0"
            x2="0"
            y1={apex.y}
            y2={apex.y + 760}
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0" className="homeArcFillTop" />
            <stop offset="1" className="homeArcFillBottom" />
          </linearGradient>
        </defs>
        <ellipse
          className="homeArcFill"
          cx={arc.cx}
          cy={arc.cy}
          rx={arc.rx}
          ry={arc.ry}
          fill={`url(#${uid}-fill)`}
        />
        {lines.latitudes.map((line, index) => (
          <path key={"lat" + index} className="homeArcLine" d={arcPath(line, 200, -20, 64)} />
        ))}
        {lines.meridians.map((line, index) => (
          <path key={"mer" + index} className="homeArcLine" d={arcPath(line, 180, 0, 64)} />
        ))}
        <path className="homeArcLine" d={`M${apex.x} ${apex.y} L${apex.x} 1000`} />
        <path className="homeArcRingPath" d={arcPath(ring, 200, -20, 80)} />
        <path className="homeArcRim" d={arcPath(arc, 200, -20, 96)} stroke={`url(#${uid}-rim)`} />
        {t !== null && (
          <g className="homeArcTrail">
            <path className="homeArcRoute" d={routePath(arc, from, to)} />
            {routeStreak(arc, from, to, t).map((piece, index) => (
              <path
                key={index}
                className="homeArcStreak"
                d={piece.d}
                style={{ opacity: piece.share ** 1.6, strokeWidth: 0.6 + piece.share * 2.2 }}
              />
            ))}
          </g>
        )}
      </svg>

      {nodes.map((node) => {
        const place = stop[node.id]!;
        const point = arcPoint(place.ring === "ring" ? ring : arc, place.angle);
        return (
          <a
            key={node.id}
            className="homeArcNode"
            data-kind={node.kind}
            data-ring={node.ring}
            data-lit={lit === node.id || undefined}
            href={href(node.href)}
            style={{ left: pct(point.x), top: pct(point.y) }}
            aria-label={
              node.kind === "ai"
                ? tr("marketing.home.homeConnectionScene.connect", { name: node.name })
                : (node.kind === "app"
                    ? tr("marketing.home.homeConnectionScene.explore")
                    : tr("marketing.home.homeConnectionScene.connect2")) + node.name
            }
          >
            <span className="homeArcTile">
              <img src={node.icon} alt="" width={22} height={22} />
            </span>
            <span className="homeArcLabel">{node.name}</span>
          </a>
        );
      })}

      <div className="homeArcHub" style={{ left: pct(apex.x), top: pct(apex.y) }}>
        <a
          className="homeArcHubMark"
          data-busy={t !== null && t > 0.42 && t < 0.6 ? "" : undefined}
          href={href("/connect-ai")}
          aria-label={tr("marketing.home.homeConnectionScene.exploreRemoteArcConnect")}
        >
          <img src="/remote-arc.svg" alt="" width={60} height={60} />
        </a>
      </div>

      {/* The latest request in plain words, with the tool it used and how long it took. */}
      <ol className="homeArcLog" aria-label={tr("marketing.home.arcHorizon.exampleRequests")}>
        {log.map((index) => {
          const item = routes[index % routes.length]!;
          return (
            <li key={index}>
              <span className="homeArcLogTag">{tr("marketing.home.arcHorizon.example")}</span>
              <span className="homeArcLogSay">
                {tr(`marketing.home.arcHorizon.say.${item.say}`)}
              </span>
              <code>{item.tool}</code>
              <em>✓ {item.took}</em>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
