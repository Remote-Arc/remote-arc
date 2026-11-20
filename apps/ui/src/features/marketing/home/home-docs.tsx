import { ProductIcon } from "../../../components/product-icon.js";
import { useI18n } from "../../../hooks/use-i18n.js";
import type { MessageKey } from "../../../locales/locale-catalog.js";
import { localizedWebsiteHref } from "../../../lib/marketing-paths.js";
import { SectionTitle } from "./section-title.js";
import "../../../styles/marketing/home/home-docs.css";

const K = "marketing.home.homeDocs.";
type Kind = "Guide" | "Reference" | "Security";
const DOCS: readonly { href: string; key: string; kind: Kind }[] = [
  { href: "/docs", key: "docs", kind: "Guide" },
  { href: "/docs/tools", key: "tools", kind: "Reference" },
  { href: "/docs/mcp", key: "mcp", kind: "Reference" },
  { href: "/docs/architecture", key: "architecture", kind: "Guide" },
  { href: "/docs/long-running-work", key: "longRunning", kind: "Guide" },
  { href: "/security-model", key: "security", kind: "Security" },
];

/** The technical documentation, one card per guide or reference, before the closing call. */
export function HomeDocs() {
  const { tr, locale } = useI18n();
  const t = (key: string) => tr((K + key) as MessageKey);
  return (
    <section className="homeDocs sectionBlock" id="docs" aria-labelledby="home-docs-heading">
      <header className="modernSectionIntro">
        <span className="eyebrow">{t("eyebrow")}</span>
        <SectionTitle id="home-docs-heading" text={t("title")} />
        <p>{t("lead")}</p>
      </header>
      <div className="homeDocsGrid">
        {DOCS.map((doc) => (
          <a key={doc.key} className="homeDocsCard" href={localizedWebsiteHref(doc.href, locale)}>
            <span className="homeDocsMeta">
              <span className="homeDocsKind" data-kind={doc.kind}>
                {t("kind" + doc.kind)}
              </span>
              <code>{doc.href}</code>
            </span>
            <h3>{t(doc.key + "Title")}</h3>
            <p>{t(doc.key + "Body")}</p>
            <ProductIcon name="arrowUpRight" size={16} />
          </a>
        ))}
      </div>
      <a className="homeDocsChangelog" href={localizedWebsiteHref("/releases", locale)}>
        {t("changelog")} →
      </a>
    </section>
  );
}
