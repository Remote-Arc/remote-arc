import type { DocSection } from "../catalog.js";

export const startHereSections: DocSection[] = [
  {
    heading: { en: "Two ways in, one account", zh: "两个入口，同一个账号" },
    text: {
      en: "Remote Arc has two entry points that share the same account, App connections, paired computers and execution controls. Which one you use depends on where you want the reasoning to happen.",
      zh: "Remote Arc 有两个入口，共用同一个账号、应用连接、已配对电脑和执行控制。选哪个入口，取决于你希望推理在哪里进行。",
    },
    list: {
      items: [
        {
          en: "Arc is the hosted personal agent at agent.remotearc.app. Remote Arc runs the model for you, so you do not need a model API key. Activate the 14-day Auto trial, or choose Pro / Max on the dedicated checkout page linked from Plan & usage.",
          zh: "Arc 是 agent.remotearc.app 上的托管个人智能体。模型由 Remote Arc 运行，你不需要模型 API Key。可以开启 14 天 Auto 试用，或从“套餐与用量”进入独立支付页选择 Pro / Max。",
        },
        {
          en: "Connect exposes your authorized Apps and computers to an AI client you already use, such as ChatGPT, Claude, Cursor or Codex, through one Remote MCP endpoint. Your client does the reasoning; Remote Arc checks permissions and carries out the tool calls.",
          zh: "Connect 通过一个 Remote MCP 端点，把已授权的应用和电脑提供给你已经在用的 AI 客户端，例如 ChatGPT、Claude、Cursor 或 Codex。推理由你的客户端完成，Remote Arc 负责核对权限并执行工具调用。",
        },
      ],
    },
    paragraphs: [
      {
        en: "You can use both. A device paired once is available to Arc and to every AI client you authorize, and revoking an App, a device or a client grant takes effect for both entry points.",
        zh: "两个入口可以同时使用。电脑只需配对一次，Arc 和你授权的每个 AI 客户端都能使用；撤销应用、设备或客户端授权，对两个入口同时生效。",
      },
    ],
  },
  {
    heading: { en: "Connect what the goal needs", zh: "连接目标所需的能力" },
    text: {
      en: "Start from the result you want, then connect only the capability that produces it. Cloud work and computer work have different requirements.",
      zh: "先想清楚要什么结果，再只连接产生这个结果所需的能力。云端工作和电脑上的工作，要求不同。",
    },
    list: {
      ordered: true,
      items: [
        {
          en: "For email, a repository, a calendar or another online service, open Apps and connect that account. Cloud App actions run from Remote Arc and do not need a computer.",
          zh: "处理邮件、代码仓库、日历或其他在线服务时，打开 Apps 连接对应账号。云端应用操作由 Remote Arc 直接执行，不需要电脑。",
        },
        {
          en: "For local files, commands or installed software, install the Agent on that computer, pair it, and choose its allowed tools and trusted folders. New devices start with read-oriented tools.",
          zh: "处理本地文件、命令或已安装软件时，在那台电脑上安装 Agent 并配对，再选择允许的工具和可信目录。新设备默认只开启偏读取的工具。",
        },
        {
          en: "Ask for a concrete result, for example “Summarize recent inbox messages and list what I need to do” or “Check the latest deployment of my web project”.",
          zh: "提出具体结果，例如“汇总最近收件箱的重点，列出我要处理的事”，或“检查我 web 项目的最新部署”。",
        },
      ],
    },
    note: {
      en: "A successful connection check only proves the account is reachable. Arc needs the actual messages or deployment evidence to answer, so a connected App is not the same as finished work.",
      zh: "连接检查成功只说明账号可以访问。Arc 需要读到实际邮件或部署证据才能回答，所以“已连接”不等于工作已完成。",
    },
  },
  {
    heading: { en: "Reuse a method with Skills and @", zh: "用技能和 @ 复用工作方法" },
    text: {
      en: "A Skill is a written method for a kind of result, such as a website preview, a source-based report or a deployment check. Open Skills to pick a workflow or import a SKILL.md, then type @ in Chat to attach Skills or connected App accounts to your message as badges.",
      zh: "技能是一类结果的工作方法，例如网站预览、基于来源的报告或部署检查。打开 Skills 选择工作流或导入 SKILL.md，然后在聊天里输入 @，把技能或已连接的应用账号以 badge 形式附到消息上。",
    },
    paragraphs: [
      {
        en: "Choosing a workflow does not paste its instructions into your message. The reference is saved with the message and Arc reads the Skill when it plans the work.",
        zh: "选择工作流不会把内部指令粘贴进输入框。引用会随消息保存，Arc 在规划工作时读取技能内容。",
      },
      {
        en: "A Skill supplies a method only. It does not install engines, download repository files or add dependencies, and image or video creation still needs a connected, supported generation capability.",
        zh: "技能只提供方法，不会安装引擎、下载仓库文件或添加依赖。图片、视频创作仍需要已连接且受支持的生成能力。",
      },
    ],
  },
  {
    heading: { en: "Save work that should continue", zh: "需要持续的工作交给 Tasks" },
    text: {
      en: "When work should happen later or repeat, ask Arc to save it as a one-off Task or a repeating Routine. Say the goal, the accounts or computer to use, and the timing; for a daily routine include the time and timezone.",
      zh: "工作需要稍后执行或重复执行时，让 Arc 把它保存为一次性 Task 或重复的 Routine。说明目标、要用的账号或电脑，以及时间；每日 Routine 还要给出时间和时区。",
    },
    paragraphs: [
      {
        en: "Tasks keeps the saved work, the next run and each result together. Every run checks current access, permissions and budget again, so a permission you revoke after saving still applies.",
        zh: "Tasks 页面把已保存的工作、下次运行和每次结果放在一起。每次运行都会重新检查当前访问权限和预算，保存之后撤销的权限同样生效。",
      },
      {
        en: "If a run fails, or an action’s outcome cannot be confirmed, repeating work pauses for you to inspect instead of trying the same write again.",
        zh: "如果某次运行失败，或无法确认操作结果，重复工作会暂停等你检查，而不是再次尝试同一个写入。",
      },
    ],
    note: {
      en: "Creating a schedule is not evidence that its first run succeeded. Check the run result in Tasks.",
      zh: "创建计划成功不代表首轮已经完成，请在 Tasks 中查看运行结果。",
    },
  },
  {
    heading: { en: "Check the result and stay in control", zh: "核对结果，掌控执行" },
    text: {
      en: "Chat shows a compact working indicator and the final answer. Open Activity when you need the individual tool calls and their outcomes.",
      zh: "聊天里显示简洁的工作状态和最终答复；需要查看每个工具调用及其结果时，打开 Activity。",
    },
    list: {
      items: [
        {
          en: "Before relying on important work, open the returned links, files or provider results yourself.",
          zh: "重要工作在使用前，亲自打开返回的链接、文件或服务商结果核对。",
        },
        {
          en: "Missing permissions, an offline device, a missing engine and an exhausted budget are reported as blockers, not as success.",
          zh: "权限不足、设备离线、缺少引擎或预算耗尽，会作为阻碍报告，而不是当作成功。",
        },
        {
          en: "Stop prevents further dispatch. An action that was already sent may still finish.",
          zh: "停止会阻止新的派发；已经发出的操作仍可能完成。",
        },
        {
          en: "Review or remove personal memories in Settings, and revoke App or device access separately.",
          zh: "在设置中查看或删除个人记忆，应用和设备访问可以分别撤销。",
        },
      ],
    },
  },
];
