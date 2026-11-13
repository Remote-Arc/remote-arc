import type { DocSection } from "../catalog.js";

export const codexSections: DocSection[] = [
  {
    heading: {
      en: "Add Remote Arc in the Codex desktop app",
      zh: "在 Codex 桌面应用中添加 Remote Arc",
    },
    text: {
      en: "The Codex desktop app, CLI and IDE extension share one configuration, so adding Remote Arc in any of them makes it available in all three.",
      zh: "Codex 桌面应用、CLI 和 IDE 扩展共用同一份配置，在任意一个中添加 Remote Arc，三者都能使用。",
    },
    list: {
      ordered: true,
      items: [
        {
          en: "Open Codex Settings → Integrations and MCP.",
          zh: "打开 Codex 设置 → Integrations and MCP。",
        },
        {
          en: "Add a Streamable HTTP server with the URL https://mcp.remotearc.app/mcp.",
          zh: "添加 Streamable HTTP 服务，地址填 https://mcp.remotearc.app/mcp。",
        },
        {
          en: "Complete the OAuth sign-in and approve the Remote Arc permissions you intend to use.",
          zh: "完成 OAuth 登录，并批准你打算使用的 Remote Arc 权限。",
        },
      ],
    },
  },
  {
    heading: { en: "Add it from the CLI", zh: "用 CLI 添加" },
    text: {
      en: "From a terminal, add the server and sign in with two commands:",
      zh: "在终端中用两条命令添加服务并登录：",
    },
    list: {
      ordered: true,
      items: [
        {
          en: "codex mcp add remote-arc --url https://mcp.remotearc.app/mcp",
          zh: "codex mcp add remote-arc --url https://mcp.remotearc.app/mcp",
        },
        { en: "codex mcp login remote-arc", zh: "codex mcp login remote-arc" },
      ],
    },
    paragraphs: [
      {
        en: "Check the result with codex mcp list, or with /mcp inside a CLI chat. After you change permissions, or when new tools become available, refresh the connection so Codex sees them.",
        zh: "用 codex mcp list，或在 CLI 对话中输入 /mcp 查看结果。修改权限或有新工具时，刷新连接让 Codex 看到最新状态。",
      },
    ],
    note: {
      en: "Computer tools need two things: a paired computer and an authorized AI connection. Authorizing Codex without pairing a computer leaves the computer tools unavailable.",
      zh: "电脑工具需要同时具备两样：已配对的电脑和已授权的 AI 连接。只授权 Codex 而没有配对电脑时，电脑工具不可用。",
    },
  },
];

export const slackSections: DocSection[] = [
  {
    heading: { en: "Install the bot and link your account", zh: "安装 Bot 并关联账号" },
    text: {
      en: "Using Arc in Slack takes two steps, because installing the bot in a workspace and linking your personal Arc account are separate.",
      zh: "在 Slack 中使用 Arc 需要两步，因为在工作区安装 Bot 和关联你个人的 Arc 账号是两件事。",
    },
    list: {
      ordered: true,
      items: [
        {
          en: "In Remote Arc, open Apps → Slack and add the Remote Arc bot to your Slack workspace.",
          zh: "在 Remote Arc 中打开 Apps → Slack，把 Remote Arc Bot 添加到你的 Slack 工作区。",
        },
        {
          en: "Send the bot a message, open the account-linking prompt it replies with, and sign in to Remote Arc.",
          zh: "给 Bot 发一条消息，打开它回复的账号关联提示，然后登录 Remote Arc。",
        },
      ],
    },
    paragraphs: [
      {
        en: "Each Slack user links their own account. Whether you can install the bot depends on your workspace’s policy and the app’s distribution status.",
        zh: "每位 Slack 用户分别关联自己的账号。能否安装 Bot，取决于工作区的策略和应用的分发状态。",
      },
    ],
  },
  {
    heading: { en: "The bot and the Slack App are different", zh: "Bot 和 Slack 应用连接是两回事" },
    text: {
      en: "The bot is a way to talk to your hosted Arc agent. The Slack App connection is what authorizes supported Slack operations, such as searching or posting messages.",
      zh: "Bot 是你和托管 Arc 智能体对话的入口；Slack 应用连接则用于授权搜索消息、发送消息等支持的 Slack 操作。",
    },
    paragraphs: [
      {
        en: "Installing the bot does not connect anyone’s personal Apps or computers. Cloud App work needs no paired computer, while local files or commands still need an online device with the right permissions.",
        zh: "安装 Bot 不会把任何人的个人应用或电脑接进来。云端应用工作不需要配对电脑；本地文件或命令仍需要在线且权限正确的设备。",
      },
    ],
  },
  {
    heading: { en: "One thread per task", zh: "一个线程对应一项任务" },
    text: {
      en: "Messages in your direct conversation with the bot share one Arc conversation. To keep a separate task separate, start a Slack thread: each thread maps to its own Arc conversation, and replies in it keep its context.",
      zh: "你和 Bot 私信里的普通消息共用一个 Arc 对话。想让另一项任务独立，就开一个 Slack 线程：每个线程对应独立的 Arc 对话，在线程里回复会保留它的上下文。",
    },
    paragraphs: [
      {
        en: "Links from the bot open the matching work in Remote Arc. Mentioning the bot in a channel does not make your private App or computer results public; results are delivered to you privately.",
        zh: "Bot 返回的链接可以打开 Remote Arc 中对应的工作。在频道里提及 Bot 不会公开你私人应用或电脑的结果，结果会私下发给你。",
      },
    ],
  },
  {
    heading: { en: "Credits and failed requests", zh: "Credits 与失败的请求" },
    text: {
      en: "Slack requests use your linked Arc account: its selected model, Credits and per-run limits. Slack is not a separate or unlimited allowance, and a Pro subscription does not remove per-run or provider limits.",
      zh: "Slack 请求使用你关联的 Arc 账号：它选择的模型、Credits 和单次运行限制。Slack 不是额外的或无限的额度，Pro 订阅也不会取消单次运行或服务商限制。",
    },
    paragraphs: [
      {
        en: "If a request fails, check Plan & usage and keep the Run ID and error code. When an action’s outcome is uncertain, look at the actual reply or linked result before asking again.",
        zh: "请求失败时，查看“套餐与用量”，并保留 Run ID 和错误代码。操作结果不确定时，先查看实际回复或链接的结果，再决定是否重新请求。",
      },
    ],
  },
];
