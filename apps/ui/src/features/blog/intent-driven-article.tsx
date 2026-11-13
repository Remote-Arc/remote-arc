import { useI18n } from "../../hooks/use-i18n.js";
import { localizedWebsiteHref } from "../../lib/marketing-paths.js";
import { PublicLayout } from "../../components/public-layout.js";
import { INTENT_ESSAY } from "../../../../../packages/docs/src/intent-driven-essay.js";
import type { User } from "../../types/app-types.js";

export function IntentDrivenComputingArticlePage({ user }: { user?: User | null }) {
  const { tr, locale } = useI18n();
  return (
    <PublicLayout user={user}>
      <article className="blogArticle">
        <header className="blogArticleHeader">
          <a className="blogBack" href={localizedWebsiteHref("/blogs", locale)}>
            ← {tr("blog.intentDrivenArticle.allPosts")}
          </a>
          <span className="eyebrow">{tr("blog.intentDrivenArticle.personalNotes")}</span>
          <h1>{tr(INTENT_ESSAY.title.en, INTENT_ESSAY.title.zh)}</h1>
          <p className="blogDeck">{tr(INTENT_ESSAY.deck.en, INTENT_ESSAY.deck.zh)}</p>
          <div className="blogByline">
            <span className="blogAuthorMark">SY</span>
            <div>
              <strong>Sam Yao</strong>
              <span>
                {tr("blog.intentDrivenArticle.creatorOfRemoteArc")} · {INTENT_ESSAY.date} ·{" "}
                {tr("blog.intentDrivenArticle.minRead")}
              </span>
            </div>
          </div>
        </header>
        <div className="blogArticleBody">
          {INTENT_ESSAY.intro.map((paragraph, index) => (
            <p key={index}>{tr(paragraph.en, paragraph.zh)}</p>
          ))}
          {INTENT_ESSAY.sections.map((section, index) => (
            <section key={index}>
              <h2>{tr(section.heading.en, section.heading.zh)}</h2>
              {section.paragraphs.map((paragraph, paragraphIndex) => (
                <p key={paragraphIndex}>{tr(paragraph.en, paragraph.zh)}</p>
              ))}
            </section>
          ))}
          <footer className="blogArticleFooter">
            <div>
              <span className="blogAuthorMark">SY</span>
              <div>
                <strong>Sam Yao</strong>
                <span>{tr("blog.intentDrivenArticle.creatorOfRemoteArc")}</span>
              </div>
            </div>
            <a href={localizedWebsiteHref("/docs/architecture", locale)}>
              {tr("blog.intentDrivenArticle.howRemoteArcWorks")} →
            </a>
          </footer>
        </div>
      </article>
    </PublicLayout>
  );
}
