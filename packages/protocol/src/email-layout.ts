/** Shared layout for Remote Arc emails: table-based for mail clients, inline
 * styles only, light colour scheme. Callers pass escaped or trusted HTML for
 * `body`, `signoff` and `footer`; every other field is plain text.
 *
 * The look follows remotearc.app: a dark header like the website, neutral ink
 * on white below it, hairline rules and one accent colour. Mail clients drop
 * SVG and most CSS effects, so artwork comes in as hosted images
 * (apps/ui/public/email-art) and every block still reads with images off. */
export type EmailLayout = "spotlight" | "letter" | "digest";
export type EmailImage = { src: string; width: number; height: number; alt: string };
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
  /** Artwork under the headline. In the spotlight layout it sits on the dark header. */
  hero?: EmailImage;
  body: string;
  cta?: { href: string; label: string; note?: string };
  signoff?: string;
  footer: string;
};

/** Where email artwork is served from: the public website. */
export const EMAIL_ART_ORIGIN = "https://remotearc.app/email-art/";

/** The website's ink, for the button in every product email. */
export const EMAIL_ACCENT = "#1d1d21";
/** A deep sky blue for steps, timelines, ticks and links beside the ink button. */
export const EMAIL_MARK = "#0369a1";

/** The AI clients with a setup guide on the website, in the website's order. */
export const EMAIL_AI_CLIENTS = [
  { slug: "chatgpt", name: "ChatGPT" },
  { slug: "claude", name: "Claude" },
  { slug: "gemini", name: "Gemini" },
  { slug: "cursor", name: "Cursor" },
] as const;

/** Commands that install the Agent. install.sh starts it after a first install. */
export const AGENT_INSTALL_COMMANDS = {
  npx: "npx remotelink@latest",
  script: "curl -fsSL https://remotearc.app/install.sh | sh",
} as const;

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
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue','PingFang SC','Hiragino Sans GB','Microsoft YaHei',Arial,sans-serif";
const MONO = "ui-monospace,SFMono-Regular,Menlo,Consolas,'Liberation Mono',monospace";

// Palette from the website: dark canvas and its text, then ink, body text,
// muted, faint, rule, wash and page for the light part.
const NIGHT = "#111114",
  NIGHT_TEXT = "#f4f4f6",
  NIGHT_MUTED = "#a1a1aa",
  SKY = "#7dd3fc",
  INK = "#1d1d21",
  TEXT = "#3f3f46",
  MUTED = "#71717a",
  FAINT = "#a1a1aa",
  RULE = "#e7e7eb",
  WASH = "#f6f6f8",
  PAGE = "#f0f0f3";

const isNeutral = (hex: string) => {
  const [r, g, b] = channels(hex);
  return Math.max(r!, g!, b!) - Math.min(r!, g!, b!) < 24;
};
/** The accent where it is dark enough to read as text on white, otherwise muted ink. */
const accentText = (accent: string) => (contrastInk(accent) === "#ffffff" ? accent : MUTED);
/** The accent, lightened to read on the dark header. A neutral accent uses the brand sky. */
const accentOnNight = (accent: string) => (isNeutral(accent) ? SKY : shade(accent, 0.45));

const table = (style: string, rows: string, width: string | null = "100%") =>
  `<table role="presentation"${width ? ` width="${width}"` : ""} cellpadding="0" cellspacing="0" border="0" style="${style}">${rows}</table>`;

const image = (img: EmailImage, style = "") =>
  `<img src="${escapeHtml(img.src)}" width="${img.width}" height="${img.height}" alt="${escapeHtml(img.alt)}" style="display:block;width:100%;max-width:${img.width}px;height:auto;border:0;outline:none;text-decoration:none;${style}">`;

const check = (color: string, background: string) =>
  `<td width="26" valign="top" style="padding:1px 0 0"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="18" height="18" align="center" bgcolor="${background}" style="width:18px;height:18px;border-radius:9px;background:${background};font-size:11px;line-height:18px;font-weight:700;color:${color}">&#10003;</td></tr></table></td>`;

/** A small uppercase label above a block. */
export const emailLabel = (text: string) =>
  `<p style="margin:28px 0 12px;font-size:12px;line-height:1.4;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:${FAINT}">${escapeHtml(text)}</p>`;

export const emailParagraph = (html: string) =>
  `<p style="margin:0 0 16px;font-size:15px;line-height:1.75;color:${TEXT}">${html}</p>`;

/** Numbered steps or features as a ruled list; an icon replaces the number when given.
 * `detail` is trusted HTML shown under the body, such as logo links or commands. */
export function emailCards(
  cards: { title: string; body: string; icon?: string; detail?: string }[],
  accent: string,
) {
  if (!cards.length) return "";
  const mark = accentText(safeAccent(accent));
  const rows = cards
    .map((card, index) => {
      const lead = card.icon
        ? `<td width="56" valign="top" style="padding:16px 0;border-bottom:1px solid ${RULE}"><img src="${escapeHtml(card.icon)}" width="40" height="40" alt="" style="display:block;border:0"></td>`
        : `<td width="40" valign="top" style="padding:17px 0;border-bottom:1px solid ${RULE};font-size:13px;line-height:22px;font-weight:600;color:${mark};letter-spacing:0.5px">${String(index + 1).padStart(2, "0")}</td>`;
      // A step with detail aligns to the top so its title sits beside the icon.
      const align = card.icon && !card.detail ? "middle" : "top";
      const titleGap = card.icon && card.detail ? "padding-top:9px;" : "";
      return `<tr>${lead}<td valign="${align}" style="padding:16px 0 17px;border-bottom:1px solid ${RULE}"><p style="margin:0 0 3px;${titleGap}font-size:15px;line-height:1.5;font-weight:600;color:${INK}">${escapeHtml(card.title)}</p><p style="margin:0;font-size:14px;line-height:1.65;color:${MUTED}">${escapeHtml(card.body)}</p>${card.detail ?? ""}</td></tr>`;
    })
    .join("");
  return table(`margin:8px 0 28px;border-top:1px solid ${RULE}`, rows);
}

/** A row of linked logo tiles with a caption under each, such as the AI clients
 * someone can connect. `src` is a hosted image drawn at 44 by 44. */
export function emailLogoLinks(items: { href: string; src: string; label: string }[]) {
  if (!items.length) return "";
  const width = Math.floor(100 / items.length) + "%";
  const cells = items
    .map((item) => {
      const href = escapeHtml(item.href),
        label = escapeHtml(item.label);
      return `<td width="${width}" align="center" valign="top" style="padding:0 2px"><a href="${href}" style="text-decoration:none"><img src="${escapeHtml(item.src)}" width="44" height="44" alt="${label}" style="display:block;margin:0 auto;border:0"></a><a href="${href}" style="display:block;margin:7px 0 0;font-size:12px;line-height:1.4;font-weight:600;color:${INK};text-decoration:none">${label}</a></td>`;
    })
    .join("");
  return table("margin:14px 0 4px", `<tr>${cells}</tr>`);
}

/** Commands to copy, each with a short label, in a dark monospace block. */
export function emailCode(lines: { label: string; command: string }[]) {
  if (!lines.length) return "";
  const rows = lines
    .map(
      (line, index) =>
        `<tr><td style="padding:${index ? 10 : 0}px 0 0"><p style="margin:0 0 3px;font-family:${FONT};font-size:11px;line-height:1.4;font-weight:600;letter-spacing:0.6px;text-transform:uppercase;color:${NIGHT_MUTED}">${escapeHtml(line.label)}</p><p style="margin:0;font-family:${MONO};font-size:13px;line-height:1.55;color:${NIGHT_TEXT};word-break:break-all">${escapeHtml(line.command)}</p></td></tr>`,
    )
    .join("");
  return table(
    "margin:14px 0 4px",
    `<tr><td bgcolor="${NIGHT}" style="background:${NIGHT};border-radius:10px;padding:14px 16px">${table("", rows)}</td></tr>`,
  );
}

/** A short text link with an arrow, under a step. */
export const emailTextLink = (href: string, label: string, accent: string) =>
  `<p style="margin:12px 0 0;font-size:13px;line-height:1.5"><a href="${escapeHtml(href)}" style="color:${accentText(safeAccent(accent))};font-weight:600;text-decoration:none">${escapeHtml(label)}&nbsp;&rarr;</a></p>`;

/** A step in a ruled list, with optional linked logos, commands and a text link under it. */
export type EmailStep = {
  title: string;
  body: string;
  /** Hosted icon drawn at 40 by 40; without one the step is numbered. */
  icon?: string;
  logos?: { label: string; href: string; src: string }[];
  commands?: { label: string; command: string }[];
  link?: { label: string; href: string };
};

export const emailSteps = (steps: EmailStep[], accent: string) =>
  emailCards(
    steps.map((step) => ({
      title: step.title,
      body: step.body,
      ...(step.icon ? { icon: step.icon } : {}),
      detail:
        emailLogoLinks(step.logos ?? []) +
        emailCode(step.commands ?? []) +
        (step.link ? emailTextLink(step.link.href, step.link.label, accent) : ""),
    })),
    accent,
  );

/** The same steps for the plain-text part: numbered, with every link and command. */
export const emailStepsText = (steps: EmailStep[]) =>
  steps.map((step, index) =>
    [
      `${index + 1}. ${step.title}: ${step.body}`,
      ...(step.logos ?? []).map((logo) => `   ${logo.label}: ${logo.href}`),
      ...(step.commands ?? []).map((line) => `   ${line.label}:\n      ${line.command}`),
      ...(step.link ? [`   ${step.link.label}: ${step.link.href}`] : []),
    ].join("\n"),
  );

/** A receipt-style block of label and value rows. */
export function emailFacts(rows: { label: string; value: string }[]) {
  if (!rows.length) return "";
  const cells = rows
    .map((row, index) => {
      const rule = index ? `border-top:1px solid ${RULE};` : "";
      return `<tr><td valign="top" style="padding:13px 0 13px 20px;${rule}font-size:13px;line-height:1.5;color:${MUTED}">${escapeHtml(row.label)}</td><td align="right" valign="top" style="padding:13px 20px 13px 16px;${rule}font-size:14px;line-height:1.5;font-weight:600;color:${INK}">${escapeHtml(row.value)}</td></tr>`;
    })
    .join("");
  return table(
    `margin:8px 0 28px;background:${WASH};border-radius:12px`,
    `<tr><td bgcolor="${WASH}" style="border-radius:12px;padding:4px 0">${table("", cells)}</td></tr>`,
  );
}

/** Stages in order, drawn as a segmented bar: done, the current stage, then what comes next. */
export function emailTimeline(
  stages: { label: string; value: string; state: "done" | "current" | "next" }[],
  accent: string,
) {
  if (!stages.length) return "";
  const color = safeAccent(accent),
    width = Math.floor(100 / stages.length) + "%";
  const bar = { done: "#d4d4d8", current: color, next: RULE };
  const cells = stages
    .map((stage, index) => {
      const gap = index < stages.length - 1 ? "padding-right:6px;" : "";
      const strong = stage.state === "current";
      return `<td width="${width}" valign="top" style="${gap}"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td height="6" bgcolor="${bar[stage.state]}" style="height:6px;line-height:6px;font-size:0;border-radius:3px;background:${bar[stage.state]}">&nbsp;</td></tr></table><p style="margin:12px 0 4px;font-size:12px;line-height:1.45;font-weight:600;color:${strong ? accentText(color) : FAINT}">${stage.state === "done" ? "&#10003;&nbsp;" : ""}${escapeHtml(stage.label)}</p><p style="margin:0;font-size:13px;line-height:1.5;font-weight:${strong ? 700 : 500};color:${strong ? INK : MUTED}">${escapeHtml(stage.value)}</p></td>`;
    })
    .join("");
  return table("margin:8px 0 30px", `<tr>${cells}</tr>`);
}

/** Two options side by side; the highlighted one gets the accent border and a badge. */
export function emailCompare(
  options: { name: string; price: string; items: string[]; badge?: string; highlight?: boolean }[],
  accent: string,
) {
  if (!options.length) return "";
  const color = safeAccent(accent),
    ink = contrastInk(color);
  const cells = options
    .map((option, index) => {
      const on = option.highlight === true;
      const items = option.items
        .map(
          (item) =>
            `<tr>${check(on ? ink : MUTED, on ? color : RULE)}<td style="padding:0 0 9px;font-size:13px;line-height:1.55;color:${on ? TEXT : MUTED}">${escapeHtml(item)}</td></tr>`,
        )
        .join("");
      const badge = option.badge
        ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 10px"><tr><td bgcolor="${color}" style="background:${color};border-radius:999px;padding:3px 9px;font-size:11px;line-height:1.4;font-weight:700;color:${ink}">${escapeHtml(option.badge)}</td></tr></table>`
        : `<p class="ra-desk" style="margin:0 0 10px;font-size:11px;line-height:1.4;padding:3px 0">&nbsp;</p>`;
      // Cards share one table row so they stay the same height; a spacer cell separates them.
      const card = `<td class="ra-col" width="48%" bgcolor="${on ? "#ffffff" : WASH}" valign="top" style="padding:20px 18px 12px;background:${on ? "#ffffff" : WASH};border:${on ? `2px solid ${color}` : `1px solid ${RULE}`};border-radius:14px">${badge}<p style="margin:0 0 2px;font-size:15px;line-height:1.4;font-weight:700;color:${INK}">${escapeHtml(option.name)}</p><p style="margin:0 0 14px;font-size:13px;line-height:1.5;color:${on ? accentText(color) : MUTED};font-weight:600">${escapeHtml(option.price)}</p>${table("", items)}</td>`;
      return (
        (index ? `<td class="ra-gap" width="12" style="width:12px;font-size:0">&nbsp;</td>` : "") +
        card
      );
    })
    .join("");
  return table("margin:8px 0 28px", `<tr>${cells}</tr>`);
}

/** A ticked list, for what a plan includes. */
export function emailChecklist(items: string[], accent: string) {
  if (!items.length) return "";
  const color = safeAccent(accent);
  const rows = items
    .map(
      (item) =>
        `<tr>${check(contrastInk(color), color)}<td style="padding:0 0 12px;font-size:14px;line-height:1.6;color:${TEXT}">${escapeHtml(item)}</td></tr>`,
    )
    .join("");
  return table("margin:4px 0 22px", rows);
}

/** A soft callout, for example a reward note. */
export const emailCallout = (text: string, accent: string) =>
  table(
    "margin:4px 0 24px",
    `<tr><td bgcolor="${shade(safeAccent(accent), 0.93)}" style="padding:16px 20px;background:${shade(safeAccent(accent), 0.93)};border-radius:12px;font-size:14px;line-height:1.7;color:${TEXT}">${escapeHtml(text)}</td></tr>`,
  );

export function renderEmailShell(shell: EmailShell) {
  const accent = safeAccent(shell.accent),
    ink = contrastInk(accent);
  const night = shell.layout === "spotlight",
    digest = shell.layout === "digest";
  const color = {
    title: night ? NIGHT_TEXT : INK,
    muted: night ? NIGHT_MUTED : MUTED,
    body: night ? NIGHT_MUTED : TEXT,
    eyebrow: night ? accentOnNight(accent) : accentText(accent),
  };

  const brand = table(
    "",
    `<tr><td width="26" valign="middle"><img src="https://remotearc.app/remote-arc-192.png" width="26" height="26" alt="" style="display:block;border:0;border-radius:7px"></td><td valign="middle" style="padding-left:10px;font-size:15px;line-height:26px;font-weight:600;letter-spacing:-0.1px;color:${color.title}">Remote Arc</td></tr>`,
    null,
  );
  const heading =
    (shell.eyebrow
      ? `<p style="margin:30px 0 12px;font-size:12px;line-height:1.4;font-weight:600;letter-spacing:1.2px;text-transform:uppercase;color:${color.eyebrow}">${escapeHtml(shell.eyebrow)}</p>`
      : `<div style="height:30px;line-height:30px;font-size:0">&nbsp;</div>`) +
    `<h1 class="ra-h1" style="margin:0;font-size:${night ? 30 : 27}px;line-height:1.3;font-weight:700;letter-spacing:-0.4px;color:${color.title};overflow-wrap:anywhere">${escapeHtml(shell.headline)}</h1>` +
    (shell.subheadline
      ? `<p style="margin:8px 0 0;font-size:17px;line-height:1.5;font-weight:600;color:${color.muted}">${escapeHtml(shell.subheadline)}</p>`
      : "") +
    (shell.intro
      ? `<p style="margin:14px 0 0;font-size:16px;line-height:1.7;color:${color.body}">${escapeHtml(shell.intro)}</p>`
      : "");
  const art = shell.hero
    ? `<div style="margin:${night ? 26 : 24}px 0 0">${image(shell.hero, `border-radius:12px;${night ? "" : `border:1px solid ${RULE};`}`)}</div>`
    : "";
  // Spotlight puts the brand, heading and artwork on the website's dark canvas.
  const header = night
    ? `<tr><td bgcolor="${NIGHT}" class="ra-pad" style="background:${NIGHT};padding:30px 24px ${shell.hero ? 24 : 36}px"><div class="ra-inset" style="padding:0 20px">${brand}${heading}</div>${art}</td></tr>`
    : `<tr><td class="ra-pad" style="padding:30px 44px ${digest ? 28 : 0}px;${digest ? `border-bottom:1px solid ${RULE};` : ""}">${brand}${heading}${art}</td></tr>`;

  const cta = shell.cta
    ? table(
        "margin:12px 0 0",
        `<tr><td bgcolor="${accent}" style="border-radius:10px;background:${accent}"><a href="${escapeHtml(shell.cta.href)}" style="display:inline-block;padding:14px 24px;font-family:${FONT};font-size:15px;font-weight:600;line-height:1.2;color:${ink};text-decoration:none;border:1px solid ${accent};border-radius:10px">${escapeHtml(shell.cta.label)}&nbsp;&nbsp;&rarr;</a></td></tr>`,
        null,
      ) +
      (shell.cta.note
        ? `<p style="margin:12px 0 0;font-size:12px;line-height:1.6;color:${FAINT}">${escapeHtml(shell.cta.note)}</p>`
        : "")
    : "";
  const signoff = shell.signoff
    ? table(
        "margin:36px 0 0",
        `<tr><td style="padding-top:24px;border-top:1px solid ${RULE};font-size:14px;line-height:1.75;color:${MUTED}">${shell.signoff}</td></tr>`,
      )
    : "";
  // Padding characters keep mail clients from pulling body text into the preview line.
  const preheaderPad = "&#847;&zwnj;&nbsp;".repeat(40);

  return `<!doctype html><html lang="${shell.lang}" dir="ltr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><style>@media (max-width:520px){.ra-pad{padding-left:20px!important;padding-right:20px!important}.ra-inset{padding:0!important}.ra-h1{font-size:24px!important}.ra-col{display:block!important;width:auto!important}.ra-gap{display:block!important;width:auto!important;height:10px!important}.ra-desk{display:none!important}}</style><title>${escapeHtml(shell.subject)}</title></head><body style="margin:0;padding:0;background:${PAGE};font-family:${FONT};-webkit-font-smoothing:antialiased"><div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all" aria-hidden="true">${escapeHtml(shell.preheader)}${preheaderPad}</div>${table(
    `background:${PAGE}`,
    `<tr><td align="center" bgcolor="${PAGE}" style="padding:36px 12px 44px">${table(
      "width:100%;max-width:600px",
      `<tr><td bgcolor="#ffffff" style="background:#ffffff;border:1px solid ${RULE};border-radius:16px;overflow:hidden">${table(
        "",
        header +
          `<tr><td class="ra-pad" style="padding:${night ? 34 : 28}px 44px 40px">${shell.body}${cta}${signoff}</td></tr>`,
      )}</td></tr><tr><td align="center" style="padding:24px 24px 0;font-size:12px;line-height:1.8;color:${FAINT}">${shell.footer}</td></tr>`,
      "600",
    )}</td></tr>`,
  )}</body></html>`;
}
