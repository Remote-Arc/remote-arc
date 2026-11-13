import React, { useEffect, useRef, useState } from "react";
import { useI18n } from "../../../hooks/use-i18n.js";
import { arcChatHref } from "../../../../../../packages/docs/src/arc-use-cases.js";
import {
  PUBLISHED_MEDIA_DEMOS,
  MEDIA_CATEGORIES,
  mediaDemoPath,
  type MediaDemo,
  type MediaCategory,
} from "../../../../../../packages/docs/src/media-gallery.js";
import "../../../styles/marketing/use-cases/media-demo-gallery.css";
import "../../../styles/marketing/use-cases/image-demo-gallery.css";

export function MediaDemoGallery() {
  const { tr, locale } = useI18n(),
    [selected, setSelected] = useState<MediaDemo | null>(null),
    [failed, setFailed] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null),
    video = useRef<HTMLVideoElement>(null),
    opener = useRef<HTMLButtonElement | null>(null);
  const base = (import.meta.env.VITE_MEDIA_GALLERY_BASE_URL || "").replace(/\/$/, "");
  const src = (file: string) => base + mediaDemoPath(file);
  const visible = PUBLISHED_MEDIA_DEMOS.filter((item) => item.language === locale);
  useEffect(() => {
    if (selected) {
      setFailed(false);
      if (!dialog.current?.open) dialog.current?.showModal();
    } else if (dialog.current?.open) {
      video.current?.pause();
      dialog.current.close();
      opener.current?.focus();
    }
  }, [selected]);
  const close = () => {
    video.current?.pause();
    setSelected(null);
  };
  const category = (value: MediaCategory) =>
    MEDIA_CATEGORIES.find((item) => item.id === value)![locale];
  const sound = (value: MediaDemo["audio"]) =>
    value === "silent"
      ? tr("marketing.useCases.mediaDemoGallery.silentOriginal")
      : value === "narration"
        ? tr("marketing.useCases.mediaDemoGallery.narrationSound")
        : tr("marketing.useCases.mediaDemoGallery.music");
  return (
    <section
      className="mediaDemoGallery"
      id="video-gallery"
      aria-labelledby="video-gallery-heading"
    >
      <header className="mediaGalleryHeader">
        <div>
          <span className="eyebrow">
            {tr("marketing.useCases.mediaDemoGallery.theVideoGallery")}
          </span>
          <h2 id="video-gallery-heading">
            {tr("marketing.useCases.mediaDemoGallery.aPromptARealFilm")}
          </h2>
          <p>{tr("marketing.useCases.mediaDemoGallery.sportsScienceProductsDataAndPlaces")}</p>
        </div>
        <div className="mediaGalleryStamp">
          <strong>{String(visible.length).padStart(2, "0")}</strong>
          <span>
            {tr("marketing.useCases.mediaDemoGallery.realDemos")}
            <br />
            {tr("marketing.useCases.mediaDemoGallery.renderedLocally")}
          </span>
        </div>
      </header>
      <div className="mediaGalleryGrid">
        {visible.map((item, index) => (
          <article className="mediaDemoCard" key={item.id}>
            <button
              className="mediaDemoPreview"
              type="button"
              aria-label={tr("marketing.useCases.mediaDemoGallery.play") + item.title[locale]}
              onClick={(event) => {
                opener.current = event.currentTarget;
                setSelected(item);
              }}
            >
              <img
                src={src(item.poster)}
                alt=""
                loading={index < 3 ? "eager" : "lazy"}
                decoding="async"
                width={item.width}
                height={item.height}
              />
              <span className="mediaDemoPlay" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path d="M9 5v14l11-7z" />
                </svg>
              </span>

              <span className="mediaDemoDuration">{Math.round(item.duration)}s</span>
              <span className="mediaDemoFormat">{item.width < item.height ? "9:16" : "16:9"}</span>
            </button>
            <div className="mediaDemoCopy">
              <div className="mediaDemoCategory">
                {category(item.category)}
                <span>{item.engine}</span>
              </div>
              <h3>{item.title[locale]}</h3>
              <p>{item.description[locale]}</p>
              <button
                type="button"
                className="mediaDemoTextPlay"
                onClick={(event) => {
                  opener.current = event.currentTarget;
                  setSelected(item);
                }}
              >
                {tr("marketing.useCases.mediaDemoGallery.watchFilm")}{" "}
                <span aria-hidden="true">↗</span>
              </button>
            </div>
          </article>
        ))}
      </div>
      <footer className="mediaGalleryFooter">
        <p>{tr("marketing.useCases.mediaDemoGallery.openAFinishedFilmExploreIts")}</p>
        <a
          href={arcChatHref(
            tr("marketing.useCases.mediaDemoGallery.helpMeMakeAFinishedVideo"),
            "video-gallery",
          )}
        >
          {tr("marketing.useCases.mediaDemoGallery.makeYourOwnFilm")}{" "}
          <span aria-hidden="true">→</span>
        </a>
      </footer>
      <dialog
        ref={dialog}
        className="mediaGalleryDialog"
        aria-labelledby="media-player-title"
        onCancel={close}
        onClose={() => {
          video.current?.pause();
          setSelected(null);
          opener.current?.focus();
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) close();
        }}
      >
        {selected && (
          <div className="mediaPlayerShell">
            <div className="mediaPlayerTop">
              <span>{category(selected.category)}</span>
              <button
                type="button"
                className="mediaPlayerClose"
                autoFocus
                aria-label={tr("marketing.useCases.mediaDemoGallery.closeVideo")}
                onClick={close}
              >
                ×
              </button>
            </div>
            <div className="mediaPlayerStage">
              <video
                key={selected.id}
                ref={video}
                controls
                playsInline
                autoPlay
                preload="metadata"
                poster={src(selected.poster)}
                src={src(selected.video)}
                aria-label={selected.title[locale]}
                onError={() => setFailed(true)}
              />
            </div>
            <div className="mediaPlayerInfo">
              <div>
                <h3 id="media-player-title">{selected.title[locale]}</h3>
                <p>{selected.description[locale]}</p>
                <span className="mediaPlayerMeta">
                  {selected.engine} · {selected.width} × {selected.height} ·{" "}
                  {Math.round(selected.duration)}s · {sound(selected.audio)} ·{" "}
                  {selected.language === "en"
                    ? tr("marketing.useCases.mediaDemoGallery.english")
                    : tr("marketing.useCases.mediaDemoGallery.chinese")}
                </span>
              </div>
              <a
                className="mediaPlayerCreate"
                href={arcChatHref(selected.prompt[locale], "video-demo:" + selected.id)}
              >
                {tr("marketing.useCases.mediaDemoGallery.makeSomethingLikeThis")} ↗
              </a>
            </div>
            {failed && (
              <p className="mediaPlayerError" role="alert">
                {tr("marketing.useCases.mediaDemoGallery.thisVideoCouldNotLoad")}
                <a href={src(selected.video)} target="_blank" rel="noreferrer">
                  {tr("marketing.useCases.mediaDemoGallery.openTheVideoFile")}
                </a>
              </p>
            )}
          </div>
        )}
      </dialog>
    </section>
  );
}
