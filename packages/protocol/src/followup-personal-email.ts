import { followupTemplate } from "./followup-templates.js";
import { followupPresentation } from "./followup-email-content.js";
import { emailStepsText, escapeHtml as escape } from "./email-layout.js";

/** The template id stored for a one-to-one email the operator wrote. It has no
 * header, artwork or button: it reads like a normal email from a person. */
export const PERSONAL_FOLLOWUP_TEMPLATE = "personal";

export type PersonalFollowupEmail = {
  subject: string;
  body: string;
  locale: "en" | "zh";
  replyTo: string;
  unsubscribeUrl: string;
};

/** Plain text links on any https host become links; everything else stays text. */
function linkify(text: string) {
  return text
    .split(/(https:\/\/[^\s<>"]+)/g)
    .map((part) => {
      if (!part.startsWith("https://")) return escape(part).replaceAll("\n", "<br>");
      // Leave closing punctuation outside the link, as mail clients do.
      const [, link = part, tail = ""] = part.match(/^(.*?)([.,;:!?)\]]*)$/) || [];
      try {
        const url = new URL(link);
        if (url.protocol !== "https:" || url.username || url.password) throw Error();
        return (
          '<a href="' +
          escape(url.href) +
          '" style="color:#1d4ed8;text-decoration:underline;overflow-wrap:anywhere">' +
          escape(link) +
          "</a>" +
          escape(tail)
        );
      } catch {
        return escape(part);
      }
    })
    .join("");
}

/** A personal email: the operator's own words, plus a small footer with the reply
 * mailbox and this recipient's unsubscribe link. */
export function renderPersonalFollowupEmail(value: PersonalFollowupEmail) {
  const unsubscribe = new URL(value.unsubscribeUrl);
  if (
    unsubscribe.protocol !== "https:" ||
    unsubscribe.hostname !== "remotearc.app" ||
    unsubscribe.username ||
    unsubscribe.password
  )
    throw Error("invalid_followup_link");
  const zh = value.locale === "zh";
  const reply = zh
    ? "直接回复这封邮件，或写信到 " + value.replyTo + "。"
    : "Reply to this email, or write to " + value.replyTo + ".";
  const stop = zh ? "不再接收这类邮件" : "Stop these emails";
  const body = value.body.replace(/\r\n?/g, "\n").trim();
  const paragraphs = body
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => '<p style="margin:0 0 14px">' + linkify(part) + "</p>")
    .join("");
  const html = [
    '<!doctype html><html lang="' + (zh ? "zh-CN" : "en") + '"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    "<title>" + escape(value.subject) + "</title></head>",
    '<body style="margin:0;padding:0;background:#ffffff">',
    '<div style="max-width:620px;padding:20px 20px 28px;font:15px/1.6 -apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif;color:#1f2328">',
    paragraphs,
    '<p style="margin:28px 0 0;padding-top:12px;border-top:1px solid #e5e7eb;font-size:12px;line-height:1.5;color:#6b7280">',
    "Remote Arc · " + escape(reply) + " ",
    '<a href="' + escape(unsubscribe.href) + '" style="color:#6b7280;text-decoration:underline">',
    escape(stop) + "</a></p>",
    "</div></body></html>",
  ].join("");
  const text = [body, "--", "Remote Arc · " + reply, stop + ": " + unsubscribe.href].join("\n\n");
  return { html, text };
}

/** A template as a starting point for a personal email: its subject and text,
 * with the steps and button link written out as plain lines. */
export function personalFollowupStarter(
  templateId: string,
  locale: "en" | "zh",
  values: { name: string; setupUrl: string; feedbackUrl: string },
) {
  const text = followupTemplate(templateId, locale, values);
  const view = followupPresentation(templateId, locale, values);
  const steps = view.steps.length
    ? [[...(view.stepsLabel ? [view.stepsLabel] : []), ...emailStepsText(view.steps)].join("\n")]
    : [];
  return {
    subject: text.subject,
    body: [text.body, ...steps, view.cta.label + ": " + view.cta.href].join("\n\n"),
  };
}
