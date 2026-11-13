import React, { useEffect, useRef, useState } from "react";
import { useI18n } from "../../../hooks/use-i18n.js";
import { localizedWebsiteHref } from "../../../lib/marketing-paths.js";
import { mediaDemoPath } from "../../../../../../packages/docs/src/media-gallery.js";
import { productFilm, type SiteVideo } from "../../../../../../packages/docs/src/site-media.js";
import "../../../styles/marketing/home/product-film.css";

const mediaSrc = (file: string) =>
  (import.meta.env.VITE_MEDIA_GALLERY_BASE_URL || "").replace(/\/$/, "") + mediaDemoPath(file);

/** A site video with its poster, muted until the viewer turns the sound on; the bytes load only on play. */
export function SiteVideoPlayer({
  video,
  label,
  videoRef,
}: {
  video: SiteVideo;
  label: string;
  videoRef?: React.Ref<HTMLVideoElement>;
}) {
  const { tr } = useI18n();
  const [failed, setFailed] = useState(false);
  return (
    <>
      <video
        ref={videoRef}
        className="siteVideo"
        controls
        muted
        playsInline
        preload="none"
        poster={mediaSrc(video.poster)}
        src={mediaSrc(video.video)}
        width={video.width}
        height={video.height}
        aria-label={label}
        onError={() => setFailed(true)}
      />
      {failed && (
        <p className="siteVideoError" role="alert">
          {tr("marketing.home.productFilm.couldNotLoad")}{" "}
          <a href={mediaSrc(video.video)} target="_blank" rel="noreferrer">
            {tr("marketing.home.productFilm.openTheFile")}
          </a>
        </p>
      )}
    </>
  );
}

// Scene starts in the film, with the guide that explains each part in depth.
const CHAPTERS = [
  {
    at: 0,
    href: "/remote-mcp",
    title: "marketing.home.productFilm.chapter.reach.title",
    body: "marketing.home.productFilm.chapter.reach.body",
    link: "marketing.home.productFilm.chapter.reach.link",
  },
  {
    at: 12,
    href: "/connect-ai",
    title: "marketing.home.productFilm.chapter.connect.title",
    body: "marketing.home.productFilm.chapter.connect.body",
    link: "marketing.home.productFilm.chapter.connect.link",
  },
  {
    at: 19.2,
    href: "/docs/processes",
    title: "marketing.home.productFilm.chapter.execute.title",
    body: "marketing.home.productFilm.chapter.execute.body",
    link: "marketing.home.productFilm.chapter.execute.link",
  },
  {
    at: 29.4,
    href: "/docs/device-fleet",
    title: "marketing.home.productFilm.chapter.fleet.title",
    body: "marketing.home.productFilm.chapter.fleet.body",
    link: "marketing.home.productFilm.chapter.fleet.link",
  },
  {
    at: 36.6,
    href: "/security-model",
    title: "marketing.home.productFilm.chapter.checks.title",
    body: "marketing.home.productFilm.chapter.checks.body",
    link: "marketing.home.productFilm.chapter.checks.link",
  },
  {
    at: 43.8,
    href: "/arc",
    title: "marketing.home.productFilm.chapter.arc.title",
    body: "marketing.home.productFilm.chapter.arc.body",
    link: "marketing.home.productFilm.chapter.arc.link",
  },
] as const;

const clock = (seconds: number) =>
  Math.floor(seconds / 60) + ":" + String(Math.floor(seconds % 60)).padStart(2, "0");

/** The product film with chapters that jump to each scene. */
export function ProductFilmSection() {
  const { tr, locale } = useI18n();
  const video = useRef<HTMLVideoElement>(null);
  const film = productFilm(locale);
  const [active, setActive] = useState(-1);
  // Highlight the chapter that is playing, so the list under the film reads as its index.
  useEffect(() => {
    const player = video.current;
    if (!player) return;
    const update = () => {
      let index = -1;
      CHAPTERS.forEach((chapter, i) => {
        if (player.currentTime >= chapter.at) index = i;
      });
      setActive(player.currentTime > 0 ? index : -1);
    };
    player.addEventListener("timeupdate", update);
    return () => player.removeEventListener("timeupdate", update);
  }, []);
  const jump = (at: number) => {
    const player = video.current;
    if (!player) return;
    const seek = () => {
      player.currentTime = at;
      void player.play().catch(() => undefined);
    };
    // The film is not fetched until asked; seek once its metadata has loaded.
    if (player.readyState >= 1) seek();
    else {
      player.addEventListener("loadedmetadata", seek, { once: true });
      player.load();
    }
    player.scrollIntoView({ block: "nearest", behavior: "smooth" });
  };
  return (
    <section className="productFilm" id="film" aria-labelledby="product-film-heading">
      <header>
        <h2 id="product-film-heading">{tr("marketing.home.productFilm.title")}</h2>
        <p>{tr("marketing.home.productFilm.chaptersHint")}</p>
      </header>
      <div className="productFilmLayout">
        <div className="productFilmStage">
          <SiteVideoPlayer
            video={film}
            label={tr("marketing.home.productFilm.title")}
            videoRef={video}
          />
        </div>
        <ol className="productFilmChapters">
          {CHAPTERS.map((chapter, index) => (
            <li key={chapter.at} aria-current={index === active ? "step" : undefined}>
              <button type="button" onClick={() => jump(chapter.at)}>
                <time>{clock(chapter.at)}</time>
                <strong>{tr(chapter.title)}</strong>
              </button>
              <p>
                {tr(chapter.body)}{" "}
                <a href={localizedWebsiteHref(chapter.href, locale)}>{tr(chapter.link)} →</a>
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
