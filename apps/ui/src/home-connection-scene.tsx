import { useEffect, useId, useRef, useState } from "react";
import { useI18n } from "./i18n.js";
import "./home-connection-scene.css";

type AiClient = { name: string; slug: string; icon: string; tone: string };
type Capability = "skills" | "execution" | "approvals" | "verified" | "calendar";

function CapabilityIcon({ name }: { name: Capability }) {
  const paths: Record<Capability, string> = {
    skills: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM16.5 13v7M13 16.5h7",
    execution: "M4 7h10M4 12h7M4 17h10m2-10 5 5-5 5",
    approvals: "M12 3 4 6v6c0 4.2 3.2 7 8 9 4.8-2 8-4.8 8-9V6l-8-3Zm-4 9 3 3 5-6",
    verified: "M21 12a9 9 0 1 1-3.2-6.9M8 11l4 4L21 5",
    calendar: "M5 5h14v15H5zM8 3v4m8-4v4M5 10h14m-10 4h2m2 0h2",
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}

// Ambient motion has no progression or simulated execution. Pause its CSS
// whenever the page is hidden, the overview is offscreen, or motion is reduced.
function usePanoramaMotion() {
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

export function HomeConnectionScene({ clients }: { clients: readonly AiClient[] }) {
  const { tr } = useI18n();
  const { ref, running } = usePanoramaMotion();
  const headingId = useId();
  const apps = [
    { name: "GitHub", icon: "github", mono: true },
    { name: "Slack", icon: "slack" },
    { name: "Gmail", icon: "gmail" },
    { name: "Outlook", icon: "microsoftoutlook" },
    { name: "Google Calendar", icon: "googlecalendar" },
    // Microsoft 365 calendars are an Outlook capability, not a separate
    // fabricated product mark. Use the genuine Outlook logo with a calendar cue.
    { name: "Microsoft Calendar", icon: "microsoftoutlook", calendar: true },
  ];
  const devices = [
    { name: "Mac", icon: "macos", note: "macOS" },
    { name: "Windows", icon: "windows", note: tr("Your PC", "你的电脑") },
    { name: "Linux", icon: "linux", note: tr("Your environment", "你的运行环境") },
    { name: "Browser", icon: "browser", note: tr("Shared tabs", "已共享的标签页") },
  ];
  const capabilities: { name: Capability; label: string }[] = [
    { name: "skills", label: tr("Skills", "专业技能") },
    { name: "execution", label: tr("Execution", "任务执行") },
    { name: "approvals", label: tr("Approvals", "操作审批") },
    { name: "verified", label: tr("Verified Results", "结果验证") },
  ];
  return (
    <div ref={ref} className="homeConnectionScene" data-layout="panorama" data-running={running} role="region" aria-labelledby={headingId}>
      <header className="hcsPanoramaHeader">
        <h2 id={headingId}>{tr("FROM CHAT TO ACTION", "让对话变成行动")}</h2>
        <span>{tr("AGENT INFRASTRUCTURE", "AGENT 基础设施")}</span>
      </header>

      <div className="hcsAiEntry">
        <span className="hcsAiEntryLabel">{tr("BRING YOUR AI", "接入你的 AI")}</span>
        <div className="hcsClients" aria-label={tr("AI client installation guides", "AI 客户端安装指南")}>
          {clients.map(client => (
            <a key={client.slug} href={"/install/" + client.slug} aria-label={tr("Install for " + client.name, "查看 " + client.name + " 安装指南")}>
              <img src={client.icon} className={client.tone === "mono" ? "monoLogo" : "colorLogo"} alt="" width={18} height={18} />
              <span>{client.name}</span>
            </a>
          ))}
        </div>
        <span className="hcsEntryStem" aria-hidden="true" />
      </div>

      <div className="hcsPanorama">
        <section className="hcsResourceGroup hcsApps" aria-label={tr("Apps ecosystem", "应用生态")}>
          <div className="hcsGroupTitle"><h3>Apps</h3><span>{tr("Cloud connections", "云端应用")}</span></div>
          <div className="hcsAppGrid">
            {apps.map(app => (
              <div className="hcsAppNode" key={app.name}>
                <span className={"hcsBrandFrame" + (app.mono ? " hcsBrandFrameMono" : "")}>
                  <img src={"/app-brands/" + app.icon + ".svg"} alt="" width={27} height={27} />
                  {app.calendar && <span className="hcsCalendarCue"><CapabilityIcon name="calendar" /></span>}
                </span>
                <strong>{app.name}</strong>
              </div>
            ))}
          </div>
          <span className="hcsResourceNote">{tr("An extensible ecosystem", "持续扩展的应用生态")}</span>
        </section>

        <div className="hcsCoreColumn">
          <svg className="hcsConnectionPaths" viewBox="0 0 180 290" preserveAspectRatio="none" aria-hidden="true">
            <g className="hcsConnectionBase">
              <path d="M0 59H25Q40 59 40 74V130Q40 145 55 145H90" />
              <path d="M0 145H90" />
              <path d="M0 231H25Q40 231 40 216V160Q40 145 55 145H90" />
              <path d="M90 145H125Q140 145 140 130V43Q140 28 155 28H180" />
              <path d="M90 145H125Q140 145 140 130V121H180" />
              <path d="M90 145H125Q140 145 140 160V169H180" />
              <path d="M90 145H125Q140 145 140 160V247Q140 262 155 262H180" />
            </g>
            <g className="hcsConnectionFlow">
              <path d="M0 59H25Q40 59 40 74V130Q40 145 55 145H90" />
              <path d="M0 231H25Q40 231 40 216V160Q40 145 55 145H90" />
              <path d="M90 145H125Q140 145 140 130V43Q140 28 155 28H180" />
              <path d="M90 145H125Q140 145 140 160V247Q140 262 155 262H180" />
            </g>
          </svg>
          <div className="hcsAgentCore">
            <div className="hcsCoreHalo" aria-hidden="true" />
            <div className="hcsCoreLogo"><img src="/remote-arc.svg" alt="" width={67} height={67} /></div>
            <strong>Remote Arc</strong>
            <span className="hcsAgentLabel">{tr("Agent Core", "Agent 能力核心")}</span>
            <span className="hcsCoreDescriptor">{tr("Connect. Coordinate. Execute.", "连接 · 协调 · 执行")}</span>
          </div>
        </div>

        <section className="hcsResourceGroup hcsDevices" aria-label={tr("Authorized devices", "已授权的设备")}>
          <div className="hcsGroupTitle"><h3>Devices</h3><span>{tr("Your environments", "你的运行环境")}</span></div>
          <div className="hcsDeviceGrid">
            {devices.map(device => (
              <div className="hcsDeviceNode" key={device.name}>
                <img src={"/platform-brands/" + device.icon + ".svg"} alt="" width={26} height={26} />
                <div><strong>{device.name}</strong><span>{device.note}</span></div>
                <i aria-hidden="true" />
              </div>
            ))}
          </div>
          <span className="hcsResourceNote">{tr("Your rules. Your control.", "你的权限，由你掌控")}</span>
        </section>
      </div>

      <div className="hcsFoundation">
        <span className="hcsFoundationStem" aria-hidden="true" />
        <span className="hcsFoundationLabel">{tr("BUILT ON A SHARED FOUNDATION", "统一的平台能力")}</span>
        <ul>{capabilities.map(capability => <li key={capability.name}><CapabilityIcon name={capability.name} /><span>{capability.label}</span></li>)}</ul>
      </div>
      <footer className="hcsAvailability">
        <span className="hcsConnectStatus"><i aria-hidden="true" />{tr("Connect available now", "Connect 现已可用")}</span>
        <span>{tr("Arc Agent · Coming soon", "Arc Agent · 即将推出")}</span>
      </footer>
      <p className="hcsPlatformScope">{tr("Apps and cloud skills are in development.", "应用生态与云端技能正在建设中。")}</p>
    </div>
  );
}
