// The initial document is readable with or without JavaScript. React replaces
// this shell on mount; it is identical for users and crawlers of the same URL.
// With JavaScript the shell stays hidden so people do not see it flash before
// the app paints, and it reveals itself if the app fails to load. Without
// JavaScript it shows at once. This is CSS because the CSP pins inline scripts.
export const marketingShellStyle = `<style id="marketing-shell-style">
.marketingShell{font:16px/1.7 Inter,system-ui,sans-serif;color:inherit;background:inherit;overflow-wrap:anywhere;visibility:hidden;animation:marketing-shell-reveal 0s 3s forwards}
@keyframes marketing-shell-reveal{to{visibility:visible}}
.marketingShell a{color:inherit;text-underline-offset:4px}
.marketingShellHeader{max-width:1200px;margin:auto;padding:22px 24px;display:flex;align-items:center;justify-content:space-between;gap:20px;border-bottom:1px solid #8883}
.marketingShellBrand{display:flex;align-items:center;gap:9px;text-decoration:none;font-size:23px;font-weight:600;white-space:nowrap}
.marketingShellBrand img{width:28px;height:28px}
.marketingShellHeader nav{display:flex;flex-wrap:wrap;gap:12px 24px;font-size:14px}
.marketingContent{max-width:920px;margin:0 auto;padding:64px 24px 96px}
.marketingContent h1{font:600 clamp(32px,5vw,56px)/1.15 "Space Grotesk",Inter,system-ui,sans-serif;letter-spacing:-.035em;text-wrap:balance}
.marketingContent h2{font-size:24px;line-height:1.3;margin-top:36px}
.marketingContent p,.marketingContent li{max-width:80ch}
.marketingContent .seo-eyebrow,.marketingContent .seo-byline{font-size:12px;letter-spacing:.08em}
@media(max-width:600px){.marketingShellHeader{align-items:flex-start;flex-direction:column}.marketingContent{padding-top:32px}}
</style><noscript><style>.marketingShell{visibility:visible;animation:none}</style></noscript>`;

export function marketingShell(content: string, chinese: boolean) {
  const home = chinese ? "/zh" : "/";
  const destinations = [
    ["/connect-ai", "Connect"], ["/integrations", chinese ? "应用" : "Apps"],
    ["/arc", "Arc"], ["/pricing", chinese ? "价格" : "Pricing"],
    ["/docs", chinese ? "文档" : "Docs"],
  ];
  const links = destinations.map(([path, name]) =>
    '<a href="' + (chinese ? '/zh' : '') + path + '">' + name + '</a>').join('');
  return '<div class="marketingShell"><header class="marketingShellHeader">' +
    '<a class="marketingShellBrand" href="' + home + '"><img src="/remote-arc.svg" alt="" width="28" height="28" />Remote Arc</a>' +
    '<nav aria-label="' + (chinese ? '主导航' : 'Main navigation') + '">' + links + '</nav></header>' +
    content.replace('class="seo-blog-shell"', 'class="marketingContent"') + '</div>';
}
