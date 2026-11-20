import directory from "../../../data/app-directory.json" with { type: "json" };
import { useI18n } from "../../../hooks/use-i18n.js";
import { localizedWebsiteHref } from "../../../lib/marketing-paths.js";
import "../../../styles/marketing/home/app-logo-marquee.css";

// Every app in the directory once, by brand; Runway stays off the home page.
const APPS = directory.apps
  .filter((app) => app.brand !== "runway")
  .filter((app, index, all) => all.findIndex((other) => other.brand === app.brand) === index)
  .map((app) => ({
    provider: app.provider,
    name: app.name,
    icon: "/app-brands/" + app.brand + ".svg",
  }));
const ROWS = [
  APPS.filter((_, index) => index % 2 === 0),
  APPS.filter((_, index) => index % 2 === 1),
];

/**
 * The apps Remote Arc connects to, as two rows of logos drifting in opposite
 * directions. Each row is rendered twice so the loop never shows a seam; the
 * copy is hidden from assistive technology, and hovering a row pauses it.
 */
export function AppLogoMarquee() {
  const { tr, locale } = useI18n();
  return (
    <div
      className="appLogoMarquee"
      aria-label={tr("marketing.home.appMarquee.label")}
      role="region"
    >
      {ROWS.map((row, rowIndex) => (
        <div
          className="appLogoMarqueeRow"
          data-direction={rowIndex ? "right" : "left"}
          key={rowIndex}
        >
          {[0, 1].map((copy) => (
            <ul key={copy} aria-hidden={copy === 1 || undefined}>
              {row.map((app) => (
                <li key={app.provider}>
                  <a
                    href={localizedWebsiteHref("/integrations?provider=" + app.provider, locale)}
                    tabIndex={copy === 1 ? -1 : undefined}
                  >
                    <img src={app.icon} alt="" width={22} height={22} loading="lazy" />
                    <span>{app.name}</span>
                  </a>
                </li>
              ))}
            </ul>
          ))}
        </div>
      ))}
    </div>
  );
}
