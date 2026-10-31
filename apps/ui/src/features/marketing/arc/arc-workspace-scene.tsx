import { useI18n } from "../../../app/i18n.js";
import { useMarketingPlayback } from "../home/use-marketing-playback.js";
import "./arc-workspace-scene.css";

function SceneIcon({ name }: { name: "message" | "check" | "document" | "pause" | "play" | "lock" }) {
  const paths = {
    message: "M4 4h16v12H9l-5 4V4zM8 8h8M8 12h5",
    check: "m5 12 4 4L19 6",
    document: "M6 3h8l4 4v14H6V3zm8 0v5h4M9 12h6m-6 4h6",
    pause: "M8 5v14m8-14v14",
    play: "m8 5 11 7-11 7V5z",
    lock: "M7 10V7a5 5 0 0 1 10 0v3M5 10h14v11H5V10zm7 4v3",
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}

export function ArcExecutionScene() {
  const { tr } = useI18n();
  const { ref, step, setStep, playing, setPlaying, running, reducedMotion } = useMarketingPlayback(5, 2600);
  const labels = [
    tr("Understand the brief", "理解任务"),
    tr("Gather the context", "收集资料"),
    tr("Compose the update", "整理周报"),
    tr("Check every source", "核对依据"),
    tr("Ready for your review", "等待你审核"),
  ];
  const status = [
    tr("Turning your request into a plan", "把你的需求整理成执行计划"),
    tr("Reading the selected project sources", "正在读取选定的项目资料"),
    tr("Bringing the important changes together", "正在汇总本周的重要进展"),
    tr("Matching the draft to its source material", "正在逐条核对周报与原始资料"),
    tr("Your draft is ready. You decide what happens next.", "草稿已就绪，下一步由你决定。"),
  ];
  const chooseStep = (index: number) => { setStep(index); setPlaying(false); };
  return <div ref={ref} className="arcDesk" data-step={step} data-running={running} aria-label={tr("Illustrated Arc workspace. A weekly project update, from request to a reviewable draft.", "Arc 工作台示意：从一句需求，到可审核的项目周报。")}>
    <header className="arcDeskChrome">
      <div className="arcDeskIdentity"><img src="/remote-arc.svg" alt="" width="25" height="25" /><strong>arc</strong><span>/</span><span>{tr("Project studio", "项目工作台")}</span></div>
      <span className="arcDeskConcept">{tr("PRODUCT DEMO · EXAMPLE DATA", "产品示意 · 示例数据")}</span>
      <button className="arcV3ScenePlayback" type="button" disabled={reducedMotion} onClick={() => setPlaying(value => !value)} aria-label={playing ? tr("Pause demo animation", "暂停示意动画") : tr("Play demo animation", "播放示意动画")}>
        <SceneIcon name={playing ? "pause" : "play"} />{reducedMotion ? tr("Manual preview", "手动预览") : playing ? tr("Pause", "暂停") : tr("Play", "播放")}
      </button>
    </header>
    <div className="arcDeskBrief">
      <span className="arcDeskAvatar">Y</span>
      <div><span>{tr("YOU SET THE DIRECTION", "你来确定目标")}</span><strong>{tr("Prepare my weekly project update.", "帮我整理本周的项目进展。")}</strong><p>{tr("Check merged GitHub PRs and Vercel deployment status. Leave a draft for me.", "核对 GitHub 已合并的 PR 与 Vercel 部署状态，先生成草稿给我。")}</p></div>
      <SceneIcon name="message" />
    </div>
    <div className="arcDeskBody">
      <aside className="arcDeskTimeline" aria-label={tr("Explore the example steps", "查看示例步骤")}>
        <span className="arcDeskOverline">{tr("THE WORK", "执行过程")}</span>
        {labels.map((label, index) => <button key={label} type="button" className={index === step ? "current" : index < step ? "complete" : ""} aria-pressed={index === step} onClick={() => chooseStep(index)}>
          <span>{index < step ? <SceneIcon name="check" /> : "0" + (index + 1)}</span><strong>{label}</strong>
        </button>)}
        <div className="arcDeskScope"><SceneIcon name="lock" /><span>{tr("Selected sources only. Nothing shared automatically.", "仅读取选定资料，不会自动发送。")}</span></div>
      </aside>
      <div className="arcDeskWorkspace">
        <div className="arcDeskSources">
          <div className="arcDeskSectionLabel"><span>{tr("PROJECT CONTEXT", "项目资料")}</span><small>{step === 0 ? "0 / 2" : "2 / 2"}</small></div>
          <article className="arcDeskSource" data-ready={step >= 1}>
            <div className="arcDeskSourceHead"><span className="arcDeskBrand" data-brand="github"><img src="/app-brands/github.svg" alt="" width="24" height="24" /></span><div><strong>GitHub</strong><small>{tr("Merged pull requests", "已合并的 Pull Request")}</small></div><span className="arcDeskSourceState">{step >= 1 ? <SceneIcon name="check" /> : "01"}</span></div>
            <div className="arcDeskSourceContent">{step >= 1 ? <><span className="arcDeskSourceTag">{tr("MERGED", "已合并")}</span><p>{tr("Improve device reconnection", "优化设备重新连接")}</p><small>{tr("Source 01 · Example project", "来源 01 · 示例项目")}</small></> : <><i /><i /><small>{tr("Waiting for the brief", "等待任务开始")}</small></>}</div>
          </article>
          <article className="arcDeskSource" data-ready={step >= 1}>
            <div className="arcDeskSourceHead"><span className="arcDeskBrand" data-brand="vercel"><img src="/app-brands/vercel.svg" alt="" width="24" height="24" /></span><div><strong>Vercel</strong><small>{tr("Deployment status", "部署状态")}</small></div><span className="arcDeskSourceState">{step >= 1 ? <SceneIcon name="check" /> : "02"}</span></div>
            <div className="arcDeskSourceContent">{step >= 1 ? <><span className="arcDeskSourceTag arcDeskSourceTag--notes">{tr("PREVIEW · ERROR", "预览 · ERROR")}</span><p>{tr("One preview needs investigation", "一个预览部署需要排查")}</p><small>{tr("Source 02 · Example project", "来源 02 · 示例项目")}</small></> : <><i /><i /><small>{tr("Selected for this task", "已选为本次任务资料")}</small></>}</div>
          </article>
          <div className="arcDeskConductor"><span className="arcDeskConductorMark"><img src="/remote-arc.svg" alt="" width="25" height="25" /></span><div><strong>{step === 4 ? tr("Work, brought together.", "资料已整理为成果。") : tr("Arc is connecting the dots.", "Arc 正在串联资料。")}</strong><span>{tr("Context → draft → source check", "收集资料 → 生成草稿 → 核对依据")}</span></div><span className="arcDeskSignal" aria-hidden="true"><i /><i /><i /></span></div>
        </div>
        <div className="arcDeskTransfer" aria-hidden="true"><i /><i /></div>
        <article className="arcDeskDocument" data-ready={step >= 2}>
          <div className="arcDeskDocumentChrome"><SceneIcon name="document" /><span>weekly-update.md</span><small>{step >= 4 ? tr("FOR REVIEW", "待审核") : tr("DRAFT", "草稿")}</small></div>
          <div className="arcDeskPaper">
            <span className="arcDeskOverline">{tr("YOUR NEXT DELIVERABLE", "本次交付")}</span>
            <h3>{tr("This week, in focus.", "本周进展，一目了然。")}</h3>
            <p className="arcDeskDocumentSub">{tr("A project update with a trail back to the work.", "每一项进展，都能找到对应的依据。")}</p>
            <div className="arcDeskDraftSection" aria-hidden={step < 2} data-revealed={step >= 2}>
              <span>{tr("01 / SHIPPED", "01 / 已完成")}</span><h4>{tr("A smoother return to work", "更顺畅地回到工作")}</h4>
              <p>{tr("Device reconnection was improved in the merged update.", "已合并的更新优化了设备重新连接体验。")}<sup className={step >= 3 ? "verified" : ""}>01</sup></p>
            </div>
            <div className="arcDeskDraftSection" aria-hidden={step < 2} data-revealed={step >= 2}>
              <span>{tr("02 / UP NEXT", "02 / 下一步")}</span><h4>{tr("Investigate the failing preview", "排查失败的预览部署")}</h4>
              <p>{tr("The Vercel deployment status flags one preview for investigation.", "Vercel 的部署状态显示，一个预览需要进一步排查。")}<sup className={step >= 3 ? "verified" : ""}>02</sup></p>
            </div>
            <div className="arcDeskDocumentEmpty" aria-hidden="true"><i /><i /><i /><i /><i /></div>
          </div>
          <footer className="arcDeskDocumentFooter" data-ready={step >= 4}><span className="arcDeskReviewDot" /><strong>{step >= 4 ? tr("Draft ready for review", "草稿已就绪，等待审核") : step >= 3 ? tr("Source references checked", "已核对来源引用") : step === 2 ? tr("Draft in progress", "正在生成草稿") : tr("The draft will appear here", "草稿将在这里生成")}</strong><span>{step >= 4 ? tr("Not sent", "尚未发送") : step >= 3 ? "2 / 2" : "—"}</span></footer>
        </article>
      </div>
    </div>
    <footer className="arcDeskFooter"><span className="arcDeskActivityDot" /><span key={step} className="arcDeskActivityText">{status[step]}</span><span className="arcDeskCounter">0{step + 1} / 05</span></footer>
    <p className="arcDeskDisclosure">{tr("Sample content · this Arc workspace is a concept. GitHub and Vercel use the independent Connect Apps foundation; provider setup and account authorization are required.", "示例内容 · Arc 工作台为概念展示。GitHub 与 Vercel 使用独立的 Connect Apps 基础，需要平台配置与账号授权。")}</p>
  </div>;
}
