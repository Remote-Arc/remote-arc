import React from "react";
import { useI18n, useMessages } from "../hooks/use-i18n.js";
import { pageForLanguage } from "../lib/marketing-paths.js";

type FooterLink = { href: string; label: string };

/** The website footer: a site map of every public area, then legal links and the sitemap. */
export function PublicFooter({ brand }: { brand: React.ReactNode }) {
  const { tr, locale } = useI18n();
  const labels = useMessages("website");
  const link = (href: string, label: string): FooterLink => ({
    href: pageForLanguage(href, locale),
    label,
  });
  const groups: { title: string; links: FooterLink[] }[] = [
    {
      title: labels.product,
      links: [
        link("/connect-ai", "Connect"),
        link("/arc", "Arc"),
        link("/chrome-extension", labels.browserProduct),
        link("/integrations", labels.apps),
        link("/pricing", labels.pricing),
        link("/downloads", labels.downloads),
      ],
    },
    {
      title: labels.footerAiClients,
      links: [
        link("/chatgpt-computer-access", "ChatGPT"),
        link("/claude-computer-access", "Claude"),
        link("/install/gemini", "Gemini"),
        link("/install/cursor", "Cursor"),
        link("/remote-mcp", "Remote MCP"),
      ],
    },
    {
      title: labels.resources,
      links: [
        link("/docs", labels.documentation),
        link("/demo", labels.productFilm),
        link("/use-cases", labels.useCases),
        link("/security-model", labels.security),
        link("/blogs", labels.blog),
        link("/releases", labels.changelog),
        link("/roadmap", labels.roadmap),
      ],
    },
    {
      title: labels.footerCompany,
      links: [
        link("/about", labels.aboutUs),
        link("/careers", labels.careers),
        link("/feedback", tr("components.publicLayout.feedback")),
        link("/support", tr("components.publicLayout.support")),
      ],
    },
  ];
  return (
    <footer className="siteFooter">
      <div className="siteFooterTop">
        <div className="siteFooterBrand">
          {brand}
          <p>{labels.footerTagline}</p>
        </div>
        <nav className="siteFooterMap" aria-label={labels.footerNavigation}>
          {groups.map((group) => (
            <section key={group.title}>
              <h2>{group.title}</h2>
              <ul>
                {group.links.map((item) => (
                  <li key={item.href}>
                    <a href={item.href}>{item.label}</a>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </nav>
      </div>
      <div className="siteFooterBottom">
        <span>© 2026 Remote Arc · {tr("components.publicLayout.proprietary")}</span>
        <nav aria-label={labels.footerLegal}>
          <a href={pageForLanguage("/privacy", locale)}>{tr("components.publicLayout.privacy")}</a>
          <a href={pageForLanguage("/terms", locale)}>{tr("components.publicLayout.terms")}</a>
          <a href="/sitemap.xml">{labels.sitemap}</a>
        </nav>
      </div>
    </footer>
  );
}
