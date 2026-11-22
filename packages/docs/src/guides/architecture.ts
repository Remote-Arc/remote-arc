import type { DocSection } from "../catalog.js";

export const architectureSections: DocSection[] = [
  {
    heading: { en: "Models decide, Remote Arc executes", zh: "模型做决定，Remote Arc 负责执行" },
    text: {
      en: "Remote Arc separates reasoning from execution. A model, whether Arc’s hosted model or your own AI client through Connect, reads the request, plans, picks a tool and judges what came back. It never calls an App API or runs a local command itself.",
      zh: "Remote Arc 把推理和执行分开。无论是 Arc 的托管模型，还是通过 Connect 接入的你自己的 AI 客户端，模型负责理解请求、规划、选择工具并判断返回结果；它本身从不直接调用应用 API 或运行本地命令。",
    },
    paragraphs: [
      {
        en: "Everything around those decisions is the runtime’s job: account context, Skill references, memory retrieval, authorization, argument schemas, dispatch, persistence, scheduling and cost accounting. That is also why completion has to be shown by evidence that came back through the execution path. A model saying the work is done is not enough.",
        zh: "围绕这些决定的其余部分都由运行时负责：账号上下文、技能引用、记忆检索、授权、参数 Schema、派发、持久化、调度和成本核算。也正因如此，完成必须由执行链路返回的证据来证明，仅凭模型说“完成了”并不足够。",
      },
    ],
  },
  {
    heading: { en: "Following one request", zh: "一次请求的完整路径" },
    text: {
      en: "This is what happens between sending a message and getting a result:",
      zh: "从发出消息到拿到结果，中间依次发生这些事：",
    },
    list: {
      ordered: true,
      items: [
        {
          en: "A signed-in request creates a run record that is saved before any work starts.",
          zh: "已登录的请求先创建一条运行记录，在任何工作开始前保存下来。",
        },
        {
          en: "The runtime assembles bounded context: the recent conversation, earlier observations, available connections and relevant memories.",
          zh: "运行时组装有界上下文：近期对话、先前的观察、可用连接和相关记忆。",
        },
        {
          en: "The model returns a decision. The decision is validated against the tool’s schema before anything else happens.",
          zh: "模型返回一个决定，这个决定先按工具 Schema 校验，然后才进行后续步骤。",
        },
        {
          en: "The server checks ownership, entitlement, the arguments and current permissions, then dispatches the call to the App adapter or the device.",
          zh: "服务端核对归属、额度、参数和当前权限，然后把调用派发给应用适配器或设备。",
        },
        {
          en: "The provider’s response or the device’s observation becomes context for the next decision.",
          zh: "服务商响应或设备观察结果，成为下一次决定的上下文。",
        },
        {
          en: "The loop ends with a final answer, or with a recorded failure, limit or uncertain outcome.",
          zh: "循环以最终答复结束，或以记录在案的失败、上限或不确定结果结束。",
        },
      ],
    },
    note: {
      en: "One successful tool call does not prove the whole goal was achieved. The final answer has to be supported by the observations collected along the way.",
      zh: "一次工具调用成功，不能证明整个目标已经达成；最终答复需要由一路收集的观察结果支撑。",
    },
  },
  {
    heading: { en: "The cloud side", zh: "云端部分" },
    text: {
      en: "The control plane runs on Cloudflare. Each part has one job:",
      zh: "控制面运行在 Cloudflare 上，各部分分工如下：",
    },
    list: {
      items: [
        {
          en: "Workers serve the authenticated API and the MCP endpoint, and authenticate both the account and the AI client.",
          zh: "Worker 提供需认证的 API 和 MCP 端点，同时验证账号和 AI 客户端。",
        },
        {
          en: "Durable Objects run each Arc conversation one step at a time and route live requests to a device over its connection.",
          zh: "Durable Object 逐步推进每个 Arc 对话，并通过设备连接把实时请求路由到设备。",
        },
        {
          en: "D1 stores account authorization, encrypted conversation content, Skills, selected memories, task state and usage ledgers.",
          zh: "D1 保存账号授权、加密的对话内容、技能、选择保存的记忆、任务状态和用量账本。",
        },
        {
          en: "App adapters validate typed operations and call providers with server-held, encrypted credentials, within the scopes the provider granted.",
          zh: "应用适配器校验类型化操作，使用服务端保存的加密凭证，在服务商授予的范围内调用服务商。",
        },
      ],
    },
    paragraphs: [
      {
        en: "Adapters keep a stable request identity for each action, respect account boundaries and record unknown outcomes rather than guessing. Data that comes back from an App, and the text of a Skill, are treated as untrusted observations: they can inform the next decision, but they cannot add instructions or permissions.",
        zh: "适配器为每个操作保留稳定的请求标识，遵守账号边界，并如实记录不明结果而不是猜测。应用返回的数据和技能文本都被视为不可信的观察：它们可以作为下一步决定的参考，但不能增加指令或权限。",
      },
    ],
  },
  {
    heading: { en: "The computer side", zh: "电脑端部分" },
    text: {
      en: "On each paired computer, a native Go Agent opens an authenticated outbound WebSocket to the relay. No public inbound port, router forwarding or VPN is needed.",
      zh: "每台已配对电脑上，原生 Go Agent 主动向 Relay 建立需认证的出站 WebSocket 连接，不需要公网入站端口、路由器端口转发或 VPN。",
    },
    paragraphs: [
      {
        en: "Inside the Agent, the Execution Core carries out file and process tools and enforces the local boundaries: which tools are enabled, which folders may be written, which paths are protected, and the operating system’s own permissions for your user account. Commands run with your installed software, as your OS user.",
        zh: "Agent 内部由 Execution Core 执行文件和进程工具，并落实本地边界：哪些工具已开启、哪些目录可写、哪些路径受保护，以及操作系统对你这个用户账号本身的权限。命令使用你已安装的软件、以你的系统用户身份运行。",
      },
    ],
  },
  {
    heading: { en: "Saved work and choosing a device", zh: "持久工作与设备调度" },
    text: {
      en: "A leased scheduler advances saved work on its own, so nothing depends on a browser tab staying open. Arc Routines start bounded hosted model runs; Connect’s saved tasks carry out a fixed, approved plan without a model.",
      zh: "带租约的调度器独立推进已保存的工作，不依赖浏览器标签页保持打开。Arc Routine 启动有界的托管模型运行；Connect 保存的任务则不调用模型，按固定且已批准的计划执行。",
    },
    paragraphs: [
      {
        en: "When the device is not named, placement filters by ownership, online status, tools, platform and trusted folder, then weighs fresh capacity and active work. It never moves a project, wakes a powered-off machine or replays an unconfirmed write on another computer.",
        zh: "未指定设备时，调度先按归属、在线状态、工具、平台和可信目录筛选，再权衡实时负载和正在进行的工作。它不会搬迁项目、唤醒已关机的电脑，也不会在另一台电脑上重放结果未确认的写入。",
      },
    ],
  },
  {
    heading: { en: "Context, memory and cost", zh: "上下文、记忆与成本" },
    text: {
      en: "Within one conversation, Arc keeps the relevant goals, arguments, observations and IDs it has discovered. Discovery results can be reused briefly to avoid repeat calls, but every action checks its authorization again at the moment it runs.",
      zh: "在同一对话内，Arc 保留相关的目标、参数、观察结果和已发现的 ID。发现结果可以短时复用以减少重复调用，但每个操作在执行时都会重新核验授权。",
    },
    paragraphs: [
      {
        en: "Memory across conversations is limited to short personal notes and recent-work summaries that you can inspect and delete. It does not mirror your devices, and the full history is not sent with every model call.",
        zh: "跨对话的记忆只包括简短的个人笔记和近期工作摘要，你可以查看和删除。它不会镜像你的设备，也不会在每次模型调用时发送全部历史。",
      },
      {
        en: "Every model request reserves budget before it is sent and settles the reported usage afterwards; a call with an uncertain outcome keeps its reservation. Your Credits, per-run limits and Remote Arc’s operating budget all bound cost, and no provider account is recharged automatically.",
        zh: "每次模型请求在发出前先预留预算，结束后按报告的用量结算；结果不确定的调用会保留预留。你的 Credits、单次运行限制和 Remote Arc 的运营预算共同限制成本，不会自动给任何服务商账号充值。",
      },
    ],
  },
  {
    heading: { en: "What is built and how it is tested", zh: "已实现的能力与测试方式" },
    text: {
      en: "Arc Chat, Apps, Skill import, saved Tasks and Routines are implemented. AI teams, agent profiles, direct chats and group conversations are available as Beta. Each App supports its published operations, not every feature of the provider, and generation needs a real supported backend.",
      zh: "Arc Chat、Apps、技能导入、保存的 Task 和 Routine 已经实现；AI 团队、智能体资料、单聊和群聊以 Beta 形式提供。每个应用只支持已公布的操作，不代表覆盖服务商全部功能；生成任务需要真实受支持的后端。",
    },
    list: {
      items: [
        {
          en: "Deterministic tests cover permissions, schema correction, duplicate prevention, interrupted runs, schedules and budgets.",
          zh: "确定性测试覆盖权限、参数修正、防重复、运行中断、调度和预算。",
        },
        {
          en: "Protected acceptance runs a real model against synthetic mail, GitHub issues, ready and failed deployments, a saved Task through its scheduled run, and an imported Skill producing its specified result.",
          zh: "受保护的验收用真实模型处理模拟邮件、GitHub Issue、成功和失败的部署，跑通一个已保存 Task 的定时执行，并检查一个导入技能是否产出规定的结果。",
        },
      ],
    },
    note: {
      en: "These tests prove the paths they exercise. They do not prove that every customer account, provider incident or possible goal will succeed.",
      zh: "这些测试证明的是被测试的执行路径，不能证明所有客户账号、服务商故障情形或任意目标都能成功。",
    },
  },
];
