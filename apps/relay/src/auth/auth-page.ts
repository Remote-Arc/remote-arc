/** Shared lightweight identity pages: no JS runtime, client-side token handling, or external CDN. */
const css = `
:root { color-scheme:dark; --canvas:#111114; --surface:#19191d; --subtle:#222227; --line:#303036; --ink:#eeeef1; --muted:#a2a2ad; --inverse:#19191d; font:16px/1.5 Inter,ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; font-synthesis:none }
* { box-sizing:border-box }
body { min-height:100dvh; margin:0; padding:48px 24px; display:flex; align-items:center; justify-content:center; background:var(--canvas); color:var(--ink) }
.shell { width:100%; max-width:440px }
.brand { display:flex; justify-content:center; align-items:center; gap:11px; margin:0 0 32px; color:var(--ink); font-size:21px; font-weight:600; letter-spacing:-.035em; text-decoration:none }
.brand img { height:36px; width:36px; object-fit:contain }
.card { background:var(--surface); border:1px solid var(--line); border-radius:16px; padding:36px 32px; box-shadow:0 16px 48px #00000014 }
.eyebrow { margin:0 0 12px; font-size:11px; font-weight:500; letter-spacing:.1em; text-transform:uppercase; color:var(--muted) }
h1 { margin:0 0 12px; font-size:28px; line-height:1.25; letter-spacing:-.04em; font-weight:600; color:var(--ink) }
.lead { margin:0 0 28px; font-size:15px; line-height:1.7; color:var(--muted) }
.google { display:flex; align-items:center; justify-content:center; gap:12px; width:100%; min-height:48px; padding:12px 18px; border:1px solid var(--line); border-radius:8px; background:var(--subtle); color:var(--ink); font:inherit; font-size:15px; font-weight:500; line-height:1.4; text-decoration:none; transition:background .15s,border-color .15s }
.google:hover { background:#2c2c32; border-color:#595962 }
.google img { width:22px; height:22px; flex:none }
.divider { display:flex; align-items:center; gap:14px; margin:24px 0; font-size:12px; color:var(--muted); white-space:nowrap }
.divider:before,.divider:after { content:""; height:1px; flex:1; background:var(--line) }
form { display:grid; gap:0; margin:0 }
label { display:block; font-size:14px; color:var(--ink); font-weight:500; margin-bottom:8px }
.field { display:block; width:100%; min-height:48px; border:1px solid var(--line); border-radius:8px; padding:0 14px; background:var(--canvas); color:var(--ink); font:inherit; font-size:16px; line-height:1.4; transition:border-color .15s }
.field:focus { outline:2px solid var(--ink); outline-offset:2px; border-color:var(--ink) }
.field::placeholder { color:#82828e }
.field.code { text-align:center; font-size:24px; font-weight:600; letter-spacing:.24em; font-variant-numeric:tabular-nums }
.primary { display:flex; align-items:center; justify-content:center; min-height:48px; width:100%; border:1px solid var(--ink); border-radius:8px; margin-top:16px; padding:12px 16px; background:var(--ink); color:var(--inverse); font:inherit; font-size:15px; font-weight:600; line-height:1.4; cursor:pointer; transition:background .15s }
.primary:hover { background:#d6d6dc }
.primary:focus-visible,.google:focus-visible,a:focus-visible,summary:focus-visible { outline:2px solid var(--ink); outline-offset:4px }
.note { margin:16px 0 0; font-size:13px; line-height:1.65; color:var(--muted) }
.foot { max-width:400px; margin:24px auto 0; text-align:center; font-size:12px; line-height:1.8; color:var(--muted) }
.foot a,.link { color:var(--ink); font-weight:500; text-decoration:underline; text-underline-offset:3px }
.foot a:hover,.link:hover { color:#fff }
.back { display:inline-flex; align-items:center; gap:8px; margin:0 0 24px; text-decoration:none; color:var(--muted); font-size:14px }
.badge { display:inline-flex; align-items:center; gap:7px; background:var(--subtle); border:1px solid var(--line); color:var(--ink); border-radius:6px; padding:6px 10px; font-size:12px; margin:0 0 20px }
.badge:before { content:"✓" }
.email-highlight { overflow-wrap:anywhere; color:var(--ink); font-weight:600 }
.error { margin:0 0 16px; padding:12px 14px; border-radius:8px; background:#341e22; border:1px solid #69373e; color:#f3b1b8; font-size:14px }
details { margin-top:24px; border-top:1px solid var(--line); padding-top:18px; color:var(--muted) }
summary { cursor:pointer; font-size:13px }
details form { margin-top:18px; display:grid; gap:9px }
details button { margin-top:6px }
@media(max-width:480px) { body { align-items:flex-start; padding:36px 18px } .brand { margin-bottom:28px } .card { padding:28px 22px; border-radius:12px } h1 { font-size:26px } }
`;

export function escapeAuthHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char] || char);
}

export function authPage(title: string, inner: string): Response {
  const html = `<!doctype html>
<html lang="en" data-theme="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><meta name="theme-color" content="#111114">
<title>${escapeAuthHtml(title)} · Remote Arc</title><link rel="icon" href="/remote-arc.svg" type="image/svg+xml">
<style>${css}</style></head>
<body><div class="shell"><a class="brand" href="https://remotearc.app/" aria-label="Remote Arc homepage">
<img src="/remote-arc.svg" alt="" width="37" height="37">Remote Arc</a>
<main class="card">${inner}</main>
<p class="foot">Secure access to your computers, with permission controls.<br>
<a href="https://remotearc.app/privacy">Privacy</a> · <a href="https://remotearc.app/security-model">Security</a></p>
</div></body></html>`;
  return new Response(html, { headers: {
    "content-type":"text/html; charset=utf-8",
    "cache-control":"no-store",
    "x-content-type-options":"nosniff",
    "referrer-policy":"no-referrer",
    "content-security-policy":"default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
  }});
}
