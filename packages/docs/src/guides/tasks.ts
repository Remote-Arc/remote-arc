import type { DocSection } from "../catalog.js";

export const tasksSections: DocSection[] = [
  {
    heading: { en: "Tasks and Routines in Arc", zh: "Arc 中的 Task 与 Routine" },
    text: {
      en: "A Task is one piece of work saved to run now or later. A Routine is work that repeats on a schedule. You create both by describing them in Arc Chat; there is no configuration form.",
      zh: "Task 是一项保存下来、现在或稍后执行的工作；Routine 是按计划重复执行的工作。两者都在 Arc Chat 里用自然语言描述创建，不需要填写配置表单。",
    },
    list: {
      ordered: true,
      items: [
        {
          en: "Describe the result, the accounts or computer to use, and when it should run. For example: “Every weekday at 8:30 Auckland time, summarize the new GitHub issues on my repo.”",
          zh: "说明想要的结果、要用的账号或电脑，以及运行时间。例如：“每个工作日奥克兰时间 8:30，汇总我仓库里新的 GitHub Issue。”",
        },
        {
          en: "Arc asks for anything missing, such as a timezone or which account to use.",
          zh: "Arc 会追问缺少的信息，例如时区或使用哪个账号。",
        },
        {
          en: "Arc saves the work with a real tool call. Open Tasks to see one-off and recurring work, its status and each run’s result.",
          zh: "Arc 通过真实的工具调用保存工作。打开 Tasks，可以看到一次性和重复工作、它们的状态以及每次运行结果。",
        },
      ],
    },
  },
  {
    heading: { en: "Timing", zh: "时间设置" },
    text: {
      en: "A Routine runs either at a local time of day or at a fixed interval.",
      zh: "Routine 可以按每天的本地时间运行，也可以按固定间隔运行。",
    },
    list: {
      items: [
        {
          en: "Daily: a local time, optional weekdays and an explicit IANA timezone such as Pacific/Auckland or Asia/Shanghai.",
          zh: "每日：本地时间、可选的星期几，以及明确的 IANA 时区，例如 Pacific/Auckland 或 Asia/Shanghai。",
        },
        { en: "Interval: every 15 minutes or longer.", zh: "间隔：每 15 分钟或更长。" },
      ],
    },
    paragraphs: [
      {
        en: "Daylight saving is handled by the timezone. A local time that does not exist on the day the clocks go forward is skipped; a local time that occurs twice when they go back runs once.",
        zh: "夏令时由时区自动处理：时钟拨快那天不存在的本地时间会跳过，时钟拨回时重复出现的本地时间只运行一次。",
      },
    ],
  },
  {
    heading: { en: "What every run checks", zh: "每次运行都会检查什么" },
    text: {
      en: "A saved Routine does not keep the permissions it had when it was created. Each run starts fresh.",
      zh: "保存的 Routine 不会沿用创建时的权限，每次运行都重新开始检查。",
    },
    list: {
      items: [
        {
          en: "Your account’s current permissions and the App connections the work uses.",
          zh: "账号当前权限，以及工作所用的应用连接。",
        },
        { en: "A fresh model budget for that run.", zh: "本次运行的模型预算（每次重新计算）。" },
        {
          en: "For computer work: the device is online and still allows the tools the work needs.",
          zh: "电脑上的工作：设备在线，并且仍允许所需的工具。",
        },
      ],
    },
    note: {
      en: "Hosted Arc execution needs the platform to be configured for your account; Chat shows whether it is available.",
      zh: "Arc 托管执行需要平台为你的账号完成配置，Chat 会显示是否可用。",
    },
  },
  {
    heading: { en: "Results, stopping and pausing", zh: "结果、停止与暂停" },
    text: {
      en: "Messages, tool results and run status are saved with the work, so you can read what happened in each run after the fact.",
      zh: "消息、工具结果和运行状态随工作一起保存，事后可以查看每次运行发生了什么。",
    },
    list: {
      items: [
        {
          en: "Stop the current run from Chat. Stopping prevents further dispatch; an external action already sent may still complete.",
          zh: "在 Chat 中停止当前运行。停止会阻止新的派发，已经发出的外部操作仍可能完成。",
        },
        {
          en: "Ask Arc to pause, resume or change saved work.",
          zh: "让 Arc 暂停、恢复或修改已保存的工作。",
        },
        {
          en: "If a run fails, or a write cannot be confirmed, the Routine pauses for you to inspect instead of silently repeating a write that may already have happened.",
          zh: "如果某次运行失败，或写入结果无法确认，Routine 会暂停等你检查，避免悄悄重复一个可能已经发生的写入。",
        },
      ],
    },
  },
  {
    heading: { en: "Saved work through Connect", zh: "通过 Connect 保存的工作" },
    text: {
      en: "Connect, used from your own AI client, saves a different kind of work: a fixed plan of commands with a trigger. It runs without a model, so it cannot change its approach when something unexpected happens.",
      zh: "在你自己的 AI 客户端里通过 Connect 保存的，是另一类工作：带触发条件的一组固定命令。它不调用模型运行，所以遇到意外情况时不会改变做法。",
    },
    paragraphs: [
      {
        en: "Use Arc when each run needs fresh judgment, and Connect when the steps are already known. The long-running work guide compares the two and lists the Connect modes.",
        zh: "每次运行都需要重新判断时用 Arc；步骤已经确定时用 Connect。持续工作指南对比了两者，并列出 Connect 的各种模式。",
      },
    ],
  },
];
