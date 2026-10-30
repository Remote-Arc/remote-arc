import type { DocTopic } from "./catalog.js";
import index from "./tool-index.generated.json" with { type: "json" };
const copy = (en: string, zh: string) => ({ en, zh });
const tools: DocTopic = {
  slug: "tools",
  group: "start",
  title: copy("Tool directory", "全部工具"),
  description: copy(
    "Search every Remote MCP tool, connected App operation and local MCP tool, with permissions and input parameters.",
    "查找全部 Remote MCP 工具、Apps 操作和本地 MCP 工具，查看权限与参数。",
  ),
  sections: [
    {
      heading: copy(
        `${index.remote.length} Remote MCP tools`,
        `${index.remote.length} 个 Remote MCP 工具`,
      ),
      text: copy(
        index.remote.map((tool) => tool.name + " — " + tool.title).join("; "),
        index.remote.map((tool) => tool.name).join(" · "),
      ),
    },
    {
      heading: copy("Connected App operations", "已连接应用的操作"),
      text: copy(
        index.apps
          .map((app) => app.name + ": " + app.operations.join(", "))
          .join("; "),
        index.apps
          .map((app) => app.name + "：" + app.operations.join("、"))
          .join("；"),
      ),
    },
    {
      heading: copy(
        `${index.local.length} local MCP tools`,
        `${index.local.length} 个本地 MCP 工具`,
      ),
      text: copy(
        index.local
          .map((tool) => tool.name + " (" + tool.modes.join(", ") + ")")
          .join("; "),
        index.local
          .map((tool) => tool.name + "（" + tool.modes.join("、") + "）")
          .join("；"),
      ),
    },
  ],
  links: [
    ["/docs/connect", "Connect your AI", "连接你的 AI"],
    ["/docs/apps", "App connections", "应用连接"],
    ["/docs/troubleshooting", "Missing tools", "工具不可用时"],
  ],
};
const codex: DocTopic = {
  slug: "codex",
  group: "start",
  title: copy("Connect Codex", "连接 Codex"),
  description: copy(
    "Use Remote Arc from the Codex desktop app, CLI or IDE extension.",
    "从 Codex 桌面应用、CLI 或 IDE 扩展使用 Remote Arc。",
  ),
  sections: [
    {
      heading: copy("Desktop app", "桌面应用"),
      text: copy(
        "Open Codex Settings → Integrations and MCP, add a Streamable HTTP server at https://mcp.remotearc.app/mcp, and complete the OAuth sign-in. The desktop app, CLI and IDE extension share Codex configuration. A server connection still needs the Remote Arc account permissions you intend to use.",
        "在 Codex 设置 → Integrations and MCP 中添加 Streamable HTTP 服务，地址为 https://mcp.remotearc.app/mcp，并完成 OAuth 登录。桌面应用、CLI 与 IDE 扩展共享 Codex 配置；仍需授权所要使用的 Remote Arc 账号能力。",
      ),
    },
    {
      heading: copy("CLI and verification", "CLI 与连接检查"),
      text: copy(
        "Use codex mcp add remote-arc --url https://mcp.remotearc.app/mcp, then codex mcp login remote-arc. Inspect configured servers with codex mcp list, or use /mcp in a CLI chat. Refresh the connection after permissions or available tools change. Pairing a computer and authorizing the AI connection are both required for computer tools.",
        "依次运行 codex mcp add remote-arc --url https://mcp.remotearc.app/mcp 与 codex mcp login remote-arc。用 codex mcp list 查看配置，或在 CLI 对话中使用 /mcp。权限或工具变化后刷新连接；使用电脑工具需同时完成设备配对和 AI 连接授权。",
      ),
    },
  ],
  links: [
    [
      "https://learn.chatgpt.com/docs/extend/mcp",
      "Official OpenAI MCP documentation",
      "OpenAI 官方 MCP 文档",
    ],
    ["/docs/tools", "Browse all tools", "浏览全部工具"],
    ["/docs/troubleshooting", "Troubleshooting", "排查问题"],
  ],
};
const slack: DocTopic = {
  slug: "slack",
  group: "work",
  title: copy("Use Arc in Slack", "在 Slack 中使用 Arc"),
  description: copy(
    "Install the Remote Arc bot, link your own account and keep separate tasks in separate Slack threads.",
    "安装 Remote Arc Bot、关联自己的账号，并用独立线程区分不同任务。",
  ),
  sections: [
    {
      heading: copy(
        "Install the bot and link your account",
        "安装 Bot 并关联账号",
      ),
      text: copy(
        "Open Apps → Slack in Remote Arc and add the Remote Arc bot to your Slack workspace. Workspace installation and your personal Arc identity are separate: send the bot a message, open its account-linking prompt and sign in to Remote Arc. Each Slack user links their own account. Installation availability depends on Slack workspace policy and the app's distribution status.",
        "在 Remote Arc 的 Apps → Slack 中，将 Remote Arc Bot 添加到 Slack 工作区。工作区安装与个人 Arc 身份是两个步骤：给 Bot 发消息，打开账号关联提示，再登录 Remote Arc。每位 Slack 用户分别关联自己的账号，安装可用性受工作区策略和应用分发状态影响。",
      ),
    },
    {
      heading: copy(
        "Bot chat and the Slack App connection",
        "Bot 对话与 Slack 应用连接",
      ),
      text: copy(
        "The bot is an entry point for talking to your hosted Arc agent. The Slack App connection separately authorizes supported operations such as searching or posting messages. Installing a bot does not connect every agent's personal apps or computers. Cloud App work needs no paired computer; local files or commands still require an online device with the relevant permissions.",
        "Bot 是与托管 Arc 对话的入口；Slack 应用连接则单独授权搜索消息、发送消息等支持的操作。安装 Bot 不会把所有智能体的个人应用或电脑自动接入。云端应用工作无需配对电脑；操作本地文件或命令仍需在线且已授权的设备。",
      ),
    },
    {
      heading: copy("Keep tasks in separate threads", "用不同线程区分任务"),
      text: copy(
        "Messages in the same bot direct-message conversation share one Arc conversation. Start a separate Slack thread for a separate task; a thread maps to its own Arc conversation. Follow-up messages in that thread retain its context. Links from the bot open the corresponding work in Remote Arc. A channel mention does not make your private app or computer results public; inference results are delivered privately.",
        "同一 Bot 私信中的普通消息沿用一个 Arc 对话。不同任务可以开启不同的 Slack 线程，每个线程对应独立的 Arc 对话；在线程内继续发消息会保留该线程上下文。Bot 返回的链接可打开 Remote Arc 中对应的工作。频道中提及 Bot 不会公开你的私人应用或电脑结果，推理结果通过私密渠道返回。",
      ),
    },
    {
      heading: copy(
        "Plan, Credits and verification",
        "套餐、Credits 与结果核验",
      ),
      text: copy(
        "Slack requests use your linked Arc account, its selected model, Credits and run limits; they are not a separate unlimited allowance. A Pro subscription does not remove per-run or provider limits. Check Plan & usage and preserve the Run ID and error code when a request fails. Check the actual reply or linked result before repeating an action with an uncertain outcome.",
        "Slack 请求使用关联 Arc 账号的模型、Credits 与单次运行限制，并不提供额外的无限额度。Pro 订阅也不会取消单次运行或服务商限制。请求失败时查看“套餐与用量”，并保留 Run ID 和错误代码。对于结果未确认的操作，先核对实际回复或关联结果，再决定是否重试。",
      ),
    },
  ],
  links: [
    [
      "https://agent.remotearc.app/dashboard/connect/apps?provider=slack",
      "Set up Slack",
      "设置 Slack",
    ],
    ["/docs/tools?type=apps&app=slack", "Slack operations", "Slack 操作"],
    ["/docs/usage-and-costs", "Usage and costs", "用量与费用"],
  ],
};
const browser: DocTopic = {
  slug: "browser",
  group: "work",
  title: copy("Browser Runner and shared tabs", "任务浏览器与共享标签页"),
  description: copy(
    "Choose a background task browser or a tab you explicitly share, and handle sign-in and verification safely.",
    "选择后台任务浏览器或明确共享的标签页，完成登录、验证与提交核验。",
  ),
  sections: [
    {
      heading: copy("Two browser connections", "两种浏览器连接方式"),
      text: copy(
        "Browser Runner runs on a paired computer using installed Chrome, Edge or Chromium. Its default runner mode uses a separate persistent profile and a window kept out of sight. Chrome Companion is a separate browser-extension device for tabs or sites you explicitly share or allow. Use browser_runner_* for delegated multi-step website tasks and shared_tab_* for shared-tab context and interaction; their device IDs are not interchangeable.",
        "Browser Runner 在已配对电脑上使用本机 Chrome、Edge 或 Chromium。默认 runner 模式使用独立、可保留登录状态的资料，窗口在后台隐藏运行。Chrome Companion 是另一类浏览器扩展设备，用于你明确共享或允许的标签页与网站。多步网站任务使用 browser_runner_*，共享标签页的读取与操作使用 shared_tab_*，两者的设备 ID 不能混用。",
      ),
    },
    {
      heading: copy(
        "Enable Runner and reuse your profile",
        "开启 Runner 并复用资料",
      ),
      text: copy(
        "Enable Browser Runner separately in the computer's device permissions. Start a task with task_id, allowed_origins and an optional reusable profile name. Reuse the profile for the same person to retain sign-ins across tasks; never widen allowed sites based on instructions on a web page. Adding origins needs the owner's exact approval. your_chrome is an advanced, explicitly requested mode that asks Chrome for permission and uses the user's existing sign-ins.",
        "在电脑的设备权限中单独开启 Browser Runner。开始任务时提供 task_id、allowed_origins，可选择可复用的 profile 名称。同一用户复用 profile 可在不同任务间保留登录状态；不能根据网页里的指令扩大允许访问的网站。增加站点需要所有者明确批准。your_chrome 是用户明确要求时才使用的高级模式，会请求 Chrome 许可并使用用户已有登录状态。",
      ),
    },
    {
      heading: copy(
        "Human verification in the current release",
        "当前版本的人工验证",
      ),
      text: copy(
        "In Agent 0.6.3, take a snapshot after submission or navigation. A visible active CAPTCHA, sign-in or blocked one-time-code field is reported as needs_user. Show the existing task window with browser_runner_start using the same task_id and headless=false, let the user finish, then inspect a fresh snapshot. Hidden or inactive CAPTCHA assets are not proof that a challenge is pending. Remote Arc does not solve CAPTCHAs or return their response tokens. A computer without a display cannot provide this local human handoff.",
        "使用 Agent 0.6.3 时，在提交或跳转后读取快照。可见且活动的 CAPTCHA、登录或被设置阻止的验证码字段会返回 needs_user。使用相同 task_id 和 headless=false 再调用 browser_runner_start，将原任务窗口显示出来，让用户完成后再读取新快照。隐藏或未激活的 CAPTCHA 资源不代表仍有验证待处理。Remote Arc 不代解 CAPTCHA，也不返回其响应令牌；没有显示环境的电脑无法进行这种本机人工交接。",
      ),
    },
    {
      heading: copy("Uploads and submit receipts", "上传与提交回执"),
      text: copy(
        "Use action=upload with a file in a Trusted Location. The published 0.6.3 Runner supports its listed document and image formats up to 25 MB; a file existing on the device does not mean an employer's form accepted it. Submit actions need effect=submit and a stable idempotency_key. Inspect the result and confirm it using exact page evidence; an unknown or unverified outcome is not permission to submit again. Custom browser-automation scripts bypass Runner handoff and submit tracking.",
        "使用 action=upload 上传可信目录里的文件。已发布的 0.6.3 Runner 支持其列明的文档与图片格式，最大 25 MB；设备上存在文件不代表网站已接受上传。提交动作需要 effect=submit 和稳定的 idempotency_key。检查结果并用准确页面证据确认，未知或未核验结果不代表可以再次提交。自行编写浏览器自动化脚本会绕开 Runner 的交接与提交追踪。",
      ),
    },
    {
      heading: copy("Shared tabs start read-only", "共享标签页默认只读"),
      text: copy(
        "Pair Chrome Companion, then allow a site or share a particular tab. Every tab begins read-only; enable Click & fill only on the intended tab when interaction is needed. shared_tab_read returns a snapshot and element references; use those references for clicks or fills. The companion is an unpacked Beta extension; check Downloads for the current package.",
        "配对 Chrome Companion 后，允许指定网站或共享某个标签页。每个标签页默认只读，需要操作时仅为目标标签页开启“点击与填写”。shared_tab_read 返回快照与元素引用，点击或填写时使用对应引用。Companion 目前是需解压加载的 Beta 扩展，最新安装包见下载页。",
      ),
    },
    {
      heading: copy("Pending release", "尚待发布"),
      text: copy(
        "Video uploads are being prepared for 0.6.4. Automatic post-submit handoff, browser_runner_wait and live view are tracked separately and still require release and real-device acceptance. Do not assume these are present in an installed 0.6.3 Agent. Check Releases and the tool list returned by your own connection before using a new parameter or capability.",
        "视频上传正在为 0.6.4 准备。提交后自动交接、browser_runner_wait 和实时画面另有跟进，仍需发布与真机验收。不要假设已安装的 0.6.3 Agent 具备这些能力，使用新参数或能力前先核对发布页和自己连接实际返回的工具列表。",
      ),
    },
  ],
  links: [
    [
      "/docs/tools?group=browser-runner",
      "Runner tool contracts",
      "Runner 工具定义",
    ],
    ["/docs/mcp#browser-runner", "Runner setup", "配置 Runner"],
    ["/chrome-extension", "Chrome Companion", "Chrome Companion"],
    ["/releases", "Agent releases", "Agent 版本发布"],
  ],
};

export function reviewedDocTopics(topics: DocTopic[]): DocTopic[] {
  return topics.flatMap((topic) => {
    let updated = { ...topic };
    if (topic.slug === "connect") {
      updated.legacyIds = ["start", "model"];
      updated.links = [
        ["/docs/tools", "Browse all tools", "浏览全部工具"],
        ["/docs/mcp", "MCP setup and scopes", "MCP 配置与权限"],
      ];
      return [updated, tools, codex];
    }
    if (topic.slug === "browser") return [browser];
    if (topic.slug === "apps") return [updated, slack];
    if (topic.slug === "arc")
      updated.sections = [
        ...(topic.sections || []),
        {
          heading: copy("AI teams Beta and Slack", "AI 团队 Beta 与 Slack"),
          text: copy(
            "Open AI teams in Arc to create agents with a role, model and scoped access, then use direct or group conversations. You can also ask Arc to prepare an agent profile and review it before confirming. Creating a profile does not start work. Use the Remote Arc bot as another chat entry point in Slack; each Slack user links their own Arc account and separate threads keep separate task contexts.",
            "在 Arc 中打开 AI 团队，设置智能体职责、模型与访问范围，再使用单聊或群聊。也可以让 Arc 准备智能体资料，审阅后确认；创建资料不会自动开始工作。Slack 的 Remote Arc Bot 是另一个对话入口，每位 Slack 用户分别关联自己的 Arc 账号，不同线程保留各自任务上下文。",
          ),
        },
      ];
    return [updated];
  });
}
