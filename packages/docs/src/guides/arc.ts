import type { DocSection } from "../catalog.js";

export const arcSections: DocSection[] = [
  {
    heading: { en: "Arc and Connect", zh: "Arc 与 Connect" },
    text: {
      en: "Arc is the hosted personal agent in the Remote Arc workspace. It chats, uses real tools on your Apps and computers, and saves one-off Tasks and repeating Routines. Connect is the other entry point: it brings your own AI client to the same Apps and computers through MCP.",
      zh: "Arc 是 Remote Arc 工作空间里的托管个人智能体，可以对话、在你的应用和电脑上使用真实工具，并保存一次性 Task 和重复的 Routine。Connect 是另一个入口：通过 MCP 把你自己的 AI 客户端接到同样的应用和电脑上。",
    },
    paragraphs: [
      {
        en: "With Arc you do not supply a model API key; Remote Arc runs the model and measures use in Arc Credits. With Connect, your AI client does the reasoning and Remote Arc counts tool calls instead. Connect calls have their own allowance on Free and are unlimited on paid plans.",
        zh: "使用 Arc 时，你不需要提供模型 API Key：模型由 Remote Arc 运行，用量以 Arc Credits 计量。使用 Connect 时，推理由你的 AI 客户端完成，Remote Arc 计算的是工具调用次数。Free 的 Connect 调用有独立额度，付费套餐不限次数。",
      },
    ],
  },
  {
    heading: { en: "Models and Credits", zh: "模型与 Credits" },
    text: {
      en: "Auto chooses a model for each piece of work, so you can start without picking one. Pro and Max add further configured models; which ones are available, and their rates, are shown in Chat.",
      zh: "Auto 会为每项工作选择模型，你不必先挑模型。Pro 和 Max 提供更多已配置的模型，可用范围和费率显示在 Chat 中。",
    },
    list: {
      items: [
        { en: "Longer conversations use more Credits.", zh: "对话越长，消耗的 Credits 越多。" },
        {
          en: "More agent steps in one run use more Credits.",
          zh: "一次运行中执行步骤越多，消耗越多。",
        },
        {
          en: "Higher-priced models use more Credits per step.",
          zh: "价格更高的模型，每一步消耗更多。",
        },
      ],
    },
    paragraphs: [
      {
        en: "Before a larger task, check your remaining Credits and the per-run limits in Settings → Plan & usage.",
        zh: "开始较大的任务前，可以在设置 → 套餐与用量中查看剩余 Credits 和单次运行限制。",
      },
    ],
  },
  {
    heading: { en: "Your computers", zh: "你自己的电脑" },
    text: {
      en: "Arc can look at the computers you have paired and choose an eligible one for a task, using the same rules as the device fleet: required tools, platform and trusted folder first, then current load.",
      zh: "Arc 可以查看你已配对的电脑，并为任务选择符合条件的一台，规则与设备调度相同：先看所需工具、平台和可信目录，再看当前负载。",
    },
    paragraphs: [
      {
        en: "Arc does not assume a project exists on another computer and does not move files between computers. Whichever computer is chosen enforces its own current local policy.",
        zh: "Arc 不会假设另一台电脑上也有同一个项目，也不会在电脑之间搬移文件。无论选中哪台电脑，都按它当前的本地策略执行。",
      },
    ],
  },
  {
    heading: { en: "Your 14-day trial", zh: "14 天试用" },
    text: {
      en: "Activate the trial yourself in Arc Chat. It includes 200 Credits and starts only when you confirm. No card is needed and nothing is charged automatically.",
      zh: "在 Arc Chat 中主动开启试用，包含 200 Credits，只有你确认后才开始。无需信用卡，也不会自动扣费。",
    },
    list: {
      items: [
        {
          en: "Refreshing the page or activating again does not extend the trial.",
          zh: "刷新页面或再次开启都不会延长试用。",
        },
        {
          en: "Daily, model and per-run limits still apply during the trial.",
          zh: "试用期间，每日、模型和单次运行上限仍然适用。",
        },
        {
          en: "When the trial ends, new hosted model runs stop. Existing results and connections stay.",
          zh: "试用结束后，新的托管模型运行会停止，已有结果和连接保留。",
        },
        {
          en: "Connect keeps its own allowance throughout.",
          zh: "Connect 始终使用自己的独立额度。",
        },
      ],
    },
  },
  {
    heading: { en: "Plans, billing and top-ups", zh: "套餐、账单与充值" },
    text: {
      en: "Settings → Plan & usage shows your plan, available and reserved Credits, Connect calls and model rates. Stripe handles checkout, payment methods, invoices and cancellation.",
      zh: "设置 → 套餐与用量显示你的套餐、可用与预留的 Credits、Connect 调用和模型费率。结账、付款方式、发票和取消订阅由 Stripe 处理。",
    },
    list: {
      items: [
        {
          en: "Monthly plan Credits expire at the end of the paid period.",
          zh: "套餐每月的 Credits 在已付账期结束时到期。",
        },
        {
          en: "Top-ups do not expire, but using them needs an active paid Arc subscription.",
          zh: "充值的额度不设到期日，但使用时需要有效的 Arc 付费订阅。",
        },
        {
          en: "Plan changes take effect at the next billing cycle.",
          zh: "套餐变更从下一个账期生效。",
        },
        {
          en: "Credits are granted only after the payment is verified, not when the checkout page returns.",
          zh: "支付经核验后才发放 Credits，结账页面跳回本身不会发放。",
        },
        {
          en: "A refund revokes the unused purchased allowance. There are no automatic overage charges.",
          zh: "退款会撤销未使用的已购额度。不会自动收取超额费用。",
        },
      ],
    },
  },
  {
    heading: { en: "AI teams (Beta)", zh: "AI 团队（Beta）" },
    text: {
      en: "AI teams let you create several agents, each with a name, avatar, role, model and scoped access, and talk to them one to one or in a group conversation.",
      zh: "AI 团队可以创建多个智能体，每个都有名字、头像、职责、模型和限定的访问范围，你可以和它们单聊或群聊。",
    },
    paragraphs: [
      {
        en: "You can also ask Arc in Chat to prepare an agent. Arc shows an editable profile card; nothing is created until you confirm, and creating a profile does not start any work.",
        zh: "也可以在 Chat 里让 Arc 准备一个智能体。Arc 会展示可编辑的资料卡，你确认前不会创建；创建资料也不会自动开始工作。",
      },
      {
        en: "Agent messages and the handoffs they are allowed to make stay visible to you. Teams share your account’s Credits and plan limits; they do not need a separate budget, a deadline or overnight tasks.",
        zh: "智能体之间的消息和它们被允许的交接，你都能看到。团队共用账号的 Credits 和套餐限制，不需要单独的预算、截止时间或隔夜任务。",
      },
    ],
  },
  {
    heading: { en: "Arc in Slack", zh: "在 Slack 中使用 Arc" },
    text: {
      en: "The Remote Arc bot is another way to talk to Arc, from Slack. Each Slack user links their own Arc account, and separate Slack threads keep separate task contexts. The Slack guide covers setup.",
      zh: "Remote Arc Bot 让你在 Slack 里和 Arc 对话。每位 Slack 用户关联自己的 Arc 账号，不同的 Slack 线程保留各自的任务上下文。设置方法见 Slack 指南。",
    },
  },
];
