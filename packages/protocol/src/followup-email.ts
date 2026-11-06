import { FOLLOWUP_UPGRADE_URL } from "./followup-templates.js";
import {
  emailCallout,
  emailCards,
  emailParagraph,
  escapeHtml as escape,
  renderEmailShell,
  safeAccent,
} from "./email-layout.js";
export type FollowupDesign = {
  layout: "letter" | "spotlight" | "digest";
  accent: string;
  eyebrow: string;
  headline: string;
  intro: string;
  buttonLabel: string;
  highlights: { title: string; body: string }[];
};
export const DEFAULT_FOLLOWUP_DESIGN: FollowupDesign = {
  layout: "spotlight",
  accent: "#167a92",
  eyebrow: "",
  headline: "",
  intro: "",
  buttonLabel: "",
  highlights: [],
};
type FollowupEmail = {
  subject: string;
  body: string;
  templateId: string;
  locale: "en" | "zh";
  setupUrl: string;
  feedbackUrl: string;
  unsubscribeUrl: string;
  replyTo: string;
  rewardAvailable?: boolean;
  design?: Partial<FollowupDesign>;
};
export function renderFollowupEmail(value: FollowupEmail) {
  const zh = value.locale === "zh",
    tr = (en: string, cn: string) => (zh ? cn : en);
  const links = [value.setupUrl, value.feedbackUrl, value.unsubscribeUrl].map((link) => {
    const url = new URL(link);
    if (
      url.protocol !== "https:" ||
      url.hostname !== "remotearc.app" ||
      url.username ||
      url.password
    )
      throw Error("invalid_followup_link");
    return url.href;
  });
  const design = { ...DEFAULT_FOLLOWUP_DESIGN, ...value.design },
    accent = safeAccent(design.accent);
  const installation = value.templateId === "finish-mcp",
    upgrade = value.templateId === "quota-upgrade";
  const setup = installation || ["first-connection", "first-result"].includes(value.templateId),
    href = upgrade
      ? FOLLOWUP_UPGRADE_URL
      : installation
        ? new URL((zh ? "/zh" : "") + "/install/chatgpt", links[0]!).href
        : links[setup ? 0 : 1]!,
    label =
      design.buttonLabel ||
      (upgrade
        ? tr("Review upgrade options", "查看升级方案")
        : installation
          ? tr("Open installation instructions", "查看安装指南")
          : setup
            ? tr("Open the setup guide", "查看开始指南")
            : value.templateId === "use-case"
              ? tr("Share your use case", "分享使用场景")
              : tr("Share your feedback", "填写体验反馈"));
  const prose = value.body
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean);
  const linkify = (text: string) =>
    text
      .split(/(https?:\/\/[^\s<>]+)/g)
      .map((part) => {
        if (/^https?:\/\//.test(part)) {
          try {
            const url = new URL(part);
            if (
              url.protocol === "https:" &&
              (url.hostname === "remotearc.app" || url.href === FOLLOWUP_UPGRADE_URL) &&
              !url.username &&
              !url.password
            )
              return (
                '<a href="' +
                escape(url.href) +
                '" style="color:#245b8f;text-decoration:underline;overflow-wrap:anywhere">' +
                escape(part) +
                "</a>"
              );
          } catch {
            /* Leave invalid URLs as readable text. */
          }
        }
        return /^https?:\/\//.test(part) ? "" : escape(part).replaceAll("\n", "<br>");
      })
      .join("");
  const rewardNote =
    !setup && !upgrade && value.rewardAvailable
      ? tr(
          "Feedback rewards are available. Sign in on the feedback page to see the current offer and eligibility. Approved feedback can earn extra Connect calls.",
          "反馈奖励现已开放。登录反馈页面查看当前奖励规则与资格，有效反馈经审核后可获得额外 Connect 调用次数。",
        )
      : "";
  const paragraphs = prose.map((part) => emailParagraph(linkify(part))).join("");
  const highlights = emailCards((design.highlights || []).slice(0, 3), accent);
  const unsubscribe = links[2]!,
    reply = escape(value.replyTo),
    lang = zh ? "zh-CN" : "en";
  const text = [
    design.headline,
    design.intro,
    value.body,
    ...design.highlights.flatMap((card) => [card.title, card.body]),
    rewardNote,
    label + ": " + href,
    "—",
    "Remote Arc · " + value.replyTo,
    tr("Stop follow-up emails:", "停止接收回访邮件："),
    unsubscribe,
  ]
    .filter(Boolean)
    .join("\n\n");
  const html = renderEmailShell({
    lang,
    subject: value.subject,
    preheader: design.intro || value.subject,
    accent,
    layout: design.layout,
    eyebrow: design.eyebrow || tr("From the Remote Arc team", "来自 Remote Arc 团队"),
    headline: design.headline || value.subject,
    ...(design.intro ? { intro: design.intro } : {}),
    body: paragraphs + highlights + (rewardNote ? emailCallout(rewardNote, accent) : ""),
    cta: {
      href,
      label,
      note:
        tr("Opens our official website: ", "按钮将打开我们的官方网站：") + new URL(href).hostname,
    },
    signoff: `${tr("You can also reply to this email. We read every reply.", "也可以直接回复这封邮件，告诉我们你的情况。")}<br><strong style="color:#141821">${tr("The Remote Arc team", "Remote Arc 团队")}</strong>`,
    footer: `Remote Arc · ${reply}<br>${tr("You received this personal follow-up because you requested help or agreed to be contacted.", "你收到这封回访邮件，是因为你曾请求帮助或同意我们就此联系。")}<br><a href="${escape(unsubscribe)}" style="color:#6a7385;text-decoration:underline">${tr("Stop follow-up emails", "停止回访邮件")}</a> &nbsp;·&nbsp; <a href="https://remotearc.app${zh ? "/zh" : ""}/privacy" style="color:#6a7385;text-decoration:underline">${tr("Privacy", "隐私政策")}</a>`,
  });
  return { html, text, action: { href, label } };
}
