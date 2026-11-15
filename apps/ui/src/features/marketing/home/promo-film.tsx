import React from "react";
import { useI18n } from "../../../hooks/use-i18n.js";
import { promoFilm } from "../../../../../../packages/docs/src/site-media.js";
import { SiteVideoPlayer } from "./product-film.js";
import "../../../styles/marketing/home/promo-film.css";

/** The 46-second promo film in the website language, muted and unloaded until played. */
export function PromoFilmSection() {
  const { tr, locale } = useI18n();
  return (
    <section className="promoFilm" id="promo-film" aria-labelledby="promo-film-heading">
      <header>
        <h2 id="promo-film-heading">{tr("marketing.home.promoFilm.title")}</h2>
        <p>{tr("marketing.home.promoFilm.body")}</p>
      </header>
      <div className="promoFilmStage">
        <SiteVideoPlayer video={promoFilm(locale)} label={tr("marketing.home.promoFilm.title")} />
      </div>
    </section>
  );
}
