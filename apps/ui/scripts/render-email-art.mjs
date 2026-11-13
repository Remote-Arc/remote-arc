// Renders the illustrations used in lifecycle and follow-up emails into apps/ui/public/email-art.
// Mail clients drop SVG, CSS effects and web fonts, so the artwork is drawn here
// with HTML and CSS and exported as images that every client shows.
//
// Usage: pnpm --filter @remotearc/ui email-art
// The images carry no words, so one set serves every email language.
import { chromium } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const publicDir = fileURLToPath(new URL("../public/", import.meta.url));
const outDir = publicDir + "email-art/";
const svg = async (path) =>
  "data:image/svg+xml;base64," + (await readFile(publicDir + path)).toString("base64");

// The website's dark canvas: every hero image sits on exactly this colour so it
// blends into the email's dark header.
const CANVAS = "#111114";
const SKY = "#38bdf8";
const SKY_LIGHT = "#7dd3fc";
const VIOLET = "#b7a3cd";

const logo = `<svg viewBox="0 0 64 64" fill="none"><defs><linearGradient id="g" x1="8" y1="48" x2="56" y2="16" gradientUnits="userSpaceOnUse"><stop stop-color="${SKY_LIGHT}"/><stop offset="1" stop-color="${SKY}"/></linearGradient></defs><path d="M10 42C15 20 27 12 44 17C50 19 54 24 56 30" stroke="url(#g)" stroke-width="7" stroke-linecap="round"/><path d="M54 42C49 29 42 24 32 24C22 24 15 31 10 42" stroke="url(#g)" stroke-width="7" stroke-linecap="round" opacity=".78"/><circle cx="10" cy="42" r="5" fill="${SKY_LIGHT}"/><circle cx="54" cy="42" r="5" fill="${SKY}"/><circle cx="32" cy="24" r="3.5" fill="#F0F9FF"/></svg>`;

const base = `*{box-sizing:border-box;margin:0}html,body{background:${CANVAS}}
.stage{position:relative;width:552px;height:276px;overflow:hidden;background:${CANVAS}}
.stage::after{content:"";position:absolute;inset:0;box-shadow:inset 0 0 36px 22px ${CANVAS};pointer-events:none}
.grid{position:absolute;inset:0;background-image:radial-gradient(rgba(255,255,255,.07) 1px,transparent 1px);background-size:18px 18px;mask-image:radial-gradient(ellipse at center,#000 30%,transparent 75%)}
.glow{position:absolute;border-radius:50%;filter:blur(30px)}
.tile{position:absolute;display:flex;align-items:center;justify-content:center;border-radius:12px;background:#1b1b21;border:1px solid rgba(255,255,255,.1);box-shadow:0 8px 24px rgba(0,0,0,.45)}
.tile img{width:22px;height:22px}
.hub{border-radius:22px;background:linear-gradient(160deg,#1f2229,#141418);border:1px solid rgba(125,211,252,.35);box-shadow:0 0 0 6px rgba(56,189,248,.06),0 0 60px rgba(56,189,248,.35),0 18px 40px rgba(0,0,0,.6)}
svg.lines{position:absolute;inset:0}`;

// The person's AI on the left, Remote Arc in the middle, their computers on the right.
async function welcome() {
  const left = [
    ["ai-openai.svg", 64],
    ["ai-claude.svg", 116],
    ["ai-cursor.svg", 168],
    ["ai-gemini-four-color-2025.svg", 220],
  ];
  const right = [
    ["platform-brands/macos.svg", 64],
    ["platform-brands/windows.svg", 116],
    ["platform-brands/linux.svg", 168],
    ["platform-brands/browser.svg", 220],
  ];
  const cx = 276,
    cy = 142;
  const curve = (x, y, toLeft) => {
    const ex = toLeft ? cx - 44 : cx + 44;
    const mx = (x + ex) / 2;
    return `M${x} ${y} C${mx} ${y} ${mx} ${cy} ${ex} ${cy}`;
  };
  const paths = [
    ...left.map(([, y]) => curve(102, y, true)),
    ...right.map(([, y]) => curve(450, y, false)),
  ];
  // A bright dot partway along each curve, as if a request is on its way.
  const dot = (y, toLeft, t) => {
    const x0 = toLeft ? 102 : 450,
      ex = toLeft ? cx - 44 : cx + 44,
      mx = (x0 + ex) / 2,
      u = 1 - t;
    const bez = (a, b, c, d) =>
      u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d;
    return [bez(x0, mx, mx, ex), bez(y, y, cy, cy)];
  };
  const dots = [
    ...left.map(([, y], i) => dot(y, true, 0.35 + i * 0.12)),
    ...right.map(([, y], i) => dot(y, false, 0.62 - i * 0.1)),
  ];
  const tiles = async (items, x, white) =>
    (
      await Promise.all(
        items.map(
          async ([path, y]) =>
            `<div class="tile" style="left:${x}px;top:${y - 19}px;width:38px;height:38px;${white ? "background:#f4f4f6" : ""}"><img src="${await svg(path)}" style="${path.includes("openai") || path.includes("cursor") ? "filter:invert(1)" : ""}"></div>`,
        ),
      )
    ).join("");
  return `<div class="stage">
<div class="grid"></div>
<div class="glow" style="left:186px;top:52px;width:180px;height:180px;background:rgba(56,189,248,.28)"></div>
<svg class="lines" viewBox="0 0 552 276"><defs>
<linearGradient id="l" x1="0" x2="1"><stop offset="0" stop-color="${SKY}" stop-opacity=".15"/><stop offset="1" stop-color="${SKY}" stop-opacity=".8"/></linearGradient>
<linearGradient id="r" x1="1" x2="0"><stop offset="0" stop-color="${VIOLET}" stop-opacity=".15"/><stop offset="1" stop-color="${SKY_LIGHT}" stop-opacity=".8"/></linearGradient></defs>
${paths.map((d, i) => `<path d="${d}" fill="none" stroke="url(#${i < 4 ? "l" : "r"})" stroke-width="1.6"/>`).join("")}
${dots.map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="5" fill="${i < 4 ? SKY : SKY_LIGHT}" opacity=".25"/><circle cx="${x}" cy="${y}" r="2.4" fill="#e0f2fe"/>`).join("")}
</svg>
${await tiles(left, 64, false)}${await tiles(right, 450, true)}
<div class="tile hub" style="left:${cx - 44}px;top:${cy - 44}px;width:88px;height:88px">${logo.replace("<svg", '<svg width="54" height="54"')}</div>
</div>`;
}

// A full ring with an infinity mark: no call cap while the trial runs.
function trialStarted() {
  const r = 78,
    c = 2 * Math.PI * r;
  const streaks = Array.from({ length: 9 }, (_, i) => {
    const y = 40 + i * 25,
      w = 60 + ((i * 37) % 70);
    return `<rect x="${24 + ((i * 53) % 60)}" y="${y}" width="${w}" height="2" rx="1" fill="url(#s)"/><rect x="${552 - 24 - w - ((i * 41) % 60)}" y="${y + 12}" width="${w}" height="2" rx="1" fill="url(#s2)"/>`;
  });
  return `<div class="stage"><div class="grid"></div>
<div class="glow" style="left:176px;top:38px;width:200px;height:200px;background:rgba(56,189,248,.3)"></div>
<svg class="lines" viewBox="0 0 552 276"><defs>
<linearGradient id="ring" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${SKY_LIGHT}"/><stop offset=".6" stop-color="${SKY}"/><stop offset="1" stop-color="${VIOLET}"/></linearGradient>
<linearGradient id="s" x1="0" x2="1"><stop stop-color="${SKY}" stop-opacity="0"/><stop offset="1" stop-color="${SKY}" stop-opacity=".55"/></linearGradient>
<linearGradient id="s2" x1="1" x2="0"><stop stop-color="${VIOLET}" stop-opacity="0"/><stop offset="1" stop-color="${VIOLET}" stop-opacity=".45"/></linearGradient>
<filter id="blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6"/></filter></defs>
${streaks.join("")}
<circle cx="276" cy="138" r="${r + 22}" fill="${CANVAS}" opacity=".85"/>
<circle cx="276" cy="138" r="${r}" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="12"/>
<circle cx="276" cy="138" r="${r}" fill="none" stroke="url(#ring)" stroke-width="12" stroke-linecap="round" stroke-dasharray="${c}" filter="url(#blur)" opacity=".7"/>
<circle cx="276" cy="138" r="${r}" fill="none" stroke="url(#ring)" stroke-width="10" stroke-linecap="round" stroke-dasharray="${c}"/>
<path d="M276 138c-12-15-22-21-33-21-12 0-21 9-21 21s9 21 21 21c11 0 21-6 33-21zm0 0c12 15 22 21 33 21 12 0 21-9 21-21s-9-21-21-21c-11 0-21 6-33 21z" fill="none" stroke="url(#ring)" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>
</svg></div>`;
}

// Seven day segments, six used and the last one still lit.
function trialEnding() {
  const cx = 276,
    cy = 138,
    r = 82;
  const seg = (i) => {
    const gap = 0.07,
      a0 = -Math.PI / 2 + (i / 7) * Math.PI * 2 + gap,
      a1 = -Math.PI / 2 + ((i + 1) / 7) * Math.PI * 2 - gap;
    const p = (a) => `${cx + Math.cos(a) * r} ${cy + Math.sin(a) * r}`;
    return `M${p(a0)} A${r} ${r} 0 0 1 ${p(a1)}`;
  };
  const segments = Array.from({ length: 7 }, (_, i) =>
    i < 6
      ? `<path d="${seg(i)}" stroke="rgba(255,255,255,.13)" stroke-width="12" stroke-linecap="round" fill="none"/>`
      : `<path d="${seg(i)}" stroke="#fbbf24" stroke-width="16" stroke-linecap="round" fill="none" filter="url(#blur)" opacity=".8"/><path d="${seg(i)}" stroke="url(#amber)" stroke-width="12" stroke-linecap="round" fill="none"/>`,
  );
  return `<div class="stage"><div class="grid"></div>
<div class="glow" style="left:150px;top:4px;width:150px;height:130px;background:rgba(251,191,36,.2)"></div>
<div class="glow" style="left:170px;top:70px;width:180px;height:160px;background:rgba(56,189,248,.14)"></div>
<svg class="lines" viewBox="0 0 552 276"><defs>
<linearGradient id="amber" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fde68a"/><stop offset="1" stop-color="#f59e0b"/></linearGradient>
<filter id="blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6"/></filter></defs>
${segments.join("")}
<circle cx="${cx}" cy="${cy}" r="50" fill="#18181d" stroke="rgba(255,255,255,.1)"/>
<circle cx="${cx}" cy="${cy}" r="30" fill="none" stroke="${SKY_LIGHT}" stroke-width="5"/>
<path d="M${cx} ${cy - 17}V${cy}l11 8" stroke="${SKY_LIGHT}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
</svg></div>`;
}

// The Remote Arc tile with a confirmed check and soft rings.
function planStarted() {
  const sparks = [
    [150, 70, 3],
    [404, 60, 2.5],
    [120, 190, 2],
    [430, 200, 3],
    [196, 236, 2],
    [360, 34, 2],
    [470, 120, 2],
    [84, 120, 2.5],
  ];
  return `<div class="stage"><div class="grid"></div>
<div class="glow" style="left:186px;top:48px;width:180px;height:180px;background:rgba(56,189,248,.3)"></div>
<svg class="lines" viewBox="0 0 552 276">
${[70, 100, 132].map((r, i) => `<circle cx="276" cy="138" r="${r}" fill="none" stroke="${SKY_LIGHT}" stroke-opacity="${0.22 - i * 0.06}" stroke-width="1.2"/>`).join("")}
${sparks.map(([x, y, s]) => `<path d="M${x} ${y - s * 3}L${x + s} ${y - s}L${x + s * 3} ${y}L${x + s} ${y + s}L${x} ${y + s * 3}L${x - s} ${y + s}L${x - s * 3} ${y}L${x - s} ${y - s}Z" fill="${SKY_LIGHT}" opacity=".7"/>`).join("")}
</svg>
<div class="tile hub" style="left:226px;top:88px;width:100px;height:100px;border-radius:26px">${logo.replace("<svg", '<svg width="62" height="62"')}</div>
<div style="position:absolute;left:304px;top:72px;width:40px;height:40px;border-radius:20px;background:linear-gradient(140deg,#4ade80,#16a34a);border:3px solid ${CANVAS};box-shadow:0 0 24px rgba(74,222,128,.55);display:flex;align-items:center;justify-content:center">
<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></div>
</div>`;
}

// Two speech bubbles meeting at the Remote Arc tile: a personal follow-up and the reply.
function followup() {
  const bubble = (x, y, w, h, tail, stroke, fill, inner) =>
    `<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;border-radius:16px;background:${fill};border:1px solid ${stroke};box-shadow:0 10px 28px rgba(0,0,0,.5)">${inner}<div style="position:absolute;${tail}:22px;bottom:-7px;width:14px;height:14px;background:${fill};border-right:1px solid ${stroke};border-bottom:1px solid ${stroke};transform:rotate(45deg)"></div></div>`;
  const line = (w, color, opacity) =>
    `<div style="height:6px;width:${w}px;border-radius:3px;background:${color};opacity:${opacity};margin:0 0 9px"></div>`;
  const dots = [0, 1, 2]
    .map(
      (i) =>
        `<span style="display:inline-block;width:9px;height:9px;border-radius:5px;margin:0 4px;background:${SKY_LIGHT};opacity:${1 - i * 0.28}"></span>`,
    )
    .join("");
  return `<div class="stage"><div class="grid"></div>
<div class="glow" style="left:186px;top:52px;width:180px;height:180px;background:rgba(56,189,248,.26)"></div>
<div class="glow" style="left:330px;top:120px;width:130px;height:110px;background:rgba(183,163,205,.16)"></div>
<svg class="lines" viewBox="0 0 552 276"><path d="M186 118 C210 118 214 138 232 138" fill="none" stroke="${SKY}" stroke-opacity=".55" stroke-width="1.6"/><path d="M320 138 C338 138 342 164 366 164" fill="none" stroke="${VIOLET}" stroke-opacity=".55" stroke-width="1.6"/></svg>
${bubble(58, 70, 128, 82, "right", "rgba(125,211,252,.35)", "#1b1b21", `<div style="padding:20px 18px 0">${line(84, SKY_LIGHT, 0.9)}${line(64, "#f4f4f6", 0.28)}${line(44, "#f4f4f6", 0.18)}</div>`)}
${bubble(366, 126, 128, 70, "left", "rgba(183,163,205,.4)", "#1f1d26", `<div style="padding:26px 0 0;text-align:center">${dots}</div>`)}
<div class="tile hub" style="left:232px;top:94px;width:88px;height:88px">${logo.replace("<svg", '<svg width="54" height="54"')}</div>
</div>`;
}

// A code window beside a branch graph: work on a worktree branch picked up and continued.
function coding() {
  const code = [
    [0, 64, SKY_LIGHT],
    [16, 120, "#f4f4f6"],
    [16, 88, VIOLET],
    [32, 104, "#f4f4f6"],
    [16, 56, "#f4f4f6"],
    [0, 36, SKY_LIGHT],
  ]
    .map(
      ([indent, w, color]) =>
        `<div style="height:6px;width:${w}px;margin:0 0 12px ${indent}px;border-radius:3px;background:${color};opacity:${color === "#f4f4f6" ? 0.28 : 0.85}"></div>`,
    )
    .join("");
  const dots = ["#f87171", "#fbbf24", "#4ade80"]
    .map(
      (color) =>
        `<span style="display:inline-block;width:8px;height:8px;border-radius:4px;margin-right:6px;background:${color};opacity:.7"></span>`,
    )
    .join("");
  return `<div class="stage"><div class="grid"></div>
<div class="glow" style="left:120px;top:60px;width:200px;height:170px;background:rgba(56,189,248,.22)"></div>
<div class="glow" style="left:350px;top:90px;width:140px;height:120px;background:rgba(183,163,205,.16)"></div>
<div style="position:absolute;left:96px;top:58px;width:226px;height:162px;border-radius:14px;background:#18181d;border:1px solid rgba(255,255,255,.1);box-shadow:0 18px 40px rgba(0,0,0,.6)">
<div style="height:28px;padding:10px 0 0 14px;border-bottom:1px solid rgba(255,255,255,.07)">${dots}</div>
<div style="padding:18px 20px 0">${code}</div>
<div style="position:absolute;left:62px;top:131px;width:2px;height:14px;background:${SKY_LIGHT}"></div></div>
<svg class="lines" viewBox="0 0 552 276"><defs><filter id="blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="5"/></filter></defs>
<path d="M370 70 V206" stroke="rgba(255,255,255,.18)" stroke-width="3" stroke-linecap="round"/>
<path d="M370 104 C370 124 420 120 420 140 V176" fill="none" stroke="${VIOLET}" stroke-opacity=".75" stroke-width="3" stroke-linecap="round"/>
<path d="M420 176 V200" stroke="${SKY}" stroke-width="3" stroke-linecap="round" stroke-dasharray="2 7"/>
${[70, 104, 206].map((y) => `<circle cx="370" cy="${y}" r="6" fill="${CANVAS}" stroke="rgba(255,255,255,.35)" stroke-width="2.5"/>`).join("")}
<circle cx="420" cy="140" r="6" fill="${CANVAS}" stroke="${VIOLET}" stroke-width="2.5"/>
<circle cx="420" cy="176" r="9" fill="${SKY}" filter="url(#blur)" opacity=".8"/>
<circle cx="420" cy="176" r="6.5" fill="${SKY_LIGHT}"/>
</svg></div>`;
}

// Small step icons for the welcome email, drawn on a soft sky tile.
const icon = (paths) =>
  `<div style="width:40px;height:40px;border-radius:11px;background:linear-gradient(150deg,#e0f2fe,#f0f9ff);border:1px solid #bae6fd;display:flex;align-items:center;justify-content:center"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0284c7" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg></div>`;
const icons = {
  "icon-connect": icon(
    '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  ),
  "icon-computer": icon('<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M2 20h20"/>'),
  "icon-work": icon('<path d="m5 16 5-5-5-5"/><path d="M13 18h6"/>'),
  // A finished step, in green, for setup someone has already done.
  "icon-done": `<div style="width:40px;height:40px;border-radius:11px;background:linear-gradient(150deg,#dcfce7,#f0fdf4);border:1px solid #bbf7d0;display:flex;align-items:center;justify-content:center"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></div>`,
};

// The AI clients' logos on white tiles, linking to each setup guide in the welcome
// email. Same source files as the website's client list.
const clientTile = (src) =>
  `<div style="width:44px;height:44px;border-radius:12px;background:#ffffff;border:1px solid #e7e7eb;display:flex;align-items:center;justify-content:center"><img src="${src}" style="width:24px;height:24px"></div>`;
for (const [slug, file] of [
  ["chatgpt", "ai-openai.svg"],
  ["claude", "ai-claude.svg"],
  ["gemini", "ai-gemini-four-color-2025.svg"],
  ["cursor", "ai-cursor.svg"],
])
  icons["client-" + slug] = clientTile(await svg(file));

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 2, viewport: { width: 600, height: 320 } });
await mkdir(outDir, { recursive: true });
const heroes = {
  "welcome-hero": await welcome(),
  "trial-started-hero": trialStarted(),
  "trial-ending-hero": trialEnding(),
  "plan-started-hero": planStarted(),
  "followup-hero": followup(),
  "coding-hero": coding(),
};
for (const [name, html] of Object.entries(heroes)) {
  await page.setContent(`<style>${base}</style>${html}`);
  await page.locator(".stage").screenshot({ path: outDir + name + ".png" });
}
for (const [name, html] of Object.entries(icons)) {
  await page.setContent(`<style>*{margin:0}body{background:transparent}</style>${html}`);
  await page
    .locator("body > div")
    .screenshot({ path: outDir + name + ".png", omitBackground: true });
}
await browser.close();
console.log("Wrote", Object.keys(heroes).length + Object.keys(icons).length, "images to", outDir);
