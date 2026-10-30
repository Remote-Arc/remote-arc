import { useI18n } from "./i18n.js";
import { localizedWebsiteHref } from "./marketing-paths.js";
import { PublicLayout } from "./public-layout.js";
import { INTENT_ESSAY } from "../../../packages/docs/src/intent-driven-essay.js";
import type { User } from "./app-types.js";

export function IntentDrivenComputingArticlePage({ user }: { user?: User | null }) {
  const { tr, locale } = useI18n();
  return (
    <PublicLayout user={user}>
      <article className="blogArticle">
        <header className="blogArticleHeader">
          <a className="blogBack" href={localizedWebsiteHref("/blogs", locale)}>← {tr("All posts", "全部文章")}</a>
          <span className="eyebrow">{tr("PERSONAL NOTES", "随想")}</span>
          <h1>{tr(INTENT_ESSAY.title.en, INTENT_ESSAY.title.zh)}</h1>
          <p className="blogDeck">{tr(INTENT_ESSAY.deck.en, INTENT_ESSAY.deck.zh)}</p>
          <div className="blogByline">
            <span className="blogAuthorMark">SY</span>
            <div><strong>Sam Yao</strong><span>{tr("Creator of Remote Arc", "Remote Arc 创建者")} · {INTENT_ESSAY.date} · {tr("7 min read", "约 7 分钟")}</span></div>
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
            <div><span className="blogAuthorMark">SY</span><div><strong>Sam Yao</strong><span>{tr("Creator of Remote Arc", "Remote Arc 创建者")}</span></div></div>
            <a href={localizedWebsiteHref("/docs/architecture", locale)}>{tr("How Remote Arc works", "Remote Arc 的架构")} →</a>
          </footer>
        </div>
      </article>
    </PublicLayout>
  );
}
