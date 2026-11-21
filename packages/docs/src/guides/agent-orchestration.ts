import type { DocSection } from "../catalog.js";

export const agentOrchestrationSections: DocSection[] = [
  {
    heading: { en: "What Agent Orchestration does", zh: "Agent 编排能做什么" },
    text: {
      en: "Agent Orchestration runs the coding agents you already use, Claude Code and Codex, on any of your paired computers, from the Dashboard. Each agent works in its own Git worktree and branch, so several can work on the same repository at once without touching your checkout or each other.",
      zh: "Agent 编排在 Dashboard 里，把你已经在用的编程 Agent（Claude Code 和 Codex）运行在任意一台已配对的电脑上。每个 Agent 都在独立的 Git worktree 和分支中工作，所以多个 Agent 可以同时处理同一个仓库，既不影响你的工作目录，也不会互相干扰。",
    },
    list: {
      items: [
        {
          en: "Talk to several agents side by side: each one's replies, the commands it ran and the files it edited appear as it works.",
          zh: "并排和多个 Agent 对话：它们的回复、运行的命令和修改的文件会在工作时实时显示。",
        },
        {
          en: "Send a follow-up when an agent replies. It continues the same session in the same worktree, as if you typed it in its terminal.",
          zh: "Agent 回复后可以继续发消息，它会在同一个 worktree 里接着原来的会话工作，就像你在它的终端里输入一样。",
        },
        {
          en: "See what changed: files, lines added and removed, and commits since the agent started.",
          zh: "查看改了什么：自 Agent 开始以来改动的文件、增删的行数和提交数。",
        },
        {
          en: "See your Claude subscription windows (5-hour and 7-day usage) as Claude Code reports them, and tokens and cost for every reply.",
          zh: "查看 Claude 订阅的用量窗口（5 小时和 7 天），数据来自 Claude Code 的报告；每次回复的 token 和费用也会显示。",
        },
        {
          en: "Get a notification on Slack or a webhook when an agent replies, fails or needs you.",
          zh: "Agent 回复、失败或需要你处理时，通过 Slack 或 Webhook 收到通知。",
        },
      ],
    },
  },
  {
    heading: { en: "Start an agent", zh: "启动一个 Agent" },
    text: {
      en: "An agent needs the agent installed and signed in on the computer, and a repository the computer lets Remote Arc write to.",
      zh: "启动 Agent 需要电脑上已安装并登录该 Agent，并且仓库位于电脑允许 Remote Arc 写入的位置。",
    },
    list: {
      ordered: true,
      items: [
        {
          en: "Install Claude Code or Codex on the computer and sign in once there, with your own subscription or API key. Remote Arc never sees your agent login.",
          zh: "在那台电脑上安装 Claude Code 或 Codex，并用你自己的订阅或 API Key 登录一次。Remote Arc 不会接触你的 Agent 登录信息。",
        },
        {
          en: "Make sure the repository is inside one of the computer's trusted write locations (Dashboard, Devices).",
          zh: "确认仓库位于这台电脑的可信写入位置之内（Dashboard >“设备”）。",
        },
        {
          en: "In the Dashboard, open Agent Orchestration, choose New agent, pick the agent, write what it should do and choose the computer and repository. Add more rows to start several at once.",
          zh: "在 Dashboard 中打开“Agent 编排”，点击“新建 Agent”，选择 Agent，写下要做的事，再选择电脑和仓库。添加更多行即可同时启动多个。",
        },
      ],
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
          en: "Each agent runs in its own non-interactive mode: Claude Code accepts file edits but asks before anything else, and Codex runs in its workspace-write sandbox. Neither skips its permission checks.",
          zh: "每个 Agent 都以自己的非交互模式运行：Claude Code 只自动接受文件修改，其他操作仍需确认；Codex 在 workspace-write 沙箱中运行。两者都不会跳过自己的权限检查。",
        },
        {
          en: "Your message reaches the agent through a file, never through a command line.",
          zh: "你的消息通过文件传给 Agent，从不出现在命令行中。",
        },
        {
          en: "The agent works in its worktree. Your own checkout is untouched; merge the branch when you are happy with it.",
          zh: "Agent 只在自己的 worktree 中工作，你的工作目录不受影响；满意后再合并它的分支。",
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
      en: "Every plan can run agents; plans differ in how many start at once.",
      zh: "所有套餐都能运行 Agent，区别在于一次能同时启动多少个。",
    },
    list: {
      items: [
        {
          en: "Free: one agent at a time, which shares Free's single background command.",
          zh: "Free：一次运行一个 Agent，与 Free 的 1 个后台命令共用。",
        },
        {
          en: "Pro and Max: start up to five agents in one go, on one computer or across several, and run as many at once as the plan's background commands allow.",
          zh: "Pro 和 Max：一次最多启动 5 个 Agent，可以在一台电脑上，也可以分布到多台电脑；同时运行的数量以套餐的后台命令数为上限。",
        },
        {
          en: "Remote Arc charges nothing per run: the agents use your own Claude or OpenAI subscription.",
          zh: "Remote Arc 不按次收费：Agent 使用的是你自己的 Claude 或 OpenAI 订阅。",
        },
      ],
    },
  },
];
