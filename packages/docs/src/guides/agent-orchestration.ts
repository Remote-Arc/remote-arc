import type { DocSection } from "../catalog.js";

export const agentOrchestrationSections: DocSection[] = [
  {
    heading: { en: "What Agent Orchestration does", zh: "Agent 编排能做什么" },
    text: {
      en: "Agent Orchestration runs the coding agents you already use, Claude Code, Codex and Gemini CLI, on any of your paired computers, from the Dashboard. Each agent works in its own Git worktree and branch, so several can work on the same repository at once without touching your checkout or each other. Agent Orchestration is in beta.",
      zh: "Agent 编排在 Dashboard 里，把你已经在用的编程 Agent（Claude Code、Codex 和 Gemini CLI）运行在任意一台已配对的电脑上。每个 Agent 都在独立的 Git worktree 和分支中工作，所以多个 Agent 可以同时处理同一个仓库，既不影响你的工作目录，也不会互相干扰。Agent 编排目前处于 Beta 阶段。",
    },
    list: {
      items: [
        {
          en: "Every agent you open is a tab, marked with its agent. Choose a layout: Single, Split (two side by side, with a divider you can drag), Focus (one large, two beside it) or Grid (up to four). Choosing a tab puts that agent first in view, and any pane can be maximised. The list on the left groups your agents by computer and repository, and can be collapsed or resized; Expand workspace turns the Dashboard menu into icons so the agents fill the screen.",
          zh: "每个打开的 Agent 都是一个标签页，并标着是哪个 Agent。可以选择布局：单个、左右（两个并排，中间的分隔线可以拖动）、主次（一个大的，旁边两个）或四宫格（最多四个）。点击标签页会把那个 Agent 放到视图的第一位，任何一个窗格都可以最大化。左侧列表按电脑和仓库分组列出所有 Agent，可以收起或调整宽度；“展开工作区”会把 Dashboard 菜单收成图标，让 Agent 铺满屏幕。",
        },
        {
          en: "Each conversation reads like Claude Code: the agent's replies, each tool it used with what it returned, and its to-do list, as it works.",
          zh: "每段对话的样子和 Claude Code 一样：Agent 的回复、用过的每个工具及其返回结果、它的待办清单，都会在工作时实时显示。",
        },
        {
          en: "Send a follow-up when an agent replies. It continues the same session in the same worktree, as if you typed it in its terminal.",
          zh: "Agent 回复后可以继续发消息，它会在同一个 worktree 里接着原来的会话工作，就像你在它的终端里输入一样。",
        },
        {
          en: "On a computer with an up-to-date Remote Arc Agent, Claude Code keeps running between your messages: what it prints shows up in the Dashboard as it works, and your answers reach it at once.",
          zh: "在 Remote Arc Agent 为最新版本的电脑上，Claude Code 会在两条消息之间保持运行：它输出的内容会在工作时实时显示在 Dashboard 中，你的回答也会立即送达。",
        },
        {
          en: "Review every change against the commit the agent started from, then create a pull request or merge the branch into the one you were on.",
          zh: "对照 Agent 起始提交查看每一处改动，然后创建 Pull Request，或把分支合并回你原来所在的分支。",
        },
        {
          en: "See your Claude Code and Codex 5-hour and 7-day usage as they report it, and tokens and cost for every reply.",
          zh: "查看 Claude Code 和 Codex 报告的 5 小时和 7 天用量，以及每次回复的 token 和费用。",
        },
        {
          en: "Get a notification on Slack or a webhook when an agent replies, fails, or waits for your approval. Coding agents have their own switch in Settings, Notifications, apart from routine notices.",
          zh: "Agent 回复、失败或等待你批准时，通过 Slack 或 Webhook 收到通知。编程 Agent 在设置的通知里有单独的开关，和 routine 通知分开。",
        },
      ],
    },
  },
  {
    heading: { en: "Start an agent", zh: "启动一个 Agent" },
    text: {
      en: "An agent needs the agent installed and signed in on the computer, the Full preset for that computer in Devices, and a repository the computer lets Remote Arc write to.",
      zh: "启动 Agent 需要电脑上已安装并登录该 Agent、在“设备”中为这台电脑选择“含终端”预设，并且仓库位于电脑允许 Remote Arc 写入的位置。",
    },
    list: {
      ordered: true,
      items: [
        {
          en: "Install Claude Code, Codex or Gemini CLI on the computer and sign in once there, with your own subscription or API key. Remote Arc never sees your agent login.",
          zh: "在那台电脑上安装 Claude Code、Codex 或 Gemini CLI，并用你自己的订阅或 API Key 登录一次。Remote Arc 不会接触你的 Agent 登录信息。",
        },
        {
          en: "Make sure the repository is inside one of the computer's trusted write locations (Dashboard, Devices).",
          zh: "确认仓库位于这台电脑的可信写入位置之内（Dashboard >“设备”）。",
        },
        {
          en: "In Devices, choose the Full preset (Terminal) for the computer. Agent Orchestration starts and runs each agent with terminal commands, which the Safe (Read only) and Developer (Read + edit) presets leave off. With either of them, the workspace preflight says a tool the agent needs is turned off, and the agent cannot start.",
          zh: "在“设备”中为这台电脑选择“含终端”预设。启动和运行都要用到终端命令，而“只读”和“读写文件”预设都没有开启终端；选了其中任何一个，工作区预检都会提示缺少需要的工具，也无法启动。",
        },
        {
          en: "In the Dashboard, open Agent Orchestration and choose + (New agent) to open the Launchpad. Under New agent, pick the agent and its mode, write what it should do, and choose the computer and repository. Under Parallel, give several agents a shared objective and each its own task, computer and model; they start together, each in its own worktree.",
          zh: "在 Dashboard 中打开“Agent 编排”，点击 +（新建 Agent）打开启动台。在“新建 Agent”中选择 Agent 和模式，写下要做的事，再选择电脑和仓库。在“并行”中给多个 Agent 一个共同目标，并为每个 Agent 设置各自的任务、电脑和模型；它们会一起启动，各自在独立的 worktree 中工作。",
        },
        {
          en: "Before you start, the workspace preflight checks each computer: that the folder is a Git repository with a commit (or that the agent may work in the folder itself), and that the agent is installed and signed in there. The folder field suggests the repositories inside the computer's trusted folders. An agent that is missing can be installed from the form (Codex and Gemini CLI need Node.js 18 or later), and Claude Code can be signed in from it: open its sign-in page in any browser, even on your phone, and paste the code back. Codex and Gemini CLI are signed in on the computer itself.",
          zh: "启动前，工作区预检会检查每台电脑：文件夹是否为有提交的 Git 仓库（或允许 Agent 直接在文件夹中工作），以及 Agent 是否已在那台电脑上安装并登录。文件夹一栏会列出这台电脑可信文件夹中的仓库。缺少的 Agent 可以直接在表单里安装（Codex 和 Gemini CLI 需要 Node.js 18 或更高版本）；Claude Code 也可以在表单里登录：在任意浏览器（手机也可以）打开它的登录页，再把代码粘贴回来。Codex 和 Gemini CLI 需要在那台电脑上登录。",
        },
      ],
    },
  },
  {
    heading: { en: "Continue a session from the computer", zh: "继续电脑上的会话" },
    text: {
      en: "The Launchpad's Resume entry lists the Claude Code and Codex sessions you started on a computer yourself, newest first. Continue one and it opens in its own folder with its earlier conversation; your next message resumes that same session. Its folder must be one of the computer's trusted folders.",
      zh: "启动台的“继续会话”会列出你自己在电脑上开始的 Claude Code 和 Codex 会话，最新的在前。继续某个会话后，它会在原来的文件夹里打开并显示之前的对话；你的下一条消息会接着这个会话。它所在的文件夹必须是这台电脑的可信文件夹。",
    },
  },
  {
    heading: {
      en: "Its own worktree, or the folder itself",
      zh: "独立 worktree，或直接在文件夹中",
    },
    text: {
      en: "By default each agent gets its own worktree and branch. Turn that off to let it work in the folder itself, editing your checkout directly: one agent per folder, and with no branch of its own there is nothing to merge or turn into a pull request.",
      zh: "默认情况下每个 Agent 都有自己的 worktree 和分支。关闭后，Agent 直接在文件夹里工作，会修改你的工作目录：每个文件夹只能有一个 Agent；因为没有自己的分支，所以也没有需要合并或创建 Pull Request 的内容。",
    },
  },
  {
    heading: { en: "Model and reasoning effort", zh: "模型与推理程度" },
    text: {
      en: "Beside the mode, choose the model and the reasoning effort, when you start an agent or for any message. Claude Code lists its aliases (fable, opus, sonnet, haiku), each named for its newest model. Codex lists the models its account offers, read from the Codex on that computer once it has run there, each with the effort levels it takes. Gemini CLI lists Auto, then Google's current Gemini models, preview models first. You can also type any model name the agent knows. Claude Code takes low, medium, high, extra high or max effort, and Codex low to ultra as its model allows; Gemini CLI has no effort setting. Leave them empty to use the agent's own default.",
      zh: "在模式旁边可以选择模型和推理程度，启动 Agent 时或每条消息都可以设置。Claude Code 列出它的别名（fable、opus、sonnet、haiku），每个都以其最新模型命名。Codex 列出它的账号可用的模型，从那台电脑上的 Codex 读取（需在那里运行过一次），并带有每个模型支持的推理程度。Gemini CLI 先列出 Auto，再列出 Google 当前的 Gemini 模型，预览版排在前面。也可以输入该 Agent 支持的任意模型名。Claude Code 支持低、中、高、超高和最大推理，Codex 支持低到极致（取决于模型）；Gemini CLI 没有推理程度设置。留空则使用 Agent 自己的默认值。",
    },
  },
  {
    heading: { en: "Modes and approvals", zh: "模式与批准" },
    text: {
      en: "A mode decides how much an agent may do without asking. Choose it when you start the agent, or under the message box for each message; Shift+Tab moves to the next mode.",
      zh: "模式决定 Agent 不经询问能做多少事。启动时选择，或在每条消息的输入框下方选择；按 Shift+Tab 切换到下一个模式。",
    },
    list: {
      items: [
        {
          en: "Claude Code: Accept edits (edits files, asks before other actions), Ask before acting, Plan (reads and proposes a plan), or Auto (Claude Code's own safety checks decide).",
          zh: "Claude Code：自动接受修改（直接修改文件，其他操作先询问）、操作前询问、计划（只阅读并提出计划），或自动（由 Claude Code 自己的安全检查决定）。",
        },
        {
          en: "When Claude Code wants to do something its mode does not allow, it waits for you. Answer from the Dashboard: yes once, yes and don't ask again for that command in this agent, or no with what to do instead. Sending a message while it waits is the same as no, with your message as what to do. In Plan mode, approving the plan switches the agent to accepting edits.",
          zh: "当 Claude Code 想做当前模式不允许的事时，它会等你决定。在 Dashboard 里回答：允许一次、允许并且这个 Agent 不再询问这条命令，或者拒绝并说明怎么做。在它等待时发送消息，等同于拒绝，并把你的消息作为下一步的做法。在计划模式下，批准计划后 Agent 会切换到自动接受修改。",
        },
        {
          en: "Codex works in its sandbox: Workspace write, or Read only. Gemini CLI accepts edits, or plans. Neither asks for approval from the Dashboard.",
          zh: "Codex 在自己的沙箱中工作：可写工作区，或只读。Gemini CLI 可以自动接受修改，或只做计划。两者都不会在 Dashboard 里请求批准。",
        },
      ],
    },
  },
  {
    heading: { en: "When an agent stops and needs you", zh: "Agent 停下来需要你处理时" },
    text: {
      en: "An agent stops with a clear reason, never a bare failure, when it is signed out, when its own subscription reaches its usage limit, when its account has no credits left, or when its plan does not include it. These limits belong to your Claude, ChatGPT or Google account, not to Remote Arc: wait for the limit to reset, add credits, or start another agent.",
      zh: "当 Agent 未登录、它自己的订阅达到用量上限、账户没有余额，或它的套餐不包含该 Agent 时，它会停下来并说明原因，而不是只显示失败。这些限制属于你的 Claude、ChatGPT 或 Google 账户，而不是 Remote Arc：等待额度重置、充值，或换一个 Agent。",
    },
  },
  {
    heading: { en: "How it stays safe", zh: "如何保证安全" },
    text: {
      en: "Each agent keeps its own safety checks, and Remote Arc adds the computer's.",
      zh: "每个 Agent 保留自己的安全检查，Remote Arc 再加上这台电脑的安全设置。",
    },
    list: {
      items: [
        {
          en: "No agent skips its permission checks. What you allow becomes that agent's own permission rules, and your messages reach it through a file or its input, never on a command line and never through a shell.",
          zh: "没有任何 Agent 会跳过自己的权限检查。你允许的操作会成为该 Agent 自己的权限规则；你的消息通过文件或它的输入传给它，从不出现在命令行中，也从不经过 shell。",
        },
        {
          en: "The agent works in its worktree. Your own checkout is untouched until you merge, and a merge happens only while your checkout is on the branch it started from with nothing uncommitted. A merge that conflicts is undone.",
          zh: "Agent 只在自己的 worktree 中工作，在你合并之前你的工作目录不受影响。只有当你的工作目录仍在起始分支上且没有未提交的改动时才能合并；有冲突的合并会被撤销。",
        },
        {
          en: "Agents start only inside the computer's trusted folders, which you choose under Devices. To use a folder outside them, add it there first: Agent Orchestration never widens them for you.",
          zh: "Agent 只会在这台电脑的可信文件夹中启动，可信文件夹由你在“设备”中选择。要使用其他文件夹，请先在那里添加；Agent 编排不会替你扩大范围。",
        },
        {
          en: "Removing a worktree asks you first, and deletes only that worktree and its branch.",
          zh: "删除 worktree 前会先征求你的确认，并且只删除该 worktree 及其分支。",
        },
      ],
    },
  },
  {
    heading: { en: "Plans", zh: "套餐" },
    text: {
      en: "Agent Orchestration runs your agents through Connect, so it is part of Pro and Max. A Free account keeps the agents it ran before; start the Pro or Max trial to run more.",
      zh: "Agent 编排通过 Connect 运行你的 Agent，所以属于 Pro 和 Max。Free 账户仍可查看以前运行过的 Agent；开始 Pro 或 Max 试用即可继续使用。",
    },
    list: {
      items: [
        {
          en: "Pro and Max: start up to five agents in one go, on one computer or across several, and run as many at once as the plan's background commands allow.",
          zh: "Pro 和 Max：一次最多启动 5 个 Agent，可以在一台电脑上，也可以分布到多台电脑；同时运行的数量以套餐的后台命令数为上限。",
        },
        {
          en: "Remote Arc charges nothing per run: the agents use your own Claude, ChatGPT or Google subscription.",
          zh: "Remote Arc 不按次收费：Agent 使用的是你自己的 Claude、ChatGPT 或 Google 订阅。",
        },
      ],
    },
  },
];
