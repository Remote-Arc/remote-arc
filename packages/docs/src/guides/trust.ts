import type { DocSection } from "../catalog.js";

export const trustSections: DocSection[] = [
  {
    heading: { en: "Pick the check before the work starts", zh: "开始前先选定核验方式" },
    text: {
      en: "A Verified task fixes, before anything runs, which account, which resource and which action are in scope, and what evidence will count as done. In Arc Chat, choose Verified task, select a connected account and review the exact action before sending.",
      zh: "核验任务在执行前就确定好：用哪个账号、操作哪个资源、执行哪个动作，以及什么证据才算完成。在 Arc Chat 中点击“核验任务”，选择已连接账号，核对具体动作后再发送。",
    },
    list: {
      items: [
        { en: "Read 1–5 inbox excerpts.", zh: "读取 1–5 封邮件摘录。" },
        {
          en: "Create one exact GitHub issue and read it back.",
          zh: "创建一个内容明确的 GitHub Issue 并回读。",
        },
        { en: "Check one exact Vercel deployment.", zh: "检查一个指定的 Vercel 部署。" },
      ],
    },
    paragraphs: [
      {
        en: "Opening the form does not run anything. A verified run still uses your current access and usage allowance.",
        zh: "打开表单不会执行任何操作。核验运行仍使用你当前的访问权限和用量额度。",
      },
    ],
  },
  {
    heading: { en: "What each check proves", zh: "每类检查证明了什么" },
    text: {
      en: "Each check proves something specific, and it is worth knowing where that proof stops.",
      zh: "每类检查都只证明一件具体的事，值得清楚它证明到哪里为止。",
    },
    list: {
      items: [
        {
          en: "Inbox: the requested message bodies were actually retrieved. It does not prove every judgment in the summary is right.",
          zh: "邮箱：所请求的邮件正文确实已读取。它不证明摘要里的每个判断都正确。",
        },
        {
          en: "Issue: the provider acknowledged the creation, and an independent read-back matches the exact title and full body.",
          zh: "Issue：服务商确认已创建，并且独立回读的结果与准确的标题和完整正文一致。",
        },
        {
          en: "Deployment: the selected deployment ID is READY and has an HTTPS URL. Whether the application behaves correctly needs its own tests.",
          zh: "部署：指定的部署 ID 处于 READY 状态并有 HTTPS URL。应用本身是否正常，需要另外测试。",
        },
      ],
    },
  },
  {
    heading: { en: "Read the receipt", zh: "查看执行回执" },
    text: {
      en: "When the run ends you get a receipt. It lists the status of each declared check, any App changes the provider acknowledged, the evidence (IDs, times and links) and the suggested next action.",
      zh: "运行结束后会生成回执，列出每项声明检查的状态、服务商已确认的应用变更、证据（编号、时间和链接）以及建议的下一步。",
    },
    list: {
      items: [
        { en: "Missing evidence keeps a check pending.", zh: "证据缺失时，检查保持“待验证”。" },
        {
          en: "An acknowledged change with incomplete checks is marked partial.",
          zh: "变更已确认但检查不完整时，标记为部分完成。",
        },
        {
          en: "A normal run with no checks selected is never certified as a completed goal.",
          zh: "未选择检查的普通运行，永远不会被认证为目标已完成。",
        },
      ],
    },
    note: {
      en: "The assistant’s wording cannot override a mismatch that was observed.",
      zh: "助手的措辞不能覆盖实际观察到的不一致。",
    },
  },
  {
    heading: { en: "Authority stays narrow", zh: "授权范围保持明确" },
    text: {
      en: "The server enforces the selected account, resource and allowed actions, and keeps enforcing them after a restart. Every read and write permission the task needs is checked before the verified task is created.",
      zh: "所选账号、资源和允许的动作由服务端强制执行，重启后依然有效。创建核验任务前，会先检查它需要的所有读写权限。",
    },
    paragraphs: [
      {
        en: "The content of an email, an issue or a Skill cannot add authority. Selecting a handbook with @ on its own does not create a verification scope.",
        zh: "邮件、Issue 或技能的内容都不能增加授权。仅用 @ 选择一个手册，不会创建核验范围。",
      },
    ],
  },
  {
    heading: { en: "Recovering without duplicates", zh: "恢复时避免重复操作" },
    text: {
      en: "Some runs end in between: the change happened, but it could not be confirmed. Those cases stop for you instead of being retried.",
      zh: "有些运行会停在中间状态：变更已经发生，但无法确认。这类情况会停下来交给你，而不是自动重试。",
    },
    list: {
      items: [
        {
          en: "An issue that was created but not read back is partial. Open its existing link before doing anything else.",
          zh: "已创建但没有回读的 Issue 属于部分完成。先打开它现有的链接，再决定下一步。",
        },
        {
          en: "Arc does not create a replacement issue automatically and does not silently close one.",
          zh: "Arc 不会自动创建替代的 Issue，也不会悄悄关闭已有的 Issue。",
        },
        {
          en: "A deployment that is still BUILDING stays pending.",
          zh: "仍处于 BUILDING 的部署保持待验证。",
        },
      ],
    },
    paragraphs: [
      {
        en: "Before continuing, review failures, limits and missing access in the receipt.",
        zh: "继续之前，先在回执中核对失败、额度和缺失的权限。",
      },
    ],
  },
  {
    heading: { en: "Payments use a dedicated page", zh: "付款在独立页面完成" },
    text: {
      en: "Plan & usage links to a dedicated checkout page. Check the account, the price from the server and the offer there before continuing to Stripe.",
      zh: "“套餐与用量”提供独立支付页的入口。在该页面核对账号、服务端给出的价格和套餐，再前往 Stripe。",
    },
    paragraphs: [
      {
        en: "Returning from Stripe only reads the saved payment status. It cannot grant Credits or start a second payment by itself.",
        zh: "从 Stripe 返回只会读取已保存的支付状态，本身不会发放 Credits，也不会发起第二次付款。",
      },
    ],
  },
];
