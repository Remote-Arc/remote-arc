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
import { INSTALL_METHODS } from "./install-commands.js";
import { useAgentDownload } from "../hooks/marketing/use-agent-download.js";
import { AGENT_PLATFORM_NAMES, agentDownloadPath } from "../lib/agent-download.js";
import { aiClients } from "../lib/ai-clients.js";
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
  const agentTarget = useAgentDownload();
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
  const loginHref = APP_ORIGIN + "/dashboard/connect/overview";
  // Each menu ends on the agent card: this computer's build, detected, one click away.
  const agentLabel = agentTarget
    ? labels.downloadForPlatform.replace("{platform}", AGENT_PLATFORM_NAMES[agentTarget.platform])
    : labels.downloadAgent;
  const megaAgent = (
    <aside className="publicMegaAgent">
      <span className="publicMegaAgentMark" aria-hidden="true">
        <img src="/remote-arc.svg" alt="" width={28} height={28} />
      </span>
      <strong>{labels.agentCardTitle}</strong>
      <p>{labels.agentCardBody}</p>
      <code>{INSTALL_METHODS[0].command}</code>
      <a
        className="publicMegaAgentButton"
        href={agentTarget ? agentDownloadPath(agentTarget) : navHref("/downloads")}
      >
        {agentLabel} <ProductIcon name="download" size={14} />
      </a>
      <a className="publicMegaAgentAll" href={navHref("/downloads")}>
        {labels.allPlatforms} →
      </a>
    </aside>
  );
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
            <div id="public-nav-product" className="publicNavDropdown publicMega">
              <div className="publicMegaColumns">
                <section>
                  <span className="publicMegaLabel">{labels.productsGroup}</span>
                  <a href={navHref("/arc")}>
                    Arc <em>{arcAvailable ? labels.live : labels.comingSoon}</em>
                  </a>
                  <a href={navHref("/connect-ai")}>Connect</a>
                  <a href={navHref("/chrome-extension")}>{labels.browserExtension}</a>
                  <a href={navHref("/computer-use")}>{labels.computerUse}</a>
                  <a href={navHref("/agent-orchestration")}>{labels.agentOrchestration}</a>
                </section>
                <section>
                  <span className="publicMegaLabel">{labels.worksWithGroup}</span>
                  {aiClients.map((client) => (
                    <a key={client.slug} href={navHref("/install/" + client.slug)}>
                      {client.name}
                    </a>
                  ))}
                  <a href={navHref("/remote-mcp")}>Remote MCP</a>
                </section>
                <section>
                  <span className="publicMegaLabel">{labels.exploreGroup}</span>
                  <a href={navHref("/use-cases")}>{labels.useCases}</a>
                  <a href={navHref("/integrations")}>{labels.apps}</a>
                  <a href={navHref("/pricing")}>{labels.pricing}</a>
                  <a href={navHref("/security-model")}>{labels.security}</a>
                </section>
                {megaAgent}
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
            <div id="public-nav-resources" className="publicNavDropdown publicMega">
              <div className="publicMegaColumns">
                <section>
                  <span className="publicMegaLabel">{labels.learnGroup}</span>
                  <a href={navHref("/docs")}>{labels.documentation}</a>
                  <a href={navHref("/docs/tools")}>{labels.allTools}</a>
                  <a href={navHref("/downloads")}>{labels.downloads}</a>
                  <a href={navHref("/demo")}>{labels.productFilm}</a>
                </section>
                <section>
                  <span className="publicMegaLabel">{labels.updatesGroup}</span>
                  <a href={navHref("/blogs")}>{labels.blog}</a>
                  <a href={navHref("/releases")}>{labels.changelog}</a>
                  <a href={navHref("/roadmap")}>{labels.roadmap}</a>
                </section>
                <section>
                  <span className="publicMegaLabel">{labels.footerCompany}</span>
                  <a href={navHref("/about")}>{labels.aboutUs}</a>
                  <a href={navHref("/careers")}>{labels.careers}</a>
                </section>
                {megaAgent}
              </div>
            </div>
          </div>
        </nav>
        <div className="publicNavActions">
          <LanguageSwitcher compact syncUrl dropdown />
          {user ? (
            <a className="navDashboard" href={dashboardHref("/dashboard/connect/overview")}>
              {labels.dashboard} <span>↗</span>
            </a>
          ) : (
            <>
              <a className="publicNavSignIn" href={loginHref} title={labels.signInDescription}>
                {labels.logIn}
              </a>
              <a
                className="navLogin installNavCta"
                href={loginHref}
                title={labels.signInDescription}
              >
                {labels.getStarted} <ProductIcon name="arrowUpRight" size={14} />
              </a>
            </>
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
export { aiClients, topologyAiClients } from "../lib/ai-clients.js";

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
