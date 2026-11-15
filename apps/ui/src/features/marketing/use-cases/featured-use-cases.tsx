import { useI18n } from "../../../hooks/use-i18n.js";

export type FeaturedCase = {
  slug: string;
  category: string;
  title: string;
  intro: string;
  prompt: string;
};

/** The use cases the page leads with: coding on your own computer first, then the
 * server, the routine that runs without you, and a finished video. */
export const FEATURED_SLUGS = [
  "remote-development",
  "home-lab",
  "scheduled-checks",
  "video-creation",
] as const;

export function FeaturedUseCases({
  items,
  hrefFor,
}: {
  items: readonly FeaturedCase[];
  hrefFor: (slug: string) => string;
}) {
  const { tr } = useI18n();
  return (
    <section className="featuredUseCases" aria-labelledby="featured-use-cases-title">
      <header className="useCaseSectionHeader">
        <span className="eyebrow">{tr("marketing.useCases.page.featuredEyebrow")}</span>
        <h2 id="featured-use-cases-title">{tr("marketing.useCases.page.featuredTitle")}</h2>
        <p>{tr("marketing.useCases.page.featuredLead")}</p>
      </header>
      <div className="featuredGrid">
        {items.map((item, index) => (
          <a
            key={item.slug}
            className={"featuredCase" + (index === 0 ? " featuredCase--lead" : "")}
            href={hrefFor(item.slug)}
          >
            <div className="featuredArt">
              <img
                src={"/use-case-art/" + item.slug + ".svg"}
                alt=""
                width="640"
                height="360"
                decoding="async"
              />
            </div>
            <div className="featuredBody">
              <span className="eyebrow">{item.category}</span>
              <h3>{item.title}</h3>
              <p className="featuredIntro">{item.intro}</p>
              <figure className="featuredPrompt">
                <figcaption>{tr("marketing.useCases.page.sayToYourAi")}</figcaption>
                <blockquote>{item.prompt}</blockquote>
              </figure>
              <span className="featuredMore">{tr("marketing.useCases.page.seeHow")} →</span>
            </div>
          </a>
        ))}
      </div>
    </section>
  );
}
