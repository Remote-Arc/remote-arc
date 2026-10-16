import { useI18n } from "./i18n.js";
import { localizedWebsiteHref } from "./marketing-paths.js";
import "./arc-future.css";

// Public concepts only: no hosted AI endpoints or fake waitlist submissions.
const earlyAccessHref = "mailto:support@remotearc.app?subject=" +
  encodeURIComponent("Arc early access") +
  "&body=" + encodeURIComponent("I'd like to try Arc. The workflow I'd delegate is: ");

function Status({kind = "soon", children}: {kind?: "soon" | "live" | "build"; children: React.ReactNode}) {
  return <span className={"arcState arcState--" + kind}><i aria-hidden="true" />{children}</span>;
}

function ArcConcept() {
  const {tr} = useI18n();
  return <div className="arcConcept" aria-label={tr("Design concept illustrating a potential Arc workflow, not a live product", "Arc 未来工作流程的设计示意，并非已上线产品")}>
    <div className="arcConceptChrome">
      <div className="arcConceptIdentity"><span className="arcConceptLogo">a<span>·</span></span><span>Arc <small> / workspace</small></span></div>
      <span className="arcConceptMeta">{tr("PRODUCT CONCEPT · NOT LIVE", "产品设计示意 · 尚未上线")}</span>
      <span className="arcConceptMenu" aria-hidden="true">···</span>
    </div>
    <div className="arcConceptBody">
      <div className="arcConceptChat">
        <div className="arcConceptAvatar">↗</div>
        <div className="arcConceptPrompt">
          <span>{tr("YOUR REQUEST", "你的请求")}</span>
          <strong>{tr("Prepare my weekly project update.", "帮我准备本周项目进展汇总。")}</strong>
          <p>{tr("Pull the latest issues, organize decisions, and prepare a reviewable draft.", "读取最新 Issue，整理关键决定，形成可审核的草稿。")}</p>
        </div>
      </div>
      <div className="arcConceptFlow">
        <div className="arcConceptConnector"><div className="arcConceptAppIcon arcConceptAppIcon--github" aria-hidden="true">GH</div><div><strong>GitHub</strong><small>{tr("Read project updates", "读取项目进度")}</small></div><span>↗</span></div>
        <div className="arcConceptFlowLine"><i /></div>
        <div className="arcConceptConnector"><div className="arcConceptAppIcon arcConceptAppIcon--notion" aria-hidden="true">N</div><div><strong>Notion</strong><small>{tr("Prepare a draft", "生成待审核草稿")}</small></div><span>↗</span></div>
      </div>
      <div className="arcConceptResult"><div className="arcConceptResultMark" aria-hidden="true">✓</div><div><strong>{tr("Weekly update drafted", "周报草稿已生成")}</strong><span>{tr("Awaiting your review before sharing", "发送之前，等待你的审核")}</span></div><span className="arcConceptReview">{tr("Review", "审核")}</span></div>
    </div>
    <div className="arcConceptFoot"><span><i /> {tr("Scoped access", "受限授权")}</span><span>{tr("Visible steps & approvals", "执行步骤与审批可见")}</span><span>↗</span></div>
  </div>;
}

export function ArcTeaser() {
  const {tr,locale} = useI18n();
  return <section className="arcTeaser" aria-labelledby="arcTeaserTitle">
    <div className="arcTeaserLead"><span className="arcOverline"><span className="arcNewDot" />{tr("THE NEXT CHAPTER", "下一阶段")}</span><span className="arcTeaserMark" aria-hidden="true">arc.</span></div>
    <div className="arcTeaserMain">
      <div><h2 id="arcTeaserTitle">{tr("Less asking. More getting things done.", "少一点反复交代，多一点真正完成。")}</h2><p>{tr("Meet Arc — the AI teammate we're building inside Remote Arc. Your conversations, apps and authorized computers, finally working toward the same goal.", "认识正在开发的 Arc：让对话、应用与已授权的电脑围绕同一项工作协作。")}</p><div className="arcTeaserMeta">{tr("CHAT · APPS · ROUTINES", "对话 · 应用 · 自动任务")} <span>·</span> {tr("IN DEVELOPMENT", "开发中")}</div></div>
      <a href={localizedWebsiteHref("/arc",locale)} className="arcTeaserArrow" aria-label={tr("Explore Arc","了解 Arc")}><span aria-hidden="true">↗</span><small>{tr("Explore Arc", "了解 Arc")}</small></a>
    </div>
  </section>;
}

export function ArcComingSoonPageContent() {
  const {tr,locale} = useI18n();
  return <main className="arcNext">
    <section className="arcNextHero">
      <div className="arcNextCopy">
        <div className="arcOverline"><span className="arcNewDot" />REMOTE ARC <span className="arcOverlineSlash">/</span> {tr("INTRODUCING ARC", "认识 ARC")}</div>
        <h1>{tr("Give work a place to go.", "把工作，真正交给 AI。")}</h1>
        <p>{tr("An AI teammate that doesn't stop at the answer. We're building Arc to connect your conversations, cloud apps and real devices — then turn a request into reviewable work.", "不只回答问题。我们正在打造 Arc，让对话、云端应用和真实设备串联起来，将一句需求变成可审核的工作成果。")}</p>
        <div className="arcNextHeroActions"><a href={earlyAccessHref} className="arcPrimaryAction">{tr("Get early access", "申请抢先体验")} <span>↗</span></a><a className="arcQuietLink" href={localizedWebsiteHref("/roadmap",locale)}>{tr("View the roadmap", "查看路线图")} <span>→</span></a></div>
        <div className="arcNextDisclosure"><Status>{tr("In development", "开发中")}</Status><span>{tr("Arc Hosted is not available yet. Early access opens an email draft.", "Arc 托管服务尚未开放。抢先体验将打开邮件客户端。")}</span></div>
      </div>
      <div className="arcNextVisual"><span className="arcCanvasCaption">{tr("A GLIMPSE OF WHAT'S NEXT", "下一阶段的产品设想")}</span><ArcConcept /></div>
    </section>
    <section className="arcNextProcess" aria-labelledby="arcProcessTitle">
      <div className="arcSectionHeading"><span className="arcOverline">01 / {tr("THE IDEA", "核心构想")}</span><h2 id="arcProcessTitle">{tr("One request. A connected way to finish it.", "一句需求，一条真正跑通的工作流。")}</h2><p>{tr("The goal isn't another chat box. It's a clear path from intent to action, using only the tools you authorize.", "我们不是再做一个聊天框，而是让目标、工具、执行和审核真正连成一条线。")}</p></div>
      <ol className="arcSteps">
        <li><span className="arcStepNum">01</span><div className="arcStepGlyph">◎</div><h3>{tr("Talk", "提出目标")}</h3><p>{tr("Describe the outcome in your own words.", "用自然语言描述最终要完成什么。")}</p></li>
        <li><span className="arcStepNum">02</span><div className="arcStepGlyph">⊞</div><h3>{tr("Connect", "连接能力")}</h3><p>{tr("Select apps and devices within their permissions.", "连接经过授权的应用与设备。")}</p></li>
        <li><span className="arcStepNum">03</span><div className="arcStepGlyph">↝</div><h3>{tr("Run", "完成执行")}</h3><p>{tr("Arc follows a bounded plan and records its steps.", "按照有预算和权限边界的计划执行。")}</p></li>
        <li><span className="arcStepNum">04</span><div className="arcStepGlyph">✓</div><h3>{tr("Review", "检查成果")}</h3><p>{tr("Inspect results and approve consequential actions.", "查看执行证据，关键操作交给你审批。")}</p></li>
      </ol>
    </section>
    <section className="arcNextModes">
      <div className="arcSectionHeading"><span className="arcOverline">02 / {tr("THE PLATFORM", "平台能力")}</span><h2>{tr("The AI you already use. The AI we're building.", "保留熟悉的 AI，也可以拥有 Arc。")}</h2></div>
      <div className="arcModeRows">
        <div className="arcModeRow"><div className="arcModeName"><Status kind="live">{tr("Available now", "现已可用")}</Status><h3>Remote Arc Connect</h3></div><p>{tr("Keep using ChatGPT, Claude or another compatible AI client. Remote Arc securely links it to the tools you allow on your computers — without an additional model API key.", "继续使用 ChatGPT、Claude 等兼容 AI。Remote Arc 将其安全连接至电脑上允许使用的工具，无须另购模型 API Key。")}</p><a className="arcQuietLink" href="/connect-ai">{tr("Get started", "立即连接")} ↗</a></div>
        <div className="arcModeRow"><div className="arcModeName"><Status>{tr("Coming next", "即将推出")}</Status><h3>Arc Hosted</h3></div><p>{tr("Chat directly with Arc, connect cloud apps and delegate recurring work. Hosted model usage will have its own pricing and safety limits; Connect's free MCP calls won't cover it.", "直接与 Arc 对话、连接云端应用、委派重复任务。托管模型将另行计费并设有额度保护，不包含在 Connect 免费 MCP 调用中。")}</p><a className="arcQuietLink" href={earlyAccessHref}>{tr("Join early access", "申请体验")} ↗</a></div>
      </div>
    </section>
    <section className="arcNextClose"><div><span className="arcOverline">{tr("BUILDING THOUGHTFULLY", "认真打磨，逐步推出")}</span><h2>{tr("A little more than coming soon.", "不只是一句 Coming Soon。")}</h2><p>{tr("We publish what is ready, what is being built and what's still an idea. Follow along or tell us which workflow would matter to you.", "哪些已经可用、哪些正在开发、哪些还是设想，我们都会公开。欢迎告诉我们，你最想把什么工作交给 Arc。")}</p></div><a href={localizedWebsiteHref("/roadmap",locale)} className="arcRoundArrow" aria-label={tr("Open roadmap", "查看路线图")}>↗</a></section>
  </main>;
}

const milestones = [
  {id:"01",en:"The foundation",zh:"先打好基础",detailEn:"Connect + permissions",detailZh:"连接与权限",status:"live",enStatus:"AVAILABLE TODAY",zhStatus:"现已可用",descriptionEn:"Remote MCP, device permissions and durable task foundations already power Remote Arc Connect. Organization and production-release safeguards are being hardened.",descriptionZh:"Remote MCP、设备权限和持久任务基础已支持现有 Connect。组织架构与生产发布保护仍在完善。"},
  {id:"02",en:"Arc enters the chat",zh:"Arc 拥有自己的对话入口",detailEn:"Hosted chat + Auto",detailZh:"托管对话与 Auto",status:"active",enStatus:"IN DEVELOPMENT",zhStatus:"开发中",descriptionEn:"A first-party AI conversation, tested Auto model selection, tool auditing and hard limits on hosted inference spending.",descriptionZh:"第一方 AI 对话、经过验证的 Auto 模型路由、工具审计与托管模型费用硬上限。"},
  {id:"03",en:"Ready for real customers",zh:"准备好让用户付费",detailEn:"Billing + safe trials",detailZh:"支付与受限试用",status:"planned",enStatus:"REQUIRED BEFORE PUBLIC BETA",zhStatus:"公开测试的前置条件",descriptionEn:"Checkout, subscription controls, usage visibility and bounded free trials must work before hosted Arc becomes public.",descriptionZh:"在公开推出 Arc 前完成支付、订阅管理、额度展示及严格封顶的免费试用。"},
  {id:"04",en:"Connected work",zh:"让应用真正协作",detailEn:"Apps + Routines",detailZh:"应用与自动任务",status:"planned",enStatus:"PLANNED",zhStatus:"规划中",descriptionEn:"Reliable first-party integrations, a common tool registry and recurring work with approvals, recovery and visible outcomes.",descriptionZh:"稳定的原生应用集成、统一工具目录，以及可审批、可恢复、能验证结果的定期工作。"},
  {id:"05",en:"Teach Arc",zh:"教会 Arc 新技能",detailEn:"Skills + ecosystem",detailZh:"技能与开放生态",status:"exploring",enStatus:"EXPLORING",zhStatus:"探索中",descriptionEn:"Learn from approved demonstrations, reuse skills and allow a wider community to extend the app ecosystem.",descriptionZh:"从授权的操作演示中学习、复用技能，再逐步开放更丰富的应用集成生态。"},
] as const;

export function ArcRoadmapPageContent() {
  const {tr,locale} = useI18n();
  return <main className="arcRoadmap">
    <div className="arcRoadmapLayout">
      <div className="arcRoadmapIntro"><span className="arcOverline">REMOTE ARC / {tr("WHAT'S NEXT", "下一步")}</span><h1>{tr("Built step by step. Out in the open.", "一步一步做，进展公开看。")}</h1><p>{tr("We'd rather earn trust with useful releases than promise dates we can't guarantee. Here's where Remote Arc stands today and what we're working toward.", "比起承诺不确定的时间表，我们更愿意用可用的产品建立信任。这是 Remote Arc 当前的进展和接下来的方向。")}</p><div className="arcRoadmapGuide"><span className="arcNewDot"/>{tr("Current focus", "当前重点")} <strong>{tr("Hosted Arc foundations", "Arc 托管运行基础")}</strong></div><a className="arcQuietLink" href={localizedWebsiteHref("/arc",locale)}>{tr("Discover Arc", "认识 Arc")} ↗</a></div>
      <div className="arcRoadmapTimeline" aria-label={tr("Remote Arc development milestones", "Remote Arc 开发里程碑")}>
        {milestones.map(item=><article className={"arcMilestone arcMilestone--"+item.status} key={item.id}>
          <div className="arcMilestoneRail"><span className="arcMilestonePoint" /><span className="arcMilestoneNumber">{item.id}</span></div>
          <div className="arcMilestoneContent"><div className="arcMilestoneHeader"><span>{locale==="zh"?item.zhStatus:item.enStatus}</span>{item.status==="active"&&<span className="arcActiveIndicator" aria-hidden="true">↗</span>}</div><h2>{locale==="zh"?item.zh:item.en}</h2><div className="arcMilestoneDetail">{locale==="zh"?item.detailZh:item.detailEn}</div><p>{locale==="zh"?item.descriptionZh:item.descriptionEn}</p></div>
        </article>)}
      </div>
    </div>
    <div className="arcRoadmapEnd"><div><span className="arcOverline">{tr("HELP SHAPE THE NEXT RELEASE", "参与定义下一步")}</span><h2>{tr("What would you hand off to Arc?", "你最想交给 Arc 的工作是什么？")}</h2><p>{tr("Share a workflow you'd like to automate. Our early-access link opens an email, not an account registration.", "告诉我们你想自动完成什么。抢先体验入口目前仅打开邮件，不会自动创建账户。")}</p></div><div className="arcRoadmapEndActions"><a className="arcPrimaryAction" href={earlyAccessHref}>{tr("Tell us your use case", "告诉我们你的想法")} ↗</a><small>{tr("Roadmap priorities may change. Current Connect plans do not include hosted-model credits.", "开发计划可能调整；现有 Connect 方案不包含托管模型额度。")}</small></div></div>
  </main>;
}
