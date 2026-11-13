import React, { useEffect, useRef, useState } from "react";
import { useI18n } from "../../../hooks/use-i18n.js";
import { arcChatHref } from "../../../../../../packages/docs/src/arc-use-cases.js";
import { IMAGE_DEMOS, type ImageDemo } from "../../../../../../packages/docs/src/image-gallery.js";
import { mediaDemoPath } from "../../../../../../packages/docs/src/media-gallery.js";
import "../../../styles/marketing/use-cases/media-demo-gallery.css";
import "../../../styles/marketing/use-cases/image-demo-gallery.css";

export function ImageDemoGallery() {
  const { tr, locale } = useI18n(),
    [selected, setSelected] = useState<ImageDemo | null>(null),
    [failed, setFailed] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null),
    opener = useRef<HTMLButtonElement | null>(null);
  const base = (import.meta.env.VITE_MEDIA_GALLERY_BASE_URL || "").replace(/\/$/, "");
  const src = (name: string) => base + mediaDemoPath(name);
  useEffect(() => {
    if (selected) {
      setFailed(false);
      if (!dialog.current?.open) dialog.current?.showModal();
    } else if (dialog.current?.open) {
      dialog.current.close();
      opener.current?.focus();
    }
  }, [selected]);
  const close = () => setSelected(null);
  return (
    <section
      id="image-gallery"
      className="mediaDemoGallery imageDemoGallery"
      aria-labelledby="image-gallery-heading"
    >
      <header className="mediaGalleryHeader">
        <div>
          <span className="eyebrow">
            {tr("marketing.useCases.imageDemoGallery.theImageGallery")}
          </span>
          <h2 id="image-gallery-heading">
            {tr("marketing.useCases.imageDemoGallery.anIdeaDrawnInCode")}
          </h2>
          <p>
            {tr("marketing.useCases.imageDemoGallery.postersEditorialIllustrationAndGenerativeArt")}
          </p>
        </div>
        <div className="mediaGalleryStamp">
          <strong>{String(IMAGE_DEMOS.length).padStart(2, "0")}</strong>
          <span>
            {tr("marketing.useCases.imageDemoGallery.originalExamples")}
            <br />
            {tr("marketing.useCases.imageDemoGallery.renderedLocally")}
          </span>
        </div>
      </header>
      <div className="imageGalleryGrid">
        {IMAGE_DEMOS.map((item, index) => (
          <article className="mediaDemoCard imageDemoCard" key={item.id}>
            <button
              type="button"
              className="imageDemoPreview"
              aria-label={tr("marketing.useCases.imageDemoGallery.viewImage") + item.title[locale]}
              onClick={(event) => {
                opener.current = event.currentTarget;
                setSelected(item);
              }}
            >
              <img
                src={src(item.thumb)}
                alt={item.title[locale]}
                width={item.width}
                height={item.height}
                loading={index < 2 ? "eager" : "lazy"}
                decoding="async"
              />
              <span aria-hidden="true">↗</span>
            </button>
            <div className="mediaDemoCopy">
              <div className="mediaDemoCategory">
                {tr("marketing.useCases.imageDemoGallery.codeGraphics")}
                <span>{item.engine}</span>
              </div>
              <h3>{item.title[locale]}</h3>
              <p>{item.description[locale]}</p>
              <button
                className="mediaDemoTextPlay"
                type="button"
                onClick={(event) => {
                  opener.current = event.currentTarget;
                  setSelected(item);
                }}
              >
                {tr("marketing.useCases.imageDemoGallery.viewReference")} ↗
              </button>
            </div>
          </article>
        ))}
      </div>
      <footer className="mediaGalleryFooter">
        <p>{tr("marketing.useCases.imageDemoGallery.theseExamplesUseCodeLocalFonts")}</p>
      </footer>
      <dialog
        ref={dialog}
        className="mediaGalleryDialog imageGalleryDialog"
        aria-labelledby="image-viewer-title"
        onCancel={close}
        onClose={() => {
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
              <span>{tr("marketing.useCases.imageDemoGallery.imageReference")}</span>
              <button
                type="button"
                className="mediaPlayerClose"
                autoFocus
                aria-label={tr("marketing.useCases.imageDemoGallery.closeImage")}
                onClick={close}
              >
                ×
              </button>
            </div>
            <div className="imageViewerStage">
              <img
                src={src(selected.image)}
                alt={selected.title[locale]}
                width={selected.width}
                height={selected.height}
                onError={() => setFailed(true)}
              />
            </div>
            <div className="mediaPlayerInfo">
              <div>
                <h3 id="image-viewer-title">{selected.title[locale]}</h3>
                <p>{selected.description[locale]}</p>
                <span className="mediaPlayerMeta">
                  {selected.engine} · {selected.width} × {selected.height} · PNG
                </span>
              </div>
              <a
                className="mediaPlayerCreate"
                href={arcChatHref(selected.prompt[locale], "image-demo:" + selected.id)}
              >
                {tr("marketing.useCases.imageDemoGallery.makeSomethingLikeThis")} ↗
              </a>
            </div>
            {failed && (
              <p className="mediaPlayerError" role="alert">
                {tr("marketing.useCases.imageDemoGallery.thisImageCouldNotLoad")}{" "}
                <a href={src(selected.image)} target="_blank" rel="noreferrer">
                  {tr("marketing.useCases.imageDemoGallery.openImage")}
                </a>
              </p>
            )}
          </div>
        )}
      </dialog>
    </section>
  );
}
