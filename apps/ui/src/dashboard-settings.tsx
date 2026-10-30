import {ArcBillingPanel,ArcAccountPlan} from './arc-billing-panel.js';
import {ArcMemoryPanel} from './arc-memory-panel.js';
import { Fragment, lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import {useTheme} from "./theme.js";
import { useI18n } from "./i18n.js";
import { OrganizationSettings } from "./organization-settings.js";
import {ProductInstall} from './product-pwa.js';
import "./dashboard-settings.css";
const TeammateSettings=lazy(()=>import('./arc-teams-page.js').then(module=>({default:module.ArcTeamsPage})));


type Section = "account" | "appearance" | "workspaces" | "connections" | "billing" | "memory" | "teammates";
type Destination = "devices" | "connect" | "security" | "apps";
type Props = {
  accountId?: string;
  currentName?: string | null;
  currentEmail: string;
  locale: "en" | "zh";
  setLocale: (value: "en" | "zh") => void;
  hasPlus: boolean;
  usage: { used?: number; unlimited?: boolean } | null | undefined;
  usageLimitLabel: string;
  mcpEndpoint: string;
  marketingOrigin: string;
  onSignOut: () => void | Promise<void>;
  onNavigate: (destination: Destination) => void;
};

function Icon({ name, size = 18 }: { name: "user" | "appearance" | "team" | "link" | "billing" | "shield" | "device" | "apps" | "copy" | "check" | "arrow"; size?: number }) {
  const paths: Record<typeof name, ReactNode> = {
    appearance: <><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8m-4-4v4M12 4v13"/></>,
    user: <><circle cx="12" cy="8" r="3.3" /><path d="M5.5 20v-1.5a6.5 6.5 0 0 1 13 0V20" /></>,
    team: <><circle cx="9" cy="8" r="3" /><path d="M3 20v-1.5a6 6 0 0 1 12 0V20M17 5.3a3 3 0 0 1 0 5.5M17.5 14a5.6 5.6 0 0 1 3.5 5.2" /></>,
    link: <><path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.2 1.2M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.2-1.2" /></>,
    billing: <><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="M3 10h18M7 15h4" /></>,
    shield: <><path d="M12 2.5 20 6v5.5c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6l8-3.5Z" /><path d="m9 12 2 2 4-4" /></>,
    device: <><rect x="3.5" y="4" width="17" height="12.5" rx="2" /><path d="M8 20h8M12 16.5V20" /></>,
    apps: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
    copy: <><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></>,
    check: <path d="m4 12 5 5L20 6" />,
    arrow: <path d="M6 12h12m-5-5 5 5-5 5" />,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

export function DashboardSettings({
  accountId, currentName, currentEmail, locale, setLocale, hasPlus, usage,
  usageLimitLabel, mcpEndpoint, marketingOrigin, onSignOut, onNavigate,
}: Props) {
  const { tr } = useI18n();
  const initialSection = () => {
    const value = new URLSearchParams(location.search).get("section");
    return ["account","appearance","workspaces","connections","billing","memory","teammates"].includes(value || "") ? value as Section : "account";
  };
  const [section, setSection] = useState<Section>(initialSection);
  const {theme,setTheme} = useTheme();
  useEffect(() => { const restore=()=>setSection(initialSection());window.addEventListener("popstate",restore);return()=>window.removeEventListener("popstate",restore); },[]);
  function selectSection(next:Section){
    setSection(next);setCopyStatus("idle");
    const url=new URL(location.href);url.searchParams.set("section",next);history.pushState({},"",url);
  }
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">("idle");
  const displayName = currentName?.trim() || currentEmail.split("@")[0] || tr("Account", "账号");
  const nav: { id: Section; icon: "user" | "appearance" | "team" | "link" | "billing"; title: string }[] = [
    { id: "account", icon: "user", title: tr("Profile", "个人资料") },
    { id: "appearance", icon: "appearance", title: tr("Appearance", "外观与语言") },
    { id: "memory", icon: "user", title: tr("Memory", "记忆") },
    ...(accountId?[{id:"teammates" as const,icon:"team" as const,title:tr("Agents","智能体")}]:[]),
    { id: "workspaces", icon: "team", title: tr("Workspaces", "工作空间") },
    { id: "connections", icon: "link", title: tr("Connections & security", "连接与安全") },
    { id: "billing", icon: "billing", title: tr("Plan & usage", "套餐与用量") },
  ];
  const titles = {
    teammates:{eyebrow:tr("OPTIONAL SETTINGS","可选设置"),title:tr("Agent profiles","智能体资料"),detail:tr("Arc Chat is where you organize work. Manage saved identities and access here.","工作统一在 Arc Chat 组织，这里只维护常驻资料和访问设置。")},
    account: { eyebrow: tr("PERSONAL SETTINGS", "个人设置"), title: tr("Your profile", "个人资料"), detail: tr("The account you use across Arc and Connect.", "在 Arc 与 Connect 中使用同一个账号。") },
    appearance: {eyebrow:tr("PERSONAL SETTINGS","个人设置"),title:tr("Make it yours","调整为你喜欢的样子"),detail:tr("Choose how your workspace looks and the language you use.","选择工作空间的外观与使用语言。")},
    memory: {eyebrow:tr("PERSONAL CONTEXT","个人背景"),title:tr("Memory","记忆"),detail:tr("Useful context that follows you across conversations and models.","让有用的背景信息随你跨越对话与模型。")},
    workspaces: { eyebrow: tr("COLLABORATION", "协作空间"), title: tr("Workspaces", "工作空间"), detail: tr("Keep personal access private and organize your team.", "让个人设备保持私有，同时与团队安全协作。") },
    connections: { eyebrow: tr("ACCESS CONTROL", "访问控制"), title: tr("Connections & security", "连接与安全"), detail: tr("Manage the devices, apps and permissions available to your AI.", "管理 AI 可访问的设备、应用和权限边界。") },
    billing: { eyebrow: tr("SUBSCRIPTION", "订阅方案"), title: tr("Plan & usage", "套餐与用量"), detail: tr("Understand your plan and available capacity.", "查看当前套餐与可用调用额度。") },
  };
  const active = titles[section];

  async function copyEndpoint() {
    try {
      await navigator.clipboard.writeText(mcpEndpoint);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("error");
    }
  }

  return <div className="raSettings">
    <aside className="raSettingsAside" aria-label={tr("Settings navigation", "设置导航")}>
      <div className="raSettingsAsideLabel">{tr("PERSONAL", "个人")}</div>
      <nav className="raSettingsNav">
        {nav.map((item,index) => <Fragment key={item.id}>{index === 2 && <div className="raSettingsAsideLabel raSettingsGroupLabel">{tr("WORKSPACE","工作空间")}</div>}<button type="button" key={item.id}
          className={"raSettingsNavItem" + (section === item.id ? " isActive" : "")}
          aria-current={section === item.id ? "page" : undefined}
          onClick={() => selectSection(item.id)}>
          <Icon name={item.icon} /><span>{item.title}</span>
        </button></Fragment>)}
      </nav>
      <div className="raSettingsAsideFoot"><Icon name="shield" size={17} />
        <span>{tr("Your personal devices and credentials stay private.", "你的个人设备与凭证始终保持私有。")}</span>
      </div>
    </aside>

    <div className="raSettingsContent" role="region" aria-label={active.title}>
      <header className="raSettingsHeading">
        <span className="raSettingsEyebrow">{active.eyebrow}</span>
        <h2>{active.title}</h2>
        <p>{active.detail}</p>
      </header>

      {section === "teammates"&&accountId&&<Suspense fallback={<p>{tr("Loading agents…","正在读取智能体…")}</p>}><TeammateSettings accountId={accountId} tr={tr}/></Suspense>}
      {section === "account" && <div className="raSettingsSections">
        <ArcAccountPlan onManage={()=>selectSection('billing')}/>
        <section className="raSettingsSurface raSettingsIdentity">
          <div className="raSettingsIdentityAvatar" aria-hidden="true">{displayName.slice(0, 1).toUpperCase()}</div>
          <div className="raSettingsIdentityText">
            <span className="raSettingsFieldLabel">{tr("SIGNED IN AS", "当前登录账号")}</span>
            <h3>{displayName}</h3><p>{currentEmail}</p>
          </div>
          <span className="raSettingsQuietPill">{tr("Personal account", "个人账号")}</span>
        </section>
        <section className="raSettingsSurface">
          <div className="raSettingsRow raSettingsRowLast">
            <div className="raSettingsRowInfo"><h4>{tr("Session", "登录会话")}</h4>
              <p>{tr("Sign out of this browser when you're finished.", "在共享设备或使用结束后退出当前登录。")}</p></div>
            <button className="raSettingsButton" type="button" onClick={() => void onSignOut()}>{tr("Sign out", "退出登录")}</button>
          </div>
        </section>
        <section className="raSettingsSurface"><div className="raSettingsRow raSettingsRowLast"><div className="raSettingsRowInfo"><h4>{tr('Remote Arc on your device','设备上的 Remote Arc')}</h4><p>{tr('Keep your workspace a click away with the installable app.','安装为独立应用，随时打开工作空间。')}</p></div><ProductInstall/></div></section>
      </div>}

      {section === "appearance" && <div className="raSettingsSections">
        <section className="raSettingsSurface">
          <div className="raSettingsSurfaceHeader"><div><h3>{tr("Theme","显示主题")}</h3><p>{tr("A comfortable workspace, day or night.","白天与夜晚，都舒适清晰。")}</p></div></div>
          <div className="raThemeChoices" role="group" aria-label={tr("Workspace theme","工作空间主题")}>
            {(["light","dark","system"] as const).map(value=><button type="button" key={value} aria-pressed={theme===value} onClick={()=>setTheme(value)}>
              <span className={"raThemePreview "+value} aria-hidden="true"><i className="raThemeSidebar"><b/><b/><b/></i><i className="raThemeContent"><b/><b/><b/></i></span>
              <span>{value==="light"?tr("Light","浅色"):value==="dark"?tr("Dark","深色"):tr("System","跟随系统")}<i>{theme===value?"✓":""}</i></span>
            </button>)}
          </div>
        </section>
        <section className="raSettingsSurface">
          <div className="raSettingsRow raSettingsRowLast"><div className="raSettingsRowInfo"><h4>{tr("Language","语言")}</h4><p>{tr("Choose the language for your workspace.","选择工作空间的显示语言。")}</p></div>
            <div className="raSettingsRowControl"><div className="languageSetting" role="group" aria-label={tr("Dashboard language","控制台语言")}>
              <button type="button" aria-pressed={locale==="en"} className={locale==="en"?"active":""} onClick={()=>setLocale("en")}>English</button>
              <button type="button" aria-pressed={locale==="zh"} className={locale==="zh"?"active":""} onClick={()=>setLocale("zh")}>中文</button>
            </div></div>
          </div>
        </section>
        <p className="raSettingsFootnote">{tr("Preferences are saved on this device and apply to both Arc and Connect.","偏好保存在当前设备，并同时应用于 Arc 和 Connect。")}</p>
      </div>}

      {section === "workspaces" && <div className="raSettingsSections">
        <OrganizationSettings currentEmail={currentEmail} />
      </div>}

      {section === "connections" && <div className="raSettingsSections">
        <section className="raSettingsSurface">
          <div className="raSettingsSurfaceHeader"><div><h3>{tr("Remote MCP endpoint", "远程 MCP 地址")}</h3>
            <p>{tr("Add this URL in a supported AI client to connect Remote Arc.", "在支持 MCP 的 AI 客户端中添加此地址即可连接 Remote Arc。")}</p></div></div>
          <div className="raSettingsEndpoint">
            <code>{mcpEndpoint}</code>
            <button type="button" className="raSettingsButton raSettingsCopy" onClick={() => void copyEndpoint()}>
              <Icon name={copyStatus === "copied" ? "check" : "copy"} size={16} />
              {copyStatus === "copied" ? tr("Copied", "已复制") : tr("Copy URL", "复制地址")}
            </button>
          </div>
          {copyStatus === "error" && <p className="raSettingsInlineError" role="alert">{tr("Couldn't copy automatically. Select the address above to copy it.", "复制失败，请选中上方地址手动复制。")}</p>}
        </section>
        <section className="raSettingsSurface">
          <div className="raSettingsSurfaceHeader"><div><h3>{tr("Access management", "访问权限管理")}</h3>
            <p>{tr("Manage the accounts and computers your AI can access.", "管理 AI 可访问的账号与电脑。")}</p></div></div>
          {([
            ["devices", "device", tr("Devices & tools", "设备与工具"), tr("Manage paired computers and tool permissions", "管理已配对电脑和工具权限")],
            ["apps", "apps", tr("Connected apps", "已连接应用"), tr("Review integrations and their available actions", "查看应用集成及其操作能力")],
            ["security", "shield", tr("Security & activity", "安全与活动记录"), tr("Review grants, access controls and audit events", "检查授权、访问控制和审计记录")],
            ["connect", "link", tr("Connection setup", "连接配置"), tr("Get started with ChatGPT, Claude and more", "查看 ChatGPT、Claude 等客户端连接指南")],
          ] as const).map(([destination, icon, title, description]) => <button className="raSettingsAction" key={destination} type="button" onClick={() => onNavigate(destination)}>
            <span className="raSettingsActionIcon"><Icon name={icon} /></span>
            <span><strong>{title}</strong><small>{description}</small></span>
            <Icon name="arrow" size={18} />
          </button>)}
        </section>
      </div>}

      {section === "billing" && <ArcBillingPanel />}
      {section === "memory" && <ArcMemoryPanel />}
    </div>
  </div>;
}
