import type { DocSection } from "../catalog.js";

export const usageAndCostsSections: DocSection[] = [
  {
    heading: { en: "Three separate bills", zh: "三笔独立的费用" },
    text: {
      en: "Using Remote Arc can involve up to three different bills, and none of them pays for the others.",
      zh: "使用 Remote Arc 最多可能涉及三笔不同的费用，彼此不能相互抵扣。",
    },
    list: {
      items: [
        {
          en: "Remote Arc: your plan, Arc Credits and Connect tool-call allowance.",
          zh: "Remote Arc：你的套餐、Arc Credits 和 Connect 工具调用额度。",
        },
        {
          en: "Your AI client: for example a ChatGPT or Claude subscription, when you use Connect.",
          zh: "你的 AI 客户端：使用 Connect 时，例如 ChatGPT 或 Claude 的订阅。",
        },
        {
          en: "Third-party Apps: any usage the provider charges to the account you connected.",
          zh: "第三方应用：服务商向你所连接账号收取的用量费用。",
        },
      ],
    },
    paragraphs: [
      {
        en: "Connecting an App does not make its API free. OAuth decides who authorizes the account, not who receives the API bill, and a person’s web subscription to a service can be separate from that service’s API plan or credit balance.",
        zh: "连接应用不代表它的 API 免费。OAuth 决定由谁授权账号，不决定 API 账单由谁承担；一个人在某服务上的网页订阅，也可能和该服务的 API 套餐或积分余额是分开的。",
      },
    ],
  },
  {
    heading: { en: "Arc Credits and the Connect allowance", zh: "Arc Credits 与 Connect 额度" },
    text: {
      en: "Arc and Connect are measured differently because the model runs in different places.",
      zh: "Arc 和 Connect 的计量方式不同，因为模型运行的位置不同。",
    },
    list: {
      items: [
        {
          en: "Arc Chat, Slack bot requests, hosted Tasks, Routines and AI teams use your Arc Credits and per-run limits.",
          zh: "Arc 聊天、Slack Bot 请求、托管 Task、Routine 和 AI 团队，使用 Arc Credits 并受单次运行限制。",
        },
        {
          en: "Connect counts tool calls. Your external AI client does the reasoning, under its own subscription.",
          zh: "Connect 计算工具调用次数，推理由你的外部 AI 客户端在它自己的订阅下完成。",
        },
      ],
    },
    paragraphs: [
      {
        en: "Free includes 10,000 Connect tool calls a month. When they run out, a one-time 7-day trial of unlimited calls starts automatically; after it, calls continue at 2 per minute until the monthly reset. Accounts that have subscribed before do not get the trial.",
        zh: "Free 每月包含 10,000 次 Connect 工具调用。用完后自动开始一次性的 7 天无限调用试用；试用结束后，调用以每分钟 2 次的速度继续，直到每月额度重置。曾经订阅过的账号不提供这次试用。",
      },
      {
        en: "Trial and paid balances, pending reservations and model rates are in Settings → Plan & usage. A paid plan does not remove per-run limits or prevent a third-party provider outage. If something fails, keep the Run ID and error code when you ask for help.",
        zh: "试用和付费余额、待结算预留以及模型费率都在设置 → 套餐与用量中。付费套餐不会取消单次运行限制，也不能避免第三方服务故障。遇到失败时，向我们求助请附上 Run ID 和错误代码。",
      },
    ],
  },
  {
    heading: { en: "Who pays for a connected App", zh: "连接的应用由谁付费" },
    text: {
      en: "A connected App bills whatever account you connected, under that account’s own arrangement. Some examples:",
      zh: "连接的应用按你所连接账号自身的计费安排收费。举几个例子：",
    },
    list: {
      items: [
        {
          en: "Runway uses an API key from your own Runway API project and spends that project’s generation credits.",
          zh: "Runway 使用你自己 Runway API 项目的密钥，消耗该项目的生成积分。",
        },
        {
          en: "WhatsApp uses your Business account, phone number and API credential; charges follow your actual Business billing arrangement.",
          zh: "WhatsApp 使用你的 Business 账号、电话号码和 API 凭证，费用按你实际的 Business 计费安排。",
        },
        {
          en: "Vercel, Supabase and Linear connect to your account or workspace with OAuth; hosting, database or workspace charges still follow that account’s plan.",
          zh: "Vercel、Supabase 和 Linear 通过 OAuth 连接你的账号或工作区，托管、数据库或工作区费用仍按该账号的套餐计算。",
        },
      ],
    },
    paragraphs: [
      {
        en: "Each App’s detail page says whether it needs an API account or a separate paid plan. Signing in with OAuth does not buy a subscription or add API credits. Some integrations also share a service limit, so an action can be unavailable even when your own account has allowance left.",
        zh: "每个应用的详情页会说明是否需要 API 账号或单独付费的套餐。OAuth 登录本身不会购买订阅，也不会增加 API 积分。部分集成还受共享服务额度限制，即使你自己的账号还有余量，操作也可能暂时不可用。",
      },
    ],
  },
  {
    heading: { en: "Before a costly action", zh: "执行产生费用的操作前" },
    text: {
      en: "For Runway generation, Remote Arc checks the requested model, duration and maximum estimated credits before the request is sent.",
      zh: "对于 Runway 生成，Remote Arc 会在发送请求前检查所选模型、时长和预估积分上限。",
    },
    note: {
      en: "That estimate is a check on the request, not a spending cap the provider enforces. Use the provider’s own billing controls to limit what the connected account can spend.",
      zh: "这个预估只是对请求的检查，不是服务商强制执行的消费上限。要限制所连接账号的花费，请使用服务商自己的计费控制。",
    },
  },
];
