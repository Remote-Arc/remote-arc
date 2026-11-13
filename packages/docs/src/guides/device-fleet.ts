import type { DocSection } from "../catalog.js";

export const deviceFleetSections: DocSection[] = [
  {
    heading: { en: "How a computer is chosen", zh: "如何选出一台电脑" },
    text: {
      en: "When you do not name a computer, Remote Arc picks one in two passes. The first pass removes every computer that cannot do the work. The second pass ranks the rest by how busy they are.",
      zh: "你没有指定电脑时，Remote Arc 分两步选择：第一步排除所有无法完成这项工作的电脑，第二步按繁忙程度给剩下的电脑排序。",
    },
    paragraphs: [
      {
        en: "An offline or unauthorized computer is never used as a fallback. If no computer passes the first step, the request fails with the reason instead of running somewhere it should not.",
        zh: "离线或无权使用的电脑永远不会作为备选。如果没有电脑通过第一步，请求会带着原因失败，而不是在不该运行的地方运行。",
      },
    ],
  },
  {
    heading: { en: "Step 1: filter by permission and capability", zh: "第一步：按权限和能力筛选" },
    text: {
      en: "Only computers in your account that are online and not paused are considered. Each one is then checked against what the work needs.",
      zh: "只考虑你账号中在线且未暂停的电脑，再逐台核对工作所需的条件。",
    },
    list: {
      items: [
        {
          en: "The required tools are enabled on that computer. Starting a process also needs the status, output and stop tools, so the work can be followed and ended.",
          zh: "所需工具已在该电脑上开启。启动进程还需要状态、输出和停止工具，以便跟进和结束这项工作。",
        },
        {
          en: "The operating system matches, if the work needs one.",
          zh: "如有要求，操作系统需要匹配。",
        },
        {
          en: "The working folder is inside a trusted location on that computer.",
          zh: "工作目录位于该电脑的可信目录内。",
        },
        {
          en: "For saved and scheduled work, the computer has the matching task permissions.",
          zh: "保存的工作和定时工作，还需要该电脑具备相应的任务权限。",
        },
      ],
    },
  },
  {
    heading: { en: "Step 2: rank by current load", zh: "第二步：按当前负载排序" },
    text: {
      en: "The remaining computers are ranked using signals about the work they are already doing.",
      zh: "剩下的电脑按它们正在承担的工作排序，参考以下信号：",
    },
    list: {
      items: [
        {
          en: "Active tasks, recent interactive activity and managed processes.",
          zh: "活动任务、近期交互操作和受管进程。",
        },
        { en: "CPU and memory use.", zh: "CPU 与内存占用。" },
        { en: "How stable the connection has been.", zh: "连接的稳定程度。" },
      ],
    },
    paragraphs: [
      {
        en: "A capacity sample older than two minutes is treated as unknown, not as idle, so a computer that stopped reporting is not mistaken for a free one.",
        zh: "超过两分钟的负载样本视为未知，而不是空闲，避免把停止上报的电脑误判为空闲。",
      },
      {
        en: "Windows and WSL Agents on the same physical machine are counted together, so the same hardware is not counted twice.",
        zh: "同一台物理机上的 Windows 与 WSL Agent 合并计算，避免同一份硬件被算两次。",
      },
    ],
  },
  {
    heading: { en: "Ask for it from your AI", zh: "在 AI 中使用" },
    text: {
      en: "Ask your MCP client to choose a suitable computer, or ask Arc when its hosted workspace is enabled. The more you state, the narrower the choice.",
      zh: "让你的 MCP 客户端选择合适的电脑，或在 Arc 托管工作空间可用时直接对 Arc 说。说明的条件越多，选择范围越精确。",
    },
    list: {
      items: [
        { en: "The operating system the work needs.", zh: "工作需要的操作系统。" },
        { en: "Where the project lives on disk.", zh: "项目在磁盘上的位置。" },
        { en: "Tools the work must use.", zh: "工作必须使用的工具。" },
        { en: "A minimum amount of free memory.", zh: "最低可用内存。" },
      ],
    },
    note: {
      en: "Scheduling chooses where work runs. It does not copy a project to another computer, and it never retries an external write with an unknown outcome on a second machine.",
      zh: "调度只决定工作在哪里运行，不会把项目复制到另一台电脑，也不会把结果不明的外部写入换到第二台机器上重试。",
    },
  },
];
