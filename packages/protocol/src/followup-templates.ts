export const FOLLOWUP_UPGRADE_URL = "https://agent.remotearc.app/settings?section=billing";
export const FOLLOWUP_TEMPLATES = [
  {
    id: "pair-computer",
    en: "Pair your computer",
    zh: "配对你的电脑",
    subject: ["Pair your computer to start using Remote Arc", "配对电脑，开始使用 Remote Arc"],
    body: [
      "Hi {{name}},\n\nThanks for signing up for Remote Arc. One step is left before your AI can work on your computer: install the Remote Arc Agent and pair the computer.\n\nIt takes about a minute, needs no public IP or port forwarding, and you choose which folders the AI can use. The steps below have a one-line install command and downloads for macOS, Windows and Linux. After pairing, connect the AI you use.\n\nIf anything gets in the way, reply with your operating system and the step where you stopped. We can help.",
      "你好，{{name}}：\n\n感谢注册 Remote Arc。还差一步，你的 AI 就能在你的电脑上工作了：安装 Remote Arc Agent 并配对这台电脑。\n\n大约一分钟即可完成，不需要公网 IP 或端口映射，AI 能使用哪些文件夹由你决定。下面的步骤里有一行安装命令，以及 macOS、Windows 和 Linux 的下载。配对后，再连接你常用的 AI。\n\n如果遇到问题，直接回复你的操作系统和卡住的步骤，我们可以帮你完成。",
    ],
  },
  {
    id: "finish-mcp",
    en: "Computer paired · finish MCP setup",
    zh: "设备已配对 · 完成 MCP 连接",
    subject: ["Your computer is ready — connect your AI next", "电脑已就绪，下一步连接你常用的 AI"],
    body: [
      "Hi {{name}},\n\nYour computer is paired with Remote Arc. There is one more step before your AI can use it: add Remote Arc to the AI you use (ChatGPT, Claude, Gemini or Cursor) and complete the Remote Arc sign-in. Each guide below walks you through it.\n\nYou do not need to pair the computer again. Once connected, ask your AI to list your Remote Arc computers to check the connection.\n\nIf a step is unclear, reply with the AI client you use and where you got stuck. We can help.",
      "你好，{{name}}：\n\n你的电脑已与 Remote Arc 配对。在 AI 中使用这台电脑前，还需要完成一步：在你常用的 AI（ChatGPT、Claude、Gemini 或 Cursor）中添加 Remote Arc，并完成 Remote Arc 登录授权。下面每份教程都会一步步带你完成。\n\n无需再次配对电脑。连接完成后，可以让 AI「列出我的 Remote Arc 电脑」，检查是否连接成功。\n\n如果某一步不清楚，直接回复你使用的 AI 客户端和卡住的步骤，我们可以帮你完成。",
    ],
  },
  {
    id: "first-connection",
    en: "Get connected",
    zh: "首次连接指导",
    subject: ["A hand getting started with Remote Arc?", "需要帮你开始使用 Remote Arc 吗？"],
    body: [
      "Hi {{name}},\n\nThanks for trying Remote Arc. You can give Arc a goal directly, or use Connect with your preferred AI client. Connect the apps or computer needed for one useful result. The guide linked below helps you choose how to start.\n\nWhat would you like your AI to help with first? Reply and we can point you to a suitable setup.",
      "你好，{{name}}：\n\n感谢尝试 Remote Arc。你可以直接把目标交给 Arc，也可以通过 Connect 使用熟悉的 AI 客户端。连接任务需要的应用或电脑，先完成一个有用的结果。下方链接的指南可以帮你选择开始方式。\n\n你最想让 AI 帮你做什么？直接回复这封邮件，我们可以帮你找到合适的开始方式。",
    ],
  },
  {
    id: "first-result",
    en: "Reach a first result",
    zh: "完成第一个任务",
    subject: ["Let’s get your first useful result", "一起完成第一个有用的任务"],
    body: [
      "Hi {{name}},\n\nIf you have connected Remote Arc but are unsure what to try, choose a result you can check, such as one of the ideas below. Connect users can give the same goal to their AI client once the apps or computer it needs are connected and authorized.\n\nWhere did you get stuck? Reply with the step or an error message, leaving out passwords and tokens.",
      "你好，{{name}}：\n\n如果连接后还不确定从哪里开始，可以先选一个能检查的结果，比如下面这些。使用 Connect 时，也可以把同样的目标交给熟悉的 AI 客户端，只要所需应用或电脑已连接并授权。\n\n卡在哪一步了？可以直接回复步骤或错误提示，请不要包含密码和 Token。",
    ],
  },
  {
    id: "experience",
    en: "Experience check-in",
    zh: "使用体验回访",
    subject: ["How has Remote Arc been working for you?", "Remote Arc 用起来怎么样？"],
    body: [
      "Hi {{name}},\n\nI’m checking in to understand your experience with Remote Arc. What worked well, and what felt confusing or got in your way?\n\nYou can reply here or use the short feedback form linked below.\n\nA specific example helps us choose what to improve next. Thanks for your time.",
      "你好，{{name}}：\n\n想了解一下你使用 Remote Arc 的体验：哪些地方有帮助，哪些地方让你困惑或阻碍了工作？\n\n可以直接回复，也可以通过下方链接填写简短表单。\n\n一个具体例子就能帮助我们判断下一步该改什么。谢谢你的时间。",
    ],
  },
  {
    id: "support-check",
    en: "After support",
    zh: "问题解决后回访",
    subject: ["Did that resolve the issue?", "之前的问题解决了吗？"],
    body: [
      "Hi {{name}},\n\nFollowing up on the issue you shared with us. Is everything working as expected now, or is there still something we should look at?\n\nReply with what you see, or leave an update with the link below.\n\nWe’ll use your update to decide the next step.",
      "你好，{{name}}：\n\n跟进一下你之前反馈的问题。现在是否已经恢复正常，还是仍有需要我们检查的地方？\n\n可以直接回复，也可以通过下方链接补充情况。\n\n收到后我们会继续跟进下一步。",
    ],
  },
  {
    id: "workflow-help",
    en: "Find a useful workflow",
    zh: "找到适合的工作场景",
    subject: ["What would make Remote Arc useful for you?", "什么场景会让 Remote Arc 对你有用？"],
    body: [
      "Hi {{name}},\n\nWhat is one repetitive or awkward task you would like your AI to take off your hands? Tell us the outcome and which apps or computers are involved.\n\nWe can help you work out whether Remote Arc fits and how to start. Reply here or share your idea with the link below.",
      "你好，{{name}}：\n\n有没有一件重复或麻烦的工作，你希望交给 AI？告诉我们想要的结果，以及涉及哪些应用或电脑就好。\n\n我们可以帮你判断 Remote Arc 是否适合，以及如何开始。直接回复，或通过下方链接写下想法。",
    ],
  },
  {
    id: "quota-upgrade",
    en: "Monthly allowance · upgrade options",
    zh: "额度已满 · 升级提醒",
    subject: ["Need more Remote Arc calls this month?", "本月需要更多 Remote Arc 调用额度吗？"],
    body: [
      "Hi {{name}},\n\nThanks for using Remote Arc. If you have reached this month's tool-call allowance, you can review upgrade options with the link below.\n\nYou can also stay on your current plan and wait for your monthly allowance to reset.\n\nIf a limit does not look right or you need a hand, reply to this email.",
      "你好，{{name}}：\n\n感谢使用 Remote Arc。如果你已用完本月调用额度，可以通过下方链接查看升级方案。\n\n你也可以保留当前套餐，等待月度额度重置。\n\n如果额度看起来不正确，或需要帮助，直接回复这封邮件即可。",
    ],
  },
  {
    id: "use-case",
    en: "How you use Remote Arc",
    zh: "使用场景与体验回访",
    subject: ["What do you usually use Remote Arc for?", "你平时都用 Remote Arc 来做什么？"],
    body: [
      "Hi {{name}},\n\nI'd love to learn how Remote Arc fits into your day-to-day work. What do you usually use it for?\n\nIf you can, share one recent task and anything that felt helpful, confusing or missing. A sentence or two is enough.\n\nYou can reply directly to this email or leave a note with the link below.\n\nThanks for helping us improve Remote Arc.",
      "你好，{{name}}：\n\n想了解一下 Remote Arc 如何融入你的日常工作：你平时都用它来做什么？\n\n如果方便，分享一个最近的任务，以及哪些地方有帮助、让你困惑或还缺少什么。一两句话就很有帮助。\n\n可以直接回复这封邮件，或通过下方链接留言。\n\n感谢帮助我们改进 Remote Arc。",
    ],
  },
  {
    id: "remote-computer",
    en: "Manage a Linux box or Mac mini",
    zh: "用 AI 管理 Linux 主机或 Mac mini",
    subject: [
      "Let your AI look after your Linux box or Mac mini",
      "让 AI 帮你管理 Linux 主机或 Mac mini",
    ],
    body: [
      "Hi {{name}},\n\nIf you have a Linux server, a home lab box or a Mac mini sitting in a corner, Remote Arc lets the AI you already use look after it. Pair it once and it stays reachable, with no public IP or port forwarding.\n\nFrom ChatGPT, Claude or another AI client you can ask it to run commands and read the output, check services, logs and disk space, keep a long job running and report back, or do a browser task in a browser that works out of sight. It only uses the folders and permissions you allow.\n\nIs there a machine you would like to manage this way? Reply and tell us what runs on it, and we can suggest a first task.",
      "你好，{{name}}：\n\n如果你有一台 Linux 服务器、家里的实验主机，或者放在角落的 Mac mini，Remote Arc 可以让你已经在用的 AI 帮你照看它。配对一次就能一直连上，不需要公网 IP 或端口映射。\n\n在 ChatGPT、Claude 或其他 AI 客户端里，你可以让它运行命令并读取输出，检查服务、日志和磁盘空间，让耗时任务一直跑完再汇报，或者在后台浏览器里完成网页任务。它只会使用你允许的文件夹和权限。\n\n有想这样管理的机器吗？直接回复告诉我们上面跑着什么，我们可以帮你想第一个任务。",
    ],
  },
  {
    id: "coding-agent",
    en: "Coding · continue unfinished agent tasks",
    zh: "写代码 · 接着做未完成的任务",
    subject: [
      "Pick up where Codex or Claude Code left off",
      "接着完成 Codex 或 Claude Code 没做完的任务",
    ],
    body: [
      "Hi {{name}},\n\nRemote Arc is also useful for coding on your own computer. Your AI works in your real checkout, with the tools and dependencies you already have installed: it can read and edit files, run builds and tests, and start a prototype from scratch.\n\nIf a Codex or Claude Code task stopped halfway, ask your AI to find it. Remote Arc lists those sessions with their folder or Git worktree, branch and uncommitted changes, so your AI can carry on in the same worktree instead of starting over.\n\nWhat are you building? Reply with the project and where it got stuck, and we can suggest how to hand it over.",
      "你好，{{name}}：\n\nRemote Arc 也很适合在你自己的电脑上写代码。AI 直接在你真实的代码目录里工作，用的是你已经装好的工具和依赖：可以读写文件、跑构建和测试，也可以从零做一个原型。\n\n如果有 Codex 或 Claude Code 的任务做到一半停了，可以让 AI 去找。Remote Arc 会列出这些会话所在的目录或 Git 工作树、分支和未提交的改动，AI 就能在同一个工作树上接着做，不用从头开始。\n\n你在做什么项目？直接回复项目情况和卡在哪里，我们可以帮你想怎么交给 AI 接着做。",
    ],
  },
] as const;
export type FollowupTemplateId = (typeof FOLLOWUP_TEMPLATES)[number]["id"];
export function followupTemplate(
  id: string,
  locale: "en" | "zh",
  values: { name: string; setupUrl: string; feedbackUrl: string },
) {
  const template = FOLLOWUP_TEMPLATES.find((item) => item.id === id);
  if (!template) throw new Error("unknown_template");
  const index = locale === "zh" ? 1 : 0;
  return {
    subject: personalizeFollowupText(template.subject[index], locale, values),
    body: personalizeFollowupText(template.body[index], locale, values),
  };
}
export function personalizeFollowupText(
  text: string,
  locale: "en" | "zh",
  values: { name: string; setupUrl: string; feedbackUrl: string },
) {
  const site = new URL(values.setupUrl).origin,
    prefix = locale === "zh" ? "/zh" : "";
  const replacements = {
    ...values,
    upgradeUrl: FOLLOWUP_UPGRADE_URL,
    chatgptUrl: site + prefix + "/install/chatgpt",
    claudeUrl: site + prefix + "/install/claude",
    cursorUrl: site + prefix + "/install/cursor",
    downloadsUrl: site + prefix + "/downloads",
    installCommand: "curl -fsSL " + site + "/install.sh | sh",
  };
  return text.replace(
    /\{\{(name|setupUrl|feedbackUrl|chatgptUrl|claudeUrl|cursorUrl|downloadsUrl|installCommand|upgradeUrl)\}\}/g,
    (_, key: keyof typeof replacements) => replacements[key],
  );
}
