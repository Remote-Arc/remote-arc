import type { Translate } from "../../../locales/locale-catalog.js";
import { createPortal } from "react-dom";
import { useEffect, useRef, useState, type RefObject } from "react";
import { ProductIcon } from "../../../components/product-icon.js";
import type { useArcComposerInputs } from "../../../hooks/arc/use-arc-composer-inputs.js";
import type { ArcMention } from "../../../hooks/arc/use-arc-skill-mentions.js";
type Tr = Translate;
export function ComposerGlyph({ name }: { name: "image" | "file" | "pin" | "mic" }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {name === "image" ? (
        <>
          <rect x="3" y="3" width="18" height="18" rx="4" />
          <circle cx="8" cy="8" r="1.5" />
          <path d="m3 16 5-5 4 4 3-3 6 6" />
        </>
      ) : name === "file" ? (
        <>
          <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6Z" />
          <path d="M14 3v6h6M8 14h8m-8 4h5" />
        </>
      ) : name === "pin" ? (
        <>
          <path d="M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 0 1 16 0Z" />
          <circle cx="12" cy="10" r="2.5" />
        </>
      ) : (
        <>
          <rect x="9" y="2" width="6" height="13" rx="3" />
          <path d="M5 10v2a7 7 0 0 0 14 0v-2m-7 9v3m-4 0h8" />
        </>
      )}
    </svg>
  );
}
export function ArcComposerMenu({
  inputs,
  onReferences,
  editor,
  tr,
  disabled,
}: {
  inputs: ReturnType<typeof useArcComposerInputs>;
  onReferences: (kind: ArcMention["kind"]) => void;
  editor: RefObject<HTMLTextAreaElement | null>;
  tr: Tr;
  disabled: boolean;
}) {
  const [view, setView] = useState<"closed" | "main" | "location">("closed"),
    [place, setPlace] = useState(""),
    button = useRef<HTMLButtonElement>(null),
    menu = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (view === "closed") return;
    const position = () => {
      const anchor = button.current?.getBoundingClientRect(),
        popup = menu.current;
      if (!anchor || !popup) return;
      const width = Math.min(320, innerWidth - 24),
        above = anchor.top - 12,
        below = innerHeight - anchor.bottom - 12,
        up = above >= Math.min(360, below),
        maximum = Math.min(440, Math.max(180, up ? above : below));
      popup.style.width = width + "px";
      popup.style.maxHeight = maximum + "px";
      popup.style.left = Math.max(12, Math.min(anchor.left, innerWidth - width - 12)) + "px";
      popup.style.top =
        Math.max(
          12,
          up ? anchor.top - Math.min(popup.scrollHeight, maximum) - 8 : anchor.bottom + 8,
        ) + "px";
      popup.style.visibility = "visible";
    };
    position();
    const outside = (e: PointerEvent) => {
      if (!menu.current?.contains(e.target as Node) && !button.current?.contains(e.target as Node))
        setView("closed");
    };
    const keys = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setView("closed");
        button.current?.focus();
      } else if (
        (e.key === "ArrowDown" || e.key === "ArrowUp") &&
        !(e.target instanceof HTMLInputElement)
      ) {
        const items = Array.from(
            menu.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") || [],
          ),
          index = items.indexOf(document.activeElement as HTMLButtonElement);
        if (items.length) {
          e.preventDefault();
          items[
            (index + (e.key === "ArrowDown" ? 1 : items.length - 1) + items.length) % items.length
          ]?.focus();
        }
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", keys);
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    requestAnimationFrame(() => menu.current?.querySelector<HTMLElement>("input,button")?.focus());
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", keys);
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
    };
  }, [view, editor]);
  const action = (fn: () => void) => {
    setView("closed");
    fn();
  };
  return (
    <>
      <input
        type="file"
        ref={inputs.fileInput}
        accept={inputs.accept}
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files) inputs.addFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <button
        ref={button}
        type="button"
        className="arcComposerPlus"
        aria-label={tr("arc.composer.arcComposerMenu.addToMessage")}
        aria-expanded={view !== "closed"}
        aria-haspopup="menu"
        disabled={disabled}
        onClick={() => setView((value) => (value === "closed" ? "main" : "closed"))}
      >
        <ProductIcon name="add" size={19} />
      </button>
      {view !== "closed" &&
        createPortal(
          <div ref={menu} className="arcComposerMenu" style={{ visibility: "hidden" }}>
            {view === "location" ? (
              <div className="arcComposerLocation">
                <button type="button" className="arcComposerBack" onClick={() => setView("main")}>
                  ← {tr("arc.composer.arcComposerMenu.addAPlace")}
                </button>
                <label>
                  {tr("arc.composer.arcComposerMenu.placeOrAddress")}
                  <input
                    value={place}
                    onChange={(e) => setPlace(e.target.value)}
                    maxLength={200}
                    placeholder={tr("arc.composer.arcComposerMenu.aucklandNewZealand")}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && place.trim()) {
                        e.preventDefault();
                        action(() => inputs.setLocation({ label: place.trim() }));
                      }
                    }}
                  />
                </label>
                <button
                  type="button"
                  disabled={!place.trim()}
                  onClick={() => action(() => inputs.setLocation({ label: place.trim() }))}
                >
                  {tr("arc.composer.arcComposerMenu.attachPlace")}
                </button>
                <button
                  type="button"
                  disabled={inputs.locating}
                  onClick={() => {
                    inputs.locate();
                    setView("closed");
                  }}
                >
                  <ComposerGlyph name="pin" />
                  {tr("arc.composer.arcComposerMenu.useCurrentLocation")}
                </button>
              </div>
            ) : (
              <div role="menu" aria-label={tr("arc.composer.arcComposerMenu.messageExtensions")}>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => action(() => inputs.pick(true))}
                >
                  <ComposerGlyph name="image" />
                  <span>
                    {tr("arc.composer.arcComposerMenu.addPhotos")}
                    <small>{tr("arc.composer.arcComposerMenu.uploadPasteOrDrop")}</small>
                  </span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => action(() => inputs.pick(false))}
                >
                  <ComposerGlyph name="file" />
                  <span>
                    {tr("arc.composer.arcComposerMenu.addFiles")}
                    <small>{tr("arc.composer.arcComposerMenu.pdfWordTextAndCode")}</small>
                  </span>
                </button>
                <button type="button" role="menuitem" onClick={() => setView("location")}>
                  <ComposerGlyph name="pin" />
                  <span>{tr("arc.composer.arcComposerMenu.addAPlace")}</span>
                </button>
                <hr />
                {(["app", "employee", "skill"] as const).map((kind) => (
                  <button
                    type="button"
                    role="menuitem"
                    key={kind}
                    onClick={() => action(() => onReferences(kind))}
                  >
                    <ProductIcon
                      name={kind === "app" ? "apps" : kind === "employee" ? "users" : "spark"}
                    />
                    <span>
                      {kind === "app"
                        ? tr("arc.composer.arcComposerMenu.apps")
                        : kind === "employee"
                          ? tr("arc.composer.arcComposerMenu.agents")
                          : tr("arc.composer.arcComposerMenu.skills")}
                    </span>
                    <ProductIcon name="chevron" size={14} />
                  </button>
                ))}
                <hr />
                <button
                  type="button"
                  role="menuitem"
                  disabled={!inputs.voiceSupported}
                  onClick={() => action(inputs.toggleVoice)}
                  title={
                    !inputs.voiceSupported
                      ? tr("arc.composer.arcComposerMenu.voiceInputIsNotSupportedBy")
                      : undefined
                  }
                >
                  <ComposerGlyph name="mic" />
                  <span>{tr("arc.composer.arcComposerMenu.voiceInput")}</span>
                </button>
              </div>
            )}
          </div>,
          document.querySelector(".appFrame") || document.body,
        )}
    </>
  );
}
export function ArcComposerAttachments({
  inputs,
  tr,
}: {
  inputs: ReturnType<typeof useArcComposerInputs>;
  tr: Tr;
}) {
  return (
    <>
      {(inputs.uploads.length > 0 || inputs.location) && (
        <div className="arcComposerAttachments">
          {inputs.uploads.map((item) => (
            <div className="arcUploadTile" key={item.key} data-status={item.status}>
              {item.preview ? (
                <img src={item.preview} alt="" />
              ) : (
                <div className="arcUploadFileIcon">
                  <ComposerGlyph name="file" />
                </div>
              )}
              <div>
                <strong>{item.file.name}</strong>
                <small>
                  {item.status === "uploading"
                    ? tr("arc.composer.arcComposerMenu.uploading")
                    : item.status === "error"
                      ? item.error
                      : Math.max(1, Math.round((item.attachment?.size || item.file.size) / 1024)) +
                        " KB"}
                </small>
                {item.status === "error" && (
                  <button type="button" onClick={() => inputs.retry(item.key)}>
                    {tr("arc.composer.arcComposerMenu.retry")}
                  </button>
                )}
              </div>
              <button
                type="button"
                className="arcUploadRemove"
                aria-label={
                  tr("arc.composer.arcComposerMenu.removeAttachment") + ": " + item.file.name
                }
                onClick={() => inputs.remove(item.key)}
              >
                <ProductIcon name="close" size={12} />
              </button>
            </div>
          ))}
          {inputs.location && (
            <div className="arcLocationTile">
              <ComposerGlyph name="pin" />
              <span>
                {inputs.location.label}
                {inputs.location.latitude !== undefined && (
                  <small>
                    {inputs.location.latitude}, {inputs.location.longitude}
                  </small>
                )}
              </span>
              <button
                type="button"
                aria-label={tr("arc.composer.arcComposerMenu.removeLocation")}
                onClick={() => inputs.setLocation(undefined)}
              >
                <ProductIcon name="close" size={12} />
              </button>
            </div>
          )}
        </div>
      )}
      {inputs.locating && (
        <p className="arcInputStatus" role="status">
          {tr("arc.composer.arcComposerMenu.findingYourLocation")}{" "}
          <button type="button" onClick={() => inputs.setLocation(undefined)}>
            {tr("arc.composer.arcComposerMenu.cancel")}
          </button>
        </p>
      )}
      {inputs.listening && (
        <div className="arcVoiceStatus" role="status">
          <span />
          {inputs.interim || tr("arc.composer.arcComposerMenu.listening")}
          <button type="button" onClick={inputs.toggleVoice}>
            {tr("arc.composer.arcComposerMenu.done")}
          </button>
        </div>
      )}
      {inputs.error && (
        <p className="arcInputError" role="alert">
          {inputs.error}
          <button
            type="button"
            onClick={() => inputs.setError("")}
            aria-label={tr("arc.composer.arcComposerMenu.dismiss")}
          >
            ×
          </button>
        </p>
      )}
    </>
  );
}
