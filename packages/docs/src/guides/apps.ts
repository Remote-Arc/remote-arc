import type { DocSection } from "../catalog.js";

export const appsSections: DocSection[] = [
  {
    heading: { en: "Connect your own account", zh: "连接自己的账号" },
    text: {
      en: "Each App connection links one of your own accounts at a provider such as GitHub, Gmail or Linear. Once it is connected, every read and write action Remote Arc supports for that App is available; there is no separate write switch or per-action approval inside Remote Arc.",
      zh: "每个应用连接对应你在某个服务商（例如 GitHub、Gmail 或 Linear）的一个账号。连接后，Remote Arc 为该应用支持的读取和写入操作都会可用，Remote Arc 内部没有额外的写入开关或逐次审批。",
    },
    list: {
      ordered: true,
      items: [
        { en: "Open Apps and choose the App.", zh: "打开 Apps，选择应用。" },
        {
          en: "OAuth Apps open the provider’s consent page; approve the access it asks for. Some providers, including Runway, need an API credential from that service instead. That credential is separate from a model API key.",
          zh: "OAuth 应用会打开服务商的授权页面，批准它请求的权限。部分服务商（包括 Runway）需要该服务自己的 API 凭证，这和模型 API Key 是两回事。",
        },
        {
          en: "Back in Apps, the account shows as connected. Cloud App actions run from Remote Arc, so they need neither a paired computer nor Arc.",
          zh: "回到 Apps，账号显示为已连接。云端应用操作由 Remote Arc 执行，既不需要配对电脑，也不需要 Arc。",
        },
      ],
    },
  },
  {
    heading: { en: "Ask your AI to use an App", zh: "让 AI 使用应用" },
    text: {
      en: "In your connected AI chat, describe the result and name the App or account to use, for example “find the open GitHub pull request on the billing repo and summarize its changes”.",
      zh: "在已连接的 AI 聊天里说明想要的结果，并指明要用的应用或账号，例如“找到 billing 仓库里那个未合并的 GitHub Pull Request，总结它的改动”。",
    },
    paragraphs: [
      {
        en: "Open an App’s Tools tab in Apps to see every supported action and copy a ready-made instruction for your AI. Only the listed actions are supported, not every feature of the provider, and some also depend on what your provider account allows.",
        zh: "在 Apps 中打开应用的“工具”标签，可以看到所有支持的操作，并复制一段给 AI 的现成指令。只有列出的操作受支持，并不覆盖服务商的全部功能，部分操作还取决于你服务商账号的权限。",
      },
      {
        en: "Through MCP, three tools carry every App action: list_apps lists your connected accounts and searches actions by use case, run_app_read_action runs one read-only action, and run_app_write_action runs one change. Your AI client needs the apps:read scope, plus apps:write for changes.",
        zh: "通过 MCP 使用时，所有应用操作都经由三个工具：list_apps 列出已连接账号并按用途搜索操作，run_app_read_action 执行一个只读操作，run_app_write_action 执行一项修改。AI 客户端需要 apps:read Scope，修改还需要 apps:write。",
      },
    ],
  },
  {
    heading: { en: "How actions run and what counts as done", zh: "操作如何执行，怎样算完成" },
    text: {
      en: "Before an action is sent, Remote Arc checks that your AI client has the right scope and that the connection is still valid. The provider must also have granted the underlying permission.",
      zh: "操作发出前，Remote Arc 会核对 AI 客户端是否具备相应 Scope、连接是否仍然有效；服务商也必须已经授予底层权限。",
    },
    list: {
      items: [
        {
          en: "Each action carries a stable request ID, so retrying after a timeout does not create a second issue, message or record.",
          zh: "每个操作带有稳定的请求 ID，超时后重试不会再创建一个 Issue、消息或记录。",
        },
        {
          en: "A connection that was changed or revoked blocks new actions immediately.",
          zh: "连接被更改或撤销后，新操作立即被阻止。",
        },
        {
          en: "When the outcome is unknown, the attempt is kept for you to inspect and is not repeated automatically.",
          zh: "结果不明时，这次尝试会保留供你核查，不会自动重复。",
        },
      ],
    },
    note: {
      en: "Completion is proven by the provider’s acknowledgement and the resulting item, such as the issue link or sent message, not by the AI saying it is done.",
      zh: "完成的依据是服务商的确认和实际产物（例如 Issue 链接或已发送的消息），而不是 AI 说“完成了”。",
    },
  },
  {
    heading: { en: "Manage your connections", zh: "管理账号连接" },
    text: {
      en: "Apps has two views: Available lists Apps you can connect now, and Connected lists the accounts you already have. An App marked Coming soon cannot be connected yet.",
      zh: "Apps 有两个视图：“可连接”列出现在可以接入的应用，“已连接”列出你已有的账号。标注“即将推出”的应用暂时不能连接。",
    },
    list: {
      items: [
        {
          en: "Check: confirms the account can still be reached. Each action still needs its own provider permission.",
          zh: "检查：确认账号仍可访问。每个具体操作仍需要相应的服务商权限。",
        },
        {
          en: "Reconnect: use it when permissions are missing or access has expired.",
          zh: "重新连接：权限不足或授权过期时使用。",
        },
        {
          en: "Add account: connect a second account at the same provider.",
          zh: "添加账号：在同一服务商下连接另一个账号。",
        },
        {
          en: "Disconnect: removes the saved credential and blocks new actions through that connection.",
          zh: "断开连接：删除保存的凭证，并阻止通过此连接发起新操作。",
        },
      ],
    },
  },
];
