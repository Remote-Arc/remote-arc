import React from "react";
import { useI18n } from "./i18n.js";
import { useMarketingPlayback } from "./use-marketing-playback.js";
import "./home-connection-scene.css";

type AiClient = { name: string; slug: string; icon: string; tone: string };

function SceneIcon({ kind }: { kind: "lock" | "check" | "terminal" | "play" | "pause" | "arrow" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {kind === "lock" && <><rect x="5" y="10" width="14" height="11" rx="3" /><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" /></>}
      {kind === "check" && <path d="m5 12 4.5 4.5L19 7" />}
      {kind === "terminal" && <><rect x="3" y="4" width="18" height="16" rx="3" /><path d="m7 9 3 3-3 3m6 0h4" /></>}
      {kind === "play" && <path d="m9 5 11 7-11 7V5Z" fill="currentColor" stroke="none" />}
      {kind === "pause" && <><path d="M8 5v14M16 5v14" strokeWidth="3" /></>}
      {kind === "arrow" && <><path d="M5 12h14m-6-6 6 6-6 6" /></>}
    </svg>
  );
}

export function HomeConnectionScene({ clients }: { clients: readonly AiClient[] }) {
  const { tr } = useI18n();
  const { ref, step, setStep, playing, setPlaying, running, reducedMotion } = useMarketingPlayback(4, 3200);
  const stages = [
    { title: tr("Ask your AI", "向 AI 提问"), detail: tr("One request, in the chat you already use.", "在熟悉的 AI 对话里，提出一个需求。") },
    { title: tr("Connect securely", "安全连接"), detail: tr("Remote Arc routes the request to approved tools.", "Remote Arc 将请求交给已授权的工具。") },
    { title: tr("Work on your device", "电脑执行"), detail: tr("Read the file, apply the fix, run the test.", "读取文件、修改代码，再运行测试。") },
    { title: tr("Get the result", "返回结果"), detail: tr("The output comes back to the same conversation.", "执行结果返回同一个 AI 对话。") },
  ];
  const currentStage = stages[step] ?? stages[0]!;
  const toolNames = ["read_file", "edit_block", "start_process"];
  return (
    <div className="homeConnectionScene" ref={ref} data-step={step} data-running={running} data-reduced-motion={reducedMotion} aria-label={tr("Interactive illustration: AI request to computer execution", "交互演示：从 AI 请求到电脑执行")}>
      <div className="hcsTopline">
        <span className="hcsEyebrow">{tr("FROM CHAT TO ACTION", "让对话变成行动")}</span>
        <span className="hcsDemoLabel">{tr("Product illustration", "产品交互示例")}</span>
      </div>

      <div className="hcsClients" aria-label={tr("AI client installation guides", "AI 客户端安装指南")}>
        {clients.map(client => (
          <a key={client.slug} href={"/install/" + client.slug} aria-label={tr("Install for " + client.name, "查看 " + client.name + " 安装指南")}>
            <img src={client.icon} className={client.tone === "mono" ? "monoLogo" : "colorLogo"} alt="" width={19} height={19} />
            <span>{client.name}</span>
            <SceneIcon kind="arrow" />
          </a>
        ))}
      </div>

      <div className={"hcsRequest hcsPhaseCard" + (step === 0 ? " hcsActive" : "")}>
        <div className="hcsRequestAvatar"><img src="/ai-openai.svg" className="monoLogo" alt="ChatGPT" width={23} height={23} /></div>
        <div className="hcsRequestCopy">
          <span>{step === 3 ? tr("BACK IN YOUR CHAT", "结果回到 AI 对话") : tr("YOUR REQUEST", "你的请求")}</span>
          <p>{step === 3 ? tr("“Fixed the expiry check. The test passes.”", "「已修复过期检查，测试通过。」") : tr("“Fix the failing test in my project.”", "「修好我项目里失败的测试。」")}</p>
        </div>
        <span className="hcsRequestState" aria-label={step === 3 ? tr("Result returned", "结果已返回") : tr("Request", "请求")}>
          <SceneIcon kind={step === 3 ? "check" : "arrow"} />
        </span>
      </div>

      <div className="hcsRoute hcsRouteIn" aria-hidden="true">
        <span className="hcsRouteLine" />
        {(step === 0 || step === 3) && <i key={step} className={"hcsPacket" + (step === 3 ? " hcsPacketReturn" : "")} />}
        <span className="hcsRouteCaption">Remote MCP + OAuth</span>
      </div>

      <div className={"hcsBridge hcsPhaseCard" + (step === 1 ? " hcsActive" : "")}>
        <div className="hcsArcLogo"><img src="/remote-arc.svg" width={42} height={42} alt="" /></div>
        <div className="hcsBridgeCopy">
          <strong>Remote Arc</strong>
          <span>{step === 0 ? tr("Your AI. Your tools. Your computer.", "你的 AI、工具和电脑。") : step === 1 ? tr("Checking workspace and tool permissions", "检查工作目录与工具权限") : tr("Approved tools · encrypted connection", "已授权工具 · 加密连接")}</span>
        </div>
        <span className="hcsShield"><SceneIcon kind={step > 1 ? "check" : "lock"} /></span>
      </div>

      <div className="hcsRoute hcsRouteOut" aria-hidden="true">
        <span className="hcsRouteLine" />
        {(step === 1 || step === 2 || step === 3) && <i key={step} className={"hcsPacket" + (step === 3 ? " hcsPacketReturn" : "")} />}
        <span className="hcsRouteCaption">{tr("Outbound device connection", "设备出站连接")}</span>
      </div>

      <div className={"hcsDevice hcsPhaseCard" + (step >= 2 ? " hcsActive" : "")}>
        <div className="hcsDeviceBar">
          <span className="hcsWindowDots" aria-hidden="true"><i /><i /><i /></span>
          <span className="hcsDeviceTitle"><SceneIcon kind="terminal" />{tr("Your computer", "你的电脑")}</span>
          <span className="hcsPlatforms" aria-label="macOS, Windows, Linux">
            <img src="/platform-brands/macos.svg" alt="macOS" width={14} height={14} />
            <img src="/platform-brands/windows.svg" alt="Windows" width={14} height={14} />
            <img src="/platform-brands/linux.svg" alt="Linux" width={14} height={14} />
          </span>
        </div>
        <div className="hcsWorkspace">
          <div className="hcsFileHeader"><span className="hcsFileDot" /><code>src/auth.ts</code><span>{step >= 2 ? tr("1 change", "1 处修改") : tr("Project workspace", "项目目录")}</span></div>
          <div className="hcsCode" aria-label={tr("Illustrative code change", "代码修改示例")}>
            <div><span className="hcsLineNo">12</span><code><em>function</em> isExpired(token) {'{'}</code></div>
            <div className={step >= 2 ? "hcsCodeRemoved" : ""}><span className="hcsLineNo">{step >= 2 ? "−" : "13"}</span><code>  <em>return</em> token.expiresAt &lt; now;</code></div>
            <div className={"hcsCodeAdded" + (step >= 2 ? " hcsCodeVisible" : "")}><span className="hcsLineNo">+</span><code>  <em>return</em> token.expiresAt &lt;= now;</code></div>
            <div><span className="hcsLineNo">14</span><code>{'}'}</code></div>
          </div>
          <div className="hcsToolRail" aria-label={tr("Illustrative tool calls", "工具调用示例")}>
            {toolNames.map((tool, index) => (
              <span key={tool} className={step >= 2 ? "hcsToolDone" : ""} style={{ "--hcs-tool-delay": index * 400 + "ms" } as React.CSSProperties}>
                <SceneIcon kind={step >= 2 ? "check" : "terminal"} /><code>{tool}</code>
              </span>
            ))}
          </div>
          <div className={"hcsTerminal" + (step === 3 ? " hcsTerminalSuccess" : "")}>
            <code><span className="hcsPrompt">$</span> npm test</code>
            <span className="hcsTerminalOutput">
              {step === 3 ? <><SceneIcon kind="check" />{tr("Test passed · fix verified", "测试通过 · 修复已验证")}</> : step === 2 ? <><i className="hcsBusyDot" />{tr("Running on your computer", "正在你的电脑上运行")}</> : <><SceneIcon kind="lock" />{tr("Waiting for approved tool access", "等待已授权的工具访问")}</>}
            </span>
          </div>
        </div>
      </div>

      <div className="hcsPlayback">
        <div className="hcsStepText"><span>0{step + 1}<span> / 04</span></span><strong>{currentStage.title}</strong></div>
        <button type="button" className="hcsPlayButton" onClick={() => setPlaying(!playing)} disabled={reducedMotion} aria-label={reducedMotion ? tr("Animation disabled by your motion preference", "已按系统偏好关闭动画") : playing ? tr("Pause product illustration", "暂停产品演示") : tr("Play product illustration", "播放产品演示")}>
          <SceneIcon kind={playing && !reducedMotion ? "pause" : "play"} />
          <span>{reducedMotion ? tr("Motion off", "动画已关闭") : playing ? tr("Pause", "暂停") : tr("Play", "播放")}</span>
        </button>
      </div>
      <p className="hcsStageDetail">{currentStage.detail}</p>
      <div className="hcsSteps" aria-label={tr("Choose a demonstration step", "选择演示步骤")}>
        {stages.map((stage, index) => <button key={stage.title} type="button" aria-label={tr("Step " + (index + 1) + ": ", "步骤 " + (index + 1) + "：") + stage.title} aria-pressed={step === index} onClick={() => { setPlaying(false); setStep(index); }} className={step === index ? "hcsStepActive" : ""}><span key={step === index ? step : "idle"} /></button>)}
      </div>
      <div className="hcsFootnote"><SceneIcon kind="lock" /><span>{tr("Illustrative workflow. Tool access stays under your control.", "流程示例。工具访问权限始终由你掌控。")}</span></div>
    </div>
  );
}
