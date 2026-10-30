import { useI18n } from "./i18n.js";
import { localizedWebsiteHref } from "./marketing-paths.js";
import { PublicLayout } from "./public-layout.js";
import type { User } from "./app-types.js";

/** Opinion essay: not a guarantee of current or future product capabilities. */
export function IntentDrivenComputingArticlePage({ user }: { user?: User | null }) {
  const { tr, locale } = useI18n();
  return <PublicLayout user={user}>
    <article className="blogArticle">
      <header className="blogArticleHeader">
        <a className="blogBack" href={localizedWebsiteHref("/blogs", locale)}>← {tr("All posts", "全部文章")}</a>
        <span className="eyebrow">{tr("PERSPECTIVE · 30 OCT 2026", "观点 · 2026 年 10 月 30 日")}</span>
        <h1>{tr("From code to intent: what comes after programming?", "从代码到意图：编程之后，人与计算机如何对话？")}</h1>
        <p className="blogDeck">{tr("AI may make writing code optional for many people. That does not make reliable execution optional.", "AI 可能让很多人不再需要亲自写代码，但可靠执行仍然不可或缺。")}</p>
        <div className="blogByline"><span className="blogAuthorMark">RA</span><div><strong>Remote Arc</strong><span>30 Oct 2026 · 8 min</span></div></div>
      </header>
      <div className="blogArticleBody">
        <blockquote>{tr("In the past, humans learned the language of machines. In the future, machines may learn to act on human intent.", "过去，人类学习机器的语言来控制计算机。未来，计算机可能学习理解人的意图并采取行动。")}</blockquote>
      <h2>{tr("The compiler analogy", "编译器类比")}</h2>
      <p>{tr("Compilers translate defined semantics. AI interprets ambiguous intent. 'Clean up unused files' leaves open what counts as unused, which risks are acceptable, and who approves deletion.", "编译器转换语义明确的指令；AI 则要解释含糊的意图。一句“清理无用文件”，并未说明什么算无用、谁承担风险、谁批准删除。")}</p>
      <h2>{tr("The strongest objection", "最强反方")}</h2>
      <p>{tr("Producing code is not proving correctness. Software still needs tests, authority boundaries, reproducible execution and accountability. AI can make programming easier without making engineering disappear.", "会写代码不等于能证明正确。软件仍然需要测试、权限边界、可复现的执行和责任归属。AI 可能让编程更简单，却不会自动消灭工程问题。")}</p>
      <h2>{tr("Prompt may only be a transition", "Prompt 可能只是过渡")}</h2>
      <p>{tr("Prompts may give way to intent, constraints and verification. Instead of perfect phrasing, the durable question is what result counts as success, what must never happen, and what evidence would convince us.", "Prompt 也许最终会让位于“意图、约束、验证”。重要的不是修炼完美提示词，而是定义怎样算完成、哪些事情不能发生、拿什么证据证明。")}</p>
      <h2>{tr("Why the execution layer matters", "为什么执行层重要")}</h2>
      <p>{tr("Models are rapidly improving and coding agents can already operate computers. A platform cannot claim a moat merely because it invokes a tool. The harder promise is trusted execution across real devices and accounts, with revocable permissions, observability and handling of uncertain outcomes.", "模型不断进步，Claude Code 和 Codex 等工具已经能够直接操作电脑。平台不能仅仅因为会调用工具就宣称有护城河。真正困难的是让不同设备与账号之间的执行可信、权限可撤销、行为可观察，并正确处理结果未知的操作。")}</p>
      <h2>{tr("One platform, two entrances", "同一平台，两种入口")}</h2>
      <p>{tr("Connect should remain the infrastructure route for externally chosen AI clients. Arc is a first-party application built on the shared layer, not a competing definition of what Remote Arc is. Both should follow the same account and execution principles, while shipped capabilities and plan availability must be stated separately.", "Connect 应当是让外部 AI 客户端接入的基础设施主线。Arc 是建在共享执行层上的第一方应用，而不是另一个相互竞争的平台定义。两者应遵循一致的账户和执行原则，但已上线功能和套餐可用性必须分别说明。")}</p>
      <h2>{tr("Where the thesis can fail", "这个判断怎样可能失败")}</h2>
      <p>{tr("Cross-platform neutrality matters only if people actually work across clients, computers and apps. Large model vendors and operating systems can also offer access, scheduling and permissions. If most people stay in one assistant on one device, an independent layer must prove a different concrete advantage.", "跨平台中立是否值钱，要看人们是不是真的跨客户端、跨电脑、跨应用工作。模型厂商和操作系统也可能自己提供执行、调度和权限。如果绝大多数用户只用一个助手、一台电脑，独立执行层就必须证明别的实际优势。")}</p>
      <h2>{tr("Evidence before slogans", "证据先于口号")}</h2>
      <p>{tr("Measure multi-client and multi-device use, successful verified outcomes, safe recovery from interruptions, permission friction and retention. A successful tool call is not completed work. A saved task is not an immortal OS process. Terminal execution is not an OS sandbox; Undo does not cover arbitrary side effects.", "衡量多客户端、多设备真实使用率、验收通过的任务、可安全恢复的中断、授权摩擦和留存。工具调用成功不等于任务完成，持久任务不等于操作系统进程永生，终端不是操作系统沙箱，Undo 也不能覆盖任意外部副作用。")}</p>
      <h2>{tr("A conditional conclusion", "有条件的结论")}</h2>
      <p>{tr("Code probably will not vanish; people may simply need to write less of it. The longer-term interface may be intent, constraints and evidence. AI provides intelligence. Remote Arc can earn a role as execution infrastructure—but only if users can see reliable results, not merely an attractive cross-platform story.", "代码可能不会消失，但人可能越来越不需要亲自写。更长期的接口或许是意图、约束和证据。AI 提供智能。Remote Arc 有机会成为执行基础设施，但必须拿真实可靠的结果证明价值，而不只讲一个动听的跨平台故事。")}</p>
        <blockquote>{tr("AI supplies intelligence. Remote Arc aims to make execution across devices and apps consistent, observable and accountable.", "AI 负责智能；Remote Arc 负责让跨设备与应用的执行更加一致、可观察，并承担明确的责任边界。")}</blockquote>
        <footer className="blogArticleFooter"><div><span className="blogAuthorMark">RA</span><div><strong>Remote Arc</strong><span>{tr("A perspective, not a capability guarantee", "这是一种判断，而非功能承诺")}</span></div></div><a href={localizedWebsiteHref("/docs/architecture",locale)}>{tr("Read the architecture", "阅读架构文档")} →</a></footer>
      </div>
    </article>
  </PublicLayout>;
}