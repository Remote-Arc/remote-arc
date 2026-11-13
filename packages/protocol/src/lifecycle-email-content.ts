import {
  AGENT_INSTALL_COMMANDS,
  EMAIL_ACCENT,
  EMAIL_AI_CLIENTS,
  EMAIL_ART_ORIGIN,
  EMAIL_MARK,
  emailChecklist,
  emailCompare,
  emailFacts,
  emailLabel,
  emailParagraph,
  emailSteps,
  emailStepsText,
  emailTimeline,
  escapeHtml,
  renderEmailShell,
  type EmailStep,
} from "./email-layout.js";

/** Lifecycle emails on the shared layout, in one language per email: the
 * account's locale, or English when it is unknown. Every dynamic value is
 * escaped; links are fixed product routes. */
export type LifecycleKind =
  "welcome" | "setup_reminder" | "connect_trial_started" | "connect_trial_ending" | "plan_started";

export type LifecycleContent = {
  kind: LifecycleKind;
  locale: "en" | "zh";
  freeCalls: number | null;
  trialDays: number;
  slowLaneCallsPerMinute: number;
  /** The paid plan's monthly price (Pro, product id connect-unlimited-v1), when the catalog has one. */
  unlimitedCents: number | null;
  trialEndsAt?: string;
  plan?: {
    id: string;
    label: string;
    cents: number;
    periodEnd: string | null;
    /** Absent on confirmations queued before yearly billing: monthly. */
    interval?: "month" | "year";
    /** Monthly Credits the plan includes; 0 for Connect-only versions. */
    credits?: number;
  };
  /** Welcome and setup reminder: how far setup has got when it is sent. Absent means nothing is done yet. */
  setup?: LifecycleSetup;
  /** `site` is the website origin; guides are linked from it in the email's language. */
  links: { site: string; checkout: string; billing: string; unsubscribe: string | null };
};

/** How each AI client with a setup guide names itself when it registers. */
const CLIENT_NAME_MATCH = {
  chatgpt: /chatgpt|openai/i,
  claude: /claude|anthropic/i,
  gemini: /gemini/i,
  cursor: /cursor/i,
} as const;
const AI_CLIENTS = EMAIL_AI_CLIENTS.map((client) => ({
  ...client,
  match: CLIENT_NAME_MATCH[client.slug],
}));
export type AiClientSlug = (typeof EMAIL_AI_CLIENTS)[number]["slug"];
export type LifecycleSetup = {
  /** The connected AI client, "other" for an unknown one, or null before any connects. */
  aiClient: AiClientSlug | "other" | null;
  computerPaired: boolean;
};
/** OAuth client names are chosen by whoever registers the client, so an email
 * never repeats one: it either names a client we know or says "your AI". */
export const aiClientFromName = (name: string): AiClientSlug | "other" =>
  AI_CLIENTS.find((client) => client.match.test(name))?.slug ?? "other";

/** Sample setup states for previewing the welcome email and setup reminder in the admin console. */
export const WELCOME_PREVIEW_SETUPS = {
  new: { aiClient: null, computerPaired: false },
  connected: { aiClient: "chatgpt", computerPaired: false },
  paired: { aiClient: null, computerPaired: true },
  ready: { aiClient: "chatgpt", computerPaired: true },
} as const satisfies Record<string, LifecycleSetup>;
export type WelcomePreviewSetup = keyof typeof WELCOME_PREVIEW_SETUPS;
export const isWelcomePreviewSetup = (value: unknown): value is WelcomePreviewSetup =>
  typeof value === "string" && Object.hasOwn(WELCOME_PREVIEW_SETUPS, value);
/** The emails that follow setup progress. The reminder is never sent once setup is done. */
export const setupPreviewsFor = (kind: LifecycleKind): readonly WelcomePreviewSetup[] =>
  kind === "welcome"
    ? ["new", "connected", "paired", "ready"]
    : kind === "setup_reminder"
      ? ["new", "connected", "paired"]
      : [];

const art = (name: string) => EMAIL_ART_ORIGIN + name;

const dollars = (cents: number) =>
  "US$" + (cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2));

type Stage = { label: string; value: string; state: "done" | "current" | "next" };
type Option = { name: string; price: string; items: string[]; badge?: string; highlight?: boolean };
type Card = EmailStep;
/** A block after the opening paragraphs, with an optional small heading. */
type Section = { label?: string } & (
  | { type: "paragraph"; text: string }
  | { type: "facts"; rows: { label: string; value: string }[] }
  | { type: "cards"; cards: Card[] }
  | { type: "timeline"; stages: Stage[] }
  | { type: "compare"; options: Option[] }
  | { type: "checklist"; items: string[] }
);
type Copy = {
  subject: string;
  preheader: string;
  eyebrow: string;
  headline: string;
  /** One line under the headline, on the dark header. */
  intro: string;
  /** Artwork file in apps/ui/public/email-art. */
  hero: string;
  paragraphs: string[];
  sections: Section[];
  cta: { href: string; label: string };
};

function copy(content: LifecycleContent): Copy {
  const zh = content.locale === "zh",
    tr = (en: string, cn: string) => (zh ? cn : en);
  const { trialDays, slowLaneCallsPerMinute: perMinute } = content;
  const calls = content.freeCalls === null ? null : content.freeCalls.toLocaleString("en-US");
  const price = content.unlimitedCents;
  const date = (iso: string) => {
    const value = new Date(iso);
    return Number.isNaN(value.getTime())
      ? iso
      : new Intl.DateTimeFormat(zh ? "zh-CN" : "en-US", {
          timeZone: "UTC",
          year: "numeric",
          month: zh ? "long" : "short",
          day: "numeric",
        }).format(value);
  };
  const checkout = { href: content.links.checkout, label: tr("Keep full speed", "保持全速") };
  const slowLane = tr(`Slow lane, ${perMinute} calls a minute`, `慢速通道，每分钟 ${perMinute} 次`);
  const proPrice =
    price === null
      ? null
      : tr(
          `${dollars(price)}/month, about ${dollars(Math.round(price / 30))} a day`,
          `${dollars(price)}/月，约每天 ${dollars(Math.round(price / 30))}`,
        );
  const trialEnd = content.trialEndsAt ? date(content.trialEndsAt) : null;
  // Website pages in the email's language: every page linked here has a /zh version.
  const page = (path: string) => content.links.site + (zh ? "/zh" : "") + path;

  // Setup progress, for the welcome email and the setup reminder: steps already
  // done are ticked off, so the email leads with what is left.
  const setup = content.setup ?? { aiClient: null, computerPaired: false };
  const connected = setup.aiClient !== null,
    paired = setup.computerPaired,
    ready = connected && paired;
  const known = AI_CLIENTS.find((client) => client.slug === setup.aiClient)?.name;
  const aiTitle = known ?? tr("Your AI", "你的 AI"),
    aiInline = known ?? tr("your AI", "你的 AI");
  const done = art("icon-done.png");
  const connectStep: Card = connected
    ? {
        title: tr(`${aiTitle} is connected`, `${aiTitle} 已连接`),
        body: tr(
          `Remote Arc is already added to ${aiInline}.`,
          `${aiTitle} 里已经添加好 Remote Arc。`,
        ),
        icon: done,
      }
    : {
        title: tr("Connect your AI", "连接你的 AI"),
        body: tr(
          "Pick the AI you use to open its step-by-step setup guide.",
          "选择你在用的 AI，打开对应的分步设置教程。",
        ),
        icon: art("icon-connect.png"),
        logos: AI_CLIENTS.map((client) => ({
          label: client.name,
          href: page("/install/" + client.slug),
          src: art("client-" + client.slug + ".png"),
        })),
        link: { label: tr("All setup guides", "查看全部设置教程"), href: page("/connect-ai") },
      };
  const computerStep: Card = paired
    ? {
        title: tr("Your computer is paired", "电脑已配对"),
        body: tr(
          "The Agent is installed and linked to your account.",
          "Agent 已安装并关联到你的账号。",
        ),
        icon: done,
      }
    : {
        title: tr("Install the Agent on your computer", "在电脑上安装 Agent"),
        body: tr(
          "Run one command in a terminal. It starts the Agent; then approve the pairing in your account.",
          "在终端运行一条命令，会启动 Agent，然后在账号中确认配对。",
        ),
        icon: art("icon-computer.png"),
        commands: [
          {
            label: tr("Any computer with Node.js", "已安装 Node.js 的电脑"),
            command: AGENT_INSTALL_COMMANDS.npx,
          },
          // install.sh starts the Agent itself after a first install at a terminal.
          {
            label: tr("macOS / Linux, no Node.js", "macOS / Linux，无需 Node.js"),
            command: AGENT_INSTALL_COMMANDS.script,
          },
        ],
        link: {
          label: tr(
            "Or download it for macOS, Windows or Linux",
            "也可以下载 macOS、Windows 或 Linux 版",
          ),
          href: page("/downloads"),
        },
      };
  switch (content.kind) {
    case "welcome": {
      const workStep: Card = {
        title: tr("Ask for real work", "交给它真正的工作"),
        body: ready
          ? tr(
              `Open ${aiInline} and ask for something on your computer: files, terminal, browser or apps.`,
              `打开 ${aiTitle}，让它在你的电脑上处理文件、终端、浏览器或应用。`,
            )
          : tr(
              "Files, terminal, browser and apps, within the permissions you set.",
              "文件、终端、浏览器与应用，都在你设定的权限内执行。",
            ),
        icon: art("icon-work.png"),
      };
      const left = (connected ? 0 : 1) + (paired ? 0 : 1);
      return {
        subject: tr("Welcome to Remote Arc", "欢迎使用 Remote Arc"),
        preheader: ready
          ? tr("You are all set. Here is what to try first.", "一切就绪，看看可以先让它做什么。")
          : connected
            ? tr("One step left: install the Agent.", "只差一步：安装 Agent。")
            : tr(
                "Let the AI you already use work on your own computers.",
                "让你已经在用的 AI 在自己的电脑上干活。",
              ),
        eyebrow: tr("Welcome", "欢迎"),
        headline: ready
          ? tr("You are all set", "一切就绪")
          : connected
            ? tr(
                `${aiTitle} is connected. Add a computer next`,
                `${aiTitle} 已连接，下一步添加电脑`,
              )
            : paired
              ? tr("Your computer is ready. Connect your AI next", "电脑已就绪，下一步连接你的 AI")
              : tr("Your AI, on your own computers", "让你的 AI 在自己的电脑上干活"),
        intro: ready
          ? tr(
              `${aiTitle} can now work on your computer.`,
              `${aiTitle} 现在可以在你的电脑上干活了。`,
            )
          : connected
            ? tr(
                `Install the Agent so ${aiInline} can work on your computer.`,
                `安装 Agent 后，${aiTitle} 就能在你的电脑上干活。`,
              )
            : tr(
                "ChatGPT, Claude, Gemini or Cursor, working on your computers, apps and browser.",
                "ChatGPT、Claude、Gemini 或 Cursor，直接在你的电脑、应用和浏览器上工作。",
              ),
        hero: "welcome-hero.png",
        paragraphs: [
          tr(
            "Remote Arc lets the AI you already use work on your computers, apps and browser, with permissions you control.",
            "Remote Arc 让你已经在用的 AI 在你的电脑、应用和浏览器上干活，权限始终由你掌控。",
          ),
        ],
        sections: [
          {
            label: ready
              ? tr("Setup complete", "设置完成")
              : left === 2
                ? tr("Get started in three steps", "三步开始")
                : tr("One step left", "只差一步"),
            type: "cards",
            cards: [connectStep, computerStep, workStep],
          },
          {
            label: tr("How Free works", "Free 套餐怎么用"),
            type: "paragraph",
            text:
              (calls
                ? tr(
                    `Free includes ${calls} Connect calls a month. `,
                    `Free 每月包含 ${calls} 次 Connect 调用。`,
                  )
                : "") +
              tr(
                `If you run out, your agents keep going: a ${trialDays}-day unlimited Connect trial starts automatically (once per account), then calls continue at ${perMinute} per minute until the monthly reset.`,
                `用完也不会断：会自动开启 ${trialDays} 天无限调用试用（每个账号仅一次），之后以每分钟 ${perMinute} 次继续，直到月度重置。`,
              ),
          },
          {
            type: "timeline",
            stages: [
              ...(calls
                ? [
                    {
                      label: tr("Every month", "每月"),
                      value: tr(`${calls} calls`, `${calls} 次调用`),
                      state: "current" as const,
                    },
                  ]
                : []),
              {
                label: tr("If you run out", "用完后"),
                value: tr(
                  `${trialDays} days unlimited, once per account`,
                  `${trialDays} 天无限调用，每个账号一次`,
                ),
                state: "next",
              },
              {
                label: tr("Then", "之后"),
                value: tr(`${perMinute} calls a minute`, `每分钟 ${perMinute} 次`),
                state: "next",
              },
              {
                label: tr("Monthly reset", "月度重置"),
                value: tr("Allowance back", "额度恢复"),
                state: "next",
              },
            ],
          },
        ],
        // The button is the next step left: connect, install, or ideas once both are done.
        cta: ready
          ? { href: page("/use-cases"), label: tr("Ideas to try", "看看可以做什么") }
          : connected
            ? { href: page("/downloads"), label: tr("Install the Agent", "安装 Agent") }
            : { href: page("/connect-ai"), label: tr("Connect your AI", "连接你的 AI") },
      };
    }
    case "setup_reminder": {
      // Only sent while something is left; a computer comes first, since an AI
      // client needs one to work on.
      const next = paired
        ? { href: page("/connect-ai"), label: tr("Connect your AI", "连接你的 AI") }
        : { href: page("/downloads"), label: tr("Install the Agent", "安装 Agent") };
      return {
        subject: paired
          ? tr("Your computer is ready. Connect your AI", "电脑已就绪，连接你的 AI 吧")
          : connected
            ? tr(`Add a computer for ${aiInline} to work on`, `给 ${aiTitle} 添加一台电脑`)
            : tr("Your computer is one command away", "只差一条命令，就能接入你的电脑"),
        preheader: paired
          ? tr(
              "One step left: add Remote Arc to the AI you use.",
              "只差一步：在你常用的 AI 里添加 Remote Arc。",
            )
          : tr(
              "Install the Agent and approve the pairing. It takes about a minute.",
              "安装 Agent 并确认配对，大约一分钟。",
            ),
        eyebrow: tr("Finish setup", "完成设置"),
        headline: paired
          ? tr("Your computer is ready. Connect your AI next", "电脑已就绪，下一步连接你的 AI")
          : connected
            ? tr(
                `${aiTitle} is connected. Add a computer next`,
                `${aiTitle} 已连接，下一步添加电脑`,
              )
            : tr("Pair a computer to get started", "配对一台电脑，就可以开始了"),
        intro: paired
          ? tr(
              "Add Remote Arc to the AI you use and sign in. There is no need to pair again.",
              "在你常用的 AI 里添加 Remote Arc 并登录，无需再次配对。",
            )
          : tr(
              "One command installs the Agent, then your AI can work on that computer.",
              "一条命令安装 Agent，你的 AI 就能在那台电脑上干活。",
            ),
        hero: "welcome-hero.png",
        paragraphs: [
          tr(
            "Your Remote Arc account is ready, but setup is not finished yet. The step below usually takes about a minute.",
            "你的 Remote Arc 账号已经开好，但设置还没完成。下面这一步通常一分钟左右就能完成。",
          ),
        ],
        sections: [
          {
            label: tr("Where you are", "当前进度"),
            type: "cards",
            cards: [computerStep, connectStep],
          },
          {
            type: "paragraph",
            text: tr(
              "Stuck somewhere? Reply with your operating system and the step where you stopped, and we will help you finish.",
              "卡在哪一步了？直接回复你的操作系统和卡住的步骤，我们帮你完成。",
            ),
          },
        ],
        cta: next,
      };
    }
    case "connect_trial_started":
      return {
        subject: tr(
          `Your ${trialDays}-day unlimited Connect trial has started`,
          `你的 ${trialDays} 天无限调用试用已开启`,
        ),
        preheader: tr(
          "You used this month’s free calls. Your agents keep running at full speed.",
          "本月免费调用已用完，你的 agent 会继续全速运行。",
        ),
        eyebrow: tr(`${trialDays}-day trial`, `${trialDays} 天试用`),
        headline: tr("Your agents keep running at full speed", "你的 agent 会继续全速运行"),
        intro: tr(
          `No call cap for the next ${trialDays} days.`,
          `接下来 ${trialDays} 天，调用不限次数。`,
        ),
        hero: "trial-started-hero.png",
        paragraphs: [
          tr(
            `You used this month’s free Connect calls, so instead of stopping your work we started your one-time ${trialDays}-day unlimited Connect trial. There is no call cap until it ends.`,
            `你已用完本月的免费 Connect 调用。为了不打断你的工作，我们为你开启了一次性的 ${trialDays} 天无限调用试用，试用期间不限调用次数。`,
          ),
        ],
        sections: [
          {
            label: tr("What happens next", "接下来会怎样"),
            type: "timeline",
            stages: [
              { label: tr("Free calls", "免费额度"), value: tr("Used", "已用完"), state: "done" },
              {
                label: tr("Unlimited trial", "无限调用试用"),
                value: trialEnd
                  ? tr(`Until ${trialEnd}`, `至 ${trialEnd}`)
                  : tr(`${trialDays} days`, `${trialDays} 天`),
                state: "current",
              },
              { label: tr("After the trial", "试用结束后"), value: slowLane, state: "next" },
              {
                label: tr("Monthly reset", "月度重置"),
                value: tr("Free calls back", "免费额度恢复"),
                state: "next",
              },
            ],
          },
          {
            type: "paragraph",
            text: tr(
              "After that, Free continues in the slow lane until your allowance resets. Pro keeps your agents at full speed all month.",
              "试用结束后，Free 会进入慢速通道，直到额度重置。Pro 可让你的 agent 整月保持全速。",
            ),
          },
          ...(proPrice
            ? [{ type: "facts" as const, rows: [{ label: "Pro", value: proPrice }] }]
            : []),
        ],
        cta: checkout,
      };
    case "connect_trial_ending":
      return {
        subject: tr("Your full-speed trial ends soon", "你的全速试用即将结束"),
        preheader: tr(
          "Keep your agents at full speed after the trial.",
          "试用结束后，也可以让你的 agent 保持全速。",
        ),
        eyebrow: tr("Trial ending", "试用即将结束"),
        headline: tr("Your full-speed trial ends soon", "你的全速试用即将结束"),
        intro: trialEnd
          ? tr(
              `Your unlimited trial ends on ${trialEnd} (UTC).`,
              `你的无限调用试用将于 ${trialEnd}（UTC）结束。`,
            )
          : tr("Your unlimited trial ends soon.", "你的无限调用试用即将结束。"),
        hero: "trial-ending-hero.png",
        paragraphs: [
          tr(
            `After the trial, Free goes back to its monthly allowance. Once that is used, calls keep working in the slow lane at ${perMinute} per minute until the monthly reset.`,
            `试用结束后，Free 会回到每月额度；额度用完后，调用会以每分钟 ${perMinute} 次的慢速通道继续，直到月度重置。`,
          ),
        ],
        sections: [
          {
            label: tr("Choose how to continue", "选择接下来的方式"),
            type: "compare",
            options: [
              {
                name: "Free",
                price: "US$0",
                items: [
                  calls
                    ? tr(`${calls} calls a month`, `每月 ${calls} 次调用`)
                    : tr("Monthly allowance", "每月额度"),
                  tr(`Then: ${slowLane}`, `之后：${slowLane}`),
                  tr("Back to full speed at the monthly reset", "月度重置后恢复"),
                ],
              },
              {
                name: "Pro",
                price: proPrice ?? tr("Full speed all month", "整月全速"),
                badge: tr("Recommended", "推荐"),
                highlight: true,
                items: [
                  tr("No call cap", "不限调用次数"),
                  tr("No slow lane", "没有慢速通道"),
                  tr("Full speed all month", "整月保持全速"),
                  tr("Cancel any time", "随时可以取消"),
                ],
              },
            ],
          },
          {
            type: "paragraph",
            text: tr(
              "Choose Pro to keep your agents at full speed, with no call cap and no slow lane.",
              "选择 Pro，让你的 agent 保持全速：不限调用次数，也没有慢速通道。",
            ),
          },
        ],
        cta: checkout,
      };
    case "plan_started": {
      const plan = content.plan;
      if (!plan) throw Error("plan_details_required");
      const unlimited = plan.id === "connect-unlimited-v1",
        credits = plan.credits ?? 0,
        yearly = plan.interval === "year";
      return {
        subject: tr(`Your ${plan.label} plan is active`, `你的 ${plan.label} 套餐已开通`),
        preheader: tr(`Thanks for choosing ${plan.label}.`, `感谢选择 ${plan.label}。`),
        eyebrow: tr("Plan confirmed", "套餐已开通"),
        headline: tr(`Thanks, ${plan.label} is active`, `感谢订阅，${plan.label} 已开通`),
        intro: tr("Everything below is ready to use right now.", "下面这些现在就可以使用。"),
        hero: "plan-started-hero.png",
        paragraphs: [
          unlimited && credits > 0
            ? tr(
                `Your agents now run at full speed: no monthly call cap and no slow lane. ${credits.toLocaleString("en")} Arc Credits are ready for each month you have paid for.`,
                `你的 agent 现在可以全速运行：不限每月调用次数，也没有慢速通道。每个已付费月份都有 ${credits.toLocaleString("en")} Arc Credits 可用。`,
              )
            : unlimited
              ? tr(
                  "Your agents now run at full speed: no monthly call cap and no slow lane.",
                  "你的 agent 现在可以全速运行：不限每月调用次数，也没有慢速通道。",
                )
              : tr(
                  "Your monthly Credits are ready for Arc, along with unlimited Connect calls.",
                  "本月 Credits 已可用于 Arc，Connect 调用也不限次数。",
                ),
        ],
        sections: [
          {
            label: tr("Included now", "现在可以使用"),
            type: "checklist",
            items: unlimited
              ? [
                  tr("No monthly Connect call cap", "不限每月 Connect 调用次数"),
                  tr("No slow lane: agents run at full speed", "没有慢速通道，agent 全速运行"),
                  ...(credits > 0
                    ? [
                        tr(
                          `${credits.toLocaleString("en")} Arc Credits each month`,
                          `每月 ${credits.toLocaleString("en")} Arc Credits`,
                        ),
                      ]
                    : []),
                ]
              : [
                  tr("Monthly Credits for Arc", "每月 Arc Credits"),
                  tr("Unlimited Connect calls", "不限次数的 Connect 调用"),
                ],
          },
          {
            label: tr("Your subscription", "订阅详情"),
            type: "facts",
            rows: [
              { label: tr("Plan", "套餐"), value: plan.label },
              {
                label: tr("Price", "价格"),
                value: yearly
                  ? tr(`${dollars(plan.cents)}/year`, `${dollars(plan.cents)}/年`)
                  : tr(`${dollars(plan.cents)}/month`, `${dollars(plan.cents)}/月`),
              },
              ...(plan.periodEnd
                ? [{ label: tr("Renews on", "续费日期"), value: date(plan.periodEnd) }]
                : []),
            ],
          },
          {
            type: "paragraph",
            text: tr(
              "You can review usage, change or cancel your plan at any time in Settings → Plan & usage. Stripe sends your payment receipt separately.",
              "你可以随时在“设置 → 套餐与用量”中查看用量、变更或取消套餐。Stripe 会另外发送付款收据。",
            ),
          },
        ],
        cta: { href: content.links.billing, label: tr("View plan & usage", "查看套餐与用量") },
      };
    }
  }
}

function sectionHtml(section: Section) {
  const label = section.label ? emailLabel(section.label) : "";
  switch (section.type) {
    case "paragraph":
      return label + emailParagraph(escapeHtml(section.text));
    case "facts":
      return label + emailFacts(section.rows);
    case "cards":
      return label + emailSteps(section.cards, EMAIL_MARK);
    case "timeline":
      return label + emailTimeline(section.stages, EMAIL_MARK);
    case "compare":
      return label + emailCompare(section.options, EMAIL_MARK);
    case "checklist":
      return label + emailChecklist(section.items, EMAIL_MARK);
  }
}

function sectionText(section: Section) {
  const lines = (() => {
    switch (section.type) {
      case "paragraph":
        return [section.text];
      case "facts":
        return section.rows.map((row) => `${row.label}: ${row.value}`);
      case "cards":
        return emailStepsText(section.cards);
      case "timeline":
        return section.stages.map((stage) => `- ${stage.label}: ${stage.value}`);
      case "compare":
        return section.options.flatMap((option) => [
          `${option.name} (${option.price})`,
          ...option.items.map((item) => `- ${item}`),
        ]);
      case "checklist":
        return section.items.map((item) => `- ${item}`);
    }
  })();
  return [...(section.label ? [section.label] : []), ...lines].join("\n");
}

export function lifecycleEmail(content: LifecycleContent) {
  const zh = content.locale === "zh",
    tr = (en: string, cn: string) => (zh ? cn : en);
  const c = copy(content);
  const unsubscribe = content.links.unsubscribe;
  const body =
    c.paragraphs.map((text) => emailParagraph(escapeHtml(text))).join("") +
    c.sections.map(sectionHtml).join("");
  const footer =
    (unsubscribe
      ? tr(
          "You are receiving this because you have a Remote Arc account.",
          "你收到这封邮件，是因为你注册了 Remote Arc 账号。",
        )
      : tr(
          "This is a confirmation for your Remote Arc account.",
          "这是你的 Remote Arc 账号确认邮件。",
        )) +
    "<br>" +
    (unsubscribe
      ? `<a href="${escapeHtml(unsubscribe)}" style="color:#71717a;text-decoration:underline">${tr("Unsubscribe", "退订")}</a> &nbsp;·&nbsp; `
      : "") +
    `<a href="https://remotearc.app${zh ? "/zh" : ""}/privacy" style="color:#71717a;text-decoration:underline">${tr("Privacy", "隐私政策")}</a>`;
  const signoff = tr("Questions? Just reply to this email.", "有任何问题，直接回复这封邮件即可。");
  const team = tr("The Remote Arc team", "Remote Arc 团队");
  const html = renderEmailShell({
    lang: zh ? "zh-CN" : "en",
    subject: c.subject,
    preheader: c.preheader,
    accent: EMAIL_ACCENT,
    layout: "spotlight",
    eyebrow: c.eyebrow,
    headline: c.headline,
    intro: c.intro,
    hero: { src: art(c.hero), width: 552, height: 276, alt: "" },
    body,
    cta: c.cta,
    signoff: `${escapeHtml(signoff)}<br><strong style="color:#1d1d21;font-weight:600">${escapeHtml(team)}</strong>`,
    footer,
  });
  const text = [
    c.headline,
    c.intro,
    ...c.paragraphs,
    ...c.sections.map(sectionText),
    `${c.cta.label}: ${c.cta.href}`,
    `${signoff}\n${team}`,
    ...(unsubscribe ? [`${tr("Unsubscribe", "退订")}: ${unsubscribe}`] : []),
  ].join("\n\n");
  return { subject: c.subject, html, text };
}
