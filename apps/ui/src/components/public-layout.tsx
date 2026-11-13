import { ProductIcon } from "./product-icon.js";
import { usePlatformCatalog } from "../hooks/use-platform-catalog.js";
import React, { useEffect, useRef, useState } from "react";
import { LanguageSwitcher } from "../app/i18n.js";
import { useI18n, useMessages } from "../hooks/use-i18n.js";
import { should } from "../lib/ui-access.js";
import { isWebsite, localizedWebsiteHref } from "../lib/marketing-paths.js";
import { BrandWordmark } from "./brand-wordmark.js";
import { PublicFooter } from "./public-footer.js";
import { useTheme } from "../hooks/use-theme.js";
import { APP_ORIGIN, MARKETING_ORIGIN, dashboardHref } from "../config/app-config.js";
import { type User } from "../types/app-types.js";

export function LogoMark({ className = "" }: { className?: string }) {
  return (
    <img className={className} src="/remote-arc.svg" alt="Remote Arc" width="64" height="64" />
  );
}
export function Brand({ compact = false }: { compact?: boolean }) {
  const { locale } = useI18n();
  return (
    <a
      href={MARKETING_ORIGIN + (isWebsite() && locale === "zh" ? "/zh" : "")}
      title="Remote Arc website"
      aria-label="Remote Arc"
      className={"brand brandHasWordmark" + (compact ? " compactBrand" : "")}
    >
      <span className="brandSymbol" aria-hidden="true">
        <LogoMark className="brandLogo" />
      </span>
      <BrandWordmark />
    </a>
  );
}
export function ThemeSwitcher({ compact = false }: { compact?: boolean }) {
  const { tr } = useI18n();
  const { theme, resolvedTheme, setTheme } = useTheme();

  if (!compact) {
    return (
      <div className="languageSetting themeSetting">
        <button className={theme === "light" ? "active" : ""} onClick={() => setTheme("light")}>
          {tr("components.publicLayout.light")}
        </button>
        <button className={theme === "dark" ? "active" : ""} onClick={() => setTheme("dark")}>
          {tr("components.publicLayout.dark")}
        </button>
        <button className={theme === "system" ? "active" : ""} onClick={() => setTheme("system")}>
          {tr("components.publicLayout.system")}
        </button>
      </div>
    );
  }

  const nextTheme = resolvedTheme === "dark" ? "light" : "dark";
  return (
    <button
      className="themeSwitch compact"
      type="button"
      onClick={() => setTheme(nextTheme)}
      aria-label={
        resolvedTheme === "dark"
          ? tr("components.publicLayout.switchToLightMode")
          : tr("components.publicLayout.switchToDarkMode")
      }
      title={
        resolvedTheme === "dark"
          ? tr("components.publicLayout.lightMode")
          : tr("components.publicLayout.darkMode")
      }
    >
      <span aria-hidden="true">{resolvedTheme === "dark" ? "☼" : "◐"}</span>
    </button>
  );
}
function PublicHeader({ user }: { user?: User | null }) {
  const { locale } = useI18n();
  const labels = useMessages("website");
  const arcAvailable = should("arcAvailable", usePlatformCatalog());
  const [openMenu, setOpenMenu] = useState<"mcp" | "resources" | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const navRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const onOutsideClick = (event: PointerEvent) => {
      if (!navRef.current?.contains(event.target as Node)) setOpenMenu(null);
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenMenu(null);
        setMobileOpen(false);
      }
    };
    document.addEventListener("pointerdown", onOutsideClick);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("pointerdown", onOutsideClick);
      document.removeEventListener("keydown", onEscape);
    };
  }, []);
  const arrow = (
    <svg
      className="publicNavChevron"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
  const navHref = (path: string) => (isWebsite() ? localizedWebsiteHref(path, locale) : path);
  return (
    <>
      <header className="landingNav publicNav">
        <Brand />
        <button
          type="button"
          className="publicMobileMenu"
          aria-label={labels.openNavigation}
          aria-expanded={mobileOpen}
          aria-controls="public-navigation"
          onClick={() => setMobileOpen(!mobileOpen)}
        >
          <ProductIcon name={mobileOpen ? "close" : "menu"} />
        </button>
        <nav
          ref={navRef}
          id="public-navigation"
          className="publicNavLinks"
          data-expanded={mobileOpen}
          aria-label={labels.mainNavigation}
        >
          <div className="publicNavMenu" data-open={openMenu === "mcp"}>
            <button
              type="button"
              className="publicNavMenuTrigger"
              aria-expanded={openMenu === "mcp"}
              aria-controls="public-nav-product"
              onClick={() => setOpenMenu(openMenu === "mcp" ? null : "mcp")}
            >
              {labels.product} {arrow}
            </button>
            <div id="public-nav-product" className="publicNavDropdown productDropdown">
              <section className="publicNavGroup">
                <span className="publicNavGroupLabel">{labels.productGroup}</span>
                <a className="publicProductEntry" href={navHref("/arc")}>
                  <span className="publicProductIcon publicProductLogo">
                    <img src="/remote-arc.svg" alt="" />
                  </span>
                  <span className="publicProductCopy">
                    <strong>
                      Arc <em>{arcAvailable ? labels.live : labels.comingSoon}</em>
                    </strong>
                    <small>{labels.arcDescription}</small>
                  </span>
                  <ProductIcon name="arrowUpRight" size={15} />
                </a>
                <a className="publicProductEntry" href={navHref("/connect-ai")}>
                  <span className="publicProductIcon publicProductLogo">
                    <img src="/connect-logo.svg" alt="" />
                  </span>
                  <span className="publicProductCopy">
                    <strong>
                      Connect <em>{labels.live}</em>
                    </strong>
                    <small>{labels.connectDescription}</small>
                  </span>
                  <ProductIcon name="arrowUpRight" size={15} />
                </a>
                <a className="publicProductEntry" href={navHref("/chrome-extension")}>
                  <span className="publicProductIcon publicProductLogo publicProductLogoBrand">
                    <img src="/platform-brands/browser.svg" alt="" />
                  </span>
                  <span className="publicProductCopy">
                    <strong>{labels.browserProduct}</strong>
                    <small>{labels.browserProductDescription}</small>
                  </span>
                  <ProductIcon name="arrowUpRight" size={15} />
                </a>
              </section>
              <div className="publicNavProductFoot">
                <a href={navHref("/install/chatgpt")}>
                  <img className="monoLogo" src="/ai-openai.svg" alt="" />
                  ChatGPT
                </a>
                <a href={navHref("/install/claude")}>
                  <img src="/ai-claude.svg" alt="" />
                  Claude
                </a>
                <a href={navHref("/install/cursor")}>
                  <img className="monoLogo" src="/ai-cursor.svg" alt="" />
                  Cursor
                </a>
                <a href={navHref("/remote-mcp")}>
                  <ProductIcon name="link" size={15} />
                  Remote MCP
                  <ProductIcon name="arrowUpRight" size={12} />
                </a>
              </div>
            </div>
          </div>
          <a href={navHref("/use-cases")}>{labels.useCases}</a>
          <a href={navHref("/integrations")}>{labels.apps}</a>
          <a href={navHref("/pricing")}>{labels.pricing}</a>
          <div className="publicNavMenu" data-open={openMenu === "resources"}>
            <button
              type="button"
              className="publicNavMenuTrigger"
              aria-expanded={openMenu === "resources"}
              aria-controls="public-nav-resources"
              onClick={() => setOpenMenu(openMenu === "resources" ? null : "resources")}
            >
              {labels.resources} {arrow}
            </button>
            <div id="public-nav-resources" className="publicNavDropdown resourceDropdown">
              <div className="publicNavDropdownColumns">
                <section className="publicNavGroup">
                  <span className="publicNavGroupLabel">{labels.startGroup}</span>
                  <a href={navHref("/docs")}>
                    <strong>{labels.documentation}</strong>
                    <small>{labels.documentationDescription}</small>
                  </a>
                  <a href={navHref("/docs/tools")}>
                    <strong>{labels.allTools}</strong>
                    <small>{labels.toolsDescription}</small>
                  </a>
                  <a href={navHref("/downloads")}>
                    <strong>{labels.downloads}</strong>
                    <small>Windows · macOS · Linux</small>
                  </a>
                  <a href={navHref("/demo")}>
                    <strong>{labels.productFilm}</strong>
                    <small>{labels.productFilmDescription}</small>
                  </a>
                  <a href={navHref("/chrome-extension")}>
                    <strong>{labels.browserExtension}</strong>
                    <small>{labels.browserDescription}</small>
                  </a>
                  <a href={navHref("/security-model")}>
                    <strong>{labels.security}</strong>
                    <small>{labels.securityDescription}</small>
                  </a>
                </section>
                <section className="publicNavGroup">
                  <span className="publicNavGroupLabel">{labels.updatesGroup}</span>
                  <a href={navHref("/blogs")}>
                    <strong>{labels.blog}</strong>
                    <small>{labels.blogDescription}</small>
                  </a>
                  <a href={navHref("/releases")}>
                    <strong>{labels.changelog}</strong>
                    <small>{labels.changelogDescription}</small>
                  </a>
                  <a href={navHref("/roadmap")}>
                    <strong>{labels.roadmap}</strong>
                    <small>{labels.roadmapDescription}</small>
                  </a>
                </section>
              </div>
            </div>
          </div>
        </nav>
        <div className="publicNavActions">
          <LanguageSwitcher compact syncUrl dropdown />
          <ThemeSwitcher compact />
          {user ? (
            <a className="navDashboard" href={dashboardHref("/dashboard/connect/overview")}>
              {labels.dashboard} <span>↗</span>
            </a>
          ) : (
            <a
              className="navLogin installNavCta"
              href={APP_ORIGIN + "/dashboard/connect/overview"}
              title={labels.signInDescription}
            >
              {labels.getStarted} <ProductIcon name="arrowUpRight" size={14} />
            </a>
          )}
        </div>
      </header>
    </>
  );
}
export function CopyButton({ value, label }: { value: string; label?: string }) {
  const { tr } = useI18n();
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const resetTimer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
    },
    [],
  );
  async function copy() {
    try {
      if (!navigator.clipboard) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(value);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
    if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
    resetTimer.current = window.setTimeout(() => setCopyState("idle"), 2400);
  }
  return (
    <button
      type="button"
      className="ghostButton"
      onClick={() => void copy()}
      title={
        copyState === "failed"
          ? tr("components.publicLayout.clipboardAccessWasBlockedSelectAnd")
          : undefined
      }
    >
      {copyState === "copied"
        ? tr("components.publicLayout.copied")
        : copyState === "failed"
          ? tr("components.publicLayout.copyManually")
          : label || tr("components.publicLayout.copy")}
    </button>
  );
}
export function CenteredCard({
  title,
  body,
  children,
}: {
  title: string;
  body: string;
  children?: React.ReactNode;
}) {
  return (
    <main className="centerShell">
      <Brand compact />
      <section className="centerCard">
        <h1>{title}</h1>
        <p>{body}</p>
        {children}
      </section>
    </main>
  );
}
export function PublicLayout({
  children,
  user,
}: {
  children: React.ReactNode;
  user?: User | null;
}) {
  return (
    <main className="landing publicPage">
      <PublicHeader user={user} />
      {children}
      <PublicFooter brand={<Brand compact />} />
    </main>
  );
}
export const aiClients = [
  { name: "ChatGPT", slug: "chatgpt", icon: "/ai-openai.svg", tone: "mono" },
  { name: "Claude", slug: "claude", icon: "/ai-claude.svg", tone: "color" },
  { name: "Gemini", slug: "gemini", icon: "/ai-gemini-four-color-2025.svg", tone: "color" },
  { name: "Cursor", slug: "cursor", icon: "/ai-cursor.svg", tone: "color" },
] as const;
// The homepage topology uses the same supported-client list as the install guides.
export const topologyAiClients = aiClients;

export function HelpTip({ label, text }: { label: string; text: string }) {
  return (
    <span className="helpTipWrap">
      <button
        type="button"
        className="helpTip"
        aria-label={label}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          event.currentTarget.focus();
        }}
      >
        ?
      </button>
      <span className="helpTipBubble" role="tooltip">
        {text}
      </span>
    </span>
  );
}
