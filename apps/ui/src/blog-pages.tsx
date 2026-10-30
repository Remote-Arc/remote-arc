import { INTENT_ESSAY } from "../../../packages/docs/src/intent-driven-essay.js";
import { useI18n } from "./i18n.js";
import { localizedWebsiteHref } from "./marketing-paths.js";
import { type User } from "./app-types.js";
import { PublicLayout } from "./public-layout.js";

const blogPosts = [
  {
    slug: "why-i-built-remote-arc",
    date: "27 Sep 2026",
    readTime: "6 min read",
    author: "Sam Yao",
  },
  {
    slug: "remote-arc-vs-openclaw",
    date: "27 Sep 2026",
    readTime: "8 min read",
    author: "Sam Yao",
  },
  {
    slug: "powerful-ai-access-without-exposing-your-computer",
    date: "27 Sep 2026",
    readTime: "7 min read",
    author: "Sam Yao",
  },
  {
    slug: "how-remote-arc-works",
    date: "27 Sep 2026",
    readTime: "9 min read",
    author: "Sam Yao",
  },
  {
    slug: "go-vs-typescript-agent-benchmarks",
    date: "9 Oct 2026",
    readTime: "9 min read",
    author: "Sam Yao",
  },
] as const;
export function BlogsPage({ user }: { user?: User | null }) {
  const { tr, locale } = useI18n();
  const posts = [
    {
      slug: INTENT_ESSAY.slug, date: INTENT_ESSAY.date, readTime: "7 min read", author: "Sam Yao",
      title: tr(INTENT_ESSAY.title.en, INTENT_ESSAY.title.zh),
      summary: tr(INTENT_ESSAY.deck.en, INTENT_ESSAY.deck.zh),
      tag: tr("PERSONAL NOTES", "随想"),
    },
    {
      ...blogPosts[4],
      title: tr(
        "Why Remote Arc chose Go: measured against TypeScript on Mac and Windows",
        "为什么 Remote Arc 选择 Go：在 Mac 和 Windows 上实测对比 TypeScript",
      ),
      summary: tr(
        "An honest account of a Windows performance regression, its fix, matching atomic/durable workloads, two-hour Agent residency and what we still have not measured.",
        "真实记录 Windows 上 Go 性能回退的发现与修复、相同持久化策略下的比较、两小时 Agent 驻留，以及尚未完成的实测范围。",
      ),
      tag: tr("ENGINEERING · BENCHMARK", "工程 · 基准测试"),
    },
    {
      ...blogPosts[0],
      title: tr(
        "Why I built Remote Arc: AI should reach your computer without owning it",
        "为什么我做了 Remote Arc：AI 应该能使用你的电脑，但不该接管它",
      ),
      summary: tr(
        "Chat is useful. Agents are more useful when they can work with the files, tools and environments we already use. The hard part is making that access powerful without making it reckless.",
        "聊天当然有用，但当 AI 能真正使用我们已经在用的文件、工具与开发环境时，它才更像一个 Agent。难点不是让它获得能力，而是让这种能力足够强、同时又足够克制。",
      ),
      tag: tr("WHY REMOTE ARC", "为什么做 REMOTE ARC"),
    },
    {
      ...blogPosts[1],
      title: tr(
        "Remote Arc vs OpenClaw: two different layers of the AI stack",
        "Remote Arc 和 OpenClaw 有什么区别：它们其实处在 AI 技术栈的不同层",
      ),
      summary: tr(
        "Both can help AI act on real computers, but OpenClaw is a self-hosted assistant and gateway platform while Remote Arc is a persistent agent runtime beneath the AI clients you already use.",
        "两者都能让 AI 在真实电脑上做事，但 OpenClaw 更像自托管 Assistant / Gateway 平台，而 Remote Arc 是给你已经在用的 AI 客户端提供远程执行能力的一层。",
      ),
      tag: tr("COMPARISON", "产品对比"),
    },
    {
      ...blogPosts[2],
      title: tr(
        "How Remote Arc keeps AI access powerful without exposing your computer",
        "Remote Arc 如何让 AI 足够强大，同时不把你的电脑暴露出去",
      ),
      summary: tr(
        "Powerful remote access should not require a public port, a VPN, or one giant permission switch. The architecture is built around explicit, layered boundaries.",
        "强大的远程访问不应该以公网端口、VPN 或一个巨大的总权限开关为代价。Remote Arc 的架构从一开始就是围绕分层、明确的安全边界设计的。",
      ),
      tag: tr("SECURITY", "安全"),
    },
    {
      ...blogPosts[3],
      title: tr(
        "How Remote Arc works: Worker, Durable Objects, OAuth and the local agent",
        "Remote Arc 是怎么工作的：Worker、Durable Objects、OAuth 与本地 Agent",
      ),
      summary: tr(
        "A request begins in an AI client, crosses the hosted control plane, reaches exactly one paired computer and still ends at a local policy boundary. Here is the full path.",
        "一次请求从 AI 客户端出发，经过托管控制面，抵达指定电脑，最终仍要经过本地权限边界。这里把整条链路完整拆开。",
      ),
      tag: tr("ARCHITECTURE", "架构"),
    },
  ];

  return (
    <PublicLayout user={user}>
      <section className="readingPageIntro blogReadingIntro">
        <div>
          <span className="eyebrow">{tr("BLOG", "博客")}</span>
          <h1>{tr("Remote Arc blog", "Remote Arc 博客")}</h1>
        </div>
        <p>{tr(
          "Engineering notes, architecture decisions, security trade-offs and product reasoning from building Remote Arc.",
          "记录 Remote Arc 的工程实现、架构决策、安全取舍和产品思考。",
        )}</p>
        <nav className="readingPageLinks" aria-label={tr("Explore related resources", "相关资源")}>
          <a href={localizedWebsiteHref("/docs", locale)}>{tr("Docs", "文档")} →</a>
          <a href={localizedWebsiteHref("/security-model", locale)}>{tr("Security", "安全")} →</a>
          <a href={localizedWebsiteHref("/docs#docs-routing", locale)}>{tr("Architecture notes", "架构说明")} →</a>
        </nav>
      </section>

      <section className="blogIndex blogListPlain">
        {posts.map((post) => (
          <a className="blogPostRow" href={localizedWebsiteHref("/blogs/" + post.slug, locale)} key={post.slug}>
            <div className="blogLeadMeta">
              <span>{post.tag}</span>
              <span>{post.date}</span>
              <span>{post.readTime}</span>
            </div>
            <h2>{post.title}</h2>
            <p>{post.summary}</p>
            <span className="blogReadLink">{tr("Read", "阅读")} →</span>
          </a>
        ))}
      </section>
    </PublicLayout>
  );
}
function BlogBackLink() {
  const { tr, locale } = useI18n();
  return <a className="blogBack" href={localizedWebsiteHref("/blogs", locale)}>← {tr("All posts", "全部文章")}</a>;
}
export function GoVsTypescriptBenchmarkArticlePage({ user }: { user?: User | null }) {
  const { tr } = useI18n();
  const rows = [
    { host: "Mac", source: "f68ab09", profile: "atomic", engine: "TS", read: "2.284", write: "5.327", undo: "5.345", rss: "100.69" },
    { host: "Mac", source: "f68ab09", profile: "atomic", engine: "Go", read: "0.964", write: "2.713", undo: "2.519", rss: "16.35" },
    { host: "Mac", source: "f68ab09", profile: "durable", engine: "TS", read: "2.149", write: "203.618", undo: "53.092", rss: "101.36" },
    { host: "Mac", source: "f68ab09", profile: "durable", engine: "Go", read: "0.972", write: "195.803", undo: "47.742", rss: "16.68" },
    { host: "Windows", source: "f68ab09", profile: "atomic", engine: "TS", read: "5.337", write: "20.977", undo: "16.091", rss: "95.79" },
    { host: "Windows", source: "f68ab09", profile: "atomic", engine: "Go", read: "22.660", write: "29.152", undo: "51.719", rss: "19.57" },
    { host: "Windows", source: "71cde96", profile: "atomic", engine: "TS", read: "5.422", write: "21.294", undo: "16.189", rss: "98.99" },
    { host: "Windows", source: "71cde96", profile: "atomic", engine: "Go", read: "4.168", write: "9.687", undo: "12.942", rss: "19.33" },
  ];
  return <PublicLayout user={user}>
    <article className="blogArticle">
      <header className="blogArticleHeader">
        <BlogBackLink />
        <span className="eyebrow">{tr("ENGINEERING NOTES · 9 OCT 2026", "工程笔记 · 2026 年 10 月 9 日")}</span>
        <h1>{tr(
          "Why Remote Arc chose Go: measured against TypeScript on Mac and Windows",
          "为什么 Remote Arc 选择 Go：在 Mac 和 Windows 上实测对比 TypeScript",
        )}</h1>
        <p className="blogDeck">{tr(
          "Go did not win every test. Our first Windows build was slower. Here is what we measured, what we fixed, and why the native Agent still made sense.",
          "Go 并不是一开始就全面胜出。早期 Windows 版本反而更慢。这篇文章记录我们测到了什么、修复了什么，以及为什么最终仍选择原生 Go Agent。",
        )}</p>
        <div className="blogByline"><span className="blogAuthorMark">SY</span><div>
          <strong>Sam Yao</strong>
          <span>{tr("Creator of Remote Arc", "Remote Arc 创建者")} · 9 Oct 2026 · 9 min</span>
        </div></div>
      </header>
      <div className="blogArticleBody">
        <p>{tr(
          "Remote Arc is not a benchmark project. Its Agent needs to stay on the computer for hours, preserve one execution owner, reconnect safely and honor file permissions and Undo. Choosing Go was about the shape of that product, not a claim that Go is universally faster than Node.js.",
          "Remote Arc 不是跑分项目。设备 Agent 需要长期驻留、确保只有一个执行者、可靠重连，并始终遵守文件权限和 Undo 语义。选择 Go 是基于这种产品形态，而不是宣称 Go 在所有场景中都比 Node.js 快。",
        )}</p>
        <h2>{tr("What exactly did we benchmark?", "我们到底测了什么？")}</h2>
        <p>{tr(
          "L1 measures each execution core through local JSONL IPC. L2 measures the complete foreground Agent through an authenticated loopback WebSocket relay. Both use matched operations, three alternating rounds, warmup outside the measured set and 600 samples per routine file operation. RSS is sampled after a batch, not peak RAM.",
          "L1 通过本地 JSONL IPC 测量执行内核。L2 通过已认证的本机回环 WebSocket Relay 测试完整前台 Agent。两边执行相同操作，交替运行三轮，预热不计入测量，每项常规文件操作合计 600 次样本。RSS 是批次结束后的采样值，并非峰值内存。",
        )}</p>
        <p>{tr(
          "The table below is L2 only: median (P50) latency in milliseconds and post-batch RSS in MiB. Source hashes matter: the Windows follow-up is a different, newer commit than the original baseline. These are not production Cloudflare or ChatGPT end-to-end timings.",
          "下表只展示 L2：延迟为中位数 P50（毫秒），RSS 为批次结束后内存（MiB）。源码版本很重要：Windows 修复后测试使用的是不同于旧基线的新提交。这些不是生产 Cloudflare 或 ChatGPT 端到端延迟。",
        )}</p>
        <div className="benchmarkTableScroll" role="region" aria-label={tr("Agent benchmark results, scroll horizontally to see more columns", "Agent 基准结果表，可横向滚动查看更多列")} tabIndex={0}>
          <table className="benchmarkTable">
            <caption>{tr("Full Agent (L2): median time in ms, memory in MiB", "完整 Agent（L2）：延迟单位 ms，内存单位 MiB")}</caption>
            <thead><tr>
              <th scope="col">{tr("Host", "系统")}</th>
              <th scope="col">{tr("Source", "版本")}</th>
              <th scope="col">{tr("Mode", "模式")}</th>
              <th scope="col">{tr("Engine", "引擎")}</th>
              <th scope="col">{tr("Read", "读取")}</th>
              <th scope="col">{tr("Write", "写入")}</th>
              <th scope="col">Undo</th>
              <th scope="col">RSS</th>
            </tr></thead>
            <tbody>{rows.map((item) => <tr key={item.host + item.source + item.profile + item.engine}>
              <th scope="row">{item.host}</th><td><code>{item.source}</code></td><td>{item.profile}</td>
              <td><strong>{item.engine}</strong></td><td>{item.read}</td><td>{item.write}</td><td>{item.undo}</td><td>{item.rss}</td>
            </tr>)}</tbody>
          </table>
        </div>
        <p className="benchmarkMethodNote">{tr(
          "Read/write/Undo values come from distinct three-round matched runs. Do not compare different hosts as if they had identical hardware. The Windows follow-up verified revised native-path handling, not a universal Go advantage.",
          "读取、写入与 Undo 数据来自三轮同条件测试。Mac 和 Windows 硬件不同，不能把跨机器数字直接相除。Windows 后续测试验证的是原生路径处理修复后的实现，而不是 Go 的普遍速度优势。",
        )}</p>
        <h2>{tr("The Windows regression we nearly missed", "差点被忽略的 Windows 性能回退")}</h2>
        <p>{tr(
          "At source f68ab09, Go on Windows took 29.15 ms to write versus 20.98 ms for TS, and 51.72 ms to Undo versus 16.09 ms. The issue was not evidence that native Go was the wrong runtime: the native Windows path-handling implementation needed correction. After that change, source 71cde96 measured 9.69 ms Go versus 21.29 ms TS for writes, and 12.94 ms versus 16.19 ms for Undo. Both measurements remain published.",
          "在 f68ab09 版本中，Windows 的 Go 写入需要 29.15 ms，TS 仅为 20.98 ms；Go Undo 需要 51.72 ms，TS 为 16.09 ms。但问题不代表 Go 运行时本身不合适，而是 Windows 原生路径处理需要修复。修复后，71cde96 测到 Go 写入 9.69 ms、TS 21.29 ms，Undo 则是 Go 12.94 ms、TS 16.19 ms。新旧两份结果都保留，不能只展示有利数字。",
        )}</p>
        <h2>{tr("Why durable writes look slow on the Mac", "为什么 Mac 上 durable 写入会变慢？")}</h2>
        <p>{tr(
          "In atomic mode the agent writes a temporary file and renames it, without explicitly waiting for storage flushes. Durable mode additionally synchronizes file data, Undo records and directory metadata. On this Intel Mac, L2 Go writes rose from 2.71 ms in atomic mode to 195.80 ms in durable mode. TS showed a similar jump (5.33 to 203.62 ms). Most of that difference is a stronger synchronization policy, not a proof that either language became slower.",
          "atomic 模式通过临时文件加重命名进行原子替换，但不显式等待数据落盘。durable 模式还会同步文件数据、Undo 记录与目录元数据。在这台 Intel Mac 上，L2 Go 写入由 atomic 的 2.71 ms 上升至 durable 的 195.80 ms，TS 则由 5.33 ms 上升至 203.62 ms。主要差别是同步策略，而非语言性能突然下降。",
        )}</p>
        <p>{tr(
          "The layered experiment keeps workspace writes atomic while persisting Undo state more strictly. It lowers some latency, but does not guarantee that the latest workspace edit survives sudden power loss. macOS fsync is not F_FULLFSYNC, and Windows directory synchronization has limits. We will not relabel this as full power-loss protection.",
          "layered 实验让工作区写入保持 atomic，而对 Undo 状态采用更严格的同步。它能降低部分延迟，但不保证最近一次工作区修改在突然断电后仍然存在。macOS 的 fsync 不等于 F_FULLFSYNC；Windows 的目录同步也有限制。我们不会把它包装成完整断电安全。",
        )}</p>
        <h2>{tr("Long-running resources and the decision", "长期驻留与最终选择")}</h2>
        <p>{tr(
          "Under the earlier f68ab09 native-Go soak, the Mac ran for 7,200 seconds with sampled RSS growing from 14.11 to 17.33 MiB; Windows ran for 7,200 seconds from 17.80 to 24.79 MiB, with a sampled peak of 25.11 MiB. The runs included execution, Undo, conflict checks, managed processes and repeated WebSocket reconnects in an isolated fixture, not a real production outage.",
          "在较早的 f68ab09 原生 Go 驻留实验中，Mac 运行 7,200 秒，采样 RSS 从 14.11 增至 17.33 MiB；Windows 同样运行 7,200 秒，从 17.80 增至 24.79 MiB，采样峰值为 25.11 MiB。测试覆盖文件操作、Undo、冲突检查、受管进程及隔离环境下的 WebSocket 重连，并不等于真实生产断网测试。",
        )}</p>
        <p>{tr(
          "Remote Arc 0.6.0 therefore ships Go as the default native computer Agent: low measured resident memory, native distribution without a Node prerequisite, and one executable that owns the local execution boundary. The TypeScript device runtime was later retired. Cloudflare Worker and Dashboard still use TypeScript.",
          "因此，Remote Arc 0.6.0 选择 Go 作为默认原生设备 Agent：实测较低的常驻内存、无需 Node 的原生分发，以及由同一个可执行文件负责本地执行边界。TypeScript 设备运行时后来已退役；Cloudflare Worker 和 Dashboard 依然使用 TypeScript。",
        )}</p>
        <h2>{tr("What we have not proved yet", "哪些事情仍没有证明？")}</h2>
        <p>{tr(
          "L3 is still outstanding: a formal paired TS/Go measurement of ChatGPT/client → production Cloudflare Relay → real device, separating network, routing and execution time. We also need installed-service upgrades, real power/network outages and hardware-specific crash-durability experiments. Benchmark samples are useful engineering evidence, not a blanket performance claim or production SLO.",
          "L3 仍未完成：需要把 ChatGPT/客户端 → 生产 Cloudflare Relay → 真机的 TS/Go 对照拆成网络、路由和执行耗时。另外，安装后的后台服务升级、真实断网/断电，以及硬件层面的崩溃持久化测试仍需独立验收。基准样本是工程证据，不是普适性能承诺或生产 SLO。",
        )}</p>
        <div className="benchmarkSources">
          <h2>{tr("Methods and source data", "方法与原始来源")}</h2>
          <p><a href="/docs/benchmark-baseline">{tr("Mac + Windows baseline (f68ab09)", "Mac + Windows 旧基线（f68ab09）")} ↗</a></p>
          <p><a href="/docs/benchmark-windows-followup">{tr("Windows path-handling follow-up (71cde96)", "Windows 路径处理修复后测试（71cde96）")} ↗</a></p>
          <p><a href="/docs/benchmarks">{tr("Reproduction steps, profiles and raw-artifact hashes", "复现步骤、同步模式和原始报告哈希")} ↗</a></p>
        </div>
        <footer className="blogArticleFooter">
          <div><span className="blogAuthorMark">SY</span><div><strong>Sam Yao</strong><span>{tr("Creator of Remote Arc", "Remote Arc 创建者")}</span></div></div>
          <a href="/downloads">{tr("Download the native Go Agent", "下载原生 Go Agent")} →</a>
        </footer>
      </div>
    </article>
  </PublicLayout>;
}
export function BlogArticlePage({ user }: { user?: User | null }) {
  const { tr } = useI18n();
  const post = blogPosts[0];

  return (
    <PublicLayout user={user}>
      <article className="blogArticle">
        <header className="blogArticleHeader">
          <BlogBackLink />
          <span className="eyebrow">{tr("BUILDING REMOTE ARC", "构建 REMOTE ARC")}</span>
          <h1>{tr(
            "Why I built Remote Arc: AI should reach your computer without owning it",
            "为什么我做了 Remote Arc：AI 应该能使用你的电脑，但不该接管它",
          )}</h1>
          <p className="blogDeck">{tr(
            "The most useful AI is not another chat window. It is an AI that can work with the computer you already have — under permissions you can actually understand and control.",
            "真正有用的 AI 不应该只是另一个聊天窗口，而应该能够使用你已经拥有的电脑，同时所有权限都清晰、可理解、可控制。",
          )}</p>
          <div className="blogByline">
            <span className="blogAuthorMark">SY</span>
            <div>
              <strong>Sam Yao</strong>
              <span>{tr("Creator of Remote Arc", "Remote Arc 创建者")} · {post.date} · {post.readTime}</span>
            </div>
          </div>
        </header>

        <div className="blogArticleBody">
          <p>{tr(
            "I spend a lot of time using AI tools, and I kept running into the same boundary: the model could explain what I should do, write the command I should run, or generate the patch I should apply — but the final mile was still mine. My files, terminals, repositories and development environments were sitting on real computers, while the AI was trapped behind a chat box.",
            "我长期使用各种 AI 工具，但总会撞到同一个边界：模型可以告诉我应该做什么，可以写好命令，也可以生成补丁，但最后一公里依然要我自己完成。我的文件、终端、代码仓库和开发环境都在真实电脑上，而 AI 仍然被困在聊天框里。",
          )}</p>

          <p>{tr(
            "That gap is what pushed me to build Remote Arc. The idea sounds simple: let an AI client reach a computer you own. The implementation is not simple at all, because the moment an AI can read files, edit code or run a command, the product stops being a convenience layer and becomes security-sensitive infrastructure.",
            "这就是我开始做 Remote Arc 的原因。想法听起来很简单：让 AI 客户端能够访问你自己的电脑。但真正实现起来完全不简单，因为一旦 AI 可以读取文件、修改代码或运行命令，这个产品就不再只是一个便利工具，而变成了安全敏感的基础设施。",
          )}</p>

          <h2>{tr("The goal was never “full control.”", "目标从来不是“完全控制”。")}</h2>
          <p>{tr(
            "A lot of remote-agent products are marketed around how much control they can give an AI. I wanted to start from the opposite question: how little authority does the AI need in order to finish the job?",
            "很多远程 Agent 产品会强调 AI 能获得多大的控制权。我更想从相反的问题出发：为了完成任务，AI 最少需要多少权限？",
          )}</p>

          <p>{tr(
            "Remote Arc therefore treats every computer as its own trust boundary. A development machine can expose file reads, targeted edits and terminal commands. Another machine can stay effectively read-only. Permissions belong to the device, not to a vague account-wide “agent mode.”",
            "因此 Remote Arc 把每台电脑都视为独立的信任边界。一台开发机可以开放文件读取、定向编辑和终端命令；另一台电脑可以保持接近只读。权限属于设备本身，而不是某个模糊的全局“Agent 模式”。",
          )}</p>

          <blockquote>{tr(
            "The product should make powerful actions possible, but it should never make them feel invisible.",
            "产品应该允许强大的操作发生，但绝不能让这些操作变得不可见。",
          )}</blockquote>

          <h2>{tr("No public port. No VPN. No inbound listener.", "不需要公网端口，不需要 VPN，也不需要入站监听。")}</h2>
          <p>{tr(
            "The local Remote Arc agent creates an outbound connection to the hosted relay. That matters to me because I did not want installation to begin with router configuration, firewall exceptions or a machine permanently listening to the public internet. You pair the device explicitly, it receives its own revocable credential, and it can be removed independently later.",
            "Remote Arc 的本地 Agent 主动向托管 Relay 建立出站连接。这一点对我很重要，因为我不希望安装流程从配置路由器、添加防火墙例外或让电脑永久监听公网开始。设备需要明确配对，每台设备都有独立、可撤销的凭证，也可以单独移除。",
          )}</p>

          <h2>{tr("MCP turned out to be the right interface.", "MCP 恰好是最合适的接口。")}</h2>
          <p>{tr(
            "I did not want Remote Arc to be tied to one model vendor. The useful abstraction is not “a ChatGPT remote-control feature” or “a Claude remote-control feature.” It is a set of clearly described tools that compatible AI clients can discover and call. MCP gives Remote Arc that boundary.",
            "我不希望 Remote Arc 被绑定在某一家模型厂商上。真正有价值的抽象并不是“ChatGPT 的远程控制功能”或“Claude 的远程控制功能”，而是一组描述清晰、可以被兼容 AI 客户端发现并调用的工具。MCP 正好提供了这样的边界。",
          )}</p>

          <p>{tr(
            "Today the same Remote Arc endpoint can be used from ChatGPT, Claude and other compatible clients. The client can change; the paired computers and their permission model do not have to.",
            "现在，同一个 Remote Arc 端点可以被 ChatGPT、Claude 和其他兼容客户端使用。AI 客户端可以更换，但已经配对的电脑和权限模型不需要跟着重做。",
          )}</p>

          <h2>{tr("The hardest part is not execution. It is trust.", "最难的不是执行，而是信任。")}</h2>
          <p>{tr(
            "Running a command remotely is technically easy. Deciding when that command should be allowed, showing which machine will receive it, preserving a useful audit trail without turning the service into a content archive, and giving the user a reliable way to revoke access are the parts that deserve most of the engineering attention.",
            "远程执行一条命令在技术上并不难。真正值得投入工程精力的是：什么时候应该允许它执行、明确告诉用户命令会发到哪台电脑、在不把服务变成内容存档系统的前提下保留有用的审计信息，以及让用户始终拥有可靠的撤销方式。",
          )}</p>

          <p>{tr(
            "That is why Remote Arc has an account-level MCP pause, per-device tool policies, revocable OAuth grants, protected paths, local undo support for supported edits and a local execution layer that remains the final authority. None of those controls are glamorous. They are the product.",
            "所以 Remote Arc 会有账户级 MCP Pause、每设备工具策略、可撤销 OAuth 授权、受保护路径、对支持编辑的本地 Undo，以及始终拥有最终决定权的本地执行层。这些功能可能并不“炫”，但它们本身就是产品。",
          )}</p>

          <h2>{tr("What I want Remote Arc to become", "我希望 Remote Arc 最终变成什么")}</h2>
          <p>{tr(
            "I want connecting an AI to your own computer to feel as normal as connecting a calendar or a code repository — but with controls that reflect how much more consequential a computer actually is. Installation should be simple. Permissions should be explicit. The AI client should be replaceable. And the user should always know where the boundary is.",
            "我希望未来把 AI 连接到自己的电脑，能像连接日历或代码仓库一样自然——但权限设计必须体现出“电脑”本身远比这些服务更敏感。安装应该简单，权限应该明确，AI 客户端应该可以替换，而且用户始终知道边界在哪里。",
          )}</p>

          <p>{tr(
            "Remote Arc is still early. I am building it in public, using it on my own machines, and refining the product every time something feels more powerful than it feels understandable. That tension is exactly what makes this project interesting to me.",
            "Remote Arc 还处在很早期的阶段。我会继续公开构建它，在自己的电脑上真实使用它，并且每当某个能力显得比它本身更难理解时，就重新调整产品。对我来说，这种“能力与可控性之间的张力”正是这个项目最有意思的地方。",
          )}</p>

          <footer className="blogArticleFooter">
            <div>
              <span className="blogAuthorMark">SY</span>
              <div><strong>Sam Yao</strong><span>{tr("Creator of Remote Arc", "Remote Arc 创建者")}</span></div>
            </div>
            <a href="/install/chatgpt">{tr("Install Remote Arc for ChatGPT", "为 ChatGPT 安装 Remote Arc")} →</a>
          </footer>
        </div>
      </article>
    </PublicLayout>
  );
}
export function RemoteArcVsOpenClawArticlePage({ user }: { user?: User | null }) {
  const { tr } = useI18n();
  const post = blogPosts[1];

  return (
    <PublicLayout user={user}>
      <article className="blogArticle">
        <header className="blogArticleHeader">
          <BlogBackLink />
          <span className="eyebrow">{tr("COMPARISON", "产品对比")}</span>
          <h1>{tr(
            "Remote Arc vs OpenClaw: two different layers of the AI stack",
            "Remote Arc 和 OpenClaw 有什么区别：它们其实处在 AI 技术栈的不同层",
          )}</h1>
          <p className="blogDeck">{tr(
            "They can both help AI act on real computers, but they start from different product boundaries. OpenClaw is an assistant and agent platform; Remote Arc is a persistent runtime that keeps approved work, execution state and real-device access alive beneath the AI client you choose.",
            "它们都可以让 AI 在真实电脑上做事，但产品边界不同：OpenClaw 是 Assistant 与 Agent 平台；Remote Arc 是位于你所选 AI 客户端之下的持久化 Runtime，负责保存任务、执行状态与真实设备访问。",
          )}</p>
          <div className="blogByline"><span className="blogAuthorMark">SY</span><div><strong>Sam Yao</strong><span>{tr("Creator of Remote Arc", "Remote Arc 创建者")} · {post.date} · {post.readTime}</span></div></div>
        </header>

        <div className="blogArticleBody">
          <p>{tr(
            "Remote Arc is sometimes compared with OpenClaw because both products can ultimately connect AI to a real computer. At a screenshot level the similarity is obvious: an AI asks for something, software on a machine receives the request, and something happens. But that is roughly where the architectural similarity ends.",
            "Remote Arc 有时会被拿来和 OpenClaw 比，因为两者最终都可以让 AI 连接到真实电脑。从截图层面看确实很像：AI 发出请求，电脑上的软件收到请求，然后执行某些事情。但架构上的相似性大致也就到这里为止。",
          )}</p>

          <p>{tr(
            "OpenClaw describes itself as an open-source AI assistant that runs on your own hardware. Its Gateway owns conversations, channels, agent sessions and integrations. It can connect to chat platforms, host coding or agent runtimes, expose some of its capabilities over MCP, and manage outbound MCP servers for its own runtimes.",
            "OpenClaw 官方把自己定义为运行在用户自己硬件上的开源 AI Assistant。它的 Gateway 会承载会话、聊天渠道、Agent Session 与各种集成；它既能连接聊天平台、承载编码或 Agent Runtime，也能把部分能力通过 MCP 暴露出去，并为自己的 Runtime 管理外部 MCP Server。",
          )}</p>

          <p>{tr(
            "Remote Arc deliberately owns a different layer. It does not replace your conversation UI or model; it owns the durable execution layer beneath them: paired computers, task state, checkpoints, bounded Agent Goals, recovery and permissioned tool execution. ChatGPT, Claude, Codex or another compatible MCP client can act as the reasoning source above that runtime.",
            "Remote Arc 刻意负责不同的一层：它不替代你的对话界面或模型，而是负责其下方的持久执行层——配对电脑、任务状态、检查点、受限 Agent Goal、恢复机制与权限化工具执行。ChatGPT、Claude、Codex 或其他兼容 MCP 的客户端可以作为 Runtime 上方的推理来源。",
          )}</p>

          <h2>{tr("OpenClaw is an AI home. Remote Arc is the runtime underneath.", "OpenClaw 更像 AI 的“家”，Remote Arc 是它下方的 Runtime。")}</h2>
          <div className="blogCompareTable">
            <div className="blogCompareHead"><span></span><strong>Remote Arc</strong><strong>OpenClaw</strong></div>
            <div><span>{tr("Primary role", "核心角色")}</span><b>{tr("Persistent agent runtime for real computers", "面向真实电脑的持久化 Agent Runtime")}</b><b>{tr("Self-hosted assistant / gateway platform", "自托管 Assistant / Gateway 平台")}</b></div>
            <div><span>{tr("Who owns the conversation", "谁承载对话")}</span><b>{tr("Your existing AI client", "现有 AI 客户端")}</b><b>{tr("OpenClaw Gateway and its channels", "OpenClaw Gateway 与其渠道")}</b></div>
            <div><span>{tr("Model / reasoning", "模型 / 推理")}</span><b>{tr("External source; runtime state stays in Remote Arc", "外部提供推理；Runtime 状态由 Remote Arc 持久化")}</b><b>{tr("Part of the OpenClaw platform", "属于 OpenClaw 平台能力")}</b></div>
            <div><span>MCP</span><b>{tr("Primary remote interface to paired computers", "连接已配对电脑的核心远程接口")}</b><b>{tr("One interface among several; can serve and consume MCP", "多种接口之一；既能作为 MCP Server，也能消费 MCP")}</b></div>
            <div><span>{tr("Deployment", "部署方式")}</span><b>{tr("Managed control plane + local agent", "托管控制面 + 本地 Agent")}</b><b>{tr("Self-hosted Gateway by default", "默认自托管 Gateway")}</b></div>
            <div><span>{tr("Computer control", "电脑控制")}</span><b>{tr("Files, processes, terminal and explicit device skills", "文件、进程、终端与明确设备技能")}</b><b>{tr("Broader agent tooling, including computer-use providers", "更广泛的 Agent 工具，包括 Computer Use Provider")}</b></div>
          </div>

          <h2>{tr("The deployment philosophy is almost opposite.", "两者的部署哲学几乎相反。")}</h2>
          <p>{tr(
            "OpenClaw emphasizes that the assistant, state and Gateway can live on hardware you control, with no hosted service in the middle by default. Remote Arc makes a different trade-off: the control plane is hosted so that pairing, OAuth, device discovery and remote routing work without you operating a public Gateway, while actual operating-system execution stays on the paired computer.",
            "OpenClaw 强调 Assistant、状态与 Gateway 都可以运行在你自己控制的硬件上，默认不需要中间托管服务。Remote Arc 做的是另一种取舍：控制面托管化，让配对、OAuth、设备发现与远程路由不需要用户自己维护公网 Gateway；而真正的操作系统执行依然留在已配对电脑上。",
          )}</p>

          <p>{tr(
            "That means OpenClaw gives technically inclined users more ownership of the assistant platform itself. Remote Arc gives up some of that self-hosting purity in exchange for a simpler connection model across multiple AI clients and multiple computers.",
            "这意味着 OpenClaw 给技术用户更多对 Assistant 平台本身的所有权；Remote Arc 则牺牲一部分纯自托管属性，换取多个 AI 客户端与多台电脑之间更简单的连接体验。",
          )}</p>

          <h2>{tr("Their relationship with MCP is different too.", "它们和 MCP 的关系也不同。")}</h2>
          <p>{tr(
            "For Remote Arc, MCP is the product boundary exposed to the AI side. The AI discovers a small set of computer tools, authenticates with OAuth, and Remote Arc routes those calls to the selected device.",
            "对 Remote Arc 来说，MCP 就是面向 AI 一侧最核心的产品边界。AI 发现一组明确的电脑工具，通过 OAuth 授权，然后 Remote Arc 把工具调用路由到指定设备。",
          )}</p>

          <p>{tr(
            "OpenClaw uses MCP in more than one direction. Its documentation describes an MCP server mode for exposing OpenClaw-backed conversations to external clients, and an MCP client-side registry for servers that OpenClaw-managed runtimes may consume. MCP is therefore one part of a wider agent platform rather than the whole product boundary.",
            "OpenClaw 对 MCP 的使用方向更多。官方文档既描述了把 OpenClaw 会话能力暴露给外部客户端的 MCP Server 模式，也提供了让 OpenClaw 自己的 Runtime 消费外部 MCP Server 的注册管理能力。因此 MCP 是其更大 Agent 平台中的一个组成部分，而不是整个产品边界。",
          )}</p>

          <h2>{tr("They can actually complement each other.", "它们其实可以互补。")}</h2>
          <p>{tr(
            "This is why I do not think the most useful framing is “which one replaces the other?” If you want a self-hosted personal assistant that owns channels, memory and agent sessions, OpenClaw solves a much broader problem. If you already live in ChatGPT or Claude and mainly want those clients to reach your real computers with explicit device permissions, Remote Arc is intentionally narrower.",
            "所以我不认为最有价值的问题是“谁取代谁”。如果你想要一个自托管个人 Assistant，自己承载渠道、记忆与 Agent Session，OpenClaw 解决的问题明显更广；如果你已经长期使用 ChatGPT 或 Claude，主要只是希望这些客户端在明确设备权限下访问你的真实电脑，那么 Remote Arc 就是刻意做得更窄。",
          )}</p>

          <p>{tr(
            "The two models can even meet: OpenClaw can consume remote MCP servers, while Remote Arc exposes one. In that setup OpenClaw can be the assistant above Remote Arc, while Remote Arc remains the persistent computer runtime below it. The same runtime can instead be driven by ChatGPT, Claude, Codex or another compatible client.",
            "从架构上看，两者甚至可以连接起来：OpenClaw 可以消费 Remote MCP，而 Remote Arc 暴露对应 Endpoint。此时 OpenClaw 可以作为上层 Assistant，Remote Arc 仍是下方的持久化电脑 Runtime；同一个 Runtime 也可以由 ChatGPT、Claude、Codex 或其他兼容客户端驱动。",
          )}</p>

          <div className="blogSourceNote">
            <strong>{tr("Sources for the OpenClaw comparison", "OpenClaw 对比资料来源")}</strong>
            <a href="https://docs.openclaw.ai/" target="_blank" rel="noreferrer">OpenClaw overview ↗</a>
            <a href="https://docs.openclaw.ai/cli/mcp" target="_blank" rel="noreferrer">OpenClaw MCP docs ↗</a>
            <a href="https://docs.openclaw.ai/nodes/computer-use" target="_blank" rel="noreferrer">OpenClaw computer-use docs ↗</a>
          </div>

          <footer className="blogArticleFooter"><div><span className="blogAuthorMark">SY</span><div><strong>Sam Yao</strong><span>{tr("Creator of Remote Arc", "Remote Arc 创建者")}</span></div></div><a href="/install/chatgpt">{tr("Try Remote Arc with ChatGPT", "在 ChatGPT 中使用 Remote Arc")} →</a></footer>
        </div>
      </article>
    </PublicLayout>
  );
}
export function PowerfulAccessArticlePage({ user }: { user?: User | null }) {
  const { tr } = useI18n();
  const post = blogPosts[2];

  return (
    <PublicLayout user={user}>
      <article className="blogArticle">
        <header className="blogArticleHeader">
          <BlogBackLink />
          <span className="eyebrow">{tr("SECURITY", "安全")}</span>
          <h1>{tr(
            "How Remote Arc keeps AI access powerful without exposing your computer",
            "Remote Arc 如何让 AI 足够强大，同时不把你的电脑暴露出去",
          )}</h1>
          <p className="blogDeck">{tr(
            "Remote control becomes useful only when the AI can do consequential work. The design problem is giving it that power without turning your computer into a permanently exposed endpoint.",
            "只有当 AI 能做真正有影响的工作时，远程控制才有意义。设计难点在于：如何给它足够能力，又不让你的电脑变成一个永久暴露的公网端点。",
          )}</p>
          <div className="blogByline"><span className="blogAuthorMark">SY</span><div><strong>Sam Yao</strong><span>{tr("Creator of Remote Arc", "Remote Arc 创建者")} · {post.date} · {post.readTime}</span></div></div>
        </header>

        <div className="blogArticleBody">
          <p>{tr(
            "An AI that can only tell you what command to run is safe but limited. An AI that can run every command everywhere is useful but reckless. Remote Arc is built around the space between those two extremes.",
            "一个只能告诉你应该运行什么命令的 AI 很安全，但能力有限；一个可以在任何地方运行任何命令的 AI 很有用，但也非常危险。Remote Arc 的设计目标就是在这两个极端之间找到边界。",
          )}</p>

          <h2>{tr("1. Your computer never needs a public inbound port.", "1. 你的电脑不需要开放任何公网入站端口。")}</h2>
          <p>{tr(
            "The local Remote Arc agent establishes an outbound connection to the hosted control plane. Your router does not need port forwarding, your laptop does not need a public IP, and the machine does not sit on the internet waiting for arbitrary inbound connections.",
            "本地 Remote Arc Agent 主动向托管控制面建立出站连接。路由器不需要端口转发，电脑不需要公网 IP，也不会在互联网上开放一个入口等待任意外部连接。",
          )}</p>
          <blockquote>{tr(
            "The connection starts from the computer you own. Remote Arc does not ask the internet to find an open door into it.",
            "连接由你自己的电脑主动发起。Remote Arc 不需要让互联网找到一扇通往它的开放大门。",
          )}</blockquote>

          <h2>{tr("2. Pairing creates a device identity, not a shared master password.", "2. 配对建立的是设备身份，而不是共享的万能密码。")}</h2>
          <p>{tr(
            "Every paired computer receives its own revocable credential. The hosted database stores only the credential hash. If one machine should no longer be reachable, that device can be revoked independently without rotating access for every other computer.",
            "每台已配对电脑都有自己独立、可撤销的凭证。托管数据库只保存凭证哈希。如果某台设备不应该继续被访问，可以单独撤销它，而不需要同时轮换所有其他电脑的访问凭证。",
          )}</p>

          <h2>{tr("3. OAuth controls the AI client separately from the device.", "3. OAuth 把 AI 客户端权限和设备身份分开。")}</h2>
          <p>{tr(
            "A paired computer and an authorized AI client are two different trust relationships. ChatGPT or Claude authenticates through OAuth with explicit scopes. Revoking an AI client does not require re-pairing the computer, and revoking a computer does not require changing every AI connection.",
            "一台已配对电脑和一个获得授权的 AI 客户端，是两种完全不同的信任关系。ChatGPT 或 Claude 通过 OAuth 和明确 Scope 获得授权。撤销某个 AI 客户端不需要重新配对电脑；撤销某台电脑也不需要修改所有 AI 连接。",
          )}</p>

          <h2>{tr("4. Permission is per device, not one global agent switch.", "4. 权限按设备控制，而不是一个全局 Agent 开关。")}</h2>
          <p>{tr(
            "A work laptop, a gaming PC and a home server should not expose the same capabilities. Remote Arc lets each device advertise and enable its own skill set. Safe access can stay read-only. Developer access can add targeted file edits. Full access can add terminal execution where that is genuinely required.",
            "工作笔记本、游戏 PC 和家庭服务器不应该开放完全相同的能力。Remote Arc 让每台设备独立声明和启用自己的技能集合。Safe 可以保持只读；Developer 可以加入定向文件编辑；只有确实需要时才在 Full 中加入终端执行。",
          )}</p>

          <div className="blogSecurityLayers">
            <span><b>OAuth scope</b><small>{tr("What the AI client may request", "AI 客户端可以请求什么")}</small></span>
            <span><b>Relay policy</b><small>{tr("What the account and device allow", "账户和设备策略允许什么")}</small></span>
            <span><b>Local agent</b><small>{tr("What the computer actually exposes", "电脑实际暴露什么能力")}</small></span>
            <span><b>OS user</b><small>{tr("The final operating-system boundary", "最终的操作系统权限边界")}</small></span>
          </div>

          <h2>{tr("5. Sensitive paths and trusted write locations reduce accidental reach.", "5. 敏感路径和可信写入区域减少误操作范围。")}</h2>
          <p>{tr(
            "Remote Arc separates read visibility from write authority: ordinary non-sensitive files can be inspected broadly, while persistent mutation is limited to Trusted Write Locations and temporary approvals. Sensitive paths remain separately protected. These controls are not a replacement for operating-system sandboxing, especially once arbitrary terminal execution is enabled.",
            "Remote Arc 将“可读取范围”和“可写入权限”分开：普通非敏感文件可以广泛只读查看，持续修改仅允许在可信写入区域或临时审批范围内；敏感路径继续独立保护。这些控制不能替代操作系统级沙箱，尤其是在开启任意终端执行之后。",
          )}</p>

          <h2>{tr("6. Supported edits can be undone locally.", "6. 支持的修改可以在本机撤销。")}</h2>
          <p>{tr(
            "For supported Remote Arc file mutations, the local agent keeps a bounded undo snapshot on the device itself. The hosted service does not need to become a backup of your file contents in order to give you a recovery path.",
            "对于 Remote Arc 支持的文件修改，本地 Agent 会在设备本机保留有限的 Undo Snapshot。这样即使提供恢复能力，托管服务也不需要变成一个保存你文件内容的云端备份。",
          )}</p>

          <h2>{tr("7. Audit metadata is useful without becoming content retention.", "7. 审计应该提供可见性，而不是变成内容留存。")}</h2>
          <p>{tr(
            "Remote Arc records operational metadata such as which tool ran, which device received it, whether it succeeded and when it happened. The audit design intentionally avoids persisting file contents, raw command arguments, OAuth tokens or raw device credentials.",
            "Remote Arc 会记录运行所需的元数据，例如使用了什么工具、发送到了哪台设备、是否成功以及发生时间。审计设计会刻意避免持久化文件内容、原始命令参数、OAuth Token 或原始设备凭证。",
          )}</p>

          <h2>{tr("The important limitation: permissions are not magic.", "最重要的限制：权限控制并不是魔法。")}</h2>
          <p>{tr(
            "Once you explicitly enable unrestricted terminal execution, the shell inherits the permissions of the local operating-system user. Remote Arc can put strong gates around when a terminal tool is available, but it cannot honestly claim that an unrestricted shell is harmless. The right security model is therefore layered control plus explicit user choice, not pretending that powerful execution has no consequences.",
            "一旦你明确开启不受限制的终端执行，Shell 最终继承的是本地操作系统用户本身的权限。Remote Arc 可以严格控制终端工具什么时候可用，但不能假装一个 unrestricted shell 天生无害。正确的安全模型应该是分层控制 + 明确的用户选择，而不是假装强执行能力没有后果。",
          )}</p>

          <footer className="blogArticleFooter"><div><span className="blogAuthorMark">SY</span><div><strong>Sam Yao</strong><span>{tr("Creator of Remote Arc", "Remote Arc 创建者")}</span></div></div><a href="/security-model">{tr("Read the security model", "查看安全模型")} →</a></footer>
        </div>
      </article>
    </PublicLayout>
  );
}
export function ArchitectureArticlePage({ user }: { user?: User | null }) {
  const { tr } = useI18n();
  const post = blogPosts[3];

  return (
    <PublicLayout user={user}>
      <article className="blogArticle">
        <header className="blogArticleHeader">
          <BlogBackLink />
          <span className="eyebrow">{tr("ARCHITECTURE", "架构")}</span>
          <h1>{tr(
            "How Remote Arc works: Worker, Durable Objects, OAuth and the local agent",
            "Remote Arc 是怎么工作的：Worker、Durable Objects、OAuth 与本地 Agent",
          )}</h1>
          <p className="blogDeck">{tr(
            "Remote Arc is deliberately split into a hosted control plane and a local execution plane. That separation is what makes one MCP endpoint work across many AI clients and many computers.",
            "Remote Arc 刻意拆成托管控制面与本地执行面。正是这层分离，让一个 MCP Endpoint 可以同时服务多个 AI 客户端和多台电脑。",
          )}</p>
          <div className="blogByline"><span className="blogAuthorMark">SY</span><div><strong>Sam Yao</strong><span>{tr("Creator of Remote Arc", "Remote Arc 创建者")} · {post.date} · {post.readTime}</span></div></div>
        </header>

        <div className="blogArticleBody">
          <p>{tr(
            "From the outside Remote Arc looks simple: connect an AI client, pair a computer, ask the AI to do something. Internally that request crosses several boundaries, and every boundary exists for a reason.",
            "从外面看 Remote Arc 很简单：连接 AI 客户端、配对电脑、让 AI 做一件事。实际上，一次请求内部会跨越多层边界，而每一层边界都有明确存在的理由。",
          )}</p>

          <div className="blogArchitectureRail">
            <span>ChatGPT / Claude</span><i>→</i><span>Remote MCP</span><i>→</i><span>Worker</span><i>→</i><span>Durable Object</span><i>→</i><span>Local Agent</span><i>→</i><span>OS</span>
          </div>

          <h2>{tr("Step 1: the AI client sees a Remote MCP server.", "第一步：AI 客户端看到的是一个 Remote MCP Server。")}</h2>
          <p>{tr(
            "ChatGPT, Claude or another compatible client connects to a single Remote Arc MCP URL. Tool discovery describes the capabilities Remote Arc can expose: device discovery, file inspection, process inspection, file editing, managed processes, terminal execution and undo.",
            "ChatGPT、Claude 或其他兼容客户端只需要连接一个 Remote Arc MCP URL。Tool Discovery 会描述 Remote Arc 能暴露的能力：设备发现、文件读取、进程查看、文件编辑、后台进程管理、终端执行与 Undo。",
          )}</p>

          <h2>{tr("Step 2: OAuth answers who the AI is acting for.", "第二步：OAuth 解决“这个 AI 正在代表谁”。")}</h2>
          <p>{tr(
            "The MCP endpoint is not a shared secret pasted into every client. OAuth establishes the user identity, scopes and client grant. Access tokens can be short-lived, refresh tokens can rotate, and a grant can be revoked without changing the paired-device credential.",
            "MCP Endpoint 不是一个复制到所有客户端里的共享密钥。OAuth 会建立用户身份、Scope 与客户端授权。Access Token 可以保持短期，Refresh Token 可以轮换，而且某个客户端授权可以单独撤销，不需要改变设备配对凭证。",
          )}</p>

          <h2>{tr("Step 3: the Cloudflare Worker is the control-plane entry point.", "第三步：Cloudflare Worker 是控制面的统一入口。")}</h2>
          <p>{tr(
            "The Worker handles the public HTTP surface: MCP requests, OAuth endpoints, pairing APIs, account APIs and the web application. It authenticates the request, checks account state and device policy, applies rate limits and decides whether a call is allowed to proceed.",
            "Worker 承担公开 HTTP 表面：MCP 请求、OAuth 入口、配对 API、账户 API 与 Web App。它负责认证请求、检查账户状态和设备策略、执行限流，并决定一次调用是否可以继续。",
          )}</p>

          <h2>{tr("Step 4: D1 keeps durable identity and policy.", "第四步：D1 保存持久身份与策略。")}</h2>
          <p>{tr(
            "D1 stores the durable facts that should survive disconnects and deployments: users, paired-device metadata, credential hashes, sessions, OAuth grants, per-device policy, security settings, usage counters and audit metadata. It is not the live transport for tool execution.",
            "D1 保存那些即使设备断线或 Worker 更新也必须持续存在的事实：用户、设备元数据、凭证哈希、Session、OAuth Grant、每设备策略、安全设置、用量计数和审计元数据。它并不是工具执行时的实时传输通道。",
          )}</p>

          <h2>{tr("Step 5: a per-user Durable Object owns live routing.", "第五步：每用户 Durable Object 负责实时路由。")}</h2>
          <p>{tr(
            "Live device connections are stateful. Durable Objects give Remote Arc a stable place to coordinate WebSockets, track which paired devices are currently reachable and forward a tool call to exactly the selected connection. This avoids trying to force real-time connection state into a stateless Worker request.",
            "设备在线连接本质上是有状态的。Durable Objects 给 Remote Arc 提供了一个稳定位置来协调 WebSocket、维护哪些已配对设备此刻可达，并把工具调用精确转发到被选中的连接。这样就不用强行把实时连接状态塞进无状态 Worker 请求里。",
          )}</p>

          <h2>{tr("Step 6: the local agent is the final execution boundary.", "第六步：本地 Agent 是最终执行边界。")}</h2>
          <p>{tr(
            "The hosted control plane never directly opens a shell on your computer. The local agent receives an authenticated routed request, checks what it actually exposes and executes the operation through Remote Arc's local execution core. File operations, process inspection, terminal commands and undo all terminate at the machine itself.",
            "托管控制面不会直接在你的电脑上打开 Shell。本地 Agent 收到经过认证和路由的请求后，会再次检查自己实际开放的能力，再通过 Remote Arc 的本地执行核心执行操作。文件、进程、终端与 Undo 最终都在电脑本机完成。",
          )}</p>

          <h2>{tr("Step 7: the result travels back, not the machine.", "第七步：返回的是结果，不是把整台电脑搬到云上。")}</h2>
          <p>{tr(
            "The agent returns the specific tool result through the existing outbound connection. The control plane relays it to the authenticated MCP client. This is why Remote Arc can give an AI useful access to local state without moving the entire development environment into a hosted VM.",
            "Agent 会把具体工具结果沿现有出站连接返回，控制面再把结果转发给已认证的 MCP 客户端。也正因为这样，Remote Arc 可以让 AI 使用本地状态，而不需要把整个开发环境搬进托管虚拟机。",
          )}</p>

          <h2>{tr("Why split control plane and execution plane?", "为什么要把控制面和执行面拆开？")}</h2>
          <p>{tr(
            "The hosted side is good at identity, discovery, routing, policy and availability. The local side is the only place that should own operating-system execution. Keeping those responsibilities separate makes it possible to improve the hosted experience without pretending that the cloud should become the authority over the user's machine.",
            "托管侧擅长身份、发现、路由、策略与可用性；本地侧才应该拥有操作系统执行的最终权力。把两者分开，可以持续改进托管体验，同时避免让云端变成用户电脑的最终权限主体。",
          )}</p>

          <div className="blogSourceNote">
            <strong>{tr("Explore the implementation", "查看实现")}</strong>
            <a href="/docs#docs-routing">{tr("System architecture", "系统架构")} →</a>
            <a href="https://github.com/yaohuangguan/remote-arc" target="_blank" rel="noreferrer">GitHub →</a>
          </div>

          <footer className="blogArticleFooter"><div><span className="blogAuthorMark">SY</span><div><strong>Sam Yao</strong><span>{tr("Creator of Remote Arc", "Remote Arc 创建者")}</span></div></div><a href="/docs/mcp">{tr("Explore the MCP architecture", "查看 MCP 架构")} →</a></footer>
        </div>
      </article>
    </PublicLayout>
  );
}
