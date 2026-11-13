import React from "react";
import { PublicLayout } from "../../components/public-layout.js";
import { useI18n } from "../../hooks/use-i18n.js";
import { localizedWebsiteHref } from "../../lib/marketing-paths.js";
import type { User } from "../../types/app-types.js";
import "../../styles/company/company-pages.css";

const BELIEFS = [
  ["company.about.belief.leastAuthority.title", "company.about.belief.leastAuthority.body"],
  ["company.about.belief.perComputer.title", "company.about.belief.perComputer.body"],
  ["company.about.belief.visible.title", "company.about.belief.visible.body"],
  ["company.about.belief.replaceable.title", "company.about.belief.replaceable.body"],
] as const;

/** /about: why Remote Arc exists and what it holds to, from the founder's own account. */
export function AboutPage({ user }: { user?: User | null }) {
  const { tr, locale } = useI18n();
  return (
    <PublicLayout user={user}>
      <main className="companyPage">
        <header className="companyHeader">
          <span className="eyebrow">{tr("company.about.eyebrow")}</span>
          <h1>{tr("company.about.title")}</h1>
          <p>{tr("company.about.intro")}</p>
        </header>

        <section className="companySection" aria-labelledby="about-why">
          <h2 id="about-why">{tr("company.about.why.title")}</h2>
          <p>{tr("company.about.why.body")}</p>
          <p>{tr("company.about.why.body2")}</p>
        </section>

        <section className="companySection" aria-labelledby="about-beliefs">
          <h2 id="about-beliefs">{tr("company.about.beliefs.title")}</h2>
          <ul className="companyGrid">
            {BELIEFS.map(([title, body]) => (
              <li key={title}>
                <h3>{tr(title)}</h3>
                <p>{tr(body)}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="companySection" aria-labelledby="about-who">
          <h2 id="about-who">{tr("company.about.who.title")}</h2>
          <p>{tr("company.about.who.body")}</p>
          <div className="companyLinks">
            <a href={localizedWebsiteHref("/blogs/why-i-built-remote-arc", locale)}>
              {tr("company.about.readTheStory")} →
            </a>
            <a href={localizedWebsiteHref("/careers", locale)}>
              {tr("company.about.workWithUs")} →
            </a>
            <a href="mailto:support@remotearc.app">support@remotearc.app</a>
          </div>
        </section>
      </main>
    </PublicLayout>
  );
}
