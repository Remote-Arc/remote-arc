import {
  emailCards,
  emailFacts,
  emailParagraph,
  escapeHtml,
  renderEmailShell,
  type EmailLayout,
} from "../../../../packages/protocol/src/email-layout.js";

/** Lifecycle emails on the shared layout, in one language per email: the
 * account's locale, or English when it is unknown. Every dynamic value is
 * escaped; links are fixed product routes. */
export type LifecycleKind =
  "welcome" | "connect_trial_started" | "connect_trial_ending" | "plan_started";

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
  links: { setup: string; checkout: string; billing: string; unsubscribe: string | null };
};

const ACCENT = "#167a92";

const dollars = (cents: number) =>
  "US$" + (cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2));

type Copy = {
  subject: string;
  preheader: string;
  layout: EmailLayout;
  eyebrow: string;
  headline: string;
  paragraphs: string[];
  facts?: { label: string; value: string }[];
  cards?: { title: string; body: string }[];
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
  const trialFacts = [
    ...(content.trialEndsAt
      ? [{ label: tr("Trial ends", "试用结束"), value: date(content.trialEndsAt) + " UTC" }]
      : []),
    {
      label: tr("Then on Free", "之后的 Free"),
      value: tr(`Slow lane, ${perMinute} calls a minute`, `慢速通道，每分钟 ${perMinute} 次`),
    },
    ...(price === null
      ? []
      : [
          {
            label: "Pro",
            value: tr(
              `${dollars(price)}/month, about ${dollars(Math.round(price / 30))} a day`,
              `${dollars(price)}/月，约每天 ${dollars(Math.round(price / 30))}`,
            ),
          },
        ]),
  ];

  switch (content.kind) {
    case "welcome":
      return {
        subject: tr("Welcome to Remote Arc", "欢迎使用 Remote Arc"),
        preheader: tr(
          "Let the AI you already use work on your own computers.",
          "让你已经在用的 AI 在自己的电脑上干活。",
        ),
        layout: "spotlight",
        eyebrow: tr("Welcome", "欢迎"),
        headline: tr("Your AI, on your own computers", "让你的 AI 在自己的电脑上干活"),
        paragraphs: [
          tr(
            "Remote Arc lets the AI you already use, such as ChatGPT, Claude or Codex, work on your computers, apps and browser, with permissions you control.",
            "Remote Arc 让你已经在用的 AI（例如 ChatGPT、Claude 或 Codex）在你的电脑、应用和浏览器上干活，权限始终由你掌控。",
          ),
          (calls
            ? tr(
                `Free includes ${calls} Connect calls a month. `,
                `Free 每月包含 ${calls} 次 Connect 调用。`,
              )
            : "") +
            tr(
              `If you run out, your agents keep going: a one-time ${trialDays}-day unlimited Connect trial starts automatically, then calls continue at ${perMinute} per minute until the monthly reset.`,
              `用完也不会断：会自动开启一次 ${trialDays} 天无限调用试用，之后以每分钟 ${perMinute} 次继续，直到月度重置。`,
            ),
        ],
        cards: [
          {
            title: tr("Connect your AI", "连接你的 AI"),
            body: tr(
              "Add Remote Arc to ChatGPT, Claude or Codex.",
              "在 ChatGPT、Claude 或 Codex 中添加 Remote Arc。",
            ),
          },
          {
            title: tr("Pair a computer", "配对一台电脑"),
            body: tr(
              "Install the Agent and approve it from your account.",
              "安装 Agent，并在账号中确认配对。",
            ),
          },
          {
            title: tr("Ask for real work", "交给它真正的工作"),
            body: tr(
              "Files, terminal, browser and apps, within the permissions you set.",
              "文件、终端、浏览器与应用，都在你设定的权限内执行。",
            ),
          },
        ],
        cta: { href: content.links.setup, label: tr("Connect your AI", "连接你的 AI") },
      };
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
        layout: "spotlight",
        eyebrow: tr(`${trialDays}-day trial`, `${trialDays} 天试用`),
        headline: tr("Your agents keep running at full speed", "你的 agent 会继续全速运行"),
        paragraphs: [
          tr(
            `You used this month’s free Connect calls, so instead of stopping your work we started your one-time ${trialDays}-day unlimited Connect trial. There is no call cap until it ends.`,
            `你已用完本月的免费 Connect 调用。为了不打断你的工作，我们为你开启了一次性的 ${trialDays} 天无限调用试用，试用期间不限调用次数。`,
          ),
          tr(
            "After that, Free continues in the slow lane until your allowance resets. Pro keeps your agents at full speed all month.",
            "试用结束后，Free 会进入慢速通道，直到额度重置。Pro 可让你的 agent 整月保持全速。",
          ),
        ],
        facts: trialFacts,
        cta: checkout,
      };
    case "connect_trial_ending":
      return {
        subject: tr("Your full-speed trial ends soon", "你的全速试用即将结束"),
        preheader: tr(
          "Keep your agents at full speed after the trial.",
          "试用结束后，也可以让你的 agent 保持全速。",
        ),
        layout: "letter",
        eyebrow: tr("Trial ending", "试用即将结束"),
        headline: tr("Your full-speed trial ends soon", "你的全速试用即将结束"),
        paragraphs: [
          tr(
            `After the trial, Free goes back to its monthly allowance. Once that is used, calls keep working in the slow lane at ${perMinute} per minute until the monthly reset.`,
            `试用结束后，Free 会回到每月额度；额度用完后，调用会以每分钟 ${perMinute} 次的慢速通道继续，直到月度重置。`,
          ),
          tr(
            "Choose Pro to keep your agents at full speed, with no call cap and no slow lane.",
            "选择 Pro，让你的 agent 保持全速：不限调用次数，也没有慢速通道。",
          ),
        ],
        facts: trialFacts,
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
        layout: "letter",
        eyebrow: tr("Plan confirmed", "套餐已开通"),
        headline: tr(`Thanks, ${plan.label} is active`, `感谢订阅，${plan.label} 已开通`),
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
          tr(
            "You can review usage, change or cancel your plan at any time in Settings → Plan & usage. Stripe sends your payment receipt separately.",
            "你可以随时在“设置 → 套餐与用量”中查看用量、变更或取消套餐。Stripe 会另外发送付款收据。",
          ),
        ],
        facts: [
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
        cta: { href: content.links.billing, label: tr("View plan & usage", "查看套餐与用量") },
      };
    }
  }
}

export function lifecycleEmail(content: LifecycleContent) {
  const zh = content.locale === "zh",
    tr = (en: string, cn: string) => (zh ? cn : en);
  const c = copy(content);
  const unsubscribe = content.links.unsubscribe;
  const body =
    c.paragraphs.map((text) => emailParagraph(escapeHtml(text))).join("") +
    (c.facts ? emailFacts(c.facts) : "") +
    (c.cards ? emailCards(c.cards, ACCENT) : "");
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
      ? `<a href="${escapeHtml(unsubscribe)}" style="color:#6a7385;text-decoration:underline">${tr("Unsubscribe", "退订")}</a> &nbsp;·&nbsp; `
      : "") +
    `<a href="https://remotearc.app${zh ? "/zh" : ""}/privacy" style="color:#6a7385;text-decoration:underline">${tr("Privacy", "隐私政策")}</a>`;
  const signoff = tr("Questions? Just reply to this email.", "有任何问题，直接回复这封邮件即可。");
  const team = tr("The Remote Arc team", "Remote Arc 团队");
  const html = renderEmailShell({
    lang: zh ? "zh-CN" : "en",
    subject: c.subject,
    preheader: c.preheader,
    accent: ACCENT,
    layout: c.layout,
    eyebrow: c.eyebrow,
    headline: c.headline,
    body,
    cta: c.cta,
    signoff: `${escapeHtml(signoff)}<br><strong style="color:#141821">${escapeHtml(team)}</strong>`,
    footer,
  });
  const text = [
    c.headline,
    ...c.paragraphs,
    ...(c.facts ?? []).map((fact) => `${fact.label}: ${fact.value}`),
    ...(c.cards ?? []).map((card, index) => `${index + 1}. ${card.title}: ${card.body}`),
    `${c.cta.label}: ${c.cta.href}`,
    `${signoff}\n${team}`,
    ...(unsubscribe ? [`${tr("Unsubscribe", "退订")}: ${unsubscribe}`] : []),
  ].join("\n\n");
  return { subject: c.subject, html, text };
}
