import { I18nContext, type I18n, type Locale } from "./i18n-context.js";
import { useI18n } from "../hooks/use-i18n.js";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { isWebsite, localizedWebsiteHref, pageForLanguage } from "../lib/marketing-paths.js";
import { createTranslator, loadLocale, type LocaleSurface } from "../locales/locale-catalog.js";
import { initialLocale, LOCALE_KEY, workspacePaths } from "../locales/locale-preference.js";

function rememberLocale(locale: Locale) {
  try {
    localStorage.setItem(LOCALE_KEY, locale);
  } catch {
    /* In-memory switching still works. */
  }
}

export function I18nProvider({
  children,
  surface = "all",
  initialLanguage,
}: {
  children: React.ReactNode;
  surface?: LocaleSurface | "all";
  initialLanguage?: Locale;
}) {
  const [locale, setLocaleState] = useState<Locale>(() => initialLanguage ?? initialLocale());
  const loadRevision = useRef(0);

  useEffect(() => {
    document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
    // Marketing documents already carry localized SEO metadata from the Worker.
    // Do not replace it after Google renders the page with JavaScript enabled.
    if (!isWebsite() && window.location.pathname === "/") {
      const tr = createTranslator(locale);
      document.title = tr("app.i18n.pageTitle");
      document
        .querySelector('meta[name="description"]')
        ?.setAttribute("content", tr("app.i18n.pageDescription"));
    }
  }, [locale]);

  useEffect(() => {
    if (!isWebsite() || locale !== "zh") return;
    const onLinkClick = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const target = event.target;
      const anchor = target instanceof Element ? target.closest("a[href]") : null;
      if (
        !(anchor instanceof HTMLAnchorElement) ||
        (anchor.target && anchor.target !== "_self") ||
        anchor.hasAttribute("download")
      )
        return;
      const raw = anchor.getAttribute("href") || "";
      if (!raw.startsWith("/") || raw.startsWith("//")) return;
      const translated = localizedWebsiteHref(raw, "zh");
      if (translated === raw) return;
      event.preventDefault();
      window.location.assign(translated);
    };
    document.addEventListener("click", onLinkClick, true);
    return () => document.removeEventListener("click", onLinkClick, true);
  }, [locale]);

  const value = useMemo<I18n>(
    () => ({
      locale,
      async setLocale(next) {
        const revision = ++loadRevision.current;
        try {
          await loadLocale(next, surface);
        } catch {
          return false;
        }
        if (revision !== loadRevision.current) return false;
        rememberLocale(next);
        setLocaleState(next);
        return true;
      },
      tr: createTranslator(locale),
    }),
    [locale, surface],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function LanguageSwitcher({
  compact = false,
  syncUrl = false,
  dropdown = false,
  iconOnly = false,
}: {
  compact?: boolean;
  syncUrl?: boolean;
  dropdown?: boolean;
  iconOnly?: boolean;
}) {
  const { locale, setLocale, tr } = useI18n();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        menuRef.current?.querySelector<HTMLButtonElement>(".languageDropdownTrigger")?.focus();
      }
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  const choose = async (next: Locale) => {
    const path = location.pathname.replace(/\/+$/, "") || "/";
    if (
      syncUrl &&
      isWebsite() &&
      !workspacePaths.includes(path) &&
      !path.startsWith("/dashboard/browser/")
    ) {
      rememberLocale(next);
      const url = new URL(window.location.href);
      url.pathname = pageForLanguage(url.pathname, next);
      url.searchParams.delete("lang");
      window.location.assign(url.pathname + url.search + url.hash);
      return;
    }
    if (!(await setLocale(next))) return;
    if (syncUrl) {
      const url = new URL(window.location.href);
      url.searchParams.set("lang", next);
      window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    }
    setOpen(false);
  };
  if (dropdown)
    return (
      <div className={"languageDropdown" + (iconOnly ? " iconOnly" : "")} ref={menuRef}>
        <button
          type="button"
          className="languageDropdownTrigger"
          aria-label={iconOnly ? tr("app.i18n.language") : tr("app.i18n.selectLanguage")}
          title={iconOnly ? tr("app.i18n.language") : undefined}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((previous) => !previous)}
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            width="19"
            height="19"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {iconOnly ? (
              <>
                <circle cx="12" cy="12" r="9" />
                <ellipse cx="12" cy="12" rx="4" ry="9" />
                <path d="M3 12h18" />
              </>
            ) : (
              <>
                <path d="M3 5h12M9 3v2m3 0c-.4 5-2.7 8.2-7 10m2-7c1 2.1 3 4.1 6 5" />
                <path d="m14 21 4-10 4 10m-6.8-3h5.6" />
              </>
            )}
          </svg>
          {!iconOnly && (
            <>
              <span className="languageDropdownCode">{tr("app.i18n.activeLanguage")}</span>
              <svg
                aria-hidden="true"
                viewBox="0 0 12 12"
                width="11"
                height="11"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path d="m2 4 4 4 4-4" />
              </svg>
            </>
          )}
        </button>
        {open && (
          <div className="languageDropdownMenu" role="menu" aria-label={tr("app.i18n.languages")}>
            <button
              type="button"
              role="menuitemradio"
              lang="en"
              aria-checked={locale === "en"}
              onClick={() => choose("en")}
            >
              English <span>{locale === "en" ? "✓" : ""}</span>
            </button>
            <button
              type="button"
              role="menuitemradio"
              lang="zh-CN"
              aria-checked={locale === "zh"}
              onClick={() => choose("zh")}
            >
              简体中文 <span>{locale === "zh" ? "✓" : ""}</span>
            </button>
          </div>
        )}
      </div>
    );
  return (
    <div
      className={"languageSwitch" + (compact ? " compact" : "")}
      role="group"
      aria-label={tr("app.i18n.websiteLanguage")}
    >
      <button
        className={locale === "en" ? "active" : ""}
        aria-label="Switch website language to English"
        aria-pressed={locale === "en"}
        lang="en"
        onClick={() => choose("en")}
        type="button"
      >
        EN
      </button>
      <button
        className={locale === "zh" ? "active" : ""}
        aria-label="切换网站语言为简体中文"
        aria-pressed={locale === "zh"}
        lang="zh-CN"
        onClick={() => choose("zh")}
        type="button"
      >
        中文
      </button>
    </div>
  );
}
