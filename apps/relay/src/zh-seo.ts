type ChineseSeoContent = {
  title: string; description: string; h1: string; intro: string;
  sections: Array<{heading: string; text: string}>;
};
export const chineseSeo: Record<string, ChineseSeoContent> = {
  "/privacy": {
    title: "隐私政策 — Remote Arc", description: "了解 Remote Arc 如何处理账户、Apps 授权、设备工具结果、Arc 对话、计费与支持信息。",
    h1: "你的工作，你的信息。", intro: "Remote Arc 隐私政策，更新于 2026 年 10 月 19 日。了解信息如何经过服务、保存哪些数据以及如何撤销访问和申请删除。",
    sections: [{heading:"连接与工作数据",text:"Connect 将授权工具请求和结果传递到你的应用、电脑与 AI 客户端。Apps 调用会加密保存参数和结果，用于状态查询与避免重复执行。开放 Arc 时，相关对话和工具观察会交给所配置的模型服务商处理。"},{heading:"你的控制权",text:"在工作空间断开应用、撤销 AI 客户端授权或移除设备。数据访问、更正和删除请求可通过支持表单或 support@remotearc.app 提交。"}]
  },
  "/terms": {
    title: "服务条款 — Remote Arc", description: "Remote Arc 的授权使用、工具操作、订阅续费、试用、Credits 和第三方费用说明。",
    h1: "让工作有据可依。", intro: "Remote Arc 服务条款，更新于 2026 年 10 月 19 日。连接工具、委托任务及选择付费方案时适用的服务约定。",
    sections: [{heading:"授权使用",text:"仅连接和操作你有权控制的账户、文件与系统。可用读写工具在第三方授权范围内启用；设备遵守本机权限。断开连接不会撤销已完成操作。"},{heading:"订阅与用量",text:"可用付费方案的价格和用量在购买前展示。月订阅持续续费至取消；试用不自动转付费。不同模型的 Credits 消耗不同，第三方账户费用另计。"}]
  },
  "/support": {
    title: "支持中心 — Remote Arc", description: "安装配对、应用授权、账户、隐私和计费帮助。使用现有反馈通道直接联系 Remote Arc。",
    h1: "帮你把工作继续下去。", intro: "查看文档，或使用支持表单告诉我们遇到的问题。支持与产品反馈进入相同的私密处理入口。",
    sections: [{heading:"提交支持请求",text:"提供联系邮箱、已尝试的步骤与不含敏感信息的错误提示。不要提交密码、API Key、访问 Token 或私人文件内容。也可联系 support@remotearc.app。"}]
  },
  "/integrations": {
    title: "Remote Arc Apps 应用目录 — 查看原生集成与连接条件",
    description: "按类别查看 Remote Arc Apps、实际支持的操作、授权方式和费用归属。Connect Apps 独立于 Arc Agent，需要完成平台配置后开放账号授权。",
    h1: "探索 Remote Arc 应用连接",
    intro: "找到应用，查看 AI 实际能做什么，以及连接前需要准备什么。Apps 通过 Remote Arc Connect 工作，独立于 Arc Agent 发布。",
    sections: [
      {heading:"实际支持的应用操作",text:"目录覆盖邮件与日历、文档与文件、开发与部署、团队沟通、社交媒体、创意 AI、营销分析及销售电商。每个集成都列出真实支持的读取与写入操作，不代表已经覆盖平台全部功能。"},
      {heading:"授权你自己的账号",text:"OAuth 应用由 Remote Arc 配置，每个用户授权自己的账号；部分集成使用用户自己的 API 凭据。连接服务启用、平台配置完成后才开放账号授权。连接后，可用读写工具默认在所授权限范围内启用。"},
      {heading:"了解用量与费用",text:"API 用量费用和额度取决于连接的账号或开发者项目，网页订阅不一定包含 API 积分。Remote Arc 的工具调用额度独立计算。请查看各应用详情及实际连接开放状态。"}
    ]
  },
  "/early-access": {
    title: "申请 Arc AI 助手抢先体验 — Remote Arc",
    description: "加入 Remote Arc 的 Arc AI 助手抢先体验名单，填写希望自动完成的工作，订阅和托管模型尚未上线。",
    h1: "申请 Arc 抢先体验",
    intro: "告诉我们你想交给 Arc 的工作。仅在你明确同意后保存联系信息，用于联系和后续产品体验。",
    sections: [{heading:"抢先体验申请",text:"提供邮箱和至少十个字符的使用场景。我们不会把联系同意视为无关营销的许可。"}]
  },
  "/feedback": {
    title: "Remote Arc 用户反馈 — 告诉我们你的使用体验",
    description: "提交 Remote Arc 的产品建议、使用问题或体验反馈，让团队了解真实用户需求。",
    h1: "告诉我们你的体验",
    intro: "有什么好用、难用或者希望增加的功能？通过表单向团队提交真实建议。",
    sections: [{heading:"反馈与隐私",text:"你主动提交的邮箱、建议及联系同意仅供内部授权管理员跟进，并支持通过客服申请删除。"}]
  },
  "/arc": {
    title: "Arc AI 助手即将推出 — Remote Arc",
    description: "认识正在开发的 Arc AI 队友：内置聊天、连接云端应用、执行可授权的定期任务。现有 Remote Arc Connect 已可用。",
    h1: "认识 Arc，你的 AI 工作队友",
    intro: "Arc 正在开发中，计划提供独立 AI 对话、云应用连接和长期任务。现阶段 Connect MCP 已可使用；Arc 的托管模型和自动任务尚未公开开放。",
    sections: [
      { heading: "Arc Chat", text: "直接在 Remote Arc 与托管 AI 对话，Auto 计划按任务质量与使用预算选择模型。" },
      { heading: "Connected Apps", text: "规划将已授权的云端应用与个人设备工具连接起来，并保留独立权限和审计。" },
      { heading: "Routines", text: "规划让用户设置可暂停、可审批、可查看证据的重复工作流程，目前仍在验证。" }
    ]
  },
  "/roadmap": {
    title:"Remote Arc 路线图 — 下一代 AI 基础设施",description:"从开放连接基础设施与个人智能体，探索垂类 SaaS Agent、智能设备管家及下一代 AI 基础设施。长期愿景不代表已承诺的上线日期。",
    h1:"Remote Arc，下一步。",intro:"从连接工具出发，走向让智能体可靠行动的共同基础。",
    sections:[{heading:"连接与个人智能体",text:"以 Connect 的应用、电脑与 AI 客户端连接为基础，构建能理解意图、协调工具并交付可核验结果的个人智能体。"},{heading:"长期探索",text:"探索为垂类 SaaS Agent 提供基础能力，以及协调兼容智能设备的通用 AI 管家。目标是建立开放互通、可靠执行的下一代 AI 基础设施，不承诺具体发布时间。"}]
  },
  "/remote-mcp": {
    title:"Remote MCP 入门指南 — Remote Arc",description:"了解 Remote MCP 与本地 MCP 的区别，连接 ChatGPT、Claude 或 Cursor，通过授权使用应用与电脑。",
    h1:"Remote MCP Server，从概念到真正连接。",intro:"一个端点，连接你的 AI、应用与电脑。了解连接方式，选择客户端，再拿到第一个可核验的结果。",
    sections:[{heading:"先连接，再验证",text:"配对自己的电脑，在 AI 客户端添加远程 MCP 地址并完成授权。先用只读工具验证目标设备与结果，再按需开启写入与终端工具。"}]
  },
  "/connect-ai": {
    title:"连接 AI 客户端 — Remote Arc",description:"配对电脑、选择设备权限，再通过 OAuth 连接 ChatGPT、Claude、Cursor 或其他兼容 MCP 的 AI 客户端。",
    h1:"连接 AI 客户端",intro:"电脑配对与 AI 授权彼此独立，按指南完成两端设置即可开始。",
    sections:[{heading:"选择你的客户端",text:"查看 ChatGPT、Claude 或 Cursor 的安装指南，添加 https://mcp.remotearc.app/mcp 并完成账号授权。"}]
  },
  "/": {
    title: "Remote Arc — 连接 AI、应用与电脑",
    description: "Remote Arc Connect 通过安全的 MCP 连接，让 ChatGPT、Claude 等 AI 使用已授权的电脑和受支持的应用。支持跨设备工作与权限管理；Arc AI 助手即将推出。",
    h1: "别让 AI 只停留在聊天。让它在你的电脑上真正完成工作。",
    intro: "Remote Arc Connect 可连接受支持的应用和你已授权的 Windows、macOS、Linux 设备，让现有 AI 对话真正执行操作。每个应用与设备仍由独立权限控制；Arc Agent 目前尚未上线。",
    sections: [
      { heading: "你的电脑仍由你掌控", text: "设备主动连接云端中继，无需打开入站端口。按设备控制权限，必要时要求确认，并可随时撤销 AI 访问。" },
      { heading: "使用你已经熟悉的 AI", text: "在支持 Remote MCP 的 ChatGPT、Claude 或其他客户端中添加 Remote Arc，无需让 Remote Arc 接管模型、对话或 API 密钥。" },
      { heading: "任务与聊天可以分开", text: "可保存设备端长任务与执行状态，再次进入控制台继续查看。需要新 AI 判断的步骤，仍须由已连接的大模型执行。" }
    ]
  },
  "/install/chatgpt": {
    title: "ChatGPT 连接 Remote Arc 教程 — 用 AI 操作你的电脑",
    description: "按步骤将 ChatGPT 的自定义 MCP 连接器接入 Remote Arc，完成授权、设备配对与工具调用，适用于 Windows、macOS 和 Linux。",
    h1: "让 ChatGPT 连接你的电脑",
    intro: "在 Remote Arc 安装本地 Agent、配对设备，然后在 ChatGPT 添加自定义 Remote MCP 连接器并确认授权。",
    sections: [
      { heading: "安装并配对 Agent", text: "在电脑上安装 Remote Arc Agent，确认设备在 Dashboard 中上线。可使用 npx 入口，也可使用原生安装包。" },
      { heading: "在 ChatGPT 添加连接器", text: "按安装教程填写 Remote Arc 的 MCP 地址，使用 OAuth 登录并同意明确的访问范围。" },
      { heading: "测试最小权限", text: "让 ChatGPT 先读取允许访问的文件，确认设备及授权状态，再按需要开启编辑或命令执行。" }
    ]
  },
  "/install/claude": {
    title: "Claude 连接 Remote Arc 教程 — 自定义 MCP 连接器",
    description: "在 Claude 中添加 Remote Arc 自定义 Remote MCP 连接器，用 OAuth 配对自己的 Windows、macOS 或 Linux 电脑。",
    h1: "在 Claude 中连接 Remote Arc",
    intro: "在 Claude 的自定义连接器设置中添加 Remote Arc MCP 地址，然后完成账户授权及设备配对。",
    sections: [
      { heading: "添加自定义连接器", text: "打开 Claude 的连接器设置，选择添加自定义连接器，填写 Remote Arc 的 MCP 服务地址。" },
      { heading: "登录并确认访问", text: "通过 Google 或邮箱登录 Remote Arc，核对连接器访问权限，再完成授权。" },
      { heading: "从只读工具开始", text: "在 Claude 对话中检查已配对设备和可用工具，然后再按需要增加设备执行权限。" }
    ]
  },
  "/install/gemini": {
    title: "Google Gemini 连接 Remote Arc 教程 — 自定义 MCP 安装",
    description: "通过真实截图学习在 Gemini Connectors 中添加 Remote Arc，完成 Google 账户授权和设备配对，让 Gemini 安全使用电脑上的 MCP 工具。",
    h1: "在 Google Gemini 中连接 Remote Arc",
    intro: "在支持自定义 MCP 连接器的 Gemini 账户中，添加 Remote Arc MCP 地址，授权并配对电脑，即可从 Gemini 对话中使用受控设备工具。",
    sections: [
      { heading: "在 Gemini 添加自定义连接器", text: "打开 https://gemini.google.com/customize/connectors，点击 ＋ Custom，在 MCP Server URL 输入 https://mcp.remotearc.app/mcp，再点击 Next。" },
      { heading: "完成授权并保存", text: "阅读 Google 账户关联权限，完成 Remote Arc OAuth 登录。将自定义应用命名为 Remote Arc，核对可用工具后点击 Connect。" },
      { heading: "让 Gemini 开始使用", text: "在 Remote Arc 连接器详情中选择 Use now。目标电脑需运行 npx remotelink、完成配对并在线。首次测试先让 Gemini 列出设备，确认权限后再进行其他操作。" }
    ]
  },
  "/install/cursor": {
    title: "Cursor 连接 Remote Arc 教程 — Remote MCP 开发工作流",
    description: "将 Remote Arc 作为 Cursor 中的 Remote MCP 服务，安全访问配对电脑上的项目、文件与开发工具。",
    h1: "在 Cursor 中使用 Remote Arc",
    intro: "在 Cursor MCP 设置中添加 Remote Arc 地址并完成 OAuth 授权，让开发助手使用已批准的本机工具。",
    sections: [
      { heading: "配置 MCP 地址", text: "在 Cursor 的 MCP 配置中添加 Remote Arc 托管端点，并通过浏览器完成授权。" },
      { heading: "选择可访问的电脑", text: "在 Dashboard 管理设备及权限，先测试只读文件和进程信息。" },
      { heading: "安全执行开发操作", text: "需要修改文件或运行命令时明确启用对应权限，并检查工具返回结果。" }
    ]
  },
  "/docs": {
    title: "Remote Arc 中文文档 — 设备、权限与 Remote MCP",
    description: "阅读 Remote Arc 中文指南：账户与设备配对、Remote MCP、权限安全、任务状态、恢复和浏览器共享。",
    h1: "Remote Arc 文档",
    intro: "了解如何安装本机 Agent、连接 AI 客户端、管理设备权限，以及保存和恢复支持的任务状态。",
    sections: [
      { heading: "快速开始", text: "安装 Agent，登录控制台，配对电脑，再将支持 Remote MCP 的 AI 客户端连接到 Remote Arc。" },
      { heading: "权限与安全边界", text: "按设备限制工具、可信写入位置和敏感路径。终端命令继承本机系统账户权限，并非独立沙箱。" },
      { heading: "长期任务和恢复", text: "了解任务何时会暂停、如何跟踪执行进度，以及什么时候需要新的 AI 对话继续判断。" }
    ]
  },
  "/docs/mcp": {
    title: "Remote Arc MCP 中文参考 — OAuth、工具与浏览器连接",
    description: "Remote Arc 的 Remote MCP 端点、OAuth 范围、设备工具、任务控制和 Chrome 浏览器共享参考。",
    h1: "Remote MCP 技术参考",
    intro: "Remote Arc 通过 MCP 向兼容 AI 客户端暴露经授权的设备工具，OAuth 管理用户和客户端授权。",
    sections: [
      { heading: "连接和授权", text: "使用托管 MCP 地址，让客户端完成 OAuth 登录；授予的范围与本地设备可执行权限彼此独立。" },
      { heading: "工具与设备路由", text: "浏览设备、读取文件、查看进程，并按权限编辑文件、执行命令或管理任务。" },
      { heading: "浏览器与安全", text: "Chrome 共享需要显式开启，可选择只读上下文或对指定标签页授予有限的交互权限。" }
    ]
  },
  "/docs/long-running-work": {
    title: "Remote Arc 长任务中文指南 — 计划、恢复与执行状态",
    description: "了解 Remote Arc 的长任务、计划执行、设备断线恢复、权限检查，以及 AI 推理与确定性执行的区别。",
    h1: "长期任务如何跨聊天继续",
    intro: "Remote Arc 可以保存明确的设备端操作和任务状态，但不会声称聊天结束后大模型仍在持续自主思考。",
    sections: [
      { heading: "保存执行计划", text: "根据明确的步骤保存任务，由设备端在得到授权后执行，Dashboard 展示状态与结果。" },
      { heading: "断线与重新连接", text: "设备暂时不可用时按任务规则等待、失败或恢复。网络超时不能自动代表本地操作失败。" },
      { heading: "理解 AI 推理边界", text: "新判断仍需受支持的模型会话或明确的规划能力，单纯定时执行不等于持续 AI 推理。" }
    ]
  },
  "/pricing": {
    title: "Remote Arc 价格方案 — 免费版与 Plus",
    description: "了解 Remote Arc 免费版和 Plus 的账号用量、设备权限与服务额度，AI 聊天订阅或模型 API 的费用由对应服务商决定。",
    h1: "Remote Arc 价格与额度",
    intro: "先使用免费版连接 AI 和电脑，按需要了解 Plus。Remote Arc 的 MCP 服务额度独立于 AI 客户端自己的套餐和限制。",
    sections: [
      { heading: "免费开始", text: "可使用现有兼容 AI 客户端连接 Remote Arc，但客户端是否开放 MCP 工具受其套餐限制。" },
      { heading: "Plus 与额度", text: "查看当前账户计划及托管 MCP 使用量，相关数字与规则以登录后的 Dashboard 和价格页实时展示为准。" },
      { heading: "无需另买模型 API", text: "Remote Arc 本身并不向你提供大模型推理，也不要求额外配置模型 API Key；大模型客户端仍可能收费或限流。" }
    ]
  },
  "/downloads": {
    title: "Remote Arc 下载 — Windows、macOS、Linux 原生 Agent",
    description: "下载 Remote Arc 原生 Go Agent，或使用 npx remotelink 安装，支持 Windows、macOS 与 Linux。",
    h1: "下载 Remote Arc",
    intro: "开发者可使用 npx remotelink，普通用户可选择对应系统的原生安装方式。Go Agent 不要求设备单独安装 Node.js。",
    sections: [
      { heading: "选择系统", text: "按 Windows、macOS、Linux 选择匹配的安装版本，并核对平台架构。" },
      { heading: "连接控制台", text: "安装后使用 Remote Arc 账户配对，确认设备在线并设置操作权限。" },
      { heading: "开发者快速安装", text: "已安装 Node.js 的开发者仍然可以使用 npx remotelink 作为快捷入口。" }
    ]
  }
};
