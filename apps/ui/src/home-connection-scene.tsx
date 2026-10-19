import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { useI18n } from "./i18n.js";
import "./home-connection-scene.css";

type AiClient = { name: string; slug: string; icon: string; tone: string };
type Mode = "connect" | "arc";
type OrbitNode = { name: string; icon: string; x: number; y: number; kind: "app" | "device"; calendar?: boolean };

const resources: readonly OrbitNode[] = [
  { name: "GitHub", icon: "/app-brands/github.svg", x: 115, y: 157, kind: "app" },
  { name: "Slack", icon: "/app-brands/slack.svg", x: 57, y: 250, kind: "app" },
  { name: "Runway", icon: "/app-brands/runway.svg", x: 95, y: 345, kind: "app" },
  { name: "Vercel", icon: "/app-brands/vercel.svg", x: 195, y: 414, kind: "app" },
  { name: "Google Drive", icon: "/app-brands/googledrive.svg", x: 310, y: 438, kind: "app" },
  { name: "Notion", icon: "/app-brands/notion.svg", x: 425, y: 414, kind: "app" },
  { name: "Mac", icon: "/platform-brands/macos.svg", x: 490, y: 145, kind: "device" },
  { name: "Windows", icon: "/platform-brands/windows.svg", x: 544, y: 244, kind: "device" },
  { name: "Linux", icon: "/platform-brands/linux.svg", x: 544, y: 340, kind: "device" },
  { name: "Browser", icon: "/platform-brands/browser.svg", x: 555, y: 438, kind: "device" },
];
const aiPositions = [{ x: 202, y: 47 }, { x: 300, y: 33 }, { x: 398, y: 47 }];

function useAmbientMotion() {
  const ref = useRef<HTMLDivElement>(null);
  const [running, setRunning] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    let inView = typeof IntersectionObserver === "undefined";
    const update = () => setRunning(inView && document.visibilityState === "visible" && !media.matches);
    const observer = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(entries => {
      inView = entries.some(entry => entry.isIntersecting);
      update();
    }, { threshold: .08 });
    if (ref.current) observer?.observe(ref.current);
    media.addEventListener("change", update);
    document.addEventListener("visibilitychange", update);
    update();
    return () => {
      observer?.disconnect();
      media.removeEventListener("change", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  return { ref, running };
}

function connectionPath(node: OrbitNode) {
  const dx = node.x - 300;
  const dy = node.y - 246;
  return `M300 246 C${300 + dx * .15} ${246 + dy * .7},${node.x - dx * .35} ${node.y},${node.x} ${node.y}`;
}
const position = (x: number, y: number, delay = 0): CSSProperties =>
  ({ left: x / 6 + "%", top: y / 5 + "%", "--float-delay": delay + "s" } as CSSProperties);

export function HomeConnectionScene({ clients,arcAvailable=false,initialMode='connect' }: { clients: readonly AiClient[];arcAvailable?:boolean;initialMode?:Mode }) {
  const { tr } = useI18n();
  const { ref, running } = useAmbientMotion();
  const [mode, setMode] = useState<Mode>(initialMode);
  const uid = useId();
  const arc = mode === "arc";
  const headlineId = uid + "-heading";
  const descriptionId = uid + "-description";
  const panelId = uid + "-panel";
  const switchMode = (value: Mode) => setMode(value);
  return (
    <div ref={ref} className="homeConnectionScene" data-layout="constellation" data-mode={mode} data-running={running} role="region" aria-labelledby={headlineId}>
      <header className="hcsHeader">
        <h2 id={headlineId}>{tr("FROM CHAT TO ACTION", "让对话变成行动")}</h2>
        <div className="hcsModeSwitch" role="tablist" aria-label={tr("Explore Remote Arc modes", "查看 Remote Arc 两种模式")}>
          {(["connect", "arc"] as const).map(value => (
            <button key={value} id={uid + "-" + value} type="button" role="tab"
              aria-selected={mode === value} aria-controls={panelId} tabIndex={mode === value ? 0 : -1}
              onClick={() => switchMode(value)}
              onKeyDown={event => {
                if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
                  event.preventDefault();
                  const next = event.key === "Home" ? "connect" : event.key === "End" ? "arc" : mode === "connect" ? "arc" : "connect";
                  switchMode(next);
                  document.getElementById(uid + "-" + next)?.focus();
                }
              }}>
              {value === "connect" ? "Connect" : <>Arc{!arcAvailable&&<span className="hcsSoonLabel">{tr("Coming soon", "即将上线")}</span>}</>}
            </button>
          ))}
        </div>
      </header>
      <div className="hcsModeIntroduction" id={descriptionId} aria-live="polite">
        <strong>{arc ? tr("An AI teammate of your own.", "创建属于你的 AI 队友。") : tr("Your favorite AI. Connected to your world.", "熟悉的 AI，连接你的整个世界。")}</strong>
        <span>{arc ? tr("Natural language. One agent. Your apps and devices.", "用自然语言，让 Arc 协调你的应用与设备。") : tr("Bring ChatGPT, Claude or Cursor. Arc connects the tools.", "接入 ChatGPT、Claude 或 Cursor，Arc 连接工具与设备。")}</span>
      </div>
      <div id={panelId} role="tabpanel" aria-labelledby={uid + "-" + mode} aria-describedby={descriptionId} className="hcsUniverse" tabIndex={0}>
        <div className="hcsAtmosphere" aria-hidden="true" />
        <svg className="hcsOrbitGeometry" viewBox="0 0 600 500" aria-hidden="true">
          <defs>
            <radialGradient id={uid + "-glow"}>
              <stop stopColor="currentColor" stopOpacity=".13" />
              <stop offset="1" stopColor="currentColor" stopOpacity="0" />
            </radialGradient>
            <linearGradient id={uid + "-trace"} x1="0" x2="1">
              <stop stopColor="currentColor" stopOpacity=".12" />
              <stop offset=".5" stopColor="currentColor" stopOpacity=".45" />
              <stop offset="1" stopColor="currentColor" stopOpacity=".12" />
            </linearGradient>
          </defs>
          <ellipse className="hcsOrbitalRing hcsOrbitalRingOuter" cx="300" cy="260" rx="242" ry="188" transform="rotate(-13 300 260)" />
          <ellipse className="hcsOrbitalRing hcsOrbitalRingInner" cx="300" cy="260" rx="189" ry="143" transform="rotate(15 300 260)" />
          <circle cx="300" cy="246" r="143" fill={"url(#" + uid + "-glow)"} />
          <g className="hcsPowerWaves"><circle cx="300" cy="246" r="54"/><circle cx="300" cy="246" r="54"/></g>
          <g className="hcsOutboundPaths">
            {resources.map(node => <path key={node.name} d={connectionPath(node)} stroke={"url(#" + uid + "-trace)"} />)}
          </g>
          <g className="hcsOutboundFlow">
            {resources.map((node, index) => <g key={node.name} style={{'--current-delay': (index * .085) + 's'} as CSSProperties}>
              <path className="hcsCurrentTrail" pathLength="100" d={connectionPath(node)}/>
              <path className="hcsCurrentFilament" pathLength="100" d={connectionPath(node)}/>
              <path className="hcsCurrentHead" pathLength="100" d={connectionPath(node)}/>
            </g>)}
          </g>
          <g className="hcsInboundPaths">
            {(arc ? [{ x: 300, y: 76 }] : aiPositions).map((node, index) => {
              const d = `M${node.x} ${node.y + 20} C${node.x} 132,300 132,300 208`;
              return <g key={index}><path d={d} /><path className="hcsInboundFlow" pathLength="100" d={d} style={{ animationDelay: index * .08 + "s" }} /></g>;
            })}
          </g>
          <g className="hcsStars">
            {[[160,226],[430,256],[237,365],[357,136],[385,353],[172,102],[461,363],[253,173]].map(([x,y],i) => <circle key={i} cx={x} cy={y} r={i % 3 === 0 ? 1.6 : 1} />)}
          </g>
        </svg>
        <div className={"hcsSource hcsSource--connect" + (arc ? " hcsSource--hidden" : "")} aria-hidden={arc}>
          {clients.slice(0, 3).map((client, index) => {
            const at = aiPositions[index]!;
            return <a className={"hcsFloatingNode hcsAiNode " + (client.tone === "mono" ? "hcsAiNode--mono" : "")}
              key={client.slug} href={"/install/" + client.slug} tabIndex={arc ? -1 : 0}
              aria-label={tr("Connect " + client.name, "连接 " + client.name)} style={position(at.x, at.y, index * -1.7)}>
              <span className="hcsLogoTile"><img src={client.icon} alt="" width={28} height={28} /></span><span className="hcsNodeLabel">{client.name}</span>
            </a>;
          })}
        </div>
        <div className={"hcsSource hcsSource--arc" + (arc ? "" : " hcsSource--hidden")} aria-hidden={!arc}>
          <div className="hcsPromptBubble"><span className="hcsPromptAvatar" aria-hidden="true">You</span><span>{tr("Plan my week. Bring everything together.", "规划我的一周，把所有事情串联起来。")}</span><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 15V5m-4 4 4-4 4 4" /></svg></div>
        </div>
        <span className="hcsGroupCaption hcsAppsCaption">APPS</span>
        <span className="hcsGroupCaption hcsDevicesCaption">DEVICES</span>
        {resources.map((node, index) => (
          <div key={node.name} className={"hcsFloatingNode hcsResourceNode hcsResourceNode--" + node.kind} style={position(node.x, node.y, index * -.93)} data-resource={node.kind}>
            <span className="hcsLogoTile" style={{'--power-delay': (index * .085) + 's'} as CSSProperties}>
              <img src={node.icon} alt="" width={30} height={30} />
              {node.calendar && <svg className="hcsCalendarCue" viewBox="0 0 16 16" aria-hidden="true"><rect x="2.5" y="3.5" width="11" height="10" rx="2" /><path d="M5 2v3m6-3v3M3 7h10M6 10h4" /></svg>}
            </span>
            <span className="hcsNodeLabel">{node.name}</span>
          </div>
        ))}
        <div className="hcsCore" style={position(300, 246)}>
          <div className="hcsCoreEnergy" aria-hidden="true" />
          <div className="hcsCoreRing hcsCoreRing--one" aria-hidden="true" />
          <div className="hcsCoreRing hcsCoreRing--two" aria-hidden="true" />
          <div className="hcsCoreMark">
            <div className="hcsPowerCore">
              <img className="hcsBrandLogo" src="/remote-arc.svg" alt="Remote Arc" width={86} height={86}/>
              <span className="hcsLogoCurrent" aria-hidden="true"/>
              <svg className="hcsArcElectricity" viewBox="0 0 64 64" fill="none" aria-hidden="true">
                <path className="hcsArcFilament hcsArcFilament--outer" pathLength="100" d="M10 42C15 20 27 12 44 17C50 19 54 24 56 30"/>
                <path className="hcsArcFilament hcsArcFilament--inner" pathLength="100" d="M54 42C49 29 42 24 32 24C22 24 15 31 10 42"/>
                <circle className="hcsArcContact" cx="10" cy="42" r="5"/>
                <circle className="hcsArcContact hcsArcContact--right" cx="54" cy="42" r="5"/>
              </svg>
            </div>
          </div>
          <strong>{arc ? "Arc Agent" : "Remote Arc"}</strong>
          <span>{arc ? tr("Your AI teammate.", "你的专属 AI 队友。") : tr("Your AI. Your rules.", "你的 AI，你的权限。")}</span>
        </div>
      </div>
      <ul className="hcsFoundation" aria-label={tr("Shared platform capabilities", "统一的平台能力")}>
        {[tr("Skills", "专业技能"), tr("Execution", "任务执行"), tr("Approvals", "操作审批"), tr("Verified Results", "结果验证")].map(label => <li key={label}>{label}</li>)}
      </ul>
      <footer className="hcsFooter">
        <span className="hcsModeStatus"><i aria-hidden="true" />{arc ? arcAvailable?tr('Arc Agent · Available now','Arc Agent · 现已可用'):tr("Arc Agent · Coming soon", "Arc Agent · 即将推出") : tr("Connect available now", "Connect 现已可用")}</span>
        <a href={arc ? "/arc" : "/connect-ai"}>{arc ? tr("Meet Arc", "认识 Arc") : tr("Connect your AI", "连接你的 AI")} <span aria-hidden="true">↗</span></a>
      </footer>
      <p className="hcsPlatformScope">{tr("Connect Apps ships independently. Provider setup and account authorization required.", "Connect Apps 独立发布，需要平台配置与账号授权。")}</p>
    </div>
  );
}
