import { FOLLOWUP_UPGRADE_URL } from "./followup-templates.js";
import { followupPresentation } from "./followup-email-content.js";
import {
  EMAIL_ACCENT,
  EMAIL_ART_ORIGIN,
  EMAIL_MARK,
  emailCallout,
  emailCards,
  emailLabel,
  emailParagraph,
  emailSteps,
  emailStepsText,
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
/** The automated emails' look: the website's ink button on a dark header. Empty
 * text fields fall back to the template's own eyebrow, headline, intro and button. */
export const DEFAULT_FOLLOWUP_DESIGN: FollowupDesign = {
  layout: "spotlight",
  accent: EMAIL_ACCENT,
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
  const [setupUrl, feedbackUrl, unsubscribe] = [
    value.setupUrl,
    value.feedbackUrl,
    value.unsubscribeUrl,
  ].map((link) => {
    const url = new URL(link);
    if (
      url.protocol !== "https:" ||
      url.hostname !== "remotearc.app" ||
      url.username ||
      url.password
    )
      throw Error("invalid_followup_link");
    return url.href;
  }) as [string, string, string];
  const design = { ...DEFAULT_FOLLOWUP_DESIGN, ...value.design };
  const accent = safeAccent(design.accent, EMAIL_ACCENT);
  // Steps, ticks and links use the sky blue beside the ink button, like the
  // automated emails; a colour the admin picked is used everywhere.
  const mark = accent === EMAIL_ACCENT ? EMAIL_MARK : accent;
  const view = followupPresentation(value.templateId, value.locale, { setupUrl, feedbackUrl });
  const href = view.cta.href,
    label = design.buttonLabel || view.cta.label,
    headline = design.headline || view.headline,
    intro = design.intro || view.intro;
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
                '" style="color:' +
                mark +
                ';font-weight:600;text-decoration:underline;overflow-wrap:anywhere">' +
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
    view.asksForFeedback && value.rewardAvailable
      ? tr(
          "Feedback rewards are available. Sign in on the feedback page to see the current offer and eligibility. Approved feedback can earn extra Connect calls.",
          "反馈奖励现已开放。登录反馈页面查看当前奖励规则与资格，有效反馈经审核后可获得额外 Connect 调用次数。",
        )
      : "";
  const highlights = (design.highlights || []).slice(0, 3);
  const steps = view.steps.length
    ? (view.stepsLabel ? emailLabel(view.stepsLabel) : "") + emailSteps(view.steps, mark)
    : "";
  const signoff = tr(
      "Questions? Just reply to this email. We read every reply.",
      "有任何问题，直接回复这封邮件即可，每封回复我们都会看。",
    ),
    team = tr("The Remote Arc team", "Remote Arc 团队");
  const text = [
    headline,
    intro,
    value.body,
    ...(view.steps.length
      ? [[...(view.stepsLabel ? [view.stepsLabel] : []), ...emailStepsText(view.steps)].join("\n")]
      : []),
    ...highlights.flatMap((card) => [card.title, card.body]),
    rewardNote,
    label + ": " + href,
    `${signoff}\n${team}`,
    "Remote Arc · " + value.replyTo,
    tr("Stop follow-up emails:", "停止接收回访邮件："),
    unsubscribe,
  ]
    .filter(Boolean)
    .join("\n\n");
  const footerLink = 'style="color:#71717a;text-decoration:underline"';
  const html = renderEmailShell({
    lang: zh ? "zh-CN" : "en",
    subject: value.subject,
    preheader: intro || value.subject,
    accent,
    layout: design.layout,
    eyebrow: design.eyebrow || view.eyebrow,
    headline: headline || value.subject,
    ...(intro ? { intro } : {}),
    hero: { src: EMAIL_ART_ORIGIN + view.hero, width: 552, height: 276, alt: "" },
    body:
      prose.map((part) => emailParagraph(linkify(part))).join("") +
      steps +
      emailCards(highlights, mark) +
      (rewardNote ? emailCallout(rewardNote, mark) : ""),
    cta: { href, label },
    signoff: `${escape(signoff)}<br><strong style="color:#1d1d21;font-weight:600">${escape(team)}</strong>`,
    footer:
      tr(
        "You received this personal follow-up because you requested help or agreed to be contacted.",
        "你收到这封回访邮件，是因为你曾请求帮助或同意我们就此联系。",
      ) +
      `<br><a href="${escape(unsubscribe)}" ${footerLink}>${tr("Stop follow-up emails", "停止回访邮件")}</a> &nbsp;·&nbsp; <a href="https://remotearc.app${zh ? "/zh" : ""}/privacy" ${footerLink}>${tr("Privacy", "隐私政策")}</a>`,
  });
  return { html, text, action: { href, label } };
}
