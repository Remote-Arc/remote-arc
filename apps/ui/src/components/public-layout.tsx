import { ProductIcon } from "./product-icon.js";
import { usePlatformCatalog } from '../lib/use-platform-catalog.js';
import React, { useEffect, useRef, useState } from "react";
import { LanguageSwitcher, useI18n } from "../app/i18n.js";
import { isWebsite, localizedWebsiteHref } from "../lib/marketing-paths.js";
import { BrandWordmark } from './brand-wordmark.js';
import { useTheme } from "../app/theme.js";
import { APP_ORIGIN, MARKETING_ORIGIN, dashboardHref } from "../config/app-config.js";
import { type User } from "../types/app-types.js";

export function LogoMark({ className = "" }: { className?: string }) {
  return (
    <img
      className={className}
      src="/remote-arc.svg"
      alt="Remote Arc"
      width="64"
      height="64"
    />
  );
}
export function Brand({ compact = false }: { compact?: boolean }) {
  const { locale } = useI18n();
  return (
    <a href={MARKETING_ORIGIN + (isWebsite() && locale === "zh" ? "/zh" : "")} title="Remote Arc website" aria-label="Remote Arc" className={"brand brandHasWordmark" + (compact ? " compactBrand" : "")}>
      <span className="brandSymbol" aria-hidden="true"><LogoMark className="brandLogo" /></span>
      <BrandWordmark/>
    </a>
  );
}
export function ThemeSwitcher({ compact = false }: { compact?: boolean }) {
  const { tr } = useI18n();
  const { theme, resolvedTheme, setTheme } = useTheme();

  if (!compact) {
    return (
      <div className="languageSetting themeSetting">
        <button className={theme === "light" ? "active" : ""} onClick={() => setTheme("light")}>{tr("Light", "浅色")}</button>
        <button className={theme === "dark" ? "active" : ""} onClick={() => setTheme("dark")}>{tr("Dark", "深色")}</button>
        <button className={theme === "system" ? "active" : ""} onClick={() => setTheme("system")}>{tr("System", "跟随系统")}</button>
      </div>
    );
  }

  const nextTheme = resolvedTheme === "dark" ? "light" : "dark";
  return (
    <button
      className="themeSwitch compact"
      type="button"
      onClick={() => setTheme(nextTheme)}
      aria-label={resolvedTheme === "dark" ? tr("Switch to light mode", "切换到浅色模式") : tr("Switch to dark mode", "切换到深色模式")}
      title={resolvedTheme === "dark" ? tr("Light mode", "浅色模式") : tr("Dark mode", "深色模式")}
    >
      <span aria-hidden="true">{resolvedTheme === "dark" ? "☼" : "◐"}</span>
    </button>
  );
}
function PublicHeader({ user }: { user?: User | null }) {
  const { tr, locale } = useI18n();
  const arcAvailable=usePlatformCatalog()?.arcAvailable===true;
  const [openMenu, setOpenMenu] = useState<"mcp" | "resources" | null>(null);
  const [mobileOpen,setMobileOpen] = useState(false);
  const navRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const onOutsideClick = (event: PointerEvent) => {
      if (!navRef.current?.contains(event.target as Node)) setOpenMenu(null);
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setOpenMenu(null); setMobileOpen(false); }
    };
    document.addEventListener("pointerdown", onOutsideClick);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("pointerdown", onOutsideClick);
      document.removeEventListener("keydown", onEscape);
    };
  }, []);
  const arrow = <svg className="publicNavChevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>;
  const navHref = (path: string) => isWebsite() ? localizedWebsiteHref(path, locale) : path;
  // From the website, sign-in visits the product preview. On that preview,
  // the header sign-in control opens authentication rather than reloading itself.
  const signInHref = location.hostname === "agent.remotearc.app"
    ? APP_ORIGIN + "/auth/login?return_to=" + encodeURIComponent("/overview")
    : APP_ORIGIN + "/overview";

  return (
    <>
      <header className="landingNav publicNav">
        <Brand />
        <button type="button" className="publicMobileMenu" aria-label={tr('Open navigation','打开导航')} aria-expanded={mobileOpen} aria-controls="public-navigation" onClick={()=>setMobileOpen(!mobileOpen)}><ProductIcon name={mobileOpen?'close':'menu'}/></button>
        <nav ref={navRef} id="public-navigation" className="publicNavLinks" data-expanded={mobileOpen} aria-label={tr('Main navigation','主导航')}>
          <div className="publicNavMenu" data-open={openMenu==='mcp'}>
            <button type="button" className="publicNavMenuTrigger" aria-expanded={openMenu==='mcp'} aria-controls="public-nav-product" onClick={()=>setOpenMenu(openMenu==='mcp'?null:'mcp')}>{tr('Product','产品')} {arrow}</button>
            <div id="public-nav-product" className="publicNavDropdown productDropdown">
              <section className="publicNavGroup">
                <span className="publicNavGroupLabel">{tr('ONE PLATFORM. YOUR WAY TO WORK.','一个平台，选择你的工作方式。')}</span>
                <a className="publicProductEntry" href={navHref('/arc')}><span className="publicProductIcon publicProductLogo"><img src="/remote-arc.svg" alt=""/></span><span className="publicProductCopy"><strong>Arc <em>{arcAvailable?tr('Live','已上线'):tr('Coming soon','即将上线')}</em></strong><small>{tr('Your personal agent, working with your apps and computers','你的个人智能体，协同应用与电脑工作')}</small></span><ProductIcon name="arrowUpRight" size={15}/></a>
                <a className="publicProductEntry" href={navHref('/connect-ai')}><span className="publicProductIcon publicProductLogo"><img src="/connect-logo.svg" alt=""/></span><span className="publicProductCopy"><strong>Connect <em>{tr('Live','已上线')}</em></strong><small>{tr('Your tools, in the AI you already use','把你的工具，带入你常用的 AI')}</small></span><ProductIcon name="arrowUpRight" size={15}/></a>
              </section>
              <div className="publicNavProductFoot"><a href={navHref('/install/chatgpt')}><img className="monoLogo" src="/ai-openai.svg" alt=""/>ChatGPT</a><a href={navHref('/install/claude')}><img src="/ai-claude.svg" alt=""/>Claude</a><a href={navHref('/install/cursor')}><img className="monoLogo" src="/ai-cursor.svg" alt=""/>Cursor</a><a href={navHref('/remote-mcp')}><ProductIcon name="link" size={15}/>Remote MCP<ProductIcon name="arrowUpRight" size={12}/></a></div>
            </div>
          </div>
          <a href={navHref('/use-cases')}>{tr('Use cases','使用场景')}</a>
          <a href={navHref('/integrations')}>{tr('Apps','应用')}</a>
          <a href={navHref('/pricing')}>{tr('Pricing','价格')}</a>
          <div className="publicNavMenu" data-open={openMenu==='resources'}>
            <button type="button" className="publicNavMenuTrigger" aria-expanded={openMenu==='resources'} aria-controls="public-nav-resources" onClick={()=>setOpenMenu(openMenu==='resources'?null:'resources')}>{tr('Resources','资源')} {arrow}</button>
            <div id="public-nav-resources" className="publicNavDropdown resourceDropdown"><div className="publicNavDropdownColumns">
              <section className="publicNavGroup"><span className="publicNavGroupLabel">{tr('GET STARTED','开始使用')}</span><a href={navHref('/docs')}><strong>{tr('Documentation','文档')}</strong><small>{tr('Connections, tools and product guides','连接、工具与产品指南')}</small></a><a href={navHref('/docs/tools')}><strong>{tr('All tools','全部工具')}</strong><small>{tr('Search tools, actions and parameters','查找工具、操作与参数')}</small></a><a href={navHref('/downloads')}><strong>{tr('Downloads','下载')}</strong><small>Windows · macOS · Linux</small></a><a href={navHref('/chrome-extension')}><strong>{tr('Browser extension','浏览器扩展')}</strong><small>{tr('Share selected browser context','共享选定的浏览器上下文')}</small></a><a href={navHref('/security-model')}><strong>{tr('Security','安全')}</strong><small>{tr('Your devices, your rules','自己的设备，自己的规则')}</small></a></section>
              <section className="publicNavGroup"><span className="publicNavGroupLabel">{tr('FOLLOW ALONG','关注进展')}</span><a href={navHref('/blogs')}><strong>{tr('Blog','博客')}</strong><small>{tr('Ideas from the team','团队思考与分享')}</small></a><a href={navHref('/releases')}><strong>{tr('Changelog','更新日志')}</strong><small>{tr('What shipped recently','近期产品更新')}</small></a><a href={navHref('/roadmap')}><strong>{tr('Roadmap','路线图')}</strong><small>{tr('What we are building next','我们正在打造什么')}</small></a></section>
            </div></div>
          </div>
        </nav>
        <div className="publicNavActions">
          <LanguageSwitcher compact syncUrl dropdown />
          <ThemeSwitcher compact />
          {user ? (
            <a className="navDashboard" href={dashboardHref("/dashboard/connect/overview")}>{tr("Dashboard", "控制台")} <span>↗</span></a>
          ) : (
            <a className="navLogin installNavCta" href={APP_ORIGIN+"/dashboard/connect/overview"} title={tr("Sign in with Google or email", "使用 Google 或邮箱登录")}>
              {tr("Get started", "开始使用")} <ProductIcon name="arrowUpRight" size={14}/>
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
  useEffect(() => () => { if (resetTimer.current !== null) window.clearTimeout(resetTimer.current); }, []);
  async function copy() {
    try {
      if (!navigator.clipboard) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(value);
      setCopyState("copied");
    } catch { setCopyState("failed"); }
    if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
    resetTimer.current = window.setTimeout(() => setCopyState("idle"), 2400);
  }
  return (
    <button type="button" className="ghostButton" onClick={() => void copy()} title={copyState === "failed" ? tr("Clipboard access was blocked. Select and copy the text manually.", "剪贴板访问被阻止，请选中文字手动复制。") : undefined}>
      {copyState === "copied" ? tr("Copied", "已复制") : copyState === "failed" ? tr("Copy manually", "手动复制") : label || tr("Copy", "复制")}
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
  const { tr } = useI18n();
  return (
    <main className="landing publicPage">
      <PublicHeader user={user} />
      {children}
      <footer className="publicFooter">
        <Brand compact />
        <nav className="publicFooterLinks" aria-label={tr("Remote Arc guides", "Remote Arc 使用指南")}>
          <a href="/remote-mcp">{tr("Remote MCP guide", "Remote MCP 指南")}</a>
          <a href="/chatgpt-computer-access">ChatGPT</a>
          <a href="/claude-computer-access">Claude</a>
          <a href="/install/gemini">Gemini</a>
          <a href="/docs/mcp">{tr("MCP Docs", "MCP 文档")}</a>
          <a href="/security-model">{tr("Security", "安全")}</a>
          <a href={tr("/arc", "/zh/arc")}>{tr("Arc", "Arc 助手")}</a>
          <a href={tr("/roadmap", "/zh/roadmap")}>{tr("Roadmap", "路线图")}</a>
          <a href={tr("/feedback","/zh/feedback")}>{tr("Feedback", "用户反馈")}</a>
          <a href={tr("/support", "/zh/support")}>{tr("Support", "支持")}</a>
          <a href={tr("/privacy", "/zh/privacy")}>{tr("Privacy", "隐私")}</a>
          <a href={tr("/terms", "/zh/terms")}>{tr("Terms", "条款")}</a>
        </nav>
        <div className="publicFooterMeta">
          <span>© 2026 Remote Arc · {tr("Proprietary", "专有软件")}</span>
          <a href="https://github.com/Remote-Arc/remote-arc">GitHub</a>
        </div>
      </footer>
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
function AiClientBadge({ name, icon, note }: { name: string; icon: string; note: string }) {
  return (
    <div className="aiClientBadge">
      <img src={icon} alt="" />
      <span><strong>{name}</strong><small>{note}</small></span>
    </div>
  );
}
export function HelpTip({
  label,
  text,
}: {
  label: string;
  text: string;
}) {
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
      <span className="helpTipBubble" role="tooltip">{text}</span>
    </span>
  );
}
