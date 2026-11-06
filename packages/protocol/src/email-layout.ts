/** Shared layout for Remote Arc emails: table-based for mail clients, inline
 * styles only, light colour scheme. Callers pass escaped or trusted HTML for
 * `body`, `signoff` and `footer`; every other field is plain text. */
export type EmailLayout = "spotlight" | "letter" | "digest";
export type EmailShell = {
  lang: "en" | "zh-CN";
  subject: string;
  preheader: string;
  accent: string;
  layout: EmailLayout;
  eyebrow: string;
  headline: string;
  /** A short line under the headline, such as a translation. */
  subheadline?: string;
  intro?: string;
  body: string;
  cta?: { href: string; label: string; note?: string };
  signoff?: string;
  footer: string;
};

export const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] as string,
  );

const channels = (hex: string) =>
  [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16));

/** Black or white, whichever reads better on the accent. */
export const contrastInk = (hex: string) => {
  const linear = channels(hex)
      .map((c) => c / 255)
      .map((c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))),
    l = 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!;
  return (l + 0.05) / 0.05 >= 1.05 / (l + 0.05) ? "#000000" : "#ffffff";
};

/** Mix the accent toward white (amount > 0) or black (amount < 0). */
const shade = (hex: string, amount: number) =>
  "#" +
  channels(hex)
    .map((c) => Math.round(amount >= 0 ? c + (255 - c) * amount : c * (1 + amount)))
    .map((c) => c.toString(16).padStart(2, "0"))
    .join("");

export const safeAccent = (value: string | undefined, fallback = "#167a92") =>
  value && /^#[\da-f]{6}$/i.test(value) ? value.toLowerCase() : fallback;

const FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue','PingFang SC','Microsoft YaHei',Arial,sans-serif";

export const emailParagraph = (html: string) =>
  `<p style="margin:0 0 18px;font-size:16px;line-height:1.7;color:#3a4050">${html}</p>`;

/** Numbered feature or step cards. */
export function emailCards(cards: { title: string; body: string }[], accent: string) {
  if (!cards.length) return "";
  const ink = contrastInk(accent);
  const rows = cards
    .map(
      (card, index) =>
        `<tr><td style="padding:0 0 12px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f7f9fc;border:1px solid #e6eaf1;border-radius:12px"><tr><td width="44" valign="top" style="padding:18px 0 18px 18px"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="28" height="28" align="center" bgcolor="${accent}" style="width:28px;height:28px;border-radius:14px;color:${ink};font-size:13px;font-weight:700;font-family:${FONT}">${index + 1}</td></tr></table></td><td valign="top" style="padding:18px 18px 18px 12px"><p style="margin:0 0 4px;font-size:15px;line-height:1.45;font-weight:700;color:#141821">${escapeHtml(card.title)}</p><p style="margin:0;font-size:14px;line-height:1.65;color:#566072">${escapeHtml(card.body)}</p></td></tr></table></td></tr>`,
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 14px">${rows}</table>`;
}

/** A receipt-style box of label and value rows. */
export function emailFacts(rows: { label: string; value: string }[]) {
  if (!rows.length) return "";
  const cells = rows
    .map(
      (row, index) =>
        `<tr><td style="padding:13px 18px;${index ? "border-top:1px solid #e6eaf1;" : ""}font-size:13px;color:#6a7385">${escapeHtml(row.label)}</td><td align="right" style="padding:13px 18px;${index ? "border-top:1px solid #e6eaf1;" : ""}font-size:14px;font-weight:600;color:#141821">${escapeHtml(row.value)}</td></tr>`,
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 22px;background:#f7f9fc;border:1px solid #e6eaf1;border-radius:12px">${cells}</table>`;
}

/** A soft callout, for example a reward note. */
export const emailCallout = (text: string, accent: string) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 20px"><tr><td style="padding:16px 18px;background:${shade(accent, 0.92)};border-left:3px solid ${accent};border-radius:10px;font-size:14px;line-height:1.65;color:#2f3645">${escapeHtml(text)}</td></tr></table>`;

export function renderEmailShell(shell: EmailShell) {
  const accent = safeAccent(shell.accent),
    ink = contrastInk(accent);
  const spotlight = shell.layout === "spotlight",
    digest = shell.layout === "digest";
  const heroText = spotlight ? ink : "#141821",
    heroMuted = spotlight ? ink : "#566072";
  const heroStyle = spotlight
    ? `background:${accent};background-image:linear-gradient(135deg,${accent} 0%,${shade(accent, ink === "#ffffff" ? -0.28 : 0.22)} 100%);`
    : digest
      ? `background:#f7f9fc;border-bottom:1px solid #e6eaf1;`
      : `background:#ffffff;border-top:4px solid ${accent};`;
  const heroBg = spotlight ? ` bgcolor="${accent}"` : digest ? ` bgcolor="#f7f9fc"` : "";
  const pill = spotlight
    ? `background:rgba(${ink === "#ffffff" ? "255,255,255" : "0,0,0"},0.14);color:${ink};`
    : `background:${shade(accent, 0.88)};color:${shade(accent, -0.35)};`;
  const cta = shell.cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:10px 0 0"><tr><td bgcolor="${accent}" style="border-radius:10px;background:${accent}"><a href="${escapeHtml(shell.cta.href)}" style="display:inline-block;padding:14px 26px;font-family:${FONT};font-size:15px;font-weight:700;line-height:1.2;color:${ink};text-decoration:none;border:1px solid ${accent};border-radius:10px">${escapeHtml(shell.cta.label)} &rarr;</a></td></tr></table>${
        shell.cta.note
          ? `<p style="margin:12px 0 0;font-size:12px;line-height:1.6;color:#8a93a3">${escapeHtml(shell.cta.note)}</p>`
          : ""
      }`
    : "";
  return `<!doctype html><html lang="${shell.lang}" dir="ltr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><style>@media (max-width:520px){.ra-pad{padding-left:22px!important;padding-right:22px!important}.ra-h1{font-size:26px!important}}</style><title>${escapeHtml(shell.subject)}</title></head><body style="margin:0;padding:0;background:#eef1f5;font-family:${FONT};-webkit-font-smoothing:antialiased"><div style="display:none;max-height:0;overflow:hidden;opacity:0" aria-hidden="true">${escapeHtml(shell.preheader)}</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#eef1f5" style="background:#eef1f5"><tr><td align="center" style="padding:28px 14px 36px"><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px"><tr><td style="padding:0 6px 18px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td><img src="https://remotearc.app/remote-arc-192.png" width="28" height="28" alt="" style="display:block;border:0;border-radius:7px"></td><td style="padding-left:9px;font-size:16px;font-weight:700;letter-spacing:-0.2px;color:#141821">Remote Arc</td></tr></table></td><td align="right" style="font-size:12px;color:#8a93a3">remotearc.app</td></tr></table></td></tr><tr><td style="background:#ffffff;border:1px solid #e1e6ee;border-radius:16px;overflow:hidden"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td${heroBg} class="ra-pad" style="${heroStyle}padding:38px 36px 34px;color:${heroText}">${
    shell.eyebrow
      ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px"><tr><td style="${pill}padding:5px 11px;border-radius:999px;font-size:11px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase">${escapeHtml(shell.eyebrow)}</td></tr></table>`
      : ""
  }<h1 class="ra-h1" style="margin:0;font-size:30px;line-height:1.25;font-weight:700;letter-spacing:-0.5px;color:${heroText};overflow-wrap:anywhere">${escapeHtml(shell.headline)}</h1>${
    shell.subheadline
      ? `<p style="margin:8px 0 0;font-size:17px;line-height:1.5;font-weight:600;color:${heroMuted};opacity:0.9">${escapeHtml(shell.subheadline)}</p>`
      : ""
  }${
    shell.intro
      ? `<p style="margin:16px 0 0;font-size:16px;line-height:1.65;color:${heroMuted};opacity:0.92">${escapeHtml(shell.intro)}</p>`
      : ""
  }</td></tr><tr><td class="ra-pad" style="padding:32px 36px 34px">${shell.body}${cta}${
    shell.signoff
      ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:30px 0 0"><tr><td style="padding-top:22px;border-top:1px solid #edf0f4;font-size:14px;line-height:1.7;color:#566072">${shell.signoff}</td></tr></table>`
      : ""
  }</td></tr></table></td></tr><tr><td align="center" style="padding:22px 18px 0;font-size:12px;line-height:1.8;color:#8a93a3">${shell.footer}</td></tr></table></td></tr></table></body></html>`;
}
