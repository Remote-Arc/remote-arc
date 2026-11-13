import { useState } from "react";
import { useI18n } from "../../../hooks/use-i18n.js";
import { localizedWebsiteHref } from "../../../lib/marketing-paths.js";
import {
  PUBLISHED_MEDIA_DEMOS,
  mediaDemoPath,
} from "../../../../../../packages/docs/src/media-gallery.js";
import { IMAGE_DEMOS } from "../../../../../../packages/docs/src/image-gallery.js";
import "../../../styles/marketing/home/local-creative-demo.css";

export const creativeMediaSrc = (file: string) =>
  (import.meta.env?.VITE_MEDIA_GALLERY_BASE_URL || "").replace(/\/$/, "") + mediaDemoPath(file);
export function LocalCreativeResult({ kind }: { kind: "video" | "image" }) {
  const { tr, locale } = useI18n(),
    [playing, setPlaying] = useState(false),
    [failed, setFailed] = useState(false);
  const film = PUBLISHED_MEDIA_DEMOS.find((item) => item.id === "basketball-return-" + locale);
  const images = IMAGE_DEMOS.filter((item) => ["court-energy", "quiet-objects"].includes(item.id));
  const href = localizedWebsiteHref(
    kind === "video"
      ? "/use-cases/video-creation#video-gallery"
      : "/use-cases/image-studio#image-gallery",
    locale,
  );
  return (
    <article className="localCreativeResult" data-kind={kind}>
      <header>
        <span>{tr("marketing.home.localCreativeDemo.realWorkRenderedLocally")}</span>
        <span>{kind === "video" ? "MP4 · 60s" : "PNG · 1200 × 1500"}</span>
      </header>
      {kind === "video" && film ? (
        <div className="localCreativeFilm">
          {playing ? (
            <video
              key={film.id}
              controls
              playsInline
              autoPlay
              preload="metadata"
              src={creativeMediaSrc(film.video)}
              poster={creativeMediaSrc(film.poster)}
              aria-label={film.title[locale]}
              onError={() => setFailed(true)}
            />
          ) : (
            <button
              type="button"
              onClick={() => setPlaying(true)}
              aria-label={tr("marketing.home.localCreativeDemo.play") + film.title[locale]}
            >
              <img
                src={creativeMediaSrc(film.poster)}
                width={film.width}
                height={film.height}
                alt=""
                loading="lazy"
              />
              <span aria-hidden="true">▶</span>
            </button>
          )}
          <strong>{film.title[locale]}</strong>
          <p>{tr("marketing.home.localCreativeDemo.secondsConnectedScenesMusicNoVoiceover")}</p>
          {failed && (
            <p role="alert">
              {tr("marketing.home.localCreativeDemo.videoUnavailableOpenTheGalleryTo")}
            </p>
          )}
        </div>
      ) : (
        <div className="localCreativeImages">
          {images.map((item) => (
            <a key={item.id} href={href}>
              <img
                src={creativeMediaSrc(item.thumb)}
                width={item.width}
                height={item.height}
                alt={item.title[locale]}
                loading="lazy"
              />
              <span>{item.title[locale]}</span>
            </a>
          ))}
        </div>
      )}
      <footer>
        <span>
          {kind === "video"
            ? tr("marketing.home.localCreativeDemo.vibeKnowledgeFilmEditableProject")
            : tr("marketing.home.localCreativeDemo.codeGraphicsEditableDrawingSources")}
        </span>
        <a href={href}>{tr("marketing.home.localCreativeDemo.exploreTheGallery")} ↗</a>
      </footer>
    </article>
  );
}
export function CreativeDirectoryPreviews() {
  const { tr, locale } = useI18n();
  const film = PUBLISHED_MEDIA_DEMOS.find((item) => item.id === "basketball-return-" + locale),
    image = IMAGE_DEMOS.find((item) => item.id === "court-energy");
  return (
    <div className="creativeDirectoryPreviews">
      {film && (
        <a href={localizedWebsiteHref("/use-cases/video-creation#video-gallery", locale)}>
          <img
            src={creativeMediaSrc(film.poster)}
            width={film.width}
            height={film.height}
            alt=""
            loading="lazy"
          />
          <span>
            {tr("marketing.home.localCreativeDemo.videoCreation")} <small>60s · MP4</small>
          </span>
          <b aria-hidden="true">▶</b>
        </a>
      )}
      {image && (
        <a href={localizedWebsiteHref("/use-cases/image-studio#image-gallery", locale)}>
          <img
            src={creativeMediaSrc(image.thumb)}
            width={image.width}
            height={image.height}
            alt=""
            loading="lazy"
          />
          <span>
            {tr("marketing.home.localCreativeDemo.imageCreation")} <small>PNG</small>
          </span>
          <b aria-hidden="true">↗</b>
        </a>
      )}
    </div>
  );
}
